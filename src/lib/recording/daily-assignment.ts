import { getDeviceTimeZone, getPostingDayDateString } from "@/lib/posting/day-boundary";
import { createClient } from "@/lib/supabase/client";

/** 今日の撮影秒数（5–30）。未割当時は 15 秒をデフォルト */
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

  const { data, error } = await supabase
    .from("daily_assignments")
    .select("assigned_seconds")
    .eq("user_id", user.id)
    .eq("date", postingDay)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const seconds = data?.assigned_seconds;
  if (typeof seconds === "number" && seconds >= 5 && seconds <= 30) {
    return seconds;
  }

  return 15;
}
