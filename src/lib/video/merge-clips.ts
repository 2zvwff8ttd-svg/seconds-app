import { getVideoExtension } from "@/lib/video/media";
import {
  getFfmpeg,
  safeDeleteFile,
  writeFileFromBlob,
} from "@/lib/video/ffmpeg-client";
import {
  assertClipsAvDurationOk,
  assertMergedAvDurationOk,
} from "@/lib/video/av-duration-guard";
import {
  iosMp4MergeNormalizeFilterArgs,
  iosMp4OutputEncodeArgs,
  iosMp4ScaleFilterArgs,
  type IosMp4EncodePreset,
} from "@/lib/video/ios-mp4-encode";
import {
  probeClipForPostUpload,
  probeClipsForMergeEncode,
  type PostEncodePath,
} from "@/lib/video/video-post-probe";

/** concat 時のメモリ超過を防ぐ上限 */
export const MERGE_MAX_CLIP_COUNT = 10;
export const MERGE_MAX_TOTAL_SECONDS = 90;
/** WASM ヒープ向けの保守的合計サイズ */
export const MERGE_MAX_TOTAL_BYTES = 56 * 1024 * 1024;
export const MERGE_MAX_SINGLE_CLIP_BYTES = 28 * 1024 * 1024;

export type TranscodeClipResult = {
  file: File;
  encodePath: PostEncodePath;
  probeReasons: string[];
};

type ClipContainer = "mp4" | "webm";

function detectContainer(file: File): ClipContainer | null {
  const ext = getVideoExtension(file);
  if (ext === "mp4" || ext === "mov") return "mp4";
  if (ext === "webm") return "webm";
  const mime = file.type.split(";")[0].trim().toLowerCase();
  if (mime === "video/mp4" || mime === "video/quicktime") return "mp4";
  if (mime === "video/webm") return "webm";
  return null;
}

function outputMime(container: ClipContainer): string {
  return container === "mp4" ? "video/mp4" : "video/webm";
}

function outputExtension(container: ClipContainer): string {
  return container === "mp4" ? "mp4" : "webm";
}

function encodePresetForPath(path: PostEncodePath): IosMp4EncodePreset {
  return path === "reencode_ultrafast" ? "ultrafast" : "veryfast";
}

export function assessClipMergeEligibility(
  files: File[],
  totalDurationSeconds: number,
): { eligible: boolean; reason?: string; container?: ClipContainer } {
  if (files.length <= 1) {
    return { eligible: false, reason: "single_clip" };
  }

  if (files.length > MERGE_MAX_CLIP_COUNT) {
    return {
      eligible: false,
      reason: `クリップ数が上限（${MERGE_MAX_CLIP_COUNT}本）を超えています`,
    };
  }

  if (totalDurationSeconds > MERGE_MAX_TOTAL_SECONDS) {
    return {
      eligible: false,
      reason: `合計時間が上限（${MERGE_MAX_TOTAL_SECONDS}秒）を超えています`,
    };
  }

  let totalBytes = 0;
  for (const file of files) {
    if (file.size > MERGE_MAX_SINGLE_CLIP_BYTES) {
      return {
        eligible: false,
        reason: "1本のクリップが大きすぎるため結合できません",
      };
    }
    totalBytes += file.size;
  }

  if (totalBytes > MERGE_MAX_TOTAL_BYTES) {
    return {
      eligible: false,
      reason: "合計ファイルサイズが大きすぎるため結合できません",
    };
  }

  const containers = files.map(detectContainer);
  if (containers.some((c) => c === null)) {
    return {
      eligible: false,
      reason: "対応していない動画形式のため結合できません",
    };
  }

  const first = containers[0]!;
  if (!containers.every((c) => c === first)) {
    return {
      eligible: false,
      reason: "クリップの形式が混在しているため結合できません",
    };
  }

  return { eligible: true, container: first };
}

function buildConcatListContent(virtualNames: string[]): string {
  return virtualNames.map((name) => `file '${name}'`).join("\n");
}

async function execFfmpegWithLogs(
  ffmpeg: Awaited<ReturnType<typeof getFfmpeg>>,
  args: string[],
): Promise<void> {
  const logs: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    logs.push(message);
  };
  ffmpeg.on("log", onLog);
  try {
    const code = await ffmpeg.exec(args);
    if (code !== 0) {
      const tail = logs.filter((l) => l.trim()).slice(-4).join(" ").trim();
      throw new Error(tail || `ffmpeg exit ${code}`);
    }
  } finally {
    ffmpeg.off("log", onLog);
  }
}

/**
 * Re-encode one clip to identical H.264@30 / 1080×1920 (padded) so concat
 * demuxer cannot drop later video when codec or fps differs across takes.
 */
async function execNormalizeClip(
  ffmpeg: Awaited<ReturnType<typeof getFfmpeg>>,
  inputName: string,
  outName: string,
  preset: IosMp4EncodePreset,
): Promise<void> {
  await execFfmpegWithLogs(ffmpeg, [
    "-i",
    inputName,
    ...iosMp4MergeNormalizeFilterArgs(),
    ...iosMp4OutputEncodeArgs({
      preset,
      width: 1080,
      height: 1920,
      fps: 30,
    }),
    outName,
  ]);
}

async function execConcatEncode(
  ffmpeg: Awaited<ReturnType<typeof getFfmpeg>>,
  listName: string,
  outName: string,
  preset: IosMp4EncodePreset,
): Promise<void> {
  await execFfmpegWithLogs(ffmpeg, [
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listName,
    ...iosMp4ScaleFilterArgs(),
    ...iosMp4OutputEncodeArgs({ preset }),
    outName,
  ]);
}

async function execSingleClipEncode(
  ffmpeg: Awaited<ReturnType<typeof getFfmpeg>>,
  inputName: string,
  outName: string,
  preset: IosMp4EncodePreset,
): Promise<void> {
  await execFfmpegWithLogs(ffmpeg, [
    "-i",
    inputName,
    ...iosMp4ScaleFilterArgs(),
    ...iosMp4OutputEncodeArgs({ preset }),
    outName,
  ]);
}

async function execSingleClipRemux(
  ffmpeg: Awaited<ReturnType<typeof getFfmpeg>>,
  inputName: string,
  outName: string,
): Promise<void> {
  await execFfmpegWithLogs(ffmpeg, [
    "-i",
    inputName,
    "-c",
    "copy",
    ...["-movflags", "+faststart"],
    outName,
  ]);
}

async function readMergedOutput(
  ffmpeg: Awaited<ReturnType<typeof getFfmpeg>>,
  outName: string,
  mime: string,
  fileName: string,
): Promise<File> {
  const data = await ffmpeg.readFile(outName);
  const bytes =
    data instanceof Uint8Array
      ? new Uint8Array(data)
      : new TextEncoder().encode(String(data));

  if (bytes.byteLength < 1024) {
    throw new Error("結合結果が小さすぎます");
  }

  return new File([bytes], fileName, { type: mime });
}

type MergeRunContext = {
  ffmpeg: Awaited<ReturnType<typeof getFfmpeg>>;
  runId: string;
  /** Raw input virtual files written from Blobs. */
  rawNames: string[];
  /** Normalized H.264@30 clips used in the concat list. */
  normNames: string[];
  listName: string;
  inputExt: string;
};

async function prepareMergeRun(
  files: File[],
  inputExt: string,
  onProgress?: (ratio: number, label: string) => void,
): Promise<MergeRunContext> {
  onProgress?.(0.02, "動画エンジンを読み込み中…");

  const ffmpeg = await getFfmpeg();
  const runId = crypto.randomUUID().slice(0, 8);
  const rawNames: string[] = [];
  const listName = `concat_${runId}.txt`;

  onProgress?.(0.06, "クリップを準備中…");

  for (let i = 0; i < files.length; i++) {
    const rawName = `clip_${runId}_${i}.${inputExt}`;
    rawNames.push(rawName);
    onProgress?.(
      0.08 + (i / files.length) * 0.12,
      `クリップ ${i + 1}/${files.length} を読み込み中…`,
    );
    await writeFileFromBlob(ffmpeg, rawName, files[i]);
  }

  return {
    ffmpeg,
    runId,
    rawNames,
    normNames: [],
    listName,
    inputExt,
  };
}

async function normalizeMergeClips(
  ctx: MergeRunContext,
  preset: IosMp4EncodePreset,
  onProgress?: (ratio: number, label: string) => void,
): Promise<void> {
  const normNames: string[] = [];
  for (let i = 0; i < ctx.rawNames.length; i++) {
    const rawName = ctx.rawNames[i]!;
    const normName = `norm_${ctx.runId}_${i}.mp4`;
    onProgress?.(
      0.2 + (i / ctx.rawNames.length) * 0.2,
      `クリップ ${i + 1}/${ctx.rawNames.length} を正規化中…`,
    );
    await execNormalizeClip(ctx.ffmpeg, rawName, normName, preset);
    normNames.push(normName);
  }
  ctx.normNames = normNames;
  const listContent = buildConcatListContent(normNames);
  await ctx.ffmpeg.writeFile(
    ctx.listName,
    new TextEncoder().encode(listContent),
  );
}

async function cleanupMergeRun(
  ctx: MergeRunContext,
  outName?: string,
): Promise<void> {
  await safeDeleteFile(ctx.ffmpeg, ctx.listName);
  if (outName) await safeDeleteFile(ctx.ffmpeg, outName);
  for (const name of ctx.rawNames) {
    await safeDeleteFile(ctx.ffmpeg, name);
  }
  for (const name of ctx.normNames) {
    await safeDeleteFile(ctx.ffmpeg, name);
  }
}

/**
 * Re-encode or remux a single clip to iOS-safe baseline H.264 MP4.
 * Safe H.264 inputs skip full re-encode (copy + faststart only).
 */
export async function transcodeClipForPost(
  file: File,
  onProgress?: (ratio: number, label: string) => void,
): Promise<TranscodeClipResult> {
  const container = detectContainer(file);
  if (!container) {
    throw new Error("対応していない動画形式のため最適化できません");
  }

  onProgress?.(0.04, "動画を検査中…");
  const probe = await probeClipForPostUpload(file);
  const encodePath = probe.encodePath;

  onProgress?.(0.06, "映像と音声の長さを確認中…");
  await assertClipsAvDurationOk([file]);

  const inputExt = outputExtension(container);
  const runId = crypto.randomUUID().slice(0, 8);
  const inputName = `single_in_${runId}.${inputExt}`;
  const outName = `single_out_${runId}.mp4`;

  onProgress?.(0.08, "動画エンジンを読み込み中…");
  const ffmpeg = await getFfmpeg();

  const onFfmpegProgress = ({ progress }: { progress: number }) => {
    if (typeof progress === "number") {
      const label =
        encodePath === "remux_copy"
          ? "動画を最適化中…"
          : "動画を再エンコード中…";
      onProgress?.(0.2 + Math.min(0.7, progress * 0.7), label);
    }
  };

  try {
    onProgress?.(0.12, "クリップを準備中…");
    await writeFileFromBlob(ffmpeg, inputName, file);
    ffmpeg.on("progress", onFfmpegProgress);

    if (encodePath === "remux_copy") {
      onProgress?.(0.18, "動画を最適化中…");
      await execSingleClipRemux(ffmpeg, inputName, outName);
    } else {
      onProgress?.(0.18, "動画を再エンコード中…");
      await execSingleClipEncode(
        ffmpeg,
        inputName,
        outName,
        encodePresetForPath(encodePath),
      );
    }

    onProgress?.(0.94, "最適化ファイルを読み込み中…");
    const encoded = await readMergedOutput(
      ffmpeg,
      outName,
      "video/mp4",
      "video.mp4",
    );
    onProgress?.(0.97, "結合結果の長さを確認中…");
    await assertMergedAvDurationOk(encoded);
    onProgress?.(1, "動画の最適化が完了しました");
    return {
      file: encoded,
      encodePath,
      probeReasons: probe.reasons,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (
      detail.includes("映像と音声の長さ") ||
      detail.includes("撮り直して")
    ) {
      throw err instanceof Error ? err : new Error(detail);
    }
    throw new Error(`動画の最適化に失敗しました（${detail}）`);
  } finally {
    ffmpeg.off("progress", onFfmpegProgress);
    await safeDeleteFile(ffmpeg, inputName);
    await safeDeleteFile(ffmpeg, outName);
  }
}

export type MergeClipsResult = {
  file: File;
  encodePath: PostEncodePath;
};

/**
 * Merge multiple clips into one File for upload via libx264+aac re-encode only.
 * Each clip is normalized to H.264@30 / 1080×1920 first so concat demuxer cannot
 * drop later-clip video when codec or fps differs (e.g. rear H.264 → front HEVC).
 * Copy-concat is avoided — iOS stalls at segment boundaries when keyframes do not
 * align across pasted segments.
 */
export async function mergeClipsForPost(
  files: File[],
  totalDurationSeconds: number,
  onProgress?: (ratio: number, label: string) => void,
): Promise<MergeClipsResult> {
  if (files.length <= 1) {
    if (files.length === 0) {
      throw new Error("投稿するクリップがありません");
    }
    const single = await transcodeClipForPost(files[0]!, onProgress);
    return { file: single.file, encodePath: single.encodePath };
  }

  const assessment = assessClipMergeEligibility(files, totalDurationSeconds);
  if (!assessment.eligible || !assessment.container) {
    throw new Error(
      assessment.reason === "single_clip"
        ? "クリップを結合できません"
        : assessment.reason ?? "クリップを結合できません",
    );
  }

  onProgress?.(0.04, "クリップを検査中…");
  const { worstPath } = await probeClipsForMergeEncode(files);
  const preset = encodePresetForPath(worstPath);

  onProgress?.(0.08, "映像と音声の長さを確認中…");
  await assertClipsAvDurationOk(files);

  const inputExt = outputExtension(assessment.container);
  const encodeOutName = `merged_enc_${crypto.randomUUID().slice(0, 8)}.mp4`;

  let ctx: MergeRunContext | undefined;
  const onFfmpegProgress = ({ progress }: { progress: number }) => {
    if (typeof progress === "number") {
      onProgress?.(0.45 + Math.min(0.45, progress * 0.45), "クリップを結合中…");
    }
  };

  try {
    ctx = await prepareMergeRun(files, inputExt, onProgress);
    ctx.ffmpeg.on("progress", onFfmpegProgress);

    onProgress?.(0.2, "クリップを正規化中…");
    await normalizeMergeClips(ctx, preset, onProgress);

    onProgress?.(0.42, "クリップを再エンコードしながら結合中…");
    await execConcatEncode(ctx.ffmpeg, ctx.listName, encodeOutName, preset);
    onProgress?.(0.92, "結合ファイルを読み込み中…");
    const merged = await readMergedOutput(
      ctx.ffmpeg,
      encodeOutName,
      "video/mp4",
      "merged.mp4",
    );
    onProgress?.(0.96, "結合結果の長さを確認中…");
    await assertMergedAvDurationOk(merged);
    onProgress?.(1, "クリップの結合が完了しました");
    return {
      file: merged,
      encodePath: worstPath === "remux_copy" ? "reencode_veryfast" : worstPath,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (
      detail.includes("映像と音声の長さ") ||
      detail.includes("撮り直して")
    ) {
      throw err instanceof Error ? err : new Error(detail);
    }
    throw new Error(`クリップの結合に失敗しました（${detail}）`);
  } finally {
    if (ctx) {
      ctx.ffmpeg.off("progress", onFfmpegProgress);
      await cleanupMergeRun(ctx, encodeOutName);
    }
  }
}

/** Warm ffmpeg.wasm while the user fills in post details. */
export function warmPostFfmpeg(): void {
  void getFfmpeg().catch(() => {
    /* background warm-up */
  });
}
