"use client";

import { UploadProgress } from "@/components/post/UploadProgress";
import { useUpload } from "@/lib/upload/upload-context";
import Link from "next/link";

export function GlobalUploadBar() {
  const {
    isUploading,
    progress,
    progressLabel,
    success,
    error,
    dismissSuccess,
    dismissError,
  } = useUpload();

  if (!isUploading && !success && !error) {
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
          <p className="global-upload-bar__title">投稿をアップロード中</p>
          <p className="global-upload-bar__hint">
            他の画面に移動しても続行します。タブを閉じると中断される場合があります。
          </p>
          <UploadProgress percent={progress} label={progressLabel} />
        </div>
      )}

      {success && !isUploading && (
        <div className="global-upload-bar__panel global-upload-bar__panel--success">
          <div className="global-upload-bar__row">
            <p className="global-upload-bar__title">投稿を受け付けました</p>
            <button
              type="button"
              onClick={dismissSuccess}
              className="global-upload-bar__dismiss"
              aria-label="閉じる"
            >
              閉じる
            </button>
          </div>
          <p className="global-upload-bar__hint">
            明日の7時に公開されます。
          </p>
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
