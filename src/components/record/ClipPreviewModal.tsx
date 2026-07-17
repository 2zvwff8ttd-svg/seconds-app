"use client";

import { DisplayMaskMedia } from "@/components/video/DisplayMaskMedia";
import { DEFAULT_VIDEO_DISPLAY_MASK } from "@/lib/video/display-mask";
import type { RecordedClip } from "@/types/recording";
import { useEffect, useRef, useState } from "react";
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
 * Tap the video to play/pause — no chrome controls or play button overlay.
 * Stacks above post-nav sheet (z=410) via --z-modal (500) and hides nav while open.
 */
export function ClipPreviewModal({
  clip,
  index,
  onClose,
  onRemove,
}: ClipPreviewModalProps) {
  const [mounted, setMounted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("clip-preview-open");
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.classList.remove("clip-preview-open");
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
      className="clip-preview-modal fixed inset-0 z-modal flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`クリップ ${index + 1} のプレビュー`}
    >
      <div className="relative z-[1] flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            クリップ {index + 1}
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

      <div className="relative z-0 flex min-h-0 flex-1 items-center justify-center px-2 pb-2">
        <DisplayMaskMedia
          shape={DEFAULT_VIDEO_DISPLAY_MASK}
          className="clip-preview-mask-stage clip-preview-mask-stage--raised"
        >
          <video
            ref={videoRef}
            key={clip.id}
            src={clip.previewUrl}
            playsInline
            autoPlay
            onClick={togglePlayback}
            aria-label="タップで再生または停止"
          />
        </DisplayMaskMedia>
      </div>

      {onRemove && (
        <div className="relative z-[1] shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
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
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full rounded-xl border border-red-400/35 bg-red-500/10 py-3 text-sm font-medium text-red-200 touch-manipulation"
            >
              このクリップを削除…
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
