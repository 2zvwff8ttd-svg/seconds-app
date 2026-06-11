import { Capacitor } from "@capacitor/core";

/** camera-preview の file path → 投稿パイプライン用 File（mp4 固定） */
export async function nativeVideoPathToFile(
  videoFilePath: string,
): Promise<File> {
  const webPath = Capacitor.convertFileSrc(videoFilePath);
  const response = await fetch(webPath);
  if (!response.ok) {
    throw new Error(`動画ファイルの読み込みに失敗しました (${response.status})`);
  }
  const blob = await response.blob();
  const type = blob.type.includes("video") ? blob.type : "video/mp4";
  return new File([blob], `clip-${Date.now()}.mp4`, { type });
}
