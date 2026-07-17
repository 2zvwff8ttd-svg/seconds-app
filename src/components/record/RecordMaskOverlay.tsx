"use client";

import {
  DEFAULT_VIDEO_DISPLAY_MASK,
  buildRecordCircleHoleAttrs,
  computeRecordHoleRect,
  getRecordHoleMaskBleedPx,
  RECORD_HOLE_ZOOM_MASK_INSET_PX,
  getRecordViewportMaskCssVars,
  readRecordViewportMetrics,
  type RecordHoleRect,
  type VideoDisplayMaskShape,
  type ViewportMetrics,
} from "@/lib/video/display-mask";
import { useEffect, useId, useState, type CSSProperties } from "react";
import { RecordStagePortal } from "@/components/record/RecordStagePortal";

type RecordMaskOverlayProps = {
  shape?: VideoDisplayMaskShape;
  cameraReady?: boolean;
  /** When true, scrim hole is inset slightly to hide zoom fringe at the edge. */
  previewZoomed?: boolean;
};

function useRecordViewportState(): {
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
            ? computeRecordHoleRect(DEFAULT_VIDEO_DISPLAY_MASK, viewport)
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
  }, []);

  return state;
}

type RecordSvgScrimProps = {
  holeRect: RecordHoleRect;
  maskHoleInsetPx: number;
  maskId: string;
  viewport: ViewportMetrics;
};

/** Inline SVG luminance mask — circle cutout (WKWebView-safe). */
function RecordSvgScrim({
  holeRect,
  maskHoleInsetPx,
  maskId,
  viewport,
}: RecordSvgScrimProps) {
  const { width, height } = viewport;
  const bleedPx = getRecordHoleMaskBleedPx();
  const circleAttrs = buildRecordCircleHoleAttrs(holeRect);
  const circleCutoutR = Math.max(
    circleAttrs.r - 2,
    circleAttrs.r + bleedPx - maskHoleInsetPx,
  );

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
          <circle
            cx={circleAttrs.cx}
            cy={circleAttrs.cy}
            r={circleCutoutR}
            fill="black"
          />
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
 * Fixed viewport scrim with a circle cutout. Native fullscreen camera shows through the hole.
 */
export function RecordMaskOverlay({
  shape: _shape = DEFAULT_VIDEO_DISPLAY_MASK,
  cameraReady = false,
  previewZoomed = false,
}: RecordMaskOverlayProps) {
  const layoutVars = getRecordViewportMaskCssVars();
  const { viewport, holeRect } = useRecordViewportState();
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
      <div className="record-mask-overlay" style={overlayStyle} aria-hidden>
        {holeRect ? (
          <RecordSvgScrim
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
            className={`record-mask-overlay__rim record-mask-overlay__rim--circle${cameraReady ? " record-mask-overlay__rim--ready" : ""}`}
            style={holeRectToRimStyle(holeRect)}
          />
        )}
      </div>
    </RecordStagePortal>
  );
}
