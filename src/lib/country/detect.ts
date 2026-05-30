/**
 * Detect ISO 3166-1 alpha-2 country code from IP geolocation, with locale fallback.
 */
export async function detectCountryCode(): Promise<string> {
  try {
    const res = await fetch("https://ipapi.co/json/", {
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json()) as { country_code?: string };
      if (data.country_code && /^[A-Z]{2}$/.test(data.country_code)) {
        return data.country_code;
      }
    }
  } catch {
    // fall through to locale fallback
  }

  const locale = navigator.language || "en-US";
  const region = locale.split("-")[1]?.toUpperCase();
  if (region && /^[A-Z]{2}$/.test(region)) {
    return region;
  }

  return "JP";
}
