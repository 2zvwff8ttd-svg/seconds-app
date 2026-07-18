"use client";

type ConfirmDeleteVideoDialogProps = {
  title: string;
  onConfirm: () => void;
  onCancel: () => void;
  deleting?: boolean;
  error?: string | null;
};

export function ConfirmDeleteVideoDialog({
  title,
  onConfirm,
  onCancel,
  deleting = false,
  error = null,
}: ConfirmDeleteVideoDialogProps) {
  return (
    <div
      className="z-fullscreen fixed inset-0 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal
      aria-labelledby="delete-video-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-surface-elevated p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="delete-video-title"
          className="text-base font-semibold text-foreground"
        >
          投稿を削除しますか？
        </h2>
        <p className="mt-2 text-sm text-muted">
          「{title}」を削除します。動画ファイルも完全に削除され、元に戻せません。
        </p>
        {error && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 rounded-xl border border-border bg-surface py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-elevated disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
          >
            {deleting ? "削除中…" : "削除"}
          </button>
        </div>
      </div>
    </div>
  );
}
