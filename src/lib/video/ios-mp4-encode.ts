/**
 * libx264 + AAC MP4 settings tuned for iOS Safari / WKWebView playback.
 * - baseline profile + yuv420p: broad hardware decode support
 * - H.264 level sized for actual frame size (not hardcoded 3.1)
 * - +faststart: moov atom at file start for streaming start
 * - fixed GOP: fewer decode stalls after seek / loop
 */
export const IOS_MAX_VIDEO_WIDTH = 1080;

/** Tall 9:16 after width-capped scale (1080×1920). */
export const IOS_MAX_VIDEO_HEIGHT = 1920;

/** Capture / post target frame rate. */
export const IOS_TARGET_FPS = 30;

/** Downscale tall phone captures (e.g. 3024×4032) for iOS compositor + upload limits. */
export const IOS_MP4_SCALE_FILTER = `scale='min(${IOS_MAX_VIDEO_WIDTH},iw)':-2`;

export type IosMp4EncodePreset = "veryfast" | "ultrafast";

const DEFAULT_POST_ENCODE_PRESET: IosMp4EncodePreset = "veryfast";

/**
 * Minimum H.264 level that legally covers width×height @ fps.
 * Underspecifying (e.g. level 3.1 for 1080×1920@30) makes Safari / VideoToolbox
 * fail while ffmpeg software decode still looks fine.
 *
 * Limits: ITU-T H.264 Table A-1 (MaxFS / MaxMBPS).
 */
export function h264LevelForResolution(
  width: number,
  height: number,
  fps: number = IOS_TARGET_FPS,
): string {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  const rate = Math.max(1, fps);
  const macroblocks = Math.ceil(w / 16) * Math.ceil(h / 16);
  const mbPerSec = macroblocks * rate;

  const levels: ReadonlyArray<{
    name: string;
    maxFs: number;
    maxMbps: number;
  }> = [
    { name: "3.0", maxFs: 1620, maxMbps: 40_500 },
    { name: "3.1", maxFs: 3600, maxMbps: 108_000 },
    { name: "4.0", maxFs: 8192, maxMbps: 245_760 },
    { name: "4.1", maxFs: 8192, maxMbps: 245_760 },
    { name: "4.2", maxFs: 8704, maxMbps: 522_240 },
    { name: "5.0", maxFs: 22_080, maxMbps: 589_824 },
    { name: "5.1", maxFs: 36_864, maxMbps: 983_040 },
    { name: "5.2", maxFs: 36_864, maxMbps: 2_073_600 },
  ];

  for (const level of levels) {
    if (macroblocks <= level.maxFs && mbPerSec <= level.maxMbps) {
      return level.name;
    }
  }
  return "5.2";
}

/** Level for our max post output (1080×1920@30 → 4.0). */
export const IOS_DEFAULT_H264_LEVEL = h264LevelForResolution(
  IOS_MAX_VIDEO_WIDTH,
  IOS_MAX_VIDEO_HEIGHT,
  IOS_TARGET_FPS,
);

export function iosMp4VideoEncodeArgs(options?: {
  preset?: IosMp4EncodePreset;
  /** Override; default covers 1080×1920@30. */
  level?: string;
  width?: number;
  height?: number;
  fps?: number;
}): string[] {
  const preset = options?.preset ?? DEFAULT_POST_ENCODE_PRESET;
  const level =
    options?.level ??
    (options?.width != null && options?.height != null
      ? h264LevelForResolution(
          options.width,
          options.height,
          options.fps ?? IOS_TARGET_FPS,
        )
      : IOS_DEFAULT_H264_LEVEL);

  return [
    "-c:v",
    "libx264",
    "-profile:v",
    "baseline",
    "-level",
    level,
    "-preset",
    preset,
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
}

export const IOS_MP4_AUDIO_ENCODE_ARGS = [
  "-c:a",
  "aac",
  "-b:a",
  "128k",
  "-ac",
  "2",
] as const;

export const IOS_MP4_MUX_ARGS = ["-movflags", "+faststart"] as const;

/** Scale + libx264 (use before iosMp4VideoEncodeArgs / iosMp4OutputEncodeArgs). */
export function iosMp4ScaleFilterArgs(): string[] {
  return ["-vf", IOS_MP4_SCALE_FILTER];
}

/** Full video+audio re-encode with faststart (concat / full remux). */
export function iosMp4OutputEncodeArgs(options?: {
  preset?: IosMp4EncodePreset;
  level?: string;
  width?: number;
  height?: number;
  fps?: number;
}): string[] {
  return [
    ...iosMp4VideoEncodeArgs(options),
    ...IOS_MP4_AUDIO_ENCODE_ARGS,
    ...IOS_MP4_MUX_ARGS,
  ];
}

/** @deprecated Use iosMp4VideoEncodeArgs — kept for callers expecting const spread */
export const IOS_MP4_VIDEO_ENCODE_ARGS = iosMp4VideoEncodeArgs();
