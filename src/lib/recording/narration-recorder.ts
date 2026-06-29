import { isIOSDevice, isMediaRecorderAvailable } from "@/lib/recording/recorder-utils";

const IOS_NARRATION_MIME_CANDIDATES = [
  "audio/mp4",
  "audio/aac",
  "audio/mpeg",
  "audio/webm",
] as const;

const DEFAULT_NARRATION_MIME_CANDIDATES = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/aac",
] as const;

export function getPreferredNarrationMimeType(): string {
  if (!isMediaRecorderAvailable()) return "";

  const candidates = isIOSDevice()
    ? IOS_NARRATION_MIME_CANDIDATES
    : DEFAULT_NARRATION_MIME_CANDIDATES;

  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }

  return "";
}

export function canRecordNarration(): boolean {
  return isMediaRecorderAvailable() && getPreferredNarrationMimeType().length > 0;
}

export async function openNarrationMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("このブラウザではマイク録音に対応していません");
  }

  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
}

export function createNarrationMediaRecorder(
  stream: MediaStream,
  mimeType: string,
): MediaRecorder {
  if (mimeType && MediaRecorder.isTypeSupported(mimeType)) {
    return new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 128_000,
    });
  }

  return new MediaRecorder(stream);
}

export function narrationMimeToExtension(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base.includes("mp4") || base.includes("aac") || base.includes("m4a")) {
    return "m4a";
  }
  if (base.includes("mpeg") || base.includes("mp3")) return "mp3";
  if (base.includes("webm")) return "webm";
  return "m4a";
}

export function buildNarrationFile(blob: Blob, mimeType: string): File {
  const ext = narrationMimeToExtension(mimeType);
  return new File([blob], `narration-${Date.now()}.${ext}`, {
    type: mimeType.split(";")[0]?.trim() || blob.type || "audio/mp4",
  });
}

export async function collectRecorderBlob(
  recorder: MediaRecorder,
): Promise<{ blob: Blob; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const chunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.onerror = () => {
      reject(new Error("ナレーションの録音に失敗しました"));
    };

    recorder.onstop = () => {
      const mimeType = recorder.mimeType || getPreferredNarrationMimeType() || "audio/mp4";
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size < 64) {
        reject(new Error("録音データが空です。もう一度お試しください"));
        return;
      }
      resolve({ blob, mimeType });
    };
  });
}
