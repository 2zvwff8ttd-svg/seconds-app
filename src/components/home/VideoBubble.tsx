"use client";

import {
  getVideoDisplayMaskCssVars,
  type VideoDisplayMaskShape,
} from "@/lib/video/display-mask";
import { resolveDisplayName } from "@/lib/profile/display-name";
import { useCallback, useMemo, useRef, type CSSProperties } from "react";
import type { BubbleOriginRect } from "@/lib/home/bubble-origin-rect";
import { getBubbleOriginRect } from "@/lib/home/bubble-origin-rect";
import type { BubblePlacement } from "@/lib/bubble-layout";
import { resolveBubbleDisplayUrls } from "@/lib/videos/bubble-thumbnail";
import { BubbleThumbnailSlideshow } from "./BubbleThumbnailSlideshow";
import { warmVideoUrl } from "@/lib/videos/preload-video";
import { CrownIcon } from "./CrownIcon";

/** シャボン玉表示用（動画 URL は含めない） */
export type BubbleVideoPreview = {
  id: string;
  title: string;
  creatorName: string;
  creatorDisplayName?: string | null;
  thumbnailUrl?: string;
  clipThumbnailUrls?: string[];
  videoUrl?: string;
  isViralTop?: boolean;
  displayMaskShape?: VideoDisplayMaskShape;
};

type VideoBubbleProps = {
  video: BubbleVideoPreview;
  placement: BubblePlacement;
  floatStyle: React.CSSProperties;
  isHidden?: boolean;
  spawnAnimate?: boolean;
  /** Stagger index for bubble-float--spawn delay (--spawn-index) */
  spawnIndex?: number;
  onSelect: (origin: BubbleOriginRect) => void;
  zIndex: number;
};

export function VideoBubble({
  video,
  placement,
  floatStyle,
  isHidden = false,
  spawnAnimate = false,
  spawnIndex = 0,
  onSelect,
  zIndex,
}: VideoBubbleProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const diameter = placement.radius * 2;
  const isViral = video.isViralTop ?? false;
  const displayUrls = useMemo(
    () =>
      resolveBubbleDisplayUrls({
        thumbnailUrl: video.thumbnailUrl,
        clipThumbnailUrls: video.clipThumbnailUrls,
        videoUrl: video.videoUrl,
      }),
    [video.thumbnailUrl, video.clipThumbnailUrls, video.videoUrl],
  );
  const maskStyle = useMemo(
    () => getVideoDisplayMaskCssVars() as CSSProperties,
    [],
  );

  const handleClick = useCallback(() => {
    if (isHidden || !wrapperRef.current) return;
    onSelect(getBubbleOriginRect(wrapperRef.current));
  }, [isHidden, onSelect]);

  // Start fetching the video the moment the finger touches down (before click),
  // so the fullscreen player finds the bytes already warming in the HTTP cache.
  const handlePreload = useCallback(() => {
    if (isHidden) return;
    warmVideoUrl(video.videoUrl);
  }, [isHidden, video.videoUrl]);

  return (
    <div
      ref={wrapperRef}
      className={`bubble-float pointer-events-auto absolute${spawnAnimate ? " bubble-float--spawn" : ""}${isHidden ? " bubble-float--hidden" : ""}`}
      style={
        {
          left: placement.x - placement.radius,
          top: placement.y - placement.radius,
          width: diameter,
          height: diameter,
          zIndex,
          "--spawn-index": spawnIndex,
          ...floatStyle,
        } as CSSProperties
      }
    >
      <button
        type="button"
        aria-label={`${video.title} by ${resolveDisplayName(video.creatorDisplayName, video.creatorName)}`}
        onClick={handleClick}
        onPointerDown={handlePreload}
        disabled={isHidden}
        className="group relative h-full w-full overflow-visible touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/80"
      >
        <span
          className={`bubble-3d-shadow${
            isViral ? " bubble-3d-shadow--viral bubble-3d-shadow--viral-hero" : ""
          }`}
          style={maskStyle}
        >
          <span
            className={`bubble-3d bubble-3d--circle${
              isViral ? " bubble-3d--viral bubble-3d--viral-hero" : ""
            }`}
            style={maskStyle}
          >
            <span className="bubble-3d__body">
              <span className="bubble-3d__media">
                {displayUrls.length > 1 ? (
                  <BubbleThumbnailSlideshow urls={displayUrls} />
                ) : displayUrls.length === 1 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={displayUrls[0]}
                    alt=""
                    className="bubble-3d__thumb h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                ) : (
                  <span className="bubble-3d__placeholder flex h-full w-full items-center justify-center bg-surface text-[10px] text-muted">
                    No thumb
                  </span>
                )}
              </span>
              <span
                className="display-mask-feather bubble-display-feather"
                aria-hidden
              />
              <span
                className="display-mask-membrane bubble-display-membrane"
                aria-hidden
              />
            </span>
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
      </button>
    </div>
  );
}
