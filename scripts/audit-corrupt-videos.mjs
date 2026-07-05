/**
 * List videos whose public MP4 decodes with sparse frames (HEVC copy-concat damage).
 * Read-only — no DB or Storage changes.
 *
 * .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  (videos SELECT) or SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/audit-corrupt-videos.mjs
 *   node scripts/audit-corrupt-videos.mjs --json > corrupt-videos.json
 */
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const MEDIA_BUCKET = "media";
const MIN_HEALTHY_FPS = 24;

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
  const args = { json: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--json") args.json = true;
  }
  return args;
}

function probeVideo(url) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-count_frames",
      "-show_entries",
      "stream=width,height,nb_read_frames,codec_name,nb_frames",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      url,
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    return { ok: false, error: (result.stderr || "ffprobe failed").trim().slice(-200) };
  }
  const parsed = JSON.parse(result.stdout);
  const stream = parsed.streams?.[0] ?? {};
  const durationSec = Number(parsed.format?.duration ?? stream.duration ?? 0);
  const frames = Number(stream.nb_read_frames ?? 0);
  const metaFrames = Number(stream.nb_frames ?? 0);
  const effFps = durationSec > 0 ? frames / durationSec : 0;
  return {
    ok: true,
    width: stream.width,
    height: stream.height,
    codec: stream.codec_name,
    durationSec,
    frames,
    metaFrames,
    effFps,
  };
}

function classify(effFps, frames, metaFrames) {
  if (!frames || frames < 12) return "severe";
  if (effFps < MIN_HEALTHY_FPS) return "partial";
  if (metaFrames > 0 && frames / metaFrames < 0.85) return "partial";
  return "healthy";
}

function mediaPublicUrl(supabaseUrl, videoUrl) {
  if (!videoUrl) return null;
  const cleaned = videoUrl.replace(/\n/g, "").trim();
  if (cleaned.startsWith("http")) return cleaned;
  return `${supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/${cleaned}`;
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !key) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL と ANON または SERVICE_ROLE キーが必要です。",
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, key);
  const { data: videos, error } = await supabase
    .from("videos")
    .select("id, user_id, title, video_url, clip_thumbnail_urls, duration_seconds, visibility")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const rows = [];
  for (const video of videos ?? []) {
    const url = mediaPublicUrl(supabaseUrl, video.video_url);
    if (!url) {
      rows.push({
        video_id: video.id,
        user_id: video.user_id,
        title: video.title,
        visibility: video.visibility,
        thumb_count: Array.isArray(video.clip_thumbnail_urls)
          ? video.clip_thumbnail_urls.length
          : 0,
        status: "no_url",
        recommendation: "review",
      });
      continue;
    }

    const probe = probeVideo(url);
    if (!probe.ok) {
      rows.push({
        video_id: video.id,
        user_id: video.user_id,
        title: video.title,
        visibility: video.visibility,
        thumb_count: Array.isArray(video.clip_thumbnail_urls)
          ? video.clip_thumbnail_urls.length
          : 0,
        video_url: url,
        status: "probe_failed",
        error: probe.error,
        recommendation: "review",
      });
      continue;
    }

    const damage = classify(probe.effFps, probe.frames, probe.metaFrames);
    rows.push({
      video_id: video.id,
      user_id: video.user_id,
      title: video.title,
      visibility: video.visibility,
      thumb_count: Array.isArray(video.clip_thumbnail_urls)
        ? video.clip_thumbnail_urls.length
        : 0,
      video_url: url,
      resolution: `${probe.width}x${probe.height}`,
      codec: probe.codec,
      duration_sec: Number(probe.durationSec.toFixed(2)),
      decodable_frames: probe.frames,
      metadata_frames: probe.metaFrames || null,
      eff_fps: Number(probe.effFps.toFixed(1)),
      status: damage,
      recommendation:
        damage === "healthy"
          ? "keep"
          : damage === "severe"
            ? "delete_candidate"
            : "delete_candidate",
    });
  }

  const corrupt = rows.filter((r) => r.recommendation === "delete_candidate");

  if (args.json) {
    console.log(JSON.stringify({ scanned: rows.length, corrupt }, null, 2));
    return;
  }

  console.log(`[audit] scanned ${rows.length} video(s)\n`);
  console.log(
    `[delete candidates] ${corrupt.length} (eff_fps < ${MIN_HEALTHY_FPS} or severe frame loss)\n`,
  );

  for (const row of corrupt) {
    console.log(`video_id=${row.video_id}`);
    console.log(`  title=${JSON.stringify(row.title)}`);
    console.log(`  visibility=${row.visibility}`);
    console.log(`  thumb_count=${row.thumb_count}`);
    console.log(
      `  frames=${row.decodable_frames ?? "?"} meta=${row.metadata_frames ?? "?"} eff_fps=${row.eff_fps ?? "?"} duration=${row.duration_sec ?? "?"}s`,
    );
    console.log(`  resolution=${row.resolution ?? "?"} codec=${row.codec ?? "?"}`);
    console.log(`  status=${row.status}`);
    console.log("");
  }

  const healthy = rows.filter((r) => r.recommendation === "keep").length;
  const review = rows.filter((r) => r.recommendation === "review").length;
  console.log(
    `[summary] keep=${healthy} delete_candidate=${corrupt.length} review=${review}`,
  );
  console.log(
    "\n削除はまだ行いません。確認後: node scripts/delete-corrupt-videos.mjs --dry-run",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
