import type { NativePreviewRect } from "@/lib/recording/native-camera-preview";
import {
  RECORD_MASK_CENTER_Y_RATIO,
  RECORD_MASK_MAX_DIAMETER_PX,
  RECORD_MASK_VW_RATIO,
} from "@/lib/video/display-mask";

function getVisualViewportMetrics() {
  const viewport = window.visualViewport;
  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
    offsetX: viewport?.offsetLeft ?? 0,
    offsetY: viewport?.offsetTop ?? 0,
  };
}

/** Circle diameter in CSS px — keep in sync with display-mask.ts / globals.css. */
export function measureRecordHoleDiameterPx(viewportWidth: number): number {
  return Math.round(
    Math.min(viewportWidth * RECORD_MASK_VW_RATIO, RECORD_MASK_MAX_DIAMETER_PX),
  );
}

/**
 * Native preview in a square matching the circular mask (not fullscreen).
 * Avoids portrait stretch/crop zoom from filling the entire screen.
 */
export function getRecordNativePreviewRect(): NativePreviewRect {
  const { width, height, offsetX, offsetY } = getVisualViewportMetrics();
  const diameter = Math.max(measureRecordHoleDiameterPx(width), 1);
  const centerX = width * 0.5;
  const centerY = height * RECORD_MASK_CENTER_Y_RATIO;

  return {
    x: Math.round(offsetX + centerX - diameter / 2),
    y: Math.round(offsetY + centerY - diameter / 2),
    width: diameter,
    height: diameter,
  };
}
