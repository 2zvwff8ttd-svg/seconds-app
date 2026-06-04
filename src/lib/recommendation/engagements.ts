import { createClient } from "@/lib/supabase/client";
import type { WatchReport } from "@/types/recommendation";

export async function recordWatchEngagement(
  videoId: string,
  report: WatchReport,
): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const watch_outcome = report.completed ? "completed" : "partial";
  const watch_progress = Math.min(1, Math.max(0, report.progress));

  const { error } = await supabase.from("video_engagements").upsert(
    {
      user_id: user.id,
      video_id: videoId,
      watch_outcome,
      watch_progress,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,video_id" },
  );

  if (error && !error.message.includes("does not exist")) {
    console.warn("[recordWatchEngagement]", error.message);
  }
}
