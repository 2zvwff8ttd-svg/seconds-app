import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

export async function execFfmpeg(
  ffmpeg: FFmpeg,
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

export function attachFfmpegProgress(
  ffmpeg: FFmpeg,
  onProgress: ((ratio: number) => void) | undefined,
  rangeStart: number,
  rangeEnd: number,
): () => void {
  if (!onProgress) return () => {};

  const handler = ({ progress }: { progress: number }) => {
    if (typeof progress !== "number" || !Number.isFinite(progress)) return;
    const clamped = Math.max(0, Math.min(1, progress));
    onProgress(rangeStart + clamped * (rangeEnd - rangeStart));
  };

  ffmpeg.on("progress", handler);
  return () => {
    ffmpeg.off("progress", handler);
  };
}

export async function readFfmpegOutputBytes(
  ffmpeg: FFmpeg,
  name: string,
): Promise<Uint8Array> {
  const data = await ffmpeg.readFile(name);
  const raw =
    data instanceof Uint8Array
      ? data
      : new TextEncoder().encode(String(data));
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  return copy;
}

export async function writeFfmpegInput(
  ffmpeg: FFmpeg,
  name: string,
  source: Blob | File,
): Promise<void> {
  await ffmpeg.writeFile(name, await fetchFile(source));
}

export function audioBlobVirtualName(runId: string, blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes("webm")) return `narr_${runId}.webm`;
  if (type.includes("wav")) return `narr_${runId}.wav`;
  if (type.includes("mpeg") || type.includes("mp3")) return `narr_${runId}.mp3`;
  return `narr_${runId}.m4a`;
}

export function formatFfmpegSeconds(seconds: number): string {
  const safe = Math.max(0.05, seconds);
  return safe.toFixed(3);
}

/** Uint8Array from ffmpeg.wasm → File (TS-safe ArrayBuffer for BlobPart). */
export function ffmpegBytesToFile(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
): File {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new File([buffer], fileName, { type: mimeType });
}
