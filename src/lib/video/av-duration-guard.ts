import { scheduleClientDebugUploadForAvGuard, scheduleClientDebugUploadForClipProbe } from "@/lib/debug/client-debug-logs";
import {
  getFfmpeg,
  safeDeleteFile,
  writeFileFromBlob,
} from "@/lib/video/ffmpeg-client";
import { getVideoExtension } from "@/lib/video/media";

/**
 * Per-clip gate before merge/transcode.
 * Healthy posts sit in tens of ms; kai-class failures were ~3.7s/clip.
 */
export const AV_CLIP_MISMATCH_THRESHOLD_SEC = 0.3;

/** Final gate on the file about to upload. Slightly looser than per-clip. */
export const AV_MERGED_MISMATCH_THRESHOLD_SEC = 0.5;

export type AvDurationProbe = {
  videoDurationSec: number | null;
  audioDurationSec: number | null;
  /** audio − video when both known; null if either stream missing */
  signedDiffSec: number | null;
  absDiffSec: number | null;
};

export type AvMismatchViolation = {
  index: number;
  label: string;
  videoDurationSec: number | null;
  audioDurationSec: number | null;
  absDiffSec: number;
  thresholdSec: number;
};

/** Parse the last `time=HH:MM:SS.xx` (or `time=SS.xx`) from ffmpeg logs. */
export function parseLastFfmpegTimeSec(logs: string[]): number | null {
  let last: number | null = null;
  for (const line of logs) {
    const hms = line.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
    if (hms) {
      const h = Number(hms[1]);
      const m = Number(hms[2]);
      const s = Number(hms[3]);
      if ([h, m, s].every((n) => Number.isFinite(n))) {
        last = h * 3600 + m * 60 + s;
      }
      continue;
    }
    const sec = line.match(/time=\s*(\d+(?:\.\d+)?)/i);
    if (sec) {
      const s = Number(sec[1]);
      if (Number.isFinite(s)) last = s;
    }
  }
  return last;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function diffAvDurations(
  videoDurationSec: number | null,
  audioDurationSec: number | null,
): Pick<AvDurationProbe, "signedDiffSec" | "absDiffSec"> {
  if (
    videoDurationSec == null ||
    audioDurationSec == null ||
    !Number.isFinite(videoDurationSec) ||
    !Number.isFinite(audioDurationSec)
  ) {
    return { signedDiffSec: null, absDiffSec: null };
  }
  const signed = round3(audioDurationSec - videoDurationSec);
  return { signedDiffSec: signed, absDiffSec: round3(Math.abs(signed)) };
}

async function measureStreamDurationSec(
  file: File,
  mode: "video" | "audio",
): Promise<number | null> {
  const inputExt = getVideoExtension(file) || "mp4";
  const runId = crypto.randomUUID().slice(0, 8);
  const inputName = `avdur_${mode}_${runId}.${inputExt}`;
  const ffmpeg = await getFfmpeg();

  const attempts: string[][] =
    mode === "video"
      ? [
          ["-an", "-c", "copy", "-f", "null", "-"],
          ["-an", "-f", "null", "-"],
        ]
      : [
          ["-vn", "-c", "copy", "-f", "null", "-"],
          ["-vn", "-f", "null", "-"],
        ];

  try {
    await writeFileFromBlob(ffmpeg, inputName, file);

    for (const mapArgs of attempts) {
      const logs: string[] = [];
      const onLog = ({ message }: { message: string }) => {
        logs.push(message);
      };
      ffmpeg.on("log", onLog);
      try {
        await ffmpeg.exec(["-hide_banner", "-i", inputName, ...mapArgs]);
      } catch {
        /* null mux often exits non-zero after writing progress */
      } finally {
        ffmpeg.off("log", onLog);
      }
      const measured = parseLastFfmpegTimeSec(logs);
      if (measured != null && measured > 0) {
        return measured;
      }
    }
    return null;
  } finally {
    await safeDeleteFile(ffmpeg, inputName);
  }
}

/** Measure video vs audio track durations via ffmpeg.wasm (copy → null). */
export async function probeAvDurations(file: File): Promise<AvDurationProbe> {
  // Shared ffmpeg.wasm instance is not safe for concurrent exec — run serially.
  const videoDurationSec = await measureStreamDurationSec(file, "video");
  const audioDurationSec = await measureStreamDurationSec(file, "audio");
  const { signedDiffSec, absDiffSec } = diffAvDurations(
    videoDurationSec,
    audioDurationSec,
  );
  return {
    videoDurationSec:
      videoDurationSec != null ? round3(videoDurationSec) : null,
    audioDurationSec:
      audioDurationSec != null ? round3(audioDurationSec) : null,
    signedDiffSec,
    absDiffSec,
  };
}

export function isAvMismatch(
  probe: AvDurationProbe,
  thresholdSec: number,
): boolean {
  return probe.absDiffSec != null && probe.absDiffSec > thresholdSec;
}

export function formatAvMismatchMessage(
  violations: AvMismatchViolation[],
  phase: "clip" | "merged",
): string {
  if (violations.length === 0) {
    return "映像と音声の長さが大きくずれています。撮り直してから投稿してください。";
  }

  if (phase === "merged") {
    const v = violations[0]!;
    const diff = v.absDiffSec.toFixed(1);
    return `結合後の動画で映像と音声の長さが大きくずれています（差 ${diff}秒）。クリップを撮り直してから投稿してください。`;
  }

  if (violations.length === 1) {
    const v = violations[0]!;
    const diff = v.absDiffSec.toFixed(1);
    return `${v.label}の映像と音声の長さが大きくずれています（差 ${diff}秒）。そのクリップを削除して撮り直してから投稿してください。`;
  }

  const labels = violations.map((v) => v.label).join("、");
  return `${labels}の映像と音声の長さが大きくずれています。該当クリップを削除して撮り直してから投稿してください。`;
}

/**
 * Fail the post when any clip's |A−V| exceeds the threshold.
 * Prefer hard-fail over silent drop so the user can re-record knowingly.
 */
export async function assertClipsAvDurationOk(
  files: File[],
  thresholdSec: number = AV_CLIP_MISMATCH_THRESHOLD_SEC,
): Promise<void> {
  const violations: AvMismatchViolation[] = [];

  for (let i = 0; i < files.length; i++) {
    const probe = await probeAvDurations(files[i]!);
    if (!isAvMismatch(probe, thresholdSec) || probe.absDiffSec == null) {
      continue;
    }
    violations.push({
      index: i,
      label: `クリップ${i + 1}`,
      videoDurationSec: probe.videoDurationSec,
      audioDurationSec: probe.audioDurationSec,
      absDiffSec: probe.absDiffSec,
      thresholdSec,
    });
  }

  if (violations.length > 0) {
    const message = formatAvMismatchMessage(violations, "clip");
    scheduleClientDebugUploadForAvGuard({
      phase: "clip",
      message,
      violations: violations.map((v) => ({
        index: v.index,
        label: v.label,
        videoDurationSec: v.videoDurationSec,
        audioDurationSec: v.audioDurationSec,
        absDiffSec: v.absDiffSec,
        thresholdSec: v.thresholdSec,
      })),
    });
    throw new Error(message);
  }
}

export async function assertMergedAvDurationOk(
  file: File,
  thresholdSec: number = AV_MERGED_MISMATCH_THRESHOLD_SEC,
): Promise<AvDurationProbe> {
  const probe = await probeAvDurations(file);
  if (isAvMismatch(probe, thresholdSec) && probe.absDiffSec != null) {
    const violation = {
      index: 0,
      label: "結合結果",
      videoDurationSec: probe.videoDurationSec,
      audioDurationSec: probe.audioDurationSec,
      absDiffSec: probe.absDiffSec,
      thresholdSec,
    };
    const message = formatAvMismatchMessage([violation], "merged");
    scheduleClientDebugUploadForAvGuard({
      phase: "merged",
      message,
      violations: [violation],
    });
    throw new Error(message);
  }
  return probe;
}

export type ClipAvLogMeta = {
  source: "native" | "web" | "web-file";
  /** Wall-clock / budget duration stored on the clip (seconds). */
  wallClockSec: number;
  clipIndex?: number;
  fileBytes?: number;
};

/**
 * Probe A/V durations right after a clip is captured and emit a structured log.
 * Fire-and-forget from recorders — never throw (evidence only).
 */
export async function logRecordedClipAvDurations(
  file: File,
  meta: ClipAvLogMeta,
): Promise<AvDurationProbe | null> {
  try {
    const probe = await probeAvDurations(file);
    const wallMinusVideo =
      probe.videoDurationSec != null
        ? round3(meta.wallClockSec - probe.videoDurationSec)
        : null;
    const payload = {
      ...meta,
      fileName: file.name,
      mimeType: file.type || null,
      fileBytes: meta.fileBytes ?? file.size,
      videoDurationSec: probe.videoDurationSec,
      audioDurationSec: probe.audioDurationSec,
      signedDiffSec: probe.signedDiffSec,
      absDiffSec: probe.absDiffSec,
      wallMinusVideoSec: wallMinusVideo,
      mismatchOverThreshold:
        probe.absDiffSec != null &&
        probe.absDiffSec > AV_CLIP_MISMATCH_THRESHOLD_SEC,
    };
    console.info("[clip-av]", JSON.stringify(payload));
    scheduleClientDebugUploadForClipProbe({
      mismatch: Boolean(payload.mismatchOverThreshold),
      clipIndex: meta.clipIndex ?? null,
      payload,
    });
    return probe;
  } catch (err) {
    console.warn("[clip-av] probe failed", {
      source: meta.source,
      wallClockSec: meta.wallClockSec,
      fileName: file.name,
      error: err instanceof Error ? err.message : String(err),
    });
    scheduleClientDebugUploadForClipProbe({
      mismatch: true,
      clipIndex: meta.clipIndex ?? null,
      payload: {
        ...meta,
        fileName: file.name,
        probeFailed: true,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return null;
  }
}
