/** 録画の希望解像度（横長 720p）。環境によっては近似値になる */
export const RECORDING_TARGET_WIDTH = 1280;
export const RECORDING_TARGET_HEIGHT = 720;

/** 2〜2.5 Mbps の中央値 */
export const RECORDING_VIDEO_BITS_PER_SECOND = 2_250_000;
export const RECORDING_AUDIO_BITS_PER_SECOND = 128_000;

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

/** ビットレート・MIME の組み合わせを順に試し、必ず録画可能な MediaRecorder を返す */
export function createMediaRecorder(
  stream: MediaStream,
  preferredMimeType: string,
): MediaRecorder {
  const mimeCandidates = [
    preferredMimeType,
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];

  const uniqueMimes = [...new Set(mimeCandidates)];

  for (const mimeType of uniqueMimes) {
    if (!MediaRecorder.isTypeSupported(mimeType)) continue;

    const optionSets: MediaRecorderOptions[] = [
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

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };

    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("録画動画の読み込みがタイムアウトしました"));
    }, 8000);

    video.onloadeddata = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      resolve();
    };

    video.onerror = () => {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(new Error("録画した動画を再生できません"));
    };

    video.src = url;
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
  const candidates = [
    "video/webm",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/mp4",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "video/webm";
}

export function mimeToExtension(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  return "webm";
}

export function facingModeLabel(mode: "user" | "environment"): string {
  return mode === "user" ? "インカメラ" : "アウトカメラ";
}
