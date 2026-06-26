import { escapeIlikePattern } from "@/lib/search/escape-ilike";
import {
  BASE_VIDEO_SELECT,
  buildVideoSelect,
  probeVideoSchema,
} from "@/lib/supabase/video-schema";
import { createClient } from "@/lib/supabase/client";
import { normalizeVideoRow } from "@/lib/videos/map-feed";
import type { SearchVideoResult } from "@/types/search";

const SEARCH_LIMIT = 24;
const MIN_QUERY_LENGTH = 2;

function applyPublishedFilter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  caps: Awaited<ReturnType<typeof probeVideoSchema>>,
) {
  if (caps.hasStatus) {
    return query.eq("status", "published");
  }
  if (caps.hasPublishedAt) {
    return query.not("published_at", "is", null);
  }
  if (caps.hasPublishAt) {
    return query.lte("publish_at", new Date().toISOString());
  }
  return query;
}

export async function searchVideos(query: string): Promise<SearchVideoResult[]> {
  const term = query.trim();
  if (term.length < MIN_QUERY_LENGTH) return [];

  const supabase = createClient();
  const caps = await probeVideoSchema(supabase);
  const select =
    caps.hasStatus ||
    caps.hasPublishAt ||
    caps.hasPublishedAt ||
    caps.hasBgmUrl
      ? buildVideoSelect(caps)
      : BASE_VIDEO_SELECT;

  const pattern = `%${escapeIlikePattern(term)}%`;

  let videoQuery = supabase
    .from("videos")
    .select(select)
    .ilike("title", pattern);

  videoQuery = applyPublishedFilter(videoQuery, caps);

  if (caps.hasPublishedAt) {
    videoQuery = videoQuery.order("published_at", { ascending: false });
  } else {
    videoQuery = videoQuery.order("created_at", { ascending: false });
  }

  const { data, error } = await videoQuery.limit(SEARCH_LIMIT);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const normalized = normalizeVideoRow(
      row as unknown as Record<string, unknown>,
    );
    return {
      id: normalized.id,
      title: normalized.title || "無題のvlog",
      thumbnailUrl: normalized.thumbnail_url ?? undefined,
      creatorId: normalized.user_id,
      creatorName: normalized.profiles?.username ?? "unknown",
      creatorDisplayName: normalized.profiles?.display_name ?? null,
    };
  });
}
