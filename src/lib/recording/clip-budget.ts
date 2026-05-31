import type { RecordedClip } from "@/types/recording";

export function sumRecordedClipSeconds(clips: RecordedClip[]): number {
  return clips.reduce((sum, c) => sum + c.durationSeconds, 0);
}

/** 割り当て秒数を使い切ったか（小数秒の誤差を許容） */
export function isRecordingBudgetExhausted(
  usedSeconds: number,
  assignedSeconds: number,
): boolean {
  return usedSeconds >= assignedSeconds - 0.05;
}

/** DB 保存用の合計秒数（整数・1秒以上） */
export function totalDurationSecondsForDb(
  clipDurations: number[],
): number {
  const total = clipDurations.reduce((sum, d) => sum + d, 0);
  const rounded = Math.round(total);
  if (!Number.isFinite(rounded) || rounded < 1) {
    throw new Error("クリップの合計時間を計算できませんでした");
  }
  return rounded;
}
