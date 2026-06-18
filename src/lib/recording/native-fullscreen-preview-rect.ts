import type { NativePreviewRect } from "@/lib/recording/native-camera-preview";

/**
 * Fullscreen native camera preview — no DOM alignment.
 * Camera fills the viewport behind the WebView; the circular hole overlay defines the visible frame.
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
