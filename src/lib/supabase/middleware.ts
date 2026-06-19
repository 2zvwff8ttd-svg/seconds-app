import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isAdminRoute,
  isAuthRoute,
  isPublicRoute,
  sanitizeAuthRedirectPath,
} from "@/lib/auth/routes";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Refreshes the session and enforces auth redirects.
 */
export async function updateSession(request: NextRequest) {
  try {
    return await updateSessionInner(request);
  } catch (err) {
    console.error("[middleware] session update failed", err);
    return NextResponse.next({ request });
  }
}

async function updateSessionInner(request: NextRequest) {
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
    const redirectTo = sanitizeAuthRedirectPath(
      request.nextUrl.searchParams.get("redirect"),
    );
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = redirectTo;
    homeUrl.searchParams.delete("redirect");
    return NextResponse.redirect(homeUrl);
  }

  if (user) {
    let profile: { is_admin?: boolean; is_banned?: boolean } | null = null;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("is_admin, is_banned")
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        console.error("[middleware] profile lookup failed", error.message);
      } else {
        profile = data;
      }
    } catch (err) {
      console.error("[middleware] profile lookup threw", err);
    }

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
