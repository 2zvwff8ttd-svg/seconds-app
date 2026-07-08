import { createClient } from "@/lib/supabase/client";

const viewedThisSession = new Set<string>();

/**
 * Count a lifetime-unique video view (RPC). Also increments video_daily_views
 * for the JST calendar day used by daily crown ranking.
 * Dedupes within this browser session for the same video id.
 */
export async function incrementVideoView(videoId: string): Promise<void> {
  if (!videoId || viewedThisSession.has(videoId)) return;
  viewedThisSession.add(videoId);

  try {
    const supabase = createClient();
    const { error } = await supabase.rpc("increment_video_view", {
      p_video_id: videoId,
    });
    if (error && !error.message.includes("does not exist")) {
      console.warn("[incrementVideoView]", error.message);
      viewedThisSession.delete(videoId);
    }
  } catch (err) {
    viewedThisSession.delete(videoId);
    console.warn("[incrementVideoView]", err);
  }
}
