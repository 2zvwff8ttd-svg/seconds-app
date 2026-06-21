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

/** Shared hole diameter for record overlay layout (must be before lazy mask build). */
export const RECORD_MASK_VW_RATIO = 0.64;
export const RECORD_MASK_MAX_DIAMETER_PX = 300;
export const RECORD_VIEWPORT_HOLE_DIAMETER = `min(${RECORD_MASK_VW_RATIO * 100}vw, ${RECORD_MASK_MAX_DIAMETER_PX}px)`;

export const RECORD_MASK_CENTER_Y_RATIO = 0.36;
export const RECORD_VIEWPORT_HOLE_CENTER_X = "50%";
export const RECORD_VIEWPORT_HOLE_CENTER_Y = `${RECORD_MASK_CENTER_Y_RATIO * 100}%`;

/**
 * iOS-safe clip paths (no path(evenodd) / inset(round) — Safari 26 WebView).
 * Star: polygon(). Square: inset + border-radius (not inset(round)).
 */
const STAR_CLIP_PATH =
  "polygon(50% 5%, 61% 35%, 93% 35%, 68% 57%, 79% 88%, 50% 71%, 21% 88%, 32% 57%, 7% 35%, 39% 35%)";

const SQUARE_CLIP_PATH = "inset(4%)";
const SQUARE_BORDER_RADIUS = "14%";

/** Star hole in 0–100 box (matches clip-path polygon proportions). */
export const RECORD_SCRIM_STAR_POINTS =
  "50,8 56.27,25.66 74.64,25.66 60.05,37.15 66.46,54.85 50,46.05 33.54,54.85 39.95,37.15 25.36,25.66 43.73,25.66";

/** Square hole inset (matches clip-path inset(4%) + border-radius 14%). */
export const RECORD_SCRIM_SQUARE_INSET_RATIO = 0.04;
export const RECORD_SCRIM_SQUARE_CORNER_RADIUS_RATIO = 0.14;

export type RecordHoleRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Map normalized star points into viewport px within the measured hole rect. */
export function buildRecordStarHolePolygonPoints(rect: RecordHoleRect): string {
  return RECORD_SCRIM_STAR_POINTS.split(" ")
    .map((pair) => {
      const [px, py] = pair.split(",").map(Number);
      const x = rect.x + (px / 100) * rect.width;
      const y = rect.y + (py / 100) * rect.height;
      return `${x},${y}`;
    })
    .join(" ");
}

/** Rounded-rect hole for square mask (inset + corner radius). */
export function buildRecordSquareHoleRect(rect: RecordHoleRect): RecordHoleRect & {
  rx: number;
  ry: number;
} {
  const inset = RECORD_SCRIM_SQUARE_INSET_RATIO;
  const innerWidth = rect.width * (1 - inset * 2);
  const innerHeight = rect.height * (1 - inset * 2);
  return {
    x: rect.x + rect.width * inset,
    y: rect.y + rect.height * inset,
    width: innerWidth,
    height: innerHeight,
    rx: rect.width * RECORD_SCRIM_SQUARE_CORNER_RADIUS_RATIO,
    ry: rect.height * RECORD_SCRIM_SQUARE_CORNER_RADIUS_RATIO,
  };
}

function buildRecordCircleScrimMask(): string {
  return `radial-gradient(circle at ${RECORD_VIEWPORT_HOLE_CENTER_X} ${RECORD_VIEWPORT_HOLE_CENTER_Y}, transparent var(--record-mask-hole-radius), #000 var(--record-mask-hole-radius))`;
}

function buildMaskDefinitions(): Record<
  VideoDisplayMaskShape,
  VideoDisplayMaskDefinition
> {
  return {
    circle: {
      id: "circle",
      label: "丸",
      modifier: "circle",
      clipPath: "circle(50% at 50% 50%)",
      borderRadius: "50%",
      recordScrimMask: buildRecordCircleScrimMask(),
      recordRimClipPath: "circle(50% at 50% 50%)",
      pickerIconPath: "M 50 8 A 42 42 0 1 1 49.99 8 Z",
    },
    star: {
      id: "star",
      label: "星",
      modifier: "star",
      clipPath: STAR_CLIP_PATH,
      borderRadius: "0",
      /** Circle uses CSS radial-gradient scrim; star uses inline SVG mask overlay. */
      recordScrimMask: "",
      recordRimClipPath: STAR_CLIP_PATH,
      pickerIconPath:
        "M 0 -1 L 0.224 -0.309 L 0.951 -0.309 L 0.363 0.118 L 0.588 0.809 L 0 0.382 L -0.588 0.809 L -0.363 0.118 L -0.951 -0.309 L -0.224 -0.309 Z",
    },
    square: {
      id: "square",
      label: "角丸",
      modifier: "square",
      clipPath: SQUARE_CLIP_PATH,
      borderRadius: SQUARE_BORDER_RADIUS,
      /** Circle uses CSS radial-gradient scrim; square uses inline SVG mask overlay. */
      recordScrimMask: "",
      recordRimClipPath: SQUARE_CLIP_PATH,
      pickerIconPath: "M 18 18 H 82 V 82 H 18 Z",
    },
  };
}

let maskDefinitionsCache: Record<
  VideoDisplayMaskShape,
  VideoDisplayMaskDefinition
> | null = null;

function getMaskDefinitions(): Record<
  VideoDisplayMaskShape,
  VideoDisplayMaskDefinition
> {
  if (!maskDefinitionsCache) {
    maskDefinitionsCache = buildMaskDefinitions();
  }
  return maskDefinitionsCache;
}

export function getVideoDisplayMask(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): VideoDisplayMaskDefinition {
  return getMaskDefinitions()[shape];
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

/** @internal Test-only: reset lazy cache between unit tests. */
export function resetVideoDisplayMaskCacheForTests(): void {
  maskDefinitionsCache = null;
}
