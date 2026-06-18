"use client";

import type { CameraRecorderProps } from "@/components/record/camera-recorder-types";
import { TimeBudgetGauge } from "@/components/record/TimeBudgetGauge";
import { sumRecordedClipSeconds } from "@/lib/recording/clip-budget";
import { fetchTodayAssignedSeconds } from "@/lib/recording/daily-assignment";
import { getMinRecordingMs } from "@/lib/recording/recorder-utils";
import {
  flipNativeCamera,
  NATIVE_CAMERA_PREVIEW_ID,
  startNativePreview,
  startNativeRecording,
  stopNativePreview,
  stopNativeRecording,
  syncNativePreviewLayout,
} from "@/lib/recording/native-camera-preview";
import {
  describePreviewRectFailure,
  logPreviewRectFailure,
  readPreviewRect,
  resolvePreviewRect,
} from "@/lib/recording/native-preview-rect";
import { formatNativeRecordingError } from "@/lib/recording/native-recording-error";
import { nativeVideoPathToFile } from "@/lib/recording/native-recording-file";
import {
  measureRecordingSeconds,
  scheduleRecordingAutoStop,
} from "@/lib/recording/recording-timer";
import { getVideoDuration } from "@/lib/video/media";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function facingToPosition(mode: "user" | "environment"): "front" | "rear" {
  return mode === "user" ? "front" : "rear";
}

export function NativeCameraRecorder({
  clips,
  onClipAdded,
  disabled = false,
}: CameraRecorderProps) {
  const previewHostRef = useRef<HTMLDivElement>(null);
  const recordingStartRef = useRef<number | null>(null);
  const recordBudgetRef = useRef(0);
  const finishingRef = useRef(false);
  const previewStartedRef = useRef(false);
  const cancelAutoStopRef = useRef<(() => void) | null>(null);
  const tickRef = useRef<number | null>(null);
  const lastRecordActionRef = useRef(0);

  const [assignedSeconds, setAssignedSeconds] = useState<number | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [isRecording, setIsRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [recordingStarting, setRecordingStarting] = useState(false);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const usedClipSeconds = useMemo(() => sumRecordedClipSeconds(clips), [clips]);

  const remainingSeconds = useMemo(() => {
    void tick;
    if (assignedSeconds === null) return 0;
    const elapsed =
      isRecording && recordingStartRef.current
        ? measureRecordingSeconds(recordingStartRef.current)
        : 0;
    return Math.max(0, assignedSeconds - usedClipSeconds - elapsed);
  }, [assignedSeconds, usedClipSeconds, isRecording, tick]);

  const getPreviewHost = useCallback(() => previewHostRef.current, []);

  const resolveRect = useCallback(async () => {
    return resolvePreviewRect(getPreviewHost);
  }, [getPreviewHost]);

  const clearTick = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const clearAutoStop = useCallback(() => {
    cancelAutoStopRef.current?.();
    cancelAutoStopRef.current = null;
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("record-native-preview-active");
    document.body.classList.add("record-native-preview-active");
    return () => {
      document.documentElement.classList.remove("record-native-preview-active");
      document.body.classList.remove("record-native-preview-active");
    };
  }, []);

  useEffect(() => {
    fetchTodayAssignedSeconds()
      .then(setAssignedSeconds)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "秒数の取得に失敗しました");
      });
  }, []);

  const addRecordedClip = useCallback(
    (file: File, durationSeconds: number) => {
      const previewUrl = URL.createObjectURL(file);
      onClipAdded({
        id: crypto.randomUUID(),
        file,
        previewUrl,
        durationSeconds,
      });
      setTick((t) => t + 1);
    },
    [onClipAdded],
  );

  const ensurePreview = useCallback(async () => {
    if (isRecording || previewStartedRef.current) return false;

    const rect = await resolveRect();
    if (!rect) {
      const host = getPreviewHost();
      logPreviewRectFailure("ensurePreview", host);
      setError(describePreviewRectFailure(host));
      return false;
    }

    setCameraStarting(true);
    setError(null);
    try {
      await startNativePreview({
        ...rect,
        position: facingToPosition(facingMode),
      });
      previewStartedRef.current = true;
      setCameraReady(true);
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "カメラプレビューの起動に失敗しました",
      );
      setCameraReady(false);
      previewStartedRef.current = false;
      return false;
    } finally {
      setCameraStarting(false);
    }
  }, [facingMode, getPreviewHost, isRecording, resolveRect]);

  useEffect(() => {
    if (assignedSeconds === null || disabled) return;

    const boot = window.setTimeout(() => {
      void ensurePreview();
    }, 120);

    return () => window.clearTimeout(boot);
  }, [assignedSeconds, disabled, ensurePreview]);

  const syncPreviewLayout = useCallback(async () => {
    if (isRecording || !previewStartedRef.current) return;
    const rect = await resolveRect();
    if (!rect) return;
    try {
      await syncNativePreviewLayout({
        ...rect,
        position: facingToPosition(facingMode),
      });
    } catch (err) {
      console.warn("[NativeCameraRecorder] syncPreviewLayout", err);
    }
  }, [facingMode, isRecording, resolveRect]);

  useEffect(() => {
    const host = previewHostRef.current;
    if (!host || assignedSeconds === null || disabled) return;

    const observer = new ResizeObserver(() => {
      if (previewStartedRef.current && !isRecording && !cameraStarting) {
        void syncPreviewLayout();
        return;
      }
      if (previewStartedRef.current || isRecording || cameraStarting) return;
      const rect = readPreviewRect(host);
      if (!rect) return;
      void ensurePreview();
    });

    observer.observe(host);
    return () => observer.disconnect();
  }, [
    assignedSeconds,
    cameraStarting,
    disabled,
    ensurePreview,
    isRecording,
    syncPreviewLayout,
  ]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onViewportChange = () => {
      void syncPreviewLayout();
    };
    vv.addEventListener("resize", onViewportChange);
    vv.addEventListener("scroll", onViewportChange);
    return () => {
      vv.removeEventListener("resize", onViewportChange);
      vv.removeEventListener("scroll", onViewportChange);
    };
  }, [syncPreviewLayout]);

  useEffect(() => {
    return () => {
      clearAutoStop();
      clearTick();
      recordingStartRef.current = null;
      void stopNativePreview().catch(() => {});
      previewStartedRef.current = false;
    };
  }, [clearAutoStop, clearTick]);

  const finishRecording = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    clearAutoStop();
    clearTick();

    const elapsed = measureRecordingSeconds(recordingStartRef.current);
    const budget = recordBudgetRef.current;
    recordingStartRef.current = null;
    setIsRecording(false);

    try {
      const { videoFilePath } = await stopNativeRecording();
      const file = await nativeVideoPathToFile(videoFilePath);
      const rawDuration = await getVideoDuration(file);
      const durationSeconds = Math.min(
        budget,
        Math.max(0.1, rawDuration || elapsed || 0.1),
      );
      addRecordedClip(file, durationSeconds);
      setError(null);
    } catch (err) {
      setError(formatNativeRecordingError(err));
    } finally {
      finishingRef.current = false;
    }
  }, [addRecordedClip, clearAutoStop, clearTick]);

  const finishRecordingRef = useRef(finishRecording);
  finishRecordingRef.current = finishRecording;

  const stopRecording = useCallback(async () => {
    if (!isRecording || finishingRef.current) return;

    if (recordingStartRef.current) {
      const minMs = getMinRecordingMs();
      const elapsedMs = Date.now() - recordingStartRef.current;
      if (elapsedMs < minMs) {
        await waitMs(minMs - elapsedMs);
      }
    }

    await finishRecordingRef.current();
  }, [isRecording]);

  const beginRecording = useCallback(async () => {
    if (assignedSeconds === null || isRecording || disabled) return;
    const budget = assignedSeconds - usedClipSeconds;
    if (budget <= 0) return;

    const rect = await resolveRect();
    if (!rect) {
      const host = getPreviewHost();
      logPreviewRectFailure("beginRecording", host);
      setError(describePreviewRectFailure(host));
      return;
    }

    if (!cameraReady) {
      const started = await ensurePreview();
      if (!started) {
        setError((prev) => prev ?? "カメラプレビューの起動に失敗しました");
        return;
      }
    }

    const recordRect = await resolveRect();
    if (!recordRect) {
      const host = getPreviewHost();
      logPreviewRectFailure("beginRecording(final)", host);
      setError(describePreviewRectFailure(host));
      return;
    }

    setError(null);
    finishingRef.current = false;
    recordBudgetRef.current = budget;
    setRecordingStarting(true);

    try {
      console.info(
        `[NativeCameraRecorder] startNativeRecording: ${recordRect.width}×${recordRect.height} at ${recordRect.x},${recordRect.y}`,
      );
      await startNativeRecording({
        ...recordRect,
        position: facingToPosition(facingMode),
      });
    } catch (err) {
      clearAutoStop();
      clearTick();
      recordingStartRef.current = null;
      setIsRecording(false);
      setError(formatNativeRecordingError(err));
      return;
    } finally {
      setRecordingStarting(false);
    }

    setIsRecording(true);
    recordingStartRef.current = Date.now();

    tickRef.current = window.setInterval(() => {
      setTick((t) => t + 1);
    }, 100);

    clearAutoStop();
    cancelAutoStopRef.current = scheduleRecordingAutoStop(budget, () => {
      void finishRecordingRef.current();
    });
  }, [
    assignedSeconds,
    cameraReady,
    clearAutoStop,
    clearTick,
    disabled,
    ensurePreview,
    facingMode,
    getPreviewHost,
    isRecording,
    resolveRect,
    usedClipSeconds,
  ]);

  const handleRecordPress = useCallback(async () => {
    if (disabled || cameraStarting || recordingStarting || finishingRef.current) return;

    if (isRecording) {
      await stopRecording();
      return;
    }

    if (remainingSeconds <= 0) {
      setError("今日の撮影時間を使い切りました");
      return;
    }

    await beginRecording();
  }, [
    beginRecording,
    cameraStarting,
    disabled,
    isRecording,
    recordingStarting,
    remainingSeconds,
    stopRecording,
  ]);

  const invokeRecordPress = useCallback(() => {
    const now = Date.now();
    if (now - lastRecordActionRef.current < 350) return;
    lastRecordActionRef.current = now;
    void handleRecordPress();
  }, [handleRecordPress]);

  const switchCamera = useCallback(async () => {
    if (isRecording || disabled || cameraStarting) return;
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    if (!cameraReady) return;

    try {
      await flipNativeCamera();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "カメラの切り替えに失敗しました",
      );
    }
  }, [cameraReady, cameraStarting, disabled, facingMode, isRecording]);

  const gaugeRecordingElapsed =
    isRecording && recordingStartRef.current
      ? measureRecordingSeconds(recordingStartRef.current)
      : 0;

  const canRecord =
    assignedSeconds !== null &&
    remainingSeconds > 0 &&
    !disabled &&
    !cameraStarting &&
    !recordingStarting &&
    !finishingRef.current;

  return (
    <div className="native-camera-shell overflow-hidden rounded-2xl border border-border bg-transparent">
      <div
        id={NATIVE_CAMERA_PREVIEW_ID}
        ref={previewHostRef}
        className="native-camera-preview-host bg-transparent"
      >
        <TimeBudgetGauge
          assignedSeconds={assignedSeconds}
          usedSeconds={usedClipSeconds}
          recordingElapsed={gaugeRecordingElapsed}
        />

        <div
          className="native-camera-preview-mask pointer-events-none absolute inset-0 z-10"
          aria-hidden
        />

        {recordingStarting && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 text-sm font-medium text-foreground">
            録画を開始しています…
          </div>
        )}

        {!cameraReady && !isRecording && !error && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 px-6 text-center">
            <p className="text-sm font-medium text-foreground">カメラを準備中…</p>
            <p className="mt-1 text-xs text-muted">アプリ内プレビューで録画します</p>
          </div>
        )}

        {cameraStarting && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 text-sm text-muted">
            カメラを起動中…
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-end bg-gradient-to-b from-black/50 to-transparent px-3 pb-6 pt-5">
          <button
            type="button"
            onClick={() => void switchCamera()}
            disabled={isRecording || cameraStarting || disabled || !cameraReady}
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition hover:bg-black/70 disabled:opacity-40"
            aria-label="カメラ切り替え"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h4l2-3h8l2 3h4v12H4V7z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </button>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center bg-gradient-to-t from-black/80 to-transparent pb-6 pt-10">
          {isRecording && (
            <span className="mb-3 flex items-center gap-2 text-xs font-medium text-red-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              録画中
            </span>
          )}

          {!canRecord &&
            !isRecording &&
            assignedSeconds !== null &&
            usedClipSeconds >= assignedSeconds && (
              <p className="mb-3 text-xs text-red-400">撮影時間を使い切りました</p>
            )}

          <button
            type="button"
            onClick={invokeRecordPress}
            onPointerUp={(e) => {
              if (e.pointerType === "touch") {
                e.preventDefault();
                invokeRecordPress();
              }
            }}
            disabled={(!canRecord && !isRecording) || cameraStarting || recordingStarting}
            className={`pointer-events-auto relative flex h-16 w-16 items-center justify-center rounded-full border-4 transition touch-manipulation select-none disabled:cursor-not-allowed disabled:opacity-40 ${
              isRecording
                ? "border-red-500/80 bg-red-500/20"
                : "border-white/90 bg-white/10 hover:bg-white/20"
            }`}
            aria-label={isRecording ? "録画を停止" : "録画を開始"}
          >
            <span
              className={`block transition ${
                isRecording
                  ? "h-6 w-6 rounded-sm bg-red-500"
                  : "h-12 w-12 rounded-full bg-red-500"
              }`}
            />
          </button>

          <p className="mt-3 text-[10px] text-muted">
            {clips.length > 0
              ? `${clips.length}クリップ · 残り時間はゲージで表示`
              : "録画ボタンで開始 · 時間切れで自動停止"}
          </p>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="border-t border-border bg-red-500/10 px-4 py-2 text-xs text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}
