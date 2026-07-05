/**
 * Phase 4: copy 結合済み動画を libx264 で再エンコード（iOS 繋ぎ目フリーズ対策）
 *
 * 対象: clip_thumbnail_urls が 2 枚以上の動画
 *
 * .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/backfill-reencode-videos.mjs --dry-run
 *   node scripts/backfill-reencode-videos.mjs --apply
 *   node scripts/backfill-reencode-videos.mjs --apply --force
 *   node scripts/backfill-reencode-videos.mjs --cleanup --manifest scripts/backfill-reencode-manifest-XXXX.json
 */
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const MEDIA_BUCKET = "media";
const OUTPUT_STORAGE_NAME = "video-reencoded.mp4";
/** Bump when ffmpeg recipe changes; recorded in apply manifests for traceability. */
const ENCODE_RECIPE_ID = "ios-baseline-v3-framecheck";
const IOS_MAX_VIDEO_WIDTH = 1080;
const MIN_OUTPUT_BYTES = 1024;
/** ~24fps floor; partial HEVC copy-concat sources often land near 16fps and still freeze on iOS. */
const MIN_FRAMES_PER_SECOND = 24;
const RAW_CLIP_PATTERN = /^clip-(\d+)\.(webm|mp4|mov)$/i;

/** Recover timestamps from corrupt HEVC copy-concat sources when possible. */
const FFMPEG_DECODE_FLAGS = [
  "-fflags",
  "+genpts+discardcorrupt",
  "-err_detect",
  "ignore_err",
];
const FFMPEG_SCALE = ["-vf", `scale='min(${IOS_MAX_VIDEO_WIDTH},iw)':-2`];

const FFMPEG_ENCODE_VIDEO = [
  "-c:v",
  "libx264",
  "-profile:v",
  "baseline",
  "-level",
  "3.1",
  "-preset",
  "fast",
  "-crf",
  "28",
  "-pix_fmt",
  "yuv420p",
  "-g",
  "30",
  "-keyint_min",
  "30",
  "-sc_threshold",
  "0",
  "-tag:v",
  "avc1",
];
const FFMPEG_ENCODE_AUDIO = ["-c:a", "aac", "-b:a", "128k", "-ac", "2"];
const FFMPEG_MP4_FLAGS = ["-movflags", "+faststart"];

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
  const args = {
    dryRun: false,
    apply: false,
    cleanup: false,
    manifest: null,
    includeMerged: false,
    force: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--cleanup") args.cleanup = true;
    else if (arg === "--include-merged") args.includeMerged = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--manifest") {
      args.manifest = argv[++i];
      if (!args.manifest) throw new Error("--manifest にはファイルパスが必要です");
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`不明な引数: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/backfill-reencode-videos.mjs --dry-run
  node scripts/backfill-reencode-videos.mjs --apply
  node scripts/backfill-reencode-videos.mjs --apply --force
  node scripts/backfill-reencode-videos.mjs --apply --include-merged
  node scripts/backfill-reencode-videos.mjs --cleanup --manifest <manifest.json>

  --force           video-reencoded.mp4 が既にあっても現行の iOS 設定で作り直す
  --include-merged  video-merged.mp4 も再エンコード対象に含める（既定はスキップ）`);
}

function requireSupabase() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください。",
    );
    process.exit(1);
  }
  return { url, supabase: createClient(url, key) };
}

function mediaPublicPrefix(supabaseUrl) {
  return `/storage/v1/object/public/${MEDIA_BUCKET}/`;
}

function extractMediaStoragePath(publicUrl, supabaseUrl) {
  if (!publicUrl?.trim()) return null;
  try {
    const url = new URL(publicUrl, supabaseUrl);
    const prefix = mediaPublicPrefix(supabaseUrl);
    const idx = url.pathname.indexOf(prefix);
    if (idx === -1) return null;
    return decodeURIComponent(url.pathname.slice(idx + prefix.length));
  } catch {
    return null;
  }
}

function getMediaPublicUrl(supabaseUrl, storagePath) {
  return `${supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/${storagePath}`;
}

function basename(path) {
  return path?.split("/").pop() ?? path;
}

function thumbCount(video) {
  return Array.isArray(video.clip_thumbnail_urls)
    ? video.clip_thumbnail_urls.length
    : 0;
}

function applySkipReason(video, supabaseUrl, includeMerged, force) {
  const path = extractMediaStoragePath(video.video_url, supabaseUrl);
  const file = basename(path ?? video.video_url);
  if (!force && file === OUTPUT_STORAGE_NAME) {
    return "already_reencoded";
  }
  if (!includeMerged && file === "video-merged.mp4") {
    return "already_libx264_merged";
  }
  return null;
}

function runProcess(cmd, cmdArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, cmdArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    proc.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `${cmd} が見つかりません。Windows なら: winget install Gyan.FFmpeg`,
          ),
        );
      } else {
        reject(err);
      }
    });
    proc.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        const tail = (stderr || stdout).trim().slice(-2000);
        reject(new Error(tail || `${cmd} exit ${code}`));
      }
    });
  });
}

async function assertFfmpegAvailable() {
  await runProcess("ffmpeg", ["-version"]);
}

async function fetchReencodeTargets(supabase) {
  const { data: videos, error } = await supabase
    .from("videos")
    .select(
      "id, user_id, title, video_url, bgm_url, clip_thumbnail_urls, duration_seconds, created_at",
    )
    .not("clip_thumbnail_urls", "is", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (videos ?? []).filter((v) => thumbCount(v) > 1);
}

async function listRawClipPaths(supabase, userId, videoId) {
  const folder = `${userId}/${videoId}`;
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).list(folder);
  if (error) throw new Error(`Storage list failed (${folder}): ${error.message}`);

  const clips = [];
  for (const item of data ?? []) {
    const match = RAW_CLIP_PATTERN.exec(item.name ?? "");
    if (!match) continue;
    clips.push({
      order: Number(match[1]),
      ext: match[2].toLowerCase() === "mov" ? "mp4" : match[2].toLowerCase(),
      storagePath: `${folder}/${item.name}`,
    });
  }

  clips.sort((a, b) => a.order - b.order);
  return clips;
}

async function resolveInputPlan(supabase, video, supabaseUrl) {
  const videoPath = extractMediaStoragePath(video.video_url, supabaseUrl);
  if (!videoPath) {
    throw new Error("video_url から Storage パスを解析できません");
  }

  const rawClips = await listRawClipPaths(supabase, video.user_id, video.id);
  if (rawClips.length >= 2) {
    return {
      mode: "concat_raw_clips",
      rawClips,
      fallbackVideoPath: videoPath,
    };
  }

  return {
    mode: "reencode_single_file",
    sourcePath: videoPath,
    sourceFile: basename(videoPath),
  };
}

function buildConcatListContent(relativeNames) {
  return relativeNames.map((name) => `file '${name.replace(/'/g, "'\\''")}'`).join("\n");
}

async function downloadStorageFile(supabase, storagePath, destPath) {
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(`Storage download failed (${storagePath}): ${error?.message ?? "no data"}`);
  }
  const nodeStream = Readable.fromWeb(data.stream());
  await pipeline(nodeStream, createWriteStream(destPath));
  const info = await stat(destPath);
  if (info.size < 256) {
    throw new Error(`Downloaded file too small (${storagePath}): ${info.size} bytes`);
  }
}

async function countDecodableVideoFrames(localPath) {
  const { stdout } = await runProcess("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-count_frames",
    "-show_entries",
    "stream=nb_read_frames,duration",
    "-of",
    "json",
    localPath,
  ]);
  const parsed = JSON.parse(stdout);
  const stream = parsed.streams?.[0] ?? {};
  return {
    frames: Number(stream.nb_read_frames ?? 0),
    durationSec: Number(stream.duration ?? 0),
  };
}

async function assertHealthyFrameDensity(localPath, label = "再エンコード結果") {
  const { frames, durationSec } = await countDecodableVideoFrames(localPath);
  const effFps = durationSec > 0 ? frames / durationSec : 0;
  const expectedMin = Math.max(12, Math.floor(durationSec * MIN_FRAMES_PER_SECOND));
  if (frames >= expectedMin) {
    return { frames, durationSec, effFps };
  }

  throw new Error(
    `${label}の映像フレームが不足しています（${frames} frames / ${durationSec.toFixed(1)}s = ${effFps.toFixed(1)} fps, 必要 ≥${MIN_FRAMES_PER_SECOND} fps）。` +
      ` 元の video.mp4 が HEVC copy 結合で壊れている可能性があります。Storage に clip-0.* 等の生クリップが残っていれば concat_raw_clips で復旧できます。`,
  );
}

async function transcodeFileToMp4(inputName, outputName, workDir) {
  await runProcess(
    "ffmpeg",
    [
      "-y",
      ...FFMPEG_DECODE_FLAGS,
      "-i",
      inputName,
      ...FFMPEG_SCALE,
      ...FFMPEG_ENCODE_VIDEO,
      ...FFMPEG_ENCODE_AUDIO,
      ...FFMPEG_MP4_FLAGS,
      outputName,
    ],
    { cwd: workDir },
  );
}

async function concatEncodeToMp4(listFile, outputName, workDir) {
  await runProcess(
    "ffmpeg",
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listFile,
      ...FFMPEG_SCALE,
      ...FFMPEG_ENCODE_VIDEO,
      ...FFMPEG_ENCODE_AUDIO,
      ...FFMPEG_MP4_FLAGS,
      outputName,
    ],
    { cwd: workDir },
  );
}

async function produceReencodedMp4(supabase, plan, workDir) {
  const outputName = OUTPUT_STORAGE_NAME;
  const outputPath = join(workDir, outputName);

  if (plan.mode === "reencode_single_file") {
    const localName = `source_${plan.sourceFile}`;
    console.log(`  download ${plan.sourcePath}`);
    await downloadStorageFile(supabase, plan.sourcePath, join(workDir, localName));
    const sourceDensity = await assertHealthyFrameDensity(
      join(workDir, localName),
      "入力ソース",
    );
    console.log(
      `  input frames=${sourceDensity.frames} duration=${sourceDensity.durationSec.toFixed(2)}s (${sourceDensity.effFps.toFixed(1)} fps)`,
    );
    console.log(`  ffmpeg re-encode (full file) → ${outputName}`);
    await transcodeFileToMp4(localName, outputName, workDir);
  } else {
    const virtualNames = [];
    for (const clip of plan.rawClips) {
      const localName = `clip_${clip.order}.${clip.ext}`;
      console.log(`  download ${clip.storagePath}`);
      await downloadStorageFile(supabase, clip.storagePath, join(workDir, localName));
      virtualNames.push(localName);
    }
    await writeFile(join(workDir, "concat.txt"), buildConcatListContent(virtualNames), "utf8");
    console.log(`  ffmpeg concat+libx264 (${plan.rawClips.length} clips) → ${outputName}`);
    await concatEncodeToMp4("concat.txt", outputName, workDir);
  }

  const st = await stat(outputPath);
  if (st.size < MIN_OUTPUT_BYTES) {
    throw new Error("再エンコード結果が小さすぎます");
  }
  const density = await assertHealthyFrameDensity(outputPath);
  console.log(
    `  output frames=${density.frames} duration=${density.durationSec.toFixed(2)}s (${density.effFps.toFixed(1)} fps)`,
  );
  return { outputPath, contentType: "video/mp4" };
}

async function uploadOutput(supabase, storagePath, localPath, contentType) {
  const body = await readFile(localPath);
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(storagePath, body, {
    contentType,
    upsert: true,
    cacheControl: "3600",
  });
  if (error) {
    throw new Error(`Storage upload failed (${storagePath}): ${error.message}`);
  }
}

async function applyDbUpdate(supabase, videoId, publicUrl) {
  const { error: videoError } = await supabase
    .from("videos")
    .update({ video_url: publicUrl })
    .eq("id", videoId);
  if (videoError) throw new Error(`videos 更新失敗: ${videoError.message}`);

  const { data: clips, error: fetchErr } = await supabase
    .from("clips")
    .select("id, clip_url, clip_order")
    .eq("video_id", videoId)
    .order("clip_order");
  if (fetchErr) throw new Error(`clips 取得失敗: ${fetchErr.message}`);

  const { error: deleteError } = await supabase.from("clips").delete().eq("video_id", videoId);
  if (deleteError) throw new Error(`clips 削除失敗: ${deleteError.message}`);

  const { error: insertError } = await supabase.from("clips").insert({
    video_id: videoId,
    clip_url: publicUrl,
    clip_order: 0,
  });
  if (insertError) throw new Error(`clips 挿入失敗: ${insertError.message}`);

  return clips ?? [];
}

function manifestPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(root, "scripts", `backfill-reencode-manifest-${stamp}.json`);
}

function printAudit(targets, supabaseUrl, includeMerged, force) {
  console.log(`[audit] ${targets.length} video(s) with clip_thumbnail_urls > 1\n`);
  if (force) {
    console.log(
      `[audit] --force: 既存の ${OUTPUT_STORAGE_NAME} も現行エンコード設定 (${ENCODE_RECIPE_ID}) で作り直します\n`,
    );
  }
  let applyCount = 0;
  let skipCount = 0;
  let forceReencodeCount = 0;

  for (const video of targets) {
    const path = extractMediaStoragePath(video.video_url, supabaseUrl);
    const file = basename(path ?? video.video_url);
    const skip = applySkipReason(video, supabaseUrl, includeMerged, force);
    const videoPath = path;
    console.log(`  video_id=${video.id}`);
    console.log(`    title=${JSON.stringify(video.title)}`);
    console.log(`    thumb_count=${thumbCount(video)}`);
    console.log(`    has_bgm=${Boolean(video.bgm_url?.trim()) ? "yes" : "no"}`);
    console.log(`    video_url_file=${basename(videoPath)}`);
    if (skip) {
      console.log(
        `    apply=${skip === "already_reencoded" ? "skip (already reencoded)" : "skip (video-merged.mp4 = libx264 backfill)"}`,
      );
      skipCount++;
    } else {
      if (file === OUTPUT_STORAGE_NAME) {
        console.log(`    apply=yes (force re-encode ${OUTPUT_STORAGE_NAME})`);
        forceReencodeCount++;
      } else {
        console.log(`    apply=yes`);
      }
      applyCount++;
    }
    console.log("");
  }

  console.log(
    `[audit summary] would_apply=${applyCount} skip=${skipCount} force_reencode=${forceReencodeCount} total=${targets.length}`,
  );
  if (!force && skipCount > 0) {
    const reencodedSkips = targets.filter((v) => {
      const p = extractMediaStoragePath(v.video_url, supabaseUrl);
      return basename(p ?? v.video_url) === OUTPUT_STORAGE_NAME;
    }).length;
    if (reencodedSkips > 0) {
      console.log(
        `既存の ${OUTPUT_STORAGE_NAME} が ${reencodedSkips} 件スキップされています。古いエンコード設定の可能性がある場合は --force を付けて再実行してください。`,
      );
    }
  }
  if (!includeMerged && skipCount > 0) {
    console.log(
      "video-merged.mp4 は libx264 結合済みのためスキップ。再エンコードする場合は --include-merged を付けてください。",
    );
  }
}

async function runApply(supabase, supabaseUrl, targets, includeMerged, force) {
  await assertFfmpegAvailable();

  const manifest = {
    createdAt: new Date().toISOString(),
    mode: "reencode",
    encodeRecipeId: ENCODE_RECIPE_ID,
    supabaseUrl,
    mediaBucket: MEDIA_BUCKET,
    outputStorageName: OUTPUT_STORAGE_NAME,
    includeMerged,
    force,
    videos: [],
  };

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const video of targets) {
    const skip = applySkipReason(video, supabaseUrl, includeMerged, force);
    const videoPath = extractMediaStoragePath(video.video_url, supabaseUrl);

    const { data: clipsBefore } = await supabase
      .from("clips")
      .select("id, clip_url, clip_order")
      .eq("video_id", video.id)
      .order("clip_order");

    const entry = {
      video_id: video.id,
      user_id: video.user_id,
      title: video.title,
      status: "pending",
      error: null,
      input_mode: null,
      before: {
        video_url: video.video_url,
        bgm_url: video.bgm_url,
        clip_thumbnail_urls: video.clip_thumbnail_urls,
        clips: clipsBefore ?? [],
        video_storage_path: videoPath,
      },
      after: null,
    };

    if (skip) {
      entry.status = "skipped";
      entry.error = skip;
      manifest.videos.push(entry);
      skipCount++;
      console.log(`SKIP video_id=${video.id} reason=${skip}`);
      continue;
    }

    const outputStoragePath = `${video.user_id}/${video.id}/${OUTPUT_STORAGE_NAME}`;
    const workDir = await mkdtemp(join(tmpdir(), `seconds-reenc-${video.id.slice(0, 8)}-`));

    try {
      console.log(`\n[apply] video_id=${video.id} title=${JSON.stringify(video.title)}`);
      const plan = await resolveInputPlan(supabase, video, supabaseUrl);
      entry.input_mode = plan.mode;
      if (plan.mode === "concat_raw_clips") {
        console.log(`  input: ${plan.rawClips.length} raw clip file(s) in Storage`);
      } else {
        console.log(`  input: re-encode ${plan.sourceFile}`);
      }

      const { outputPath } = await produceReencodedMp4(supabase, plan, workDir);

      console.log(`  upload ${outputStoragePath}`);
      await uploadOutput(supabase, outputStoragePath, outputPath, "video/mp4");

      const publicUrl = getMediaPublicUrl(supabaseUrl, outputStoragePath);
      console.log("  update database…");
      const clipsBeforeUpdate = await applyDbUpdate(supabase, video.id, publicUrl);

      entry.status = "success";
      entry.after = {
        video_url: publicUrl,
        output_storage_path: outputStoragePath,
        clips: [{ clip_url: publicUrl, clip_order: 0 }],
      };
      if (!entry.before.clips.length) {
        entry.before.clips = clipsBeforeUpdate;
      }
      successCount++;
      console.log(`OK video_id=${video.id}`);
    } catch (err) {
      entry.status = "failed";
      entry.error = err instanceof Error ? err.message : String(err);
      failCount++;
      console.error(`FAILED video_id=${video.id} reason=${entry.error}`);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
      manifest.videos.push(entry);
    }
  }

  const outPath = manifestPath();
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(
    `\n[summary] success=${successCount} failed=${failCount} skipped=${skipCount} total=${targets.length}`,
  );
  console.log(`[manifest] saved ${outPath}`);
  if (failCount > 0) process.exitCode = 1;
}

async function runCleanup(supabase, supabaseUrl, manifestFile) {
  const candidates = [resolve(process.cwd(), manifestFile), join(root, manifestFile)];
  const manifestPathResolved = candidates.find((p) => existsSync(p));
  if (!manifestPathResolved) {
    console.error(`manifest が見つかりません: ${manifestFile}`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPathResolved, "utf8"));
  const successes = (manifest.videos ?? []).filter((v) => v.status === "success");

  if (successes.length === 0) {
    console.log("[cleanup] status=success の動画がありません");
    return;
  }

  console.log(`[cleanup] ${successes.length} video(s)\n`);
  let removedCount = 0;

  for (const entry of successes) {
    const newPath = entry.after?.output_storage_path;
    const oldPath = entry.before?.video_storage_path;
    if (!newPath || !oldPath || oldPath === newPath) {
      console.log(`video_id=${entry.video_id} nothing to remove`);
      continue;
    }
    if (oldPath.endsWith(`/${OUTPUT_STORAGE_NAME}`)) continue;

    console.log(`video_id=${entry.video_id} remove old: ${oldPath}`);
    const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([oldPath]);
    if (error) {
      console.error(`FAILED video_id=${entry.video_id}: ${error.message}`);
      continue;
    }
    removedCount++;
  }

  console.log(`\n[cleanup summary] removed_files=${removedCount}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const modes = [args.dryRun, args.apply, args.cleanup].filter(Boolean).length;
  if (modes !== 1) {
    console.error("--dry-run / --apply / --cleanup のいずれか 1 つを指定してください。");
    printHelp();
    process.exit(1);
  }

  if (args.cleanup && !args.manifest) {
    console.error("--cleanup には --manifest <file> が必要です");
    process.exit(1);
  }

  const { url: supabaseUrl, supabase } = requireSupabase();

  if (args.cleanup) {
    await runCleanup(supabase, supabaseUrl, args.manifest);
    return;
  }

  const targets = await fetchReencodeTargets(supabase);
  if (targets.length === 0) {
    console.log("[audit] clip_thumbnail_urls > 1 の動画は 0 件です");
    return;
  }

  for (const video of targets) {
    try {
      const plan = await resolveInputPlan(supabase, video, supabaseUrl);
      const skip = applySkipReason(video, supabaseUrl, args.includeMerged, args.force);
      console.log(
        `[plan] ${JSON.stringify(video.title)} mode=${plan.mode}` +
          (plan.mode === "concat_raw_clips" ? ` clips=${plan.rawClips.length}` : ` file=${plan.sourceFile}`) +
          (skip ? ` (${skip})` : args.force && basename(extractMediaStoragePath(video.video_url, supabaseUrl) ?? "") === OUTPUT_STORAGE_NAME ? " (force re-encode)" : ""),
      );
    } catch (err) {
      console.log(
        `[plan] ${JSON.stringify(video.title)} ERROR: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  console.log("");

  printAudit(targets, supabaseUrl, args.includeMerged, args.force);

  if (args.dryRun) {
    console.log("[dry-run] 変更は行いませんでした");
    return;
  }

  if (args.apply) {
    await runApply(supabase, supabaseUrl, targets, args.includeMerged, args.force);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
