import type { CSSProperties } from "react";

/**
 * Display mask is circle-only.
 * Legacy DB values (star/heart/square/diamond) normalize to circle on read.
 */
export type VideoDisplayMaskShape = "circle";

export const DEFAULT_VIDEO_DISPLAY_MASK: VideoDisplayMaskShape = "circle";

export const MASK_SHAPE_ORDER: VideoDisplayMaskShape[] = ["circle"];

/** Always true only for "circle" — kept for callers that still type-narrow. */
export function isVideoDisplayMaskShape(
  value: unknown,
): value is VideoDisplayMaskShape {
  return value === "circle";
}

/** Legacy shapes and unknown values all become circle (compat for existing posts). */
export function parseVideoDisplayMaskShape(
  _value?: unknown,
): VideoDisplayMaskShape {
  return DEFAULT_VIDEO_DISPLAY_MASK;
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
    "--display-mask-membrane-bottom-shade-offset-y":
      feather.membraneBottomShadeOffsetY,
    "--display-mask-membrane-bottom-shade-blur": feather.membraneBottomShadeBlur,
    "--display-mask-membrane-outer-glow-color": feather.membraneOuterGlowColor,
    "--display-mask-membrane-outer-glow-blur": feather.membraneOuterGlowBlur,
  };
}

export type VideoDisplayMaskDefinition = {
  id: VideoDisplayMaskShape;
  label: string;
  modifier: VideoDisplayMaskShape;
  visualScale: number;
  bubbleVisualFillRatio?: number;
  bubbleFrameScale?: number;
  clipPath: string;
  borderRadius: string;
  recordRimClipPath: string;
};

const CIRCLE_MASK: VideoDisplayMaskDefinition = {
  id: "circle",
  label: "丸",
  modifier: "circle",
  visualScale: 1,
  bubbleVisualFillRatio: 1,
  clipPath: "circle(50% at 50% 50%)",
  borderRadius: "50%",
  recordRimClipPath: "circle(50% at 50% 50%)",
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
  _shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
  viewport: ViewportMetrics = readRecordViewportMetrics(),
): RecordHoleRect {
  const usableHeight = Math.max(
    180,
    viewport.height -
      RECORD_LAYOUT.bottomDockReservePx -
      RECORD_LAYOUT.topReservePx,
  );

  const baseDiameter = computeBaseHoleDiameter(viewport);
  const scaledDiameter = Math.min(
    baseDiameter * CIRCLE_MASK.visualScale,
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

/** Expand scrim cutout past the nominal hole to hide SVG mask antialiasing fringing. */
export function getRecordHoleMaskBleedPx(
  _shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): number {
  return 6;
}

/** Shrink scrim hole inward while preview is zoomed — hides preview letterbox at the edge. */
export const RECORD_HOLE_ZOOM_MASK_INSET_PX = 3;

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

export function getVideoDisplayMask(
  _shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): VideoDisplayMaskDefinition {
  return CIRCLE_MASK;
}

export function getVideoDisplayMaskCssVars(
  _shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): Record<string, string> {
  return {
    ...getDisplayMaskFeatherCssVars(),
    "--video-display-mask-clip": CIRCLE_MASK.clipPath,
    "--video-display-mask-radius": CIRCLE_MASK.borderRadius,
    "--video-display-mask-visual-scale": String(CIRCLE_MASK.visualScale),
  };
}

/** Home layout frame scale — circle fill ratio is 1 → scale 1. */
export function getBubbleFrameScale(
  _shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): number {
  return 1;
}

export function getRecordViewportMaskCssVars(
  _shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): Record<string, string> {
  return {
    ...getVideoDisplayMaskCssVars(),
    "--record-mask-rim-clip": CIRCLE_MASK.recordRimClipPath,
    "--record-mask-visual-scale": String(CIRCLE_MASK.visualScale),
  };
}

export function getRecordViewportOverlayStyle(
  _shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): CSSProperties {
  return getRecordViewportMaskCssVars() as CSSProperties;
}
