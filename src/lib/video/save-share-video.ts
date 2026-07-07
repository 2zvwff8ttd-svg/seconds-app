import { Media } from "@capacitor-community/media";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { normalizeMediaPublicUrl } from "@/lib/videos/normalize-media-url";

export type SaveShareResult =
  | { ok: true }
  | { ok: false; message: string };

function sanitizeFileStem(title: string): string {
  const trimmed = title.trim().slice(0, 48) || "seconds-video";
  return trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
}

async function fetchVideoBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`動画の取得に失敗しました (${response.status})`);
  }
  const blob = await response.blob();
  if (blob.size < 1024) {
    throw new Error("動画データが小さすぎます");
  }
  return blob;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function writeVideoToNativeCache(
  blob: Blob,
  fileName: string,
): Promise<string> {
  const base64 = await blobToBase64(blob);
  const { uri } = await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: Directory.Cache,
  });
  return uri;
}

async function resolveLocalVideoUri(
  videoUrl: string,
  fileStem: string,
): Promise<string> {
  const normalized = normalizeMediaPublicUrl(videoUrl);
  if (!normalized) {
    throw new Error("動画 URL が無効です");
  }

  if (Capacitor.isNativePlatform()) {
    const blob = await fetchVideoBlob(normalized);
    const fileName = `${fileStem}-${Date.now()}.mp4`;
    return writeVideoToNativeCache(blob, fileName);
  }

  return normalized;
}

export function canUseNativeSaveShare(): boolean {
  return Capacitor.isNativePlatform();
}

export function canUseWebShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export async function saveVideoToCameraRoll(
  videoUrl: string,
  title: string,
): Promise<SaveShareResult> {
  const normalized = normalizeMediaPublicUrl(videoUrl);
  if (!normalized) {
    return { ok: false, message: "動画 URL が無効です" };
  }

  try {
    if (Capacitor.isNativePlatform()) {
      const localUri = await resolveLocalVideoUri(
        normalized,
        sanitizeFileStem(title),
      );
      await Media.saveVideo({ path: localUri });
      return { ok: true };
    }

    const blob = await fetchVideoBlob(normalized);
    const objectUrl = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${sanitizeFileStem(title)}.mp4`;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "保存に失敗しました";
    return { ok: false, message: detail };
  }
}

export async function shareVideo(
  videoUrl: string,
  title: string,
): Promise<SaveShareResult> {
  const normalized = normalizeMediaPublicUrl(videoUrl);
  if (!normalized) {
    return { ok: false, message: "動画 URL が無効です" };
  }

  const shareTitle = title.trim() || "Seconds";

  try {
    if (Capacitor.isNativePlatform()) {
      const localUri = await resolveLocalVideoUri(
        normalized,
        sanitizeFileStem(shareTitle),
      );
      await Share.share({
        title: shareTitle,
        files: [localUri],
        dialogTitle: "動画を共有",
      });
      return { ok: true };
    }

    if (canUseWebShare()) {
      await navigator.share({
        title: shareTitle,
        url: normalized,
      });
      return { ok: true };
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(normalized);
      return { ok: true };
    }

    return { ok: false, message: "この環境では共有できません" };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: true };
    }
    const detail = err instanceof Error ? err.message : "共有に失敗しました";
    return { ok: false, message: detail };
  }
}
