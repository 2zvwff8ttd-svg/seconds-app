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
  /** Added after pinch-zoom to widen the scrim cutout (base bleed unchanged at 1×). */
  maskBleedExtra?: number;
};

function buildBleedPolygonHoleMaskPoints(
  rect: RecordHoleRect,
  basePoints: string,
  bleedPx: number,
): string {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const scale = 1 + (bleedPx * 2) / rect.width;
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
  maskId: string;
  viewport: ViewportMetrics;
  maskBleedExtra: number;
};

/** Inline SVG luminance mask — all shapes (WKWebView-safe). Native camera is fullscreen behind. */
function RecordSvgScrim({
  shape,
  holeRect,
  maskId,
  viewport,
  maskBleedExtra,
}: RecordSvgScrimProps) {
  const { width, height } = viewport;
  const bleedPx = getRecordHoleMaskBleedPx(shape, maskBleedExtra);
  const squareHole = buildRecordSquareHoleRect(holeRect);
  const heartHole =
    shape === "heart"
      ? buildRecordHeartHolePathProps(holeRect, shape, maskBleedExtra)
      : null;
  const polygonPoints = buildRecordHolePolygonPoints(shape, holeRect);
  const bleedPolygonPoints = polygonPoints
    ? buildBleedPolygonHoleMaskPoints(holeRect, polygonPoints, bleedPx)
    : null;

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
              {...buildRecordCircleHoleAttrs(holeRect)}
              r={holeRect.width / 2 + bleedPx}
              fill="black"
            />
          ) : heartHole ? (
            <path
              d={heartHole.d}
              transform={heartHole.transform}
              fill="black"
            />
          ) : bleedPolygonPoints ? (
            <polygon points={bleedPolygonPoints} fill="black" />
          ) : (
            <rect
              x={squareHole.x - bleedPx}
              y={squareHole.y - bleedPx}
              width={squareHole.width + bleedPx * 2}
              height={squareHole.height + bleedPx * 2}
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
  maskBleedExtra = 0,
}: RecordMaskOverlayProps) {
  const layoutVars = getRecordViewportMaskCssVars(shape);
  const { viewport, holeRect } = useRecordViewportState(shape);
  const maskId = useId().replace(/:/g, "");

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
            maskId={maskId}
            viewport={viewport}
            maskBleedExtra={maskBleedExtra}
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
