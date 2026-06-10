import {
  getDeviceTimeZone,
  getPostingDayDateString,
} from "@/lib/posting/day-boundary";
import { createClient } from "@/lib/supabase/client";

/** ボーナス撮影時間（5〜60秒）が適用される連続日数の倍数 */
export const STREAK_BONUS_INTERVAL = 10;

export const ASSIGNED_SECONDS_MIN = 5;
export const ASSIGNED_SECONDS_MAX_NORMAL = 30;
export const ASSIGNED_SECONDS_MAX_BONUS = 60;

export function isStreakBonusDay(streak: number): boolean {
  return streak >= STREAK_BONUS_INTERVAL && streak % STREAK_BONUS_INTERVAL === 0;
}

/**
 * 投稿成功後に連続投稿日数を更新する。
 * postingDay はデバイス TZ の 7 時区切り投稿日（YYYY-MM-DD）。
 */
export async function recordPostStreak(
  postingDay: string,
): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("record_post_streak", {
    p_posting_day: postingDay,
  });

  if (error) {
    throw new Error(error.message);
  }

  const streak = typeof data === "number" ? data : Number(data);
  if (!Number.isFinite(streak)) {
    throw new Error("連続投稿日数の更新に失敗しました");
  }
  return streak;
}

/** 投稿 API 用：現在の投稿日でストリークを記録 */
export async function recordPostStreakForNow(
  now: Date = new Date(),
): Promise<number> {
  const postingDay = getPostingDayDateString(now, getDeviceTimeZone());
  return recordPostStreak(postingDay);
}
