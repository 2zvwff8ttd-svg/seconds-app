"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { FeedVideo } from "@/types/feed";
import type { UserRecommendationContext, WatchReport } from "@/types/recommendation";
import { fetchHomeFeed } from "@/lib/videos/feed";
import { BUBBLE_SLOT_COUNT, pickBubbleVideos } from "@/lib/bubble-session";
import { getBubbleGlassStyle } from "@/lib/bubble-glass-vars";
import {
  computeBubbleLayout,
  getFloatPresets,
  type BubblePlacement,
} from "@/lib/bubble-layout";
import {
  emptyRecommendationContext,
  fetchUserRecommendationContext,
  mergeRecommendationContext,
} from "@/lib/recommendation/context";
import { recordWatchEngagement } from "@/lib/recommendation/engagements";
import {
  applySessionCommentSignal,
  applySessionLikeSignal,
  applySessionWatchSignal,
  createEmptySessionPreference,
} from "@/lib/recommendation/score";
import { VideoBubble, type BubbleVideoPreview } from "./VideoBubble";
import { FullscreenPlayer } from "./FullscreenPlayer";
import Link from "next/link";
import { usePathname } from "next/navigation";

type BubbleFieldProps = {
  bottomInset: number;
  onCountryChange?: (countryCode: string) => void;
};

export function BubbleField({ bottomInset, onCountryChange }: BubbleFieldProps) {
  const pathname = usePathname();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<FeedVideo | null>(null);
  const [burstingId, setBurstingId] = useState<string | null>(null);
  const [feedPool, setFeedPool] = useState<FeedVideo[]>([]);
  const [activeBubbles, setActiveBubbles] = useState<FeedVideo[]>([]);
  const [, setRecContext] = useState<UserRecommendationContext>(
    emptyRecommendationContext,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const feedPoolRef = useRef<FeedVideo[]>([]);
  const recContextRef = useRef<UserRecommendationContext>(emptyRecommendationContext());
  const sessionPrefRef = useRef(createEmptySessionPreference());
  const sessionWatchedIdsRef = useRef<Set<string>>(new Set());
  const bubblesInitializedRef = useRef(false);

  const mergedContext = useCallback(
    () =>
      mergeRecommendationContext(
        recContextRef.current,
        sessionPrefRef.current,
      ),
    [],
  );

  const pickSlots = useCallback(
    (pool: FeedVideo[], excludeIds?: ReadonlySet<string>) =>
      pickBubbleVideos(pool, mergedContext(), {
        excludeIds,
        sessionWatchedIds: sessionWatchedIdsRef.current,
        count: BUBBLE_SLOT_COUNT,
      }),
    [mergedContext],
  );

  const applyFeedPool = useCallback(
    (pool: FeedVideo[]) => {
      feedPoolRef.current = pool;
      setFeedPool(pool);
      if (!bubblesInitializedRef.current) {
        setActiveBubbles(pickSlots(pool));
        bubblesInitializedRef.current = true;
      }
    },
    [pickSlots],
  );

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ videos, countryCode }, serverCtx] = await Promise.all([
        fetchHomeFeed(),
        fetchUserRecommendationContext(),
      ]);
      recContextRef.current = serverCtx;
      setRecContext(serverCtx);
      applyFeedPool(videos);
      onCountryChange?.(countryCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "フィードの取得に失敗しました");
      feedPoolRef.current = [];
      setFeedPool([]);
      setActiveBubbles([]);
    } finally {
      setLoading(false);
    }
  }, [applyFeedPool, onCountryChange]);

  useEffect(() => {
    if (pathname === "/") {
      loadFeed();
    }
  }, [pathname, loadFeed]);

  useEffect(() => {
    const onFocus = () => {
      if (pathname === "/") loadFeed();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [pathname, loadFeed]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [bottomInset]);

  const displayVideos = activeBubbles;

  const placements = useMemo((): BubblePlacement[] => {
    const count = Math.min(BUBBLE_SLOT_COUNT, displayVideos.length);
    if (size.width === 0 || size.height === 0 || count === 0) {
      return [];
    }
    return computeBubbleLayout(size.width, size.height, count, {
      viralFirst: true,
    });
  }, [size.width, size.height, displayVideos.length]);

  const floatPresets = useMemo(
    () => getFloatPresets(Math.min(size.width, size.height) || 375),
    [size.width, size.height],
  );

  const handleSelect = useCallback((video: FeedVideo) => {
    setBurstingId(video.id);
    setTimeout(() => {
      setSelected(video);
      setBurstingId(null);
    }, 420);
  }, []);

  const replaceAllBubbles = useCallback(
    (excludeIds: ReadonlySet<string>) => {
      setActiveBubbles(
        pickBubbleVideos(feedPoolRef.current, mergedContext(), {
          excludeIds,
          sessionWatchedIds: sessionWatchedIdsRef.current,
          count: BUBBLE_SLOT_COUNT,
        }),
      );
    },
    [mergedContext],
  );

  const handleClose = useCallback(
    async (report: WatchReport) => {
      const watched = selected;
      setSelected(null);
      if (!watched) return;

      sessionWatchedIdsRef.current.add(watched.id);
      applySessionWatchSignal(sessionPrefRef.current, watched, report);
      void recordWatchEngagement(watched.id, report);

      const excludeIds = new Set(activeBubbles.map((v) => v.id));

      try {
        const serverCtx = await fetchUserRecommendationContext();
        recContextRef.current = serverCtx;
        setRecContext(serverCtx);
      } catch {
        /* セッション内シグナルのみで続行 */
      }

      replaceAllBubbles(excludeIds);
    },
    [selected, activeBubbles, replaceAllBubbles],
  );

  const handleLikeEngagement = useCallback(() => {
    if (!selected) return;
    applySessionLikeSignal(sessionPrefRef.current, selected);
  }, [selected]);

  const handleCommentEngagement = useCallback(() => {
    if (!selected) return;
    applySessionCommentSignal(sessionPrefRef.current, selected);
  }, [selected]);

  const slotCount = Math.min(BUBBLE_SLOT_COUNT, placements.length);

  const toBubblePreview = useCallback(
    (video: FeedVideo): BubbleVideoPreview => ({
      id: video.id,
      title: video.title,
      creatorName: video.creatorName,
      thumbnailUrl: video.thumbnailUrl,
      clipThumbnailUrls: video.clipThumbnailUrls,
      videoUrl: video.videoUrl,
      isViralTop: video.isViralTop,
    }),
    [],
  );

  return (
    <>
      <div
        className="z-bubble-field relative min-h-0 flex-1"
        style={{ paddingBottom: bottomInset }}
        aria-label="Video bubbles"
      >
        <div
          ref={canvasRef}
          className="z-bubble-canvas absolute inset-x-0 top-0 overflow-hidden"
          style={{ bottom: bottomInset }}
        >
          {loading && displayVideos.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              読み込み中…
            </div>
          )}

          {!loading && error && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <button
                type="button"
                onClick={loadFeed}
                className="rounded-full border border-border px-4 py-2 text-xs text-foreground"
              >
                再読み込み
              </button>
            </div>
          )}

          {!loading && !error && feedPool.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <p className="text-sm text-muted">まだ投稿がありません</p>
              <Link
                href="/post"
                className="relative z-[1] rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-medium text-white"
              >
                最初のvlogを投稿
              </Link>
            </div>
          )}

          {!loading &&
            !error &&
            size.width > 0 &&
            Array.from({ length: slotCount }, (_, index) => {
              const placement = placements[index];
              const video = displayVideos[index];
              if (!placement || !video) return null;
              const preset = floatPresets[index % floatPresets.length];
              const floatStyle = {
                "--float-x": preset.floatX,
                "--float-y": preset.floatY,
                "--duration-x": preset.durationX,
                "--duration-y": preset.durationY,
                "--delay-x": preset.delayX,
                "--delay-y": preset.delayY,
              } as CSSProperties;
              const glassStyle = getBubbleGlassStyle(
                index,
                placement.y / size.height,
                Boolean(video.isViralTop),
              );

              return (
                <VideoBubble
                  key={`${index}-${video.id}`}
                  video={toBubblePreview(video)}
                  placement={placement}
                  floatStyle={floatStyle}
                  glassStyle={glassStyle}
                  isBursting={burstingId === video.id}
                  onSelect={() => handleSelect(video)}
                  zIndex={
                    video.isViralTop ? slotCount + 2 : index + 1
                  }
                />
              );
            })}
        </div>
      </div>

      {selected && (
        <FullscreenPlayer
          video={selected}
          onClose={handleClose}
          onLikeEngagement={handleLikeEngagement}
          onCommentEngagement={handleCommentEngagement}
        />
      )}
    </>
  );
}
