"use client";

import { useCallback, useRef, useState } from "react";
import type { BubbleGlassStyle } from "@/lib/bubble-glass-vars";
import type { BubblePlacement } from "@/lib/bubble-layout";
import { resolveBubbleThumbnailUrl } from "@/lib/videos/bubble-thumbnail";
import { BubbleThumbnailSlideshow } from "./BubbleThumbnailSlideshow";
import { CrownIcon } from "./CrownIcon";
import { BurstEffect } from "./BurstEffect";

/** シャボン玉表示用（動画 URL は含めない） */
export type BubbleVideoPreview = {
  id: string;
  title: string;
  creatorName: string;
  thumbnailUrl?: string;
  clipThumbnailUrls?: string[];
  isViralTop?: boolean;
};

type VideoBubbleProps = {
  video: BubbleVideoPreview;
  placement: BubblePlacement;
  floatStyle: React.CSSProperties;
  glassStyle: BubbleGlassStyle;
  isBursting: boolean;
  onSelect: () => void;
  zIndex: number;
};

/** 球体シェード・屈折・大気感・ハイライト（縁寄り） */
function BubbleGlassLayers({ edgeOnly = false }: { edgeOnly?: boolean }) {
  return (
    <span
      className={`bubble-glass${edgeOnly ? " bubble-glass--thumb" : ""}`}
      aria-hidden
    >
      <span className="bubble-glass__atmosphere" />
      <span className="bubble-glass__sphere" />
      <span className="bubble-glass__refraction-bottom" />
      <span className="bubble-glass__shadow" />
      <span className="bubble-glass__iris-conic" />
      <span className="bubble-glass__iris-edge" />
      <span className="bubble-glass__highlight" />
      <span className="bubble-glass__highlight-spec" />
      <span className="bubble-glass__edge-soft" />
      <span className="bubble-glass__rim" />
    </span>
  );
}

export function VideoBubble({
  video,
  placement,
  floatStyle,
  glassStyle,
  isBursting,
  onSelect,
  zIndex,
}: VideoBubbleProps) {
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const [isPressed, setIsPressed] = useState(false);
  const diameter = placement.radius * 2;
  const isViral = video.isViralTop ?? false;
  const slideshowUrls =
    video.clipThumbnailUrls && video.clipThumbnailUrls.length > 1
      ? video.clipThumbnailUrls
      : null;
  const thumbnailSrc = slideshowUrls
    ? null
    : resolveBubbleThumbnailUrl(video.thumbnailUrl);

  const handleClick = useCallback(() => {
    if (isBursting) return;
    setIsPressed(true);
    setTimeout(() => {
      onSelect();
      setIsPressed(false);
    }, 380);
  }, [isBursting, onSelect]);

  return (
    <div
      className="bubble-float pointer-events-auto absolute"
      style={{
        left: placement.x - placement.radius,
        top: placement.y - placement.radius,
        width: diameter,
        height: diameter,
        zIndex,
        ...floatStyle,
      }}
    >
      <button
        ref={bubbleRef}
        type="button"
        aria-label={`${video.title} by ${video.creatorName}`}
        onClick={handleClick}
        disabled={isBursting}
        className="group relative h-full w-full overflow-visible touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 rounded-full"
        style={{
          transform: isPressed ? "scale(1.12)" : undefined,
          transition: "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <span
          className={`bubble-3d ${
            isViral ? "bubble-3d--viral bubble-3d--viral-hero" : ""
          }`}
          style={glassStyle}
        >
          <span className="bubble-3d__body">
            {slideshowUrls ? (
              <BubbleThumbnailSlideshow urls={slideshowUrls} />
            ) : thumbnailSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnailSrc}
                alt=""
                className="bubble-3d__thumb h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-surface text-[10px] text-muted">
                No thumb
              </span>
            )}
            <BubbleGlassLayers edgeOnly />
          </span>
        </span>

        {isViral && (
          <span
            className="crown-glow crown-glow--hero absolute left-1/2 z-20 -translate-x-1/2 text-gold"
            style={{ top: -Math.round(diameter * 0.14) }}
          >
            <CrownIcon className="h-9 w-9 drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)] sm:h-10 sm:w-10" />
          </span>
        )}

        {isBursting && <BurstEffect size={diameter} />}
      </button>
    </div>
  );
}
