import { createClient } from "@/lib/supabase/client";

export const DEFAULT_VIDEO_RETENTION_DAYS = 10;

export type VideoRetentionConfig = {
  policyStartJst: string;
  retentionDays: number;
  expiryEnabled: boolean;
};

let cachedConfig: VideoRetentionConfig | null = null;
let configPromise: Promise<VideoRetentionConfig> | null = null;

function parseRetentionConfig(raw: unknown): VideoRetentionConfig {
  const cfg = (raw ?? {}) as Record<string, unknown>;
  return {
    policyStartJst: String(cfg.policy_start_jst ?? ""),
    retentionDays: Number(cfg.retention_days ?? DEFAULT_VIDEO_RETENTION_DAYS),
    expiryEnabled: Boolean(cfg.expiry_enabled),
  };
}

export async function fetchVideoRetentionConfig(): Promise<VideoRetentionConfig> {
  if (cachedConfig) return cachedConfig;
  if (!configPromise) {
    configPromise = (async () => {
      try {
        const { data, error } = await createClient().rpc(
          "get_video_retention_config",
        );
        if (error) throw new Error(error.message);
        cachedConfig = parseRetentionConfig(data);
        return cachedConfig;
      } catch {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const policyStartJst = tomorrow.toLocaleDateString("en-CA", {
          timeZone: "Asia/Tokyo",
        });
        cachedConfig = {
          policyStartJst,
          retentionDays: DEFAULT_VIDEO_RETENTION_DAYS,
          expiryEnabled: false,
        };
        return cachedConfig;
      }
    })();
  }
  return configPromise;
}

function policyGraceExpiry(config: VideoRetentionConfig): Date {
  const start = new Date(`${config.policyStartJst}T00:00:00+09:00`);
  return new Date(
    start.getTime() + config.retentionDays * 24 * 60 * 60 * 1000,
  );
}

/** Matches DB video_retention_expires_at (greatest of publish+days and policy+days). */
export function computeVideoRetentionExpiry(
  config: VideoRetentionConfig,
  options: {
    publishedAt?: string | null;
    publishAt?: string | null;
  },
): Date | null {
  const anchor = options.publishedAt ?? options.publishAt;
  if (!anchor) return null;

  const publishedExpiry = new Date(anchor);
  publishedExpiry.setTime(
    publishedExpiry.getTime() + config.retentionDays * 24 * 60 * 60 * 1000,
  );

  return new Date(
    Math.max(publishedExpiry.getTime(), policyGraceExpiry(config).getTime()),
  );
}

export function retentionRemainingDays(expiresAt: Date, now = new Date()): number {
  const ms = expiresAt.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function formatRetentionExpiryDateJst(expiresAt: Date): string {
  return expiresAt.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
  });
}

export function formatVideoRetentionNote(
  expiresAt: Date,
  now = new Date(),
): string {
  const remaining = retentionRemainingDays(expiresAt, now);
  if (remaining <= 0) {
    return "まもなく消えます（公開から10日）";
  }
  if (remaining === 1) {
    return "あと1日で消えます（公開から10日）";
  }
  return `あと${remaining}日で消えます（公開から10日）`;
}
