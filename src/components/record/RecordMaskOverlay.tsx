"use client";

import {
  DEFAULT_VIDEO_DISPLAY_MASK,
  buildRecordCircleHoleAttrs,
  buildRecordDiamondHolePolygonPoints,
  buildRecordHeartHolePathProps,
  buildRecordSquareHoleRect,
  buildRecordStarHolePolygonPoints,
  computeRecordHoleRect,
  getRecordHoleMaskBleedPx,
  RECORD_HOLE_ZOOM_MASK_INSET_PX,
  getRecordViewportMaskCssVars,
  readRecordViewportMetrics,
  type RecordHoleRect,
  type VideoDisplayMaskShape,
  type ViewportMetrics,
} from "@/lib/video/display-mask";
import {
  useEffect,
  useId,
  useState,
  type CSSProperties,
} from "react";
import { RecordStagePortal } from "@/components/record/RecordStagePortal";

type RecordMaskOverlayProps = {
  shape?: VideoDisplayMaskShape;
  cameraReady?: boolean;
  /** When true, scrim hole is inset slightly to hide zoom fringe at the edge. */
  previewZoomed?: boolean;
};

function buildScaledPolygonHoleMaskPoints(
  rect: RecordHoleRect,
  basePoints: string,
  scale: number,
): string {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return basePoints
    .split(" ")
    .map((pair) => {
      const [xStr, yStr] = pair.split(",");
      const x = Number(xStr);
      const y = Number(yStr);
      return `${cx + (x - cx) * scale},${cy + (y - cy) * scale}`;
    })
    .join(" ");
}

function buildHoleMaskScale(rect: RecordHoleRect, bleedPx: number, insetPx: number): number {
  return 1 + ((bleedPx - insetPx) * 2) / rect.width;
}

function useRecordViewportState(shape: VideoDisplayMaskShape): {
  viewport: ViewportMetrics;
  holeRect: RecordHoleRect | null;
} {
  const [state, setState] = useState<{
    viewport: ViewportMetrics;
    holeRect: RecordHoleRect | null;
  }>({
    viewport: { width: 0, height: 0, offsetX: 0, offsetY: 0 },
    holeRect: null,
  });

  useEffect(() => {
    const measure = () => {
      const viewport = readRecordViewportMetrics();
      setState({
        viewport,
        holeRect:
          viewport.width > 0 && viewport.height > 0
            ? computeRecordHoleRect(shape, viewport)
            : null,
      });
    };

    measure();

    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    window.addEventListener("orientationchange", measure);

    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [shape]);

  return state;
}

function buildRecordHolePolygonPoints(
  shape: VideoDisplayMaskShape,
  rect: RecordHoleRect,
): string | null {
  switch (shape) {
    case "star":
      return buildRecordStarHolePolygonPoints(rect);
    case "diamond":
      return buildRecordDiamondHolePolygonPoints(rect);
    default:
      return null;
  }
}

type RecordSvgScrimProps = {
  shape: VideoDisplayMaskShape;
  holeRect: RecordHoleRect;
  maskHoleInsetPx: number;
  maskId: string;
  viewport: ViewportMetrics;
};

/** Inline SVG luminance mask — all shapes (WKWebView-safe). Native camera is fullscreen behind. */
function RecordSvgScrim({
  shape,
  holeRect,
  maskHoleInsetPx,
  maskId,
  viewport,
}: RecordSvgScrimProps) {
  const { width, height } = viewport;
  const bleedPx = getRecordHoleMaskBleedPx(shape);
  const holeMaskScale = buildHoleMaskScale(holeRect, bleedPx, maskHoleInsetPx);
  const squareHole = buildRecordSquareHoleRect(holeRect);
  const heartHole =
    shape === "heart" ? buildRecordHeartHolePathProps(holeRect, shape) : null;
  const polygonPoints = buildRecordHolePolygonPoints(shape, holeRect);
  const holePolygonPoints = polygonPoints
    ? buildScaledPolygonHoleMaskPoints(holeRect, polygonPoints, holeMaskScale)
    : null;
  const circleAttrs = buildRecordCircleHoleAttrs(holeRect);
  const circleCutoutR = Math.max(
    circleAttrs.r - 2,
    circleAttrs.r + bleedPx - maskHoleInsetPx,
  );
  const squareInset = bleedPx - maskHoleInsetPx;

  return (
    <svg
      className="record-mask-overlay__scrim-svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={width}
          height={height}
        >
          <rect x={0} y={0} width={width} height={height} fill="white" />
          {shape === "circle" ? (
            <circle
              cx={circleAttrs.cx}
              cy={circleAttrs.cy}
              r={circleCutoutR}
              fill="black"
            />
          ) : heartHole ? (
            <path
              d={heartHole.d}
              transform={`translate(${holeRect.x + holeRect.width / 2} ${holeRect.y + holeRect.height / 2}) scale(${(holeRect.width / 100) * holeMaskScale} ${(holeRect.height / 100) * holeMaskScale}) translate(-50 -50)`}
              fill="black"
            />
          ) : holePolygonPoints ? (
            <polygon points={holePolygonPoints} fill="black" />
          ) : (
            <rect
              x={squareHole.x - squareInset}
              y={squareHole.y - squareInset}
              width={squareHole.width + squareInset * 2}
              height={squareHole.height + squareInset * 2}
              rx={squareHole.rx}
              ry={squareHole.ry}
              fill="black"
            />
          )}
        </mask>
      </defs>
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="rgb(10 10 10 / 0.97)"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}

function holeRectToRimStyle(holeRect: RecordHoleRect): CSSProperties {
  return {
    left: holeRect.x + holeRect.width / 2,
    top: holeRect.y + holeRect.height / 2,
    width: holeRect.width,
    height: holeRect.height,
  };
}

/**
 * Fixed viewport scrim with a shape cutout. Native fullscreen camera shows through the hole.
 * Portaled to document.body (with dock) so WKWebView respects z-index over the shape picker.
 */
export function RecordMaskOverlay({
  shape = DEFAULT_VIDEO_DISPLAY_MASK,
  cameraReady = false,
  previewZoomed = false,
}: RecordMaskOverlayProps) {
  const layoutVars = getRecordViewportMaskCssVars(shape);
  const { viewport, holeRect } = useRecordViewportState(shape);
  const maskId = useId().replace(/:/g, "");
  const maskHoleInsetPx = previewZoomed ? RECORD_HOLE_ZOOM_MASK_INSET_PX : 0;

  const overlayStyle: CSSProperties = {
    ...(layoutVars as CSSProperties),
    top: viewport.offsetY,
    left: viewport.offsetX,
    width: viewport.width,
    height: viewport.height,
  };

  return (
    <RecordStagePortal>
      <div
        className="record-mask-overlay"
        style={overlayStyle}
        aria-hidden
      >
        {holeRect ? (
          <RecordSvgScrim
            shape={shape}
            holeRect={holeRect}
            maskHoleInsetPx={maskHoleInsetPx}
            maskId={maskId}
            viewport={viewport}
          />
        ) : (
          <div className="record-mask-overlay__scrim record-mask-overlay__scrim--pending" />
        )}
        {holeRect && (
          <div
            className={`record-mask-overlay__rim record-mask-overlay__rim--${shape}${cameraReady ? " record-mask-overlay__rim--ready" : ""}`}
            style={holeRectToRimStyle(holeRect)}
          />
        )}
      </div>
    </RecordStagePortal>
  );
}
