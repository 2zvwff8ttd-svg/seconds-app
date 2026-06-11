import type { FeedVideo } from "@/types/feed";
import type { VideoRow } from "@/types/video";

export function normalizeVideoRow(row: Record<string, unknown>): VideoRow {
  const profiles = row.profiles;
  const profile =
    Array.isArray(profiles) && profiles.length > 0
      ? (profiles[0] as { username: string; avatar_url?: string | null })
      : profiles && typeof profiles === "object" && "username" in profiles
        ? (profiles as { username: string; avatar_url?: string | null })
        : null;

  return {
    ...(row as Omit<VideoRow, "profiles">),
    profiles: profile
      ? { username: profile.username, avatar_url: profile.avatar_url ?? null }
      : null,
    status: (row.status as VideoRow["status"]) ?? "published",
    publish_at: (row.publish_at as string | null) ?? null,
    published_at: (row.published_at as string | null) ?? null,
  };
}

export function videoRowToFeedVideo(
  row: VideoRow,
  options?: { isViralTop?: boolean },
): FeedVideo {
  return {
    id: row.id,
    videoUrl: row.video_url,
    bgmUrl: row.bgm_url?.trim() || undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    clipThumbnailUrls:
      Array.isArray(row.clip_thumbnail_urls) &&
      row.clip_thumbnail_urls.length > 1
        ? row.clip_thumbnail_urls.filter(
            (url): url is string => typeof url === "string" && url.length > 0,
          )
        : undefined,
    title: row.title || "Untitled",
    creatorId: row.user_id,
    creatorName: row.profiles?.username ?? "unknown",
    creatorAvatar: row.profiles?.avatar_url ?? undefined,
    isViralTop: options?.isViralTop,
    countryCode: row.country,
    publishedAt: row.published_at ?? row.created_at,
  };
}
