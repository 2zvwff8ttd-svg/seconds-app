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

/** Profile username change: required, lowercase a-z0-9_, 2–30 chars. */
export function validateProfileUsername(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "ユーザー名を入力してください";
  }
  if (trimmed !== trimmed.toLowerCase()) {
    return "ユーザー名は半角小文字の英数字とアンダースコアのみ使えます";
  }
  if (!/^[a-z0-9_]+$/.test(trimmed)) {
    return "ユーザー名は半角英数字とアンダースコアのみ使えます";
  }
  if (trimmed.length < 2 || trimmed.length > 30) {
    return "ユーザー名は2文字以上30文字以内にしてください";
  }
  return null;
}

export function normalizeProfileUsername(raw: string): string {
  return sanitizeSignupUsername(raw);
}
