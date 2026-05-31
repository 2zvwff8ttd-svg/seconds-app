import {
  BASE_VIDEO_SELECT,
  buildVideoSelect,
  probeVideoSchema,
} from "@/lib/supabase/video-schema";
import { createClient } from "@/lib/supabase/client";
import type { FeedVideo } from "@/types/feed";
import { normalizeVideoRow, videoRowToFeedVideo } from "@/lib/videos/map-feed";

function mapLikedRow(row: Record<string, unknown>): FeedVideo | null {
  const videos = row.videos;
  const videoRow =
    Array.isArray(videos) && videos.length > 0
      ? videos[0]
      : videos && typeof videos === "object"
        ? videos
        : null;

  if (!videoRow || typeof videoRow !== "object") return null;
  return videoRowToFeedVideo(
    normalizeVideoRow(videoRow as Record<string, unknown>),
  );
}

export async function fetchLikedVideos(userId: string): Promise<FeedVideo[]> {
  const supabase = createClient();
  const caps = await probeVideoSchema(supabase);
  const videoSelect = caps.hasStatus || caps.hasPublishAt || caps.hasPublishedAt
    ? buildVideoSelect(caps)
    : BASE_VIDEO_SELECT;

  const select = `created_at, videos (${videoSelect.replace(/\n/g, " ")})`;

  const { data, error } = await supabase
    .from("likes")
    .select(select)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => mapLikedRow(row as unknown as Record<string, unknown>))
    .filter((v): v is FeedVideo => v !== null);
}

export async function fetchUserVideos(userId: string): Promise<FeedVideo[]> {
  const supabase = createClient();
  const caps = await probeVideoSchema(supabase);
  const select = caps.hasStatus || caps.hasPublishAt || caps.hasPublishedAt
    ? buildVideoSelect(caps)
    : BASE_VIDEO_SELECT;

  const { data, error } = await supabase
    .from("videos")
    .select(select)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) =>
    videoRowToFeedVideo(
      normalizeVideoRow(row as unknown as Record<string, unknown>),
    ),
  );
}

export async function fetchProfile(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, bio, avatar_url, country")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("ユーザーが見つかりません");

  return {
    userId: data.id,
    username: data.username,
    bio: data.bio,
    avatarUrl: data.avatar_url,
    country: data.country,
  };
}

export async function fetchCurrentProfile() {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ログインが必要です");
  }

  return fetchProfile(user.id);
}
