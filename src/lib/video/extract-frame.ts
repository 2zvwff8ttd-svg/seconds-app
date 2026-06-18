const AI_FRAME_MAX_EDGE = 512;
const AI_FRAME_JPEG_QUALITY = 0.72;

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

/** 動画ファイルの最初のフレームを JPEG Blob で抽出（AI解析向けに軽量） */
export async function extractFirstFrameBlob(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error("動画の読み込みがタイムアウトしました"));
      }, 8_000);

      video.onloadedmetadata = () => {
        window.clearTimeout(timeoutId);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeoutId);
        reject(new Error("動画の読み込みに失敗しました"));
      };
    });

    const seekTarget = video.duration > 0 ? Math.min(0.05, video.duration / 2) : 0;
    video.currentTime = seekTarget;

    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error("フレームの取得がタイムアウトしました"));
      }, 5_000);

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
      AI_FRAME_MAX_EDGE,
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
            : reject(new Error("フレームのエンコードに失敗しました")),
        "image/jpeg",
        AI_FRAME_JPEG_QUALITY,
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Base64 変換に失敗しました"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Base64 変換に失敗しました"));
    reader.readAsDataURL(blob);
  });
}
