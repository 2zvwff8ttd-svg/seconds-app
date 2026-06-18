"use client";

import {
  DEFAULT_VIDEO_DISPLAY_MASK,
  getRecordViewportMaskCssVars,
  getVideoDisplayMask,
  type VideoDisplayMaskShape,
} from "@/lib/video/display-mask";
import type { CSSProperties } from "react";

type RecordMaskOverlayProps = {
  shape?: VideoDisplayMaskShape;
  cameraReady?: boolean;
};

/**
 * Fixed viewport scrim with a shape cutout. Native camera shows through the hole.
 */
export function RecordMaskOverlay({
  shape = DEFAULT_VIDEO_DISPLAY_MASK,
  cameraReady = false,
}: RecordMaskOverlayProps) {
  const layoutVars = getRecordViewportMaskCssVars(shape);
  const scrimMask = getVideoDisplayMask(shape).recordScrimMask;

  return (
    <div
      className="record-mask-overlay"
      style={layoutVars as CSSProperties}
      aria-hidden
    >
      <div
        className="record-mask-overlay__scrim"
        style={
          {
            WebkitMaskImage: scrimMask,
            maskImage: scrimMask,
          } as CSSProperties
        }
      />
      <div
        className={`record-mask-overlay__rim${cameraReady ? " record-mask-overlay__rim--ready" : ""}`}
      />
    </div>
  );
}
