"use client";

import { resolveBubbleThumbnailUrl } from "@/lib/videos/bubble-thumbnail";
import { useEffect, useMemo, useState } from "react";

const SLIDE_INTERVAL_MS = 1000;
const FADE_MS = 280;

type BubbleThumbnailSlideshowProps = {
  urls: string[];
};

export function BubbleThumbnailSlideshow({ urls }: BubbleThumbnailSlideshowProps) {
  const frames = useMemo(
    () =>
      urls
        .map((url) => resolveBubbleThumbnailUrl(url))
        .filter((url): url is string => Boolean(url)),
    [urls],
  );

  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (frames.length <= 1) return;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % frames.length);
    }, SLIDE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [frames.length]);

  useEffect(() => {
    for (const src of frames) {
      const img = new Image();
      img.src = src;
    }
  }, [frames]);

  if (frames.length === 0) {
    return (
      <span className="flex h-full w-full items-center justify-center bg-surface text-[10px] text-muted">
        No thumb
      </span>
    );
  }

  if (frames.length === 1) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={frames[0]}
        alt=""
        className="bubble-3d__thumb h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        draggable={false}
      />
    );
  }

  return (
    <span className="relative block h-full w-full overflow-hidden">
      {frames.map((src, frameIndex) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${src}-${frameIndex}`}
          src={src}
          alt=""
          className="bubble-3d__thumb absolute inset-0 h-full w-full object-cover transition-opacity ease-in-out"
          style={{
            opacity: frameIndex === index ? 1 : 0,
            transitionDuration: `${FADE_MS}ms`,
          }}
          loading={frameIndex <= 1 ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
        />
      ))}
    </span>
  );
}
