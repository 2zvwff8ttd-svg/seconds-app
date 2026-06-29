"use client";

import { DisplayMaskMedia } from "@/components/video/DisplayMaskMedia";
import { formatClipDurationSeconds } from "@/lib/recording/format-clip-duration";
import {
  buildNarrationFile,
  canRecordNarration,
  collectRecorderBlob,
  createNarrationMediaRecorder,
  getPreferredNarrationMimeType,
  openNarrationMicrophone,
} from "@/lib/recording/narration-recorder";
import { mergeVideoWithNarration } from "@/lib/video/merge-audio-tracks";
import type { VideoDisplayMaskShape } from "@/lib/video/display-mask";
import type { RecordedClip } from "@/types/recording";
import { useCallback, useEffect, useRef, useState } from "react";

type RecorderPhase = "idle" | "recording" | "recorded" | "previewing";

type NarrationRecorderProps = {
  clips: RecordedClip[];
  totalVideoSeconds: number;
  displayMaskShape: VideoDisplayMaskShape;
  disabled?: boolean;
  bgmActive: boolean;
  hasRecording: boolean;
  savedBlob?: Blob | null;
  savedDurationSec?: number;
  onRecorded: (blob: Blob, durationSec: number) => void;
  onClear: () => void;
};

function formatTimer(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function NarrationRecorder({
  clips,
  totalVideoSeconds,
  displayMaskShape,
  disabled = false,
  bgmActive,
  hasRecording,
  savedBlob = null,
  savedDurationSec = 0,
  onRecorded,
  onClear,
}: NarrationRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const collectPromiseRef = useRef<ReturnType<typeof collectRecorderBlob> | null>(
    null,
  );
  const playingRef = useRef(false);
  const clipIndexRef = useRef(0);
  const recordingStartRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const narrationPreviewUrlRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [recordedDurationSec, setRecordedDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [mergeProgress, setMergeProgress] = useState<number | null>(null);
  const [mergeBusy, setMergeBusy] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const busy = phase === "recording" || phase === "previewing";
  const blockedByBgm = bgmActive;
  const canUseMic = canRecordNarration();

  const stopMicStream = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
  }, []);

  const stopVideoPlayback = useCallback(() => {
    playingRef.current = false;
    const video = videoRef.current;
    if (!video) return;
    video.pause();
  }, []);

  const stopAudioPreview = useCallback(() => {
    const audio = audioPreviewRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    audioPreviewRef.current = null;
  }, []);

  const revokeLocalPreview = useCallback(() => {
    if (narrationPreviewUrlRef.current) {
      URL.revokeObjectURL(narrationPreviewUrlRef.current);
      narrationPreviewUrlRef.current = null;
    }
    setLocalPreviewUrl(null);
  }, []);

  const playClipSequence = useCallback(
    async (muted: boolean, startIndex = 0) => {
      const video = videoRef.current;
      if (!video || clips.length === 0) return;

      playingRef.current = true;
      clipIndexRef.current = startIndex;
      video.muted = muted;
      video.playsInline = true;
      video.currentTime = 0;
      video.src = clips[startIndex]?.previewUrl ?? clips[0].previewUrl;

      try {
        await video.play();
      } catch {
        playingRef.current = false;
      }
    },
    [clips],
  );

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const finishRecording = useCallback(async () => {
    clearTimer();
    stopVideoPlayback();

    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      stopMicStream();
      setPhase("idle");
      return;
    }

    try {
      const collectPromise = collectPromiseRef.current ?? collectRecorderBlob(recorder);
      recorder.stop();
      const { blob, mimeType } = await collectPromise;
      const durationSec =
        recordingStartRef.current !== null
          ? Math.max(0.1, (Date.now() - recordingStartRef.current) / 1000)
          : elapsedSec;

      revokeLocalPreview();
      const previewUrl = URL.createObjectURL(blob);
      narrationPreviewUrlRef.current = previewUrl;
      setLocalPreviewUrl(previewUrl);

      const file = buildNarrationFile(blob, mimeType);
      onRecorded(file, durationSec);
      setRecordedDurationSec(durationSec);
      setPhase("recorded");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "録音の保存に失敗しました");
      setPhase("idle");
    } finally {
      stopMicStream();
      recorderRef.current = null;
      collectPromiseRef.current = null;
      recordingStartRef.current = null;
    }
  }, [elapsedSec, onRecorded, revokeLocalPreview, stopMicStream, stopVideoPlayback]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onEnded = () => {
      if (!playingRef.current) return;

      const nextIndex = clipIndexRef.current + 1;
      if (nextIndex < clips.length) {
        clipIndexRef.current = nextIndex;
        video.src = clips[nextIndex].previewUrl;
        video.currentTime = 0;
        void video.play().catch(() => {
          playingRef.current = false;
        });
        return;
      }

      playingRef.current = false;

      if (phase === "recording") {
        void finishRecording();
        return;
      }

      if (phase === "previewing") {
        stopAudioPreview();
        setPhase(hasRecording || localPreviewUrl ? "recorded" : "idle");
      }
    };

    video.addEventListener("ended", onEnded);
    return () => video.removeEventListener("ended", onEnded);
  }, [clips, phase, hasRecording, localPreviewUrl, stopAudioPreview, finishRecording]);

  useEffect(() => {
    if (!savedBlob || localPreviewUrl) return;
    const previewUrl = URL.createObjectURL(savedBlob);
    narrationPreviewUrlRef.current = previewUrl;
    setLocalPreviewUrl(previewUrl);
    setRecordedDurationSec(savedDurationSec);
    setPhase("recorded");
  }, [savedBlob, savedDurationSec, localPreviewUrl]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      stopVideoPlayback();
      stopAudioPreview();
      stopMicStream();
      revokeLocalPreview();
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    };
  }, [revokeLocalPreview, stopAudioPreview, stopMicStream, stopVideoPlayback]);

  useEffect(() => {
    if (!hasRecording) {
      if (phase === "recorded") setPhase("idle");
      revokeLocalPreview();
    }
  }, [hasRecording, phase, revokeLocalPreview]);

  const handleStartRecording = async () => {
    if (disabled || blockedByBgm || !canUseMic || busy) return;

    setError(null);
    revokeLocalPreview();
    onClear();

    try {
      const mimeType = getPreferredNarrationMimeType();
      if (!mimeType) {
        throw new Error("この端末ではナレーション録音に対応していません");
      }

      const stream = await openNarrationMicrophone();
      micStreamRef.current = stream;

      const recorder = createNarrationMediaRecorder(stream, mimeType);
      recorderRef.current = recorder;
      collectPromiseRef.current = collectRecorderBlob(recorder);

      recordingStartRef.current = Date.now();
      setElapsedSec(0);
      setPhase("recording");

      recorder.start(250);
      await playClipSequence(true, 0);

      timerRef.current = window.setInterval(() => {
        if (recordingStartRef.current === null) return;
        setElapsedSec((Date.now() - recordingStartRef.current) / 1000);
      }, 100);
    } catch (err) {
      stopMicStream();
      stopVideoPlayback();
      setPhase("idle");
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("マイクの使用が許可されていません。設定からマイクを許可してください");
        return;
      }
      const message = err instanceof Error ? err.message : "マイクの起動に失敗しました";
      setError(message);
    }
  };

  const handleStopRecording = () => {
    void finishRecording();
  };

  const handlePreview = async () => {
    const previewUrl = localPreviewUrl;
    if (!previewUrl || disabled || busy) return;

    setError(null);
    setPhase("previewing");

    const audio = new Audio(previewUrl);
    audioPreviewRef.current = audio;

    audio.onended = () => {
      stopVideoPlayback();
      setPhase("recorded");
    };

    await playClipSequence(true, 0);

    try {
      await audio.play();
    } catch {
      stopVideoPlayback();
      setPhase("recorded");
      setError("プレビュー再生に失敗しました");
    }
  };

  const handleStopPreview = () => {
    stopAudioPreview();
    stopVideoPlayback();
    setPhase("recorded");
  };

  const handleReRecord = () => {
    stopAudioPreview();
    stopVideoPlayback();
    revokeLocalPreview();
    onClear();
    setElapsedSec(0);
    setPhase("idle");
    setError(null);
    setMergeError(null);
    setMergeProgress(null);
  };

  const handleDevMergeTest = async () => {
    const videoFile = clips[0]?.file;
    const narration = savedBlob;
    if (!videoFile || !narration || mergeBusy) return;

    setMergeBusy(true);
    setMergeError(null);
    setMergeProgress(0);

    try {
      const merged = await mergeVideoWithNarration(videoFile, narration, {
        videoDurationSec: totalVideoSeconds,
        onProgress: (ratio) => setMergeProgress(ratio),
      });

      const url = URL.createObjectURL(merged);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = merged.name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setMergeProgress(1);
    } catch (err) {
      setMergeError(
        err instanceof Error ? err.message : "MP4合成テストに失敗しました",
      );
      setMergeProgress(null);
    } finally {
      setMergeBusy(false);
    }
  };

  const showRecordedActions = phase === "recorded" || (hasRecording && phase !== "recording");

  return (
    <section
      className="mt-4 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-4 sm:px-4"
      aria-labelledby="narration-recorder-label"
    >
      <div className="mb-3">
        <h2 id="narration-recorder-label" className="text-xs font-semibold text-cyan-100">
          ナレーション
        </h2>
        <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
          動画全体（{formatClipDurationSeconds(totalVideoSeconds)}秒）に合わせて吹き込みます。
          録音中は下の動画が再生されます（動画の音は録音されません）。
        </p>
      </div>

      {blockedByBgm && (
        <p className="mb-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-100/90">
          BGM を OFF にするとナレーションを録音できます
        </p>
      )}

      {!canUseMic && (
        <p className="mb-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-[10px] text-red-300">
          この端末のブラウザではナレーション録音に対応していません
        </p>
      )}

      <div className="flex flex-col items-center gap-4">
        <DisplayMaskMedia
          shape={displayMaskShape}
          className={`narration-recorder__stage bg-[#050508]${phase === "recording" ? " ring-2 ring-red-400/70" : ""}`}
        >
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        </DisplayMaskMedia>

        {phase === "recording" && (
          <p className="flex items-center gap-2 text-xs font-medium text-red-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" aria-hidden />
            録音中 {formatTimer(elapsedSec)}
          </p>
        )}

        <div className="flex w-full flex-col gap-2 sm:flex-row">
          {phase === "idle" && (
            <button
              type="button"
              onClick={() => void handleStartRecording()}
              disabled={disabled || blockedByBgm || !canUseMic}
              className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              録音開始（動画を再生しながら）
            </button>
          )}

          {phase === "recording" && (
            <button
              type="button"
              onClick={handleStopRecording}
              className="flex-1 rounded-xl border border-red-400/50 bg-red-500/20 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/30"
            >
              録音停止
            </button>
          )}

          {showRecordedActions && phase !== "previewing" && (
            <>
              <button
                type="button"
                onClick={() => void handlePreview()}
                disabled={disabled || !localPreviewUrl}
                className="flex-1 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/25 disabled:opacity-40"
              >
                プレビュー（動画＋声）
              </button>
              <button
                type="button"
                onClick={handleReRecord}
                disabled={disabled}
                className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-elevated disabled:opacity-40"
              >
                録り直す
              </button>
            </>
          )}

          {phase === "previewing" && (
            <button
              type="button"
              onClick={handleStopPreview}
              className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground"
            >
              プレビュー停止
            </button>
          )}
        </div>

        {showRecordedActions && phase !== "previewing" && (
          <p className="text-center text-[10px] text-cyan-100/80">
            録音 {formatClipDurationSeconds(recordedDurationSec || elapsedSec)}秒 — 投稿への反映は
            Stage 3 で有効化予定（開発用）
          </p>
        )}

        {showRecordedActions && phase !== "previewing" && savedBlob && clips[0] && (
          <div className="w-full rounded-xl border border-dashed border-cyan-400/30 bg-black/20 px-3 py-3">
            <p className="text-[10px] font-medium text-cyan-100/90">
              開発用: MP4 合成テスト（Stage 2）
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted">
              クリップ1の動画 + ナレーションを ffmpeg で1本の MP4 に合成してダウンロードします。
              {clips.length > 1 && " 複数クリップ時は結合前のクリップ1のみを使用します。"}
            </p>
            <button
              type="button"
              onClick={() => void handleDevMergeTest()}
              disabled={disabled || mergeBusy || busy}
              className="mt-3 w-full rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-3 py-2.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-40"
            >
              {mergeBusy
                ? `MP4合成中… ${mergeProgress !== null ? `${Math.round(mergeProgress * 100)}%` : ""}`
                : "MP4に合成してダウンロード（開発）"}
            </button>
            {mergeError && (
              <p className="mt-2 text-[10px] text-red-400" role="alert">
                {mergeError}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="w-full rounded-lg bg-red-500/10 px-3 py-2 text-center text-[10px] text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
