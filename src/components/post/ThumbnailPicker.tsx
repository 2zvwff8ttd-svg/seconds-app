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
  clips: RecordedClip[];
  displayMaskShape: VideoDisplayMaskShape;
  disabled?: boolean;
  onBubbleThumbnailSelected: (clipIndex: number, blob: Blob) => void;
};

export function ThumbnailPicker({
  clips,
  displayMaskShape,
  disabled = false,
  onBubbleThumbnailSelected,
}: ThumbnailPickerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekTime, setSeekTime] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [selectedClipIndex, setSelectedClipIndex] = useState<number | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeClip = clips[activeClipIndex] ?? clips[0];
  const hasCustomSelection = selectedClipIndex !== null;
  const showClipPicker = clips.length > 1;

  useEffect(() => {
    if (activeClipIndex >= clips.length) {
      setActiveClipIndex(0);
    }
  }, [activeClipIndex, clips.length]);

  useEffect(() => {
    if (!activeClip) return;

    setVideoReady(false);
    setError(null);

    const initialSeek = defaultVideoFrameSeekTime(activeClip.durationSeconds);
    setDuration(activeClip.durationSeconds);
    setSeekTime(initialSeek);
  }, [activeClip?.id, activeClip?.durationSeconds, activeClip?.previewUrl]);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!activeClip || !video) return;

    const resolvedDuration =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : activeClip.durationSeconds;
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
    if (!activeClip || disabled || capturing) return;

    setCapturing(true);
    setError(null);

    try {
      const blob = await captureVideoFrameBlob(activeClip.file, {
        ...THUMBNAIL_CAPTURE_OPTIONS,
        seekTime,
      });

      setSelectedClipIndex(activeClipIndex);
      onBubbleThumbnailSelected(activeClipIndex, blob);
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
      setSelectedClipIndex(null);
    }
  };

  const handleClipChange = (index: number) => {
    if (index === activeClipIndex) return;
    setActiveClipIndex(index);
    if (selectedClipIndex !== null && selectedClipIndex !== index) {
      setSelectedClipIndex(null);
    }
  };

  if (!activeClip) return null;

  const sliderMax =
    duration > 0 ? duration : Math.max(activeClip.durationSeconds, 0.1);
  const sliderStep =
    sliderMax > 0 ? Math.max(0.01, Math.round((sliderMax / 120) * 100) / 100) : 0.01;

  return (
    <section
      className="mt-4 rounded-xl border border-border bg-surface px-3 py-4 sm:px-4"
      aria-labelledby="thumbnail-picker-label"
    >
      <div className="mb-4">
        <h2 id="thumbnail-picker-label" className="text-xs font-semibold text-foreground">
          サムネイル
        </h2>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
          ホームのバブルに表示される画像です。どのクリップからでも好きなシーンを選べます。
          {!hasCustomSelection && " 選ばない場合はクリップ1の自動サムネになります。"}
        </p>
      </div>

      {showClipPicker && (
        <div
          className="mb-4 flex gap-2 overflow-x-auto overscroll-x-contain pb-1"
          role="tablist"
          aria-label="サムネイルに使うクリップ"
        >
          {clips.map((clip, index) => {
            const isActive = index === activeClipIndex;
            const isSelected = index === selectedClipIndex;
            return (
              <button
                key={clip.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                disabled={disabled || capturing}
                onClick={() => handleClipChange(index)}
                className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-medium transition touch-manipulation disabled:opacity-40 ${
                  isActive
                    ? "border-violet-400/70 bg-violet-500/20 text-violet-100"
                    : "border-border bg-surface-elevated text-muted hover:border-border/80 hover:text-foreground"
                }${isSelected ? " ring-1 ring-violet-300/50" : ""}`}
              >
                クリップ {index + 1}
                <span className="mt-0.5 block text-[10px] font-normal opacity-80">
                  {formatClipDurationSeconds(clip.durationSeconds)}秒
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col items-center gap-4">
        <DisplayMaskMedia
          shape={displayMaskShape}
          className="thumbnail-picker__stage bg-[#050508]"
        >
          <video
            key={activeClip.id}
            ref={videoRef}
            src={activeClip.previewUrl}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
          />
        </DisplayMaskMedia>

        <div className="w-full">
          <label htmlFor="thumbnail-seek" className="sr-only">
            サムネイルに使う位置（クリップ {activeClipIndex + 1}）
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
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted">
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
            className="mt-4 w-full rounded-xl border border-violet-400/40 bg-violet-500/15 px-3 py-3 text-sm font-semibold text-violet-200 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {capturing ? "サムネイルを作成中…" : "このフレームをサムネにする"}
          </button>

          {hasCustomSelection && !capturing && selectedClipIndex !== null && (
            <p className="mt-2 text-center text-[10px] text-violet-200/90">
              クリップ {selectedClipIndex + 1} のフレームがホームのバブルサムネになります
            </p>
          )}

          {error && (
            <p className="mt-2 text-center text-[10px] text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
