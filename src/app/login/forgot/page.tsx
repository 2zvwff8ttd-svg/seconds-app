"use client";

import { AppFooter } from "@/components/layout/AppFooter";
import { PASSWORD_RESET_PATH } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useState } from "react";

/**
 * Request a Supabase password-recovery email.
 * redirectTo points at the reset page so default ConfirmationURL hash/code
 * tokens are handled in the browser (server /auth/callback cannot read hashes).
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const origin = window.location.origin;
    // Land on the client reset page (not /auth/callback). Hash fragments and
    // PKCE `code` are recoverable there; a server redirect would strip hashes.
    const redirectTo = `${origin}${PASSWORD_RESET_PATH}`;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo },
    );

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setSent(true);
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
            <p className="mt-2 text-sm text-muted">パスワードの再設定</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface-elevated/80 p-6 backdrop-blur-sm">
            {sent ? (
              <div className="space-y-4">
                <p className="rounded-lg bg-violet-500/10 px-3 py-2 text-sm text-accent">
                  入力されたメールアドレスに、再設定用のリンクを送信しました。メール内のリンクを開いて、新しいパスワードを設定してください。
                </p>
                <p className="text-xs leading-relaxed text-muted">
                  届かない場合は迷惑メールフォルダも確認してください。Googleのみで登録している場合は、ログイン画面の「Googleで続ける」を使ってください。
                </p>
                <Link
                  href="/login"
                  className="block w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:opacity-90"
                >
                  ログイン画面に戻る
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-xs leading-relaxed text-muted">
                  登録したメールアドレスを入力してください。再設定用のリンクを送ります。
                </p>
                <div>
                  <label
                    htmlFor="forgot-email"
                    className="mb-1.5 block text-xs font-medium text-muted"
                  >
                    メールアドレス
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@example.com"
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
                  {loading ? "送信中…" : "再設定メールを送る"}
                </button>

                <p className="text-center text-xs text-muted">
                  <Link
                    href="/login"
                    className="text-violet-300 hover:text-violet-200 hover:underline"
                  >
                    ログイン画面に戻る
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>

      <AppFooter />
    </div>
  );
}
