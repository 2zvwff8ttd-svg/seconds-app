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

async function loadOwnProfileData(): Promise<OwnProfileCacheData> {
  const profile = await fetchCurrentProfile();
  const blockedIds = await fetchBlockedUserIds();
  const [followStats, userVideos, likedRaw] = await Promise.all([
    fetchFollowStats(profile.userId),
    fetchUserVideos(profile.userId),
    fetchLikedVideos(profile.userId),
  ]);

  return {
    profile,
    followStats,
    userVideos,
    likedVideos: filterVideosByBlocked(likedRaw, blockedIds),
  };
}

export async function prefetchDmThreads(): Promise<DmThreadsCacheData> {
  return fetchNavCacheFresh(NAV_CACHE_KEYS.DM_THREADS, fetchDmThreadsForUser);
}

export async function prefetchOwnProfile(): Promise<OwnProfileCacheData> {
  return fetchNavCacheFresh(NAV_CACHE_KEYS.OWN_PROFILE, loadOwnProfileData);
}

export async function prefetchNavData(): Promise<void> {
  await Promise.allSettled([prefetchDmThreads(), prefetchOwnProfile()]);
}

export async function refreshDmThreadsCache(): Promise<DmThreadsCacheData> {
  return fetchNavCacheFresh(NAV_CACHE_KEYS.DM_THREADS, fetchDmThreadsForUser);
}

export async function refreshOwnProfileCache(): Promise<OwnProfileCacheData> {
  return fetchNavCacheFresh(NAV_CACHE_KEYS.OWN_PROFILE, loadOwnProfileData);
}
