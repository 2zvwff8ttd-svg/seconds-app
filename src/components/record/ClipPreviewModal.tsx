"use client";

import { DisplayMaskMedia } from "@/components/video/DisplayMaskMedia";
import { DEFAULT_VIDEO_DISPLAY_MASK } from "@/lib/video/display-mask";
import { formatClipDurationSeconds } from "@/lib/recording/format-clip-duration";
import type { RecordedClip } from "@/types/recording";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ClipPreviewModalProps = {
  clip: RecordedClip;
  index: number;
  onClose: () => void;
  /** Called after user confirms delete. Modal closes afterward (no auto-advance). */
  onRemove?: (id: string) => void;
};

/**
 * Fullscreen clip playback. Delete requires an explicit confirm step.
 * Close (primary, top-right + bottom) vs Delete (secondary, muted destructive) are visually distinct.
 */
export function ClipPreviewModal({
  clip,
  index,
  onClose,
  onRemove,
}: ClipPreviewModalProps) {
  const [mounted, setMounted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    setConfirmDelete(false);
  }, [clip.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (confirmDelete) {
          setConfirmDelete(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[400] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`クリップ ${index + 1} のプレビュー`}
    >
      <div className="relative z-[410] flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            クリップ {index + 1}
          </p>
          <p className="text-[10px] text-white/60">
            {formatClipDurationSeconds(clip.durationSeconds)}秒
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full bg-white text-black touch-manipulation"
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

      <div className="relative z-[405] flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        <DisplayMaskMedia
          shape={DEFAULT_VIDEO_DISPLAY_MASK}
          className="clip-preview-mask-stage"
        >
          <video
            key={clip.id}
            src={clip.previewUrl}
            controls
            playsInline
            autoPlay
          />
        </DisplayMaskMedia>
      </div>

      <div className="relative z-[410] shrink-0 space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        {confirmDelete ? (
          <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-center text-sm font-medium text-white">
              このクリップを削除しますか？
            </p>
            <p className="text-center text-[11px] text-white/55">
              秒数は戻ります。投稿には残りクリップだけが使われます。
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-xl bg-white py-3.5 text-sm font-semibold text-black touch-manipulation"
              >
                やめる
              </button>
              <button
                type="button"
                onClick={() => {
                  onRemove?.(clip.id);
                  onClose();
                }}
                className="flex-1 rounded-xl border border-red-400/50 bg-transparent py-3.5 text-sm font-medium text-red-300 touch-manipulation"
              >
                削除する
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-white py-3.5 text-sm font-semibold text-black touch-manipulation"
            >
              閉じる
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-full rounded-xl border border-white/20 bg-transparent py-3 text-sm font-medium text-white/70 touch-manipulation"
              >
                このクリップを削除…
              </button>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
