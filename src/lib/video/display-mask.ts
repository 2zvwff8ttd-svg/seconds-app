import type { CSSProperties } from "react";

/** Display mask shapes — add definitions in buildMaskDefinitions(). */
export type VideoDisplayMaskShape =
  | "circle"
  | "star"
  | "square"
  | "heart"
  | "diamond";

export const DEFAULT_VIDEO_DISPLAY_MASK: VideoDisplayMaskShape = "circle";

export const MASK_SHAPE_ORDER: VideoDisplayMaskShape[] = [
  "circle",
  "star",
  "square",
  "heart",
  "diamond",
];

const VALID_MASK_SHAPES = new Set<string>(MASK_SHAPE_ORDER);

export function isVideoDisplayMaskShape(
  value: unknown,
): value is VideoDisplayMaskShape {
  return typeof value === "string" && VALID_MASK_SHAPES.has(value);
}

export function parseVideoDisplayMaskShape(
  value: unknown,
): VideoDisplayMaskShape {
  return isVideoDisplayMaskShape(value) ? value : DEFAULT_VIDEO_DISPLAY_MASK;
}

/**
 * Record stage layout — tune numbers here; hole, rim, scrim, and dock read these.
 * Native camera stays fullscreen; only the Web scrim punches the hole.
 */
export const RECORD_LAYOUT = {
  /** Hole width as fraction of viewport width */
  holeWidthRatio: 0.96,
  /** Hole height cap as fraction of usable vertical space */
  holeHeightRatio: 0.86,
  /** Horizontal center (0.5 = middle) */
  centerXRatio: 0.5,
  /** Vertical center — slightly above middle (lower = higher on screen) */
  centerYRatio: 0.42,
  /** Space reserved below hole for dock + bottom nav (px, used in hole sizing) */
  bottomDockReservePx: 232,
  /** Bottom tab nav height clearance — dock sits above this (px, excl. safe-area) */
  bottomNavClearancePx: 88,
  /** Space reserved above hole for header + gauge (px) */
  topReservePx: 76,
  /** Flip button inset from safe top / right (px) */
  flipInsetTopPx: 8,
  flipInsetRightPx: 12,
  /** Extra gap between dock and bottom nav (px, above safe-area) */
  dockBottomInsetPx: 12,
} as const;

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

/** SVG <clipPath> id — defs live in DisplayMaskClipDefs (objectBoundingBox, scales with element). */
export const DISPLAY_MASK_HEART_CLIP_ID = "seconds-display-mask-heart";

/**
 * Emoji-style heart (❤️): two round upper lobes, top cleft, bottom tip.
 * 0–100 design space — shared by record scrim SVG and picker icon.
 */
export const HEART_MASK_PATH_D =
  "M 50 92 C 50 92 8 60 8 34 C 8 14 24 4 50 22 C 76 4 92 14 92 34 C 92 60 50 92 50 92 Z";

/** Same heart normalized to objectBoundingBox (0–1) for responsive clip-path. */
export const HEART_MASK_PATH_OBJECT_BOUNDING_BOX_D =
  "M 0.5 0.92 C 0.5 0.92 0.08 0.60 0.08 0.34 C 0.08 0.14 0.24 0.04 0.5 0.22 C 0.76 0.04 0.92 0.14 0.92 0.34 C 0.92 0.60 0.5 0.92 0.5 0.92 Z";

const HEART_CLIP_PATH = `url(#${DISPLAY_MASK_HEART_CLIP_ID})`;

/** @deprecated Use HEART_MASK_PATH_D */
export const HEART_RECORD_PATH_D = HEART_MASK_PATH_D;

/** Diamond (rhombus) — four corners inset slightly from the square viewport. */
const DIAMOND_POLYGON_PERCENT_POINTS: ReadonlyArray<readonly [number, number]> = [
  [50, 5],
  [95, 50],
  [50, 95],
  [5, 50],
];

const DIAMOND_CLIP_PATH = `polygon(${DIAMOND_POLYGON_PERCENT_POINTS.map(([x, y]) => `${x}% ${y}%`).join(", ")})`;

const SQUARE_CLIP_PATH = "inset(4%)";
const SQUARE_BORDER_RADIUS = "14%";

export const RECORD_SCRIM_SQUARE_INSET_RATIO = 0.04;
export const RECORD_SCRIM_SQUARE_CORNER_RADIUS_RATIO = 0.14;

/**
 * Shape-agnostic feather + membrane tokens.
 * Feather/bloom: outer dissolve into background.
 * Membrane: thin clip-path-following ring (inset strokes + soft band).
 */
export const DISPLAY_MASK_FEATHER = {
  tint: "rgba(30, 18, 55, 0.18)",
  blur: "6px",
  opacity: "0.55",
  insetExpand: "-4%",
  blendMode: "multiply",
  thumbOpacity: "0.94",
  bloom1Blur: "6px",
  bloom1Color: "rgba(100, 80, 150, 0.22)",
  bloom2Blur: "14px",
  bloom2Color: "rgba(55, 35, 95, 0.14)",
  bloom3Blur: "24px",
  bloom3Color: "rgba(30, 18, 55, 0.08)",
  membraneLine1Color: "rgba(255, 255, 255, 0.42)",
  membraneLine1Width: "1.5px",
  membraneLine2Color: "rgba(140, 120, 200, 0.18)",
  membraneLine2Width: "2.5px",
  membraneBandColor: "rgba(100, 80, 150, 0.12)",
  membraneBandBlur: "12px",
  membraneBandSpread: "4px",
  membraneFilterBlur: "1.5px",
  membraneBottomShadeColor: "rgba(15, 10, 35, 0.32)",
  membraneBottomShadeOffsetY: "10px",
  membraneBottomShadeBlur: "18px",
  membraneOuterGlowColor: "rgba(120, 90, 180, 0.12)",
  membraneOuterGlowBlur: "12px",
} as const;

export type DisplayMaskFeatherTokens = typeof DISPLAY_MASK_FEATHER;

export function getDisplayMaskFeatherCssVars(): Record<string, string> {
  const feather = DISPLAY_MASK_FEATHER;
  const bloomFilter = [
    `drop-shadow(0 0 ${feather.bloom1Blur} ${feather.bloom1Color})`,
    `drop-shadow(0 0 ${feather.bloom2Blur} ${feather.bloom2Color})`,
    `drop-shadow(0 0 ${feather.bloom3Blur} ${feather.bloom3Color})`,
  ].join(" ");
  return {
    "--display-mask-feather-tint": feather.tint,
    "--display-mask-feather-blur": feather.blur,
    "--display-mask-feather-opacity": feather.opacity,
    "--display-mask-feather-inset-expand": feather.insetExpand,
    "--display-mask-feather-blend-mode": feather.blendMode,
    "--display-mask-feather-thumb-opacity": feather.thumbOpacity,
    "--display-mask-feather-bloom-filter": bloomFilter,
    "--display-mask-membrane-line-1-color": feather.membraneLine1Color,
    "--display-mask-membrane-line-1-width": feather.membraneLine1Width,
    "--display-mask-membrane-line-2-color": feather.membraneLine2Color,
    "--display-mask-membrane-line-2-width": feather.membraneLine2Width,
    "--display-mask-membrane-band-color": feather.membraneBandColor,
    "--display-mask-membrane-band-blur": feather.membraneBandBlur,
    "--display-mask-membrane-band-spread": feather.membraneBandSpread,
    "--display-mask-membrane-filter-blur": feather.membraneFilterBlur,
    "--display-mask-membrane-bottom-shade-color": feather.membraneBottomShadeColor,
    "--display-mask-membrane-bottom-shade-offset-y": feather.membraneBottomShadeOffsetY,
    "--display-mask-membrane-bottom-shade-blur": feather.membraneBottomShadeBlur,
    "--display-mask-membrane-outer-glow-color": feather.membraneOuterGlowColor,
    "--display-mask-membrane-outer-glow-blur": feather.membraneOuterGlowBlur,
  };
}

export type VideoDisplayMaskDefinition = {
  id: VideoDisplayMaskShape;
  label: string;
  modifier: VideoDisplayMaskShape;
  /** Perceived-size multiplier (star < circle fill → scale up record hole). */
  visualScale: number;
  /** Home bubble outer frame scale (star needs a larger square viewport). */
  bubbleFrameScale?: number;
  clipPath: string;
  borderRadius: string;
  recordRimClipPath: string;
  pickerIconPath: string;
};

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

function computeBaseHoleDiameter(viewport: ViewportMetrics): number {
  const usableHeight = Math.max(
    180,
    viewport.height -
      RECORD_LAYOUT.bottomDockReservePx -
      RECORD_LAYOUT.topReservePx,
  );

  return Math.min(
    viewport.width * RECORD_LAYOUT.holeWidthRatio,
    usableHeight * RECORD_LAYOUT.holeHeightRatio,
  );
}

/**
 * Viewport-fixed hole box for scrim + rim (native preview stays fullscreen).
 */
export function computeRecordHoleRect(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
  viewport: ViewportMetrics = readRecordViewportMetrics(),
): RecordHoleRect {
  const mask = getVideoDisplayMask(shape);
  const usableHeight = Math.max(
    180,
    viewport.height -
      RECORD_LAYOUT.bottomDockReservePx -
      RECORD_LAYOUT.topReservePx,
  );

  const baseDiameter = computeBaseHoleDiameter(viewport);
  const scaledDiameter = Math.min(
    baseDiameter * mask.visualScale,
    viewport.width * 0.98,
    usableHeight * 0.98,
  );

  const radius = scaledDiameter / 2;
  const centerX = viewport.width * RECORD_LAYOUT.centerXRatio;
  const centerY = viewport.height * RECORD_LAYOUT.centerYRatio;

  return {
    x: centerX - radius,
    y: centerY - radius,
    width: scaledDiameter,
    height: scaledDiameter,
  };
}

export function buildRecordStarHolePolygonPoints(rect: RecordHoleRect): string {
  return buildRecordPolygonHolePoints(rect, STAR_POLYGON_PERCENT_POINTS);
}

/** Sub-pixel expansion for record scrim luminance-mask antialiasing. */
const HOLE_MASK_BLEED_PX = 1;

export function buildRecordHeartHolePathProps(rect: RecordHoleRect): {
  d: string;
  transform: string;
} {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const bleedScale = 1 + (HOLE_MASK_BLEED_PX * 2) / rect.width;
  const scaleX = (rect.width / 100) * bleedScale;
  const scaleY = (rect.height / 100) * bleedScale;
  return {
    d: HEART_MASK_PATH_D,
    transform: `translate(${cx} ${cy}) scale(${scaleX} ${scaleY}) translate(-50 -50)`,
  };
}

export function buildRecordDiamondHolePolygonPoints(rect: RecordHoleRect): string {
  return buildRecordPolygonHolePoints(rect, DIAMOND_POLYGON_PERCENT_POINTS);
}

function buildRecordPolygonHolePoints(
  rect: RecordHoleRect,
  percentPoints: ReadonlyArray<readonly [number, number]>,
): string {
  return percentPoints
    .map(([px, py]) => {
      const x = rect.x + (px / 100) * rect.width;
      const y = rect.y + (py / 100) * rect.height;
      return `${x},${y}`;
    })
    .join(" ");
}

export function buildRecordCircleHoleAttrs(rect: RecordHoleRect): {
  cx: number;
  cy: number;
  r: number;
} {
  return {
    cx: rect.x + rect.width / 2,
    cy: rect.y + rect.height / 2,
    r: rect.width / 2,
  };
}

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

/** Scroll reserve so the record stage clears the fixed hole + dock. */
export function computeRecordStageMinHeight(
  viewport: ViewportMetrics = readRecordViewportMetrics(),
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): number {
  const hole = computeRecordHoleRect(shape, viewport);
  return (
    viewport.offsetY +
    hole.y +
    hole.height +
    RECORD_LAYOUT.bottomDockReservePx
  );
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
      visualScale: 1,
      clipPath: "circle(50% at 50% 50%)",
      borderRadius: "50%",
      recordRimClipPath: "circle(50% at 50% 50%)",
      pickerIconPath: "M 50 8 A 42 42 0 1 1 49.99 8 Z",
    },
    star: {
      id: "star",
      label: "星",
      modifier: "star",
      visualScale: 1.55,
      bubbleFrameScale: 1.55,
      clipPath: STAR_CLIP_PATH,
      borderRadius: "0",
      recordRimClipPath: STAR_CLIP_PATH,
      pickerIconPath:
        "M 0 -1 L 0.224 -0.309 L 0.951 -0.309 L 0.363 0.118 L 0.588 0.809 L 0 0.382 L -0.588 0.809 L -0.363 0.118 L -0.951 -0.309 L -0.224 -0.309 Z",
    },
    square: {
      id: "square",
      label: "角丸",
      modifier: "square",
      visualScale: 1,
      clipPath: SQUARE_CLIP_PATH,
      borderRadius: SQUARE_BORDER_RADIUS,
      recordRimClipPath: SQUARE_CLIP_PATH,
      pickerIconPath: "M 18 18 H 82 V 82 H 18 Z",
    },
    heart: {
      id: "heart",
      label: "ハート",
      modifier: "heart",
      visualScale: 1.5,
      bubbleFrameScale: 1.5,
      clipPath: HEART_CLIP_PATH,
      borderRadius: "0",
      recordRimClipPath: HEART_CLIP_PATH,
      pickerIconPath: HEART_MASK_PATH_D,
    },
    diamond: {
      id: "diamond",
      label: "菱形",
      modifier: "diamond",
      visualScale: 1.4,
      bubbleFrameScale: 1.4,
      clipPath: DIAMOND_CLIP_PATH,
      borderRadius: "0",
      recordRimClipPath: DIAMOND_CLIP_PATH,
      pickerIconPath: "M 50 12 L 84 50 L 50 88 L 16 50 Z",
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
    ...getDisplayMaskFeatherCssVars(),
    "--video-display-mask-clip": mask.clipPath,
    "--video-display-mask-radius": mask.borderRadius,
    "--video-display-mask-visual-scale": String(mask.visualScale),
  };
}

/** Multiplier for home bubble width/height (placement.radius). Star > 1 enlarges the frame. */
export function getBubbleFrameScale(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): number {
  const mask = getVideoDisplayMask(shape);
  return mask.bubbleFrameScale ?? 1;
}

export function getRecordViewportMaskCssVars(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): Record<string, string> {
  const mask = getVideoDisplayMask(shape);
  return {
    ...getVideoDisplayMaskCssVars(shape),
    "--record-mask-rim-clip": mask.recordRimClipPath,
    "--record-mask-visual-scale": String(mask.visualScale),
  };
}

export function getRecordViewportOverlayStyle(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): CSSProperties {
  return getRecordViewportMaskCssVars(shape) as CSSProperties;
}
