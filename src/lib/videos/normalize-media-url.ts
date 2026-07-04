/**
 * Sanitize public media URLs from DB / feed before assigning to <video src>.
 * Strips embedded newlines (seen in some backfill manifests) and rejects invalid values.
 */
export function normalizeMediaPublicUrl(
  url: string | null | undefined,
): string | null {
  if (url == null) return null;
  const cleaned = url.replace(/[\r\n]+/g, "").trim();
  if (!cleaned) return null;
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return cleaned;
  } catch {
    return null;
  }
}
