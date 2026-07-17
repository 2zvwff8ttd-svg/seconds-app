"use client";

import {
  getVideoDisplayMaskCssVars,
  type VideoDisplayMaskShape,
} from "@/lib/video/display-mask";
import { resolveDisplayName } from "@/lib/profile/display-name";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  bounds: { width: number; height: number };
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
  bounds,
  floatStyle,
  isHidden = false,
  spawnAnimate = false,
  spawnIndex = 0,
  onSelect,
  zIndex,
}: VideoBubbleProps) {
  const dragLayerRef = useRef<HTMLDivElement>(null);
  const floatLayerRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const offsetStartRef = useRef({ x: 0, y: 0 });
  const offsetRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const lastSampleRef = useRef({ x: 0, y: 0, time: 0 });
  const draggedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const [isMoving, setIsMoving] = useState(false);
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

  const applyOffset = useCallback((x: number, y: number) => {
    offsetRef.current = { x, y };
    if (dragLayerRef.current) {
      dragLayerRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }, []);

  const clampOffset = useCallback(
    (x: number, y: number) => ({
      x: Math.min(
        bounds.width - placement.radius - placement.x,
        Math.max(placement.radius - placement.x, x),
      ),
      y: Math.min(
        bounds.height - placement.radius - placement.y,
        Math.max(placement.radius - placement.y, y),
      ),
    }),
    [bounds.height, bounds.width, placement.radius, placement.x, placement.y],
  );

  const stopInertia = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    velocityRef.current = { x: 0, y: 0 };
    setIsMoving(false);
  }, []);

  const startInertia = useCallback(() => {
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      Math.hypot(velocityRef.current.x, velocityRef.current.y) < 0.03
    ) {
      setIsMoving(false);
      return;
    }

    setIsMoving(true);
    let previousTime = performance.now();
    const restitution = 0.48;

    const tick = (now: number) => {
      const dt = Math.min(32, now - previousTime);
      previousTime = now;
      const friction = Math.pow(0.94, dt / 16.67);
      let vx = velocityRef.current.x * friction;
      let vy = velocityRef.current.y * friction;
      const current = offsetRef.current;
      const proposed = { x: current.x + vx * dt, y: current.y + vy * dt };
      const bounded = clampOffset(proposed.x, proposed.y);

      if (bounded.x !== proposed.x) vx *= -restitution;
      if (bounded.y !== proposed.y) vy *= -restitution;

      velocityRef.current = { x: vx, y: vy };
      applyOffset(bounded.x, bounded.y);

      if (Math.hypot(vx, vy) < 0.01) {
        animationFrameRef.current = null;
        velocityRef.current = { x: 0, y: 0 };
        setIsMoving(false);
        return;
      }
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);
  }, [applyOffset, clampOffset]);

  useEffect(() => {
    const bounded = clampOffset(offsetRef.current.x, offsetRef.current.y);
    applyOffset(bounded.x, bounded.y);
  }, [applyOffset, clampOffset]);

  useEffect(() => stopInertia, [stopInertia]);

  useEffect(() => {
    if (isHidden) stopInertia();
  }, [isHidden, stopInertia]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        event.preventDefault();
        return;
      }
      if (isHidden || !floatLayerRef.current) return;
      onSelect(getBubbleOriginRect(floatLayerRef.current));
    },
    [isHidden, onSelect],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (isHidden || event.button !== 0) return;
      stopInertia();
      pointerIdRef.current = event.pointerId;
      pointerStartRef.current = { x: event.clientX, y: event.clientY };
      offsetStartRef.current = offsetRef.current;
      lastSampleRef.current = {
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
      };
      velocityRef.current = { x: 0, y: 0 };
      draggedRef.current = false;
      suppressClickRef.current = false;
      event.currentTarget.setPointerCapture(event.pointerId);
      warmVideoUrl(video.videoUrl);
    },
    [isHidden, stopInertia, video.videoUrl],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      const dx = event.clientX - pointerStartRef.current.x;
      const dy = event.clientY - pointerStartRef.current.y;

      if (!draggedRef.current && Math.hypot(dx, dy) < 8) return;
      draggedRef.current = true;
      setIsMoving(true);

      const bounded = clampOffset(
        offsetStartRef.current.x + dx,
        offsetStartRef.current.y + dy,
      );
      applyOffset(bounded.x, bounded.y);

      const previous = lastSampleRef.current;
      const dt = Math.max(1, event.timeStamp - previous.time);
      const sampleVx = (event.clientX - previous.x) / dt;
      const sampleVy = (event.clientY - previous.y) / dt;
      velocityRef.current = {
        x: velocityRef.current.x * 0.35 + sampleVx * 0.65,
        y: velocityRef.current.y * 0.35 + sampleVy * 0.65,
      };
      lastSampleRef.current = {
        x: event.clientX,
        y: event.clientY,
        time: event.timeStamp,
      };
    },
    [applyOffset, clampOffset],
  );

  const finishPointer = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
      if (pointerIdRef.current !== event.pointerId) return;
      pointerIdRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (draggedRef.current) {
        suppressClickRef.current = true;
        if (cancelled) {
          velocityRef.current = { x: 0, y: 0 };
          setIsMoving(false);
        } else {
          startInertia();
        }
      }
    },
    [startInertia],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => finishPointer(event),
    [finishPointer],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) =>
      finishPointer(event, true),
    [finishPointer],
  );

  return (
    <div
      ref={dragLayerRef}
      className={`bubble-drag-layer pointer-events-auto absolute${isMoving ? " bubble-drag-layer--moving" : ""}${isHidden ? " bubble-float--hidden" : ""}`}
      style={
        {
          left: placement.x - placement.radius,
          top: placement.y - placement.radius,
          width: diameter,
          height: diameter,
          zIndex,
        } as CSSProperties
      }
    >
      <div
        ref={floatLayerRef}
        className={`bubble-float h-full w-full${spawnAnimate ? " bubble-float--spawn" : ""}${isMoving ? " bubble-float--paused" : ""}`}
        style={
          {
            "--spawn-index": spawnIndex,
            ...floatStyle,
          } as CSSProperties
        }
      >
        <button
          type="button"
          aria-label={`${video.title} by ${resolveDisplayName(video.creatorDisplayName, video.creatorName)}`}
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          disabled={isHidden}
          className="bubble-drag-target group relative h-full w-full overflow-visible focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/80"
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
    </div>
  );
}
