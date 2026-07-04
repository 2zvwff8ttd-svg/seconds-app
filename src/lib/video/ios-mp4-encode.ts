/**
 * libx264 + AAC MP4 settings tuned for iOS Safari / WKWebView playback.
 * - baseline profile + yuv420p: broad hardware decode support
 * - +faststart: moov atom at file start for streaming start
 * - fixed GOP: fewer decode stalls after seek / loop
 */
export const IOS_MP4_VIDEO_ENCODE_ARGS = [
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
] as const;

export const IOS_MP4_AUDIO_ENCODE_ARGS = [
  "-c:a",
  "aac",
  "-b:a",
  "128k",
  "-ac",
  "2",
] as const;

export const IOS_MP4_MUX_ARGS = ["-movflags", "+faststart"] as const;

/** Video-only libx264 args (mux paths that encode audio separately). */
export function iosMp4VideoEncodeArgs(): string[] {
  return [...IOS_MP4_VIDEO_ENCODE_ARGS];
}

/** Full video+audio re-encode with faststart (concat / full remux). */
export function iosMp4OutputEncodeArgs(): string[] {
  return [
    ...IOS_MP4_VIDEO_ENCODE_ARGS,
    ...IOS_MP4_AUDIO_ENCODE_ARGS,
    ...IOS_MP4_MUX_ARGS,
  ];
}
