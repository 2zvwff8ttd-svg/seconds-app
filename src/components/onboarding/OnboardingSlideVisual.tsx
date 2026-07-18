import { CrownIcon } from "@/components/home/CrownIcon";
import type { OnboardingSlide } from "@/lib/onboarding/slides";

type OnboardingSlideVisualProps = {
  slide: OnboardingSlide;
};

export function OnboardingSlideVisual({ slide }: OnboardingSlideVisualProps) {
  switch (slide.id) {
    case "intro":
      return (
        <div className="relative flex h-44 w-44 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-violet-500/20 blur-2xl" />
          <div className="relative flex h-36 w-36 flex-col items-center justify-center rounded-full border border-violet-400/40 bg-violet-500/10 shadow-[0_0_40px_rgba(167,139,250,0.25)]">
            <span className="text-3xl font-bold text-violet-200">?</span>
            <span className="mt-1 text-xs font-medium text-violet-300/90">Seconds</span>
            <span className="mt-3 rounded-full bg-black/50 px-3 py-1 text-sm font-semibold text-foreground">
              {slide.visualLabel}
            </span>
          </div>
        </div>
      );
    case "bubbles":
      return (
        <div className="relative h-44 w-56">
          <div className="absolute left-4 top-6 h-16 w-16 rounded-full border border-white/20 bg-gradient-to-br from-violet-400/30 to-fuchsia-500/20 shadow-lg" />
          <div className="absolute right-6 top-2 h-20 w-20 rounded-full border border-gold/30 bg-gradient-to-br from-gold/25 to-amber-600/10 shadow-[0_0_24px_rgba(251,191,36,0.2)]" />
          <div className="absolute bottom-4 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full border-2 border-violet-400/50 bg-violet-500/15 ring-4 ring-violet-400/20">
            <span className="flex h-full items-center justify-center text-xs font-semibold text-violet-200">
              {slide.visualLabel}
            </span>
          </div>
        </div>
      );
    case "record":
      return (
        <div className="relative flex h-44 w-44 flex-col items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-violet-500/15 blur-2xl" />
          <div className="relative flex h-32 w-32 flex-col items-center justify-center rounded-full border-2 border-violet-400/50 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 shadow-[0_0_28px_rgba(167,139,250,0.25)]">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-red-500/80 bg-red-500/15">
              <span className="h-6 w-6 rounded-full bg-red-500" />
            </div>
            <span className="mt-3 text-xs font-semibold tracking-widest text-red-400">
              {slide.visualLabel}
            </span>
          </div>
          <span className="relative mt-3 rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-medium text-violet-200/90">
            丸いシャボン玉
          </span>
        </div>
      );
    case "publish":
      return (
        <div className="flex h-44 w-52 flex-col items-center gap-3">
          <div className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-left">
            <p className="text-[10px] text-muted">今日の投稿</p>
            <p className="text-sm font-medium text-foreground">受け付け済み</p>
          </div>
          <div className="flex w-full items-center justify-center gap-2 text-violet-300">
            <span className="text-lg">↓</span>
          </div>
          <div className="w-full rounded-xl border border-violet-400/40 bg-violet-500/15 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-violet-200">
              明日 {slide.visualLabel}
            </p>
            <p className="mt-1 text-[10px] font-medium text-violet-300/80">
              10日間、シャボン玉に残る
            </p>
          </div>
        </div>
      );
    case "save-share":
      return (
        <div className="relative flex h-44 w-56 flex-col items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-violet-500/10 blur-2xl" />
          <div className="relative flex h-28 w-28 items-center justify-center rounded-full border-2 border-violet-400/40 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 shadow-[0_0_28px_rgba(167,139,250,0.22)]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-200/90">
              Video
            </span>
          </div>
          <div className="relative mt-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-elevated text-foreground shadow-md">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <path d="M12 3v12" strokeLinecap="round" />
                <path
                  d="M7 10l5 5 5-5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M5 20h14" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-elevated text-foreground shadow-md">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden
              >
                <circle cx="18" cy="5" r="2.5" />
                <circle cx="6" cy="12" r="2.5" />
                <circle cx="18" cy="19" r="2.5" />
                <path d="M8.5 10.5l7-4M8.5 13.5l7 4" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <p className="relative mt-3 text-[10px] font-medium text-muted">
            写真に保存 · 共有
          </p>
        </div>
      );
    case "viral":
      return (
        <div className="relative flex h-44 w-44 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-gold/15 blur-2xl" />
          <div
            className="pointer-events-none absolute -left-1 top-6 h-1.5 w-1.5 rounded-full bg-amber-200/80"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute right-2 top-10 h-1 w-1 rounded-full bg-gold/70"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-8 left-4 h-1 w-1 rounded-full bg-amber-100/60"
            aria-hidden
          />
          <div className="relative">
            <span className="crown-glow absolute -top-2 left-1/2 z-10 -translate-x-1/2 text-gold">
              <CrownIcon className="h-9 w-9 drop-shadow-lg" />
            </span>
            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-gold/90 via-amber-200/50 to-violet-400/40 p-[3px] shadow-[0_0_32px_var(--gold-glow)]">
              <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-black ring-1 ring-gold/40">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gold">
                  Daily #1
                </span>
                <span className="mt-0.5 text-xs font-bold text-amber-200/90">
                  {slide.visualLabel}
                </span>
              </div>
            </div>
          </div>
          <span className="absolute -bottom-1 rounded-full border border-gold/35 bg-surface-elevated px-2.5 py-0.5 text-[9px] font-medium text-amber-200/90">
            お祝いが届く
          </span>
        </div>
      );
    case "bonus":
      return (
        <div className="relative flex h-44 w-52 flex-col items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-violet-500/15 blur-2xl" />
          <div className="absolute -left-1 top-2 text-lg text-violet-300/60" aria-hidden>
            ✦
          </div>
          <div className="absolute -right-1 top-8 text-sm text-gold/70" aria-hidden>
            ✦
          </div>
          <div className="relative flex h-36 w-36 flex-col items-center justify-center rounded-full border-2 border-gold/50 bg-gradient-to-br from-violet-500/20 via-gold/20 to-fuchsia-500/15 shadow-[0_0_36px_rgba(251,191,36,0.28)]">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-gold/90">
              Bonus Day
            </span>
            <span className="mt-1 text-3xl font-bold text-amber-100">
              {slide.visualLabel}
            </span>
            <span className="mt-1 text-[10px] text-violet-200/80">最大撮影時間</span>
          </div>
          <div className="relative mt-4 flex items-center gap-3 text-[10px]">
            <span className="rounded-full border border-border/80 bg-black/40 px-2.5 py-1 text-muted line-through decoration-muted/60">
              5〜30秒
            </span>
            <span className="text-violet-300/80" aria-hidden>
              →
            </span>
            <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 font-semibold text-amber-200/95">
              5〜60秒
            </span>
          </div>
        </div>
      );
    default:
      return null;
  }
}
