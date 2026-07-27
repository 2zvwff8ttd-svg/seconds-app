export type MusicProvider = "replicate" | "suno";

export function getGeminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() || undefined;
}

export function getMusicProvider(): MusicProvider {
  const raw = process.env.AI_MUSIC_PROVIDER?.trim().toLowerCase();
  if (raw === "suno") return "suno";
  return "replicate";
}

export function getReplicateApiToken(): string | undefined {
  return process.env.REPLICATE_API_TOKEN?.trim() || undefined;
}

export function getSunoApiKey(): string | undefined {
  return process.env.SUNO_API_KEY?.trim() || undefined;
}

export function getOpenAiApiKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim() || undefined;
}

/** Default: gpt-image-1.5 (gpt-image-1 is deprecated). */
export function getProfilePhotoImageModel(): string {
  return process.env.OPENAI_PROFILE_PHOTO_MODEL?.trim() || "gpt-image-1.5";
}

/** UTC-day conversion limit per user. */
export function getProfilePhotoDailyLimit(): number {
  const raw = Number(process.env.AI_PROFILE_PHOTO_DAILY_LIMIT?.trim());
  if (Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  return 3;
}
