export function formatNativeRecordingError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "録画の開始に失敗しました";

  const lower = raw.toLowerCase();

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

  return raw.trim() || "録画の開始に失敗しました";
}
