import { detectCountryCode } from "@/lib/country/detect";
import { fetchBlockedUserIds } from "@/lib/blocks/list";
import { filterVideosByBlocked } from "@/lib/blocks/filter";
import {
  BASE_VIDEO_SELECT,
  buildVideoSelect,
  clearVideoSchemaCache,
  hasExtendedVideoColumns,
  isSchemaMismatchError,
  probeVideoSchema,
} from "@/lib/supabase/video-schema";
import { createClient } from "@/lib/supabase/client";
import { normalizeVideoRow, videoRowToFeedVideo } from "@/lib/videos/map-feed";
import type { FeedVideo } from "@/types/feed";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 補充用に多めに取得するプール上限 */
const FEED_POOL_LIMIT = 40;

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

/**
 * Latest daily crown for this country (from crown_awards).
 * Falls back to null when the table is missing or no award exists yet.
 */
async function fetchViralVideo(
  supabase: SupabaseClient,
  countryCode: string,
  select: string,
  _caps: Awaited<ReturnType<typeof probeVideoSchema>>,
) {
  const { data: award, error: awardError } = await supabase
    .from("crown_awards")
    .select("video_id, award_date")
    .eq("country", countryCode)
    .order("award_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (awardError) {
    if (
      awardError.message.includes("schema cache") ||
      awardError.message.includes("does not exist") ||
      awardError.code === "42P01" ||
      awardError.code === "PGRST205"
    ) {
      return null;
    }
    console.warn("[fetchViralVideo] crown_awards", awardError.message);
    return null;
  }

  const videoId = award?.video_id;
  if (!videoId || typeof videoId !== "string") return null;

  const { data, error } = await supabase
    .from("videos")
    .select(select)
    .eq("id", videoId)
    .maybeSingle();

  if (error) {
    if (error.message.includes("schema cache")) return null;
    throw new Error(error.message);
  }

  return data && typeof data === "object" && !("error" in data)
    ? videoRowToFeedVideo(
        normalizeVideoRow(data as unknown as Record<string, unknown>),
        { isViralTop: true },
      )
    : null;
}

export async function fetchHomeFeed(): Promise<{
  videos: FeedVideo[];
  countryCode: string;
}> {
  const supabase = createClient();
  const countryCode = await detectCountryCode();
  const caps = await probeVideoSchema(supabase);
  const select = hasExtendedVideoColumns(caps)
    ? buildVideoSelect(caps)
    : BASE_VIDEO_SELECT;

  const viralVideo = await fetchViralVideo(supabase, countryCode, select, caps);
  const blockedIds = await fetchBlockedUserIds();

  let query = supabase.from("videos").select(select);
  query = applyPublishedFilter(query, caps);

  if (caps.hasPublishedAt) {
    query = query.order("published_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  query = query.limit(FEED_POOL_LIMIT);

  if (viralVideo) {
    query = query.neq("id", viralVideo.id);
  }

  const { data: rows, error } = await query;

  if (error) {
    if (isSchemaMismatchError(error.message)) {
      clearVideoSchemaCache();
      const retryCaps = await probeVideoSchema(supabase, { force: true });
      const retrySelect = hasExtendedVideoColumns(retryCaps)
        ? buildVideoSelect(retryCaps)
        : BASE_VIDEO_SELECT;
      let retryQuery = supabase.from("videos").select(retrySelect);
      retryQuery = applyPublishedFilter(retryQuery, retryCaps);
      if (retryCaps.hasPublishedAt) {
        retryQuery = retryQuery.order("published_at", { ascending: false });
      } else {
        retryQuery = retryQuery.order("created_at", { ascending: false });
      }
      retryQuery = retryQuery.limit(FEED_POOL_LIMIT);
      if (viralVideo) retryQuery = retryQuery.neq("id", viralVideo.id);
      const retry = await retryQuery;
      if (retry.error) throw new Error(retry.error.message);
      const retryOthers = (retry.data ?? [])
        .slice(0, viralVideo ? FEED_POOL_LIMIT - 1 : FEED_POOL_LIMIT)
        .map((row) =>
      videoRowToFeedVideo(
          normalizeVideoRow(row as unknown as Record<string, unknown>),
        ),
    );
      const retryVideos = filterVideosByBlocked(
        viralVideo ? [viralVideo, ...retryOthers] : retryOthers,
        blockedIds,
      );
      return { videos: retryVideos, countryCode };
    }
    throw new Error(error.message);
  }

  const others = (rows ?? [])
    .slice(0, viralVideo ? FEED_POOL_LIMIT - 1 : FEED_POOL_LIMIT)
    .map((row) =>
      videoRowToFeedVideo(
        normalizeVideoRow(row as unknown as Record<string, unknown>),
      ),
    );

  const videos = filterVideosByBlocked(
    viralVideo ? [viralVideo, ...others] : others,
    blockedIds,
  );

  return { videos, countryCode };
}
