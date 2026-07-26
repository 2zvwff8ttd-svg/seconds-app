/** Minimum age required by terms / App Store social declaration. */
export const MIN_SIGNUP_AGE_YEARS = 13;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type DatePart = "year" | "month" | "day";

/** Device UI language (navigator.language), not region/country alone. */
export function getDeviceLocale(): string {
  if (typeof navigator === "undefined") return "en";
  return navigator.language || navigator.languages?.[0] || "en";
}

/**
 * Year/month/day display order for the device locale
 * (e.g. ja → YMD, en-US → MDY, en-GB → DMY).
 */
export function getLocalizedDatePartOrder(locale: string): DatePart[] {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(new Date(2000, 11, 31));
    const order = parts
      .map((p) => p.type)
      .filter((t): t is DatePart => t === "year" || t === "month" || t === "day");
    if (order.length === 3) return order;
  } catch {
    /* fall through */
  }
  if (locale.toLowerCase().startsWith("ja")) return ["year", "month", "day"];
  return ["month", "day", "year"];
}

/** Month option label: ja → "1月", otherwise locale month name. */
export function getLocalizedMonthLabel(locale: string, month: number): string {
  const m = Math.min(12, Math.max(1, Math.floor(month)));
  if (locale.toLowerCase().startsWith("ja")) {
    return `${m}月`;
  }
  try {
    return new Intl.DateTimeFormat(locale, { month: "long" }).format(
      new Date(2000, m - 1, 1),
    );
  } catch {
    return String(m);
  }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Parse YYYY-MM-DD as a local calendar date (no UTC shift). */
export function parseIsoDateOnly(value: string): Date | null {
  const trimmed = value.trim();
  if (!ISO_DATE_RE.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

/** Age in full years on `asOf` (defaults to today, local). */
export function ageInFullYears(
  birthDate: Date,
  asOf: Date = new Date(),
): number {
  let age = asOf.getFullYear() - birthDate.getFullYear();
  const monthDiff = asOf.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && asOf.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }
  return age;
}

export function isUnderMinSignupAge(
  birthDate: Date,
  minAge: number = MIN_SIGNUP_AGE_YEARS,
  asOf: Date = new Date(),
): boolean {
  return ageInFullYears(birthDate, asOf) < minAge;
}

/** Client-side signup DOB validation. Returns an error message or null. */
export function validateSignupBirthDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "生年月日を入力してください";
  }

  const birth = parseIsoDateOnly(trimmed);
  if (!birth) {
    return "生年月日の形式が正しくありません";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (birth > today) {
    return "生年月日に未来の日付は指定できません";
  }

  if (isUnderMinSignupAge(birth, MIN_SIGNUP_AGE_YEARS, today)) {
    return "13歳未満の方は本サービスをご利用いただけません";
  }

  // Sanity: reject implausibly old dates (matches soft server expectation)
  if (birth.getFullYear() < 1900) {
    return "生年月日を確認してください";
  }

  return null;
}

/** Normalize to YYYY-MM-DD for auth metadata / DB. */
export function normalizeSignupBirthDate(raw: string): string | null {
  const birth = parseIsoDateOnly(raw.trim());
  if (!birth) return null;
  const y = birth.getFullYear();
  const m = String(birth.getMonth() + 1).padStart(2, "0");
  const d = String(birth.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
