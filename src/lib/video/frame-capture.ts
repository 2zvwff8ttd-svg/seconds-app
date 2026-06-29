import { materializeVideoBlob } from "@/lib/video/playable-blob";

export type CaptureVideoFrameOptions = {
  maxEdge?: number;
  jpegQuality?: number;
  metadataTimeoutMs?: number;
  seekTimeoutMs?: number;
  /** Seconds into the clip; defaults to ~5% in (avoids black first frames). */
  seekTime?: number;
};

/** Default seek for auto thumbnails — matches legacy first-frame behavior. */
export function defaultVideoFrameSeekTime(duration: number): number {
  return duration > 0 ? Math.min(0.05, duration * 0.05) : 0;
}

function scaleToMaxEdge(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest <= 0) {
    return { width, height };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** iOS WebView 向け: metadata のみ読み込み + seek で1フレーム JPEG を生成 */
export async function captureVideoFrameBlob(
  file: File,
  options?: CaptureVideoFrameOptions,
): Promise<Blob> {
  const maxEdge = options?.maxEdge ?? 640;
  const jpegQuality = options?.jpegQuality ?? 0.82;
  const metadataTimeoutMs = options?.metadataTimeoutMs ?? 8_000;
  const seekTimeoutMs = options?.seekTimeoutMs ?? 5_000;

  const source = await materializeVideoBlob(file);
  const url = URL.createObjectURL(source);

  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error("動画メタデータの読み込みがタイムアウトしました"));
      }, metadataTimeoutMs);

      video.onloadedmetadata = () => {
        window.clearTimeout(timeoutId);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeoutId);
        reject(new Error("動画の読み込みに失敗しました (Load failed)"));
      };
    });

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const seekTarget =
      options?.seekTime !== undefined
        ? Math.max(0, Math.min(options.seekTime, duration > 0 ? duration : options.seekTime))
        : defaultVideoFrameSeekTime(duration);
    video.currentTime = seekTarget;

    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error("フレームの取得がタイムアウトしました"));
      }, seekTimeoutMs);

      video.onseeked = () => {
        window.clearTimeout(timeoutId);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeoutId);
        reject(new Error("フレームの取得に失敗しました"));
      };
    });

    const sourceWidth = video.videoWidth || 720;
    const sourceHeight = video.videoHeight || 1280;
    const { width, height } = scaleToMaxEdge(
      sourceWidth,
      sourceHeight,
      maxEdge,
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas が利用できません");

    ctx.drawImage(video, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("JPEG エンコードに失敗しました")),
        "image/jpeg",
        jpegQuality,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
