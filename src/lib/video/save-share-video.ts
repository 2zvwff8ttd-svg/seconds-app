import { Media } from "@capacitor-community/media";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { normalizeMediaPublicUrl } from "@/lib/videos/normalize-media-url";

export type SaveShareSuccessMode =
  | "camera_roll"
  | "browser_download"
  | "share_sheet"
  | "web_share"
  | "link_copy";

export type SaveShareResult =
  | { ok: true; mode: SaveShareSuccessMode }
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

async function downloadVideoToNativeCache(
  url: string,
  fileName: string,
): Promise<string> {
  await Filesystem.downloadFile({
    url,
    path: fileName,
    directory: Directory.Cache,
  });

  const { uri } = await Filesystem.getUri({
    path: fileName,
    directory: Directory.Cache,
  });

  if (!uri) {
    throw new Error("動画ファイルのパスを取得できませんでした");
  }

  return uri;
}

export function canUseNativeSaveShare(): boolean {
  return Capacitor.isNativePlatform();
}

export function canUseWebShare(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * Saves to the device photo library on Capacitor (Media.saveVideo → camera roll).
 * Web browsers cannot write to the camera roll; they fall back to a file download.
 */
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
      const fileName = `${sanitizeFileStem(title)}-${Date.now()}.mp4`;
      const localUri = await downloadVideoToNativeCache(normalized, fileName);
      await Media.saveVideo({ path: localUri });
      return { ok: true, mode: "camera_roll" };
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
    return { ok: true, mode: "browser_download" };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "保存に失敗しました";
    return { ok: false, message: detail };
  }
}

async function resolveNativeShareFileUri(
  videoUrl: string,
  fileStem: string,
): Promise<string> {
  const normalized = normalizeMediaPublicUrl(videoUrl);
  if (!normalized) {
    throw new Error("動画 URL が無効です");
  }
  const fileName = `${fileStem}-${Date.now()}.mp4`;
  return downloadVideoToNativeCache(normalized, fileName);
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
      const localUri = await resolveNativeShareFileUri(
        normalized,
        sanitizeFileStem(shareTitle),
      );
      await Share.share({
        title: shareTitle,
        files: [localUri],
        dialogTitle: "動画を共有",
      });
      return { ok: true, mode: "share_sheet" };
    }

    if (canUseWebShare()) {
      await navigator.share({
        title: shareTitle,
        url: normalized,
      });
      return { ok: true, mode: "web_share" };
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(normalized);
      return { ok: true, mode: "link_copy" };
    }

    return { ok: false, message: "この環境では共有できません" };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return {
        ok: true,
        mode: Capacitor.isNativePlatform() ? "share_sheet" : "web_share",
      };
    }
    const detail = err instanceof Error ? err.message : "共有に失敗しました";
    return { ok: false, message: detail };
  }
}
