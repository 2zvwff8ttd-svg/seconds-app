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

const RECORD_HOLE_SCALE = 28;
const RECORD_HOLE_CENTER_X = 50;
const RECORD_HOLE_CENTER_Y = 36;

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

function recordScrimMaskDataUri(holeMarkup: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><rect width="100" height="100" fill="white"/>${holeMarkup}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function recordHoleTransform(): string {
  return `translate(${RECORD_HOLE_CENTER_X} ${RECORD_HOLE_CENTER_Y}) scale(${RECORD_HOLE_SCALE})`;
}

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
    recordScrimMask: recordScrimMaskDataUri(
      `<ellipse cx="${RECORD_HOLE_CENTER_X}" cy="${RECORD_HOLE_CENTER_Y}" rx="${RECORD_HOLE_SCALE}" ry="${RECORD_HOLE_SCALE}" fill="black"/>`,
    ),
    recordRimClipPath: "circle(50% at 50% 50%)",
    pickerIconPath:
      "M 50 8 A 42 42 0 1 1 49.99 8 Z",
  },
  star: {
    id: "star",
    label: "星",
    modifier: "star",
    clipPath: STAR_CLIP_PATH,
    borderRadius: "0",
    recordScrimMask: recordScrimMaskDataUri(
      `<path fill="black" transform="${recordHoleTransform()}" d="M 0 -1 L 0.224 -0.309 L 0.951 -0.309 L 0.363 0.118 L 0.588 0.809 L 0 0.382 L -0.588 0.809 L -0.363 0.118 L -0.951 -0.309 L -0.224 -0.309 Z"/>`,
    ),
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
    recordScrimMask: recordScrimMaskDataUri(
      `<rect x="${RECORD_HOLE_CENTER_X - RECORD_HOLE_SCALE}" y="${RECORD_HOLE_CENTER_Y - RECORD_HOLE_SCALE}" width="${RECORD_HOLE_SCALE * 2}" height="${RECORD_HOLE_SCALE * 2}" rx="8" ry="8" fill="black"/>`,
    ),
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
    "--record-mask-scrim": mask.recordScrimMask,
    "--record-mask-rim-clip": mask.recordRimClipPath,
  };
}

export function getRecordViewportOverlayStyle(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): CSSProperties {
  return getRecordViewportMaskCssVars(shape) as CSSProperties;
}
