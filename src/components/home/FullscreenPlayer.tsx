"use client";

import { useEffect, useRef } from "react";
import type { FeedVideo } from "@/types/feed";

type FullscreenPlayerProps = {
  video: FeedVideo;
  onClose: () => void;
};

export function FullscreenPlayer({ video, onClose }: FullscreenPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    el.play().catch(() => {});
  }, [video.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fullscreen-enter fixed inset-0 z-50 flex flex-col bg-black"
      role="dialog"
      aria-modal
      aria-label={video.title}
    >
      <div className="relative flex-1">
        <video
          ref={videoRef}
          src={video.videoUrl}
          className="h-full w-full object-contain"
          playsInline
          controls
          autoPlay
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition hover:bg-black/70"
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="border-t border-border bg-surface-elevated px-5 pb-8 pt-4 safe-area-pb">
        <p className="text-lg font-semibold text-foreground">{video.title}</p>
        <p className="mt-1 text-sm text-muted">@{video.creatorName}</p>
        {video.isViralTop && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-xs font-medium text-gold">
            <span aria-hidden>👑</span>
            Yesterday&apos;s #1 in your country
          </p>
        )}
      </div>
    </div>
  );
}
