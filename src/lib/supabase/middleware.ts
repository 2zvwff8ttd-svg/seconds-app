import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isAdminRoute,
  isAuthRoute,
  isPublicRoute,
  sanitizeAuthRedirectPath,
} from "@/lib/auth/routes";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

const DIAG_PATHS = new Set(["/diag-auth", "/api/diag-auth"]);

function cookieStats(request: NextRequest) {
  const all = request.cookies.getAll();
  const header = request.headers.get("cookie") ?? "";
  const sb = all.filter((c) => c.name.startsWith("sb-"));
  const sbBytes = sb.reduce((sum, c) => sum + c.name.length + c.value.length + 2, 0);
  return {
    count: all.length,
    headerBytes: new TextEncoder().encode(header).length,
    sbCount: sb.length,
    sbBytes,
    sbNames: sb.map((c) => c.name).join(","),
  };
}

function applyRefreshedCookies(
  from: NextResponse,
  to: NextResponse,
): NextResponse {
  for (const header of from.headers.getSetCookie()) {
    to.headers.append("Set-Cookie", header);
  }
  return to;
}

function diagAuthHtml(stats: ReturnType<typeof cookieStats>, userId: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>diag-auth</title>
</head>
<body style="font-family:system-ui,sans-serif;padding:1.5rem;background:#111;color:#eee">
  <h1>diag-auth OK</h1>
  <p>ログイン済み・middleware直返し（Next.jsページ/RSCなし）</p>
  <ul>
    <li>user: ${userId.slice(0, 8)}…</li>
    <li>cookies: ${stats.count}</li>
    <li>Cookie header bytes: ${stats.headerBytes}</li>
    <li>sb- cookies: ${stats.sbCount} (${stats.sbBytes} bytes)</li>
    <li>sb names: ${stats.sbNames || "(none)"}</li>
  </ul>
</body>
</html>`;
}

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
  const isDiag = DIAG_PATHS.has(pathname);
  const stats = isDiag ? cookieStats(request) : null;

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

  /** Minimal HTML from middleware only — isolates cookie/middleware vs Next.js RSC. */
  if (user && pathname === "/diag-auth" && stats) {
    const html = diagAuthHtml(stats, user.id);
    const diagResponse = new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Diag-Cookie-Bytes": String(stats.headerBytes),
        "X-Diag-Sb-Cookie-Count": String(stats.sbCount),
      },
    });
    return applyRefreshedCookies(supabaseResponse, diagResponse);
  }

  if (user && !isDiag) {
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

  if (isDiag && stats) {
    supabaseResponse.headers.set("X-Diag-Cookie-Bytes", String(stats.headerBytes));
    supabaseResponse.headers.set("X-Diag-Sb-Cookie-Count", String(stats.sbCount));
  }

  return supabaseResponse;
}
