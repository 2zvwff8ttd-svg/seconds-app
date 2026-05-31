import { getReplicateApiToken } from "@/lib/ai/env";

const MUSICGEN_VERSION =
  "7a76a8258b23fae65c5ea7ede261ed0632f1e5b845643882224a6fe0007f20aa";

async function waitForPrediction(
  id: string,
  token: string,
): Promise<string> {
  for (let i = 0; i < 90; i++) {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Replicate: ${res.status} ${await res.text()}`);
    }
    const data = (await res.json()) as {
      status: string;
      output?: string | string[];
      error?: string;
    };

    if (data.status === "succeeded") {
      const out = data.output;
      const url = Array.isArray(out) ? out[0] : out;
      if (!url || typeof url !== "string") {
        throw new Error("音楽URLを取得できませんでした");
      }
      return url;
    }
    if (data.status === "failed" || data.status === "canceled") {
      throw new Error(data.error || "音楽生成に失敗しました");
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("音楽生成がタイムアウトしました");
}

export async function generateMusicWithReplicate(
  prompt: string,
  durationSeconds: number,
): Promise<ArrayBuffer> {
  const token = getReplicateApiToken();
  if (!token) {
    throw new Error(
      "REPLICATE_API_TOKEN が設定されていません（MusicGen 用）。",
    );
  }

  const duration = Math.min(30, Math.max(5, Math.round(durationSeconds)));

  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: MUSICGEN_VERSION,
      input: {
        prompt,
        model_version: "melody",
        duration,
        output_format: "mp3",
      },
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Replicate: ${createRes.status} ${await createRes.text()}`);
  }

  const created = (await createRes.json()) as { id: string };
  const audioUrl = await waitForPrediction(created.id, token);

  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error("生成された音楽のダウンロードに失敗しました");
  }
  return audioRes.arrayBuffer();
}
