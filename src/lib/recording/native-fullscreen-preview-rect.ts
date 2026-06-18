import type { NativePreviewRect } from "@/lib/recording/native-camera-preview";

/**
 * Fullscreen native preview — no alignment with the circular CSS mask.
 * Preview uses resizeAspect (iOS patch) so the feed is not zoomed/cropped;
 * the fixed circle overlay defines what the user sees.
 */
export function getFullscreenNativePreviewRect(): NativePreviewRect {
  const viewport = window.visualViewport;
  const width = Math.round(viewport?.width ?? window.innerWidth);
  const height = Math.round(viewport?.height ?? window.innerHeight);

  return {
    x: 0,
    y: 0,
    width: Math.max(width, 1),
    height: Math.max(height, 1),
  };
}
