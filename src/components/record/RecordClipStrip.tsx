"use client";

import { ClipPreviewModal } from "@/components/record/ClipPreviewModal";
import { DisplayMaskMedia } from "@/components/video/DisplayMaskMedia";
import { formatClipDurationSeconds } from "@/lib/recording/format-clip-duration";
import { DEFAULT_VIDEO_DISPLAY_MASK } from "@/lib/video/display-mask";
import { captureVideoFrameBlob } from "@/lib/video/frame-capture";
import type { RecordedClip } from "@/types/recording";
import { useEffect, useState } from "react";

type RecordClipStripProps = {
  clips: RecordedClip[];
  onRemove: (id: string) => void;
  disabled?: boolean;
};

function ClipThumbnail({ clip }: { clip: RecordedClip }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    void captureVideoFrameBlob(clip.file, {
      maxEdge: 160,
      jpegQuality: 0.75,
      metadataTimeoutMs: 8_000,
      seekTimeoutMs: 5_000,
    })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setThumbUrl(objectUrl);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [clip.file, clip.id]);

  if (thumbUrl) {
    return (
      <DisplayMaskMedia
        shape={DEFAULT_VIDEO_DISPLAY_MASK}
        className="record-clip-strip__thumb"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbUrl}
          alt=""
          className="record-clip-strip__thumb-media"
          draggable={false}
        />
      </DisplayMaskMedia>
    );
  }

  if (failed) {
    return (
      <DisplayMaskMedia
        shape={DEFAULT_VIDEO_DISPLAY_MASK}
        className="record-clip-strip__thumb record-clip-strip__thumb--empty"
      >
        <span className="text-[8px] leading-tight text-white/50">…</span>
      </DisplayMaskMedia>
    );
  }

  return (
    <DisplayMaskMedia
      shape={DEFAULT_VIDEO_DISPLAY_MASK}
      className="record-clip-strip__thumb record-clip-strip__thumb--empty"
    >
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-transparent" />
    </DisplayMaskMedia>
  );
}

/**
 * Dock-level clip strip (replaces shape picker). Tap → preview → confirm delete.
 * No direct ✕ on thumbnails.
 */
export function RecordClipStrip({
  clips,
  onRemove,
  disabled = false,
}: RecordClipStripProps) {
  const [previewClipId, setPreviewClipId] = useState<string | null>(null);
  const previewClip = clips.find((clip) => clip.id === previewClipId) ?? null;
  const previewIndex = previewClip
    ? clips.findIndex((clip) => clip.id === previewClip.id)
    : -1;

  if (clips.length === 0) return null;

  return (
    <>
      <div className="record-clip-strip" role="list" aria-label="撮ったクリップ">
        <ul className="record-clip-strip__list">
          {clips.map((clip, index) => (
            <li key={clip.id} className="record-clip-strip__item" role="listitem">
              <button
                type="button"
                disabled={disabled}
                onClick={() => setPreviewClipId(clip.id)}
                className="record-clip-strip__button"
                aria-label={`クリップ ${index + 1} を再生・確認`}
              >
                <ClipThumbnail clip={clip} />
                <span className="record-clip-strip__badge">
                  {index + 1}·{formatClipDurationSeconds(clip.durationSeconds)}s
                </span>
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
