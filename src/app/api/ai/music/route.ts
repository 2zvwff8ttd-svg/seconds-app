import { generateBackgroundMusic } from "@/lib/ai/music";
import { getMusicProvider } from "@/lib/ai/env";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  let body: { prompt?: string; durationSeconds?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  const durationSeconds = body.durationSeconds ?? 15;

  if (!prompt) {
    return NextResponse.json({ error: "prompt が必要です" }, { status: 400 });
  }

  try {
    const audio = await generateBackgroundMusic(prompt, durationSeconds);
    const base64 = Buffer.from(audio).toString("base64");

    return NextResponse.json({
      audioBase64: base64,
      mimeType: "audio/mpeg",
      provider: getMusicProvider(),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "BGM生成に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
