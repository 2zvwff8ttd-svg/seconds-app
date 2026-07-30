import {
  fetchNavCacheFresh,
  NAV_CACHE_KEYS,
} from "@/lib/cache/nav-data-cache";
import { fetchBlockedUserIds } from "@/lib/blocks/list";
import { filterVideosByBlocked } from "@/lib/blocks/filter";
import { fetchDmThreadsForUser } from "@/lib/dm/threads";
import { fetchFollowStats } from "@/lib/social/follows";
import {
  fetchCurrentProfile,
  fetchLikedVideos,
  fetchUserVideos,
} from "@/lib/videos/profile-feed";
import type { DmThreadSummary } from "@/types/dm";
import type { FeedVideo } from "@/types/feed";
import type { FollowStats, ProfileData } from "@/types/profile";

export type DmThreadsCacheData = {
  inbox: DmThreadSummary[];
  requests: DmThreadSummary[];
};

export type OwnProfileCacheData = {
  profile: ProfileData;
  followStats: FollowStats;
  userVideos: FeedVideo[];
  likedVideos: FeedVideo[];
};

/** Core profile shell without likes — enough to paint header + posts grid. */
export type OwnProfileCoreData = {
  profile: ProfileData;
  followStats: FollowStats;
  userVideos: FeedVideo[];
};

export type OwnProfileLoadHandlers = {
  /** Fires once profile + stats + posts are ready (likes may still be in flight). */
  onCoreReady?: (core: OwnProfileCoreData) => void;
};

async function loadOwnProfileData(
  handlers?: OwnProfileLoadHandlers,
): Promise<OwnProfileCacheData> {
  const profile = await fetchCurrentProfile();
  const blockedIds = await fetchBlockedUserIds();

  // Start likes in parallel with stats/videos (same shape as progressive UI).
  const likedPromise = fetchLikedVideos(profile.userId).then((liked) =>
    filterVideosByBlocked(liked, blockedIds),
  );

  const [followStats, userVideos] = await Promise.all([
    fetchFollowStats(profile.userId),
    fetchUserVideos(profile.userId),
  ]);

  handlers?.onCoreReady?.({
    profile,
    followStats,
    userVideos,
  });

  const likedVideos = await likedPromise;

  return {
    profile,
    followStats,
    userVideos,
    likedVideos,
  };
}

export async function prefetchDmThreads(): Promise<DmThreadsCacheData> {
  return fetchNavCacheFresh(NAV_CACHE_KEYS.DM_THREADS, fetchDmThreadsForUser);
}

export async function prefetchOwnProfile(): Promise<OwnProfileCacheData> {
  return fetchNavCacheFresh(NAV_CACHE_KEYS.OWN_PROFILE, () =>
    loadOwnProfileData(),
  );
}

export async function prefetchNavData(): Promise<void> {
  await Promise.allSettled([prefetchDmThreads(), prefetchOwnProfile()]);
}

export async function refreshDmThreadsCache(): Promise<DmThreadsCacheData> {
  return fetchNavCacheFresh(NAV_CACHE_KEYS.DM_THREADS, fetchDmThreadsForUser);
}

/**
 * Own-profile fetch with in-flight dedupe shared with home prefetch.
 * Optional onCoreReady enables progressive paint when this call owns the fetch.
 * (If joining an existing prefetch promise, onCoreReady may not fire — full result still returns.)
 */
export async function refreshOwnProfileCache(
  handlers?: OwnProfileLoadHandlers,
): Promise<OwnProfileCacheData> {
  return fetchNavCacheFresh(NAV_CACHE_KEYS.OWN_PROFILE, () =>
    loadOwnProfileData(handlers),
  );
}
