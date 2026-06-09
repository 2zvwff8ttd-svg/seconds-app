"use client";

import { useCallback, useRef, useState } from "react";
import type { BubblePlacement } from "@/lib/bubble-layout";
import { resolveBubbleThumbnailUrl } from "@/lib/videos/bubble-thumbnail";
import { CrownIcon } from "./CrownIcon";
import { BurstEffect } from "./BurstEffect";

/** シャボン玉表示用（動画 URL は含めない） */
export type BubbleVideoPreview = {
  id: string;
  title: string;
  creatorName: string;
  thumbnailUrl?: string;
  isViralTop?: boolean;
};

type VideoBubbleProps = {
  video: BubbleVideoPreview;
  placement: BubblePlacement;
  floatStyle: React.CSSProperties;
  isBursting: boolean;
  onSelect: () => void;
  zIndex: number;
};

/** 7層のガラスオーバーレイ（球体シェード・影・玉虫色・ハイライト・リム） */
function BubbleGlassLayers() {
  return (
    <span className="bubble-glass" aria-hidden>
      <span className="bubble-glass__sphere" />
      <span className="bubble-glass__shadow" />
      <span className="bubble-glass__iris-conic" />
      <span className="bubble-glass__iris-edge" />
      <span className="bubble-glass__highlight" />
      <span className="bubble-glass__highlight-spec" />
      <span className="bubble-glass__rim" />
    </span>
  );
}

type DecorativeMiniBubbleProps = {
  size: number;
  isViral: boolean;
  style: React.CSSProperties;
};

/** 大きいシャボン玉に付く装飾用の小さな泡（中身なし・CSS のみ） */
function DecorativeMiniBubble({ size, isViral, style }: DecorativeMiniBubbleProps) {
  return (
    <span
      className="pointer-events-none absolute"
      style={{ width: size, height: size, ...style }}
      aria-hidden
    >
      <span
        className={`bubble-3d-mini bubble-shimmer ${
          isViral ? "bubble-3d-mini--viral" : ""
        }`}
      >
        <span className="bubble-3d-mini__body">
          <BubbleGlassLayers />
        </span>
      </span>
    </span>
  );
}

export function VideoBubble({
  video,
  placement,
  floatStyle,
  isBursting,
  onSelect,
  zIndex,
}: VideoBubbleProps) {
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const [isPressed, setIsPressed] = useState(false);
  const diameter = placement.radius * 2;
  const isViral = video.isViralTop ?? false;
  const thumbnailSrc = resolveBubbleThumbnailUrl(video.thumbnailUrl);
  const miniPad = Math.round(diameter * 0.14);
  const outerSize = diameter + miniPad * 2;
  const miniSizeLarge = Math.round(diameter * 0.28);
  const miniSizeSmall = Math.round(diameter * 0.22);

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
        left: placement.x - placement.radius - miniPad,
        top: placement.y - placement.radius - miniPad,
        width: outerSize,
        height: outerSize,
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
        className="group absolute overflow-visible touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 rounded-full"
        style={{
          left: miniPad,
          top: miniPad,
          width: diameter,
          height: diameter,
          transform: isPressed ? "scale(1.12)" : undefined,
          transition: "transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <span
          className={`bubble-3d bubble-shimmer ${
            isViral ? "bubble-3d--viral" : ""
          }`}
        >
          <span className="bubble-3d__body">
            {thumbnailSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnailSrc}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center bg-surface text-[10px] text-muted">
                No thumb
              </span>
            )}
            <BubbleGlassLayers />
          </span>
        </span>

        <DecorativeMiniBubble
          isViral={isViral ?? false}
          size={miniSizeLarge}
          style={{
            right: -miniSizeLarge * 0.38,
            top: diameter * 0.1,
          }}
        />
        <DecorativeMiniBubble
          isViral={isViral ?? false}
          size={miniSizeSmall}
          style={{
            left: -miniSizeSmall * 0.42,
            bottom: diameter * 0.14,
          }}
        />

        {isViral && (
          <span className="crown-glow absolute -top-1 left-1/2 z-10 -translate-x-1/2 text-gold">
            <CrownIcon className="h-7 w-7 drop-shadow-lg sm:h-6 sm:w-6" />
          </span>
        )}

        {isBursting && <BurstEffect size={diameter} />}
      </button>
    </div>
  );
}
