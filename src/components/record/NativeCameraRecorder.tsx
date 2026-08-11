"use client";

import type { CameraRecorderProps } from "@/components/record/camera-recorder-types";
import { RecordMaskOverlay } from "@/components/record/RecordMaskOverlay";
import { RecordFocusTapLayer } from "@/components/record/RecordFocusTapLayer";
import { RecordStageControls } from "@/components/record/RecordStageControls";
import { RecordStagePortal } from "@/components/record/RecordStagePortal";
import { sumRecordedClipSeconds } from "@/lib/recording/clip-budget";
import { getFullscreenNativePreviewRect } from "@/lib/recording/native-fullscreen-preview-rect";
import { getMinRecordingMs } from "@/lib/recording/recorder-utils";
import {
  flipNativeCamera,
  NATIVE_CAMERA_PREVIEW_ID,
  startNativePreview,
  startNativeRecording,
  stopNativePreview,
  stopNativeRecording,
  syncNativePreviewLayout,
  type NativeRecordingResult,
} from "@/lib/recording/native-camera-preview";
import { debounceAsync } from "@/lib/recording/native-preview-scheduler";
import { useNativePreviewZoomed } from "@/lib/recording/use-native-preview-zoomed";
import { formatNativeRecordingError } from "@/lib/recording/native-recording-error";
import { nativeVideoSourceToFile } from "@/lib/recording/native-recording-file";
import { roundClipDurationSeconds } from "@/lib/recording/format-clip-duration";
import {
  measureRecordingSeconds,
  scheduleRecordingAutoStop,
} from "@/lib/recording/recording-timer";
import { logRecordedClipAvDurations } from "@/lib/video/av-duration-guard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Wait for CSS (record-native-preview-active) + layout before native start. */
const PREVIEW_BOOT_SETTLE_MS = 400;

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function facingToPosition(mode: "user" | "environment"): "front" | "rear" {
  return mode === "user" ? "front" : "rear";
}

function nativePreviewOpts(facingMode: "user" | "environment") {
  return {
    ...getFullscreenNativePreviewRect(),
    position: facingToPosition(facingMode),
  };
}

function formatPreviewStartError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "カメラプレビューの起動に失敗しました";
  const lower = raw.toLowerCase();
  if (
    lower.includes("permission") ||
    lower.includes("denied") ||
    lower.includes("not authorized") ||
    lower.includes("notdetermined")
  ) {
    return "カメラの使用が許可されていません。設定アプリでカメラを許可してから、再試行してください。";
  }
  return raw.trim() || "カメラプレビューの起動に失敗しました";
}

export function NativeCameraRecorder({
  clips,
  onClipAdded,
  onClipRemoved,
  disabled = false,
  assignedSeconds,
}: CameraRecorderProps) {
  const recordingStartRef = useRef<number | null>(null);
  const recordBudgetRef = useRef(0);
  const finishingRef = useRef(false);
  const previewStartedRef = useRef(false);
  const previewStartingRef = useRef(false);
  /** Bumps on each mount; in-flight start/stop ignore stale generations. */
  const generationRef = useRef(0);
  const facingModeRef = useRef<"user" | "environment">("environment");
  const isRecordingRef = useRef(false);
  const cancelAutoStopRef = useRef<(() => void) | null>(null);
  const tickRef = useRef<number | null>(null);
  const lastRecordActionRef = useRef(0);
  const failedClipRef = useRef<{
    recording: NativeRecordingResult;
    elapsed: number;
    budget: number;
  } | null>(null);

  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [isRecording, setIsRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [recordingStarting, setRecordingStarting] = useState(false);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  /** Preview start failures — shown in a fixed portal (visible over the hole). */
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pendingRecordedSeconds, setPendingRecordedSeconds] = useState(0);
  const [failedClipPending, setFailedClipPending] = useState(false);

  facingModeRef.current = facingMode;
  isRecordingRef.current = isRecording;

  const previewZoomed = useNativePreviewZoomed(cameraReady && !cameraStarting);

  const usedClipSeconds = useMemo(() => sumRecordedClipSeconds(clips), [clips]);

  const remainingSeconds = useMemo(() => {
    void tick;
    if (assignedSeconds === null) return 0;
    const elapsed =
      isRecording && recordingStartRef.current
        ? measureRecordingSeconds(recordingStartRef.current)
        : pendingRecordedSeconds;
    return Math.max(0, assignedSeconds - usedClipSeconds - elapsed);
  }, [assignedSeconds, usedClipSeconds, isRecording, pendingRecordedSeconds, tick]);

  const isCurrentGeneration = useCallback((gen: number) => {
    return generationRef.current === gen;
  }, []);

  /**
   * Start native preview for a mount generation. No-ops if generation is stale
   * (unmounted / remounted). Stale starts that already called the plugin are
   * stopped so they cannot leave a zombie session under the next mount.
   */
  const ensurePreview = useCallback(
    async (gen: number, options?: { force?: boolean }): Promise<boolean> => {
      if (!isCurrentGeneration(gen)) return false;
      if (isRecordingRef.current) return false;
      // Serialize within a generation (no parallel starts).
      if (previewStartingRef.current) return false;

      if (previewStartedRef.current && !options?.force) {
        return true;
      }

      if (options?.force) {
        previewStartedRef.current = false;
        setCameraReady(false);
      }

      previewStartingRef.current = true;
      setCameraStarting(true);
      setPreviewError(null);
      setError(null);

      try {
        await startNativePreview(nativePreviewOpts(facingModeRef.current));

        if (!isCurrentGeneration(gen)) {
          // Unmounted (or remounted) while starting — tear down this start.
          try {
            await stopNativePreview();
          } catch (stopErr) {
            console.warn(
              "[NativeCameraRecorder] stop after stale start",
              stopErr,
            );
          }
          return false;
        }

        previewStartedRef.current = true;
        setCameraReady(true);
        setPreviewError(null);
        return true;
      } catch (err) {
        if (!isCurrentGeneration(gen)) return false;
        console.error("[NativeCameraRecorder] ensurePreview failed", err);
        const message = formatPreviewStartError(err);
        setPreviewError(message);
        setError(message);
        setCameraReady(false);
        previewStartedRef.current = false;
        return false;
      } finally {
        if (isCurrentGeneration(gen)) {
          previewStartingRef.current = false;
          setCameraStarting(false);
        }
      }
    },
    [isCurrentGeneration],
  );

  // Mount lifecycle: CSS class + settle delay + start, then generation-aware stop.
  useEffect(() => {
    const gen = ++generationRef.current;
    previewStartedRef.current = false;
    previewStartingRef.current = false;
    setCameraReady(false);
    setPreviewError(null);

    document.documentElement.classList.add("record-native-preview-active");
    document.body.classList.add("record-native-preview-active");

    let cancelled = false;
    const settleTimer = window.setTimeout(() => {
      if (cancelled || !isCurrentGeneration(gen)) return;
      void ensurePreview(gen);
    }, PREVIEW_BOOT_SETTLE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(settleTimer);
      // Invalidate in-flight ensurePreview for this gen (next mount ++'s generation).
      if (generationRef.current === gen) {
        generationRef.current = gen + 1;
      }
      previewStartedRef.current = false;
      previewStartingRef.current = false;
      document.documentElement.classList.remove("record-native-preview-active");
      document.body.classList.remove("record-native-preview-active");
      void stopNativePreview().catch((err) => {
        console.warn("[NativeCameraRecorder] stopNativePreview on unmount", err);
      });
    };
  }, [ensurePreview, isCurrentGeneration]);

  const retryPreview = useCallback(() => {
    const gen = generationRef.current;
    void ensurePreview(gen, { force: true });
  }, [ensurePreview]);

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

  const syncPreviewLayout = useCallback(async () => {
    const gen = generationRef.current;
    if (
      !isCurrentGeneration(gen) ||
      isRecordingRef.current ||
      !previewStartedRef.current ||
      previewStartingRef.current ||
      cameraStarting
    ) {
      return;
    }

    try {
      await syncNativePreviewLayout(nativePreviewOpts(facingModeRef.current));
      if (!isCurrentGeneration(gen)) return;
    } catch (err) {
      if (!isCurrentGeneration(gen)) return;
      console.warn("[NativeCameraRecorder] syncPreviewLayout", err);
    }
  }, [cameraStarting, isCurrentGeneration]);

  const scheduleLayoutSyncRef = useRef(debounceAsync(() => syncPreviewLayout(), 500));

  useEffect(() => {
    scheduleLayoutSyncRef.current = debounceAsync(() => syncPreviewLayout(), 500);
  }, [syncPreviewLayout]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const onViewportChange = () => {
      if (!previewStartedRef.current || isRecording || previewStartingRef.current) {
        return;
      }
      scheduleLayoutSyncRef.current();
    };

    vv.addEventListener("resize", onViewportChange);
    vv.addEventListener("scroll", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);

    return () => {
      vv.removeEventListener("resize", onViewportChange);
      vv.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
    };
  }, [isRecording]);

  useEffect(() => {
    return () => {
      clearAutoStop();
      clearTick();
      recordingStartRef.current = null;
    };
  }, [clearAutoStop, clearTick]);

  const persistRecordingClip = useCallback(
    async (
      recording: NativeRecordingResult,
      elapsed: number,
      budget: number,
    ) => {
      const file = await nativeVideoSourceToFile(recording);
      const durationSeconds = Math.min(
        budget,
        roundClipDurationSeconds(elapsed),
      );

      addRecordedClip(file, durationSeconds);
      failedClipRef.current = null;
      setFailedClipPending(false);
      setPendingRecordedSeconds(0);
      setError(null);
      console.info(
        `[NativeCameraRecorder] clip added: ${durationSeconds}s (${file.size} bytes)`,
      );
      void logRecordedClipAvDurations(file, {
        source: "native",
        wallClockSec: durationSeconds,
        clipIndex: clips.length,
        fileBytes: file.size,
      });
    },
    [addRecordedClip, clips.length],
  );

  const finishRecording = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    clearAutoStop();
    clearTick();

    const elapsed = measureRecordingSeconds(recordingStartRef.current);
    const budget = recordBudgetRef.current;
    setPendingRecordedSeconds(elapsed);
    recordingStartRef.current = null;
    setIsRecording(false);

    try {
      const recording = await stopNativeRecording();
      console.info("[NativeCameraRecorder] stopNativeRecording", {
        path: recording.videoFilePath,
        fileName: recording.videoFileName,
        fileSize: recording.videoFileSize,
        hasBase64: Boolean(recording.videoBase64),
      });

      failedClipRef.current = { recording, elapsed, budget };
      setFailedClipPending(true);
      await persistRecordingClip(recording, elapsed, budget);
    } catch (err) {
      console.error("[NativeCameraRecorder] finishRecording failed", err);
      const detail =
        err instanceof Error ? err.message : typeof err === "string" ? err : "";
      const message = formatNativeRecordingError(err);
      setError(detail && detail !== message ? `${message} [${detail}]` : message);
    } finally {
      finishingRef.current = false;
    }
  }, [clearAutoStop, clearTick, persistRecordingClip]);

  const retryFailedClip = useCallback(async () => {
    const failed = failedClipRef.current;
    if (!failed || finishingRef.current) return;

    finishingRef.current = true;
    setError(null);
    try {
      await persistRecordingClip(
        failed.recording,
        failed.elapsed,
        failed.budget,
      );
    } catch (err) {
      console.error("[NativeCameraRecorder] retryFailedClip failed", err);
      const detail =
        err instanceof Error ? err.message : typeof err === "string" ? err : "";
      const message = formatNativeRecordingError(err);
      setError(detail && detail !== message ? `${message} [${detail}]` : message);
    } finally {
      finishingRef.current = false;
    }
  }, [persistRecordingClip]);

  const discardFailedClip = useCallback(() => {
    failedClipRef.current = null;
    setFailedClipPending(false);
    setPendingRecordedSeconds(0);
    setError(null);
  }, []);

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
    if (
      assignedSeconds === null ||
      isRecording ||
      disabled ||
      finishingRef.current ||
      recordingStarting
    ) {
      return;
    }
    const budget = assignedSeconds - usedClipSeconds - pendingRecordedSeconds;
    if (budget <= 0) return;

    if (failedClipRef.current) {
      discardFailedClip();
    }

    if (!cameraReady) {
      const started = await ensurePreview(generationRef.current, { force: true });
      if (!started) {
        setPreviewError(
          (prev) => prev ?? "カメラプレビューの起動に失敗しました",
        );
        return;
      }
    }

    setError(null);
    setPreviewError(null);
    recordBudgetRef.current = budget;
    setRecordingStarting(true);

    try {
      const recordRect = nativePreviewOpts(facingMode);
      console.info(
        `[NativeCameraRecorder] startNativeRecording: fullscreen ${recordRect.width}x${recordRect.height}`,
      );
      await startNativeRecording(recordRect);
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
    isRecording,
    discardFailedClip,
    pendingRecordedSeconds,
    recordingStarting,
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
      : pendingRecordedSeconds;

  const canRecord =
    assignedSeconds !== null &&
    remainingSeconds > 0 &&
    !disabled &&
    !cameraStarting &&
    !recordingStarting &&
    !finishingRef.current;

  return (
    <div className="record-camera-root">
      <div
        id={NATIVE_CAMERA_PREVIEW_ID}
        className="native-camera-preview-anchor"
        aria-hidden
      />

      <div className="record-camera-layout-spacer" aria-hidden />

      <RecordMaskOverlay
        cameraReady={cameraReady}
        previewZoomed={previewZoomed}
      />

      <RecordFocusTapLayer
        cameraReady={cameraReady}
        disabled={disabled || cameraStarting || isRecording}
      />

      <RecordStageControls
        assignedSeconds={assignedSeconds}
        usedClipSeconds={usedClipSeconds}
        gaugeRecordingElapsed={gaugeRecordingElapsed}
        cameraReady={cameraReady}
        cameraStarting={cameraStarting}
        recordingStarting={recordingStarting}
        isRecording={isRecording}
        canRecord={canRecord}
        disabled={disabled}
        clips={clips}
        onClipRemove={onClipRemoved}
        onSwitchCamera={() => void switchCamera()}
        onRecordPress={invokeRecordPress}
        showLimitMessage={
          !canRecord &&
          !isRecording &&
          assignedSeconds !== null &&
          usedClipSeconds >= assignedSeconds
        }
      />

      {previewError && (
        <RecordStagePortal>
          <div className="record-camera-boot-error" role="alert">
            <p className="record-camera-boot-error__title">カメラを起動できません</p>
            <p className="record-camera-boot-error__body">{previewError}</p>
            <button
              type="button"
              className="record-camera-boot-error__retry"
              onClick={retryPreview}
              disabled={cameraStarting}
            >
              {cameraStarting ? "起動中…" : "再試行"}
            </button>
          </div>
        </RecordStagePortal>
      )}

      {error && !previewError && (
        <div className="record-camera-error" role="alert">
          <p>{error}</p>
          {failedClipPending && (
            <div className="record-camera-error__actions">
              <button
                type="button"
                className="record-camera-error__retry"
                onClick={() => void retryFailedClip()}
                disabled={finishingRef.current}
              >
                クリップを再読み込み
              </button>
              <button
                type="button"
                className="record-camera-error__discard"
                onClick={discardFailedClip}
                disabled={finishingRef.current}
              >
                撮り直す
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
