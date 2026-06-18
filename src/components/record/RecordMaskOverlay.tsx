"use client";

import {
  DEFAULT_VIDEO_DISPLAY_MASK,
  getRecordViewportMaskCssVars,
  type VideoDisplayMaskShape,
} from "@/lib/video/display-mask";
import type { CSSProperties } from "react";

type RecordMaskOverlayProps = {
  shape?: VideoDisplayMaskShape;
  cameraReady?: boolean;
};

/**
 * Fixed viewport scrim with a circular cutout and optional rim.
 * Native camera (fullscreen behind WebView) shows through the hole.
 */
export function RecordMaskOverlay({
  shape = DEFAULT_VIDEO_DISPLAY_MASK,
  cameraReady = false,
}: RecordMaskOverlayProps) {
  const maskVars = getRecordViewportMaskCssVars(shape);

  return (
    <div
      className="record-mask-overlay"
      style={maskVars as CSSProperties}
      aria-hidden
    >
      <div className="record-mask-overlay__scrim" />
      <div
        className={`record-mask-overlay__rim${cameraReady ? " record-mask-overlay__rim--ready" : ""}`}
      />
    </div>
  );
}
