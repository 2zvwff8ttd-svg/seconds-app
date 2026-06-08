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
        className="group relative h-full w-full touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 rounded-full"
        style={{
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
