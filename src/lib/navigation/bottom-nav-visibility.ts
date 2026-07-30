import { isPublicRoute } from "@/lib/auth/routes";

/**
 * Routes that share the persistent main BottomNav (not Post sheet / chat / player).
 */
export function shouldShowMainBottomNav(pathname: string): boolean {
  if (!pathname) return false;
  if (isPublicRoute(pathname)) return false;
  if (pathname.startsWith("/auth/")) return false;
  if (pathname === "/post" || pathname.startsWith("/post/")) return false;
  if (pathname.startsWith("/video/")) return false;
  if (pathname.startsWith("/admin")) return false;
  // /messages list shows nav; thread / with-user chat screens do not
  if (pathname.startsWith("/messages/")) return false;
  return true;
}
