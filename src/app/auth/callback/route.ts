import { createServerClient } from "@supabase/ssr";
import { type EmailOtpType } from "@supabase/supabase-js";
import {
  PASSWORD_RESET_PATH,
  sanitizeAuthRedirectPath,
} from "@/lib/auth/routes";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Auth callback for OAuth (PKCE `code`) and email links (`token_hash` + `type`).
 *
 * Default `{{ .ConfirmationURL }}` verifies on Supabase then redirects to
 * `redirectTo` — often with hash tokens the server cannot see. Password reset
 * therefore uses `redirectTo=/auth/reset-password` (client detects the hash).
 * For SSR-safe recovery across browsers (e.g. app WebView → Safari), the
 * Reset password email template should link with `token_hash` to this route.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const safeNext = sanitizeAuthRedirectPath(
    searchParams.get("next") ?? searchParams.get("redirect"),
  );
  const isPasswordReset = safeNext === PASSWORD_RESET_PATH;

  const redirectWithSessionCookies = async (
    exchange: (
      supabase: ReturnType<typeof createServerClient>,
    ) => Promise<{ error: { message: string } | null }>,
  ) => {
    let response = NextResponse.redirect(`${origin}${safeNext}`);

    const supabase = createServerClient(
      getSupabaseUrl(),
      getSupabaseAnonKey(),
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => {
              request.cookies.set(name, value);
            });
            response = NextResponse.redirect(`${origin}${safeNext}`);
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    const { error } = await exchange(supabase);
    if (error) {
      console.error("[auth/callback] session exchange failed", error.message);
      return null;
    }
    return response;
  };

  if (tokenHash && type) {
    const response = await redirectWithSessionCookies((supabase) =>
      supabase.auth.verifyOtp({ type, token_hash: tokenHash }),
    );
    if (response) return response;
  } else if (code) {
    const response = await redirectWithSessionCookies((supabase) =>
      supabase.auth.exchangeCodeForSession(code),
    );
    if (response) return response;
  }

  if (isPasswordReset) {
    // Do not bounce through /login — preserve a chance for client-side hash
    // recovery if the user somehow still lands here with fragments (rare).
    return NextResponse.redirect(`${origin}${PASSWORD_RESET_PATH}?error=link`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
