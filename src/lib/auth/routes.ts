/** Routes accessible without authentication */
export const PUBLIC_ROUTES = ["/login", "/auth/callback"] as const;

/** Default redirect after successful login */
export const DEFAULT_AUTH_REDIRECT = "/";

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function isAuthRoute(pathname: string): boolean {
  return pathname === "/login";
}

export function isAdminRoute(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
