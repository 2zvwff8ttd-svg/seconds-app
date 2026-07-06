/**
 * Read-only audit: published videos → playback risk + fixability (Storage raw clips).
 *
 * Usage:
 *   node scripts/audit-published-playback-fixability.mjs
 *   node scripts/audit-published-playback-fixability.mjs --json > audit.json
 *
 * .env.local: NEXT_PUBLIC_SUPABASE_URL + ANON or SERVICE_ROLE key
 */
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const MEDIA_BUCKET = "media";
const RAW_CLIP_PATTERN = /^clip-(\d+)\.(webm|mp4|mov)$/i;

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

function cleanEnv(value) {
  return (value ?? "").replace(/[\r\n]+/g, "").trim();
}

function parseArgs(argv) {
  return { json: argv.includes("--json") };
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
    { encoding: "utf8", timeout: 120_000 },
  );
  if (result.status !== 0) {
    return { ok: false, error: (result.stderr || "ffprobe failed").trim().slice(-200) };
  }
  const parsed = JSON.parse(result.stdout);
  const stream = parsed.streams?.[0] ?? {};
  const durationSec = Number(parsed.format?.duration ?? 0);
  const frames = Number(stream.nb_read_frames ?? 0);
  const metaFrames = Number(stream.nb_frames ?? 0);
  const effFps = durationSec > 0 ? frames / durationSec : 0;

  let gaps = 0;
  const gapResult = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_frames",
      "-show_entries",
      "frame=best_effort_timestamp_time",
      "-of",
      "json",
      url,
    ],
    { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"], timeout: 180_000 },
  );
  if (gapResult.status === 0) {
    const gapJson = JSON.parse(gapResult.stdout);
    const frameList = gapJson.frames ?? [];
    for (let i = 1; i < frameList.length; i++) {
      const a = Number(frameList[i - 1].best_effort_timestamp_time);
      const b = Number(frameList[i].best_effort_timestamp_time);
      if (b - a > 0.08) gaps += 1;
    }
  }

  return {
    ok: true,
    width: stream.width,
    height: stream.height,
    codec: stream.codec_name,
    durationSec,
    frames,
    metaFrames,
    effFps,
    gaps,
  };
}

function cleanUrl(url) {
  return (url ?? "").replace(/[\r\n]+/g, "").trim();
}

function mediaPublicUrl(supabaseUrl, videoUrl) {
  const cleaned = cleanUrl(videoUrl);
  if (!cleaned) return null;
  if (cleaned.startsWith("http")) return cleaned;
  return `${supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/${cleaned}`;
}

function assessPlaybackRisk(probe, videoFile) {
  if (!probe.ok) return { level: "unknown", reasons: ["probe_failed"] };

  const reasons = [];
  const isHevc = probe.codec === "hevc" || probe.codec === "h265";
  const isClip0 = /^clip-0\./i.test(videoFile);
  const sparseMeta = probe.metaFrames > 0 && probe.frames / probe.metaFrames < 0.85;
  const severeSparse = probe.metaFrames > 0 && probe.frames / probe.metaFrames < 0.5;
  const veryLowFps = probe.effFps < 18;
  const lowFps = probe.effFps < 24;
  const tallHevc = isHevc && (probe.width > 1920 || probe.height > 1920);

  if (isHevc) reasons.push("hevc_codec");
  if (isClip0 && isHevc) reasons.push("single_clip_hevc");
  if (severeSparse) reasons.push("severe_frame_loss");
  else if (sparseMeta) reasons.push("metadata_frame_mismatch");
  if (veryLowFps) reasons.push("very_low_eff_fps");
  else if (lowFps) reasons.push("low_eff_fps");
  if (probe.gaps >= 3) reasons.push("timestamp_gaps");
  if (tallHevc) reasons.push("oversized_hevc");
  if (/video-reencoded/i.test(videoFile) && lowFps && !isHevc) {
    reasons.push("reencode_still_degraded");
  }

  let level = "probably_ok";
  if (
    reasons.includes("severe_frame_loss") ||
    (isHevc && isClip0) ||
    (isHevc && veryLowFps) ||
    (reasons.includes("reencode_still_degraded") && veryLowFps)
  ) {
    level = "high";
  } else if (
    reasons.includes("hevc_codec") ||
    reasons.includes("low_eff_fps") ||
    reasons.includes("metadata_frame_mismatch") ||
    reasons.includes("timestamp_gaps") ||
    reasons.includes("reencode_still_degraded")
  ) {
    level = "medium";
  } else if (reasons.length > 0) {
    level = "low";
  }

  return { level, reasons };
}

function assessFixability(probe, videoFile, storageNames, rawClips) {
  const hasReencoded = storageNames.includes("video-reencoded.mp4");
  const videoOutputs = storageNames.filter((n) =>
    /^(video(-reencoded|-merged)?\.mp4|clip-0\.(webm|mp4|mov))$/i.test(n),
  );

  if (rawClips.length >= 2) {
    return {
      verdict: "fixable",
      method: "concat_raw_clips",
      detail: `生クリップ ${rawClips.length} 本: ${rawClips.map((c) => c.name).join(", ")}`,
    };
  }

  if (rawClips.length === 1) {
    return {
      verdict: "fixable",
      method: "transcode_single_raw",
      detail: `生クリップ 1 本: ${rawClips[0].name}`,
    };
  }

  if (/^clip-0\./i.test(videoFile)) {
    return {
      verdict: "fixable",
      method: "transcode_clip0_in_place",
      detail: `配信 URL が ${videoFile}。Storage 上のファイルを libx264 再エンコード（transcodeClipForPost 相当）`,
    };
  }

  if (probe.ok && (probe.codec === "hevc" || probe.codec === "h265") && videoOutputs.length >= 1) {
    return {
      verdict: "maybe_fixable",
      method: "reencode_single_file",
      detail:
        "生クリップ無し。HEVC 単一ファイルの再エンコードで iOS コーデックは直るが、フレーム欠落が埋め込まれていると改善しない",
    };
  }

  if (hasReencoded && probe.ok && probe.effFps < 24) {
    return {
      verdict: "unlikely_fixable",
      method: "wait_expiry_or_delete",
      detail:
        "video-reencoded.mp4 済みだが劣化残存。生クリップ無し → 再エンコードでは改善困難（garbage in, garbage out）",
    };
  }

  if (probe.ok && probe.effFps < 24 && rawClips.length === 0) {
    return {
      verdict: "unlikely_fixable",
      method: "wait_expiry_or_delete",
      detail: "生クリップ無し + 低実効 fps。入力にフレーム欠落がある可能性大",
    };
  }

  return { verdict: "no_action", method: "none", detail: "現状維持" };
}

async function listStorageFolder(supabase, userId, videoId) {
  const folder = `${userId}/${videoId}`;
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list(folder);
  if (error) {
    return { folder, error: error.message, allNames: [], rawClips: [] };
  }

  const allNames = (data ?? []).map((f) => f.name).filter(Boolean);
  const rawClips = [];
  for (const name of allNames) {
    const match = RAW_CLIP_PATTERN.exec(name);
    if (!match) continue;
    rawClips.push({ name, order: Number(match[1]), ext: match[2] });
  }
  rawClips.sort((a, b) => a.order - b.order);
  return { folder, allNames, rawClips };
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv);
  const supabaseUrl = cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = cleanEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (!supabaseUrl || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL と ANON または SERVICE_ROLE キーが必要です。");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, key);
  const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY ? "service" : "anon";

  const { data: videos, error } = await supabase
    .from("videos")
    .select(
      "id, user_id, title, video_url, published_at, clip_thumbnail_urls, duration_seconds",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const rows = [];
  for (const video of videos ?? []) {
    const url = mediaPublicUrl(supabaseUrl, video.video_url);
    const videoFile = url?.split("/").pop()?.split("?")[0] ?? "";
    const thumbs = Array.isArray(video.clip_thumbnail_urls)
      ? video.clip_thumbnail_urls.length
      : 0;
    const storage = await listStorageFolder(supabase, video.user_id, video.id);
    const probe = url ? probeVideo(url) : { ok: false, error: "no_url" };
    const risk = assessPlaybackRisk(probe, videoFile);
    const fix = assessFixability(probe, videoFile, storage.allNames, storage.rawClips);

    rows.push({
      video_id: video.id,
      user_id: video.user_id,
      title: video.title,
      published_at: video.published_at,
      video_file: videoFile,
      thumb_count: thumbs,
      storage_files: storage.allNames.filter((n) => !n.includes("thumb")),
      raw_clip_count: storage.rawClips.length,
      probe: probe.ok
        ? {
            codec: probe.codec,
            resolution: `${probe.width}x${probe.height}`,
            duration_sec: Number(probe.durationSec.toFixed(2)),
            decodable_frames: probe.frames,
            metadata_frames: probe.metaFrames || null,
            eff_fps: Number(probe.effFps.toFixed(1)),
            timestamp_gaps: probe.gaps,
          }
        : { error: probe.error },
      playback_risk: risk.level,
      risk_reasons: risk.reasons,
      fix_verdict: fix.verdict,
      fix_method: fix.method,
      fix_detail: fix.detail,
      storage_list_error: storage.error ?? null,
    });
  }

  if (args.json) {
    console.log(JSON.stringify({ key_type: keyType, scanned: rows.length, rows }, null, 2));
    return;
  }

  const risky = rows.filter((r) => r.playback_risk === "high" || r.playback_risk === "medium");
  const fixable = rows.filter((r) => r.fix_verdict === "fixable");
  const maybeFixable = rows.filter((r) => r.fix_verdict === "maybe_fixable");
  const unlikely = rows.filter((r) => r.fix_verdict === "unlikely_fixable");

  console.log(`[audit] published=${rows.length} key=${keyType}\n`);

  console.log("=== 再生リスク高・中（fps だけでなく HEVC / フレーム欠落 / 再エンコード後劣化） ===\n");
  for (const row of risky) {
    const p = row.probe.codec
      ? `${row.probe.codec} ${row.probe.resolution} ${row.probe.decodable_frames}fr eff=${row.probe.eff_fps} gaps=${row.probe.timestamp_gaps}`
      : `probe_error: ${row.probe.error}`;
    console.log(`${row.title}`);
    console.log(`  id=${row.video_id}`);
    console.log(`  published=${row.published_at?.slice(0, 10) ?? "?"}`);
    console.log(`  file=${row.video_file} thumbs=${row.thumb_count}`);
    console.log(`  probe: ${p}`);
    console.log(`  storage: ${row.storage_files.join(", ") || "(empty)"}`);
    console.log(`  risk=${row.playback_risk} reasons=${row.risk_reasons.join(", ")}`);
    console.log(`  fix=${row.fix_verdict} method=${row.fix_method}`);
    console.log(`  → ${row.fix_detail}`);
    console.log("");
  }

  console.log("=== 直せる（fixable） ===\n");
  for (const row of fixable) {
    console.log(`- ${row.title} (${row.video_id})`);
    console.log(`  method=${row.fix_method} | ${row.fix_detail}`);
    console.log(`  risk=${row.playback_risk} file=${row.video_file}`);
    console.log("");
  }

  console.log("=== たぶん直せる（maybe_fixable — 要 dry-run 検証） ===\n");
  for (const row of maybeFixable) {
    console.log(`- ${row.title} (${row.video_id})`);
    console.log(`  method=${row.fix_method} | ${row.fix_detail}`);
    console.log(`  probe eff=${row.probe.eff_fps} codec=${row.probe.codec}`);
    console.log("");
  }

  console.log("=== 直せない（unlikely_fixable — 10日削除待ち or 手動削除検討） ===\n");
  for (const row of unlikely) {
    console.log(`- ${row.title} (${row.video_id})`);
    console.log(`  ${row.fix_detail}`);
    console.log(`  probe eff=${row.probe.eff_fps} file=${row.video_file}`);
    console.log("");
  }

  const riskCounts = {};
  const fixCounts = {};
  for (const row of rows) {
    riskCounts[row.playback_risk] = (riskCounts[row.playback_risk] ?? 0) + 1;
    fixCounts[row.fix_verdict] = (fixCounts[row.fix_verdict] ?? 0) + 1;
  }
  console.log("[summary] playback_risk", riskCounts);
  console.log("[summary] fix_verdict", fixCounts);
  console.log("\n実行はまだ行いません。バックフィル前に dry-run を推奨。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
