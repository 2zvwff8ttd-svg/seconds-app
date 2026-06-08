import { getDeviceTimeZone, getPostingDayDateString } from "@/lib/posting/day-boundary";
import { createClient } from "@/lib/supabase/client";

/** DB に行がない場合のフォールバック（通常は cron で割当済み） */
export const DEFAULT_ASSIGNED_SECONDS = 15;

export function parseAssignedSeconds(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : typeof value === "bigint"
          ? Number(value)
          : NaN;

  if (!Number.isFinite(parsed)) return null;

  const seconds = Math.round(parsed);
  if (seconds < 5 || seconds > 30) return null;
  return seconds;
}

async function queryAssignedSeconds(
  userId: string,
  postingDay: string,
): Promise<number | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("daily_assignments")
    .select("assigned_seconds")
    .eq("user_id", userId)
    .eq("date", postingDay)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return parseAssignedSeconds(data?.assigned_seconds);
}

/**
 * ログイン中ユーザーの、投稿日（デバイス TZ・朝7時区切り）の撮影秒数を返す。
 */
export async function fetchTodayAssignedSeconds(
  now: Date = new Date(),
): Promise<number> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ログインが必要です");
  }

  const timeZone = getDeviceTimeZone();
  const postingDay = getPostingDayDateString(now, timeZone);

  const seconds = await queryAssignedSeconds(user.id, postingDay);
  if (seconds !== null) return seconds;

  throw new Error(
    `今日（${postingDay}）の撮影秒数が割り当てられていません`,
  );
}

/**
 * 表示用。未割当時のみ DEFAULT_ASSIGNED_SECONDS にフォールバックする。
 */
export async function fetchTodayAssignedSecondsOrDefault(
  now: Date = new Date(),
): Promise<number> {
  try {
    return await fetchTodayAssignedSeconds(now);
  } catch {
    return DEFAULT_ASSIGNED_SECONDS;
  }
}
