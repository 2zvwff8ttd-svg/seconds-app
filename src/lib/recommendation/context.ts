import { createClient } from "@/lib/supabase/client";
import { SIGNAL_WEIGHT } from "@/lib/recommendation/constants";
import type {
  SessionPreference,
  UserRecommendationContext,
  WatchOutcome,
} from "@/types/recommendation";

function addCreatorScore(
  scores: Record<string, number>,
  creatorId: string,
  delta: number,
) {
  if (!creatorId) return;
  scores[creatorId] = (scores[creatorId] ?? 0) + delta;
}

function videoCreator(
  row: { videos?: { user_id: string } | { user_id: string }[] | null },
): string | null {
  const v = row.videos;
  if (!v) return null;
  if (Array.isArray(v)) return v[0]?.user_id ?? null;
  return v.user_id ?? null;
}

export function emptyRecommendationContext(): UserRecommendationContext {
  return {
    isNewUser: true,
    creatorScores: {},
    engagedVideoIds: new Set(),
  };
}

export function mergeRecommendationContext(
  server: UserRecommendationContext,
  session: SessionPreference,
): UserRecommendationContext {
  const creatorScores = { ...server.creatorScores };
  for (const [creatorId, score] of Object.entries(session.creatorScores)) {
    creatorScores[creatorId] = (creatorScores[creatorId] ?? 0) + score;
  }
  const engagedVideoIds = new Set(server.engagedVideoIds);
  for (const id of session.engagedVideoIds) engagedVideoIds.add(id);

  const hasSignals =
    Object.keys(creatorScores).length > 0 || engagedVideoIds.size > 0;

  return {
    isNewUser: server.isNewUser && !hasSignals,
    creatorScores,
    engagedVideoIds,
  };
}

export async function fetchUserRecommendationContext(): Promise<UserRecommendationContext> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return emptyRecommendationContext();

  const creatorScores: Record<string, number> = {};
  const engagedVideoIds = new Set<string>();
  let signalCount = 0;

  const [likesRes, commentsRes, engagementsRes] = await Promise.all([
    supabase
      .from("likes")
      .select("video_id, videos!video_id(user_id)")
      .eq("user_id", user.id),
    supabase
      .from("comments")
      .select("video_id, videos!video_id(user_id)")
      .eq("user_id", user.id),
    supabase
      .from("video_engagements")
      .select("video_id, watch_outcome, videos!video_id(user_id)")
      .eq("user_id", user.id),
  ]);

  if (!likesRes.error) {
    for (const row of likesRes.data ?? []) {
      engagedVideoIds.add(row.video_id);
      const creator = videoCreator(row);
      if (creator) {
        addCreatorScore(creatorScores, creator, SIGNAL_WEIGHT.like);
        signalCount += 1;
      }
    }
  }

  if (!commentsRes.error) {
    for (const row of commentsRes.data ?? []) {
      engagedVideoIds.add(row.video_id);
      const creator = videoCreator(row);
      if (creator) {
        addCreatorScore(creatorScores, creator, SIGNAL_WEIGHT.comment);
        signalCount += 1;
      }
    }
  }

  if (!engagementsRes.error) {
    for (const row of engagementsRes.data ?? []) {
      engagedVideoIds.add(row.video_id);
      const creator = videoCreator(row);
      const outcome = row.watch_outcome as WatchOutcome | null;
      if (creator && outcome === "completed") {
        addCreatorScore(creatorScores, creator, SIGNAL_WEIGHT.completed);
        signalCount += 1;
      } else if (creator && outcome === "partial") {
        addCreatorScore(creatorScores, creator, SIGNAL_WEIGHT.partial);
        signalCount += 1;
      }
    }
  }

  return {
    isNewUser: signalCount === 0,
    creatorScores,
    engagedVideoIds,
  };
}
