/**
 * Cloudflare Turnstile (Supabase Auth captchaToken).
 * Site key is public; Secret key goes only in Supabase Dashboard (not in this app).
 *
 * When NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, widgets are skipped and auth
 * calls omit captchaToken — works while CAPTCHA is still off in Supabase.
 */

export function getTurnstileSiteKey(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!raw) return undefined;
  const key = raw.replace(/[\r\n]+/g, "").trim();
  return key || undefined;
}

export function isTurnstileConfigured(): boolean {
  return Boolean(getTurnstileSiteKey());
}

/** Map Auth / Turnstile errors to Japanese UX copy. */
export function mapAuthCaptchaError(message: string): string | null {
  const lower = message.toLowerCase();
  if (
    lower.includes("captcha") ||
    lower.includes("turnstile") ||
    lower.includes("challenge")
  ) {
    return "セキュリティ確認に失敗しました。もう一度チェックしてから再試行してください。";
  }
  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("over_request_rate_limit")
  ) {
    return "リクエストが多すぎます。しばらくしてから再試行してください。";
  }
  return null;
}
