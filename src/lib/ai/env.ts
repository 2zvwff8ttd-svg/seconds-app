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
