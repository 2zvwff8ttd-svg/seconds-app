import {
  ProfilePhotoAiError,
  PROFILE_PHOTO_MAX_INPUT_BYTES,
  editProfilePhotoToIdStyle,
  normalizeProfilePhotoInput,
} from "@/lib/ai/openai-image";
import {
  getProfilePhotoDailyLimit,
  getProfilePhotoImageModel,
} from "@/lib/ai/env";
import { isCurrentUserBanned } from "@/lib/auth/assert-not-banned";
import { getSupabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type QuotaErrorKind = "busy" | "daily_limit" | null;

function classifyReserveError(message: string): QuotaErrorKind {
  if (message.includes("AI_PROFILE_PHOTO_BUSY")) return "busy";
  if (message.includes("AI_PROFILE_PHOTO_DAILY_LIMIT")) return "daily_limit";
  return null;
}

function isOwnAvatarUrl(url: string, userId: string): boolean {
  try {
    const parsed = new URL(url);
    const expectedPrefix = `${getSupabaseUrl()}/storage/v1/object/public/avatars/${userId}/`;
    return parsed.href.startsWith(expectedPrefix) || url.startsWith(expectedPrefix);
  } catch {
    return false;
  }
}

async function loadImageBuffer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  form: FormData,
): Promise<{ buffer: Buffer; source: "upload" | "current" }> {
  const file = form.get("image");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/") || !ALLOWED_MIME.has(file.type)) {
      throw new ProfilePhotoAiError(
        "INVALID_IMAGE",
        "対応していない画像形式です（JPEG / PNG / WebP / GIF）",
        400,
      );
    }
    if (file.size > PROFILE_PHOTO_MAX_INPUT_BYTES) {
      throw new ProfilePhotoAiError(
        "TOO_LARGE",
        "画像は5MB以下にしてください",
        400,
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    return { buffer, source: "upload" };
  }

  const useCurrent = String(form.get("useCurrentAvatar") || "") === "1";
  if (!useCurrent) {
    throw new ProfilePhotoAiError(
      "MISSING_IMAGE",
      "画像を選択するか、現在のプロフィール画像を指定してください",
      400,
    );
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new ProfilePhotoAiError("PROFILE_LOAD_FAILED", "プロフィールの取得に失敗しました", 500);
  }

  const avatarUrl = typeof profile?.avatar_url === "string" ? profile.avatar_url.trim() : "";
  if (!avatarUrl) {
    throw new ProfilePhotoAiError(
      "NO_AVATAR",
      "変換できるプロフィール画像がありません",
      400,
    );
  }
  if (!isOwnAvatarUrl(avatarUrl, userId)) {
    throw new ProfilePhotoAiError(
      "INVALID_AVATAR",
      "このプロフィール画像は変換できません",
      400,
    );
  }

  const response = await fetch(avatarUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new ProfilePhotoAiError(
      "AVATAR_FETCH_FAILED",
      "現在のプロフィール画像を取得できませんでした",
      502,
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.startsWith("image/")) {
    throw new ProfilePhotoAiError(
      "INVALID_AVATAR",
      "現在のプロフィール画像が不正です",
      400,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > PROFILE_PHOTO_MAX_INPUT_BYTES) {
    throw new ProfilePhotoAiError(
      "TOO_LARGE",
      "画像は5MB以下にしてください",
      400,
    );
  }

  return { buffer: Buffer.from(arrayBuffer), source: "current" };
}

async function finishJob(
  supabase: Awaited<ReturnType<typeof createClient>>,
  jobId: string | null,
  status: "succeeded" | "failed",
  errorCode?: string | null,
  providerRequestId?: string | null,
) {
  if (!jobId) return;
  const { error } = await supabase.rpc("finish_ai_profile_photo_job", {
    p_job_id: jobId,
    p_status: status,
    p_error_code: errorCode ?? null,
    p_provider_request_id: providerRequestId ?? null,
  });
  if (error) {
    console.error("[profile-photo] finish job failed", {
      jobId,
      message: error.message,
    });
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "ログインが必要です", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  if (await isCurrentUserBanned(supabase, user.id)) {
    return NextResponse.json(
      { error: "このアカウントでは操作できません", code: "BANNED" },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data", code: "INVALID_FORM" },
      { status: 400 },
    );
  }

  const model = getProfilePhotoImageModel();
  const dailyLimit = getProfilePhotoDailyLimit();
  let jobId: string | null = null;

  const { data: reservedJobId, error: reserveError } = await supabase.rpc(
    "reserve_ai_profile_photo_job",
    {
      p_model: model,
      p_daily_limit: dailyLimit,
    },
  );

  if (reserveError) {
    const kind = classifyReserveError(reserveError.message || "");
    if (kind === "busy") {
      return NextResponse.json(
        {
          error: "別の変換処理が進行中です。完了してから再度お試しください",
          code: "BUSY",
        },
        { status: 409 },
      );
    }
    if (kind === "daily_limit") {
      return NextResponse.json(
        {
          error: `本日の変換回数上限（${dailyLimit}回）に達しました`,
          code: "DAILY_LIMIT",
        },
        { status: 429 },
      );
    }
    console.error("[profile-photo] reserve failed", reserveError.message);
    return NextResponse.json(
      { error: "変換を開始できませんでした", code: "RESERVE_FAILED" },
      { status: 500 },
    );
  }

  jobId = typeof reservedJobId === "string" ? reservedJobId : null;
  if (!jobId) {
    return NextResponse.json(
      { error: "変換を開始できませんでした", code: "RESERVE_FAILED" },
      { status: 500 },
    );
  }

  try {
    const { buffer } = await loadImageBuffer(supabase, user.id, form);
    const normalized = await normalizeProfilePhotoInput(buffer);
    const result = await editProfilePhotoToIdStyle(normalized);

    await finishJob(
      supabase,
      jobId,
      "succeeded",
      null,
      result.providerRequestId,
    );

    return NextResponse.json({
      imageBase64: result.imageBase64,
      mimeType: result.mimeType,
      model: result.model,
      jobId,
    });
  } catch (err) {
    const mapped =
      err instanceof ProfilePhotoAiError
        ? err
        : new ProfilePhotoAiError(
            "UNKNOWN",
            "証明写真風への変換に失敗しました",
            500,
          );

    console.error("[profile-photo] failed", {
      jobId,
      code: mapped.code,
      status: mapped.status,
      message: err instanceof Error ? err.message : String(err),
    });

    await finishJob(supabase, jobId, "failed", mapped.code, null);

    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status },
    );
  }
}
