"use client";

import { AppFooter } from "@/components/layout/AppFooter";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Set a new password after the recovery email link has established a session
 * via /auth/callback?next=/auth/reset-password.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [sessionOk, setSessionOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setSessionOk(false);
        setChecking(false);
        return;
      }
      setSessionOk(true);
      setChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("パスワードは6文字以上にしてください。");
      return;
    }
    if (password !== confirm) {
      setError("パスワードが一致しません。");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    await supabase.auth.signOut();
    router.replace("/login?reset=1");
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-y-auto">
      <div className="relative flex flex-1 flex-col items-center justify-center px-5 py-12">
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden
        >
          <div className="absolute -left-24 top-1/4 h-64 w-64 rounded-full bg-violet-600/20 blur-3xl" />
          <div className="absolute -right-16 bottom-1/4 h-56 w-56 rounded-full bg-fuchsia-600/15 blur-3xl" />
        </div>

        <div className="relative w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight">?Seconds</h1>
            <p className="mt-2 text-sm text-muted">新しいパスワードを設定</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface-elevated/80 p-6 backdrop-blur-sm">
            {checking ? (
              <p className="text-center text-sm text-muted">確認中…</p>
            ) : !sessionOk ? (
              <div className="space-y-4">
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                  リセット用のリンクが無効か期限切れです。もう一度メール送信からやり直してください。
                </p>
                <Link
                  href="/login/forgot"
                  className="block w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:opacity-90"
                >
                  パスワード再設定をやり直す
                </Link>
                <p className="text-center text-xs text-muted">
                  <Link
                    href="/login"
                    className="text-violet-300 hover:underline"
                  >
                    ログイン画面に戻る
                  </Link>
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-xs leading-relaxed text-muted">
                  新しいパスワードを入力してください。設定後はログイン画面に戻ります。アプリをご利用の場合は、アプリを開いて新しいパスワードでログインしてください。
                </p>

                <div>
                  <label
                    htmlFor="new-password"
                    className="mb-1.5 block text-xs font-medium text-muted"
                  >
                    新しいパスワード
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="6文字以上"
                    className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted/60 outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirm-password"
                    className="mb-1.5 block text-xs font-medium text-muted"
                  >
                    新しいパスワード（確認）
                  </label>
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    minLength={6}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    placeholder="もう一度入力"
                    className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted/60 outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
                  />
                </div>

                {error && (
                  <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? "設定中…" : "パスワードを更新する"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      <AppFooter />
    </div>
  );
}
