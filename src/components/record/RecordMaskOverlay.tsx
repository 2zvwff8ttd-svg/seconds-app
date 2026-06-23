"use client";

import {
  DEFAULT_VIDEO_DISPLAY_MASK,
  buildRecordCircleHoleAttrs,
  buildRecordSquareHoleRect,
  buildRecordStarHolePolygonPoints,
  computeRecordClipStripBandRect,
  computeRecordHoleRect,
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
import { createPortal } from "react-dom";

/** Sub-pixel expansion so luminance-mask antialiasing does not leave scrim fringing. */
const HOLE_MASK_BLEED_PX = 1;

type RecordMaskOverlayProps = {
  shape?: VideoDisplayMaskShape;
  cameraReady?: boolean;
};

function useRecordViewportState(shape: VideoDisplayMaskShape): {
  viewport: ViewportMetrics;
  holeRect: RecordHoleRect | null;
  clipBand: { top: number; bottom: number } | null;
} {
  const [state, setState] = useState<{
    viewport: ViewportMetrics;
    holeRect: RecordHoleRect | null;
    clipBand: { top: number; bottom: number } | null;
  }>({
    viewport: { width: 0, height: 0, offsetX: 0, offsetY: 0 },
    holeRect: null,
    clipBand: null,
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
        clipBand:
          viewport.width > 0 && viewport.height > 0
            ? computeRecordClipStripBandRect(viewport, shape)
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

function buildStarHoleMaskPoints(rect: RecordHoleRect): string {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const scale = 1 + (HOLE_MASK_BLEED_PX * 2) / rect.width;
  const base = buildRecordStarHolePolygonPoints(rect);
  return base
    .split(" ")
    .map((pair) => {
      const [xStr, yStr] = pair.split(",");
      const x = Number(xStr);
      const y = Number(yStr);
      return `${cx + (x - cx) * scale},${cy + (y - cy) * scale}`;
    })
    .join(" ");
}

type RecordSvgScrimProps = {
  shape: VideoDisplayMaskShape;
  holeRect: RecordHoleRect;
  clipBand: { top: number; bottom: number } | null;
  maskId: string;
  viewport: ViewportMetrics;
};

/** Inline SVG luminance mask — all shapes (WKWebView-safe). Native camera is fullscreen behind. */
function RecordSvgScrim({
  shape,
  holeRect,
  clipBand,
  maskId,
  viewport,
}: RecordSvgScrimProps) {
  const { width, height } = viewport;
  const squareHole = buildRecordSquareHoleRect(holeRect);
  const clipBandHeight =
    clipBand && clipBand.bottom > clipBand.top
      ? clipBand.bottom - clipBand.top
      : 0;

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
              r={holeRect.width / 2 + HOLE_MASK_BLEED_PX}
              fill="black"
            />
          ) : shape === "star" ? (
            <polygon points={buildStarHoleMaskPoints(holeRect)} fill="black" />
          ) : (
            <rect
              x={squareHole.x - HOLE_MASK_BLEED_PX}
              y={squareHole.y - HOLE_MASK_BLEED_PX}
              width={squareHole.width + HOLE_MASK_BLEED_PX * 2}
              height={squareHole.height + HOLE_MASK_BLEED_PX * 2}
              rx={squareHole.rx}
              ry={squareHole.ry}
              fill="black"
            />
          )}
          {clipBandHeight > 0 && (
            <rect
              x={0}
              y={clipBand!.top}
              width={width}
              height={clipBandHeight}
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
 * Portaled to document.body so z-index stacks with ClipStrip (295) above scrim (100).
 */
export function RecordMaskOverlay({
  shape = DEFAULT_VIDEO_DISPLAY_MASK,
  cameraReady = false,
}: RecordMaskOverlayProps) {
  const layoutVars = getRecordViewportMaskCssVars(shape);
  const { viewport, holeRect, clipBand } = useRecordViewportState(shape);
  const maskId = useId().replace(/:/g, "");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const overlayStyle: CSSProperties = {
    ...(layoutVars as CSSProperties),
    top: viewport.offsetY,
    left: viewport.offsetX,
    width: viewport.width,
    height: viewport.height,
  };

  if (!mounted) return null;

  const overlay = (
    <div
      className="record-mask-overlay"
      style={overlayStyle}
      aria-hidden
    >
      {holeRect ? (
        <RecordSvgScrim
          shape={shape}
          holeRect={holeRect}
          clipBand={clipBand}
          maskId={maskId}
          viewport={viewport}
        />
      ) : (
        <div className="record-mask-overlay__scrim record-mask-overlay__scrim--pending" />
      )}
      {holeRect && (
        <div
          className={`record-mask-overlay__rim${cameraReady ? " record-mask-overlay__rim--ready" : ""}`}
          style={holeRectToRimStyle(holeRect)}
        />
      )}
    </div>
  );

  return createPortal(overlay, document.body);
}
