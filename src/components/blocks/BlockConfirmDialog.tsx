"use client";

import { blockUser } from "@/lib/blocks/actions";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type BlockConfirmDialogProps = {
  userId: string;
  username: string;
  onClose: () => void;
  onBlocked: () => void;
};

export function BlockConfirmDialog({
  userId,
  username,
  onClose,
  onBlocked,
}: BlockConfirmDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await blockUser(userId);
      onBlocked();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ブロックに失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="z-modal fixed inset-0 flex items-end justify-center bg-black/75 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal
      aria-labelledby="block-dialog-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface-elevated p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="block-dialog-title" className="text-base font-semibold text-foreground">
          ユーザーをブロック
        </h2>
        <p className="mt-2 text-sm text-muted">
          @{username} をブロックしますか？このユーザーの投稿・コメント・メッセージは表示されなくなります。
        </p>

        {error && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-xl border border-border bg-surface py-2.5 text-sm font-medium text-foreground disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
          >
            {submitting ? "処理中…" : "ブロックする"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
