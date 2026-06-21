import {
  computeRecordHoleRect,
  DEFAULT_VIDEO_DISPLAY_MASK,
  readRecordViewportMetrics,
  type VideoDisplayMaskShape,
} from "@/lib/video/display-mask";
import type { NativePreviewRect } from "@/lib/recording/native-camera-preview";

/**
 * Fullscreen native preview — camera sits behind the WebView; scrim holes reveal it.
 * Hole-sized preview caused letterboxing (black bars) inside the mask on WKWebView.
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

/** Scrim-hole box in viewport px (diagnostics only — native preview uses fullscreen). */
export function getRecordHoleNativePreviewRect(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): NativePreviewRect {
  const viewport = readRecordViewportMetrics();
  const hole = computeRecordHoleRect(shape, viewport);

  return {
    x: Math.round(hole.x + viewport.offsetX),
    y: Math.round(hole.y + viewport.offsetY),
    width: Math.round(Math.max(hole.width, 1)),
    height: Math.round(Math.max(hole.height, 1)),
  };
}
