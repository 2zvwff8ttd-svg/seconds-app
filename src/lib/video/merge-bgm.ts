import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFfmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  if (!loadPromise) {
    loadPromise = (async () => {
      const ffmpeg = new FFmpeg();
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
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

/** 録画クリップに音声トラックがあるか（不明時は false） */
async function videoHasAudioTrack(file: File): Promise<boolean> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("metadata"));
    });

    const withTracks = video as HTMLVideoElement & {
      audioTracks?: { length: number };
      mozHasAudio?: boolean;
      webkitAudioDecodedByteCount?: number;
    };

    if (withTracks.audioTracks && withTracks.audioTracks.length > 0) {
      return true;
    }
    if (typeof withTracks.mozHasAudio === "boolean") {
      return withTracks.mozHasAudio;
    }

    await new Promise((r) => setTimeout(r, 150));
    if (withTracks.webkitAudioDecodedByteCount !== undefined) {
      return withTracks.webkitAudioDecodedByteCount > 0;
    }

    return false;
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function execMerge(
  ffmpeg: FFmpeg,
  videoName: string,
  bgmName: string,
  outName: string,
  mode: "mix" | "bgm_only",
): Promise<void> {
  const outputArgs =
    mode === "mix"
      ? [
          "-i",
          videoName,
          "-stream_loop",
          "-1",
          "-i",
          bgmName,
          "-filter_complex",
          "[1:a]volume=0.35[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]",
          "-map",
          "0:v",
          "-map",
          "[aout]",
          "-c:v",
          "copy",
          "-c:a",
          "libopus",
          "-b:a",
          "128k",
          "-shortest",
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
          "0:v",
          "-map",
          "1:a",
          "-c:v",
          "copy",
          "-c:a",
          "libopus",
          "-b:a",
          "128k",
          "-shortest",
          outName,
        ];

  let lastLog = "";
  const onLog = ({ message }: { message: string }) => {
    lastLog = message;
  };
  ffmpeg.on("log", onLog);

  try {
    const code = await ffmpeg.exec(outputArgs);
    if (code !== 0) {
      throw new Error(lastLog || `ffmpeg exit ${code}`);
    }
  } finally {
    ffmpeg.off("log", onLog);
  }
}

/**
 * 動画に BGM をミックス（元音声がある場合は amix、ない場合は BGM のみ）
 */
export async function mergeVideoWithBgm(
  videoFile: File,
  bgmBlob: Blob,
  onProgress?: (ratio: number) => void,
): Promise<File> {
  const ffmpeg = await getFfmpeg();
  onProgress?.(0.05);

  const videoExt = videoFile.name.split(".").pop() || "webm";
  const videoName = `input.${videoExt}`;
  const bgmName = bgmFileName(bgmBlob);
  const outName = `output.${videoExt}`;

  await ffmpeg.writeFile(videoName, await fetchFile(videoFile));
  await ffmpeg.writeFile(bgmName, await fetchFile(bgmBlob));
  onProgress?.(0.2);

  const hasAudio = await videoHasAudioTrack(videoFile);

  const onFfmpegProgress = ({ progress }: { progress: number }) => {
    if (typeof progress === "number") {
      onProgress?.(0.2 + Math.min(0.75, progress));
    }
  };
  ffmpeg.on("progress", onFfmpegProgress);

  try {
    if (hasAudio) {
      try {
        await execMerge(ffmpeg, videoName, bgmName, outName, "mix");
      } catch {
        await execMerge(ffmpeg, videoName, bgmName, outName, "bgm_only");
      }
    } else {
      await execMerge(ffmpeg, videoName, bgmName, outName, "bgm_only");
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      detail ? `BGM合成に失敗しました: ${detail}` : "BGM合成に失敗しました",
    );
  } finally {
    ffmpeg.off("progress", onFfmpegProgress);
  }

  onProgress?.(0.9);

  const data = await ffmpeg.readFile(outName);
  const bytes =
    data instanceof Uint8Array
      ? new Uint8Array(data)
      : new TextEncoder().encode(String(data));

  if (bytes.byteLength === 0) {
    throw new Error("BGM合成の結果が空です");
  }

  await ffmpeg.deleteFile(videoName);
  await ffmpeg.deleteFile(bgmName);
  await ffmpeg.deleteFile(outName);

  const mime = videoFile.type || "video/webm";
  const blob = new Blob([bytes], { type: mime });
  onProgress?.(1);

  return new File([blob], videoFile.name, { type: mime });
}
