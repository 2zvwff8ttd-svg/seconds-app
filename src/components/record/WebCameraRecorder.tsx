"use client";

import type { CameraRecorderProps } from "@/components/record/camera-recorder-types";
import { RecordShapePicker } from "@/components/record/RecordShapePicker";
import { getVideoDisplayMask } from "@/lib/video/display-mask";
import {
  canUseInAppMediaRecorder,
  createMediaRecorder,
  facingModeLabel,
  getMinRecordingMs,
  getNativeCaptureAccept,
  getPreferredMimeType,
  getRecorderTimesliceMs,
  getStopFallbackMs,
  isIOSSafari,
  logRecorderMimeDiagnostics,
  mimeToExtension,
  openCameraStream,
  shouldRequestDataBeforeStop,
  verifyRecordedBlobPlayback,
  waitForRecorderChunks,
} from "@/lib/recording/recorder-utils";
import { getVideoDuration, normalizeStorageContentType } from "@/lib/video/media";
import { sumRecordedClipSeconds } from "@/lib/recording/clip-budget";
import { fetchTodayAssignedSeconds } from "@/lib/recording/daily-assignment";
import { TimeBudgetGauge } from "@/components/record/TimeBudgetGauge";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function isStreamLive(stream: MediaStream | null): boolean {
  return Boolean(
    stream?.getVideoTracks().some((t) => t.readyState === "live"),
  );
}

function measureRecordingSeconds(startedAt: number | null): number {
  if (!startedAt) return 0;
  return Math.max(0, (Date.now() - startedAt) / 1000);
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function WebCameraRecorder({
  clips,
  onClipAdded,
  disabled = false,
  displayMaskShape,
  onDisplayMaskShapeChange,
}: CameraRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef<number | null>(null);
  const recordBudgetRef = useRef(0);
  const finishingRef = useRef(false);
  const stopFallbackRef = useRef<number | null>(null);
  const lastRecordActionRef = useRef(0);
  const mimeRef = useRef(getPreferredMimeType());

  const [assignedSeconds, setAssignedSeconds] = useState<number | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [isRecording, setIsRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [inAppRecorderReady, setInAppRecorderReady] = useState(true);
  const [showNativeCapture, setShowNativeCapture] = useState(false);

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

  useEffect(() => {
    const ready = canUseInAppMediaRecorder();
    setInAppRecorderReady(ready);
    setShowNativeCapture(isIOSSafari() || !ready);
    logRecorderMimeDiagnostics();
  }, []);

  const clearStopFallback = useCallback(() => {
    if (stopFallbackRef.current) {
      clearTimeout(stopFallbackRef.current);
      stopFallbackRef.current = null;
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    recordingStartRef.current = null;
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    const el = videoRef.current;
    if (el) el.srcObject = null;
  }, []);

  const ensurePreview = useCallback(async () => {
    const el = videoRef.current;
    const stream = streamRef.current;
    if (!el || !stream) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
    await el.play().catch(() => {});
  }, []);

  const startCamera = useCallback(
    async (mode: "user" | "environment") => {
      setError(null);
      setCameraStarting(true);
      stopStream();
      try {
        const stream = await openCameraStream(mode);
        streamRef.current = stream;
        await ensurePreview();
        setCameraReady(true);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "カメラへのアクセスが拒否されました",
        );
        setCameraReady(false);
      } finally {
        setCameraStarting(false);
      }
    },
    [ensurePreview, stopStream],
  );

  useEffect(() => {
    fetchTodayAssignedSeconds()
      .then(setAssignedSeconds)
      .catch((err) => {
        setError(err instanceof Error ? err.message : "秒数の取得に失敗しました");
      });
  }, []);

  useEffect(() => {
    return () => {
      clearStopFallback();
      clearTimer();
      if (recorderRef.current?.state === "recording") {
        if (shouldRequestDataBeforeStop()) {
          try {
            recorderRef.current.requestData();
          } catch {
            // ignore
          }
        }
        recorderRef.current.stop();
      }
      stopStream();
    };
  }, [clearStopFallback, clearTimer, stopStream]);

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

  const finishRecording = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    clearStopFallback();

    const elapsed = measureRecordingSeconds(recordingStartRef.current);
    const budget = recordBudgetRef.current;
    const recordedMime = recorderRef.current?.mimeType || mimeRef.current;
    clearTimer();
    setIsRecording(false);

    await waitForRecorderChunks(() => chunksRef.current);

    let chunks = [...chunksRef.current];
    let totalBytes = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
    if (totalBytes === 0) {
      await waitForRecorderChunks(() => chunksRef.current, {
        maxMs: getStopFallbackMs(),
      });
      chunks = [...chunksRef.current];
      totalBytes = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
    }

    chunksRef.current = [];
    recorderRef.current = null;

    if (chunks.length === 0 || totalBytes === 0) {
      setError("録画データを取得できませんでした。もう一度お試しください");
      if (isIOSSafari()) {
        setShowNativeCapture(true);
      }
      finishingRef.current = false;
      await ensurePreview();
      return;
    }

    const durationSeconds = Math.min(
      budget,
      Math.max(0.1, Math.round(elapsed * 10) / 10),
    );

    const mime = recordedMime;
    const storageType = normalizeStorageContentType(mime);
    const blob = new Blob(chunks, { type: storageType });

    try {
      await verifyRecordedBlobPlayback(blob);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "録画した動画を再生できません",
      );
      if (isIOSSafari()) {
        setShowNativeCapture(true);
      }
      finishingRef.current = false;
      await ensurePreview();
      return;
    }

    const ext = mimeToExtension(mime);
    const file = new File([blob], `clip-${Date.now()}.${ext}`, {
      type: storageType,
    });

    addRecordedClip(file, durationSeconds);
    finishingRef.current = false;
    await ensurePreview();
  }, [addRecordedClip, clearStopFallback, clearTimer, ensurePreview]);

  const finishRecordingRef = useRef(finishRecording);
  finishRecordingRef.current = finishRecording;

  const scheduleStopFallback = useCallback(() => {
    clearStopFallback();
    stopFallbackRef.current = window.setTimeout(() => {
      if (!finishingRef.current) {
        void finishRecordingRef.current();
      }
    }, getStopFallbackMs());
  }, [clearStopFallback]);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    if (recorder.state === "inactive") {
      if (!finishingRef.current) {
        void finishRecordingRef.current();
      }
      return;
    }

    if (recorder.state !== "recording") return;

    if (recordingStartRef.current) {
      const minMs = getMinRecordingMs();
      const elapsedMs = Date.now() - recordingStartRef.current;
      if (elapsedMs < minMs) {
        await waitMs(minMs - elapsedMs);
      }
    }

    clearTimer();
    setIsRecording(false);

    if (shouldRequestDataBeforeStop()) {
      try {
        recorder.requestData();
      } catch {
        // ignore
      }
    }

    try {
      recorder.stop();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "録画の停止に失敗しました",
      );
      finishingRef.current = false;
      recorderRef.current = null;
      return;
    }

    scheduleStopFallback();
  }, [clearTimer, scheduleStopFallback]);

  const beginRecording = useCallback(() => {
    const stream = streamRef.current;
    if (assignedSeconds === null) return;
    const budget = assignedSeconds - usedClipSeconds;
    if (!stream || isRecording || disabled || budget <= 0) return;

    if (!canUseInAppMediaRecorder()) {
      setShowNativeCapture(true);
      setError("アプリ内録画に未対応のため、カメラ撮影をご利用ください");
      return;
    }

    setError(null);
    chunksRef.current = [];
    finishingRef.current = false;
    clearStopFallback();
    mimeRef.current = getPreferredMimeType();
    recordBudgetRef.current = budget;

    let recorder: MediaRecorder;
    try {
      const created = createMediaRecorder(stream, mimeRef.current);
      recorder = created.recorder;
      mimeRef.current = created.mimeType;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "録画の初期化に失敗しました",
      );
      setShowNativeCapture(true);
      return;
    }

    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      clearStopFallback();
      void finishRecordingRef.current();
    };
    recorder.onerror = () => {
      clearStopFallback();
      setError("録画に失敗しました");
      clearTimer();
      setIsRecording(false);
      recorderRef.current = null;
      finishingRef.current = false;
      if (isIOSSafari()) {
        setShowNativeCapture(true);
      }
    };

    const timeslice = getRecorderTimesliceMs();
    if (timeslice !== undefined) {
      recorder.start(timeslice);
    } else {
      recorder.start();
    }

    setIsRecording(true);
    recordingStartRef.current = Date.now();

    tickRef.current = setInterval(() => {
      setTick((t) => t + 1);
    }, 100);

    timerRef.current = setInterval(() => {
      if (!recordingStartRef.current || assignedSeconds === null) return;
      const left =
        assignedSeconds -
        usedClipSeconds -
        measureRecordingSeconds(recordingStartRef.current);
      if (left <= 0) {
        void stopRecording();
      }
    }, 200);
  }, [
    assignedSeconds,
    clearStopFallback,
    clearTimer,
    disabled,
    isRecording,
    stopRecording,
    usedClipSeconds,
  ]);

  const handleNativeCapture = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || assignedSeconds === null) return;

      setError(null);
      const budget = assignedSeconds - usedClipSeconds;
      if (budget <= 0) {
        setError("今日の撮影時間を使い切りました");
        return;
      }

      try {
        const rawDuration = await getVideoDuration(file);
        const durationSeconds = Math.min(
          budget,
          Math.max(0.1, rawDuration || 0.1),
        );
        addRecordedClip(file, durationSeconds);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "動画の読み込みに失敗しました",
        );
      }
    },
    [addRecordedClip, assignedSeconds, usedClipSeconds],
  );

  const openNativeCapture = useCallback(() => {
    if (disabled || assignedSeconds === null) return;
    if (assignedSeconds - usedClipSeconds <= 0) {
      setError("今日の撮影時間を使い切りました");
      return;
    }
    nativeInputRef.current?.click();
  }, [assignedSeconds, disabled, usedClipSeconds]);

  const handleRecordPress = useCallback(async () => {
    if (disabled || cameraStarting || finishingRef.current) return;

    if (isRecording) {
      await stopRecording();
      return;
    }

    if (remainingSeconds <= 0) {
      setError("今日の撮影時間を使い切りました");
      return;
    }

    if (!inAppRecorderReady) {
      openNativeCapture();
      return;
    }

    if (!cameraReady || !isStreamLive(streamRef.current)) {
      await startCamera(facingMode);
      if (!streamRef.current) return;
    }

    beginRecording();
  }, [
    beginRecording,
    cameraReady,
    cameraStarting,
    disabled,
    facingMode,
    inAppRecorderReady,
    isRecording,
    openNativeCapture,
    remainingSeconds,
    startCamera,
    stopRecording,
  ]);

  const invokeRecordPress = useCallback(() => {
    const now = Date.now();
    if (now - lastRecordActionRef.current < 350) return;
    lastRecordActionRef.current = now;
    void handleRecordPress();
  }, [handleRecordPress]);

  const switchCamera = async () => {
    if (isRecording || disabled || cameraStarting) return;
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    if (cameraReady) {
      await startCamera(next);
    }
  };

  const gaugeRecordingElapsed =
    isRecording && recordingStartRef.current
      ? measureRecordingSeconds(recordingStartRef.current)
      : 0;

  const canRecord =
    assignedSeconds !== null &&
    remainingSeconds > 0 &&
    !disabled &&
    !cameraStarting &&
    !finishingRef.current;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-black">
      <input
        ref={nativeInputRef}
        type="file"
        accept={getNativeCaptureAccept()}
        capture={facingMode}
        className="hidden"
        onChange={(e) => void handleNativeCapture(e)}
      />

      <div className="relative aspect-[9/16] max-h-[52vh] w-full bg-black">
        <TimeBudgetGauge
          assignedSeconds={assignedSeconds}
          usedSeconds={usedClipSeconds}
          recordingElapsed={gaugeRecordingElapsed}
        />

        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className="pointer-events-none h-full w-full object-cover"
          style={{
            transform: facingMode === "user" ? "scaleX(-1)" : undefined,
            clipPath: getVideoDisplayMask(displayMaskShape).clipPath,
          }}
        />

        {!cameraReady && !isRecording && !error && inAppRecorderReady && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface-elevated/90 px-6 pt-2 text-center">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h4l2-3h8l2 3h4v12H4V7z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </span>
            <p className="text-sm font-medium text-foreground">録画ボタンでカメラを起動</p>
            <p className="mt-1 text-xs text-muted">
              {isIOSSafari()
                ? "1秒以上録画してから停止してください"
                : "撮影時間は全クリップで共有されます"}
            </p>
          </div>
        )}

        {cameraStarting && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 text-sm text-muted">
            カメラを起動中…
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-end bg-gradient-to-b from-black/50 to-transparent px-3 pb-6 pt-5">
          <button
            type="button"
            onClick={() => void switchCamera()}
            disabled={isRecording || cameraStarting || disabled}
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition hover:bg-black/70 disabled:opacity-40"
            aria-label="カメラ切り替え"
            title={facingModeLabel(facingMode === "user" ? "environment" : "user")}
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

          <div className="pointer-events-auto mb-3">
            <RecordShapePicker
              value={displayMaskShape}
              onChange={onDisplayMaskShapeChange}
              disabled={disabled || isRecording || cameraStarting || clips.length > 0}
            />
          </div>

          <button
            type="button"
            onClick={invokeRecordPress}
            onPointerUp={(e) => {
              if (e.pointerType === "touch") {
                e.preventDefault();
                invokeRecordPress();
              }
            }}
            disabled={(!canRecord && !isRecording) || cameraStarting}
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

          {showNativeCapture && (
            <button
              type="button"
              onClick={openNativeCapture}
              disabled={!canRecord && !isRecording}
              className="pointer-events-auto mt-3 rounded-full bg-white/15 px-4 py-2 text-xs font-medium text-white backdrop-blur-md transition hover:bg-white/25 disabled:opacity-40"
            >
              カメラアプリで撮影
            </button>
          )}

          <p className="mt-3 text-[10px] text-muted">
            {clips.length > 0
              ? `${clips.length}クリップ · 残り時間はゲージで表示`
              : isIOSSafari()
                ? "1秒以上録画してから停止 · カメラアプリ撮影も利用可"
                : "録画ボタンで開始 · 時間切れで自動停止"}
          </p>
        </div>
      </div>

      {error && (
        <p className="border-t border-border bg-red-500/10 px-4 py-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
