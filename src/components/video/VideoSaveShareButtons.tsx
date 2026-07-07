"use client";

import {
  saveVideoToCameraRoll,
  shareVideo,
} from "@/lib/video/save-share-video";
import { useCallback, useEffect, useRef, useState } from "react";

type VideoSaveShareButtonsProps = {
  videoUrl: string;
  title: string;
  disabled?: boolean;
  className?: string;
  layout?: "row" | "column";
};

type Feedback = {
  tone: "success" | "error";
  message: string;
};

const chromeButtonClass =
  "flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/65 disabled:pointer-events-none disabled:opacity-40 sm:h-10 sm:w-10";

function saveSuccessMessage(mode: "camera_roll" | "browser_download"): string {
  if (mode === "camera_roll") {
    return "写真に保存しました";
  }
  return "ブラウザに保存しました（写真アプリには入りません）";
}

function shareSuccessMessage(
  mode: "share_sheet" | "web_share" | "link_copy",
): string {
  if (mode === "share_sheet") return "共有シートを開きました";
  if (mode === "web_share") return "共有しました";
  return "リンクをコピーしました";
}

export function VideoSaveShareButtons({
  videoUrl,
  title,
  disabled = false,
  className = "",
  layout = "row",
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
      }, 3200);
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
    if (result.ok && (result.mode === "camera_roll" || result.mode === "browser_download")) {
      showFeedback({
        tone: "success",
        message: saveSuccessMessage(result.mode),
      });
    } else if (!result.ok) {
      showFeedback({ tone: "error", message: result.message });
    }
  }, [busyAction, showFeedback, title, videoUrl]);

  const runShare = useCallback(async () => {
    if (!videoUrl || busyAction) return;
    setBusyAction("share");
    const result = await shareVideo(videoUrl, title);
    setBusyAction(null);
    if (
      result.ok &&
      (result.mode === "share_sheet" ||
        result.mode === "web_share" ||
        result.mode === "link_copy")
    ) {
      showFeedback({
        tone: "success",
        message: shareSuccessMessage(result.mode),
      });
    } else if (!result.ok) {
      showFeedback({ tone: "error", message: result.message });
    }
  }, [busyAction, showFeedback, title, videoUrl]);

  if (!videoUrl) return null;

  const layoutClass =
    layout === "row"
      ? "flex-row items-center gap-2"
      : "flex-col items-center gap-2";

  return (
    <div className={`relative flex shrink-0 ${layoutClass} ${className}`}>
      <button
        type="button"
        className={chromeButtonClass}
        onClick={() => void runSave()}
        disabled={disabled || busyAction !== null}
        aria-label="動画を写真に保存"
        title="写真に保存"
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

      {feedback && (
        <div
          role="status"
          className={`pointer-events-none absolute right-0 top-full z-40 mt-2 max-w-[min(72vw,15rem)] rounded-xl px-3 py-2 text-xs font-medium leading-snug shadow-lg ${
            feedback.tone === "success"
              ? "bg-emerald-500/95 text-white"
              : "bg-red-500/95 text-white"
          }`}
        >
          {feedback.message}
        </div>
      )}
    </div>
  );
}
