import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { getVideoDuration } from "@/lib/video/media";
import {
  attachFfmpegProgress,
  audioBlobVirtualName,
  execFfmpeg,
  ffmpegBytesToFile,
  formatFfmpegSeconds,
  readFfmpegOutputBytes,
  writeFfmpegInput,
} from "@/lib/video/ffmpeg-mux-utils";
import { getFfmpeg, safeDeleteFile } from "@/lib/video/ffmpeg-client";

/** 既存の動画音声を背景に残すときの音量（ナレーションが主役） */
export const NARRATION_VIDEO_AUDIO_VOLUME = 0.2;

export type MergeVideoWithNarrationOptions = {
  /** 動画の長さ（秒）。未指定時はファイルから取得 */
  videoDurationSec?: number;
  videoAudioVolume?: number;
  /** true = 動画に音声トラックなしとして合成 */
  forceNoVideoAudio?: boolean;
  onProgress?: (ratio: number) => void;
};

type VideoMuxStrategy = "copy" | "encode";

function videoInputName(runId: string, videoFile: File): string {
  const ext = videoFile.name.split(".").pop() || "mp4";
  return `vin_${runId}.${ext}`;
}

function buildNarrationFilterComplex(
  durationSec: number,
  hasVideoAudio: boolean,
  videoVolume: number,
): string {
  const d = formatFfmpegSeconds(durationSec);
  const narrChain = `[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${d},asetpts=PTS-STARTPTS[na]`;

  if (hasVideoAudio) {
    return `[0:a]volume=${videoVolume},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${d},asetpts=PTS-STARTPTS[va];${narrChain};[va][na]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[aout]`;
  }

  return `anullsrc=channel_layout=stereo:sample_rate=48000:d=${d}[va];${narrChain};[va][na]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[aout]`;
}

function buildMuxArgs(
  videoName: string,
  narrName: string,
  outName: string,
  filter: string,
  strategy: VideoMuxStrategy,
): string[] {
  const videoCodecArgs =
    strategy === "copy"
      ? ["-c:v", "copy"]
      : [
          "-c:v",
          "libx264",
          "-preset",
          "ultrafast",
          "-crf",
          "28",
          "-pix_fmt",
          "yuv420p",
        ];

  return [
    "-i",
    videoName,
    "-i",
    narrName,
    "-filter_complex",
    filter,
    "-map",
    "0:v:0",
    "-map",
    "[aout]",
    ...videoCodecArgs,
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    outName,
  ];
}

async function tryMuxStrategy(
  ffmpeg: FFmpeg,
  videoName: string,
  narrName: string,
  outName: string,
  durationSec: number,
  hasVideoAudio: boolean,
  videoVolume: number,
  strategy: VideoMuxStrategy,
): Promise<void> {
  await safeDeleteFile(ffmpeg, outName);
  const filter = buildNarrationFilterComplex(
    durationSec,
    hasVideoAudio,
    videoVolume,
  );
  await execFfmpeg(
    ffmpeg,
    buildMuxArgs(videoName, narrName, outName, filter, strategy),
  );
}

async function resolveVideoDurationSec(
  videoFile: File,
  overrideSec?: number,
): Promise<number> {
  if (overrideSec !== undefined && overrideSec > 0) {
    return overrideSec;
  }

  const measured = await getVideoDuration(videoFile, {
    fallbackSeconds: overrideSec ?? 1,
    timeoutMs: 12_000,
  });

  if (measured > 0) return measured;
  if (overrideSec !== undefined && overrideSec > 0) return overrideSec;
  throw new Error("動画の長さを取得できませんでした");
}

/**
 * 動画の既存音声（音量 down）+ ナレーションを 1 本の MP4 に焼き込む（iOS 向け）。
 */
export async function mergeVideoWithNarration(
  videoFile: File,
  narrationBlob: Blob,
  options: MergeVideoWithNarrationOptions = {},
): Promise<File> {
  const ffmpeg = await getFfmpeg();
  const runId = crypto.randomUUID().slice(0, 8);
  const videoName = videoInputName(runId, videoFile);
  const narrName = audioBlobVirtualName(runId, narrationBlob);
  const outName = `narr_out_${runId}.mp4`;

  const videoVolume =
    options.videoAudioVolume ?? NARRATION_VIDEO_AUDIO_VOLUME;

  options.onProgress?.(0.05);

  const durationSec = await resolveVideoDurationSec(
    videoFile,
    options.videoDurationSec,
  );

  await writeFfmpegInput(ffmpeg, videoName, videoFile);
  await writeFfmpegInput(ffmpeg, narrName, narrationBlob);
  options.onProgress?.(0.15);

  const detachProgress = attachFfmpegProgress(
    ffmpeg,
    options.onProgress,
    0.15,
    0.9,
  );

  const attempts: Array<{
    hasVideoAudio: boolean;
    strategy: VideoMuxStrategy;
  }> = options.forceNoVideoAudio
    ? [
        { hasVideoAudio: false, strategy: "copy" },
        { hasVideoAudio: false, strategy: "encode" },
      ]
    : [
        { hasVideoAudio: true, strategy: "copy" },
        { hasVideoAudio: true, strategy: "encode" },
        { hasVideoAudio: false, strategy: "copy" },
        { hasVideoAudio: false, strategy: "encode" },
      ];

  const errors: string[] = [];
  let succeeded = false;

  try {
    for (const attempt of attempts) {
      try {
        await tryMuxStrategy(
          ffmpeg,
          videoName,
          narrName,
          outName,
          durationSec,
          attempt.hasVideoAudio,
          videoVolume,
          attempt.strategy,
        );
        succeeded = true;
        break;
      } catch (err) {
        errors.push(
          `${attempt.hasVideoAudio ? "with_va" : "null_va"}/${attempt.strategy}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  } finally {
    detachProgress();
    await safeDeleteFile(ffmpeg, videoName);
    await safeDeleteFile(ffmpeg, narrName);
    if (!succeeded) {
      await safeDeleteFile(ffmpeg, outName);
    }
  }

  if (!succeeded) {
    throw new Error(
      `ナレーション合成に失敗しました: ${errors.join(" / ") || "不明なエラー"}`,
    );
  }

  options.onProgress?.(0.92);

  const bytes = await readFfmpegOutputBytes(ffmpeg, outName);
  await safeDeleteFile(ffmpeg, outName);

  if (bytes.byteLength < 1024) {
    throw new Error("ナレーション合成の結果が小さすぎます（合成失敗の可能性）");
  }

  const baseName = videoFile.name.replace(/\.[^.]+$/, "") || "clip";
  options.onProgress?.(1);

  return ffmpegBytesToFile(bytes, `${baseName}-narrated.mp4`, "video/mp4");
}
