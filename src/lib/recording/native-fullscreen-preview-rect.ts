import { computeRecordHoleRect, readRecordViewportMetrics } from "@/lib/video/display-mask";
import type { NativePreviewRect } from "@/lib/recording/native-camera-preview";

/**
 * Native preview rect aligned to the Web record-hole box (all mask shapes).
 * Uses the same viewport math as RecordMaskOverlay scrim + rim.
 */
export function getRecordHoleNativePreviewRect(): NativePreviewRect {
  const hole = computeRecordHoleRect(readRecordViewportMetrics());

  return {
    x: Math.round(hole.x),
    y: Math.round(hole.y),
    width: Math.round(Math.max(hole.width, 1)),
    height: Math.round(Math.max(hole.height, 1)),
  };
}

/** @deprecated Use getRecordHoleNativePreviewRect — kept for grep/reference only. */
export function getFullscreenNativePreviewRect(): NativePreviewRect {
  return getRecordHoleNativePreviewRect();
}
