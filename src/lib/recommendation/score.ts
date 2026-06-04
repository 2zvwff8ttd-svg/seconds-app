import { BUBBLE_SLOT_COUNT } from "@/lib/bubble-session";
import { PENALTY, SIGNAL_WEIGHT } from "@/lib/recommendation/constants";
import type { FeedVideo } from "@/types/feed";
import type {
  SessionPreference,
  UserRecommendationContext,
  WatchReport,
} from "@/types/recommendation";

function recencyMs(publishedAt?: string): number {
  if (!publishedAt) return 0;
  const t = new Date(publishedAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function applySessionWatchSignal(
  session: SessionPreference,
  video: FeedVideo,
  report: WatchReport,
): void {
  session.engagedVideoIds.add(video.id);
  const weight = report.completed
    ? SIGNAL_WEIGHT.completed
    : SIGNAL_WEIGHT.partial;
  session.creatorScores[video.creatorId] =
    (session.creatorScores[video.creatorId] ?? 0) + weight;
}

export function applySessionLikeSignal(
  session: SessionPreference,
  video: FeedVideo,
): void {
  session.engagedVideoIds.add(video.id);
  session.creatorScores[video.creatorId] =
    (session.creatorScores[video.creatorId] ?? 0) + SIGNAL_WEIGHT.like;
}

export function applySessionCommentSignal(
  session: SessionPreference,
  video: FeedVideo,
): void {
  session.engagedVideoIds.add(video.id);
  session.creatorScores[video.creatorId] =
    (session.creatorScores[video.creatorId] ?? 0) + SIGNAL_WEIGHT.comment;
}

export function createEmptySessionPreference(): SessionPreference {
  return { creatorScores: {}, engagedVideoIds: new Set() };
}

function scoreVideo(
  video: FeedVideo,
  ctx: UserRecommendationContext,
  sessionWatchedIds: ReadonlySet<string>,
): number {
  if (ctx.isNewUser) {
    let score = recencyMs(video.publishedAt);
    if (sessionWatchedIds.has(video.id)) score -= PENALTY.sessionWatched;
    if (ctx.engagedVideoIds.has(video.id)) score -= PENALTY.historyEngaged;
    return score;
  }

  let score = ctx.creatorScores[video.creatorId] ?? 0;
  score += recencyMs(video.publishedAt) * 0.000001;

  if (sessionWatchedIds.has(video.id)) score -= PENALTY.sessionWatched;
  if (ctx.engagedVideoIds.has(video.id)) score -= PENALTY.historyEngaged;

  return score;
}

/** レコメンド順でシャボン玉スロットを選ぶ（viral を先頭に） */
export function pickRecommendedBubbleVideos(
  pool: FeedVideo[],
  ctx: UserRecommendationContext,
  options: {
    excludeIds?: ReadonlySet<string>;
    sessionWatchedIds?: ReadonlySet<string>;
    count?: number;
  } = {},
): FeedVideo[] {
  const count = options.count ?? BUBBLE_SLOT_COUNT;
  const excludeIds = options.excludeIds ?? new Set<string>();
  const sessionWatchedIds = options.sessionWatchedIds ?? new Set<string>();

  const ranked = [...pool].sort(
    (a, b) =>
      scoreVideo(b, ctx, sessionWatchedIds) - scoreVideo(a, ctx, sessionWatchedIds),
  );

  const slots: FeedVideo[] = [];
  const used = new Set<string>();

  const tryAdd = (list: FeedVideo[]) => {
    for (const v of list) {
      if (slots.length >= count) break;
      if (used.has(v.id)) continue;
      slots.push(v);
      used.add(v.id);
    }
  };

  tryAdd(ranked.filter((v) => !excludeIds.has(v.id)));
  if (slots.length < count) tryAdd(ranked);

  const viral = slots.find((v) => v.isViralTop) ?? ranked.find((v) => v.isViralTop);
  if (viral && slots[0]?.id !== viral.id) {
    const rest = slots.filter((v) => v.id !== viral.id);
    return [viral, ...rest].slice(0, count);
  }

  return slots.slice(0, count);
}
