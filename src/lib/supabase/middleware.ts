import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_AUTH_REDIRECT,
  isAdminRoute,
  isAuthRoute,
  isPublicRoute,
} from "@/lib/auth/routes";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Refreshes the session and enforces auth redirects.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicRoute(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isAuthRoute(pathname)) {
    const redirectTo =
      request.nextUrl.searchParams.get("redirect") ?? DEFAULT_AUTH_REDIRECT;
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = redirectTo.startsWith("/") ? redirectTo : DEFAULT_AUTH_REDIRECT;
    homeUrl.searchParams.delete("redirect");
    return NextResponse.redirect(homeUrl);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin, is_banned")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.is_banned && !isPublicRoute(pathname)) {
      await supabase.auth.signOut();
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("banned", "1");
      return NextResponse.redirect(loginUrl);
    }

    if (isAdminRoute(pathname) && !profile?.is_admin) {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/";
      return NextResponse.redirect(homeUrl);
    }
  }

  return supabaseResponse;
}
