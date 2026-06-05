"use client";

import { OnboardingSlideVisual } from "@/components/onboarding/OnboardingSlideVisual";
import { ONBOARDING_SLIDES } from "@/lib/onboarding/slides";
import { markOnboardingComplete } from "@/lib/onboarding/state";
import { useCallback, useRef, useState } from "react";

type OnboardingCarouselProps = {
  onComplete: () => void;
};

export function OnboardingCarousel({ onComplete }: OnboardingCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLast = activeIndex >= ONBOARDING_SLIDES.length - 1;

  const updateIndexFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientWidth <= 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActiveIndex(Math.min(Math.max(0, index), ONBOARDING_SLIDES.length - 1));
  }, []);

  const scrollToIndex = (index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  };

  const handleStart = async () => {
    setError(null);
    setCompleting(true);
    try {
      await markOnboardingComplete();
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
      setCompleting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-black">
      <div className="shrink-0 px-6 pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
        <p className="text-xs font-medium tracking-wider text-violet-300/90">
          はじめに
        </p>
        <p className="mt-1 text-[10px] text-muted">
          スワイプで次へ · {activeIndex + 1} / {ONBOARDING_SLIDES.length}
        </p>
      </div>

      <div
        ref={scrollRef}
        onScroll={updateIndexFromScroll}
        className="onboarding-scroll flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth"
        aria-roledescription="carousel"
        aria-label="オンボーディング"
      >
        {ONBOARDING_SLIDES.map((slide, index) => (
          <section
            key={slide.id}
            className="flex w-full shrink-0 snap-center snap-always flex-col items-center justify-center px-8"
            aria-roledescription="slide"
            aria-label={`${index + 1} / ${ONBOARDING_SLIDES.length}`}
          >
            <OnboardingSlideVisual slide={slide} />
            <h2 className="mt-10 max-w-sm text-center text-xl font-bold text-foreground">
              {slide.title}
            </h2>
            <p className="mt-4 max-w-sm text-center text-sm leading-relaxed text-muted">
              {slide.description}
            </p>
          </section>
        ))}
      </div>

      <div className="shrink-0 px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <div
          className="mb-6 flex justify-center gap-2"
          role="tablist"
          aria-label="スライドの位置"
        >
          {ONBOARDING_SLIDES.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={`スライド ${index + 1}`}
              onClick={() => scrollToIndex(index)}
              className={`h-2 rounded-full transition-all ${
                index === activeIndex
                  ? "w-6 bg-violet-400"
                  : "w-2 bg-white/20 hover:bg-white/35"
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="mb-3 text-center text-xs text-red-400">{error}</p>
        )}

        {isLast ? (
          <button
            type="button"
            disabled={completing}
            onClick={() => void handleStart()}
            className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3.5 text-base font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:opacity-90 disabled:opacity-50"
          >
            {completing ? "準備中…" : "はじめる"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => scrollToIndex(activeIndex + 1)}
            className="w-full rounded-xl border border-border bg-surface py-3.5 text-base font-semibold text-foreground transition hover:bg-surface-elevated"
          >
            次へ
          </button>
        )}
      </div>
    </div>
  );
}
