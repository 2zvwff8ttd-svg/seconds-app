import { createClient } from "@/lib/supabase/client";

export type PendingCrownCelebration = {
  id: string;
  awardDate: string;
  country: string;
  videoId: string;
  dailyViewCount: number;
  totalViewCount: number;
  title: string;
  thumbnailUrl: string | null;
};

type CelebrationRpcRow = {
  id?: string;
  award_date?: string;
  country?: string;
  video_id?: string;
  daily_view_count?: number;
  total_view_count?: number;
  title?: string;
  thumbnail_url?: string | null;
};

export async function fetchPendingCrownCelebration(): Promise<PendingCrownCelebration | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("fetch_pending_crown_celebration");

  if (error) {
    if (!error.message.includes("does not exist")) {
      console.warn("[fetchPendingCrownCelebration]", error.message);
    }
    return null;
  }

  if (!data || typeof data !== "object") return null;
  const row = data as CelebrationRpcRow;
  if (!row.id || !row.video_id) return null;

  return {
    id: row.id,
    awardDate: String(row.award_date ?? ""),
    country: String(row.country ?? ""),
    videoId: row.video_id,
    dailyViewCount: Number(row.daily_view_count ?? 0),
    totalViewCount: Number(row.total_view_count ?? 0),
    title: String(row.title ?? "無題のvlog"),
    thumbnailUrl:
      typeof row.thumbnail_url === "string" && row.thumbnail_url.length > 0
        ? row.thumbnail_url
        : null,
  };
}

export async function markCrownCelebrationSeen(awardId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("mark_crown_celebration_seen", {
    p_award_id: awardId,
  });
  if (error && !error.message.includes("does not exist")) {
    console.warn("[markCrownCelebrationSeen]", error.message);
  }
}
