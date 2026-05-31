import { createClient } from "@/lib/supabase/client";
import type { FollowStats } from "@/types/profile";

export async function fetchFollowStats(targetUserId: string): Promise<FollowStats> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [followersRes, followingRes, mineRes] = await Promise.all([
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", targetUserId),
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", targetUserId),
    user
      ? supabase
          .from("follows")
          .select("id")
          .eq("follower_id", user.id)
          .eq("following_id", targetUserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (followersRes.error) throw new Error(followersRes.error.message);
  if (followingRes.error) throw new Error(followingRes.error.message);
  if (mineRes.error) throw new Error(mineRes.error.message);

  return {
    followerCount: followersRes.count ?? 0,
    followingCount: followingRes.count ?? 0,
    isFollowing: Boolean(mineRes.data),
  };
}

export async function toggleFollow(
  targetUserId: string,
  currentlyFollowing: boolean,
): Promise<FollowStats> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ログインが必要です");
  }

  if (user.id === targetUserId) {
    throw new Error("自分自身をフォローすることはできません");
  }

  if (currentlyFollowing) {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("following_id", targetUserId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("follows").insert({
      follower_id: user.id,
      following_id: targetUserId,
    });
    if (error) throw new Error(error.message);
  }

  return fetchFollowStats(targetUserId);
}
