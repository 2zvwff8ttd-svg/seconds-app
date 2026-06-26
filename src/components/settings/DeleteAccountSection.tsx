"use client";

import { deleteOwnAccount } from "@/lib/account/delete-account";
import { clearAllVlogDraftsForUser } from "@/lib/draft/vlog-draft-store";
import { disablePushNotifications } from "@/lib/push/register-push";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function DeleteAccountSection() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoadingProfile(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setUsername(null);
          setLoadingProfile(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      if (!cancelled) {
        if (error || !data?.username) {
          setUsername(null);
        } else {
          setUsername(data.username);
        }
        setLoadingProfile(false);
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
  }, []);

  if (loadingProfile) {
    return null;
  }

  if (!username) {
    return null;
  }

  return (
    <>
      <section className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
          アカウント
        </h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-red-500/30 bg-surface-elevated">
          <div className="px-4 py-3.5">
            <p className="text-sm text-muted">
              アカウントを削除すると、プロフィール・投稿・コメント・DM などすべてのデータが永久に削除され、復元できません。
            </p>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition hover:bg-red-500/20"
            >
              アカウントを削除
            </button>
          </div>
        </div>
      </section>

      {dialogOpen && (
        <DeleteAccountDialog
          username={username}
          onClose={handleCloseDialog}
          onDeleted={async () => {
            const supabase = createClient();
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (user) {
              try {
                await clearAllVlogDraftsForUser(user.id);
              } catch (err) {
                console.warn("[DeleteAccount] clear vlog drafts failed", err);
              }
            }
            await disablePushNotifications();
            await supabase.auth.signOut();
            router.push("/login");
            router.refresh();
          }}
        />
      )}
    </>
  );
}

type DeleteAccountDialogProps = {
  username: string;
  onClose: () => void;
  onDeleted: () => void | Promise<void>;
};

function DeleteAccountDialog({
  username,
  onClose,
  onDeleted,
}: DeleteAccountDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const confirmed = confirmText.trim().toLowerCase() === username.toLowerCase();

  useEffect(() => {
    setMounted(true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, submitting]);

  const handleDelete = async () => {
    if (!confirmed) return;

    setSubmitting(true);
    setError(null);
    try {
      await deleteOwnAccount();
      await onDeleted();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "アカウントの削除に失敗しました",
      );
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
      aria-labelledby="delete-account-dialog-title"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface-elevated p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="delete-account-dialog-title"
          className="text-base font-semibold text-foreground"
        >
          アカウントを削除しますか？
        </h2>
        <p className="mt-2 text-sm font-medium text-red-400">
          削除すると復元できません。
        </p>
        <p className="mt-2 text-sm text-muted">
          以下が永久に削除されます：
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted">
          <li>プロフィール（@{username}）</li>
          <li>投稿動画・クリップ・サムネイル</li>
          <li>コメント・いいね・フォロー関係</li>
          <li>DM と通知</li>
          <li>ブロック設定・通報履歴</li>
        </ul>

        <label className="mt-4 block text-sm text-muted">
          確認のため、ユーザー名{" "}
          <span className="font-medium text-foreground">@{username}</span>{" "}
          を入力してください
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={submitting}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={username}
            className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none ring-accent/40 focus:ring-2 disabled:opacity-50"
          />
        </label>

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
            onClick={() => void handleDelete()}
            disabled={submitting || !confirmed}
            className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
          >
            {submitting ? "削除中…" : "削除する"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
