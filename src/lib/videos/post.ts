import { detectCountryCode } from "@/lib/country/detect";
import { assertCanPostToday } from "@/lib/posting/daily-post-limit";
import { recordPostStreakForNow } from "@/lib/posting/post-streak";
import {
  clearVideoSchemaCache,
  computeNextPublishAtJst,
  isSchemaMismatchError,
  probeVideoSchema,
} from "@/lib/supabase/video-schema";
import { getMediaPublicUrl, uploadFileWithProgress, formatUploadSize } from "@/lib/storage/upload";
import { totalDurationSecondsForDb } from "@/lib/recording/clip-budget";
import { tryMergeClips } from "@/lib/video/merge-clips";
import {
  captureVideoThumbnail,
  getVideoExtension,
  normalizeStorageContentType,
} from "@/lib/video/media";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_VIDEO_DISPLAY_MASK,
  type VideoDisplayMaskShape,
} from "@/lib/video/display-mask";
import type { PostUploadStage, VideoVisibility } from "@/types/video";

export type PostClipInput = {
  file: File;
  /** 録画時に計測した秒数（WebM メタデータは使わない） */
  durationSeconds: number;
};

export type PostVideoInput = {
  /** カメラで撮影したクリップ（vlog） */
  clips: PostClipInput[];
  /** サムネイル生成用の元クリップ */
  thumbnailSource?: File;
  /** クリップ index → 事前生成済みサムネ（AI解析フレーム等） */
  precomputedClipThumbnails?: Array<Blob | undefined>;
  /** プリセット BGM の公開 URL（動画とは別保存・再生時に同時再生） */
  bgmUrl?: string;
  title: string;
  visibility: VideoVisibility;
  displayMaskShape?: VideoDisplayMaskShape;
  onStageChange: (stage: PostUploadStage) => void;
  onProgress: (percent: number, label: string) => void;
};

export type PostVideoResult = {
  videoId: string;
  publishAt: string;
  /** 投稿直後に更新された連続投稿日数（ボーナス表示用） */
  currentStreak: number;
};

const DB_FIX_HINT =
  "Supabase SQL Editor で supabase/sql/apply-all-fixes.sql を実行するか、.env.local に SUPABASE_DB_PASSWORD を設定して npm run db:apply-fixes を実行してください。";

function isRlsError(message: string): boolean {
  return (
    message.includes("row-level security") ||
    message.includes("42501")
  );
}

function clipExtension(file: File): string {
  return getVideoExtension(file);
}

function rethrowPostStage(stage: string, err: unknown): never {
  const detail =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  throw new Error(detail ? `${stage}: ${detail}` : stage);
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
    clipThumbnailUrls?: string[] | null;
    title: string;
    durationSeconds: number;
    visibility: VideoVisibility;
    country: string;
    bgmUrl?: string;
    displayMaskShape?: VideoDisplayMaskShape;
  },
  retrying = false,
): Promise<{ id: string; publishAt: string }> {
  const caps = await probeVideoSchema(supabase, { force: retrying });
  const bgmUrl = payload.bgmUrl?.trim() || null;
  const clipThumbnailUrls =
    payload.clipThumbnailUrls && payload.clipThumbnailUrls.length > 1
      ? payload.clipThumbnailUrls
      : null;

  const displayMaskShape = payload.displayMaskShape ?? DEFAULT_VIDEO_DISPLAY_MASK;

  const baseInsert = {
    id: payload.id,
    user_id: payload.userId,
    video_url: payload.videoUrl,
    thumbnail_url: payload.thumbnailUrl,
    title: payload.title,
    duration_seconds: payload.durationSeconds,
    visibility: payload.visibility,
    country: payload.country,
    ...(caps.hasBgmUrl && bgmUrl ? { bgm_url: bgmUrl } : {}),
    ...(caps.hasClipThumbnailUrls && clipThumbnailUrls
      ? { clip_thumbnail_urls: clipThumbnailUrls }
      : {}),
    ...(caps.hasDisplayMaskShape
      ? { display_mask_shape: displayMaskShape }
      : {}),
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
    const id = row?.id ?? payload.id;
    const postInsertPatch: Record<string, unknown> = {};
    if (caps.hasBgmUrl && bgmUrl) postInsertPatch.bgm_url = bgmUrl;
    if (caps.hasClipThumbnailUrls && clipThumbnailUrls) {
      postInsertPatch.clip_thumbnail_urls = clipThumbnailUrls;
    }
    if (caps.hasDisplayMaskShape) {
      postInsertPatch.display_mask_shape = displayMaskShape;
    }
    if (Object.keys(postInsertPatch).length > 0) {
      const { error: patchError } = await supabase
        .from("videos")
        .update(postInsertPatch)
        .eq("id", id);
      if (patchError) throw new Error(patchError.message);
    }
    return {
      id,
      publishAt: row?.publish_at ?? computeNextPublishAtJst(),
    };
  }

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

export async function postVideo(input: PostVideoInput): Promise<PostVideoResult> {
  const clips = input.clips;
  if (clips.length === 0) {
    throw new Error("投稿するクリップがありません");
  }

  const clipFiles = clips.map((c) => c.file);
  let durationSeconds: number;
  try {
    durationSeconds = totalDurationSecondsForDb(
      clips.map((c) => c.durationSeconds),
    );
  } catch (err) {
    rethrowPostStage("動画の長さ", err);
  }

  const { title, visibility, onStageChange, onProgress } = input;
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ログインが必要です");
  }

  try {
    await assertCanPostToday();
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error("投稿回数の確認に失敗しました");
  }

  try {
    await ensureProfile(supabase, user.id);
  } catch (err) {
    rethrowPostStage("プロフィール確認", err);
  }

  type UploadTarget = { file: File; storageName: string };

  let uploadTargets: UploadTarget[];

  if (clipFiles.length > 1) {
    onStageChange("merging_clips");
    onProgress(8, "クリップを結合中…");

    const mergeOutcome = await tryMergeClips(
      clipFiles,
      durationSeconds,
      (ratio, label) => {
        onProgress(8 + ratio * 12, label);
      },
    );

    if (mergeOutcome.merged) {
      const ext = getVideoExtension(mergeOutcome.file);
      uploadTargets = [
        { file: mergeOutcome.file, storageName: `video.${ext}` },
      ];
      onProgress(22, "クリップの結合が完了しました");
    } else {
      uploadTargets = clipFiles.map((file, i) => ({
        file,
        storageName: `clip-${i}.${clipExtension(file)}`,
      }));
      if (mergeOutcome.warning) {
        onProgress(20, mergeOutcome.warning);
      }
    }
  } else {
    const file = clipFiles[0];
    uploadTargets = [
      {
        file,
        storageName: `clip-0.${clipExtension(file)}`,
      },
    ];
  }

  onStageChange("preparing");
  onProgress(24, "サムネイルを作成中…");

  const thumbnailSources = clips.map((clip) => clip.file);
  const precomputed = input.precomputedClipThumbnails ?? [];

  let country: string;
  let clipThumbnailBlobs: Blob[];
  try {
    country = await detectCountryCode();

    clipThumbnailBlobs = [];
    for (let i = 0; i < thumbnailSources.length; i += 1) {
      const cached = precomputed[i];
      if (cached) {
        clipThumbnailBlobs.push(cached);
        onProgress(
          24 + ((i + 1) / thumbnailSources.length) * 6,
          `サムネイル ${i + 1}/${thumbnailSources.length}（キャッシュ）`,
        );
        continue;
      }

      onProgress(
        24 + (i / thumbnailSources.length) * 6,
        `サムネイル ${i + 1}/${thumbnailSources.length} を作成中…`,
      );
      try {
        clipThumbnailBlobs.push(await captureVideoThumbnail(thumbnailSources[i]!));
      } catch (err) {
        const detail =
          err instanceof Error ? err.message : "サムネイル生成に失敗しました";
        throw new Error(`クリップ${i + 1}のサムネイル: ${detail}`);
      }
    }
  } catch (err) {
    rethrowPostStage("サムネイル作成", err);
  }

  const videoId = crypto.randomUUID();
  const basePath = `${user.id}/${videoId}`;
  const clipThumbnailPaths = clipThumbnailBlobs.map(
    (_, index) => `${basePath}/clip-${index}-thumb.jpg`,
  );

  onStageChange("uploading_thumbnail");
  const thumbUploadShare = 8 / clipThumbnailBlobs.length;

  for (let i = 0; i < clipThumbnailBlobs.length; i++) {
    onProgress(26 + thumbUploadShare * i, `サムネイル ${i + 1}/${clipThumbnailBlobs.length} をアップロード中…`);
    try {
      await uploadFileWithProgress(
        supabase,
        clipThumbnailPaths[i]!,
        clipThumbnailBlobs[i]!,
        "image/jpeg",
        (ratio) => {
          onProgress(
            26 + thumbUploadShare * i + thumbUploadShare * ratio,
            `サムネイル ${i + 1}/${clipThumbnailBlobs.length} をアップロード中…`,
          );
        },
      );
    } catch (err) {
      rethrowPostStage(
        clipThumbnailBlobs.length > 1
          ? `サムネイル${i + 1}のアップロード`
          : "サムネイルのアップロード",
        err,
      );
    }
  }

  const clipUrls: string[] = [];
  const uploadShare = 58 / uploadTargets.length;

  for (let i = 0; i < uploadTargets.length; i++) {
    const { file, storageName } = uploadTargets[i];
    const clipPath = `${basePath}/${storageName}`;
    const sizeLabel = formatUploadSize(file.size);
    const uploadBase = 34 + uploadShare * i;

    onStageChange("uploading_video");
    onProgress(
      uploadBase,
      uploadTargets.length > 1
        ? `クリップ ${i + 1}/${uploadTargets.length} をアップロード中… (${sizeLabel})`
        : `動画をアップロード中… (${sizeLabel})`,
    );

    try {
      await uploadFileWithProgress(
        supabase,
        clipPath,
        file,
        normalizeStorageContentType(file.type || "video/webm"),
        (ratio) => {
          const pct = Math.round(ratio * 100);
          onProgress(
            uploadBase + uploadShare * ratio,
            uploadTargets.length > 1
              ? `クリップ ${i + 1}/${uploadTargets.length} をアップロード中… ${pct}% (${sizeLabel})`
              : `動画をアップロード中… ${pct}% (${sizeLabel})`,
          );
        },
      );
    } catch (err) {
      rethrowPostStage(
        uploadTargets.length > 1
          ? `クリップ${i + 1}のアップロード`
          : "動画のアップロード",
        err,
      );
    }

    clipUrls.push(getMediaPublicUrl(clipPath));
  }

  const videoUrl = clipUrls[0]!;
  const clipThumbnailUrls = clipThumbnailPaths.map((path) =>
    getMediaPublicUrl(path),
  );
  const thumbnailUrl = clipThumbnailUrls[0]!;

  onStageChange("saving");
  onProgress(92, "投稿を保存中…");

  let inserted: { id: string; publishAt: string };
  try {
    inserted = await saveVideoRow(supabase, {
      id: videoId,
      userId: user.id,
      videoUrl,
      thumbnailUrl,
      clipThumbnailUrls:
        clipThumbnailUrls.length > 1 ? clipThumbnailUrls : null,
      title: title.trim() || "無題のvlog",
      durationSeconds,
      visibility,
      country,
      bgmUrl: input.bgmUrl,
      displayMaskShape: input.displayMaskShape,
    });
  } catch (err) {
    rethrowPostStage("動画情報の保存", err);
  }

  for (let i = 0; i < clipUrls.length; i++) {
    const { error: clipError } = await supabase.from("clips").insert({
      video_id: inserted.id,
      clip_url: clipUrls[i],
      clip_order: i,
    });

    if (clipError) {
      if (isRlsError(clipError.message)) {
        throw new Error(`${clipError.message}\n\n${DB_FIX_HINT}`);
      }
      rethrowPostStage("クリップ情報の保存", new Error(clipError.message));
    }
  }

  let currentStreak: number;
  try {
    currentStreak = await recordPostStreakForNow();
  } catch (err) {
    rethrowPostStage("連続投稿の記録", err);
  }

  onStageChange("done");
  onProgress(100, "投稿を受け付けました");

  return {
    videoId: inserted.id,
    publishAt: inserted.publishAt,
    currentStreak,
  };
}
