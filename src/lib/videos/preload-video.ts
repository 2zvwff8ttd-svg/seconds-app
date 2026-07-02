/**
 * Warm a video URL into the HTTP cache before the fullscreen player mounts,
 * so tap → playback feels instant. Uses <link rel="preload" as="video"> only,
 * so no extra HTMLVideoElement/decoder is created (keeps the iPhone 13 memory
 * budget: still one decoder during playback).
 *
 * IMPORTANT (memory): a <link rel="preload" as="video"> holds the fetched bytes
 * in memory until it is removed. If left in the <head> forever, opening many
 * different videos accumulates megabytes that are never freed (a leak that gets
 * worse the more you browse). So every preload link is:
 *   - deduped per URL,
 *   - auto-expired after PRELOAD_TTL_MS,
 *   - and can be released explicitly once the real <video> has taken over.
 */
const PRELOAD_TTL_MS = 15_000;

type PreloadEntry = {
  link: HTMLLinkElement;
  timer: number;
};

const preloads = new Map<string, PreloadEntry>();

function removeEntry(url: string): void {
  const entry = preloads.get(url);
  if (!entry) return;
  preloads.delete(url);
  window.clearTimeout(entry.timer);
  entry.link.remove();
}

export function warmVideoUrl(url?: string | null): void {
  if (!url || typeof document === "undefined") return;

  // Already warming — just refresh the expiry so it survives until the tap.
  const existing = preloads.get(url);
  if (existing) {
    window.clearTimeout(existing.timer);
    existing.timer = window.setTimeout(() => removeEntry(url), PRELOAD_TTL_MS);
    return;
  }

  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "video";
  link.href = url;
  link.crossOrigin = "anonymous";
  try {
    (link as HTMLLinkElement & { fetchPriority?: string }).fetchPriority =
      "high";
  } catch {
    /* fetchPriority unsupported — ignore */
  }
  document.head.appendChild(link);

  const timer = window.setTimeout(() => removeEntry(url), PRELOAD_TTL_MS);
  preloads.set(url, { link, timer });
}

/**
 * Drop the preload link for a URL. Call this once the fullscreen <video> has
 * taken ownership of the source, so the browser can release the duplicate
 * preload buffer instead of holding it forever.
 */
export function releaseVideoUrl(url?: string | null): void {
  if (!url || typeof document === "undefined") return;
  removeEntry(url);
}

/** Diagnostics: how many preload links are currently held in memory. */
export function getPreloadLinkCount(): number {
  return preloads.size;
}
