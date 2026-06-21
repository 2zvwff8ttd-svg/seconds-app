"use client";

import {
  DEFAULT_VIDEO_DISPLAY_MASK,
  buildRecordSquareHoleRect,
  buildRecordStarHolePolygonPoints,
  getRecordViewportMaskCssVars,
  getVideoDisplayMask,
  type RecordHoleRect,
  type VideoDisplayMaskShape,
} from "@/lib/video/display-mask";
import {
  useEffect,
  useId,
  useState,
  type CSSProperties,
} from "react";

const HOLE_SPACER_SELECTOR = ".record-camera-layout-spacer__hole";

type RecordMaskOverlayProps = {
  shape?: VideoDisplayMaskShape;
  cameraReady?: boolean;
};

function readHoleRect(): RecordHoleRect | null {
  const el = document.querySelector(HOLE_SPACER_SELECTOR);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

function useRecordHoleRect(): RecordHoleRect | null {
  const [holeRect, setHoleRect] = useState<RecordHoleRect | null>(null);

  useEffect(() => {
    const measure = () => {
      setHoleRect(readHoleRect());
    };

    measure();

    const spacer = document.querySelector(HOLE_SPACER_SELECTOR);
    const resizeObserver =
      typeof ResizeObserver !== "undefined" && spacer
        ? new ResizeObserver(measure)
        : null;
    resizeObserver?.observe(spacer as Element);

    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
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
 * WKWebView 26 ignores CSS mask-image on data-URL SVGs; an inline SVG mask
 * with a luminance hole matches the working circle radial-gradient scrim.
 */
function RecordSvgScrim({ shape, holeRect, maskId }: RecordSvgScrimProps) {
  const viewportWidth =
    typeof window !== "undefined" ? window.innerWidth : holeRect.width;
  const viewportHeight =
    typeof window !== "undefined" ? window.innerHeight : holeRect.height;

  return (
    <svg
      className="record-mask-overlay__scrim-svg"
      width={viewportWidth}
      height={viewportHeight}
      viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
      aria-hidden
    >
      <defs>
        <mask
          id={maskId}
          maskUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={viewportWidth}
          height={viewportHeight}
        >
          <rect
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
            <rect
              {...buildRecordSquareHoleRect(holeRect)}
              fill="black"
            />
          )}
        </mask>
      </defs>
      <rect
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
