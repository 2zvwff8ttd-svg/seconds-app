export type PushNotificationType =
  | "morning_digest"
  | "like"
  | "comment"
  | "follow"
  | "mention"
  | "crown";

export type PushWindowConfig = {
  /** Wait this long after the oldest pending event before flushing */
  windowMs: number;
  /** Minimum gap between pushes for the same bucket */
  bucketCooldownMs: number;
  /** Bypass global recipient cooldown */
  bypassGlobalCooldown: boolean;
};

export const PUSH_WINDOW_CONFIG: Record<
  Exclude<PushNotificationType, "morning_digest">,
  PushWindowConfig
> = {
  like: {
    windowMs: 30 * 60 * 1000,
    bucketCooldownMs: 30 * 60 * 1000,
    bypassGlobalCooldown: false,
  },
  comment: {
    windowMs: 15 * 60 * 1000,
    bucketCooldownMs: 15 * 60 * 1000,
    bypassGlobalCooldown: false,
  },
  follow: {
    windowMs: 60 * 60 * 1000,
    bucketCooldownMs: 60 * 60 * 1000,
    bypassGlobalCooldown: false,
  },
  mention: {
    windowMs: 30 * 1000,
    bucketCooldownMs: 5 * 60 * 1000,
    bypassGlobalCooldown: true,
  },
  crown: {
    windowMs: 0,
    bucketCooldownMs: 0,
    bypassGlobalCooldown: true,
  },
};

/** Minimum gap between any two pushes to the same user (except mention/crown). */
export const GLOBAL_PUSH_COOLDOWN_MS = 2 * 60 * 1000;

export type PushAlertCopy = {
  title: string;
  body: string;
};

export function resolveActorLabel(
  displayName: string | null | undefined,
  username: string | null | undefined,
): string {
  const fromDisplay = displayName?.trim();
  if (fromDisplay) return fromDisplay;
  const fromUsername = username?.trim();
  if (fromUsername) return fromUsername;
  return "だれか";
}

export function buildAggregatedPushCopy(
  pushType: Exclude<PushNotificationType, "morning_digest">,
  primaryActorLabel: string,
  actorCount: number,
): PushAlertCopy {
  const others = Math.max(0, actorCount - 1);

  switch (pushType) {
    case "like":
      return {
        title: "いいね",
        body:
          others > 0
            ? `${primaryActorLabel}さん他${others}人がいいねしました`
            : `${primaryActorLabel}さんがいいねしました`,
      };
    case "comment":
      return {
        title: "コメント",
        body:
          others > 0
            ? `${primaryActorLabel}さん他${others}人がコメントしました`
            : `${primaryActorLabel}さんがコメントしました`,
      };
    case "follow":
      return {
        title: "フォロー",
        body:
          others > 0
            ? `${primaryActorLabel}さん他${others}人がフォローしました`
            : `${primaryActorLabel}さんがフォローしました`,
      };
    case "mention":
      return {
        title: "メンション",
        body: `${primaryActorLabel}さんがあなたに言及しました`,
      };
    case "crown":
      return {
        title: "?Seconds",
        body: "昨日の1位になりました🎉 おめでとう",
      };
    default:
      return { title: "?Seconds", body: "新しいお知らせがあります" };
  }
}
