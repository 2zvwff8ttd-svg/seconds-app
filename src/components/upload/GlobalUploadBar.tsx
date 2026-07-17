"use client";

import { UploadProgress } from "@/components/post/UploadProgress";
import { VideoRetentionNote } from "@/components/video/VideoRetentionNote";
import { useUpload } from "@/lib/upload/upload-context";
import Link from "next/link";
import { useEffect, useState } from "react";

/** Visible hold before fade starts. */
const SUCCESS_HOLD_MS = 3400;
/** Fade duration — keep in sync with CSS transition. */
const SUCCESS_FADE_MS = 700;

export function GlobalUploadBar() {
  const {
    isUploading,
    stage,
    progress,
    progressLabel,
    success,
    error,
    dismissSuccess,
    dismissError,
  } = useUpload();

  const [successFading, setSuccessFading] = useState(false);
  const [successHidden, setSuccessHidden] = useState(false);

  useEffect(() => {
    if (!success || isUploading) {
      setSuccessFading(false);
      setSuccessHidden(false);
      return;
    }

    setSuccessFading(false);
    setSuccessHidden(false);

    const fadeTimer = window.setTimeout(() => {
      setSuccessFading(true);
    }, SUCCESS_HOLD_MS);

    const hideTimer = window.setTimeout(() => {
      setSuccessHidden(true);
    }, SUCCESS_HOLD_MS + SUCCESS_FADE_MS);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [success, isUploading]);

  const uploadTitle =
    stage === "merging_audio"
      ? "ナレーションを合成中"
      : stage === "merging_clips"
        ? "クリップを結合中"
        : "投稿をアップロード中";

  const showSuccess = Boolean(success && !isUploading && !successHidden);

  if (!isUploading && !showSuccess && !error) {
    return null;
  }

  return (
    <div
      className="global-upload-bar"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {isUploading && (
        <div className="global-upload-bar__panel global-upload-bar__panel--active">
          <p className="global-upload-bar__title">{uploadTitle}</p>
          <p className="global-upload-bar__hint">
            他の画面に移動しても続行します。タブを閉じると中断される場合があります。
          </p>
          <UploadProgress percent={progress} label={progressLabel} />
        </div>
      )}

      {showSuccess && (
        <div
          className={`global-upload-bar__panel global-upload-bar__panel--success${
            successFading ? " global-upload-bar__panel--fading" : ""
          }`}
        >
          <div className="global-upload-bar__row">
            <p className="global-upload-bar__title">投稿を受け付けました</p>
            <button
              type="button"
              onClick={() => {
                setSuccessHidden(true);
                dismissSuccess();
              }}
              className="global-upload-bar__dismiss"
              aria-label="閉じる"
            >
              閉じる
            </button>
          </div>
          <p className="global-upload-bar__hint">
            明日の7時に公開されます。
          </p>
          <VideoRetentionNote
            publishAt={success!.publishAt}
            className="global-upload-bar__hint mt-1"
          />
        </div>
      )}

      {error && !isUploading && (
        <div className="global-upload-bar__panel global-upload-bar__panel--error">
          <div className="global-upload-bar__row">
            <p className="global-upload-bar__title">投稿に失敗しました</p>
            <button
              type="button"
              onClick={dismissError}
              className="global-upload-bar__dismiss"
              aria-label="閉じる"
            >
              閉じる
            </button>
          </div>
          <p className="global-upload-bar__message">{error}</p>
          <Link href="/post" className="global-upload-bar__link">
            投稿画面で確認する
          </Link>
        </div>
      )}
    </div>
  );
}
