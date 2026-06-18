import type { CSSProperties } from "react";

export type VideoDisplayMaskShape = "circle";

export const DEFAULT_VIDEO_DISPLAY_MASK: VideoDisplayMaskShape = "circle";

export type VideoDisplayMaskDefinition = {
  /** BEM modifier class suffix, e.g. `circle` → `fullscreen-video-mask--circle` */
  modifier: VideoDisplayMaskShape;
  /** CSS clip-path for the media viewport */
  clipPath: string;
  /** Matches clip-path for overflow clipping fallback */
  borderRadius: string;
};

const MASK_DEFINITIONS: Record<
  VideoDisplayMaskShape,
  VideoDisplayMaskDefinition
> = {
  circle: {
    modifier: "circle",
    clipPath: "circle(50% at 50% 50%)",
    borderRadius: "50%",
  },
};

export function getVideoDisplayMask(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): VideoDisplayMaskDefinition {
  return MASK_DEFINITIONS[shape];
}

/** Shared circle diameter for record hole, bubble body, and fullscreen mask. */
export const RECORD_MASK_VW_RATIO = 0.64;
export const RECORD_MASK_MAX_DIAMETER_PX = 300;
export const RECORD_VIEWPORT_HOLE_DIAMETER = `min(${RECORD_MASK_VW_RATIO * 100}vw, ${RECORD_MASK_MAX_DIAMETER_PX}px)`;

/** Hole center on the viewport (fixed overlay). */
export const RECORD_MASK_CENTER_Y_RATIO = 0.36;
export const RECORD_VIEWPORT_HOLE_CENTER_X = "50%";
export const RECORD_VIEWPORT_HOLE_CENTER_Y = `${RECORD_MASK_CENTER_Y_RATIO * 100}%`;

export type RecordViewportMaskMetrics = {
  shape: VideoDisplayMaskShape;
  centerX: string;
  centerY: string;
  diameterCss: string;
  radiusCss: string;
  rimBorderRadius: string;
};

export function getRecordViewportMaskMetrics(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): RecordViewportMaskMetrics {
  const display = getVideoDisplayMask(shape);
  return {
    shape,
    centerX: RECORD_VIEWPORT_HOLE_CENTER_X,
    centerY: RECORD_VIEWPORT_HOLE_CENTER_Y,
    diameterCss: RECORD_VIEWPORT_HOLE_DIAMETER,
    radiusCss: `calc(${RECORD_VIEWPORT_HOLE_DIAMETER} / 2)`,
    rimBorderRadius: display.borderRadius,
  };
}

/**
 * Fixed overlay that dims the viewport except a circular hole.
 * Camera (native, fullscreen behind WebView) shows through the transparent hole.
 */
export function getRecordViewportOverlayStyle(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): CSSProperties {
  const metrics = getRecordViewportMaskMetrics(shape);
  const gradient = `radial-gradient(circle at ${metrics.centerX} ${metrics.centerY}, transparent ${metrics.radiusCss}, black ${metrics.radiusCss})`;

  return {
    WebkitMaskImage: gradient,
    maskImage: gradient,
  };
}

/** CSS custom properties for record mask layout (used by overlay + rim). */
export function getRecordViewportMaskCssVars(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): Record<string, string> {
  const metrics = getRecordViewportMaskMetrics(shape);
  return {
    "--record-mask-center-x": metrics.centerX,
    "--record-mask-center-y": metrics.centerY,
    "--record-mask-hole-diameter": metrics.diameterCss,
    "--record-mask-hole-radius": metrics.radiusCss,
    "--record-mask-rim-radius": metrics.rimBorderRadius,
    "--video-display-mask-clip": getVideoDisplayMask(shape).clipPath,
    "--video-display-mask-radius": getVideoDisplayMask(shape).borderRadius,
  };
}
