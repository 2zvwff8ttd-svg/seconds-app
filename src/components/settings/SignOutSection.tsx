"use client";

import { clearAllVlogDraftsForUser } from "@/lib/draft/vlog-draft-store";
import { disablePushNotifications } from "@/lib/push/register-push";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutSection() {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      try {
        await clearAllVlogDraftsForUser(user.id);
      } catch (err) {
        console.warn("[SignOutSection] clear vlog drafts failed", err);
      }
    }
    await disablePushNotifications();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <>
      <section className="mt-8">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
          ログアウト
        </h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface-elevated">
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex w-full items-center justify-between px-4 py-3.5 text-sm font-medium text-foreground transition hover:bg-white/5"
          >
            <span>ログアウト</span>
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 8l-4 4 4 4M6 12h10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </section>

      {dialogOpen && (
        <div
          className="z-modal fixed inset-0 flex items-end justify-center bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal
          aria-labelledby="sign-out-dialog-title"
          onClick={() => {
            if (!loading) setDialogOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-surface-elevated p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="sign-out-dialog-title"
              className="text-base font-semibold text-foreground"
            >
              ログアウトしますか？
            </h2>
            <p className="mt-2 text-sm text-muted">
              次回はメールアドレスとパスワードで再ログインしてください。
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setDialogOpen(false)}
                disabled={loading}
                className="flex-1 rounded-xl border border-border bg-surface py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-elevated disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                disabled={loading}
                className="flex-1 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "ログアウト中…" : "ログアウト"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
