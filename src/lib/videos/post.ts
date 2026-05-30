import { detectCountryCode } from "@/lib/country/detect";
import {
  clearVideoSchemaCache,
  computeNextPublishAtJst,
  isSchemaMismatchError,
  probeVideoSchema,
} from "@/lib/supabase/video-schema";
import { getMediaPublicUrl, uploadFileWithProgress } from "@/lib/storage/upload";
import {
  captureVideoThumbnail,
  getVideoDuration,
  getVideoExtension,
} from "@/lib/video/media";
import { createClient } from "@/lib/supabase/client";
import type { PostUploadStage, VideoVisibility } from "@/types/video";

export type PostVideoInput = {
  file: File;
  title: string;
  visibility: VideoVisibility;
  onStageChange: (stage: PostUploadStage) => void;
  onProgress: (percent: number, label: string) => void;
};

export type PostVideoResult = {
  videoId: string;
  publishAt: string;
};

const DB_FIX_HINT =
  "Supabase SQL Editor で supabase/sql/apply-all-fixes.sql を実行するか、.env.local に SUPABASE_DB_PASSWORD を設定して npm run db:apply-fixes を実行してください。";

function isRlsError(message: string): boolean {
  return (
    message.includes("row-level security") ||
    message.includes("42501")
  );
}

async function ensureProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (error && !error.message.includes("schema cache")) {
    throw new Error(error.message);
  }

  if (data?.id) return;

  const suffix = userId.replace(/-/g, "").slice(0, 8);
  const { error: insertError } = await supabase.from("profiles").insert({
    id: userId,
    username: `user_${suffix}`,
    country: "JP",
  });

  if (insertError && !insertError.message.includes("duplicate")) {
    throw new Error(
      `プロフィールが未作成です。${DB_FIX_HINT}（詳細: ${insertError.message}）`,
    );
  }
}

async function saveVideoRow(
  supabase: ReturnType<typeof createClient>,
  payload: {
    id: string;
    userId: string;
    videoUrl: string;
    thumbnailUrl: string;
    title: string;
    durationSeconds: number;
    visibility: VideoVisibility;
    country: string;
  },
  retrying = false,
): Promise<{ id: string; publishAt: string }> {
  const caps = await probeVideoSchema(supabase, { force: retrying });

  const baseInsert = {
    id: payload.id,
    user_id: payload.userId,
    video_url: payload.videoUrl,
    thumbnail_url: payload.thumbnailUrl,
    title: payload.title,
    duration_seconds: payload.durationSeconds,
    visibility: payload.visibility,
    country: payload.country,
  };

  if (caps.hasInsertRpc) {
    const { data, error } = await supabase.rpc("insert_pending_video", {
      p_id: payload.id,
      p_user_id: payload.userId,
      p_video_url: payload.videoUrl,
      p_thumbnail_url: payload.thumbnailUrl,
      p_title: payload.title,
      p_duration_seconds: payload.durationSeconds,
      p_visibility: payload.visibility,
      p_country: payload.country,
    });

    if (error) {
      if (!retrying && isSchemaMismatchError(error.message)) {
        clearVideoSchemaCache();
        return saveVideoRow(supabase, payload, true);
      }
      if (isRlsError(error.message)) {
        throw new Error(`${error.message}\n\n${DB_FIX_HINT}`);
      }
      throw new Error(error.message);
    }

    const row = data as { id?: string; publish_at?: string | null };
    return {
      id: row?.id ?? payload.id,
      publishAt: row?.publish_at ?? computeNextPublishAtJst(),
    };
  }

  // INSERT のみ（.select() なし）→ RLS の SELECT ポリシー不要
  const { error } = await supabase.from("videos").insert(baseInsert);

  if (error) {
    if (!retrying && isSchemaMismatchError(error.message)) {
      clearVideoSchemaCache();
      return saveVideoRow(supabase, payload, true);
    }
    if (isSchemaMismatchError(error.message)) {
      throw new Error(DB_FIX_HINT);
    }
    if (isRlsError(error.message)) {
      throw new Error(`${error.message}\n\n${DB_FIX_HINT}`);
    }
    throw new Error(error.message);
  }

  return {
    id: payload.id,
    publishAt: computeNextPublishAtJst(),
  };
}

export async function postVideo({
  file,
  title,
  visibility,
  onStageChange,
  onProgress,
}: PostVideoInput): Promise<PostVideoResult> {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ログインが必要です");
  }

  await ensureProfile(supabase, user.id);

  onStageChange("preparing");
  onProgress(5, "動画を解析中…");

  const [country, durationSeconds, thumbnailBlob] = await Promise.all([
    detectCountryCode(),
    getVideoDuration(file),
    captureVideoThumbnail(file),
  ]);

  const videoId = crypto.randomUUID();
  const ext = getVideoExtension(file);
  const basePath = `${user.id}/${videoId}`;
  const videoPath = `${basePath}/video.${ext}`;
  const thumbnailPath = `${basePath}/thumb.jpg`;

  onStageChange("uploading_thumbnail");
  onProgress(10, "サムネイルをアップロード中…");

  await uploadFileWithProgress(
    supabase,
    thumbnailPath,
    thumbnailBlob,
    "image/jpeg",
    (ratio) => {
      onProgress(10 + ratio * 15, "サムネイルをアップロード中…");
    },
  );

  onStageChange("uploading_video");
  onProgress(25, "動画をアップロード中…");

  await uploadFileWithProgress(
    supabase,
    videoPath,
    file,
    file.type || "video/mp4",
    (ratio) => {
      onProgress(25 + ratio * 65, "動画をアップロード中…");
    },
  );

  const videoUrl = getMediaPublicUrl(videoPath);
  const thumbnailUrl = getMediaPublicUrl(thumbnailPath);

  onStageChange("saving");
  onProgress(92, "投稿を保存中…");

  const inserted = await saveVideoRow(supabase, {
    id: videoId,
    userId: user.id,
    videoUrl,
    thumbnailUrl,
    title: title.trim() || "無題のvlog",
    durationSeconds,
    visibility,
    country,
  });

  const { error: clipError } = await supabase.from("clips").insert({
    video_id: inserted.id,
    clip_url: videoUrl,
    clip_order: 0,
  });

  if (clipError) {
    if (isRlsError(clipError.message)) {
      throw new Error(`${clipError.message}\n\n${DB_FIX_HINT}`);
    }
    throw new Error(clipError.message);
  }

  onStageChange("done");
  onProgress(100, "投稿を受け付けました");

  return {
    videoId: inserted.id,
    publishAt: inserted.publishAt,
  };
}
