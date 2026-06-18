"use client";

import { ClipPreviewModal } from "@/components/record/ClipPreviewModal";
import type { RecordedClip } from "@/types/recording";
import { useState } from "react";

type ClipStripProps = {
  clips: RecordedClip[];
  onRemove: (id: string) => void;
  disabled?: boolean;
};

export function ClipStrip({ clips, onRemove, disabled }: ClipStripProps) {
  const [previewClipId, setPreviewClipId] = useState<string | null>(null);
  const previewClip = clips.find((clip) => clip.id === previewClipId) ?? null;
  const previewIndex = previewClip
    ? clips.findIndex((clip) => clip.id === previewClip.id)
    : -1;

  if (clips.length === 0) return null;

  return (
    <>
      <div className="mt-4">
        <h3 className="mb-2 text-xs font-semibold text-foreground">
          クリップ ({clips.length})
        </h3>
        <p className="mb-2 text-[10px] text-muted">タップで再生・確認</p>
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {clips.map((clip, index) => (
            <li
              key={clip.id}
              className="relative shrink-0 overflow-hidden rounded-lg border border-border bg-surface"
            >
              <button
                type="button"
                disabled={disabled}
                onClick={() => setPreviewClipId(clip.id)}
                className="block disabled:opacity-40"
                aria-label={`クリップ ${index + 1} を再生`}
              >
                <video
                  src={clip.previewUrl}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-24 w-[54px] object-cover"
                />
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">
                  {index + 1} · {clip.durationSeconds}s
                </span>
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemove(clip.id)}
                className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-red-500/90 disabled:opacity-40"
                aria-label={`クリップ ${index + 1} を削除`}
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {previewClip && previewIndex >= 0 && (
        <ClipPreviewModal
          clip={previewClip}
          index={previewIndex}
          onClose={() => setPreviewClipId(null)}
          onRemove={disabled ? undefined : onRemove}
        />
      )}
    </>
  );
}
