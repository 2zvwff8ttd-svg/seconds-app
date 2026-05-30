"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { FeedVideo } from "@/types/feed";
import { MOCK_FEED } from "@/data/mock-feed";
import {
  computeBubbleLayout,
  getFloatPresets,
  type BubblePlacement,
} from "@/lib/bubble-layout";
import { VideoBubble } from "./VideoBubble";
import { FullscreenPlayer } from "./FullscreenPlayer";

export function BubbleField() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<FeedVideo | null>(null);
  const [burstingId, setBurstingId] = useState<string | null>(null);
  const videos = MOCK_FEED;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const placements = useMemo((): BubblePlacement[] => {
    if (size.width === 0 || size.height === 0) return [];
    return computeBubbleLayout(size.width, size.height, videos.length, {
      viralFirst: true,
    });
  }, [size.width, size.height, videos.length]);

  const floatPresets = useMemo(
    () => getFloatPresets(Math.min(size.width, size.height) || 375),
    [size.width, size.height],
  );

  useEffect(() => {
    const links = videos.map((v) => {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "video";
      link.href = v.videoUrl;
      document.head.appendChild(link);
      return link;
    });
    return () => links.forEach((link) => link.remove());
  }, [videos]);

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
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        aria-label="Video bubbles"
      >
        {size.width > 0 &&
          placements.map((placement, index) => {
            const video = videos[index];
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
                zIndex={video.isViralTop ? 30 : 10 + index}
              />
            );
          })}

        {placements.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Loading bubbles…
          </div>
        )}
      </div>

      {selected && <FullscreenPlayer video={selected} onClose={handleClose} />}
    </>
  );
}
