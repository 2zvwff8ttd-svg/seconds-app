import { analyzeFirstFrameWithGemini } from "@/lib/ai/gemini";
import {
  consumeRateLimit,
  MAX_AI_IMAGE_BASE64_CHARS,
} from "@/lib/ai/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const limited = consumeRateLimit({
    key: `analyze:${user.id}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "リクエストが多すぎます。しばらくしてから再試行してください。" },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      },
    );
  }

  let body: { imageBase64?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const imageBase64 = body.imageBase64?.trim();
  if (!imageBase64) {
    return NextResponse.json({ error: "imageBase64 が必要です" }, { status: 400 });
  }
  if (imageBase64.length > MAX_AI_IMAGE_BASE64_CHARS) {
    return NextResponse.json(
      { error: "画像が大きすぎます" },
      { status: 413 },
    );
  }

  try {
    const result = await analyzeFirstFrameWithGemini(
      imageBase64,
      body.mimeType || "image/jpeg",
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI解析に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
