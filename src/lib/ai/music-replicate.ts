import { getReplicateApiToken } from "@/lib/ai/env";

const MUSICGEN_MODEL = "meta/musicgen";

/** @see https://replicate.com/meta/musicgen */
const MUSICGEN_LATEST_VERSION =
  "671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb";

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

async function createPrediction(
  token: string,
  input: Record<string, unknown>,
): Promise<{ id: string }> {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const modelRes = await fetch(
    `https://api.replicate.com/v1/models/${MUSICGEN_MODEL}/predictions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ input }),
    },
  );

  if (modelRes.ok) {
    const data = (await modelRes.json()) as { id: string };
    return data;
  }

  const modelErr = await modelRes.text();
  const useVersionFallback =
    modelRes.status === 404 ||
    modelErr.includes("Invalid version") ||
    modelErr.includes("not permitted");

  if (!useVersionFallback) {
    throw new Error(`Replicate: ${modelRes.status} ${modelErr}`);
  }

  const versionRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      version: MUSICGEN_LATEST_VERSION,
      input,
    }),
  });

  if (!versionRes.ok) {
    throw new Error(`Replicate: ${versionRes.status} ${await versionRes.text()}`);
  }

  return (await versionRes.json()) as { id: string };
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
  const input = {
    prompt,
    model_version: "melody",
    duration,
    output_format: "mp3",
  };

  const created = await createPrediction(token, input);
  const audioUrl = await waitForPrediction(created.id, token);

  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error("生成された音楽のダウンロードに失敗しました");
  }
  return audioRes.arrayBuffer();
}
