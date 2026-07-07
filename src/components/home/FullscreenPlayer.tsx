"use client";

import { BurstEffect } from "@/components/home/BurstEffect";
import { FullscreenVideoMask } from "@/components/home/FullscreenVideoMask";
import { useFullscreenMaskFlip } from "@/components/home/useFullscreenMaskFlip";
import { ReportButton } from "@/components/reports/ReportButton";
import { BlockUserButton } from "@/components/blocks/BlockUserButton";
import { useBgmPlayback } from "@/components/video/useBgmPlayback";
import { VideoSocialPanel } from "@/components/video/VideoSocialPanel";
import { VideoRetentionNote } from "@/components/video/VideoRetentionNote";
import { VideoSaveShareButtons } from "@/components/video/VideoSaveShareButtons";
import {
  getDefaultFullscreenOrigin,
  type BubbleOriginRect,
} from "@/lib/home/bubble-origin-rect";
import { FULLSCREEN_EXIT_MS } from "@/lib/home/fullscreen-transition";
import { createClient } from "@/lib/supabase/client";
import { fetchVideoById } from "@/lib/videos/fetch-video";
import { normalizeMediaPublicUrl } from "@/lib/videos/normalize-media-url";
import {
  releaseVideoUrl,
} from "@/lib/videos/preload-video";
import { prefetchVideoForSaveShare } from "@/lib/video/video-file-cache";
import type { FeedVideo } from "@/types/feed";
import type { WatchReport } from "@/types/recommendation";
import { UserIdentity } from "@/components/profile/UserIdentity";
import { useCallback, useEffect, useRef, useState } from "react";

const COMPLETE_PROGRESS_THRESHOLD = 0.92;

type VideoSlot = 0 | 1;

type FullscreenPlayerProps = {
  video: FeedVideo;
  originRect?: BubbleOriginRect;
  onClose: (report: WatchReport) => void;
  onFlipStart?: () => void;
  onFlipComplete?: () => void;
  onLikeEngagement?: () => void;
  onCommentEngagement?: () => void;
  onUserBlocked?: (userId: string) => void;
};

function setVideoSource(el: HTMLVideoElement, url: string): boolean {
  const normalized = normalizeMediaPublicUrl(url);
  if (!normalized) {
    console.warn("[fullscreen-player] refused empty/invalid video src");
    return false;
  }
  if (el.dataset.clipSrc === normalized) return true;
  el.dataset.clipSrc = normalized;
  el.src = normalized;
  el.load();
  // Drop the pointerdown preload link immediately so iOS does not hold two
  // full video buffers (link + <video>) while decoding — HTTP cache still
  // serves the element's fetch.
  releaseVideoUrl(normalized);
  return true;
}

/**
 * Fully release a <video>'s media resource so iOS/WebView drops its decoder and
 * buffers. Removing the DOM node alone is NOT enough on Safari — the element
 * keeps the source until pause + src removal + load() (empty) forces a teardown.
 */
function releaseVideoElement(el: HTMLVideoElement | null): boolean {
  if (!el) return false;
  try {
    el.pause();
    el.removeAttribute("src");
    delete el.dataset.clipSrc;
    // load() with no src makes the element abort the current fetch/decoder and
    // reset to HAVE_NOTHING, releasing buffered media memory.
    el.load();
    return true;
  } catch {
    return false;
  }
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
  originRect,
  onClose,
  onFlipStart,
  onFlipComplete,
  onLikeEngagement,
  onCommentEngagement,
  onUserBlocked,
}: FullscreenPlayerProps) {
  const slotARef = useRef<HTMLVideoElement>(null);
  const slotBRef = useRef<HTMLVideoElement>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(() =>
    normalizeMediaPublicUrl(video.videoUrl),
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [maskDiameter, setMaskDiameter] = useState(0);
  const [showVideoSurface, setShowVideoSurface] = useState(false);
  const activeSlot: VideoSlot = 0;
  const activeSlotRef = useRef<VideoSlot>(0);
  const maxProgressRef = useRef(0);
  const allClipsCompletedRef = useRef(false);
  const clipSwappingRef = useRef(false);
  const exitStartedRef = useRef(false);
  const hasStartedRef = useRef(false);

  const flipOrigin = originRect ?? getDefaultFullscreenOrigin();
  const { maskRef, enterDone, flipVisible } = useFullscreenMaskFlip({
    originRect: flipOrigin,
    onFlipStart,
    onFlipComplete,
  });

  const { play: playBgm, pause: pauseBgm } = useBgmPlayback({
    bgmUrl: video.bgmUrl,
    sessionKey: video.id,
    active: true,
  });

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => setCurrentUserId(user?.id ?? null))
      .catch(() => setCurrentUserId(null));
  }, []);

  // Always resolve a single canonical video_url from props, then refresh from DB
  // so stale feed cache / backfill updates never point at missing clip files.
  useEffect(() => {
    let cancelled = false;

    const fromProps = normalizeMediaPublicUrl(video.videoUrl);
    setPlaybackUrl(fromProps);

    void fetchVideoById(video.id)
      .then((row) => {
        if (cancelled || !row) return;
        const fresh = normalizeMediaPublicUrl(row.videoUrl);
        if (fresh) setPlaybackUrl(fresh);
      })
      .catch(() => {
        /* keep feed URL */
      });

    return () => {
      cancelled = true;
    };
  }, [video.id, video.videoUrl]);

  const releaseSlots = useCallback(() => {
    releaseVideoElement(slotARef.current);
    releaseVideoElement(slotBRef.current);
  }, []);

  useEffect(() => {
    // Pointerdown preload warms HTTP cache; setVideoSource releases the <link>
    // as soon as the <video> takes the URL so iOS does not decode two buffers.
    hasStartedRef.current = false;
    maxProgressRef.current = 0;
    allClipsCompletedRef.current = false;
    setIsPaused(false);
    setShowVideoSurface(false);
  }, [video.id, playbackUrl]);

  useEffect(() => {
    prefetchVideoForSaveShare(playbackUrl);
  }, [playbackUrl]);

  // Belt-and-suspenders: whenever this player instance unmounts, tear down both
  // <video> decoders so nothing lingers between open/close cycles (iPhone 13).
  useEffect(() => {
    return () => {
      releaseSlots();
    };
  }, [releaseSlots]);

  const prepareSources = useCallback(() => {
    const slot0 = slotARef.current;
    if (!slot0 || !playbackUrl) return false;

    const applied = setVideoSource(slot0, playbackUrl);
    if (!applied) return false;

    slot0.currentTime = 0;
    slot0.muted = Boolean(video.bgmUrl);
    return true;
  }, [playbackUrl, video.bgmUrl]);

  const startPlayback = useCallback(() => {
    const slot0 = slotARef.current;
    if (!slot0 || !playbackUrl) return;

    activeSlotRef.current = 0;

    if (!prepareSources()) return;

    void slot0
      .play()
      .then(() => {
        hasStartedRef.current = true;
        setShowVideoSurface(true);
      })
      .catch(() => {});
  }, [playbackUrl, prepareSources]);

  useEffect(() => {
    if (!flipVisible) return;
    startPlayback();
  }, [flipVisible, startPlayback]);

  // Resilient autoplay: the single play() in startPlayback can be dropped if the
  // first bytes arrive late or iOS defers autoplay past the tap. Retry the
  // moment data is ready — until the first "playing" — so the user never has to
  // press play to get it started.
  useEffect(() => {
    if (!flipVisible) return;
    const el = slotARef.current;
    if (!el) return;

    const markStarted = () => {
      hasStartedRef.current = true;
    };
    const retry = () => {
      if (hasStartedRef.current || exitStartedRef.current || !el.paused) return;
      void el
        .play()
        .then(() => {
          hasStartedRef.current = true;
          setShowVideoSurface(true);
        })
        .catch(() => {});
    };

    el.addEventListener("playing", markStarted);
    const events = ["loadeddata", "canplay", "canplaythrough"];
    for (const name of events) el.addEventListener(name, retry);
    return () => {
      el.removeEventListener("playing", markStarted);
      for (const name of events) el.removeEventListener(name, retry);
    };
  }, [flipVisible, playbackUrl]);

  useEffect(() => {
    const el = slotARef.current;
    if (!el) return;

    const markReady = () => setShowVideoSurface(true);

    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      markReady();
      return;
    }

    // Reveal the video surface as soon as any decode milestone lands, so we
    // don't linger on the thumbnail waiting only for loadeddata/playing.
    const events = ["loadedmetadata", "loadeddata", "canplay", "playing"];
    for (const name of events) {
      el.addEventListener(name, markReady, { once: true });
    }
    return () => {
      for (const name of events) {
        el.removeEventListener(name, markReady);
      }
    };
  }, [video.id, playbackUrl, flipVisible]);

  useEffect(() => {
    const el = getSlotRef(activeSlotRef.current, slotARef, slotBRef).current;
    if (!el) return;

    const onPlay = () => setIsPaused(false);
    const onPause = () => {
      if (clipSwappingRef.current) return;
      setIsPaused(true);
    };

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
      if (video.bgmUrl) playBgm();
    } else {
      el.pause();
      if (video.bgmUrl) pauseBgm();
    }
  }, [video.bgmUrl, playBgm, pauseBgm]);

  const updateProgress = useCallback(() => {
    const el = slotARef.current;
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    const progress = Math.min(1, el.currentTime / el.duration);
    maxProgressRef.current = Math.max(maxProgressRef.current, progress);
  }, []);

  const buildReport = useCallback((): WatchReport => {
    const completed =
      allClipsCompletedRef.current ||
      maxProgressRef.current >= COMPLETE_PROGRESS_THRESHOLD;
    return {
      completed,
      progress: maxProgressRef.current,
    };
  }, []);

  const requestClose = useCallback(() => {
    if (exitStartedRef.current) return;
    exitStartedRef.current = true;
    setIsExiting(true);
  }, []);

  useEffect(() => {
    if (!isExiting) return;
    const el = getSlotRef(activeSlotRef.current, slotARef, slotBRef).current;
    el?.pause();
    if (video.bgmUrl) pauseBgm();
  }, [isExiting, pauseBgm, video.bgmUrl]);

  useEffect(() => {
    if (!isExiting) return;
    const timer = window.setTimeout(() => {
      releaseSlots();
      onClose(buildReport());
    }, FULLSCREEN_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [isExiting, onClose, buildReport, releaseSlots]);

  useEffect(() => {
    const el = maskRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) setMaskDiameter(rect.width);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [maskRef, enterDone]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [requestClose]);

  const handleEnded = useCallback(() => {
    // Single merged file: native `loop` replays. Do not reset currentTime/src —
    // manual seek+play after `ended` left iOS with empty src + error=4 while BGM
    // kept playing.
    allClipsCompletedRef.current = true;
    maxProgressRef.current = 1;
  }, []);

  const slotClassName = (slot: VideoSlot) =>
    [
      // Keep the active <video> at full opacity while decoding. Hiding it with
      // opacity-0 until showVideoSurface (535a0e5) can leave iOS with audio-only
      // playback — the compositor never attaches the video layer. The expand
      // thumbnail (higher z-index) covers the bubble until the first frame.
      "fullscreen-player__video absolute inset-0 h-full w-full object-cover",
      activeSlot === slot
        ? "z-10 opacity-100"
        : "pointer-events-none z-0 opacity-0",
    ].join(" ");

  const expandThumbnailUrl = video.thumbnailUrl;

  const playerStateClass = [
    enterDone ? "fullscreen-player--entered" : "fullscreen-player--entering",
    isExiting ? "fullscreen-player--exiting" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`fullscreen-player z-fullscreen fixed inset-0 flex h-[100dvh] w-full flex-col overflow-hidden ${playerStateClass}`}
      role="dialog"
      aria-modal
      aria-label={video.title}
    >
      {/* No starfield here: it duplicated the home one (double-render) and kept
          ~200 animated SVG circles compositing behind the video for the whole
          watch — a steady GPU drain on iPhone 13. Glow + vignette are enough. */}
      <div className="fullscreen-player__backdrop fullscreen-player__chrome-layer pointer-events-none absolute inset-0">
        <div className="fullscreen-player__backdrop-glow" aria-hidden />
        <div className="fullscreen-player__backdrop-vignette" aria-hidden />
      </div>

      <div className="fullscreen-player__stage relative z-10 flex min-h-0 flex-1 items-center justify-center px-4 pb-2 pt-[max(3.5rem,calc(env(safe-area-inset-top)+2.75rem))]">
        <div
          ref={maskRef}
          className={`fullscreen-player__mask-wrap will-change-transform${flipVisible ? " fullscreen-player__mask-wrap--visible" : ""}`}
        >
          <FullscreenVideoMask
            className="fullscreen-player__mask"
            shape={video.displayMaskShape}
          >
          {expandThumbnailUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={expandThumbnailUrl}
              alt=""
              className={`fullscreen-player__expand-thumb absolute inset-0 z-[12] h-full w-full object-cover transition-opacity duration-300${showVideoSurface ? " pointer-events-none opacity-0" : " opacity-100"}`}
              draggable={false}
            />
          )}
          <video
            ref={slotARef}
            poster={video.thumbnailUrl}
            className={slotClassName(0)}
            playsInline
            loop
            preload="auto"
            controls={false}
            controlsList="nodownload noplaybackrate nofullscreen noremoteplayback"
            disablePictureInPicture
            disableRemotePlayback
            onTimeUpdate={updateProgress}
            onEnded={handleEnded}
          />
          <video
            ref={slotBRef}
            poster={video.thumbnailUrl}
            className={slotClassName(1)}
            playsInline
            preload="none"
            controls={false}
            controlsList="nodownload noplaybackrate nofullscreen noremoteplayback"
            disablePictureInPicture
            disableRemotePlayback
          />

          <button
            type="button"
            className={`absolute inset-0 z-20 cursor-default touch-manipulation${isExiting ? " pointer-events-none" : ""}`}
            onClick={handleVideoTap}
            disabled={isExiting}
            aria-label={isPaused ? "再生" : "一時停止"}
          />

          {isPaused && (
            <div
              className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
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
          </FullscreenVideoMask>

          {isExiting && maskDiameter > 0 && (
            <div className="absolute inset-0 z-40">
              <BurstEffect size={maskDiameter} variant="fullscreen" />
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={requestClose}
        disabled={isExiting}
        className="fullscreen-player__chrome-layer absolute left-4 top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/65 disabled:pointer-events-none"
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
        <div className="fullscreen-player__chrome-layer absolute right-4 top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex flex-col items-end gap-2">
          <BlockUserButton
            userId={video.creatorId}
            username={video.creatorName}
            compact
            className="rounded-full bg-black/45 px-3 py-2 text-xs font-medium text-white backdrop-blur-md transition hover:bg-black/65 hover:text-red-300"
            onBlocked={() => {
              onUserBlocked?.(video.creatorId);
              requestClose();
            }}
          />
          <ReportButton
            targetType="video"
            targetId={video.id}
            targetLabel={`動画「${video.title}」`}
            className="rounded-full bg-black/45 px-3 py-2 text-xs font-medium text-white backdrop-blur-md transition hover:bg-black/65 hover:text-red-300"
          />
        </div>
      )}

      <div className="fullscreen-player__footer fullscreen-player__chrome-layer relative z-30 flex max-h-[min(52dvh,420px)] shrink-0 flex-col bg-[#010102] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
        <div className="shrink-0">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.65)] sm:text-lg">
                {video.title}
              </p>
            </div>
            {playbackUrl && (
              <VideoSaveShareButtons
                videoUrl={playbackUrl}
                title={video.title}
                disabled={isExiting}
                layout="row"
              />
            )}
          </div>
          <UserIdentity
            username={video.creatorName}
            displayName={video.creatorDisplayName}
            size="md"
            layout="stack"
            tone="light"
            href={`/profile/${video.creatorId}`}
            onClick={requestClose}
            className="mt-0.5 drop-shadow-[0_1px_4px_rgba(0,0,0,0.55)] transition hover:opacity-90"
          />
          {video.isViralTop && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gold/25 px-3 py-1 text-xs font-medium text-gold backdrop-blur-sm">
              <span aria-hidden>👑</span>
              昨日の国別 #1
            </p>
          )}
          <VideoRetentionNote
            publishedAt={
              video.videoStatus === "published" ? video.publishedAt : null
            }
            publishAt={video.publishAt ?? video.publishedAt}
            className="mt-2 text-xs text-white/55"
          />
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
