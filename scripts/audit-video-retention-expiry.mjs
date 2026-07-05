/**
 * List (or apply) 10-day video retention expiry.
 *
 * .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/audit-video-retention-expiry.mjs
 *   node scripts/audit-video-retention-expiry.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const MEDIA_BUCKET = "media";

function loadEnvLocal() {
  const path = join(root, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function parseArgs(argv) {
  return { apply: argv.includes("--apply") };
}

function extractMediaPath(publicUrl, supabaseUrl) {
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

async function collectStoragePaths(supabase, supabaseUrl, row, clipUrls) {
  const paths = new Set();
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

async function deleteExpiredVideo(supabase, supabaseUrl, row) {
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
}

async function main() {
  const args = parseArgs(process.argv);
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください。",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: config, error: configError } = await supabase.rpc(
    "get_video_retention_config",
  );
  if (configError) {
    console.error(
      "get_video_retention_config が未適用です。SQL Editor で supabase/migrations/029_video_retention.sql を実行してください。",
    );
    console.error(configError.message);
    process.exit(1);
  }

  console.log("[config]", JSON.stringify(config, null, 2));
  if (!config?.expiry_enabled) {
    console.log(
      "\n[note] expiry_enabled=false — 自動削除はオフです（リストのみ）。",
    );
    console.log(
      "本番適用前に app_config の video_retention.expiry_enabled を true にしてください。\n",
    );
  }

  const { data: candidates, error: listError } = await supabase.rpc(
    "list_videos_for_retention_expiry",
  );
  if (listError) {
    console.error(listError.message);
    process.exit(1);
  }

  const rows = candidates ?? [];
  console.log(`\n[${args.apply ? "apply" : "dry-run"}] ${rows.length} video(s) eligible\n`);

  for (const row of rows) {
    console.log(`video_id=${row.video_id}`);
    console.log(`  title=${JSON.stringify(row.title)}`);
    console.log(`  published_at=${row.published_at}`);
    console.log(`  expires_at=${row.expires_at}`);
    console.log("");
  }

  if (!args.apply) {
    console.log(
      "[dry-run] 削除は行いません。実行: node scripts/audit-video-retention-expiry.mjs --apply",
    );
    return;
  }

  if (!config?.expiry_enabled) {
    console.error(
      "[aborted] expiry_enabled=false のため --apply を拒否しました。",
    );
    process.exit(1);
  }

  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await deleteExpiredVideo(supabase, url, row);
      deleted += 1;
      console.log(`OK deleted video_id=${row.video_id}`);
    } catch (err) {
      failed += 1;
      console.error(
        `FAILED video_id=${row.video_id}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(`\n[summary] deleted=${deleted} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
