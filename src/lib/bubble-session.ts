import type { FeedVideo } from "@/types/feed";
import type { UserRecommendationContext } from "@/types/recommendation";
import { pickRecommendedBubbleVideos } from "@/lib/recommendation/score";

export const BUBBLE_SLOT_COUNT = 6;

/** レコメンドに基づきシャボン玉スロットを選ぶ */
export function pickBubbleVideos(
  pool: FeedVideo[],
  ctx: UserRecommendationContext,
  options?: {
    excludeIds?: ReadonlySet<string>;
    sessionWatchedIds?: ReadonlySet<string>;
    count?: number;
  },
): FeedVideo[] {
  return pickRecommendedBubbleVideos(pool, ctx, options);
}
