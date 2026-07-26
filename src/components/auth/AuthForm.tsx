"use client";

import { AppFooter } from "@/components/layout/AppFooter";
import { BirthDateSelects } from "@/components/auth/BirthDateSelects";
import {
  normalizeSignupBirthDate,
  validateSignupBirthDate,
} from "@/lib/auth/age";
import { validatePassword, MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import {
  sanitizeSignupUsername,
  validateSignupUsername,
} from "@/lib/auth/username";
import { sanitizeAuthRedirectPath } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

type AuthMode = "signin" | "signup";

function completeLoginNavigation(path: string) {
  window.location.assign(sanitizeAuthRedirectPath(path));
}

export function AuthForm() {
  const searchParams = useSearchParams();
  const redirectTo = useMemo(
    () => sanitizeAuthRedirectPath(searchParams.get("redirect")),
    [searchParams],
  );
  const urlError = searchParams.get("error");
  const resetDone = searchParams.get("reset") === "1";

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [message, setMessage] = useState<string | null>(
    resetDone
      ? "パスワードを更新しました。アプリを開き、新しいパスワードでログインしてください。"
      : null,
  );
  const [error, setError] = useState<string | null>(
    urlError === "auth_callback_failed"
      ? "認証に失敗しました。もう一度お試しください。"
      : urlError === "reset_link_invalid"
        ? "リセット用のリンクが無効か期限切れです。もう一度お試しください。"
        : null,
  );

  const supabase = createClient();

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

      const passwordError = validatePassword(password);
      if (passwordError) {
        setError(passwordError);
        setLoading(false);
        return;
      }

      const birthDateError = validateSignupBirthDate(birthDate);
      if (birthDateError) {
        setError(birthDateError);
        setLoading(false);
        return;
      }

      const normalizedBirthDate = normalizeSignupBirthDate(birthDate);
      if (!normalizedBirthDate) {
        setError("生年月日を入力してください");
        setLoading(false);
        return;
      }

      const usernameError = validateSignupUsername(username);
      if (usernameError) {
        setError(usernameError);
        setLoading(false);
        return;
      }

      const sanitizedUsername = sanitizeSignupUsername(username);

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: sanitizedUsername || undefined,
            country: "JP",
            birth_date: normalizedBirthDate,
          },
        },
      });

      if (signUpError) {
        const raw = signUpError.message.toLowerCase();
        if (
          raw.includes("under 13") ||
          raw.includes("birth_date") ||
          raw.includes("check_violation")
        ) {
          setError("13歳未満の方は本サービスをご利用いただけません");
        } else {
          setError(signUpError.message);
        }
        setLoading(false);
        return;
      }

      if (data.session) {
        completeLoginNavigation(redirectTo);
        return;
      }

      // If email confirmations are disabled in Supabase, signUp may still return no session.
      // Try to sign-in immediately to support "signup and login right away".
      const { error: autoSignInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!autoSignInError) {
        completeLoginNavigation(redirectTo);
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

    completeLoginNavigation(redirectTo);
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
                setBirthDate("");
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
                  placeholder="yuki_tokyo（英数字と_、2〜30文字）"
                  className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted/60 outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
                />
              </div>
            )}

            {mode === "signup" && (
              <div>
                <span
                  id="birthDate-label"
                  className="mb-1.5 block text-xs font-medium text-muted"
                >
                  生年月日
                </span>
                <BirthDateSelects
                  id="birthDate"
                  required
                  value={birthDate}
                  onChange={setBirthDate}
                />
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                  本サービスは13歳以上の方が対象です。生年月日は年齢確認のみに使用します。
                </p>
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
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                placeholder={`${MIN_PASSWORD_LENGTH}文字以上`}
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted/60 outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30"
              />
              {mode === "signin" && (
                <p className="mt-2 text-right">
                  <Link
                    href="/login/forgot"
                    className="text-xs text-violet-300 hover:text-violet-200 hover:underline"
                  >
                    パスワードを忘れた場合
                  </Link>
                </p>
              )}
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
