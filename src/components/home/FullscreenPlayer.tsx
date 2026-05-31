"use client";

import { VideoSocialPanel } from "@/components/video/VideoSocialPanel";
import type { FeedVideo } from "@/types/feed";
import { useEffect, useRef } from "react";

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
      className="fullscreen-enter z-fullscreen fixed inset-0 flex flex-col bg-black"
      role="dialog"
      aria-modal
      aria-label={video.title}
    >
      <div className="relative min-h-0 flex-[1.1] shrink-0">
        <video
          ref={videoRef}
          src={video.videoUrl}
          poster={video.thumbnailUrl}
          className="h-full w-full object-contain"
          playsInline
          controls
          autoPlay
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition hover:bg-black/70"
          aria-label="閉じる"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-border bg-surface-elevated px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
        <div className="shrink-0">
          <p className="text-base font-semibold text-foreground sm:text-lg">{video.title}</p>
          <p className="mt-0.5 text-sm text-muted">@{video.creatorName}</p>
          {video.isViralTop && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-xs font-medium text-gold">
              <span aria-hidden>👑</span>
              昨日の国別 #1
            </p>
          )}
        </div>

        <div className="mt-3 min-h-0 flex-1">
          <VideoSocialPanel videoId={video.id} />
        </div>
      </div>
    </div>
  );
}
