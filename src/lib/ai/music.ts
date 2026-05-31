import { getMusicProvider } from "@/lib/ai/env";
import { generateMusicWithReplicate } from "@/lib/ai/music-replicate";
import { generateMusicWithSuno } from "@/lib/ai/music-suno";

export async function generateBackgroundMusic(
  prompt: string,
  durationSeconds: number,
): Promise<ArrayBuffer> {
  const provider = getMusicProvider();
  if (provider === "suno") {
    return generateMusicWithSuno(prompt, durationSeconds);
  }
  return generateMusicWithReplicate(prompt, durationSeconds);
}
