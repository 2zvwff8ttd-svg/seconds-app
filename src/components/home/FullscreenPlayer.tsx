"use client";

import { ReportButton } from "@/components/reports/ReportButton";
import { useBgmPlayback } from "@/components/video/useBgmPlayback";
import { VideoSocialPanel } from "@/components/video/VideoSocialPanel";
import { createClient } from "@/lib/supabase/client";
import { fetchVideoClipUrls } from "@/lib/videos/clips";
import type { FeedVideo } from "@/types/feed";
import type { WatchReport } from "@/types/recommendation";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const COMPLETE_PROGRESS_THRESHOLD = 0.92;

type VideoSlot = 0 | 1;

type FullscreenPlayerProps = {
  video: FeedVideo;
  onClose: (report: WatchReport) => void;
  onLikeEngagement?: () => void;
  onCommentEngagement?: () => void;
};

function nextClipIndex(current: number, total: number): number {
  return (current + 1) % total;
}

function setVideoSource(el: HTMLVideoElement, url: string) {
  if (el.dataset.clipSrc === url) return;
  el.dataset.clipSrc = url;
  el.src = url;
  el.load();
}

function getSlotRef(
  slot: VideoSlot,
  slotA: React.RefObject<HTMLVideoElement | null>,
  slotB: React.RefObject<HTMLVideoElement | null>,
) {
  return slot === 0 ? slotA : slotB;
}

export function FullscreenPlayer({
  video,
  onClose,
  onLikeEngagement,
  onCommentEngagement,
}: FullscreenPlayerProps) {
  const slotARef = useRef<HTMLVideoElement>(null);
  const slotBRef = useRef<HTMLVideoElement>(null);
  const [clipUrls, setClipUrls] = useState<string[]>([video.videoUrl]);
  const [clipIndex, setClipIndex] = useState(0);
  const [activeSlot, setActiveSlot] = useState<VideoSlot>(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const clipIndexRef = useRef(0);
  const activeSlotRef = useRef<VideoSlot>(0);
  const maxProgressRef = useRef(0);
  const allClipsCompletedRef = useRef(false);

  const activeVideoRef = activeSlot === 0 ? slotARef : slotBRef;

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => setCurrentUserId(user?.id ?? null))
      .catch(() => setCurrentUserId(null));
  }, []);

  useBgmPlayback(activeVideoRef, { bgmUrl: video.bgmUrl, active: true });

  useEffect(() => {
    setClipUrls([video.videoUrl]);
    setClipIndex(0);
    setActiveSlot(0);
    clipIndexRef.current = 0;
    activeSlotRef.current = 0;
    maxProgressRef.current = 0;
    allClipsCompletedRef.current = false;
    setIsPaused(false);
    fetchVideoClipUrls(video.id)
      .then((urls) => {
        if (urls.length > 0) setClipUrls(urls);
      })
      .catch(() => {});
  }, [video.id, video.videoUrl]);

  const preloadClipOnSlot = useCallback(
    (slot: VideoSlot, clipIdx: number, urls: string[]) => {
      const el = getSlotRef(slot, slotARef, slotBRef).current;
      if (!el || urls.length === 0) return;
      setVideoSource(el, urls[clipIdx % urls.length] ?? video.videoUrl);
    },
    [video.videoUrl],
  );

  const startPlayback = useCallback(() => {
    const slot0 = slotARef.current;
    const slot1 = slotBRef.current;
    if (!slot0 || !slot1 || clipUrls.length === 0) return;

    activeSlotRef.current = 0;
    clipIndexRef.current = 0;
    setActiveSlot(0);
    setClipIndex(0);

    const firstUrl = clipUrls[0] ?? video.videoUrl;
    const preloadIdx = nextClipIndex(0, clipUrls.length);

    setVideoSource(slot0, firstUrl);
    setVideoSource(slot1, clipUrls[preloadIdx] ?? firstUrl);

    slot0.currentTime = 0;
    slot1.currentTime = 0;
    slot0.muted = Boolean(video.bgmUrl);
    slot1.muted = true;

    void slot0.play().catch(() => {});
  }, [clipUrls, video.bgmUrl, video.videoUrl]);

  useEffect(() => {
    startPlayback();
  }, [startPlayback, video.id]);

  useEffect(() => {
    const el = getSlotRef(activeSlotRef.current, slotARef, slotBRef).current;
    if (!el) return;

    const onPlay = () => setIsPaused(false);
    const onPause = () => setIsPaused(true);

    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    setIsPaused(el.paused);

    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, [activeSlot]);

  const handleVideoTap = useCallback(() => {
    const el = getSlotRef(activeSlotRef.current, slotARef, slotBRef).current;
    if (!el) return;
    if (el.paused) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, []);

  const updateProgress = useCallback(() => {
    const el = getSlotRef(activeSlotRef.current, slotARef, slotBRef).current;
    const totalClips = Math.max(1, clipUrls.length);
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;

    const idx = clipIndexRef.current;
    const clipProgress = Math.min(1, el.currentTime / el.duration);
    const overall = Math.min(1, (idx + clipProgress) / totalClips);
    maxProgressRef.current = Math.max(maxProgressRef.current, overall);
  }, [clipUrls.length]);

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

  const handleEnded = useCallback(
    (endedSlot: VideoSlot) => {
      if (endedSlot !== activeSlotRef.current || clipUrls.length === 0) return;

      const total = clipUrls.length;
      const current = clipIndexRef.current;
      const next = nextClipIndex(current, total);

      if (current === total - 1) {
        allClipsCompletedRef.current = true;
        maxProgressRef.current = 1;
      }

      const newActiveSlot: VideoSlot = endedSlot === 0 ? 1 : 0;
      const newActive = getSlotRef(newActiveSlot, slotARef, slotBRef).current;
      const oldActive = getSlotRef(endedSlot, slotARef, slotBRef).current;
      if (!newActive || !oldActive) return;

      const afterNext = nextClipIndex(next, total);

      const swapToPreloaded = () => {
        oldActive.pause();

        activeSlotRef.current = newActiveSlot;
        clipIndexRef.current = next;

        newActive.currentTime = 0;
        newActive.muted = Boolean(video.bgmUrl);
        void newActive.play().catch(() => {});

        setActiveSlot(newActiveSlot);
        setClipIndex(next);

        preloadClipOnSlot(endedSlot, afterNext, clipUrls);
      };

      if (newActive.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        swapToPreloaded();
        return;
      }

      const onReady = () => {
        newActive.removeEventListener("canplay", onReady);
        swapToPreloaded();
      };
      newActive.addEventListener("canplay", onReady);
    },
    [clipUrls, preloadClipOnSlot, video.bgmUrl],
  );

  const slotClassName = (slot: VideoSlot) =>
    [
      "absolute inset-0 h-full w-full object-cover",
      activeSlot === slot
        ? "z-10 opacity-100"
        : "pointer-events-none z-0 opacity-0",
    ].join(" ");

  return (
    <div
      className="fullscreen-player fullscreen-enter z-fullscreen fixed inset-0 h-[100dvh] w-full overflow-hidden bg-black"
      role="dialog"
      aria-modal
      aria-label={video.title}
    >
      <div className="absolute inset-0 bg-black">
        <video
          ref={slotARef}
          poster={
            clipIndex === 0 && activeSlot === 0 ? video.thumbnailUrl : undefined
          }
          className={slotClassName(0)}
          playsInline
          preload="auto"
          controls={false}
          controlsList="nodownload noplaybackrate nofullscreen noremoteplayback"
          disablePictureInPicture
          disableRemotePlayback
          onTimeUpdate={activeSlot === 0 ? updateProgress : undefined}
          onEnded={() => handleEnded(0)}
        />
        <video
          ref={slotBRef}
          className={slotClassName(1)}
          playsInline
          preload="auto"
          controls={false}
          controlsList="nodownload noplaybackrate nofullscreen noremoteplayback"
          disablePictureInPicture
          disableRemotePlayback
          onTimeUpdate={activeSlot === 1 ? updateProgress : undefined}
          onEnded={() => handleEnded(1)}
        />
      </div>

      <button
        type="button"
        className="absolute inset-0 z-[15] cursor-default touch-manipulation"
        onClick={handleVideoTap}
        aria-label={isPaused ? "再生" : "一時停止"}
      />

      {isPaused && (
        <div
          className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center"
          aria-hidden
        >
          <svg
            viewBox="0 0 24 24"
            className="h-14 w-14 text-white/30 sm:h-16 sm:w-16"
            fill="currentColor"
          >
            <rect x="5" y="4" width="5" height="16" rx="1.2" />
            <rect x="14" y="4" width="5" height="16" rx="1.2" />
          </svg>
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-black/55 via-transparent via-35% to-black/85"
        aria-hidden
      />

      <button
        type="button"
        onClick={handleClose}
        className="absolute left-4 top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/65"
        aria-label="閉じる"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      {currentUserId && currentUserId !== video.creatorId && (
        <div className="absolute right-4 top-[max(0.75rem,env(safe-area-inset-top))] z-30">
          <ReportButton
            targetType="video"
            targetId={video.id}
            targetLabel={`動画「${video.title}」`}
            className="rounded-full bg-black/45 px-3 py-2 text-xs font-medium text-white backdrop-blur-md transition hover:bg-black/65 hover:text-red-300"
          />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-30 flex max-h-[min(52dvh,420px)] flex-col px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-16 sm:px-5">
        <div className="shrink-0">
          <p className="text-base font-semibold text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.65)] sm:text-lg">
            {video.title}
          </p>
          <Link
            href={`/profile/${video.creatorId}`}
            onClick={handleClose}
            className="mt-0.5 inline-block text-sm text-violet-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.55)] transition hover:text-white hover:underline"
          >
            @{video.creatorName}
          </Link>
          {video.isViralTop && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gold/25 px-3 py-1 text-xs font-medium text-gold backdrop-blur-sm">
              <span aria-hidden>👑</span>
              昨日の国別 #1
            </p>
          )}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-hidden rounded-2xl bg-black/35 p-3 backdrop-blur-md">
          <VideoSocialPanel
            videoId={video.id}
            currentUserId={currentUserId}
            onLikeEngagement={onLikeEngagement}
            onCommentEngagement={onCommentEngagement}
            variant="overlay"
          />
        </div>
      </div>
    </div>
  );
}
