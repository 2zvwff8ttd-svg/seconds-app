"use client";

import { VideoSocialPanel } from "@/components/video/VideoSocialPanel";
import { fetchVideoClipUrls } from "@/lib/videos/clips";
import type { FeedVideo } from "@/types/feed";
import type { WatchReport } from "@/types/recommendation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const COMPLETE_PROGRESS_THRESHOLD = 0.92;

type FullscreenPlayerProps = {
  video: FeedVideo;
  onClose: (report: WatchReport) => void;
  onLikeEngagement?: () => void;
  onCommentEngagement?: () => void;
};

export function FullscreenPlayer({
  video,
  onClose,
  onLikeEngagement,
  onCommentEngagement,
}: FullscreenPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [clipUrls, setClipUrls] = useState<string[]>([video.videoUrl]);
  const [clipIndex, setClipIndex] = useState(0);
  const maxProgressRef = useRef(0);
  const allClipsCompletedRef = useRef(false);

  useEffect(() => {
    setClipUrls([video.videoUrl]);
    setClipIndex(0);
    maxProgressRef.current = 0;
    allClipsCompletedRef.current = false;
    fetchVideoClipUrls(video.id)
      .then((urls) => {
        if (urls.length > 0) setClipUrls(urls);
      })
      .catch(() => {});
  }, [video.id, video.videoUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = false;
    el.src = clipUrls[clipIndex] ?? video.videoUrl;
    el.load();
    el.play().catch(() => {});
  }, [clipIndex, clipUrls, video.videoUrl]);

  const updateProgress = useCallback(() => {
    const el = videoRef.current;
    const totalClips = Math.max(1, clipUrls.length);
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;

    const clipProgress = Math.min(1, el.currentTime / el.duration);
    const overall = Math.min(1, (clipIndex + clipProgress) / totalClips);
    maxProgressRef.current = Math.max(maxProgressRef.current, overall);
  }, [clipIndex, clipUrls.length]);

  const buildReport = useCallback((): WatchReport => {
    const completed =
      allClipsCompletedRef.current ||
      maxProgressRef.current >= COMPLETE_PROGRESS_THRESHOLD;
    return {
      completed,
      progress: maxProgressRef.current,
    };
  }, []);

  const handleClose = useCallback(() => {
    onClose(buildReport());
  }, [onClose, buildReport]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  const handleEnded = () => {
    if (clipIndex < clipUrls.length - 1) {
      setClipIndex((i) => i + 1);
    } else {
      allClipsCompletedRef.current = true;
      maxProgressRef.current = 1;
    }
  };

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
          poster={video.thumbnailUrl}
          className="h-full w-full object-contain"
          playsInline
          controls
          autoPlay
          onTimeUpdate={updateProgress}
          onEnded={handleEnded}
        />
        {clipUrls.length > 1 && (
          <div className="absolute right-4 top-14 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white backdrop-blur-md">
            {clipIndex + 1} / {clipUrls.length}
          </div>
        )}
        <button
          type="button"
          onClick={handleClose}
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
          <Link
            href={`/profile/${video.creatorId}`}
            onClick={handleClose}
            className="mt-0.5 inline-block text-sm text-violet-300 transition hover:text-violet-200 hover:underline"
          >
            @{video.creatorName}
          </Link>
          {video.isViralTop && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-xs font-medium text-gold">
              <span aria-hidden>👑</span>
              昨日の国別 #1
            </p>
          )}
        </div>

        <div className="mt-3 min-h-0 flex-1">
          <VideoSocialPanel
            videoId={video.id}
            onLikeEngagement={onLikeEngagement}
            onCommentEngagement={onCommentEngagement}
          />
        </div>
      </div>
    </div>
  );
}
