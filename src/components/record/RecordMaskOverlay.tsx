"use client";

import {
  DEFAULT_VIDEO_DISPLAY_MASK,
  buildRecordCircleHoleAttrs,
  buildRecordSquareHoleRect,
  buildRecordStarHolePolygonPoints,
  computeRecordHoleRect,
  getRecordViewportMaskCssVars,
  readRecordViewportMetrics,
  type RecordHoleRect,
  type VideoDisplayMaskShape,
} from "@/lib/video/display-mask";
import {
  useEffect,
  useId,
  useState,
  type CSSProperties,
} from "react";

type RecordMaskOverlayProps = {
  shape?: VideoDisplayMaskShape;
  cameraReady?: boolean;
};

function useRecordHoleRect(shape: VideoDisplayMaskShape): RecordHoleRect | null {
  const [holeRect, setHoleRect] = useState<RecordHoleRect | null>(null);

  useEffect(() => {
    const measure = () => {
      setHoleRect(computeRecordHoleRect(shape, readRecordViewportMetrics()));
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

  return holeRect;
}

type RecordSvgScrimProps = {
  shape: VideoDisplayMaskShape;
  holeRect: RecordHoleRect;
  maskId: string;
};

/** Inline SVG luminance mask — all shapes (WKWebView-safe). Native camera is fullscreen behind. */
function RecordSvgScrim({ shape, holeRect, maskId }: RecordSvgScrimProps) {
  const viewport = readRecordViewportMetrics();
  const { width, height, offsetX, offsetY } = viewport;

  return (
    <svg
      className="record-mask-overlay__scrim-svg"
      width={width}
      height={height}
      viewBox={`${offsetX} ${offsetY} ${width} ${height}`}
      aria-hidden
    >
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={offsetX}
          y={offsetY}
          width={width}
          height={height}
        >
          <rect x={offsetX} y={offsetY} width={width} height={height} fill="white" />
          {shape === "circle" ? (
            <circle {...buildRecordCircleHoleAttrs(holeRect)} fill="black" />
          ) : shape === "star" ? (
            <polygon
              points={buildRecordStarHolePolygonPoints(holeRect)}
              fill="black"
            />
          ) : (
            <rect {...buildRecordSquareHoleRect(holeRect)} fill="black" />
          )}
        </mask>
      </defs>
      <rect
        x={offsetX}
        y={offsetY}
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
 */
export function RecordMaskOverlay({
  shape = DEFAULT_VIDEO_DISPLAY_MASK,
  cameraReady = false,
}: RecordMaskOverlayProps) {
  const layoutVars = getRecordViewportMaskCssVars(shape);
  const holeRect = useRecordHoleRect(shape);
  const maskId = useId().replace(/:/g, "");

  return (
    <div
      className="record-mask-overlay"
      style={layoutVars as CSSProperties}
      aria-hidden
    >
      {holeRect ? (
        <RecordSvgScrim shape={shape} holeRect={holeRect} maskId={maskId} />
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
}
