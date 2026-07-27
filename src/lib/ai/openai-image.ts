import {
  getOpenAiApiKey,
  getProfilePhotoImageModel,
} from "@/lib/ai/env";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";

export const PROFILE_PHOTO_MAX_INPUT_BYTES = 5 * 1024 * 1024;
export const PROFILE_PHOTO_OUTPUT_SIZE = "1024x1024" as const;
export const PROFILE_PHOTO_QUALITY = "medium" as const;

export const ID_PHOTO_EDIT_PROMPT = `Edit this portrait into a Japanese-style ID / passport photo look.

Hard requirements:
- Keep the same person: face shape, age, skin tone, hair, eyes, expression, and clothing must stay recognizable.
- Do not beautify, slim, age, gender-swap, or invent a different person.
- Replace the background with a solid, plain pale light-blue studio backdrop (soft #B8D4E8 range). No gradients, props, patterns, or scenery.
- Use even, soft frontal lighting with minimal harsh shadows.
- Face the subject slightly more toward the camera if needed, but do not distort features.
- Keep a natural head-and-shoulders crop suitable for a circular avatar.
- No text, logos, watermarks, borders, or frames.`;

export type ProfilePhotoEditResult = {
  imageBase64: string;
  mimeType: "image/png";
  model: string;
  providerRequestId: string | null;
};

export class ProfilePhotoAiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 500) {
    super(message);
    this.name = "ProfilePhotoAiError";
    this.code = code;
    this.status = status;
  }
}

export async function normalizeProfilePhotoInput(
  input: Buffer,
): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize(1024, 1024, {
      fit: "contain",
      background: { r: 245, g: 248, b: 252, alpha: 1 },
      withoutEnlargement: false,
    })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

function mapOpenAiError(err: unknown): ProfilePhotoAiError {
  if (err instanceof ProfilePhotoAiError) return err;

  const anyErr = err as {
    status?: number;
    code?: string;
    type?: string;
    message?: string;
    error?: { code?: string; type?: string; message?: string };
  };

  const status = typeof anyErr.status === "number" ? anyErr.status : 500;
  const code = anyErr.code || anyErr.error?.code || "";
  const type = anyErr.type || anyErr.error?.type || "";
  const message = anyErr.message || anyErr.error?.message || "";

  if (status === 429 || code === "rate_limit_exceeded") {
    return new ProfilePhotoAiError(
      "RATE_LIMITED",
      "混み合っています。しばらくしてから再度お試しください",
      429,
    );
  }

  if (
    status === 400 &&
    (type === "image_generation_user_error" ||
      /moderat|safety|policy/i.test(`${code} ${message}`))
  ) {
    return new ProfilePhotoAiError(
      "MODERATION",
      "この画像は変換できません。別の写真を選んでください",
      400,
    );
  }

  if (status === 408 || /timeout/i.test(message)) {
    return new ProfilePhotoAiError(
      "TIMEOUT",
      "変換に時間がかかりすぎました。もう一度お試しください",
      504,
    );
  }

  return new ProfilePhotoAiError(
    "PROVIDER_ERROR",
    "証明写真風への変換に失敗しました",
    502,
  );
}

export async function editProfilePhotoToIdStyle(
  imageJpeg: Buffer,
): Promise<ProfilePhotoEditResult> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new ProfilePhotoAiError(
      "NOT_CONFIGURED",
      "OPENAI_API_KEY が設定されていません",
      503,
    );
  }

  const model = getProfilePhotoImageModel();
  const client = new OpenAI({ apiKey });
  const imageFile = await toFile(imageJpeg, "avatar.jpg", {
    type: "image/jpeg",
  });

  try {
    const response = await client.images.edit({
      model,
      image: imageFile,
      prompt: ID_PHOTO_EDIT_PROMPT,
      size: PROFILE_PHOTO_OUTPUT_SIZE,
      quality: PROFILE_PHOTO_QUALITY,
      // Keep facial identity stable for ID-style edits (gpt-image-1.5).
      input_fidelity: "high",
      output_format: "png",
      background: "opaque",
      n: 1,
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new ProfilePhotoAiError(
        "PROVIDER_ERROR",
        "証明写真風への変換に失敗しました",
        502,
      );
    }

    const providerRequestId = (() => {
      const maybe = response as { _request_id?: unknown };
      return typeof maybe._request_id === "string" ? maybe._request_id : null;
    })();

    return {
      imageBase64: b64,
      mimeType: "image/png",
      model,
      providerRequestId,
    };
  } catch (err) {
    throw mapOpenAiError(err);
  }
}
