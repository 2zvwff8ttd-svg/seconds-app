"use client";

import {
  DEFAULT_VIDEO_DISPLAY_MASK,
  buildRecordSquareHoleRect,
  buildRecordStarHolePolygonPoints,
  computeRecordHoleRect,
  getRecordViewportMaskCssVars,
  getVideoDisplayMask,
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

function useRecordHoleRect(): RecordHoleRect | null {
  const [holeRect, setHoleRect] = useState<RecordHoleRect | null>(null);

  useEffect(() => {
    const measure = () => {
      setHoleRect(computeRecordHoleRect(readRecordViewportMetrics()));
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

  return holeRect;
}

type RecordSvgScrimProps = {
  shape: VideoDisplayMaskShape;
  holeRect: RecordHoleRect;
  maskId: string;
};

/**
 * WKWebView 26 ignores CSS mask-image on data-URL SVGs; inline SVG luminance masks
 * use the same viewport hole box as the circle radial-gradient scrim.
 */
function RecordSvgScrim({ shape, holeRect, maskId }: RecordSvgScrimProps) {
  const viewport = readRecordViewportMetrics();
  const viewportWidth = viewport.width;
  const viewportHeight = viewport.height;
  const originX = viewport.offsetX;
  const originY = viewport.offsetY;

  return (
    <svg
      className="record-mask-overlay__scrim-svg"
      width={viewportWidth}
      height={viewportHeight}
      viewBox={`${originX} ${originY} ${viewportWidth} ${viewportHeight}`}
      aria-hidden
    >
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={originX}
          y={originY}
          width={viewportWidth}
          height={viewportHeight}
        >
          <rect
            x={originX}
            y={originY}
            width={viewportWidth}
            height={viewportHeight}
            fill="white"
          />
          {shape === "star" ? (
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
        x={originX}
        y={originY}
        width={viewportWidth}
        height={viewportHeight}
        fill="rgb(10 10 10 / 0.97)"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}

/**
 * Fixed viewport scrim with a shape cutout. Native camera shows through the hole.
 */
export function RecordMaskOverlay({
  shape = DEFAULT_VIDEO_DISPLAY_MASK,
  cameraReady = false,
}: RecordMaskOverlayProps) {
  const layoutVars = getRecordViewportMaskCssVars(shape);
  const scrimMask = getVideoDisplayMask(shape).recordScrimMask;
  const holeRect = useRecordHoleRect();
  const maskId = useId().replace(/:/g, "");

  return (
    <div
      className="record-mask-overlay"
      style={layoutVars as CSSProperties}
      aria-hidden
    >
      {shape === "circle" ? (
        <div
          className="record-mask-overlay__scrim"
          style={
            {
              WebkitMaskImage: scrimMask,
              maskImage: scrimMask,
            } as CSSProperties
          }
        />
      ) : holeRect ? (
        <RecordSvgScrim shape={shape} holeRect={holeRect} maskId={maskId} />
      ) : (
        <div className="record-mask-overlay__scrim record-mask-overlay__scrim--pending" />
      )}
      <div
        className={`record-mask-overlay__rim${cameraReady ? " record-mask-overlay__rim--ready" : ""}`}
      />
    </div>
  );
}
