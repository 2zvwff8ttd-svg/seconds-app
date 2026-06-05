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
        <div className="flex h-44 w-44 flex-col items-center justify-center rounded-3xl border border-border bg-surface-elevated p-6 shadow-xl">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-red-500/80 bg-red-500/15">
            <span className="h-8 w-8 rounded-full bg-red-500" />
          </div>
          <span className="mt-4 text-sm font-semibold tracking-widest text-red-400">
            {slide.visualLabel}
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
          </div>
        </div>
      );
    case "viral":
      return (
        <div className="relative flex h-44 w-44 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-gold/15 blur-2xl" />
          <div className="relative">
            <span className="crown-glow absolute -top-2 left-1/2 z-10 -translate-x-1/2 text-gold">
              <CrownIcon className="h-9 w-9 drop-shadow-lg" />
            </span>
            <div className="flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-gold/90 via-amber-200/50 to-violet-400/40 p-[3px] shadow-[0_0_32px_var(--gold-glow)]">
              <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-black ring-1 ring-gold/40">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gold">
                  Daily Viral
                </span>
                <span className="mt-0.5 text-xs font-bold text-amber-200/90">
                  {slide.visualLabel}
                </span>
              </div>
            </div>
          </div>
          <span className="absolute -bottom-1 rounded-full border border-border bg-surface-elevated px-2.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted">
            JP
          </span>
        </div>
      );
    default:
      return null;
  }
}
