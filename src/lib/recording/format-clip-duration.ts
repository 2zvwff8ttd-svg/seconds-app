/** クリップ表示用（小数第1位まで） */
export function formatClipDurationSeconds(seconds: number): string {
  const rounded = Math.round(seconds * 10) / 10;
  return rounded.toFixed(1);
}
