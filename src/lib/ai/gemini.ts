import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AiAnalyzeResult } from "@/types/ai";
import { getGeminiApiKey } from "@/lib/ai/env";

const TITLE_PROMPT = `あなたはショート動画SNS「?Seconds」の編集者です。
添付画像はユーザーが撮影した動画の最初のフレームです。

1. 画像の内容を1文で説明（sceneDescription）
2. 内容に合ったクリエイティブで短い日本語タイトルを1つ（12文字前後、絵文字可）
3. 動画の雰囲気に合うインストゥルメントBGM用の英語プロンプト（musicPrompt、30語以内）

JSONのみ返答。形式:
{"sceneDescription":"...","title":"...","musicPrompt":"..."}`;

function parseAnalyzeJson(text: string): AiAnalyzeResult {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AIの応答を解析できませんでした");
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    sceneDescription?: string;
    title?: string;
    musicPrompt?: string;
  };

  const title = parsed.title?.trim();
  if (!title) throw new Error("タイトルを生成できませんでした");

  return {
    title: title.slice(0, 120),
    sceneDescription: parsed.sceneDescription?.trim() || "日常の一コマ",
    musicPrompt:
      parsed.musicPrompt?.trim() ||
      "upbeat instrumental vlog background music, no vocals",
  };
}

export async function analyzeFirstFrameWithGemini(
  imageBase64: string,
  mimeType: string,
): Promise<AiAnalyzeResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY が設定されていません。.env.local を確認してください。",
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash",
  });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: mimeType || "image/jpeg",
        data: imageBase64,
      },
    },
    { text: TITLE_PROMPT },
  ]);

  const text = result.response.text();
  return parseAnalyzeJson(text);
}
