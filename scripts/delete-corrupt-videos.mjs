/**
 * Delete corrupt videos (DB row + Storage folder). DESTRUCTIVE — dry-run by default.
 *
 * .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/audit-corrupt-videos.mjs          # list candidates first
 *   node scripts/delete-corrupt-videos.mjs --dry-run
 *   node scripts/delete-corrupt-videos.mjs --apply --ids id1,id2
 *   node scripts/delete-corrupt-videos.mjs --apply --from-audit corrupt-videos.json
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
  const args = { dryRun: true, apply: false, ids: [], fromAudit: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") {
      args.apply = true;
      args.dryRun = false;
    } else if (arg === "--ids") {
      args.ids = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    } else if (arg === "--from-audit") {
      args.fromAudit = argv[++i];
    }
  }
  return args;
}

function requireServiceRole() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_SERVICE_ROLE_KEY が .env.local に必要です。");
    process.exit(1);
  }
  return createClient(url, key);
}

async function listStoragePaths(supabase, userId, videoId) {
  const folder = `${userId}/${videoId}`;
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list(folder);
  if (error) throw new Error(`Storage list ${folder}: ${error.message}`);
  return (data ?? []).map((item) => `${folder}/${item.name}`);
}

async function deleteVideo(supabase, videoId, userId, dryRun) {
  const paths = await listStoragePaths(supabase, userId, videoId);
  console.log(`video_id=${videoId} storage_files=${paths.length}`);
  for (const path of paths) console.log(`  ${dryRun ? "would remove" : "remove"} ${path}`);

  if (dryRun) {
    console.log(`  would delete clips + videos row`);
    return;
  }

  const { error: clipErr } = await supabase
    .from("clips")
    .delete()
    .eq("video_id", videoId);
  if (clipErr) throw new Error(`clips delete: ${clipErr.message}`);

  if (paths.length > 0) {
    const { error: storageErr } = await supabase.storage
      .from(MEDIA_BUCKET)
      .remove(paths);
    if (storageErr) throw new Error(`storage remove: ${storageErr.message}`);
  }

  const { error: videoErr } = await supabase
    .from("videos")
    .delete()
    .eq("id", videoId);
  if (videoErr) throw new Error(`videos delete: ${videoErr.message}`);

  console.log(`  deleted`);
}

async function main() {
  const args = parseArgs(process.argv);
  const supabase = requireServiceRole();

  let targets = [];
  if (args.fromAudit) {
    const auditPath = join(process.cwd(), args.fromAudit);
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));
    targets = (audit.corrupt ?? audit).map((row) => ({
      id: row.video_id,
      user_id: row.user_id,
    }));
  } else if (args.ids.length > 0) {
    const { data, error } = await supabase
      .from("videos")
      .select("id, user_id, title")
      .in("id", args.ids);
    if (error) throw new Error(error.message);
    targets = data ?? [];
  } else {
    console.error("--ids id1,id2 または --from-audit <json> を指定してください。");
    process.exit(1);
  }

  console.log(`[${args.dryRun ? "dry-run" : "apply"}] ${targets.length} video(s)\n`);
  for (const row of targets) {
    console.log(`title=${JSON.stringify(row.title ?? "")}`);
    await deleteVideo(supabase, row.id, row.user_id, args.dryRun);
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
