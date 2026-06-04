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

/**
 * 動画に BGM をミックス（元の音声がある場合は amix、ない場合は BGM のみ）
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

  const filter = hasAudio
    ? "[1:a]volume=0.35,aloop=loop=-1:size=2e+09[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]"
    : null;

  const args = filter
    ? [
        "-i",
        videoName,
        "-i",
        bgmName,
        "-filter_complex",
        filter,
        "-map",
        "0:v",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        "-c:a",
        "libopus",
        "-shortest",
        outName,
      ]
    : [
        "-i",
        videoName,
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
        "-shortest",
        outName,
      ];

  ffmpeg.on("progress", ({ progress }) => {
    if (typeof progress === "number") {
      onProgress?.(0.2 + Math.min(0.75, progress));
    }
  });

  await ffmpeg.exec(args);
  onProgress?.(0.9);

  const data = await ffmpeg.readFile(outName);
  const bytes =
    data instanceof Uint8Array
      ? new Uint8Array(data)
      : new TextEncoder().encode(String(data));

  await ffmpeg.deleteFile(videoName);
  await ffmpeg.deleteFile(bgmName);
  await ffmpeg.deleteFile(outName);

  const mime = videoFile.type || "video/webm";
  const blob = new Blob([bytes.buffer], { type: mime });
  onProgress?.(1);

  return new File([blob], videoFile.name, { type: mime });
}

function bgmFileName(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes("wav")) return "bgm.wav";
  if (type.includes("ogg")) return "bgm.ogg";
  if (type.includes("m4a") || type.includes("mp4")) return "bgm.m4a";
  if (type.includes("aac")) return "bgm.aac";
  return "bgm.mp3";
}

async function videoHasAudioTrack(file: File): Promise<boolean> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject();
    });
    const extended = video as HTMLVideoElement & {
      mozHasAudio?: boolean;
      webkitAudioDecodedByteCount?: number;
    };
    if (typeof extended.mozHasAudio === "boolean") return extended.mozHasAudio;
    if (extended.webkitAudioDecodedByteCount !== undefined) {
      return extended.webkitAudioDecodedByteCount > 0;
    }
    return true;
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}
