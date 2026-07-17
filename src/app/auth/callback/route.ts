import { createClient } from "@/lib/supabase/server";
import {
  PASSWORD_RESET_PATH,
  sanitizeAuthRedirectPath,
} from "@/lib/auth/routes";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const safeNext = sanitizeAuthRedirectPath(
    searchParams.get("next") ?? searchParams.get("redirect"),
  );
  const isPasswordReset = safeNext === PASSWORD_RESET_PATH;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  if (isPasswordReset) {
    return NextResponse.redirect(
      `${origin}/login?error=reset_link_invalid`,
    );
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
