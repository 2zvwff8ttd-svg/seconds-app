import type { AiAnalyzeResult } from "@/types/ai";

export async function analyzeVideoFrame(
  imageBase64: string,
  mimeType = "image/jpeg",
): Promise<AiAnalyzeResult> {
  const res = await fetch("/api/ai/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mimeType }),
  });

  const data = (await res.json()) as AiAnalyzeResult & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || "AI解析に失敗しました");
  }
  return data;
}

export async function generateAiMusic(
  prompt: string,
  durationSeconds: number,
): Promise<Blob> {
  const res = await fetch("/api/ai/music", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, durationSeconds }),
  });

  const data = (await res.json()) as {
    audioBase64?: string;
    mimeType?: string;
    error?: string;
  };

  if (!res.ok || !data.audioBase64) {
    throw new Error(data.error || "BGM生成に失敗しました");
  }

  const binary = atob(data.audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: data.mimeType || "audio/mpeg" });
}
