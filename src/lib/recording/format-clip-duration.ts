/** クリップ表示用（小数第1位まで。例: 3.47 → "3.5"） */
export function formatClipDurationSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0.1";
  const rounded = Math.round(seconds * 10) / 10;
  return (rounded < 0.1 ? 0.1 : rounded).toFixed(1);
}

/** Store clip length at one decimal place. */
export function roundClipDurationSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0.1;
  return Math.max(0.1, Math.round(seconds * 10) / 10);
}
