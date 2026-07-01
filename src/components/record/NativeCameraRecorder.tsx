"use client";

import type { CameraRecorderProps } from "@/components/record/camera-recorder-types";
import { RecordMaskOverlay } from "@/components/record/RecordMaskOverlay";
import { RecordStageControls } from "@/components/record/RecordStageControls";
import { sumRecordedClipSeconds } from "@/lib/recording/clip-budget";
import { fetchTodayAssignedSeconds } from "@/lib/recording/daily-assignment";
import { getFullscreenNativePreviewRect } from "@/lib/recording/native-fullscreen-preview-rect";
import { usePinchZoomMaskBleedExtra } from "@/lib/recording/pinch-zoom-mask-bleed";
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
import { formatNativeRecordingError } from "@/lib/recording/native-recording-error";
import { nativeVideoSourceToFile } from "@/lib/recording/native-recording-file";
import {
  measureRecordingSeconds,
  scheduleRecordingAutoStop,
} from "@/lib/recording/recording-timer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

export function NativeCameraRecorder({
  clips,
  onClipAdded,
  disabled = false,
  displayMaskShape,
  onDisplayMaskShapeChange,
}: CameraRecorderProps) {
  const recordingStartRef = useRef<number | null>(null);
  const recordBudgetRef = useRef(0);
  const finishingRef = useRef(false);
  const previewStartedRef = useRef(false);
  const previewStartingRef = useRef(false);
  const aliveRef = useRef(true);
  const bootStartedRef = useRef(false);
  const cancelAutoStopRef = useRef<(() => void) | null>(null);
  const tickRef = useRef<number | null>(null);
  const lastRecordActionRef = useRef(0);
  const failedClipRef = useRef<{
    recording: NativeRecordingResult;
    elapsed: number;
    budget: number;
  } | null>(null);

  const [assignedSeconds, setAssignedSeconds] = useState<number | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [isRecording, setIsRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [recordingStarting, setRecordingStarting] = useState(false);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendingRecordedSeconds, setPendingRecordedSeconds] = useState(0);
  const [failedClipPending, setFailedClipPending] = useState(false);

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

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      bootStartedRef.current = false;
      previewStartingRef.current = false;
    };
  }, []);

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
    if (
      !aliveRef.current ||
      isRecording ||
      previewStartedRef.current ||
      previewStartingRef.current
    ) {
      return false;
    }

    previewStartingRef.current = true;
    setCameraStarting(true);
    setError(null);

    try {
      await startNativePreview(nativePreviewOpts(facingMode));
      if (!aliveRef.current) return false;

      previewStartedRef.current = true;
      setCameraReady(true);
      return true;
    } catch (err) {
      if (!aliveRef.current) return false;
      setError(
        err instanceof Error ? err.message : "カメラプレビューの起動に失敗しました",
      );
      setCameraReady(false);
      previewStartedRef.current = false;
      return false;
    } finally {
      previewStartingRef.current = false;
      if (aliveRef.current) {
        setCameraStarting(false);
      }
    }
  }, [facingMode, isRecording]);

  useEffect(() => {
    if (assignedSeconds === null || disabled || bootStartedRef.current) return;
    bootStartedRef.current = true;

    const boot = window.setTimeout(() => {
      if (!aliveRef.current) return;
      void ensurePreview();
    }, 450);

    return () => window.clearTimeout(boot);
  }, [assignedSeconds, disabled, ensurePreview]);

  const syncPreviewLayout = useCallback(async () => {
    if (
      !aliveRef.current ||
      isRecording ||
      !previewStartedRef.current ||
      previewStartingRef.current ||
      cameraStarting
    ) {
      return;
    }

    try {
      await syncNativePreviewLayout(nativePreviewOpts(facingMode));
    } catch (err) {
      if (!aliveRef.current) return;
      console.warn("[NativeCameraRecorder] syncPreviewLayout", err);
    }
  }, [cameraStarting, facingMode, isRecording]);

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
      previewStartedRef.current = false;
      previewStartingRef.current = false;
      void stopNativePreview().catch((err) => {
        console.warn("[NativeCameraRecorder] stopNativePreview on unmount", err);
      });
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
        Math.max(0.1, Math.floor(elapsed * 10) / 10),
      );

      addRecordedClip(file, durationSeconds);
      failedClipRef.current = null;
      setFailedClipPending(false);
      setPendingRecordedSeconds(0);
      setError(null);
      console.info(
        `[NativeCameraRecorder] clip added: ${durationSeconds}s (${file.size} bytes)`,
      );
    },
    [addRecordedClip],
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
      // pendingRecordedSeconds は維持 — ゲージが録画前に戻るのを防ぐ
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
    if (assignedSeconds === null || isRecording || disabled) return;
    const budget = assignedSeconds - usedClipSeconds - pendingRecordedSeconds;
    if (budget <= 0) return;

    if (failedClipRef.current) {
      discardFailedClip();
    }

    if (!cameraReady) {
      const started = await ensurePreview();
      if (!started) {
        setError((prev) => prev ?? "カメラプレビューの起動に失敗しました");
        return;
      }
    }

    setError(null);
    finishingRef.current = false;
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

  const maskBleedExtra = usePinchZoomMaskBleedExtra(cameraReady, facingMode);

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
        shape={displayMaskShape}
        maskBleedExtra={maskBleedExtra}
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
        error={error}
        clipsCount={clips.length}
        displayMaskShape={displayMaskShape}
        onDisplayMaskShapeChange={onDisplayMaskShapeChange}
        onSwitchCamera={() => void switchCamera()}
        onRecordPress={invokeRecordPress}
        showLimitMessage={
          !canRecord &&
          !isRecording &&
          assignedSeconds !== null &&
          usedClipSeconds >= assignedSeconds
        }
      />

      {error && (
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
