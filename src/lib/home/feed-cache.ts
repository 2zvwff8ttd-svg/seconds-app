/**
 * In-memory home feed snapshot so tab switches don't refetch immediately.
 * TTL keeps new posts / crowns eventually visible without permanent staleness.
 */

import type { FeedVideo } from "@/types/feed";
import type { UserRecommendationContext } from "@/types/recommendation";

/** Soft freshness window — within this, returning to home skips network. */
export const HOME_FEED_CACHE_TTL_MS = 45_000;

export type HomeFeedSnapshot = {
  videos: FeedVideo[];
  countryCode: string;
  recContext: UserRecommendationContext;
  /** Bubble slots at last paint — restores continuity across remounts. */
  activeBubbles: FeedVideo[];
  fetchedAt: number;
};

export type HomeShellSnapshot = {
  assignedSeconds: number | null;
  fetchedAt: number;
};

let feedSnapshot: HomeFeedSnapshot | null = null;
let shellSnapshot: HomeShellSnapshot | null = null;
let unreadNotifSnapshot: { count: number; fetchedAt: number } | null = null;
let crownSnapshot: { pending: unknown; fetchedAt: number } | null = null;

function cloneRecContext(
  ctx: UserRecommendationContext,
): UserRecommendationContext {
  return {
    isNewUser: ctx.isNewUser,
    creatorScores: { ...ctx.creatorScores },
    engagedVideoIds: new Set(ctx.engagedVideoIds),
  };
}

export function readHomeFeedCache(
  ttlMs: number = HOME_FEED_CACHE_TTL_MS,
): HomeFeedSnapshot | null {
  if (!feedSnapshot) return null;
  if (Date.now() - feedSnapshot.fetchedAt > ttlMs) return null;
  return {
    videos: feedSnapshot.videos,
    countryCode: feedSnapshot.countryCode,
    recContext: cloneRecContext(feedSnapshot.recContext),
    activeBubbles: feedSnapshot.activeBubbles,
    fetchedAt: feedSnapshot.fetchedAt,
  };
}

export function writeHomeFeedCache(input: {
  videos: FeedVideo[];
  countryCode: string;
  recContext: UserRecommendationContext;
  activeBubbles: FeedVideo[];
}): void {
  feedSnapshot = {
    videos: input.videos,
    countryCode: input.countryCode,
    recContext: cloneRecContext(input.recContext),
    activeBubbles: input.activeBubbles,
    fetchedAt: Date.now(),
  };
}

export function invalidateHomeFeedCache(): void {
  feedSnapshot = null;
}

export function isHomeFeedCacheFresh(
  ttlMs: number = HOME_FEED_CACHE_TTL_MS,
): boolean {
  return readHomeFeedCache(ttlMs) !== null;
}

export function readHomeShellCache(
  ttlMs: number = HOME_FEED_CACHE_TTL_MS,
): HomeShellSnapshot | null {
  if (!shellSnapshot) return null;
  if (Date.now() - shellSnapshot.fetchedAt > ttlMs) return null;
  return { ...shellSnapshot };
}

export function writeHomeShellCache(assignedSeconds: number | null): void {
  shellSnapshot = {
    assignedSeconds,
    fetchedAt: Date.now(),
  };
}

export function invalidateHomeShellCache(): void {
  shellSnapshot = null;
}

export function readUnreadNotificationCache(
  ttlMs: number = HOME_FEED_CACHE_TTL_MS,
): number | null {
  if (!unreadNotifSnapshot) return null;
  if (Date.now() - unreadNotifSnapshot.fetchedAt > ttlMs) return null;
  return unreadNotifSnapshot.count;
}

export function writeUnreadNotificationCache(count: number): void {
  unreadNotifSnapshot = { count, fetchedAt: Date.now() };
}

export function invalidateUnreadNotificationCache(): void {
  unreadNotifSnapshot = null;
}

export function readCrownCelebrationCache<T>(
  ttlMs: number = HOME_FEED_CACHE_TTL_MS,
): { pending: T | null } | null {
  if (!crownSnapshot) return null;
  if (Date.now() - crownSnapshot.fetchedAt > ttlMs) return null;
  return { pending: crownSnapshot.pending as T | null };
}

export function writeCrownCelebrationCache(pending: unknown): void {
  crownSnapshot = { pending, fetchedAt: Date.now() };
}

export function invalidateCrownCelebrationCache(): void {
  crownSnapshot = null;
}

/** Keep bubble layout in sync when leaving home within the TTL window. */
export function patchHomeFeedActiveBubbles(activeBubbles: FeedVideo[]): void {
  if (!feedSnapshot) return;
  feedSnapshot = { ...feedSnapshot, activeBubbles };
}

/** Drop all home-related short caches (e.g. after posting). */
export function invalidateHomeCaches(): void {
  invalidateHomeFeedCache();
  invalidateHomeShellCache();
  invalidateUnreadNotificationCache();
  invalidateCrownCelebrationCache();
}
