import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { getFfmpeg, safeDeleteFile } from "@/lib/video/ffmpeg-client";
import { iosMp4OutputEncodeArgs, iosMp4ScaleFilterArgs } from "@/lib/video/ios-mp4-encode";

function bgmStorageName(runId: string, blob: Blob): string {
  const ext = bgmFileName(blob).split(".").pop() || "mp3";
  return `bgm_${runId}.${ext}`;
}

function bgmFileName(blob: Blob): string {
  const type = blob.type.toLowerCase();
  if (type.includes("wav")) return "bgm.wav";
  if (type.includes("ogg")) return "bgm.ogg";
  if (type.includes("m4a") || type.includes("mp4")) return "bgm.m4a";
  if (type.includes("aac")) return "bgm.aac";
  return "bgm.mp3";
}

type MergeStrategy = "webm_copy" | "mp4_encode";

async function execMerge(
  ffmpeg: FFmpeg,
  videoName: string,
  bgmName: string,
  outName: string,
  strategy: MergeStrategy,
): Promise<void> {
  const outputArgs: string[] =
    strategy === "webm_copy"
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
          "copy",
          "-c:a",
          "libopus",
          "-b:a",
          "128k",
          "-shortest",
          "-f",
          "webm",
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
          ...iosMp4ScaleFilterArgs(),
          ...iosMp4OutputEncodeArgs(),
          "-shortest",
          "-f",
          "mp4",
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
      const tail = logs.filter((l) => l.trim()).slice(-3).join(" ").trim();
      throw new Error(tail || `ffmpeg exit ${code}`);
    }
  } finally {
    ffmpeg.off("log", onLog);
  }
}

/**
 * 動画に BGM を合成（WebM 優先、失敗時 MP4）
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
  const bgmName = bgmStorageName(runId, bgmBlob);
  const outWebm = `out_${runId}.webm`;
  const outMp4 = `out_${runId}.mp4`;

  await ffmpeg.writeFile(videoName, await fetchFile(videoFile));
  await ffmpeg.writeFile(bgmName, await fetchFile(bgmBlob));
  onProgress?.(0.2);

  const onFfmpegProgress = ({ progress }: { progress: number }) => {
    if (typeof progress === "number") {
      onProgress?.(0.2 + Math.min(0.75, progress));
    }
  };
  ffmpeg.on("progress", onFfmpegProgress);

  const strategies: MergeStrategy[] = ["webm_copy", "mp4_encode"];
  let outName: string | null = null;
  const errors: string[] = [];

  try {
    for (const strategy of strategies) {
      const target = strategy === "webm_copy" ? outWebm : outMp4;
      await safeDeleteFile(ffmpeg, target);
      try {
        await execMerge(ffmpeg, videoName, bgmName, target, strategy);
        outName = target;
        break;
      } catch (err) {
        errors.push(
          `${strategy}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`BGM合成に失敗しました: ${detail}`);
  } finally {
    ffmpeg.off("progress", onFfmpegProgress);
    await safeDeleteFile(ffmpeg, videoName);
    await safeDeleteFile(ffmpeg, bgmName);
    if (!outName) {
      await safeDeleteFile(ffmpeg, outWebm);
      await safeDeleteFile(ffmpeg, outMp4);
    }
  }

  if (!outName) {
    throw new Error(
      `BGM合成に失敗しました: ${errors.join(" / ") || "不明なエラー"}`,
    );
  }

  onProgress?.(0.9);

  const data = await ffmpeg.readFile(outName);
  const bytes =
    data instanceof Uint8Array
      ? new Uint8Array(data)
      : new TextEncoder().encode(String(data));

  await safeDeleteFile(ffmpeg, outName);

  if (bytes.byteLength < 1024) {
    throw new Error("BGM合成の結果が小さすぎます（合成失敗の可能性）");
  }

  const isMp4 = outName.endsWith(".mp4");
  const mime = isMp4 ? "video/mp4" : "video/webm";
  const baseName = videoFile.name.replace(/\.[^.]+$/, "") || "clip";
  const outFileName = `${baseName}${isMp4 ? ".mp4" : ".webm"}`;

  onProgress?.(1);
  return new File([bytes], outFileName, { type: mime });
}
