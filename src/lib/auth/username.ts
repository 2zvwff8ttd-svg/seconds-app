/** DB の profiles_username_format / length と同じルール */
export function sanitizeSignupUsername(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (cleaned.length < 2) return "";
  return cleaned.slice(0, 30);
}

export function validateSignupUsername(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (!sanitizeSignupUsername(trimmed)) {
    return "ユーザー名は英数字とアンダースコアで2文字以上にしてください";
  }
  return null;
}
