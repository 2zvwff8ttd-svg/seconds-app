export type PushNotificationType =
  | "morning_digest"
  | "like"
  | "comment"
  | "follow"
  | "mention"
  | "crown";

/** Aggregate only when this many+ events land in the same bucket within BURST_WINDOW_MS. */
export const BURST_AGGREGATE_THRESHOLD = 5;

/** "立て続け" window: oldest→newest pending span must be within this to aggregate. */
export const BURST_WINDOW_MS = 5 * 60 * 1000;

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

export function shouldAggregateBurst(
  eventCount: number,
  oldestCreatedAtMs: number,
  newestCreatedAtMs: number,
): boolean {
  if (eventCount < BURST_AGGREGATE_THRESHOLD) return false;
  return newestCreatedAtMs - oldestCreatedAtMs <= BURST_WINDOW_MS;
}
