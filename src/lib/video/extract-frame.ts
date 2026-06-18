import {
  captureVideoFrameBlob,
  type CaptureVideoFrameOptions,
} from "@/lib/video/frame-capture";

const AI_FRAME_OPTIONS: CaptureVideoFrameOptions = {
  maxEdge: 512,
  jpegQuality: 0.72,
};

/** 動画ファイルの最初のフレームを JPEG Blob で抽出（AI解析向けに軽量） */
export async function extractFirstFrameBlob(file: File): Promise<Blob> {
  return captureVideoFrameBlob(file, AI_FRAME_OPTIONS);
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
