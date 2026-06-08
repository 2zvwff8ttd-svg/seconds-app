import {
  getDeviceTimeZone,
  getPostingDayDateString,
} from "@/lib/posting/day-boundary";
import { createClient } from "@/lib/supabase/client";

/** 毎朝7時 JST cron の date キー照合用（オンデマンド生成はデバイスTZの投稿日） */
const ASSIGNMENT_TIME_ZONE = "Asia/Tokyo";

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

/** 照合候補日（デバイスTZの投稿日 → cron と同じ JST 投稿日の順） */
export function getAssignmentLookupDays(
  now: Date = new Date(),
  timeZone: string = getDeviceTimeZone(),
): string[] {
  const deviceDay = getPostingDayDateString(now, timeZone);
  const jstDay = getPostingDayDateString(now, ASSIGNMENT_TIME_ZONE);
  return [...new Set([deviceDay, jstDay])];
}

async function queryAssignedSecondsForDay(
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

/** デバイスTZの投稿日で割り当てが無ければ RPC 経由で作成（既存行はそのまま返す） */
async function ensureDailyAssignmentForDay(
  postingDay: string,
): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("ensure_daily_assignment", {
    p_date: postingDay,
  });

  if (error) throw new Error(error.message);

  const seconds = parseAssignedSeconds(data);
  if (seconds === null) {
    throw new Error("撮影秒数の取得に失敗しました");
  }
  return seconds;
}

/**
 * ログイン中ユーザーの、投稿日（デバイス TZ・朝7時区切り）の撮影秒数を返す。
 * 割り当てが無い場合は ensure_daily_assignment RPC で当日分を補完する。
 * cron 由来の JST 日付キーとも照合する。
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
  const lookupDays = getAssignmentLookupDays(now, timeZone);

  for (const day of lookupDays) {
    const seconds = await queryAssignedSecondsForDay(user.id, day);
    if (seconds !== null) return seconds;
  }

  const devicePostingDay = getPostingDayDateString(now, timeZone);
  try {
    return await ensureDailyAssignmentForDay(devicePostingDay);
  } catch {
    // RPC 未デプロイ時など: 直前に cron が入れた行を再照合
  }

  for (const day of lookupDays) {
    const seconds = await queryAssignedSecondsForDay(user.id, day);
    if (seconds !== null) return seconds;
  }

  const tried = lookupDays.join(", ");
  throw new Error(
    `今日の撮影秒数が割り当てられていません（照合日: ${tried}）`,
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
