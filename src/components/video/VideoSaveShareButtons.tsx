"use client";

import {
  canUseNativeSaveShare,
  canUseWebShare,
  saveVideoToCameraRoll,
  shareVideo,
} from "@/lib/video/save-share-video";
import { useCallback, useEffect, useRef, useState } from "react";

type VideoSaveShareButtonsProps = {
  videoUrl: string;
  title: string;
  disabled?: boolean;
  className?: string;
};

type Feedback = {
  tone: "success" | "error";
  message: string;
};

const chromeButtonClass =
  "flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/65 disabled:pointer-events-none disabled:opacity-40";

export function VideoSaveShareButtons({
  videoUrl,
  title,
  disabled = false,
  className = "",
}: VideoSaveShareButtonsProps) {
  const [busyAction, setBusyAction] = useState<"save" | "share" | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  const clearFeedbackTimer = useCallback(() => {
    if (feedbackTimerRef.current != null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
  }, []);

  const showFeedback = useCallback(
    (next: Feedback) => {
      clearFeedbackTimer();
      setFeedback(next);
      feedbackTimerRef.current = window.setTimeout(() => {
        setFeedback(null);
        feedbackTimerRef.current = null;
      }, 2800);
    },
    [clearFeedbackTimer],
  );

  useEffect(() => {
    return () => clearFeedbackTimer();
  }, [clearFeedbackTimer]);

  const runSave = useCallback(async () => {
    if (!videoUrl || busyAction) return;
    setBusyAction("save");
    const result = await saveVideoToCameraRoll(videoUrl, title);
    setBusyAction(null);
    if (result.ok) {
      showFeedback({
        tone: "success",
        message: canUseNativeSaveShare()
          ? "写真に保存しました"
          : "ダウンロードを開始しました",
      });
    } else {
      showFeedback({ tone: "error", message: result.message });
    }
  }, [busyAction, showFeedback, title, videoUrl]);

  const runShare = useCallback(async () => {
    if (!videoUrl || busyAction) return;
    setBusyAction("share");
    const result = await shareVideo(videoUrl, title);
    setBusyAction(null);
    if (result.ok) {
      showFeedback({
        tone: "success",
        message: canUseNativeSaveShare()
          ? "共有シートを開きました"
          : canUseWebShare()
            ? "共有しました"
            : "リンクをコピーしました",
      });
    } else {
      showFeedback({ tone: "error", message: result.message });
    }
  }, [busyAction, showFeedback, title, videoUrl]);

  if (!videoUrl) return null;

  return (
    <div className={`relative flex flex-col items-center gap-2 ${className}`}>
      {feedback && (
        <div
          role="status"
          className={`pointer-events-none absolute left-12 top-1/2 z-40 max-w-[min(70vw,16rem)] -translate-y-1/2 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium shadow-lg ${
            feedback.tone === "success"
              ? "bg-emerald-500/90 text-white"
              : "bg-red-500/90 text-white"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <button
        type="button"
        className={chromeButtonClass}
        onClick={() => void runSave()}
        disabled={disabled || busyAction !== null}
        aria-label="動画を保存"
        title="保存"
      >
        {busyAction === "save" ? (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden
          />
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <path d="M12 3v12" strokeLinecap="round" />
            <path d="M7 10l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 20h14" strokeLinecap="round" />
          </svg>
        )}
      </button>

      <button
        type="button"
        className={chromeButtonClass}
        onClick={() => void runShare()}
        disabled={disabled || busyAction !== null}
        aria-label="動画を共有"
        title="共有"
      >
        {busyAction === "share" ? (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden
          />
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <circle cx="18" cy="5" r="2.5" />
            <circle cx="6" cy="12" r="2.5" />
            <circle cx="18" cy="19" r="2.5" />
            <path d="M8.2 11.2 15.8 6.8M8.2 12.8l7.6 4.4" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </div>
  );
}
