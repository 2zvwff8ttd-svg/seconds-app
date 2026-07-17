/** 録画の希望解像度（横長 720p）。結合時の -c copy 互換のためセッション内で統一 */
export const RECORDING_TARGET_WIDTH = 1280;
export const RECORDING_TARGET_HEIGHT = 720;

/** 2〜2.5 Mbps の中央値 */
export const RECORDING_VIDEO_BITS_PER_SECOND = 2_250_000;
export const RECORDING_AUDIO_BITS_PER_SECOND = 128_000;

const IOS_MIME_CANDIDATES = [
  "video/mp4",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4;codecs=h264,aac",
] as const;

const DEFAULT_MIME_CANDIDATES = [
  "video/webm",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/mp4",
  "video/mp4;codecs=avc1,mp4a.40.2",
] as const;

/** iOS 端末（Safari / Chrome 等を含む） */
export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** iOS Safari（WebKit ネイティブ。CriOS 等は除外） */
export function isIOSSafari(): boolean {
  if (!isIOSDevice()) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
}

export function isMediaRecorderAvailable(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined";
}

export function listSupportedRecorderMimeTypes(
  candidates: readonly string[] = isIOSSafari()
    ? IOS_MIME_CANDIDATES
    : DEFAULT_MIME_CANDIDATES,
): string[] {
  if (!isMediaRecorderAvailable()) return [];
  return candidates.filter((mime) => MediaRecorder.isTypeSupported(mime));
}

/** 開発時の MIME 対応状況ログ（iOS Safari 向け） */
export function logRecorderMimeDiagnostics(): void {
  if (typeof console === "undefined" || !isIOSSafari()) return;

  const all = [
    ...IOS_MIME_CANDIDATES,
    "video/webm",
    "video/webm;codecs=vp8,opus",
  ];
  const supported = listSupportedRecorderMimeTypes(all);
  console.info("[recorder] iOS Safari MIME support:", {
    supported,
    preferred: getPreferredMimeType(),
    mediaRecorder: isMediaRecorderAvailable(),
  });
  for (const mime of all) {
    console.info(
      `[recorder] isTypeSupported(${mime}):`,
      isMediaRecorderAvailable() && MediaRecorder.isTypeSupported(mime),
    );
  }
}

export function canUseInAppMediaRecorder(): boolean {
  return isMediaRecorderAvailable() && listSupportedRecorderMimeTypes().length > 0;
}

export function buildCameraVideoConstraints(
  facingMode: "user" | "environment",
): MediaTrackConstraints {
  return {
    facingMode,
    width: { ideal: RECORDING_TARGET_WIDTH },
    height: { ideal: RECORDING_TARGET_HEIGHT },
    frameRate: { ideal: 30 },
  };
}

export function buildMediaRecorderOptions(mimeType: string): MediaRecorderOptions {
  return {
    mimeType,
    videoBitsPerSecond: RECORDING_VIDEO_BITS_PER_SECOND,
    audioBitsPerSecond: RECORDING_AUDIO_BITS_PER_SECOND,
  };
}

function mimeTypeCandidates(preferredMimeType: string): string[] {
  if (isIOSSafari()) {
    return [...new Set([...IOS_MIME_CANDIDATES, preferredMimeType])];
  }

  return [
    ...new Set([preferredMimeType, ...DEFAULT_MIME_CANDIDATES]),
  ];
}

export type CreateMediaRecorderResult = {
  recorder: MediaRecorder;
  mimeType: string;
};

/**
 * ビットレート・MIME の組み合わせを順に試す。
 * iOS Safari は video/mp4 のみ・ビットレート指定なしで作成する。
 */
export function createMediaRecorder(
  stream: MediaStream,
  preferredMimeType: string,
): CreateMediaRecorderResult {
  const uniqueMimes = mimeTypeCandidates(preferredMimeType);
  const ios = isIOSSafari();

  for (const mimeType of uniqueMimes) {
    if (!MediaRecorder.isTypeSupported(mimeType)) continue;

    const optionSets: MediaRecorderOptions[] = ios
      ? [{ mimeType }]
      : [
          buildMediaRecorderOptions(mimeType),
          { mimeType, videoBitsPerSecond: RECORDING_VIDEO_BITS_PER_SECOND },
          { mimeType },
        ];

    for (const options of optionSets) {
      try {
        const recorder = new MediaRecorder(stream, options);
        const resolvedMime = recorder.mimeType || mimeType;
        if (process.env.NODE_ENV !== "production" && ios) {
          console.info("[recorder] created MediaRecorder", {
            requested: mimeType,
            actual: resolvedMime,
            state: recorder.state,
          });
        }
        return { recorder, mimeType: resolvedMime };
      } catch {
        // 次の組み合わせを試す
      }
    }
  }

  if (ios) {
    throw new Error(
      "このブラウザではアプリ内録画形式（MP4）を初期化できませんでした",
    );
  }

  return {
    recorder: new MediaRecorder(stream),
    mimeType: preferredMimeType,
  };
}

/**
 * iOS Safari（MP4/ISOBMFF）は約1秒未満だとセグメントが空になる。
 * timeslice で定期的にチャンクを吐き出させる。
 */
export function getRecorderTimesliceMs(): number | undefined {
  if (isIOSSafari()) return 1000;
  return 200;
}

/** iOS Safari では stop 前の requestData が空チャンクを誘発することがある */
export function shouldRequestDataBeforeStop(): boolean {
  return !isIOSSafari();
}

/** iOS Safari で録画データが生成されるまでの最短時間（ms） */
export function getMinRecordingMs(): number {
  return isIOSSafari() ? 1200 : 300;
}

export function getStopFallbackMs(): number {
  return isIOSSafari() ? 3500 : 600;
}

export function getChunkWaitMs(): number {
  return isIOSSafari() ? 2500 : 400;
}

/** iOS Safari では onstop が最終 ondataavailable より先に来ることがある */
export function waitForRecorderDataSettled(): Promise<void> {
  if (!isIOSSafari()) return Promise.resolve();
  return new Promise((resolve) => {
    window.setTimeout(resolve, 350);
  });
}

/**
 * stop() 後の最終 ondataavailable を待つ。
 */
export function waitForRecorderChunks(
  getChunks: () => Blob[],
  options?: { maxMs?: number; intervalMs?: number },
): Promise<void> {
  const maxMs = options?.maxMs ?? getChunkWaitMs();
  const intervalMs = options?.intervalMs ?? 50;

  return new Promise((resolve) => {
    const startedAt = Date.now();

    const poll = () => {
      const bytes = getChunks().reduce((sum, blob) => sum + blob.size, 0);
      if (bytes > 0) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= maxMs) {
        resolve();
        return;
      }
      window.setTimeout(poll, intervalMs);
    };

    poll();
  });
}

/** 録画 Blob がデコード・再生可能か簡易検証 */
export function verifyRecordedBlobPlayback(blob: Blob): Promise<void> {
  if (blob.size === 0) {
    return Promise.reject(new Error("録画データが空です"));
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("webkit-playsinline", "true");

    let settled = false;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };

    const finishOk = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      resolve();
    };

    const finishErr = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error(message));
    };

    const timeoutMs = isIOSSafari() ? 15000 : 8000;
    const timeoutId = window.setTimeout(() => {
      finishErr("録画動画の読み込みがタイムアウトしました");
    }, timeoutMs);

    video.onloadedmetadata = finishOk;
    video.onloadeddata = finishOk;
    video.onerror = () => {
      finishErr("録画した動画を再生できません");
    };

    video.src = url;
    video.load();
  });
}

export async function openCameraStream(
  facingMode: "user" | "environment",
): Promise<MediaStream> {
  const withQuality: MediaStreamConstraints = {
    video: buildCameraVideoConstraints(facingMode),
    audio: true,
  };

  try {
    return await navigator.mediaDevices.getUserMedia(withQuality);
  } catch {
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode },
      audio: true,
    });
  }
}

export function getPreferredMimeType(): string {
  const supported = listSupportedRecorderMimeTypes();
  if (supported.length > 0) return supported[0]!;
  return isIOSSafari() ? "video/mp4" : "video/webm";
}

export function mimeToExtension(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("quicktime")) return "mov";
  return "webm";
}

export function facingModeLabel(mode: "user" | "environment"): string {
  return mode === "user" ? "インカメラ" : "アウトカメラ";
}

/** ネイティブカメラ撮影（input capture）向けの accept */
export function getNativeCaptureAccept(): string {
  return isIOSDevice() ? "video/*" : "video/*";
}

import { roundClipDurationSeconds } from "@/lib/recording/format-clip-duration";

/** カメラアプリ撮影（input capture）の File から秒数を取得 */
export async function probeCapturedClipDuration(
  file: File,
  budget: number,
): Promise<number> {
  const { getVideoDuration } = await import("@/lib/video/media");

  try {
    const raw = await getVideoDuration(file, { timeoutMs: 15_000 });
    if (raw > 0) {
      return Math.min(budget, roundClipDurationSeconds(raw));
    }
  } catch {
    // iOS カメラ撮影はメタデータ取得に失敗することがある
  }

  if (isIOSDevice()) {
    const iosDuration = await probeIOSVideoDurationFromFile(file);
    if (iosDuration > 0) {
      return Math.min(budget, roundClipDurationSeconds(iosDuration));
    }
  }

  try {
    await verifyRecordedBlobPlayback(file);
  } catch (err) {
    throw err instanceof Error ? err : new Error("動画の読み込みに失敗しました");
  }

  throw new Error(
    "動画の長さを取得できませんでした。別の動画でお試しください",
  );
}

async function probeIOSVideoDurationFromFile(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("webkit-playsinline", "true");
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error("timeout"));
      }, 12_000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timeoutId);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeoutId);
        reject(new Error("load failed"));
      };
    });

    if (Number.isFinite(video.duration) && video.duration > 0) {
      return video.duration;
    }

    video.currentTime = 3600;
    await new Promise<void>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error("seek timeout"));
      }, 8_000);
      video.onseeked = () => {
        window.clearTimeout(timeoutId);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeoutId);
        reject(new Error("seek failed"));
      };
    });

    return Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : 0;
  } catch {
    return 0;
  } finally {
    URL.revokeObjectURL(url);
  }
}
