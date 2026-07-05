import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const MEDIA_BUCKET = "media";

export type RetentionConfig = {
  policy_start_jst: string;
  retention_days: number;
  expiry_enabled: boolean;
};

export type RetentionExpiryRow = {
  video_id: string;
  user_id: string;
  title: string;
  published_at: string;
  expires_at: string;
  video_url: string | null;
  thumbnail_url: string | null;
  bgm_url: string | null;
};

export async function fetchRetentionConfig(
  supabase: SupabaseClient,
): Promise<RetentionConfig> {
  const { data, error } = await supabase.rpc("get_video_retention_config");
  if (error) throw new Error(error.message);
  const cfg = (data ?? {}) as Record<string, unknown>;
  return {
    policy_start_jst: String(cfg.policy_start_jst ?? ""),
    retention_days: Number(cfg.retention_days ?? 10),
    expiry_enabled: Boolean(cfg.expiry_enabled),
  };
}

export async function listRetentionExpiryCandidates(
  supabase: SupabaseClient,
): Promise<RetentionExpiryRow[]> {
  const { data, error } = await supabase.rpc("list_videos_for_retention_expiry");
  if (error) throw new Error(error.message);
  return (data ?? []) as RetentionExpiryRow[];
}

function extractMediaPath(publicUrl: string | null, supabaseUrl: string): string | null {
  if (!publicUrl?.trim()) return null;
  const cleaned = publicUrl.replace(/\n/g, "").trim();
  const prefix = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
  try {
    const url = new URL(cleaned, supabaseUrl);
    const idx = url.pathname.indexOf(prefix);
    if (idx === -1) return null;
    return decodeURIComponent(url.pathname.slice(idx + prefix.length));
  } catch {
    return null;
  }
}

async function collectStoragePaths(
  supabase: SupabaseClient,
  supabaseUrl: string,
  row: RetentionExpiryRow,
  clipUrls: string[],
): Promise<string[]> {
  const paths = new Set<string>();
  for (const url of [row.video_url, row.thumbnail_url, row.bgm_url, ...clipUrls]) {
    const path = extractMediaPath(url, supabaseUrl);
    if (path?.startsWith(`${row.user_id}/`)) paths.add(path);
  }

  const folder = `${row.user_id}/${row.video_id}`;
  const { data: listed, error } = await supabase.storage.from(MEDIA_BUCKET).list(folder);
  if (!error) {
    for (const item of listed ?? []) {
      if (item.name) paths.add(`${folder}/${item.name}`);
    }
  }

  return [...paths];
}

export async function expireRetentionVideos(
  supabase: SupabaseClient,
  supabaseUrl: string,
  options: { apply: boolean },
): Promise<{
  config: RetentionConfig;
  candidates: RetentionExpiryRow[];
  deleted: number;
  failed: Array<{ video_id: string; error: string }>;
}> {
  const config = await fetchRetentionConfig(supabase);
  const candidates = await listRetentionExpiryCandidates(supabase);

  if (!options.apply) {
    return { config, candidates, deleted: 0, failed: [] };
  }

  let deleted = 0;
  const failed: Array<{ video_id: string; error: string }> = [];

  for (const row of candidates) {
    try {
      const { data: clips, error: clipsError } = await supabase
        .from("clips")
        .select("clip_url")
        .eq("video_id", row.video_id);
      if (clipsError) throw new Error(clipsError.message);

      const storagePaths = await collectStoragePaths(
        supabase,
        supabaseUrl,
        row,
        (clips ?? []).map((c) => String(c.clip_url ?? "")),
      );

      if (storagePaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from(MEDIA_BUCKET)
          .remove(storagePaths);
        if (storageError) throw new Error(storageError.message);
      }

      const { error: deleteError } = await supabase
        .from("videos")
        .delete()
        .eq("id", row.video_id);
      if (deleteError) throw new Error(deleteError.message);

      deleted += 1;
    } catch (err) {
      failed.push({
        video_id: row.video_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { config, candidates, deleted, failed };
}
