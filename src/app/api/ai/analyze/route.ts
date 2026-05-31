import { analyzeFirstFrameWithGemini } from "@/lib/ai/gemini";
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
