/** Supabase Storage `media` bucket allowed types (no codec suffix). */
import { captureVideoFrameBlob } from "@/lib/video/frame-capture";
import { materializeVideoBlob } from "@/lib/video/playable-blob";

const STORAGE_MEDIA_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * Strip codec parameters (e.g. `video/webm;codecs=vp9,opus` → `video/webm`)
 * so Storage accepts the Content-Type header.
 * Unknown types are rejected (no remap to video/webm).
 */
export function normalizeStorageContentType(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (!base) return "video/webm";
  if (STORAGE_MEDIA_TYPES.has(base)) return base;
  throw new Error(`対応していないファイル形式です（${base}）`);
}

export async function getVideoDuration(
  file: File,
  options?: { fallbackSeconds?: number; timeoutMs?: number },
): Promise<number> {
  const fallback = options?.fallbackSeconds;
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const source = await materializeVideoBlob(file);
  const url = URL.createObjectURL(source);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.playsInline = true;
    video.muted = true;
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error("動画の読み込みがタイムアウトしました"));
      }, timeoutMs);

      video.onloadedmetadata = () => {
        window.clearTimeout(timeoutId);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeoutId);
        reject(new Error("動画の読み込みに失敗しました (Load failed)"));
      };
    });

    const duration = Math.max(0, video.duration || 0);
    if (duration > 0) {
      return Math.round(duration);
    }
    if (fallback !== undefined && fallback > 0) {
      return fallback;
    }
    return 0;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function captureVideoThumbnail(file: File): Promise<Blob> {
  return captureVideoFrameBlob(file, {
    maxEdge: 640,
    jpegQuality: 0.85,
  });
}

export function getVideoExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && ["mp4", "webm", "mov", "quicktime"].includes(fromName)) {
    return fromName === "quicktime" ? "mov" : fromName;
  }
  if (file.type.includes("webm")) return "webm";
  if (file.type.includes("quicktime")) return "mov";
  return "mp4";
}
