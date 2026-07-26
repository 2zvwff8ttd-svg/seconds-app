/**
 * Tiny in-memory per-user rate limit for serverless AI routes.
 * Not shared across instances — still blocks casual abuse on a warm isolate.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function consumeRateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const existing = buckets.get(options.key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(options.key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    return { ok: true };
  }
  if (existing.count >= options.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { ok: true };
}

/** Approx max chars for ~1.5MB binary as base64. */
export const MAX_AI_IMAGE_BASE64_CHARS = 2_100_000;
