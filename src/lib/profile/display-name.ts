/** Trimmed display name for UI, or username when unset. */
export function resolveDisplayName(
  displayName: string | null | undefined,
  username: string,
): string {
  const trimmed = displayName?.trim();
  return trimmed || username;
}

/** True when a custom display name is set (not empty after trim). */
export function hasCustomDisplayName(
  displayName: string | null | undefined,
): boolean {
  return Boolean(displayName?.trim());
}

/** Persist null when cleared so DB falls back to username in UI. */
export function normalizeDisplayNameForSave(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed || null;
}

/** Empty input is allowed (clears display name). */
export function validateDisplayName(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if ([...trimmed].length > 30) {
    return "表示名は30文字以内にしてください";
  }
  return null;
}
