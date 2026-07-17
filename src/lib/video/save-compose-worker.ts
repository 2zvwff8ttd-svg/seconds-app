import { composeCircleSaveMp4 } from "@/lib/video/compose-circle-save";
import { getOrFetchVideoBlob } from "@/lib/video/video-file-cache";
import { createClient } from "@/lib/supabase/client";
import { probeVideoSchema } from "@/lib/supabase/video-schema";
import { getMediaPublicUrl, MEDIA_BUCKET } from "@/lib/storage/upload";
import { normalizeMediaPublicUrl } from "@/lib/videos/normalize-media-url";

const MAX_ATTEMPTS = 2;
const ATTEMPT_KEY_PREFIX = "seconds:save-compose-attempts:";

export type SaveComposeJob = {
  videoId: string;
  videoUrl: string;
};

type QueueItem = SaveComposeJob & { attempts: number };

let queue: QueueItem[] = [];
let running = false;
let schemaReady: boolean | null = null;

function attemptKey(videoId: string): string {
  return `${ATTEMPT_KEY_PREFIX}${videoId}`;
}

function readAttempts(videoId: string): number {
  try {
    const raw = sessionStorage.getItem(attemptKey(videoId));
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeAttempts(videoId: string, n: number): void {
  try {
    sessionStorage.setItem(attemptKey(videoId), String(n));
  } catch {
    /* ignore quota */
  }
}

async function ensureSchemaReady(): Promise<boolean> {
  if (schemaReady != null) return schemaReady;
  try {
    const supabase = createClient();
    const caps = await probeVideoSchema(supabase);
    schemaReady = caps.hasSaveVideoUrl;
  } catch {
    schemaReady = false;
  }
  return schemaReady;
}

async function uploadSaveMp4(
  userId: string,
  videoId: string,
  file: File,
): Promise<string> {
  const supabase = createClient();
  const path = `${userId}/${videoId}/video-save.mp4`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (error) {
    throw new Error(error.message || "保存版のアップロードに失敗しました");
  }
  return getMediaPublicUrl(path);
}

async function processJob(job: QueueItem): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: row } = await supabase
    .from("videos")
    .select("id, user_id, video_url, save_video_url")
    .eq("id", job.videoId)
    .maybeSingle();

  if (!row || row.user_id !== user.id) return;
  if (typeof row.save_video_url === "string" && row.save_video_url.trim()) {
    return;
  }

  const sourceUrl =
    normalizeMediaPublicUrl(job.videoUrl) ||
    normalizeMediaPublicUrl(row.video_url as string);
  if (!sourceUrl) {
    throw new Error("動画 URL が無効です");
  }

  const sourceBlob = await getOrFetchVideoBlob(sourceUrl);
  const composed = await composeCircleSaveMp4(sourceBlob);
  const saveUrl = await uploadSaveMp4(user.id, job.videoId, composed);

  const { error } = await supabase
    .from("videos")
    .update({ save_video_url: saveUrl })
    .eq("id", job.videoId)
    .eq("user_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  console.info("[save-compose] ready", { videoId: job.videoId });
}

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift()!;
      const attempts = Math.max(job.attempts, readAttempts(job.videoId)) + 1;
      writeAttempts(job.videoId, attempts);

      try {
        await processJob({ ...job, attempts });
      } catch (err) {
        console.warn("[save-compose] failed", {
          videoId: job.videoId,
          attempts,
          err,
        });
        if (attempts < MAX_ATTEMPTS) {
          queue.push({ ...job, attempts });
        }
      }
    }
  } finally {
    running = false;
  }
}

/** Enqueue one video for background circle-save compose (post-success). */
export function enqueueSaveCompose(job: SaveComposeJob): void {
  void (async () => {
    if (!(await ensureSchemaReady())) return;
    if (!job.videoId || !job.videoUrl) return;
    if (readAttempts(job.videoId) >= MAX_ATTEMPTS) return;
    if (queue.some((q) => q.videoId === job.videoId)) {
      void pump();
      return;
    }
    queue.push({ ...job, attempts: readAttempts(job.videoId) });
    void pump();
  })();
}

/**
 * On app launch / resume: find own videos missing save_video_url and queue them.
 */
export async function resumePendingSaveComposes(): Promise<void> {
  if (!(await ensureSchemaReady())) return;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from("videos")
    .select("id, video_url, save_video_url")
    .eq("user_id", user.id)
    .is("save_video_url", null)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    if (
      error.message.includes("save_video_url") ||
      error.message.includes("schema cache")
    ) {
      schemaReady = false;
      return;
    }
    console.warn("[save-compose] resume query failed", error.message);
    return;
  }

  for (const row of data ?? []) {
    const videoUrl = normalizeMediaPublicUrl(row.video_url as string);
    if (!videoUrl) continue;
    if (readAttempts(row.id as string) >= MAX_ATTEMPTS) continue;
    enqueueSaveCompose({
      videoId: row.id as string,
      videoUrl,
    });
  }
}

/** Prefer masked save URL; fall back to square playback URL. */
export function resolveSaveShareVideoUrl(
  saveVideoUrl: string | null | undefined,
  videoUrl: string | null | undefined,
): string {
  return (
    normalizeMediaPublicUrl(saveVideoUrl) ||
    normalizeMediaPublicUrl(videoUrl) ||
    ""
  );
}
