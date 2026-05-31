import { getSunoApiKey } from "@/lib/ai/env";

/**
 * Suno API（サードパーティプロキシ例: sunoapi.org 形式）
 * エンドポイントは環境変数 SUNO_API_BASE で上書き可能
 */
export async function generateMusicWithSuno(
  prompt: string,
  durationSeconds: number,
): Promise<ArrayBuffer> {
  const apiKey = getSunoApiKey();
  if (!apiKey) {
    throw new Error("SUNO_API_KEY が設定されていません。");
  }

  const base =
    process.env.SUNO_API_BASE?.trim() || "https://api.sunoapi.org/api/v1";
  const duration = Math.min(30, Math.max(5, Math.round(durationSeconds)));

  const createRes = await fetch(`${base}/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      make_instrumental: true,
      duration,
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(
      `Suno API エラー (${createRes.status}): ${text.slice(0, 200)}`,
    );
  }

  const created = (await createRes.json()) as {
    data?: Array<{ audio_url?: string; id?: string }>;
    audio_url?: string;
  };

  let audioUrl =
    created.audio_url ||
    created.data?.[0]?.audio_url;

  if (!audioUrl && created.data?.[0]?.id) {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const poll = await fetch(`${base}/generate/${created.data![0].id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!poll.ok) continue;
      const polled = (await poll.json()) as {
        audio_url?: string;
        data?: Array<{ audio_url?: string }>;
      };
      audioUrl = polled.audio_url || polled.data?.[0]?.audio_url;
      if (audioUrl) break;
    }
  }

  if (!audioUrl) {
    throw new Error("Suno から音楽URLを取得できませんでした");
  }

  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) {
    throw new Error("Suno 音楽のダウンロードに失敗しました");
  }
  return audioRes.arrayBuffer();
}
