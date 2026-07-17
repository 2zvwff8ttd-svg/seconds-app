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
import {
  mergeClipsForPost,
  transcodeClipForPost,
} from "@/lib/video/merge-clips";
import type { PostEncodePath } from "@/lib/video/video-post-probe";
import { mergeVideoWithNarration } from "@/lib/video/merge-audio-tracks";
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
import {
  createPostTimer,
  logPostTiming,
  type PostTimingReport,
} from "@/lib/videos/post-timing";
import type { PostUploadStage, VideoVisibility } from "@/types/video";

export type PostClipInput = {
  file: File;
  /** 録画時に計測した秒数（WebM メタデータは使わない） */
  durationSeconds: number;
};

export const NARRATION_REQUIRES_SINGLE_VIDEO_MESSAGE =
  "ナレーションを付けるには、クリップを1本に結合する必要があります。クリップ数を減らすか、ナレーションを削除してください。";

export type PostVideoInput = {
  /** カメラで撮影したクリップ（vlog） */
  clips: PostClipInput[];
  /** サムネイル生成用の元クリップ */
  thumbnailSource?: File;
  /** クリップ index → 事前生成済みサムネ（AI解析フレーム等） */
  precomputedClipThumbnails?: Array<Blob | undefined>;
  /** ホームバブル用サムネ（任意クリップの選択フレーム）。未指定時は clip 0 の自動サムネ */
  bubbleThumbnailBlob?: Blob;
  /** プリセット BGM の公開 URL（動画とは別保存・再生時に同時再生） */
  bgmUrl?: string;
  /** ナレーション音声（ffmpeg で動画に焼き込み） */
  narrationBlob?: Blob;
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
  /** Square playback URL — used to enqueue background save-compose. */
  videoUrl: string;
};

const DB_FIX_HINT =
  "Supabase SQL Editor で supabase/sql/apply-all-fixes.sql を実行するか、.env.local に SUPABASE_DB_PASSWORD を設定して npm run db:apply-fixes を実行してください。";

function isRlsError(message: string): boolean {
  return (
    message.includes("row-level security") ||
    message.includes("42501")
  );
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

  const displayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK;

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

async function buildClipThumbnailBlobs(
  clips: PostClipInput[],
  precomputed: Array<Blob | undefined>,
  onProgress: (percent: number, label: string) => void,
  progressBase: number,
  progressRange: number,
): Promise<Blob[]> {
  const thumbnailSources = clips.map((clip) => clip.file);
  const clipThumbnailBlobs: Blob[] = [];

  for (let i = 0; i < thumbnailSources.length; i += 1) {
    const cached = precomputed[i];
    if (cached) {
      clipThumbnailBlobs.push(cached);
      onProgress(
        progressBase +
          ((i + 1) / thumbnailSources.length) * progressRange,
        `サムネイル ${i + 1}/${thumbnailSources.length}（キャッシュ）`,
      );
      continue;
    }

    onProgress(
      progressBase + (i / thumbnailSources.length) * progressRange,
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

  return clipThumbnailBlobs;
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
  const hasNarration = Boolean(input.narrationBlob);
  const bgmUrl = input.bgmUrl?.trim() || undefined;
  const timer = createPostTimer();
  const timing: PostTimingReport = {
    authMs: 0,
    transcodeMs: 0,
    narrationMs: 0,
    thumbsMs: 0,
    parallelEncodeThumbsMs: 0,
    thumbUploadMs: 0,
    videoUploadMs: 0,
    dbSaveMs: 0,
    totalMs: 0,
    clipCount: clips.length,
    durationSeconds: 0,
  };

  if (hasNarration && bgmUrl) {
    throw new Error("ナレーションとBGMは同時に指定できません");
  }

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

  timing.authMs = timer.mark();
  timing.durationSeconds = durationSeconds;

  type UploadTarget = { file: File; storageName: string };

  const progress = hasNarration
    ? {
        preparing: 38,
        preparingRange: 6,
        thumbUploadStart: 40,
        thumbUploadSpan: 8,
        bubbleThumb: 48,
        videoUploadStart: 50,
        videoUploadSpan: 38,
        saving: 90,
      }
    : {
        preparing: 24,
        preparingRange: 6,
        thumbUploadStart: 26,
        thumbUploadSpan: 8,
        bubbleThumb: 34,
        videoUploadStart: 34,
        videoUploadSpan: 58,
        saving: 92,
      };

  const precomputed = input.precomputedClipThumbnails ?? [];
  let transcodePath: PostEncodePath | undefined;
  const parallelStart = performance.now();
  timer.resetMark();

  const encodeTask = (async (): Promise<UploadTarget[]> => {
    const encodeStarted = performance.now();
    let targets: UploadTarget[];

    if (clipFiles.length > 1) {
      onStageChange("merging_clips");
      onProgress(8, "クリップを結合中…");

      const merged = await mergeClipsForPost(
        clipFiles,
        durationSeconds,
        (ratio, label) => {
          onProgress(8 + ratio * 12, label);
        },
      );
      transcodePath = merged.encodePath;
      const ext = getVideoExtension(merged.file);
      targets = [{ file: merged.file, storageName: `video.${ext}` }];
      onProgress(22, "クリップの結合が完了しました");
    } else {
      onStageChange("merging_clips");
      onProgress(8, "動画を最適化中…");

      const encoded = await transcodeClipForPost(clipFiles[0]!, (ratio, label) => {
        onProgress(8 + ratio * 14, label);
      });
      transcodePath = encoded.encodePath;
      targets = [{ file: encoded.file, storageName: "video.mp4" }];
      onProgress(22, "動画の最適化が完了しました");
    }

    timing.transcodeMs = performance.now() - encodeStarted;
    timing.transcodePath = transcodePath;
    return targets;
  })();

  const thumbsTask = (async (): Promise<{
    country: string;
    clipThumbnailBlobs: Blob[];
  }> => {
    const thumbsStarted = performance.now();
    onStageChange("preparing");
    onProgress(progress.preparing, "サムネイルを作成中…");

    const country = await detectCountryCode();
    const clipThumbnailBlobs = await buildClipThumbnailBlobs(
      clips,
      precomputed,
      onProgress,
      progress.preparing,
      progress.preparingRange,
    );

    timing.thumbsMs = performance.now() - thumbsStarted;
    return { country, clipThumbnailBlobs };
  })();

  let uploadTargets: UploadTarget[];
  let country: string;
  let clipThumbnailBlobs: Blob[];

  try {
    const [encodedTargets, thumbResult] = await Promise.all([
      encodeTask,
      thumbsTask,
    ]);
    uploadTargets = encodedTargets;
    country = thumbResult.country;
    clipThumbnailBlobs = thumbResult.clipThumbnailBlobs;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("サムネイル")) {
      rethrowPostStage("サムネイル作成", err);
    }
    if (clipFiles.length > 1) {
      rethrowPostStage("クリップ結合", err);
    }
    rethrowPostStage("動画の最適化", err);
  }

  timing.parallelEncodeThumbsMs = performance.now() - parallelStart;

  if (hasNarration && uploadTargets.length > 1) {
    throw new Error(NARRATION_REQUIRES_SINGLE_VIDEO_MESSAGE);
  }

  if (hasNarration && input.narrationBlob) {
    onStageChange("merging_audio");
    onProgress(22, "ナレーションを合成中…");
    timer.resetMark();

    try {
      const muxed = await mergeVideoWithNarration(
        uploadTargets[0]!.file,
        input.narrationBlob,
        {
          videoDurationSec: durationSeconds,
          onProgress: (ratio) => {
            onProgress(22 + ratio * 16, "ナレーションを合成中…");
          },
        },
      );
      uploadTargets = [{ file: muxed, storageName: "video.mp4" }];
      onProgress(38, "ナレーションの合成が完了しました");
    } catch (err) {
      rethrowPostStage("ナレーション合成", err);
    }

    timing.narrationMs = timer.mark();
  }

  const videoId = crypto.randomUUID();
  const basePath = `${user.id}/${videoId}`;
  const clipThumbnailPaths = clipThumbnailBlobs.map(
    (_, index) => `${basePath}/clip-${index}-thumb.jpg`,
  );

  onStageChange("uploading_thumbnail");
  const thumbUploadShare =
    progress.thumbUploadSpan / clipThumbnailBlobs.length;
  timer.resetMark();

  for (let i = 0; i < clipThumbnailBlobs.length; i++) {
    onProgress(
      progress.thumbUploadStart + thumbUploadShare * i,
      `サムネイル ${i + 1}/${clipThumbnailBlobs.length} をアップロード中…`,
    );
    try {
      await uploadFileWithProgress(
        supabase,
        clipThumbnailPaths[i]!,
        clipThumbnailBlobs[i]!,
        "image/jpeg",
        (ratio) => {
          onProgress(
            progress.thumbUploadStart + thumbUploadShare * i + thumbUploadShare * ratio,
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

  timing.thumbUploadMs = timer.mark();

  const clipUrls: string[] = [];
  const uploadShare = progress.videoUploadSpan / uploadTargets.length;
  timer.resetMark();

  for (let i = 0; i < uploadTargets.length; i++) {
    const { file, storageName } = uploadTargets[i];
    const clipPath = `${basePath}/${storageName}`;
    const sizeLabel = formatUploadSize(file.size);
    const uploadBase = progress.videoUploadStart + uploadShare * i;

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

  timing.videoUploadMs = timer.mark();

  const videoUrl = clipUrls[0]!;
  const clipThumbnailUrls = clipThumbnailPaths.map((path) =>
    getMediaPublicUrl(path),
  );

  let thumbnailUrl = clipThumbnailUrls[0]!;

  if (input.bubbleThumbnailBlob) {
    const bubbleThumbPath = `${basePath}/thumb.jpg`;
    onProgress(progress.bubbleThumb, "バブルサムネイルをアップロード中…");
    try {
      await uploadFileWithProgress(
        supabase,
        bubbleThumbPath,
        input.bubbleThumbnailBlob,
        "image/jpeg",
        (ratio) => {
          onProgress(
            progress.bubbleThumb + ratio * 2,
            "バブルサムネイルをアップロード中…",
          );
        },
      );
      thumbnailUrl = getMediaPublicUrl(bubbleThumbPath);
    } catch (err) {
      rethrowPostStage("バブルサムネイルのアップロード", err);
    }
  }

  onStageChange("saving");
  onProgress(progress.saving, "投稿を保存中…");
  timer.resetMark();

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
      bgmUrl: hasNarration ? undefined : bgmUrl,
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

  timing.dbSaveMs = timer.mark();
  timing.totalMs = timer.elapsed();
  logPostTiming(timing);

  onStageChange("done");
  onProgress(100, "投稿を受け付けました");

  return {
    videoId: inserted.id,
    publishAt: inserted.publishAt,
    currentStreak,
    videoUrl,
  };
}
