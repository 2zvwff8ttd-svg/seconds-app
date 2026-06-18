"use client";

import type { RecordedClip } from "@/types/recording";

type ClipPreviewModalProps = {
  clip: RecordedClip;
  index: number;
  onClose: () => void;
  onRemove?: (id: string) => void;
};

export function ClipPreviewModal({
  clip,
  index,
  onClose,
  onRemove,
}: ClipPreviewModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={`クリップ ${index + 1} のプレビュー`}
    >
      <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div>
          <p className="text-sm font-semibold text-foreground">
            クリップ {index + 1}
          </p>
          <p className="text-[10px] text-muted">{clip.durationSeconds}秒</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground"
        >
          閉じる
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        <video
          key={clip.id}
          src={clip.previewUrl}
          controls
          playsInline
          autoPlay
          className="max-h-full max-w-full rounded-xl bg-black"
        />
      </div>

      {onRemove && (
        <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={() => {
              onRemove(clip.id);
              onClose();
            }}
            className="w-full rounded-xl border border-red-500/40 bg-red-500/10 py-3 text-sm font-medium text-red-300"
          >
            このクリップを削除
          </button>
        </div>
      )}
    </div>
  );
}
