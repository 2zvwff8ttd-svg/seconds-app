"use client";

import type { RecordedClip } from "@/types/recording";
import { getVideoDuration } from "@/lib/video/media";
import {
  facingModeLabel,
  getPreferredMimeType,
  mimeToExtension,
} from "@/lib/recording/recorder-utils";
import { fetchTodayAssignedSeconds } from "@/lib/recording/daily-assignment";
import { useCallback, useEffect, useRef, useState } from "react";

type CameraRecorderProps = {
  clips: RecordedClip[];
  onClipAdded: (clip: RecordedClip) => void;
  disabled?: boolean;
};

export function CameraRecorder({
  clips,
  onClipAdded,
  disabled = false,
}: CameraRecorderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef(getPreferredMimeType());

  const [assignedSeconds, setAssignedSeconds] = useState(15);
  const [remaining, setRemaining] = useState(15);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [isRecording, setIsRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const startCamera = useCallback(
    async (mode: "user" | "environment") => {
      setError(null);
      stopStream();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode },
          audio: true,
        });
        streamRef.current = stream;
        const el = videoRef.current;
        if (el) {
          el.srcObject = stream;
          await el.play().catch(() => {});
        }
        setCameraReady(true);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "カメラへのアクセスが拒否されました",
        );
      }
    },
    [stopStream],
  );

  useEffect(() => {
    fetchTodayAssignedSeconds()
      .then((sec) => {
        setAssignedSeconds(sec);
        setRemaining(sec);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "秒数の取得に失敗しました");
      });
  }, []);

  useEffect(() => {
    if (disabled) return;
    startCamera(facingMode);
    return () => {
      clearTimer();
      recorderRef.current?.state === "recording" && recorderRef.current.stop();
      stopStream();
    };
  }, [facingMode, disabled, startCamera, clearTimer, stopStream]);

  const finishRecording = useCallback(async () => {
    clearTimer();
    setIsRecording(false);
    setRemaining(assignedSeconds);

    const chunks = chunksRef.current;
    if (chunks.length === 0) return;

    const mime = mimeRef.current;
    const blob = new Blob(chunks, { type: mime });
    const ext = mimeToExtension(mime);
    const file = new File([blob], `clip-${Date.now()}.${ext}`, { type: mime });
    const previewUrl = URL.createObjectURL(blob);
    const durationSeconds = await getVideoDuration(file).catch(() => assignedSeconds);

    onClipAdded({
      id: crypto.randomUUID(),
      file,
      previewUrl,
      durationSeconds,
    });
    chunksRef.current = [];
  }, [assignedSeconds, clearTimer, onClipAdded]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    } else {
      void finishRecording();
    }
  }, [finishRecording]);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || isRecording || disabled) return;

    setError(null);
    chunksRef.current = [];
    mimeRef.current = getPreferredMimeType();

    const recorder = new MediaRecorder(stream, { mimeType: mimeRef.current });
    recorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      void finishRecording();
    };

    recorder.start(200);
    setIsRecording(true);
    setRemaining(assignedSeconds);

    clearTimer();
    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          stopRecording();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [
    assignedSeconds,
    clearTimer,
    disabled,
    finishRecording,
    isRecording,
    stopRecording,
  ]);

  const switchCamera = () => {
    if (isRecording) return;
    setFacingMode((m) => (m === "user" ? "environment" : "user"));
  };

  const progress =
    assignedSeconds > 0
      ? ((assignedSeconds - remaining) / assignedSeconds) * 100
      : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-black">
      <div className="relative aspect-[9/16] max-h-[52vh] w-full bg-black">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className="h-full w-full object-cover"
          style={{
            transform: facingMode === "user" ? "scaleX(-1)" : undefined,
          }}
        />

        {!cameraReady && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-sm text-muted">
            カメラを起動中…
          </div>
        )}

        <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pb-8 pt-4">
          <div className="rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-md">
            <span className="text-xs text-muted">今日の撮影</span>
            <span className="ml-2 text-lg font-bold tabular-nums text-foreground">
              {isRecording ? remaining : assignedSeconds}
              <span className="text-sm font-normal text-muted">秒</span>
            </span>
          </div>
          <button
            type="button"
            onClick={switchCamera}
            disabled={isRecording || !cameraReady || disabled}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition hover:bg-black/70 disabled:opacity-40"
            aria-label="カメラ切り替え"
            title={facingModeLabel(facingMode === "user" ? "environment" : "user")}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h4l2-3h8l2 3h4v12H4V7z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
          </button>
        </div>

        {isRecording && (
          <div className="absolute inset-x-4 top-16 h-1 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center bg-gradient-to-t from-black/80 to-transparent pb-6 pt-10">
          {isRecording && (
            <span className="mb-3 flex items-center gap-2 text-xs font-medium text-red-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              録画中 {remaining}秒
            </span>
          )}

          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={!cameraReady || disabled}
            className={`relative flex h-16 w-16 items-center justify-center rounded-full border-4 transition touch-manipulation disabled:opacity-40 ${
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
              ? `${clips.length}クリップ撮影済み · あと何本でも追加できます`
              : "タップで録画開始 · タイマー終了で自動停止"}
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
