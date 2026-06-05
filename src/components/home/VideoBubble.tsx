"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedVideo } from "@/types/feed";
import type { BubblePlacement } from "@/lib/bubble-layout";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { CrownIcon } from "./CrownIcon";
import { BurstEffect } from "./BurstEffect";

type VideoBubbleProps = {
  video: FeedVideo;
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPressed, setIsPressed] = useState(false);
  const diameter = placement.radius * 2;
  const isViral = video.isViralTop;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    el.playsInline = true;
    el.loop = true;
    el.preload = "auto";

    const play = () => {
      el.play().catch(() => {});
    };
    play();
    el.addEventListener("canplay", play);
    return () => el.removeEventListener("canplay", play);
  }, [video.videoUrl]);

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
          <video
            ref={videoRef}
            src={video.videoUrl}
            poster={video.thumbnailUrl}
            className="h-full w-full object-cover"
            muted
            playsInline
            loop
            preload="auto"
          />
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

      <span className="pointer-events-none absolute bottom-1 right-1 rounded-full ring-2 ring-black/60">
        <ProfileAvatar
          username={video.creatorName}
          avatarUrl={video.creatorAvatar}
          size="xs"
        />
      </span>

      {isBursting && <BurstEffect size={diameter} />}
    </button>
    </div>
  );
}
