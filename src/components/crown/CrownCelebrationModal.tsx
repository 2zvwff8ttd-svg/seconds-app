"use client";

import {
  markCrownCelebrationSeen,
  type PendingCrownCelebration,
} from "@/lib/crown/celebration";
import { useCallback, useEffect, useState } from "react";

type CrownCelebrationModalProps = {
  celebration: PendingCrownCelebration;
  onDismissed: () => void;
};

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M3 7.5 6.5 12l3.2-5.2L12 13l2.3-6.2L17.5 12 21 7.5V18H3V7.5Z" />
      <path d="M3 18h18v2H3v-2Z" opacity="0.85" />
    </svg>
  );
}

export function CrownCelebrationModal({
  celebration,
  onDismissed,
}: CrownCelebrationModalProps) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const dismiss = useCallback(async () => {
    if (closing) return;
    setClosing(true);
    setVisible(false);
    try {
      await markCrownCelebrationSeen(celebration.id);
    } finally {
      window.setTimeout(() => onDismissed(), 280);
    }
  }, [celebration.id, closing, onDismissed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center px-6 transition-opacity duration-300 ${
        visible && !closing ? "opacity-100" : "opacity-0"
      }`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="crown-celebration-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#010102]/92 backdrop-blur-sm"
        aria-label="閉じる"
        onClick={() => void dismiss()}
      />

      <div
        className={`relative z-10 w-full max-w-sm text-center transition-transform duration-300 ${
          visible && !closing ? "translate-y-0 scale-100" : "translate-y-3 scale-[0.97]"
        }`}
      >
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[2rem]">
          <span className="crown-celebration-star absolute left-[12%] top-[18%] h-1 w-1 rounded-full bg-white/70" />
          <span className="crown-celebration-star absolute right-[18%] top-[28%] h-1.5 w-1.5 rounded-full bg-amber-100/80" />
          <span className="crown-celebration-star absolute left-[22%] bottom-[30%] h-1 w-1 rounded-full bg-violet-100/70" />
          <span className="crown-celebration-star absolute right-[14%] bottom-[24%] h-1 w-1 rounded-full bg-white/50" />
        </div>

        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-b from-amber-200/30 to-amber-600/10 ring-1 ring-amber-200/40">
          <CrownIcon className="crown-glow--hero h-12 w-12 text-amber-300" />
        </div>

        <p className="mb-2 text-xs font-medium tracking-[0.2em] text-amber-200/80">
          DAILY #1
        </p>
        <h2
          id="crown-celebration-title"
          className="text-balance text-2xl font-semibold leading-snug text-white"
        >
          あなたの動画が
          <br />
          1位になりました
        </h2>
        <p className="mt-3 text-sm text-white/60">
          昨日、いちばん視聴されたシャボン玉です
        </p>

        {celebration.thumbnailUrl ? (
          <div className="mx-auto mt-6 h-28 w-28 overflow-hidden rounded-full ring-2 ring-amber-200/35">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={celebration.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ) : null}

        <p className="mt-4 line-clamp-2 text-sm font-medium text-white/85">
          {celebration.title}
        </p>

        <button
          type="button"
          onClick={() => void dismiss()}
          className="mt-8 w-full rounded-full bg-amber-200/95 px-5 py-3 text-sm font-semibold text-[#1a1205] transition hover:bg-amber-100"
        >
          シャボン玉を見にいく
        </button>
      </div>
    </div>
  );
}
