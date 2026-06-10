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

export type BonusDayCountdown =
  | { kind: "days"; days: number }
  | { kind: "bonus_next" };

/** 次のボーナス撮影日までのカウントダウン（累積日数は見せない） */
export function getBonusDayCountdown(streak: number): BonusDayCountdown {
  const normalized =
    Number.isFinite(streak) && streak > 0 ? Math.floor(streak) : 0;

  if (normalized === 0) {
    return { kind: "days", days: STREAK_BONUS_INTERVAL };
  }

  const remainder = normalized % STREAK_BONUS_INTERVAL;
  if (remainder === 0) {
    return { kind: "bonus_next" };
  }

  return { kind: "days", days: STREAK_BONUS_INTERVAL - remainder };
}

export function formatBonusDayCountdownMessage(
  countdown: BonusDayCountdown,
): string {
  if (countdown.kind === "bonus_next") {
    return "次回はボーナスデー！最大60秒";
  }
  return `ボーナスデーまであと${countdown.days}日`;
}

export function bonusDayMessageFromStreak(streak: number): string {
  return formatBonusDayCountdownMessage(getBonusDayCountdown(streak));
}

export async function fetchCurrentStreak(): Promise<number> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return 0;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("current_streak")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const streak = data?.current_streak;
  return typeof streak === "number" && Number.isFinite(streak) ? streak : 0;
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
