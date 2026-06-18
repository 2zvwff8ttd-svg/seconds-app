export function formatNativeRecordingError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "録画の処理に失敗しました";

  const lower = raw.toLowerCase();

  if (
    lower.includes("load failed") ||
    lower.includes("xhr load failed") ||
    lower.includes("fetch")
  ) {
    return "録画ファイルの読み込みに失敗しました。もう一度録画してお試しください。";
  }

  if (lower.includes("動画の読み込み") || lower.includes("metadata")) {
    return "録画した動画の長さを取得できませんでした。クリップは追加されない場合があります。";
  }

  if (
    lower.includes("setaudiosource") ||
    lower.includes("audio") ||
    lower.includes("microphone") ||
    lower.includes("mic")
  ) {
    return "マイクを利用できません。実機でお試しください（エミュレータでは録音できない場合があります）。";
  }

  if (lower.includes("camera is not running")) {
    return "カメラが起動していません。画面を開き直してから再度お試しください。";
  }

  if (lower.includes("recording failed") || lower.includes("invalid operation")) {
    return "録画を開始できませんでした。もう一度お試しください。";
  }

  if (lower.includes("録画ファイル")) {
    return raw.trim();
  }

  return raw.trim() || "録画の処理に失敗しました";
}
