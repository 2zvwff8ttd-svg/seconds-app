/** 録画の自動停止タイマー（±200ms バッファ込み） */
export function scheduleRecordingAutoStop(
  remainingSeconds: number,
  onStop: () => void,
): () => void {
  const ms = Math.max(0, remainingSeconds * 1000 + 200);
  const id = window.setTimeout(onStop, ms);
  return () => window.clearTimeout(id);
}

export function measureRecordingSeconds(startedAt: number | null): number {
  if (!startedAt) return 0;
  return Math.max(0, (Date.now() - startedAt) / 1000);
}
