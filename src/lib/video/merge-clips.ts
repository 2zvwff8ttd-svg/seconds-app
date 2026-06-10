import { getVideoExtension } from "@/lib/video/media";
import {
  getFfmpeg,
  safeDeleteFile,
  writeFileFromBlob,
} from "@/lib/video/ffmpeg-client";

/** concat -c copy 時のメモリ超過を防ぐ上限 */
export const MERGE_MAX_CLIP_COUNT = 10;
export const MERGE_MAX_TOTAL_SECONDS = 90;
/** WASM ヒープ向けの保守的合計サイズ（再エンコードなし） */
export const MERGE_MAX_TOTAL_BYTES = 56 * 1024 * 1024;
export const MERGE_MAX_SINGLE_CLIP_BYTES = 28 * 1024 * 1024;

export type MergeClipsOutcome =
  | { merged: true; file: File }
  | { merged: false; files: File[]; warning?: string };

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
        reason: "1本のクリップが大きすぎるため結合をスキップします",
      };
    }
    totalBytes += file.size;
  }

  if (totalBytes > MERGE_MAX_TOTAL_BYTES) {
    return {
      eligible: false,
      reason: "合計ファイルサイズが大きすぎるため結合をスキップします",
    };
  }

  const containers = files.map(detectContainer);
  if (containers.some((c) => c === null)) {
    return {
      eligible: false,
      reason: "対応していない動画形式のため結合をスキップします",
    };
  }

  const first = containers[0]!;
  if (!containers.every((c) => c === first)) {
    return {
      eligible: false,
      reason: "クリップの形式が混在しているため結合をスキップします",
    };
  }

  return { eligible: true, container: first };
}

function buildConcatListContent(virtualNames: string[]): string {
  return virtualNames.map((name) => `file '${name}'`).join("\n");
}

async function execConcatCopy(
  ffmpeg: Awaited<ReturnType<typeof getFfmpeg>>,
  listName: string,
  outName: string,
  container: ClipContainer,
): Promise<void> {
  const args =
    container === "mp4"
      ? [
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listName,
          "-c",
          "copy",
          "-movflags",
          "+faststart",
          outName,
        ]
      : ["-f", "concat", "-safe", "0", "-i", listName, "-c", "copy", outName];

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
 * 複数クリップを再エンコードなし（concat demuxer + -c copy）で1本に結合する。
 * 失敗・非対応時は元の files を返し、投稿は継続できる。
 */
export async function tryMergeClips(
  files: File[],
  totalDurationSeconds: number,
  onProgress?: (ratio: number, label: string) => void,
): Promise<MergeClipsOutcome> {
  if (files.length <= 1) {
    return { merged: false, files };
  }

  const assessment = assessClipMergeEligibility(files, totalDurationSeconds);
  if (!assessment.eligible || !assessment.container) {
    return {
      merged: false,
      files,
      warning:
        assessment.reason === "single_clip"
          ? undefined
          : assessment.reason ?? "結合条件を満たさないため個別クリップで投稿します",
    };
  }

  const container = assessment.container;
  const runId = crypto.randomUUID().slice(0, 8);
  const virtualNames: string[] = [];
  const ext = outputExtension(container);
  const listName = `concat_${runId}.txt`;
  const outName = `merged_${runId}.${ext}`;

  onProgress?.(0.02, "動画エンジンを読み込み中…");

  let ffmpeg: Awaited<ReturnType<typeof getFfmpeg>>;
  try {
    ffmpeg = await getFfmpeg();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      merged: false,
      files,
      warning: `${detail}（個別クリップで投稿します）`,
    };
  }

  onProgress?.(0.08, "クリップを結合中…");

  const onFfmpegProgress = ({ progress }: { progress: number }) => {
    if (typeof progress === "number") {
      onProgress?.(
        0.1 + Math.min(0.82, progress * 0.82),
        "クリップを結合中…",
      );
    }
  };
  ffmpeg.on("progress", onFfmpegProgress);

  try {
    for (let i = 0; i < files.length; i++) {
      const virtualName = `clip_${runId}_${i}.${ext}`;
      virtualNames.push(virtualName);
      onProgress?.(
        0.1 + (i / files.length) * 0.25,
        `クリップ ${i + 1}/${files.length} を準備中…`,
      );
      await writeFileFromBlob(ffmpeg, virtualName, files[i]);
    }

    const listContent = buildConcatListContent(virtualNames);
    await ffmpeg.writeFile(listName, new TextEncoder().encode(listContent));

    onProgress?.(0.4, "クリップを連結中…（再エンコードなし）");
    await execConcatCopy(ffmpeg, listName, outName, container);

    onProgress?.(0.9, "結合ファイルを読み込み中…");
    const data = await ffmpeg.readFile(outName);
    const bytes =
      data instanceof Uint8Array
        ? new Uint8Array(data)
        : new TextEncoder().encode(String(data));

    if (bytes.byteLength < 1024) {
      throw new Error("結合結果が小さすぎます");
    }

    const mime = outputMime(container);
    const mergedFile = new File([bytes], `merged.${ext}`, { type: mime });

    onProgress?.(1, "クリップの結合が完了しました");
    return { merged: true, file: mergedFile };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      merged: false,
      files,
      warning: `クリップ結合に失敗しました（${detail}）。個別クリップで投稿します`,
    };
  } finally {
    ffmpeg.off("progress", onFfmpegProgress);
    await safeDeleteFile(ffmpeg, listName);
    await safeDeleteFile(ffmpeg, outName);
    for (const name of virtualNames) {
      await safeDeleteFile(ffmpeg, name);
    }
  }
}
