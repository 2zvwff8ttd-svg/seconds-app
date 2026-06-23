"use client";

import { ClipPreviewModal } from "@/components/record/ClipPreviewModal";
import { DisplayMaskMedia } from "@/components/video/DisplayMaskMedia";
import { formatClipDurationSeconds } from "@/lib/recording/format-clip-duration";
import { captureVideoFrameBlob } from "@/lib/video/frame-capture";
import type { VideoDisplayMaskShape } from "@/lib/video/display-mask";
import type { RecordedClip } from "@/types/recording";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type ClipStripProps = {
  clips: RecordedClip[];
  onRemove: (id: string) => void;
  disabled?: boolean;
  displayMaskShape: VideoDisplayMaskShape;
};

function ClipThumbnail({
  clip,
  displayMaskShape,
}: {
  clip: RecordedClip;
  displayMaskShape: VideoDisplayMaskShape;
}) {
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
      <DisplayMaskMedia shape={displayMaskShape} className="clip-strip-thumb">
        <img
          src={thumbUrl}
          alt=""
          className="clip-strip-thumb__media"
          draggable={false}
        />
      </DisplayMaskMedia>
    );
  }

  if (failed) {
    return (
      <DisplayMaskMedia
        shape={displayMaskShape}
        className="clip-strip-thumb flex flex-col items-center justify-center bg-surface-elevated px-1 text-center text-[8px] leading-tight text-muted"
      >
        サムネ
        <br />
        なし
      </DisplayMaskMedia>
    );
  }

  return (
    <DisplayMaskMedia
      shape={displayMaskShape}
      className="clip-strip-thumb flex items-center justify-center bg-surface-elevated"
    >
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
    </DisplayMaskMedia>
  );
}

function useRecordStageClipStripPortal(): boolean {
  const [portalToBody, setPortalToBody] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      setPortalToBody(root.classList.contains("record-native-preview-active"));
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return portalToBody;
}

export function ClipStrip({
  clips,
  onRemove,
  disabled,
  displayMaskShape,
}: ClipStripProps) {
  const [previewClipId, setPreviewClipId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const portalToBody = useRecordStageClipStripPortal();
  const previewClip = clips.find((clip) => clip.id === previewClipId) ?? null;
  const previewIndex = previewClip
    ? clips.findIndex((clip) => clip.id === previewClip.id)
    : -1;

  useEffect(() => {
    setMounted(true);
  }, []);

  if (clips.length === 0) return null;

  const strip = (
    <div className={`clip-strip${portalToBody ? "" : " mt-4"}`}>
      <h3 className="mb-2 text-xs font-semibold text-foreground">
        クリップ ({clips.length})
      </h3>
      <p className="mb-2 text-[10px] text-muted">タップで再生・確認</p>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {clips.map((clip, index) => (
          <li
            key={clip.id}
            className="relative shrink-0 overflow-visible border-0 bg-transparent"
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => setPreviewClipId(clip.id)}
              className="relative block disabled:opacity-40"
              aria-label={`クリップ ${index + 1} を再生`}
            >
              <ClipThumbnail clip={clip} displayMaskShape={displayMaskShape} />
              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">
                {index + 1} · {formatClipDurationSeconds(clip.durationSeconds)}s
              </span>
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(clip.id)}
              className="absolute right-0.5 top-0.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white transition hover:bg-red-500/90 disabled:opacity-40"
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
  );

  return (
    <>
      {mounted && portalToBody
        ? createPortal(strip, document.body)
        : strip}

      {previewClip && previewIndex >= 0 && (
        <ClipPreviewModal
          clip={previewClip}
          index={previewIndex}
          displayMaskShape={displayMaskShape}
          onClose={() => setPreviewClipId(null)}
          onRemove={disabled ? undefined : onRemove}
        />
      )}
    </>
  );
}
