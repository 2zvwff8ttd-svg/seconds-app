"use client";

import type { FeedVideo } from "@/types/feed";
import { useCallback, useRef, useState } from "react";

const DELETE_ACTION_WIDTH = 72;
const LONG_PRESS_MS = 500;
const SWIPE_OPEN_THRESHOLD = 36;

type ProfileVideoTileProps = {
  video: FeedVideo;
  deletable?: boolean;
  onSelect: (video: FeedVideo) => void;
  onDeleteRequest: (video: FeedVideo) => void;
};

function VideoThumbnail({ video }: { video: FeedVideo }) {
  return (
    <>
      {video.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="h-full w-full object-cover transition group-hover:scale-105"
          draggable={false}
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-surface text-xs text-muted">
          No thumb
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <p className="line-clamp-2 text-left text-[10px] font-medium text-foreground">
          {video.title}
        </p>
      </div>
    </>
  );
}

export function ProfileVideoTile({
  video,
  deletable = false,
  onSelect,
  onDeleteRequest,
}: ProfileVideoTileProps) {
  const [offsetX, setOffsetX] = useState(0);
  const offsetRef = useRef(0);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const draggingRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const setOffset = (value: number) => {
    offsetRef.current = value;
    setOffsetX(value);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const openActions = useCallback(() => {
    setOffset(DELETE_ACTION_WIDTH);
  }, []);

  const closeActions = useCallback(() => {
    setOffset(0);
  }, []);

  if (!deletable) {
    return (
      <button
        type="button"
        onClick={() => onSelect(video)}
        className="group relative aspect-[9/16] overflow-hidden rounded-lg border border-border bg-black"
      >
        <VideoThumbnail video={video} />
      </button>
    );
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    draggingRef.current = false;
    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      openActions();
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const deltaX = e.clientX - startXRef.current;
    const deltaY = e.clientY - startYRef.current;

    if (!draggingRef.current) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        clearLongPressTimer();
        if (Math.abs(deltaX) >= Math.abs(deltaY)) {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
        }
      }
      return;
    }

    if (deltaX > 0) {
      setOffset(Math.min(DELETE_ACTION_WIDTH, deltaX));
    } else {
      setOffset(0);
    }
  };

  const handlePointerUp = () => {
    clearLongPressTimer();

    if (draggingRef.current) {
      draggingRef.current = false;
      if (offsetRef.current >= SWIPE_OPEN_THRESHOLD) {
        openActions();
      } else {
        closeActions();
      }
      return;
    }

    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    if (offsetRef.current > 0) {
      closeActions();
      return;
    }

    onSelect(video);
  };

  const handlePointerCancel = () => {
    clearLongPressTimer();
    draggingRef.current = false;
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteRequest(video);
    closeActions();
  };

  return (
    <div className="relative aspect-[9/16] overflow-hidden rounded-lg border border-border bg-black">
      <button
        type="button"
        onClick={handleDeleteClick}
        className="absolute inset-y-0 left-0 flex w-[72px] items-center justify-center bg-red-600 text-white transition hover:bg-red-500"
        aria-label={`「${video.title}」を削除`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
        </svg>
      </button>

      <div
        className="group relative h-full w-full touch-pan-y bg-black transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${offsetX}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <VideoThumbnail video={video} />
      </div>
    </div>
  );
}
