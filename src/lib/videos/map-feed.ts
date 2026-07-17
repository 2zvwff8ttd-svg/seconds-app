import { parseVideoDisplayMaskShape } from "@/lib/video/display-mask";
import { normalizeMediaPublicUrl } from "@/lib/videos/normalize-media-url";
import type { FeedVideo } from "@/types/feed";
import type { VideoRow } from "@/types/video";

type ProfileEmbed = {
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
};

function parseProfileEmbed(profiles: unknown): ProfileEmbed | null {
  const profile =
    Array.isArray(profiles) && profiles.length > 0
      ? (profiles[0] as ProfileEmbed)
      : profiles && typeof profiles === "object" && "username" in profiles
        ? (profiles as ProfileEmbed)
        : null;

  if (!profile?.username) return null;

  return {
    username: profile.username,
    display_name: profile.display_name ?? null,
    avatar_url: profile.avatar_url ?? null,
  };
}

export function normalizeVideoRow(row: Record<string, unknown>): VideoRow {
  const profile = parseProfileEmbed(row.profiles);

  return {
    ...(row as Omit<VideoRow, "profiles" | "display_mask_shape">),
    display_mask_shape: parseVideoDisplayMaskShape(row.display_mask_shape),
    profiles: profile
      ? {
          username: profile.username,
          display_name: profile.display_name ?? null,
          avatar_url: profile.avatar_url ?? null,
        }
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
    videoUrl: normalizeMediaPublicUrl(row.video_url) ?? "",
    bgmUrl: normalizeMediaPublicUrl(row.bgm_url) ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    clipThumbnailUrls: Array.isArray(row.clip_thumbnail_urls)
      ? row.clip_thumbnail_urls.filter(
          (url): url is string => typeof url === "string" && url.length > 0,
        )
      : undefined,
    title: row.title || "Untitled",
    creatorId: row.user_id,
    creatorName: row.profiles?.username ?? "unknown",
    creatorDisplayName: row.profiles?.display_name ?? null,
    creatorAvatar: row.profiles?.avatar_url ?? undefined,
    isViralTop: options?.isViralTop,
    countryCode: row.country,
    publishedAt: row.published_at ?? row.created_at,
    publishAt: row.publish_at ?? undefined,
    videoStatus: row.status ?? "published",
    displayMaskShape: parseVideoDisplayMaskShape(row.display_mask_shape),
    saveVideoUrl: normalizeMediaPublicUrl(row.save_video_url) ?? undefined,
  };
}
