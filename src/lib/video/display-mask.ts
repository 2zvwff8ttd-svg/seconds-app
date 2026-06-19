import type { CSSProperties } from "react";

/** Phase 1 shapes; extend in Phase 2 (heart, diamond, clover). */
export type VideoDisplayMaskShape = "circle" | "star" | "square";

export const DEFAULT_VIDEO_DISPLAY_MASK: VideoDisplayMaskShape = "circle";

export const MASK_SHAPE_ORDER: VideoDisplayMaskShape[] = [
  "circle",
  "star",
  "square",
];

const PHASE1_SHAPES = new Set<string>(MASK_SHAPE_ORDER);

export function isVideoDisplayMaskShape(
  value: unknown,
): value is VideoDisplayMaskShape {
  return typeof value === "string" && PHASE1_SHAPES.has(value);
}

export function parseVideoDisplayMaskShape(
  value: unknown,
): VideoDisplayMaskShape {
  return isVideoDisplayMaskShape(value) ? value : DEFAULT_VIDEO_DISPLAY_MASK;
}

/** Star clip-path in 100×100 box (center ≈50,50). */
const STAR_CLIP_PATH =
  "path(evenodd, 'M 50 5 L 61 35 L 93 35 L 68 57 L 79 88 L 50 71 L 21 88 L 32 57 L 7 35 L 39 35 Z')";

export type VideoDisplayMaskDefinition = {
  id: VideoDisplayMaskShape;
  label: string;
  modifier: VideoDisplayMaskShape;
  clipPath: string;
  borderRadius: string;
  recordScrimMask: string;
  recordRimClipPath: string;
  pickerIconPath: string;
};

function recordScrimEvenoddMask(holeSubpath: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path fill="#fff" fill-rule="evenodd" d="M0 0 H100 V100 H0 Z ${holeSubpath}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** iOS WebView: radial-gradient mask (transparent hole, opaque scrim outside). */
function recordCircleScrimMask(): string {
  return `radial-gradient(circle at ${RECORD_VIEWPORT_HOLE_CENTER_X} ${RECORD_VIEWPORT_HOLE_CENTER_Y}, transparent var(--record-mask-hole-radius), #000 var(--record-mask-hole-radius))`;
}

/** Counter-clockwise star cutout (center ≈50,36) for evenodd SVG masks. */
const RECORD_SCRIM_HOLE_STAR =
  "M 50 8 L 56.27 25.66 L 74.64 25.66 L 60.05 37.15 L 66.46 54.85 L 50 46.05 L 33.54 54.85 L 39.95 37.15 L 25.36 25.66 L 43.73 25.66 Z";

const RECORD_SCRIM_HOLE_SQUARE = "M 22 8 V 64 H 78 V 8 H 22 Z";

const MASK_DEFINITIONS: Record<
  VideoDisplayMaskShape,
  VideoDisplayMaskDefinition
> = {
  circle: {
    id: "circle",
    label: "丸",
    modifier: "circle",
    clipPath: "circle(50% at 50% 50%)",
    borderRadius: "50%",
    recordScrimMask: recordCircleScrimMask(),
    recordRimClipPath: "circle(50% at 50% 50%)",
    pickerIconPath: "M 50 8 A 42 42 0 1 1 49.99 8 Z",
  },
  star: {
    id: "star",
    label: "星",
    modifier: "star",
    clipPath: STAR_CLIP_PATH,
    borderRadius: "0",
    recordScrimMask: recordScrimEvenoddMask(RECORD_SCRIM_HOLE_STAR),
    recordRimClipPath: STAR_CLIP_PATH,
    pickerIconPath:
      "M 0 -1 L 0.224 -0.309 L 0.951 -0.309 L 0.363 0.118 L 0.588 0.809 L 0 0.382 L -0.588 0.809 L -0.363 0.118 L -0.951 -0.309 L -0.224 -0.309 Z",
  },
  square: {
    id: "square",
    label: "角丸",
    modifier: "square",
    clipPath: "inset(4% round 14%)",
    borderRadius: "14%",
    recordScrimMask: recordScrimEvenoddMask(RECORD_SCRIM_HOLE_SQUARE),
    recordRimClipPath: "inset(4% round 14%)",
    pickerIconPath: "M 18 18 H 82 V 82 H 18 Z",
  },
};

export function getVideoDisplayMask(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): VideoDisplayMaskDefinition {
  return MASK_DEFINITIONS[shape];
}

export function getVideoDisplayMaskCssVars(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): Record<string, string> {
  const mask = getVideoDisplayMask(shape);
  return {
    "--video-display-mask-clip": mask.clipPath,
    "--video-display-mask-radius": mask.borderRadius,
  };
}

/**
 * iOS bisection STAGE 3: home feed renders circle only (no path()/inset() masks).
 * TEMP hardcoded — revert after test or set NEXT_PUBLIC_FORCE_CIRCLE_HOME_DISPLAY_MASK=0.
 */
export const FORCE_CIRCLE_HOME_DISPLAY_MASK =
  true || process.env.NEXT_PUBLIC_FORCE_CIRCLE_HOME_DISPLAY_MASK === "1";

function shapeForHomeRender(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): VideoDisplayMaskShape {
  return FORCE_CIRCLE_HOME_DISPLAY_MASK ? DEFAULT_VIDEO_DISPLAY_MASK : shape;
}

/** Home bubble + fullscreen mask (respects FORCE_CIRCLE_HOME_DISPLAY_MASK). */
export function getHomeVideoDisplayMask(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): VideoDisplayMaskDefinition {
  return MASK_DEFINITIONS[shapeForHomeRender(shape)];
}

export function getHomeVideoDisplayMaskCssVars(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): Record<string, string> {
  const mask = getHomeVideoDisplayMask(shape);
  return {
    "--video-display-mask-clip": mask.clipPath,
    "--video-display-mask-radius": mask.borderRadius,
  };
}

/** Shared hole diameter for record overlay layout. */
export const RECORD_MASK_VW_RATIO = 0.64;
export const RECORD_MASK_MAX_DIAMETER_PX = 300;
export const RECORD_VIEWPORT_HOLE_DIAMETER = `min(${RECORD_MASK_VW_RATIO * 100}vw, ${RECORD_MASK_MAX_DIAMETER_PX}px)`;

export const RECORD_MASK_CENTER_Y_RATIO = 0.36;
export const RECORD_VIEWPORT_HOLE_CENTER_X = "50%";
export const RECORD_VIEWPORT_HOLE_CENTER_Y = `${RECORD_MASK_CENTER_Y_RATIO * 100}%`;

export type RecordViewportMaskMetrics = {
  shape: VideoDisplayMaskShape;
  centerX: string;
  centerY: string;
  diameterCss: string;
  radiusCss: string;
};

export function getRecordViewportMaskMetrics(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): RecordViewportMaskMetrics {
  return {
    shape,
    centerX: RECORD_VIEWPORT_HOLE_CENTER_X,
    centerY: RECORD_VIEWPORT_HOLE_CENTER_Y,
    diameterCss: RECORD_VIEWPORT_HOLE_DIAMETER,
    radiusCss: `calc(${RECORD_VIEWPORT_HOLE_DIAMETER} / 2)`,
  };
}

/** CSS custom properties for record mask layout (overlay + rim + scrim). */
export function getRecordViewportMaskCssVars(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): Record<string, string> {
  const metrics = getRecordViewportMaskMetrics(shape);
  const mask = getVideoDisplayMask(shape);
  return {
    ...getVideoDisplayMaskCssVars(shape),
    "--record-mask-center-x": metrics.centerX,
    "--record-mask-center-y": metrics.centerY,
    "--record-mask-hole-diameter": metrics.diameterCss,
    "--record-mask-hole-radius": metrics.radiusCss,
    "--record-mask-rim-clip": mask.recordRimClipPath,
  };
}

export function getRecordViewportOverlayStyle(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): CSSProperties {
  return getRecordViewportMaskCssVars(shape) as CSSProperties;
}
