import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

/** @ffmpeg/ffmpeg パッケージと揃える（const.js の CORE_VERSION） */
const FFMPEG_CORE_VERSION = "0.12.9";
const FFMPEG_CORE_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/umd`;

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFfmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  if (!loadPromise) {
    loadPromise = (async () => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(
          `${FFMPEG_CORE_BASE}/ffmpeg-core.js`,
          "text/javascript",
        ),
        wasmURL: await toBlobURL(
          `${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`,
          "application/wasm",
        ),
      });
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    })();
  }

  return loadPromise;
}

function bgmFileName(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes("wav")) return "bgm.wav";
  if (type.includes("ogg")) return "bgm.ogg";
  if (type.includes("m4a") || type.includes("mp4")) return "bgm.m4a";
  if (type.includes("aac")) return "bgm.aac";
  return "bgm.mp3";
}

function outputBaseName(id: string): string {
  return `out_${id}`;
}

async function safeDeleteFile(ffmpeg: FFmpeg, name: string): Promise<void> {
  try {
    await ffmpeg.deleteFile(name);
  } catch {
    /* ignore */
  }
}

type MergeStrategy = "mp4_encode" | "webm_copy";

async function execMerge(
  ffmpeg: FFmpeg,
  videoName: string,
  bgmName: string,
  outName: string,
  strategy: MergeStrategy,
): Promise<void> {
  const outputArgs: string[] =
    strategy === "mp4_encode"
      ? [
          "-i",
          videoName,
          "-stream_loop",
          "-1",
          "-i",
          bgmName,
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
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
          "-b:a",
          "128k",
          "-ar",
          "44100",
          "-ac",
          "2",
          "-shortest",
          "-movflags",
          "+faststart",
          "-f",
          "mp4",
          outName,
        ]
      : [
          "-i",
          videoName,
          "-stream_loop",
          "-1",
          "-i",
          bgmName,
          "-map",
          "0:v:0",
          "-map",
          "1:a:0",
          "-c:v",
          "copy",
          "-c:a",
          "libopus",
          "-b:a",
          "128k",
          "-shortest",
          "-f",
          "webm",
          outName,
        ];

  const logs: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    logs.push(message);
  };
  ffmpeg.on("log", onLog);

  try {
    const code = await ffmpeg.exec(outputArgs);
    if (code !== 0) {
      const tail = logs.slice(-5).join(" ").trim();
      throw new Error(tail || `ffmpeg exit ${code}`);
    }
  } finally {
    ffmpeg.off("log", onLog);
  }
}

async function validatePlayableVideo(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0) {
          reject(new Error("動画の長さを読み取れませんでした"));
          return;
        }
        resolve();
      };
      video.onerror = () => reject(new Error("合成動画を再生できません"));
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 動画に BGM を合成（BGM のみ・MP4 出力を優先）
 */
export async function mergeVideoWithBgm(
  videoFile: File,
  bgmBlob: Blob,
  onProgress?: (ratio: number) => void,
): Promise<File> {
  const ffmpeg = await getFfmpeg();
  const runId = crypto.randomUUID().slice(0, 8);
  onProgress?.(0.05);

  const videoExt = videoFile.name.split(".").pop() || "webm";
  const videoName = `vin_${runId}.${videoExt}`;
  const bgmName = `bgm_${runId}.${bgmFileName(bgmBlob).replace("bgm.", "")}`;
  const outMp4 = `${outputBaseName(runId)}.mp4`;
  const outWebm = `${outputBaseName(runId)}.webm`;

  await ffmpeg.writeFile(videoName, await fetchFile(videoFile));
  await ffmpeg.writeFile(bgmName, await fetchFile(bgmBlob));
  onProgress?.(0.2);

  const onFfmpegProgress = ({ progress }: { progress: number }) => {
    if (typeof progress === "number") {
      onProgress?.(0.2 + Math.min(0.75, progress));
    }
  };
  ffmpeg.on("progress", onFfmpegProgress);

  let outName: string | null = null;
  let lastError = "";

  try {
    try {
      await execMerge(ffmpeg, videoName, bgmName, outMp4, "mp4_encode");
      outName = outMp4;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await safeDeleteFile(ffmpeg, outMp4);
      await execMerge(ffmpeg, videoName, bgmName, outWebm, "webm_copy");
      outName = outWebm;
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `BGM合成に失敗しました: ${detail || lastError || "不明なエラー"}`,
    );
  } finally {
    ffmpeg.off("progress", onFfmpegProgress);
    await safeDeleteFile(ffmpeg, videoName);
    await safeDeleteFile(ffmpeg, bgmName);
  }

  if (!outName) {
    throw new Error("BGM合成に失敗しました");
  }

  onProgress?.(0.9);

  const data = await ffmpeg.readFile(outName);
  const bytes =
    data instanceof Uint8Array
      ? new Uint8Array(data)
      : new TextEncoder().encode(String(data));

  await safeDeleteFile(ffmpeg, outName);

  if (bytes.byteLength === 0) {
    throw new Error("BGM合成の結果が空です");
  }

  const isMp4 = outName.endsWith(".mp4");
  const mime = isMp4 ? "video/mp4" : "video/webm";
  const baseName = videoFile.name.replace(/\.[^.]+$/, "") || "clip";
  const outFileName = `${baseName}${isMp4 ? ".mp4" : ".webm"}`;
  const blob = new Blob([bytes], { type: mime });

  await validatePlayableVideo(blob);
  onProgress?.(1);

  return new File([blob], outFileName, { type: mime });
}
