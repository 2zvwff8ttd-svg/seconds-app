"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { FeedVideo } from "@/types/feed";
import { fetchHomeFeed } from "@/lib/videos/feed";
import {
  computeBubbleLayout,
  getFloatPresets,
  type BubblePlacement,
} from "@/lib/bubble-layout";
import { VideoBubble } from "./VideoBubble";
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
  const [videos, setVideos] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { videos: feedVideos, countryCode } = await fetchHomeFeed();
      setVideos(feedVideos);
      onCountryChange?.(countryCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "フィードの取得に失敗しました");
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, [onCountryChange]);

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

  const displayVideos = useMemo(() => {
    if (videos.length > 0) return videos.slice(0, 6);
    return [];
  }, [videos]);

  const placements = useMemo((): BubblePlacement[] => {
    if (size.width === 0 || size.height === 0 || displayVideos.length === 0) {
      return [];
    }
    return computeBubbleLayout(size.width, size.height, displayVideos.length, {
      viralFirst: true,
    });
  }, [size.width, size.height, displayVideos.length]);

  const floatPresets = useMemo(
    () => getFloatPresets(Math.min(size.width, size.height) || 375),
    [size.width, size.height],
  );

  useEffect(() => {
    const links = displayVideos.map((v) => {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "video";
      link.href = v.videoUrl;
      document.head.appendChild(link);
      return link;
    });
    return () => links.forEach((link) => link.remove());
  }, [displayVideos]);

  const handleSelect = useCallback((video: FeedVideo) => {
    setBurstingId(video.id);
    setTimeout(() => {
      setSelected(video);
      setBurstingId(null);
    }, 420);
  }, []);

  const handleClose = useCallback(() => setSelected(null), []);

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
          {loading && (
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

          {!loading && !error && displayVideos.length === 0 && (
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
            placements.map((placement, index) => {
              const video = displayVideos[index];
              if (!video) return null;
              const preset = floatPresets[index % floatPresets.length];
              const floatStyle = {
                "--float-x": preset.floatX,
                "--float-y": preset.floatY,
                "--duration-x": preset.durationX,
                "--duration-y": preset.durationY,
                "--delay-x": preset.delayX,
                "--delay-y": preset.delayY,
              } as CSSProperties;

              return (
                <VideoBubble
                  key={video.id}
                  video={video}
                  placement={placement}
                  floatStyle={floatStyle}
                  isBursting={burstingId === video.id}
                  onSelect={() => handleSelect(video)}
                  zIndex={index + 1}
                />
              );
            })}
        </div>
      </div>

      {selected && <FullscreenPlayer video={selected} onClose={handleClose} />}
    </>
  );
}
