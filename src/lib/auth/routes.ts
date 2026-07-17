/** Routes accessible without authentication */
export const PUBLIC_ROUTES = [
  "/login",
  "/auth/callback",
  "/auth/reset-password",
  "/privacy",
  "/terms",
  "/guidelines",
] as const;

/** Where recovery email links land after /auth/callback exchanges the code. */
export const PASSWORD_RESET_PATH = "/auth/reset-password";

/** Default redirect after successful login */
export const DEFAULT_AUTH_REDIRECT = "/";

/** Only same-origin relative paths; blocks open redirects to external domains. */
export function sanitizeAuthRedirectPath(
  value: string | null | undefined,
): string {
  if (!value) return DEFAULT_AUTH_REDIRECT;
  if (!value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT;
  }
  if (value.includes("://")) {
    return DEFAULT_AUTH_REDIRECT;
  }
  return value;
}

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
