import { detectCountryCode } from "@/lib/country/detect";
import { fetchBlockedUserIds } from "@/lib/blocks/list";
import { filterVideosByBlocked } from "@/lib/blocks/filter";
import {
  BASE_VIDEO_SELECT,
  buildVideoSelect,
  clearVideoSchemaCache,
  isSchemaMismatchError,
  probeVideoSchema,
} from "@/lib/supabase/video-schema";
import { createClient } from "@/lib/supabase/client";
import { normalizeVideoRow, videoRowToFeedVideo } from "@/lib/videos/map-feed";
import type { FeedVideo } from "@/types/feed";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 補充用に多めに取得するプール上限 */
const FEED_POOL_LIMIT = 40;

function getYesterdayRangeJst() {
  const now = new Date();
  const jstOffset = 9 * 60;
  const jstNow = new Date(now.getTime() + (jstOffset + now.getTimezoneOffset()) * 60000);
  const start = new Date(jstNow);
  start.setDate(start.getDate() - 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const toIso = (d: Date) => {
    const utc = new Date(d.getTime() - (jstOffset + now.getTimezoneOffset()) * 60000);
    return utc.toISOString();
  };

  return { start: toIso(start), end: toIso(end) };
}

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

async function fetchViralVideo(
  supabase: SupabaseClient,
  countryCode: string,
  select: string,
  caps: Awaited<ReturnType<typeof probeVideoSchema>>,
) {
  const { start, end } = getYesterdayRangeJst();

  let query = supabase
    .from("videos")
    .select(select)
    .eq("country", countryCode);

  query = applyPublishedFilter(query, caps);

  if (caps.hasPublishedAt) {
    query = query.gte("published_at", start).lt("published_at", end);
  } else {
    query = query.gte("created_at", start).lt("created_at", end);
  }

  const { data, error } = await query
    .order("view_count", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.message.includes("schema cache")) {
      return null;
    }
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
  const select =
    caps.hasStatus ||
    caps.hasPublishAt ||
    caps.hasPublishedAt ||
    caps.hasBgmUrl ||
    caps.hasClipThumbnailUrls
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
      const retrySelect =
        retryCaps.hasStatus ||
        retryCaps.hasPublishAt ||
        retryCaps.hasPublishedAt ||
        retryCaps.hasBgmUrl ||
        retryCaps.hasClipThumbnailUrls
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
