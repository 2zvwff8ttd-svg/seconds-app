/** Supabase Storage `media` bucket allowed video types (no codec suffix). */
const STORAGE_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
]);

/**
 * Strip codec parameters (e.g. `video/webm;codecs=vp9,opus` → `video/webm`)
 * so Storage accepts the Content-Type header.
 */
export function normalizeStorageContentType(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (STORAGE_VIDEO_TYPES.has(base)) return base;
  if (base.startsWith("video/")) return "video/webm";
  return base || "video/webm";
}

export async function getVideoDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("動画の読み込みに失敗しました"));
    });

    return Math.max(0, Math.round(video.duration || 0));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function captureVideoThumbnail(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("サムネイル生成に失敗しました"));
    });

    video.currentTime = Math.min(0.1, (video.duration || 1) * 0.05);

    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("サムネイル生成に失敗しました"));
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas が利用できません");

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("サムネイルのエンコードに失敗しました")),
        "image/jpeg",
        0.85,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
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
