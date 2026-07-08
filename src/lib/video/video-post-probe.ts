import { getFfmpeg, safeDeleteFile, writeFileFromBlob } from "@/lib/video/ffmpeg-client";
import { IOS_MAX_VIDEO_WIDTH } from "@/lib/video/ios-mp4-encode";
import { getVideoExtension } from "@/lib/video/media";

export type PostEncodePath = "remux_copy" | "reencode_veryfast" | "reencode_ultrafast";

export type ClipProbeResult = {
  safeForRemux: boolean;
  encodePath: PostEncodePath;
  reasons: string[];
  container: "mp4" | "webm" | "unknown";
  videoCodec?: string;
  width?: number;
  height?: number;
  pixelFormat?: string;
  videoProfile?: string;
  hasAudio: boolean;
  audioCodec?: string;
};

const SAFE_H264_PROFILES = new Set([
  "baseline",
  "constrained baseline",
  "main",
]);

const SAFE_PIXEL_FORMATS = new Set(["yuv420p", "yuvj420p"]);

function normalizeCodecName(raw: string): string {
  return raw.trim().toLowerCase();
}

function isHevcCodec(codec: string): boolean {
  const c = normalizeCodecName(codec);
  return c === "hevc" || c === "h265" || c.includes("hevc");
}

function isH264Codec(codec: string): boolean {
  const c = normalizeCodecName(codec);
  return c === "h264" || c === "avc1" || c.includes("h264");
}

function isDangerousVideoCodec(codec: string): boolean {
  const c = normalizeCodecName(codec);
  return (
    isHevcCodec(c) ||
    c === "vp9" ||
    c === "vp8" ||
    c === "av1" ||
    c.includes("vp9") ||
    c.includes("vp8")
  );
}

function detectContainer(file: File): "mp4" | "webm" | "unknown" {
  const ext = getVideoExtension(file);
  if (ext === "webm") return "webm";
  if (ext === "mp4" || ext === "mov") return "mp4";
  const mime = file.type.split(";")[0].trim().toLowerCase();
  if (mime === "video/webm") return "webm";
  if (mime === "video/mp4" || mime === "video/quicktime") return "mp4";
  return "unknown";
}

function parseFfmpegProbeLogs(logs: string[]): {
  videoCodec?: string;
  width?: number;
  height?: number;
  pixelFormat?: string;
  videoProfile?: string;
  hasAudio: boolean;
  audioCodec?: string;
} {
  const joined = logs.join("\n");
  let videoCodec: string | undefined;
  let width: number | undefined;
  let height: number | undefined;
  let pixelFormat: string | undefined;
  let videoProfile: string | undefined;
  let hasAudio = false;
  let audioCodec: string | undefined;

  const videoMatch = joined.match(
    /Stream #\d+:\d+(?:\([^)]*\))?: Video: ([^,\n]+)(?: \(([^)]+)\))?(?:, ([^,\n]+))?/i,
  );
  if (videoMatch) {
    videoCodec = videoMatch[1]?.trim();
    videoProfile = videoMatch[2]?.trim().toLowerCase();
    const tail = videoMatch[3] ?? videoMatch[2] ?? "";
    const dimMatch = tail.match(/(\d{2,5})x(\d{2,5})/);
    if (dimMatch) {
      width = Number(dimMatch[1]);
      height = Number(dimMatch[2]);
    }
    const pixMatch = joined.match(/Video:[^\n]*?(yuv\w+)/i);
    if (pixMatch) {
      pixelFormat = pixMatch[1]?.toLowerCase();
    }
  }

  const audioMatch = joined.match(
    /Stream #\d+:\d+(?:\([^)]*\))?: Audio: ([^,\n]+)/i,
  );
  if (audioMatch) {
    hasAudio = true;
    audioCodec = audioMatch[1]?.trim();
  }

  if (!pixelFormat) {
    const pixOnly = joined.match(/\b(yuv420p|yuvj420p|yuv422p|yuv444p)\b/i);
    if (pixOnly) pixelFormat = pixOnly[1]?.toLowerCase();
  }

  return {
    videoCodec,
    width,
    height,
    pixelFormat,
    videoProfile,
    hasAudio,
    audioCodec,
  };
}

function assessProbe(
  container: "mp4" | "webm" | "unknown",
  parsed: ReturnType<typeof parseFfmpegProbeLogs>,
): ClipProbeResult {
  const reasons: string[] = [];
  const videoCodec = parsed.videoCodec ?? "unknown";
  const width = parsed.width ?? 0;
  const height = parsed.height ?? 0;
  const pixelFormat = parsed.pixelFormat ?? "unknown";
  const videoProfile = parsed.videoProfile ?? "unknown";
  const audioCodec = parsed.audioCodec ?? "";

  if (container === "webm") reasons.push("webm_container");
  if (container === "unknown") reasons.push("unknown_container");
  if (isHevcCodec(videoCodec)) reasons.push("hevc_codec");
  if (isDangerousVideoCodec(videoCodec) && !isHevcCodec(videoCodec)) {
    reasons.push("non_h264_codec");
  }
  if (!isH264Codec(videoCodec)) reasons.push("not_h264");
  if (width > IOS_MAX_VIDEO_WIDTH || height > 1920) reasons.push("oversized_resolution");
  if (width > 1920) reasons.push("oversized_width");
  if (!SAFE_PIXEL_FORMATS.has(pixelFormat)) reasons.push("unsafe_pixel_format");
  if (
    videoProfile !== "unknown" &&
    !SAFE_H264_PROFILES.has(videoProfile)
  ) {
    reasons.push("unsafe_h264_profile");
  }
  if (parsed.hasAudio && !normalizeCodecName(audioCodec).includes("aac")) {
    reasons.push("non_aac_audio");
  }

  const needsUltrafast =
    reasons.includes("hevc_codec") ||
    reasons.includes("webm_container") ||
    reasons.includes("non_h264_codec") ||
    reasons.includes("oversized_width") ||
    height > 1920 ||
    reasons.includes("unknown_container") ||
    reasons.includes("not_h264");

  const safeForRemux =
    reasons.length === 0 &&
    container === "mp4" &&
    isH264Codec(videoCodec) &&
    SAFE_PIXEL_FORMATS.has(pixelFormat) &&
    width > 0 &&
    width <= IOS_MAX_VIDEO_WIDTH &&
    height > 0 &&
    height <= 1920 &&
    (!parsed.hasAudio || normalizeCodecName(audioCodec).includes("aac"));

  let encodePath: PostEncodePath;
  if (safeForRemux) {
    encodePath = "remux_copy";
  } else if (needsUltrafast) {
    encodePath = "reencode_ultrafast";
  } else {
    encodePath = "reencode_veryfast";
  }

  return {
    safeForRemux,
    encodePath,
    reasons,
    container,
    videoCodec,
    width: width || undefined,
    height: height || undefined,
    pixelFormat,
    videoProfile,
    hasAudio: parsed.hasAudio,
    audioCodec: parsed.audioCodec,
  };
}

async function probeViaFfmpegLogs(file: File): Promise<ClipProbeResult> {
  const container = detectContainer(file);
  if (container === "webm") {
    return assessProbe(container, {
      videoCodec: "vp9",
      hasAudio: true,
      audioCodec: "opus",
    });
  }

  const inputExt = getVideoExtension(file);
  const runId = crypto.randomUUID().slice(0, 8);
  const inputName = `probe_in_${runId}.${inputExt}`;
  const logs: string[] = [];

  const ffmpeg = await getFfmpeg();
  const onLog = ({ message }: { message: string }) => {
    logs.push(message);
  };

  try {
    await writeFileFromBlob(ffmpeg, inputName, file);
    ffmpeg.on("log", onLog);
    await ffmpeg.exec(["-hide_banner", "-i", inputName]);
  } catch {
    /* ffmpeg prints probe info then exits non-zero without an output */
  } finally {
    ffmpeg.off("log", onLog);
    await safeDeleteFile(ffmpeg, inputName);
  }

  const parsed = parseFfmpegProbeLogs(logs);
  if (!parsed.videoCodec) {
    return {
      safeForRemux: false,
      encodePath: "reencode_ultrafast",
      reasons: ["probe_failed"],
      container,
      hasAudio: parsed.hasAudio,
      audioCodec: parsed.audioCodec,
    };
  }

  return assessProbe(container, parsed);
}

/** Probe a clip and decide remux vs re-encode (audit-aligned safety rules). */
export async function probeClipForPostUpload(file: File): Promise<ClipProbeResult> {
  return probeViaFfmpegLogs(file);
}

/** Multi-clip merge uses the slowest/safest preset required by any clip. */
export async function probeClipsForMergeEncode(
  files: File[],
): Promise<{ worstPath: PostEncodePath; probes: ClipProbeResult[] }> {
  const probes = await Promise.all(files.map((file) => probeClipForPostUpload(file)));
  const order: PostEncodePath[] = [
    "remux_copy",
    "reencode_veryfast",
    "reencode_ultrafast",
  ];
  let worstPath: PostEncodePath = "remux_copy";
  for (const probe of probes) {
    if (order.indexOf(probe.encodePath) > order.indexOf(worstPath)) {
      worstPath = probe.encodePath;
    }
  }
  if (files.length > 1 && worstPath === "remux_copy") {
    worstPath = "reencode_veryfast";
  }
  return { worstPath, probes };
}
