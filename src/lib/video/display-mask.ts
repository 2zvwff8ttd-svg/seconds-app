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
export const RECORD_MASK_VW_RATIO = 0.78;
export const RECORD_MASK_MAX_DIAMETER_PX = 360;

export const RECORD_MASK_CENTER_Y_RATIO = 0.38;
export const RECORD_VIEWPORT_HOLE_DIAMETER = `min(${RECORD_MASK_VW_RATIO * 100}vw, ${RECORD_MASK_MAX_DIAMETER_PX}px)`;

export const RECORD_VIEWPORT_HOLE_CENTER_X = "50%";
export const RECORD_VIEWPORT_HOLE_CENTER_Y = `${RECORD_MASK_CENTER_Y_RATIO * 100}%`;
/** Spacer margin helper — matches RECORD_MASK_CENTER_Y_RATIO against small viewport height. */
export const RECORD_VIEWPORT_HOLE_CENTER_Y_OFFSET = `${RECORD_MASK_CENTER_Y_RATIO * 100}svh`;

/** Star polygon percentages — shared by clip-path, rim, and scrim hole. */
const STAR_POLYGON_PERCENT_POINTS: ReadonlyArray<readonly [number, number]> = [
  [50, 5],
  [61, 35],
  [93, 35],
  [68, 57],
  [79, 88],
  [50, 71],
  [21, 88],
  [32, 57],
  [7, 35],
  [39, 35],
];

const STAR_CLIP_PATH = `polygon(${STAR_POLYGON_PERCENT_POINTS.map(([x, y]) => `${x}% ${y}%`).join(", ")})`;

const SQUARE_CLIP_PATH = "inset(4%)";
const SQUARE_BORDER_RADIUS = "14%";

/** Square hole inset (matches clip-path inset(4%) + border-radius 14%). */
export const RECORD_SCRIM_SQUARE_INSET_RATIO = 0.04;
export const RECORD_SCRIM_SQUARE_CORNER_RADIUS_RATIO = 0.14;

export type RecordHoleRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ViewportMetrics = {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
};

export function readRecordViewportMetrics(): ViewportMetrics {
  if (typeof window === "undefined") {
    return { width: 0, height: 0, offsetX: 0, offsetY: 0 };
  }

  const viewport = window.visualViewport;
  return {
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
    offsetX: viewport?.offsetLeft ?? 0,
    offsetY: viewport?.offsetTop ?? 0,
  };
}

/**
 * Viewport-fixed hole box — same geometry as circle radial-gradient scrim and native preview.
 */
export function computeRecordHoleRect(
  viewport: ViewportMetrics = readRecordViewportMetrics(),
): RecordHoleRect {
  const diameter = Math.min(
    viewport.width * RECORD_MASK_VW_RATIO,
    RECORD_MASK_MAX_DIAMETER_PX,
  );
  const radius = diameter / 2;
  const centerX = viewport.offsetX + viewport.width * 0.5;
  const centerY = viewport.offsetY + viewport.height * RECORD_MASK_CENTER_Y_RATIO;

  return {
    x: centerX - radius,
    y: centerY - radius,
    width: diameter,
    height: diameter,
  };
}

/** Map star clip-path percentages into viewport px within the hole bounding box. */
export function buildRecordStarHolePolygonPoints(rect: RecordHoleRect): string {
  return STAR_POLYGON_PERCENT_POINTS.map(([px, py]) => {
    const x = rect.x + (px / 100) * rect.width;
    const y = rect.y + (py / 100) * rect.height;
    return `${x},${y}`;
  }).join(" ");
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
    "--record-mask-center-y-offset": RECORD_VIEWPORT_HOLE_CENTER_Y_OFFSET,
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
