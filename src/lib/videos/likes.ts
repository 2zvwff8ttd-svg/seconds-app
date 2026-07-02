import { createClient } from "@/lib/supabase/client";
import type { LikeState } from "@/types/social";

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
): () => void {
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

  // removeChannel (not just unsubscribe) so the channel is dropped from the
  // client's internal list — otherwise channels pile up on every fullscreen
  // open and never get GC'd (memory creep on iPhone 13).
  return () => {
    void supabase.removeChannel(channel);
  };
}
