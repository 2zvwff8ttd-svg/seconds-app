import { createClient } from "@/lib/supabase/client";
import { mapSocialWriteError } from "@/lib/social/write-errors";
import type { FollowListUser, FollowStats } from "@/types/profile";

function mapFollowProfile(
  profileId: string,
  profiles: unknown,
): FollowListUser | null {
  const profile =
    Array.isArray(profiles) && profiles.length > 0
      ? (profiles[0] as {
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
        })
      : profiles && typeof profiles === "object" && "username" in profiles
        ? (profiles as {
            username: string;
            display_name?: string | null;
            avatar_url?: string | null;
          })
        : null;

  if (!profile?.username) return null;

  return {
    userId: profileId,
    username: profile.username,
    displayName: profile.display_name ?? null,
    avatarUrl: profile.avatar_url ?? null,
  };
}

export async function fetchFollowers(userId: string): Promise<FollowListUser[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("follows")
    .select("follower_id, profiles!follower_id(username, display_name, avatar_url)")
    .eq("following_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    const fallback = await supabase
      .from("follows")
      .select("follower_id, profiles!follower_id(username, display_name, avatar_url)")
      .eq("following_id", userId)
      .order("created_at", { ascending: false });
    if (fallback.error) throw new Error(fallback.error.message);
    return (fallback.data ?? [])
      .map((row) =>
        mapFollowProfile(
          row.follower_id as string,
          (row as { profiles: unknown }).profiles,
        ),
      )
      .filter((u): u is FollowListUser => u !== null);
  }

  return (data ?? [])
    .map((row) =>
      mapFollowProfile(
        row.follower_id as string,
        (row as { profiles: unknown }).profiles,
      ),
    )
    .filter((u): u is FollowListUser => u !== null);
}

export async function fetchFollowing(userId: string): Promise<FollowListUser[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("follows")
    .select("following_id, profiles!following_id(username, display_name, avatar_url)")
    .eq("follower_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    const fallback = await supabase
      .from("follows")
      .select("following_id, profiles!following_id(username, display_name, avatar_url)")
      .eq("follower_id", userId)
      .order("created_at", { ascending: false });
    if (fallback.error) throw new Error(fallback.error.message);
    return (fallback.data ?? [])
      .map((row) =>
        mapFollowProfile(
          row.following_id as string,
          (row as { profiles: unknown }).profiles,
        ),
      )
      .filter((u): u is FollowListUser => u !== null);
  }

  return (data ?? [])
    .map((row) =>
      mapFollowProfile(
        row.following_id as string,
        (row as { profiles: unknown }).profiles,
      ),
    )
    .filter((u): u is FollowListUser => u !== null);
}

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
    const { error } = await supabase.rpc("unfollow_user", {
      p_target_user_id: targetUserId,
    });
    if (error) throw new Error(mapSocialWriteError(error.message));
  } else {
    const { error } = await supabase.rpc("follow_user", {
      p_target_user_id: targetUserId,
    });
    if (error) throw new Error(mapSocialWriteError(error.message));
  }

  return fetchFollowStats(targetUserId);
}
