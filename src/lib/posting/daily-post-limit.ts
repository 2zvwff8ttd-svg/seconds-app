import { createClient } from "@/lib/supabase/client";
import {
  formatLocalDateTime,
  getDeviceTimeZone,
  getPostingPeriodBounds,
} from "@/lib/posting/day-boundary";

export const DAILY_POST_LIMIT_MESSAGE =
  "今日はすでに投稿済みです。また明日の7時に！";

export type DailyPostLimitResult =
  | { allowed: true; timeZone: string }
  | {
      allowed: false;
      timeZone: string;
      periodEnd: Date;
      nextPostingLabel: string;
    };

export async function checkDailyPostLimit(
  now: Date = new Date(),
): Promise<DailyPostLimitResult> {
  const timeZone = getDeviceTimeZone();
  const { start, end } = getPostingPeriodBounds(now, timeZone);

  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ログインが必要です");
  }

  const { count, error } = await supabase
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  if (error) throw new Error(error.message);

  if ((count ?? 0) > 0) {
    return {
      allowed: false,
      timeZone,
      periodEnd: end,
      nextPostingLabel: formatLocalDateTime(end, timeZone),
    };
  }

  return { allowed: true, timeZone };
}

/** 投稿 API 用。制限超過時は DAILY_POST_LIMIT_MESSAGE で throw */
export async function assertCanPostToday(now: Date = new Date()): Promise<void> {
  const result = await checkDailyPostLimit(now);
  if (!result.allowed) {
    throw new Error(DAILY_POST_LIMIT_MESSAGE);
  }
}
