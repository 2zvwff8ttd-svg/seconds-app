import { createClient } from "@/lib/supabase/client";

/** JST の今日の日付 (YYYY-MM-DD) */
export function todayJstDateString(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** 今日の撮影秒数（5–30）。未割当時は 15 秒をデフォルト */
export async function fetchTodayAssignedSeconds(): Promise<number> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ログインが必要です");
  }

  const today = todayJstDateString();
  const { data, error } = await supabase
    .from("daily_assignments")
    .select("assigned_seconds")
    .eq("user_id", user.id)
    .eq("date", today)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const seconds = data?.assigned_seconds;
  if (typeof seconds === "number" && seconds >= 5 && seconds <= 30) {
    return seconds;
  }

  return 15;
}
