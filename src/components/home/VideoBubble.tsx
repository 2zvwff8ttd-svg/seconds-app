"use client";

import { useCallback, useRef, useState } from "react";
import {
  BUBBLE_MINI_PAD_RATIO,
  type BubblePlacement,
  type DecorativeMiniSides,
} from "@/lib/bubble-layout";
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
  decorativeMiniSides: DecorativeMiniSides;
  floatStyle: React.CSSProperties;
  isBursting: boolean;
  onSelect: () => void;
  zIndex: number;
};

/** 7層のガラスオーバーレイ（球体シェード・影・玉虫色・ハイライト・リム） */
function BubbleGlassLayers({ edgeOnly = false }: { edgeOnly?: boolean }) {
  return (
    <span
      className={`bubble-glass${edgeOnly ? " bubble-glass--thumb" : ""}`}
      aria-hidden
    >
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
  side: "left" | "right";
  vertical: "top" | "bottom";
  mainDiameter: number;
};

/** 大きいシャボン玉に付く装飾用の小さな泡（中身なし・CSS のみ） */
function DecorativeMiniBubble({
  size,
  isViral,
  side,
  vertical,
  mainDiameter,
}: DecorativeMiniBubbleProps) {
  const offset = Math.round(size * (side === "right" ? 0.28 : 0.32));
  const style: React.CSSProperties = {
    width: size,
    height: size,
    ...(side === "right" ? { right: -offset } : { left: -offset }),
    ...(vertical === "top"
      ? { top: Math.round(mainDiameter * 0.1) }
      : { bottom: Math.round(mainDiameter * 0.14) }),
  };

  return (
    <span
      className="pointer-events-none absolute"
      style={style}
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
  decorativeMiniSides,
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
  const miniPad = Math.round(diameter * BUBBLE_MINI_PAD_RATIO);
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
            isViral ? "bubble-3d--viral bubble-3d--viral-hero" : ""
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
            <BubbleGlassLayers edgeOnly />
          </span>
        </span>

        <DecorativeMiniBubble
          isViral={isViral}
          size={miniSizeLarge}
          side={decorativeMiniSides.large}
          vertical="top"
          mainDiameter={diameter}
        />
        <DecorativeMiniBubble
          isViral={isViral}
          size={miniSizeSmall}
          side={decorativeMiniSides.small}
          vertical="bottom"
          mainDiameter={diameter}
        />

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
