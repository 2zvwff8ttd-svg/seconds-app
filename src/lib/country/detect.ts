/**
 * Detect ISO 3166-1 alpha-2 country code from locale, with optional IP geolocation.
 * IP lookup is best-effort only (ipapi.co may be blocked on some mobile networks).
 */
export async function detectCountryCode(): Promise<string> {
  const fromLocale = countryFromNavigatorLocale();
  if (fromLocale) return fromLocale;

  try {
    const res = await fetch("https://ipapi.co/json/", {
      signal: AbortSignal.timeout(2_000),
    });
    if (res.ok) {
      const data = (await res.json()) as { country_code?: string };
      if (data.country_code && /^[A-Z]{2}$/.test(data.country_code)) {
        return data.country_code;
      }
    }
  } catch {
    // ipapi blocked or slow — fall through
  }

  return "JP";
}

function countryFromNavigatorLocale(): string | null {
  if (typeof navigator === "undefined") return null;
  const locale = navigator.language || "en-US";
  const region = locale.split("-")[1]?.toUpperCase();
  if (region && /^[A-Z]{2}$/.test(region)) {
    return region;
  }
  return null;
}
