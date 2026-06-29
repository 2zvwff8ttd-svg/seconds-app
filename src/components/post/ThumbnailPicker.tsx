"use client";

import { DisplayMaskMedia } from "@/components/video/DisplayMaskMedia";
import { formatClipDurationSeconds } from "@/lib/recording/format-clip-duration";
import type { VideoDisplayMaskShape } from "@/lib/video/display-mask";
import {
  captureVideoFrameBlob,
  defaultVideoFrameSeekTime,
} from "@/lib/video/frame-capture";
import type { RecordedClip } from "@/types/recording";
import { useEffect, useRef, useState } from "react";

const SCRUB_DEBOUNCE_MS = 120;
const THUMBNAIL_CAPTURE_OPTIONS = {
  maxEdge: 640,
  jpegQuality: 0.85,
} as const;

type ThumbnailPickerProps = {
  clip: RecordedClip;
  displayMaskShape: VideoDisplayMaskShape;
  disabled?: boolean;
  onThumbnailSelected: (blob: Blob) => void;
};

export function ThumbnailPicker({
  clip,
  displayMaskShape,
  disabled = false,
  onThumbnailSelected,
}: ThumbnailPickerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(clip.durationSeconds);
  const [seekTime, setSeekTime] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [hasCustomSelection, setHasCustomSelection] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVideoReady(false);
    setHasCustomSelection(false);
    setError(null);

    const initialSeek = defaultVideoFrameSeekTime(clip.durationSeconds);
    setDuration(clip.durationSeconds);
    setSeekTime(initialSeek);
  }, [clip.id, clip.durationSeconds, clip.previewUrl]);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;

    const resolvedDuration =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : clip.durationSeconds;
    const initialSeek = defaultVideoFrameSeekTime(resolvedDuration);

    setDuration(resolvedDuration);
    setSeekTime(initialSeek);
    video.currentTime = initialSeek;
    setVideoReady(true);
  };

  useEffect(() => {
    if (!videoReady) return;

    const timer = window.setTimeout(() => {
      const video = videoRef.current;
      if (!video) return;
      if (Math.abs(video.currentTime - seekTime) < 0.04) return;
      video.currentTime = seekTime;
    }, SCRUB_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [seekTime, videoReady]);

  const handleApplyFrame = async () => {
    if (disabled || capturing) return;

    setCapturing(true);
    setError(null);

    try {
      const blob = await captureVideoFrameBlob(clip.file, {
        ...THUMBNAIL_CAPTURE_OPTIONS,
        seekTime,
      });

      setHasCustomSelection(true);
      onThumbnailSelected(blob);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "サムネイルの作成に失敗しました",
      );
    } finally {
      setCapturing(false);
    }
  };

  const handleSeekChange = (next: number) => {
    setSeekTime(next);
    if (hasCustomSelection) {
      setHasCustomSelection(false);
    }
  };

  const sliderMax = duration > 0 ? duration : Math.max(clip.durationSeconds, 0.1);
  const sliderStep =
    sliderMax > 0 ? Math.max(0.01, Math.round((sliderMax / 120) * 100) / 100) : 0.01;

  return (
    <section
      className="mt-4 rounded-xl border border-border bg-surface px-3 py-3"
      aria-labelledby="thumbnail-picker-label"
    >
      <div className="mb-3">
        <h2 id="thumbnail-picker-label" className="text-xs font-semibold text-foreground">
          サムネイル
        </h2>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
          ホームのバブルに表示される画像です。クリップ1の好きなシーンを選べます。
          {!hasCustomSelection && " 選ばない場合は自動で設定されます。"}
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <DisplayMaskMedia
          shape={displayMaskShape}
          className="thumbnail-picker__preview h-[4.5rem] w-[4.5rem] shrink-0 bg-[#050508] sm:h-20 sm:w-20"
        >
          <video
            ref={videoRef}
            src={clip.previewUrl}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
          />
        </DisplayMaskMedia>

        <div className="min-w-0 flex-1">
          <label htmlFor="thumbnail-seek" className="sr-only">
            サムネイルに使う位置
          </label>
          <input
            id="thumbnail-seek"
            type="range"
            min={0}
            max={sliderMax}
            step={sliderStep}
            value={Math.min(seekTime, sliderMax)}
            disabled={disabled || capturing || !videoReady}
            onChange={(e) => handleSeekChange(Number(e.target.value))}
            className="thumbnail-picker__slider w-full accent-violet-400 disabled:opacity-40"
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
            <span>0:00</span>
            <span className="font-medium text-foreground/90">
              {formatClipDurationSeconds(seekTime)}秒
            </span>
            <span>{formatClipDurationSeconds(sliderMax)}秒</span>
          </div>

          <button
            type="button"
            onClick={() => void handleApplyFrame()}
            disabled={disabled || capturing || !videoReady}
            className="mt-3 w-full rounded-xl border border-violet-400/40 bg-violet-500/15 px-3 py-2.5 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {capturing ? "サムネイルを作成中…" : "このフレームをサムネにする"}
          </button>

          {hasCustomSelection && !capturing && (
            <p className="mt-2 text-[10px] text-violet-200/90">
              選択したフレームがサムネイルに使われます
            </p>
          )}

          {error && (
            <p className="mt-2 text-[10px] text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
