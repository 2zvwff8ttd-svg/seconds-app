import { getVideoExtension } from "@/lib/video/media";
import {
  getFfmpeg,
  safeDeleteFile,
  writeFileFromBlob,
} from "@/lib/video/ffmpeg-client";
import { iosMp4OutputEncodeArgs, iosMp4ScaleFilterArgs } from "@/lib/video/ios-mp4-encode";

/** concat 時のメモリ超過を防ぐ上限 */
export const MERGE_MAX_CLIP_COUNT = 10;
export const MERGE_MAX_TOTAL_SECONDS = 90;
/** WASM ヒープ向けの保守的合計サイズ */
export const MERGE_MAX_TOTAL_BYTES = 56 * 1024 * 1024;
export const MERGE_MAX_SINGLE_CLIP_BYTES = 28 * 1024 * 1024;

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

async function execConcatEncode(
  ffmpeg: Awaited<ReturnType<typeof getFfmpeg>>,
  listName: string,
  outName: string,
): Promise<void> {
  await execFfmpegWithLogs(ffmpeg, [
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listName,
    ...iosMp4ScaleFilterArgs(),
    ...iosMp4OutputEncodeArgs(),
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
  virtualNames: string[];
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
  const virtualNames: string[] = [];
  const listName = `concat_${runId}.txt`;

  onProgress?.(0.08, "クリップを結合中…");

  for (let i = 0; i < files.length; i++) {
    const virtualName = `clip_${runId}_${i}.${inputExt}`;
    virtualNames.push(virtualName);
    onProgress?.(
      0.1 + (i / files.length) * 0.2,
      `クリップ ${i + 1}/${files.length} を準備中…`,
    );
    await writeFileFromBlob(ffmpeg, virtualName, files[i]);
  }

  const listContent = buildConcatListContent(virtualNames);
  await ffmpeg.writeFile(listName, new TextEncoder().encode(listContent));

  return { ffmpeg, runId, virtualNames, listName, inputExt };
}

async function cleanupMergeRun(ctx: MergeRunContext, outName?: string): Promise<void> {
  await safeDeleteFile(ctx.ffmpeg, ctx.listName);
  if (outName) await safeDeleteFile(ctx.ffmpeg, outName);
  for (const name of ctx.virtualNames) {
    await safeDeleteFile(ctx.ffmpeg, name);
  }
}

/**
 * Merge multiple clips into one File for upload via libx264+aac re-encode only.
 * Copy-concat is avoided — iOS stalls at segment boundaries when keyframes do not
 * align across pasted segments.
 */
export async function mergeClipsForPost(
  files: File[],
  totalDurationSeconds: number,
  onProgress?: (ratio: number, label: string) => void,
): Promise<File> {
  if (files.length <= 1) {
    if (files.length === 0) {
      throw new Error("投稿するクリップがありません");
    }
    return files[0]!;
  }

  const assessment = assessClipMergeEligibility(files, totalDurationSeconds);
  if (!assessment.eligible || !assessment.container) {
    throw new Error(
      assessment.reason === "single_clip"
        ? "クリップを結合できません"
        : assessment.reason ?? "クリップを結合できません",
    );
  }

  const inputExt = outputExtension(assessment.container);
  const encodeOutName = `merged_enc_${crypto.randomUUID().slice(0, 8)}.mp4`;

  let ctx: MergeRunContext | undefined;
  const onFfmpegProgress = ({ progress }: { progress: number }) => {
    if (typeof progress === "number") {
      onProgress?.(0.35 + Math.min(0.55, progress * 0.55), "クリップを結合中…");
    }
  };

  try {
    ctx = await prepareMergeRun(files, inputExt, onProgress);
    ctx.ffmpeg.on("progress", onFfmpegProgress);

    onProgress?.(0.32, "クリップを再エンコードしながら結合中…");
    await execConcatEncode(ctx.ffmpeg, ctx.listName, encodeOutName);
    onProgress?.(0.92, "結合ファイルを読み込み中…");
    const merged = await readMergedOutput(
      ctx.ffmpeg,
      encodeOutName,
      "video/mp4",
      "merged.mp4",
    );
    onProgress?.(1, "クリップの結合が完了しました");
    return merged;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`クリップの結合に失敗しました（${detail}）`);
  } finally {
    if (ctx) {
      ctx.ffmpeg.off("progress", onFfmpegProgress);
      await cleanupMergeRun(ctx, encodeOutName);
    }
  }
}
