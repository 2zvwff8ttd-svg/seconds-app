"use client";

import { AppFooter } from "@/components/layout/AppFooter";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

type AuthMode = "signin" | "signup";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/";
  const urlError = searchParams.get("error");

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    urlError === "auth_callback_failed"
      ? "認証に失敗しました。もう一度お試しください。"
      : null,
  );

  const supabase = createClient();

  const getCallbackUrl = useCallback(() => {
    const origin = window.location.origin;
    const next = encodeURIComponent(redirectTo);
    return `${origin}/auth/callback?next=${next}`;
  }, [redirectTo]);

  const handleGoogleSignIn = async () => {
    if (mode === "signup" && !acceptedTerms) {
      setError("利用規約とプライバシーポリシーへの同意が必要です");
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: getCallbackUrl(),
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (mode === "signup") {
      if (!acceptedTerms) {
        setError("利用規約とプライバシーポリシーへの同意が必要です");
        setLoading(false);
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username.trim() || undefined,
            country: "JP",
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      if (data.session) {
        router.push(redirectTo);
        router.refresh();
        return;
      }

      // If email confirmations are disabled in Supabase, signUp may still return no session.
      // Try to sign-in immediately to support "signup and login right away".
      const { error: autoSignInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!autoSignInError) {
        router.push(redirectTo);
        router.refresh();
        return;
      }

      setMessage(
        "アカウントを作成しました。メール確認が有効な場合は、確認メールのリンクを開いてからログインしてください。",
      );
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
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
          <p className="mt-2 text-sm text-muted">
            {mode === "signin"
              ? "アカウントにログイン"
              : "新しいアカウントを作成"}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface-elevated/80 p-6 backdrop-blur-sm">
          <div className="mb-6 flex rounded-xl bg-surface p-1">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setAcceptedTerms(false);
                setError(null);
                setMessage(null);
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                mode === "signin"
                  ? "bg-white/10 text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              ログイン
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setAcceptedTerms(false);
                setError(null);
                setMessage(null);
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                mode === "signup"
                  ? "bg-white/10 text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              サインアップ
            </button>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading || (mode === "signup" && !acceptedTerms)}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground transition hover:bg-white/5 disabled:opacity-50"
          >
            <GoogleIcon className="h-5 w-5" />
            Googleで続ける
          </button>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted">または</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label
                  htmlFor="username"
                  className="mb-1.5 block text-xs font-medium text-muted"
                >
                  ユーザー名（任意）
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="yuki_tokyo"
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted/60 outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-xs font-medium text-muted"
              >
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted/60 outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-medium text-muted"
              >
                パスワード
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                placeholder="6文字以上"
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted/60 outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </p>
            )}

            {message && (
              <p className="rounded-lg bg-violet-500/10 px-3 py-2 text-sm text-accent">
                {message}
              </p>
            )}

            {mode === "signup" && (
              <label className="flex items-start gap-3 rounded-xl border border-border bg-surface px-3 py-3 text-xs leading-relaxed text-muted">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border bg-surface accent-violet-500"
                />
                <span>
                  <Link href="/terms" className="text-violet-300 hover:text-violet-200 hover:underline">
                    利用規約
                  </Link>
                  と
                  <Link href="/privacy" className="text-violet-300 hover:text-violet-200 hover:underline">
                    プライバシーポリシー
                  </Link>
                  に同意する
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={loading || (mode === "signup" && !acceptedTerms)}
              className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:opacity-90 disabled:opacity-50"
            >
              {loading
                ? "処理中…"
                : mode === "signin"
                  ? "ログイン"
                  : "アカウントを作成"}
            </button>
          </form>
        </div>

        {mode === "signin" && (
          <p className="mt-6 text-center text-xs text-muted">
            ログインすることで、
            <Link href="/terms" className="text-violet-300 hover:underline">
              利用規約
            </Link>
            と
            <Link href="/privacy" className="text-violet-300 hover:underline">
              プライバシーポリシー
            </Link>
            に同意したものとみなされます。
          </p>
        )}
      </div>
      </div>

      <AppFooter />
    </div>
  );
}
