/** 録画の希望解像度（横長 720p）。結合時の -c copy 互換のためセッション内で統一 */
export const RECORDING_TARGET_WIDTH = 1280;
export const RECORDING_TARGET_HEIGHT = 720;

/** 同一セッションのクリップは同じ MIME で録画され、投稿時 concat -c copy と相性が良い */

/** 2〜2.5 Mbps の中央値 */
export const RECORDING_VIDEO_BITS_PER_SECOND = 2_250_000;
export const RECORDING_AUDIO_BITS_PER_SECOND = 128_000;

/** iOS Safari（MediaRecorder / タッチ周りの分岐用） */
export function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isIOS && !/CriOS|FxiOS|EdgiOS/.test(ua);
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
  const iosFirst = [
    "video/mp4",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=h264,aac",
    preferredMimeType,
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];

  const defaultOrder = [
    preferredMimeType,
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
    "video/mp4;codecs=avc1,mp4a.40.2",
  ];

  return [...new Set(isIOSSafari() ? iosFirst : defaultOrder)];
}

/** ビットレート・MIME の組み合わせを順に試し、必ず録画可能な MediaRecorder を返す */
export function createMediaRecorder(
  stream: MediaStream,
  preferredMimeType: string,
): MediaRecorder {
  const uniqueMimes = mimeTypeCandidates(preferredMimeType);

  for (const mimeType of uniqueMimes) {
    if (!MediaRecorder.isTypeSupported(mimeType)) continue;

    const optionSets: MediaRecorderOptions[] = isIOSSafari()
      ? [{ mimeType }, buildMediaRecorderOptions(mimeType)]
      : [
          buildMediaRecorderOptions(mimeType),
          { mimeType, videoBitsPerSecond: RECORDING_VIDEO_BITS_PER_SECOND },
          { mimeType },
        ];

    for (const options of optionSets) {
      try {
        return new MediaRecorder(stream, options);
      } catch {
        // 次の組み合わせを試す
      }
    }
  }

  return new MediaRecorder(stream);
}

/**
 * stop() 後の最終 ondataavailable を待つ。
 * iOS 以外でも onstop が先に来ると chunks が空のまま finish されることがある。
 */
export function waitForRecorderChunks(
  getChunks: () => Blob[],
  options?: { maxMs?: number; intervalMs?: number },
): Promise<void> {
  const maxMs = options?.maxMs ?? (isIOSSafari() ? 450 : 400);
  const intervalMs = options?.intervalMs ?? 40;

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
  const iosCandidates = [
    "video/mp4",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=h264,aac",
  ];
  const defaultCandidates = [
    "video/webm",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/mp4",
  ];

  const candidates = isIOSSafari()
    ? [...iosCandidates, ...defaultCandidates]
    : defaultCandidates;

  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return isIOSSafari() ? "video/mp4" : "video/webm";
}

export function mimeToExtension(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  return "webm";
}

export function facingModeLabel(mode: "user" | "environment"): string {
  return mode === "user" ? "インカメラ" : "アウトカメラ";
}

/** iOS Safari では timeslice 付き start が不安定なため無効化 */
export function getRecorderTimesliceMs(): number | undefined {
  return isIOSSafari() ? undefined : 200;
}
