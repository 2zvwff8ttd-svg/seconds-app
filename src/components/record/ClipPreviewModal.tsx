"use client";

import { DisplayMaskMedia } from "@/components/video/DisplayMaskMedia";
import type { VideoDisplayMaskShape } from "@/lib/video/display-mask";
import type { RecordedClip } from "@/types/recording";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ClipPreviewModalProps = {
  clip: RecordedClip;
  index: number;
  displayMaskShape: VideoDisplayMaskShape;
  onClose: () => void;
  onRemove?: (id: string) => void;
};

export function ClipPreviewModal({
  clip,
  index,
  displayMaskShape,
  onClose,
  onRemove,
}: ClipPreviewModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`クリップ ${index + 1} のプレビュー`}
    >
      <div className="relative z-[210] flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            クリップ {index + 1}
          </p>
          <p className="text-[10px] text-white/60">{clip.durationSeconds}秒</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm touch-manipulation"
          aria-label="閉じる"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="relative z-[205] flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        <DisplayMaskMedia shape={displayMaskShape} className="clip-preview-mask-stage">
          <video
            key={clip.id}
            src={clip.previewUrl}
            controls
            playsInline
            autoPlay
          />
        </DisplayMaskMedia>
      </div>

      <div className="relative z-[210] shrink-0 space-y-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-white/15 py-3.5 text-sm font-semibold text-white touch-manipulation"
        >
          閉じる
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={() => {
              onRemove(clip.id);
              onClose();
            }}
            className="w-full rounded-xl border border-red-500/40 bg-red-500/10 py-3 text-sm font-medium text-red-300 touch-manipulation"
          >
            このクリップを削除
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
