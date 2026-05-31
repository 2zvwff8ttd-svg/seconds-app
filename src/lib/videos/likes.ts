import { createClient } from "@/lib/supabase/client";
import type { LikeState } from "@/types/social";
import type { RealtimeChannel } from "@supabase/supabase-js";

export async function fetchLikeState(videoId: string): Promise<LikeState> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [countRes, mineRes] = await Promise.all([
    supabase
      .from("likes")
      .select("*", { count: "exact", head: true })
      .eq("video_id", videoId),
    user
      ? supabase
          .from("likes")
          .select("id")
          .eq("video_id", videoId)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (countRes.error) throw new Error(countRes.error.message);
  if (mineRes.error) throw new Error(mineRes.error.message);

  return {
    count: countRes.count ?? 0,
    likedByMe: Boolean(mineRes.data),
  };
}

export async function toggleLike(
  videoId: string,
  currentlyLiked: boolean,
): Promise<LikeState> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ログインが必要です");
  }

  if (currentlyLiked) {
    const { error } = await supabase
      .from("likes")
      .delete()
      .eq("video_id", videoId)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("likes").insert({
      video_id: videoId,
      user_id: user.id,
    });
    if (error) throw new Error(error.message);
  }

  return fetchLikeState(videoId);
}

export function subscribeLikeUpdates(
  videoId: string,
  onUpdate: (state: LikeState) => void,
): RealtimeChannel {
  const supabase = createClient();

  const refresh = () => {
    fetchLikeState(videoId).then(onUpdate).catch(() => {});
  };

  const channel = supabase
    .channel(`likes:${videoId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "likes",
        filter: `video_id=eq.${videoId}`,
      },
      refresh,
    )
    .subscribe();

  return channel;
}
