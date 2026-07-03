/**
 * Phase 3: 既存の複数クリップ動画を 1 本に結合して DB を更新する（一度きりのバックフィル）
 *
 * .env.local に必要:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * 前提: システムに ffmpeg が PATH にあること（winget install Gyan.FFmpeg など）
 *
 * Usage:
 *   node scripts/backfill-merge-multi-clip-videos.mjs --dry-run
 *   node scripts/backfill-merge-multi-clip-videos.mjs --apply
 *   node scripts/backfill-merge-multi-clip-videos.mjs --cleanup --manifest scripts/backfill-manifest-XXXX.json
 */
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
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
const MERGED_STORAGE_NAME = "video-merged.mp4";
const MIN_MERGED_BYTES = 1024;

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
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--apply") args.apply = true;
    else if (arg === "--cleanup") args.cleanup = true;
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
  node scripts/backfill-merge-multi-clip-videos.mjs --dry-run
  node scripts/backfill-merge-multi-clip-videos.mjs --apply
  node scripts/backfill-merge-multi-clip-videos.mjs --cleanup --manifest <manifest.json>`);
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

function detectContainerFromPath(storagePath) {
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "mp4" || ext === "mov") return "mp4";
  if (ext === "webm") return "webm";
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

async function fetchMultiClipTargets(supabase) {
  const { data: clipRows, error: clipError } = await supabase
    .from("clips")
    .select("id, video_id, clip_url, clip_order")
    .order("clip_order", { ascending: true });

  if (clipError) throw new Error(clipError.message);

  const byVideo = new Map();
  for (const row of clipRows ?? []) {
    if (!byVideo.has(row.video_id)) byVideo.set(row.video_id, []);
    byVideo.get(row.video_id).push(row);
  }

  const multiClip = [];
  for (const [videoId, clips] of byVideo) {
    if (clips.length > 1) {
      multiClip.push({ videoId, clips });
    }
  }

  if (multiClip.length === 0) return [];

  const videoIds = multiClip.map((m) => m.videoId);
  const { data: videos, error: videoError } = await supabase
    .from("videos")
    .select("id, user_id, title, video_url, bgm_url, duration_seconds, created_at")
    .in("id", videoIds);

  if (videoError) throw new Error(videoError.message);

  const videoById = new Map((videos ?? []).map((v) => [v.id, v]));

  return multiClip
    .map(({ videoId, clips }) => {
      const video = videoById.get(videoId);
      if (!video) {
        return {
          videoId,
          clips,
          video: null,
          missingVideoRow: true,
        };
      }
      return { videoId, clips, video, missingVideoRow: false };
    })
    .sort(
      (a, b) =>
        new Date(a.video?.created_at ?? 0) - new Date(b.video?.created_at ?? 0),
    );
}

function buildAuditLine(target, supabaseUrl) {
  const { videoId, clips, video, missingVideoRow } = target;
  if (missingVideoRow) {
    return {
      videoId,
      clipCount: clips.length,
      title: "(videos row missing)",
      hasBgm: false,
      storagePaths: clips.map((c) => extractMediaStoragePath(c.clip_url, supabaseUrl)),
      clipOrders: clips.map((c) => c.clip_order),
    };
  }

  const storagePaths = clips.map((c) => {
    const path = extractMediaStoragePath(c.clip_url, supabaseUrl);
    return path ?? `(unparsed) ${c.clip_url}`;
  });

  return {
    videoId,
    userId: video.user_id,
    title: video.title ?? "",
    clipCount: clips.length,
    durationSeconds: video.duration_seconds,
    hasBgm: Boolean(video.bgm_url?.trim()),
    videoUrl: video.video_url,
    bgmUrl: video.bgm_url,
    storagePaths,
    clipOrders: clips.map((c) => c.clip_order),
    clipRowIds: clips.map((c) => c.id),
  };
}

function printAudit(targets, supabaseUrl) {
  console.log(`[audit] ${targets.length} video(s) with multiple clips\n`);
  for (const target of targets) {
    const line = buildAuditLine(target, supabaseUrl);
    console.log(`  video_id=${line.videoId}`);
    console.log(`    title=${JSON.stringify(line.title)}`);
    if (line.userId) console.log(`    user_id=${line.userId}`);
    console.log(`    clip_count=${line.clipCount} orders=[${line.clipOrders.join(", ")}]`);
    console.log(`    has_bgm=${line.hasBgm ? "yes" : "no"}`);
    if (line.durationSeconds != null) {
      console.log(`    duration_seconds=${line.durationSeconds}`);
    }
    for (let i = 0; i < line.storagePaths.length; i++) {
      console.log(`    clip[${line.clipOrders[i]}] storage=${line.storagePaths[i]}`);
    }
    console.log("");
  }
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

function buildConcatListContent(relativeNames) {
  return relativeNames.map((name) => `file '${name.replace(/'/g, "'\\''")}'`).join("\n");
}

async function mergeClipsWithFfmpeg(clipPaths, workDir) {
  const containers = clipPaths.map((p) => detectContainerFromPath(p));
  if (containers.some((c) => !c)) {
    throw new Error("対応していないクリップ形式があります");
  }
  const first = containers[0];
  if (!containers.every((c) => c === first)) {
    throw new Error("クリップの形式が混在しています");
  }

  const inputExt = first === "mp4" ? "mp4" : "webm";
  const virtualNames = [];
  for (let i = 0; i < clipPaths.length; i++) {
    const name = `clip_${i}.${inputExt}`;
    virtualNames.push(name);
    await writeFile(join(workDir, name), await readFile(clipPaths[i]));
  }

  const listPath = join(workDir, "concat.txt");
  await writeFile(listPath, buildConcatListContent(virtualNames), "utf8");

  const copyOut = join(workDir, `merged_copy.${inputExt}`);
  const encodeOut = join(workDir, MERGED_STORAGE_NAME);

  const copyArgs =
    first === "mp4"
      ? [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          "concat.txt",
          "-c",
          "copy",
          "-movflags",
          "+faststart",
          `merged_copy.${inputExt}`,
        ]
      : [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          "concat.txt",
          "-c",
          "copy",
          `merged_copy.${inputExt}`,
        ];

  try {
    await runProcess("ffmpeg", copyArgs, { cwd: workDir });
    const copyStat = await stat(copyOut);
    if (copyStat.size < MIN_MERGED_BYTES) {
      throw new Error("copy 結合結果が小さすぎます");
    }
    if (first === "mp4") {
      return { outputPath: copyOut, contentType: "video/mp4" };
    }
    await runProcess(
      "ffmpeg",
      [
        "-y",
        "-i",
        `merged_copy.${inputExt}`,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "28",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        MERGED_STORAGE_NAME,
      ],
      { cwd: workDir },
    );
    return { outputPath: encodeOut, contentType: "video/mp4" };
  } catch (copyErr) {
    const copyDetail = copyErr instanceof Error ? copyErr.message : String(copyErr);
    try {
      await runProcess(
        "ffmpeg",
        [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          "concat.txt",
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "28",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-movflags",
          "+faststart",
          MERGED_STORAGE_NAME,
        ],
        { cwd: workDir },
      );
      const encStat = await stat(encodeOut);
      if (encStat.size < MIN_MERGED_BYTES) {
        throw new Error("再エンコード結合結果が小さすぎます");
      }
      return { outputPath: encodeOut, contentType: "video/mp4" };
    } catch (encodeErr) {
      const encodeDetail =
        encodeErr instanceof Error ? encodeErr.message : String(encodeErr);
      throw new Error(
        `結合失敗（再エンコード: ${encodeDetail} / copy: ${copyDetail}）`,
      );
    }
  }
}

async function uploadMergedVideo(supabase, storagePath, localPath, contentType) {
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

async function applyDbUpdate(supabase, videoId, mergedPublicUrl) {
  const { error: videoError } = await supabase
    .from("videos")
    .update({ video_url: mergedPublicUrl })
    .eq("id", videoId);

  if (videoError) {
    throw new Error(`videos 更新失敗: ${videoError.message}`);
  }

  const { error: deleteError } = await supabase
    .from("clips")
    .delete()
    .eq("video_id", videoId);

  if (deleteError) {
    throw new Error(`clips 削除失敗: ${deleteError.message}`);
  }

  const { error: insertError } = await supabase.from("clips").insert({
    video_id: videoId,
    clip_url: mergedPublicUrl,
    clip_order: 0,
  });

  if (insertError) {
    throw new Error(`clips 挿入失敗: ${insertError.message}`);
  }
}

function manifestPath() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(root, "scripts", `backfill-manifest-${stamp}.json`);
}

async function runApply(supabase, supabaseUrl, targets) {
  await assertFfmpegAvailable();

  const manifest = {
    createdAt: new Date().toISOString(),
    mode: "apply",
    supabaseUrl,
    mediaBucket: MEDIA_BUCKET,
    mergedStorageName: MERGED_STORAGE_NAME,
    videos: [],
  };

  let successCount = 0;
  let failCount = 0;

  for (const target of targets) {
    const audit = buildAuditLine(target, supabaseUrl);
    const entry = {
      video_id: target.videoId,
      user_id: target.video?.user_id ?? null,
      title: target.video?.title ?? null,
      status: "pending",
      error: null,
      before: {
        video_url: target.video?.video_url ?? null,
        bgm_url: target.video?.bgm_url ?? null,
        clips: target.clips.map((c) => ({
          id: c.id,
          clip_url: c.clip_url,
          clip_order: c.clip_order,
        })),
      },
      after: null,
    };

    if (target.missingVideoRow) {
      entry.status = "failed";
      entry.error = "videos 行が見つかりません";
      manifest.videos.push(entry);
      failCount++;
      console.error(`FAILED video_id=${target.videoId} reason=${entry.error}`);
      continue;
    }

    const clipStoragePaths = target.clips.map((c) =>
      extractMediaStoragePath(c.clip_url, supabaseUrl),
    );
    if (clipStoragePaths.some((p) => !p)) {
      entry.status = "failed";
      entry.error = "clip_url から Storage パスを解析できません";
      manifest.videos.push(entry);
      failCount++;
      console.error(`FAILED video_id=${target.videoId} reason=${entry.error}`);
      continue;
    }

    const mergedStoragePath = `${target.video.user_id}/${target.videoId}/${MERGED_STORAGE_NAME}`;
    const workDir = await mkdtemp(join(tmpdir(), `seconds-backfill-${target.videoId.slice(0, 8)}-`));

    try {
      console.log(`\n[apply] video_id=${target.videoId} (${target.clips.length} clips)`);

      const localClipPaths = [];
      for (let i = 0; i < clipStoragePaths.length; i++) {
        const localPath = join(workDir, `download_${i}`);
        console.log(`  download ${clipStoragePaths[i]}`);
        await downloadStorageFile(supabase, clipStoragePaths[i], localPath);
        localClipPaths.push(localPath);
      }

      console.log("  ffmpeg merge…");
      const { outputPath, contentType } = await mergeClipsWithFfmpeg(
        localClipPaths,
        workDir,
      );

      console.log(`  upload ${mergedStoragePath}`);
      await uploadMergedVideo(supabase, mergedStoragePath, outputPath, contentType);

      const mergedPublicUrl = getMediaPublicUrl(supabaseUrl, mergedStoragePath);
      console.log("  update database…");
      await applyDbUpdate(supabase, target.videoId, mergedPublicUrl);

      entry.status = "success";
      entry.after = {
        video_url: mergedPublicUrl,
        merged_storage_path: mergedStoragePath,
        clips: [
          {
            clip_url: mergedPublicUrl,
            clip_order: 0,
          },
        ],
      };
      successCount++;
      console.log(`OK video_id=${target.videoId}`);
    } catch (err) {
      entry.status = "failed";
      entry.error = err instanceof Error ? err.message : String(err);
      failCount++;
      console.error(`FAILED video_id=${target.videoId} reason=${entry.error}`);
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
      manifest.videos.push(entry);
    }
  }

  const outPath = manifestPath();
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`\n[summary] success=${successCount} failed=${failCount} total=${targets.length}`);
  console.log(`[manifest] saved ${outPath}`);
  if (failCount > 0) {
    console.log(
      "失敗した動画は DB / 既存クリップを変更していません。manifest の before を参照して確認してください。",
    );
    process.exitCode = 1;
  }
}

async function runCleanup(supabase, supabaseUrl, manifestFile) {
  const candidates = [
    resolve(process.cwd(), manifestFile),
    join(root, manifestFile),
  ];
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

  console.log(`[cleanup] ${successes.length} video(s) from manifest\n`);

  let removedCount = 0;
  let skipCount = 0;

  for (const entry of successes) {
    const mergedPath = entry.after?.merged_storage_path;
    if (!mergedPath) {
      console.warn(`SKIP video_id=${entry.video_id} (no merged_storage_path in manifest)`);
      skipCount++;
      continue;
    }

    const { data: mergedExists, error: headError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(mergedPath, 60);

    if (headError || !mergedExists?.signedUrl) {
      console.warn(
        `SKIP video_id=${entry.video_id} merged file not verified (${mergedPath}): ${headError?.message ?? "unknown"}`,
      );
      skipCount++;
      continue;
    }

    const pathsToRemove = new Set();
    for (const clip of entry.before?.clips ?? []) {
      const path = extractMediaStoragePath(clip.clip_url, supabaseUrl);
      if (!path) continue;
      if (path === mergedPath) continue;
      if (path.endsWith(`/${MERGED_STORAGE_NAME}`)) continue;
      pathsToRemove.add(path);
    }

    if (pathsToRemove.size === 0) {
      console.log(`video_id=${entry.video_id} nothing to remove`);
      continue;
    }

    const list = [...pathsToRemove];
    console.log(`video_id=${entry.video_id} remove ${list.length} old clip file(s):`);
    for (const p of list) console.log(`  - ${p}`);

    const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(list);
    if (error) {
      console.error(`FAILED video_id=${entry.video_id} storage remove: ${error.message}`);
      skipCount++;
      continue;
    }
    removedCount += list.length;
  }

  console.log(`\n[cleanup summary] removed_files=${removedCount} skipped_videos=${skipCount}`);
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

  const targets = await fetchMultiClipTargets(supabase);
  if (targets.length === 0) {
    console.log("[audit] 複数クリップの動画は 0 件です（作業不要）");
    return;
  }

  printAudit(targets, supabaseUrl);

  if (args.dryRun) {
    console.log("[dry-run] 変更は行いませんでした");
    return;
  }

  if (args.apply) {
    await runApply(supabase, supabaseUrl, targets);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
