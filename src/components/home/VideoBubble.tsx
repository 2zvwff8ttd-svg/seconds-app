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
        className={`block h-full w-full rounded-full p-[1.5px] ${
          isViral
            ? "bg-gradient-to-br from-amber-100/80 via-white/45 to-violet-300/35 shadow-[0_0_10px_rgba(251,191,36,0.2)]"
            : "bg-gradient-to-br from-white/75 via-white/35 to-violet-300/40 shadow-[0_0_10px_rgba(167,139,250,0.22)]"
        }`}
      >
        <span className="relative block h-full w-full overflow-hidden rounded-full bg-gradient-to-br from-white/20 via-violet-100/10 to-violet-400/5">
          <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/40" />
          <span className="absolute inset-0 rounded-full bg-gradient-to-br from-white/30 via-transparent to-transparent opacity-70" />
          <span className="absolute left-[16%] top-[14%] h-[34%] w-[40%] rotate-[-18deg] rounded-full bg-white/50 blur-[1.5px]" />
          <span className="absolute bottom-[18%] right-[20%] h-[18%] w-[22%] rounded-full bg-violet-200/25 blur-[1px]" />
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
  const isViral = video.isViralTop;
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
          className={`bubble-shimmer relative block h-full w-full rounded-full p-[2px] ${
            isViral
              ? "bg-gradient-to-br from-gold/90 via-amber-200/50 to-violet-400/40 shadow-[0_0_32px_var(--gold-glow)]"
              : "bg-gradient-to-br from-white/50 via-white/15 to-violet-300/25 shadow-[0_0_20px_rgba(167,139,250,0.15)]"
          }`}
        >
          <span
            className={`relative block h-full w-full overflow-hidden rounded-full bg-black ${
              isViral ? "ring-1 ring-gold/40" : "ring-1 ring-white/10"
            }`}
          >
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
            <span
              className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/25 via-transparent to-transparent opacity-60"
              aria-hidden
            />
            <span
              className="pointer-events-none absolute -left-[20%] top-[8%] h-[35%] w-[45%] rotate-[-24deg] rounded-full bg-white/20 blur-md"
              aria-hidden
            />
          </span>
        </span>

        <DecorativeMiniBubble
          isViral={isViral}
          size={miniSizeLarge}
          style={{
            right: -miniSizeLarge * 0.38,
            top: diameter * 0.1,
          }}
        />
        <DecorativeMiniBubble
          isViral={isViral}
          size={miniSizeSmall}
          style={{
            left: -miniSizeSmall * 0.42,
            bottom: diameter * 0.14,
          }}
        />

        {isViral && (
          <span className="crown-glow absolute -top-1 left-1/2 -translate-x-1/2 text-gold">
            <CrownIcon className="h-7 w-7 drop-shadow-lg sm:h-6 sm:w-6" />
          </span>
        )}

        {isBursting && <BurstEffect size={diameter} />}
      </button>
    </div>
  );
}
