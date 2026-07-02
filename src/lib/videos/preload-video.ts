/**
 * Warm a video URL into the HTTP cache before the fullscreen player mounts,
 * so tap → playback feels instant. Uses <link rel="preload" as="video"> only,
 * so no extra HTMLVideoElement/decoder is created (keeps the iPhone 13 memory
 * budget: still one decoder during playback).
 */
const warmedUrls = new Set<string>();

export function warmVideoUrl(url?: string | null): void {
  if (!url || typeof document === "undefined") return;
  if (warmedUrls.has(url)) return;
  warmedUrls.add(url);

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
}
