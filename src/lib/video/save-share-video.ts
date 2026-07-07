import { Media } from "@capacitor-community/media";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { normalizeMediaPublicUrl } from "@/lib/videos/normalize-media-url";
import {
  getOrFetchNativeVideoUri,
  getOrFetchVideoBlob,
  type VideoCacheProgress,
} from "@/lib/video/video-file-cache";

export type SaveShareSuccessMode =
  | "camera_roll"
  | "browser_download"
  | "share_sheet"
  | "web_share"
  | "link_copy";

export type SaveShareResult =
  | { ok: true; mode: SaveShareSuccessMode }
  | { ok: false; message: string };

export type SaveShareProgress = {
  phase: "prepare" | "download" | "save" | "share";
  ratio: number;
  label: string;
};

export type SaveShareOptions = {
  onProgress?: (progress: SaveShareProgress) => void;
};

function sanitizeFileStem(title: string): string {
  const trimmed = title.trim().slice(0, 48) || "seconds-video";
  return trimmed.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
}

function emitProgress(
  onProgress: SaveShareOptions["onProgress"],
  progress: SaveShareProgress,
): void {
  onProgress?.(progress);
}

function mapDownloadProgress(
  onProgress: SaveShareOptions["onProgress"],
): ((progress: VideoCacheProgress) => void) | undefined {
  if (!onProgress) return undefined;
  return (progress) => {
    onProgress({
      phase: "download",
      ratio: progress.ratio,
      label: progress.label,
    });
  };
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
  options: SaveShareOptions = {},
): Promise<SaveShareResult> {
  const normalized = normalizeMediaPublicUrl(videoUrl);
  if (!normalized) {
    return { ok: false, message: "動画 URL が無効です" };
  }

  const { onProgress } = options;

  try {
    emitProgress(onProgress, {
      phase: "prepare",
      ratio: 0,
      label: "保存の準備中...",
    });

    if (Capacitor.isNativePlatform()) {
      const localUri = await getOrFetchNativeVideoUri(
        normalized,
        mapDownloadProgress(onProgress),
      );

      emitProgress(onProgress, {
        phase: "save",
        ratio: 0.9,
        label: "写真に保存しています...",
      });

      await Media.saveVideo({ path: localUri });
      return { ok: true, mode: "camera_roll" };
    }

    const blob = await getOrFetchVideoBlob(
      normalized,
      mapDownloadProgress(onProgress),
    );

    emitProgress(onProgress, {
      phase: "save",
      ratio: 0.9,
      label: "保存しています...",
    });

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

export async function shareVideo(
  videoUrl: string,
  title: string,
  options: SaveShareOptions = {},
): Promise<SaveShareResult> {
  const normalized = normalizeMediaPublicUrl(videoUrl);
  if (!normalized) {
    return { ok: false, message: "動画 URL が無効です" };
  }

  const shareTitle = title.trim() || "Seconds";
  const { onProgress } = options;

  try {
    emitProgress(onProgress, {
      phase: "prepare",
      ratio: 0,
      label: "共有の準備中...",
    });

    if (Capacitor.isNativePlatform()) {
      const localUri = await getOrFetchNativeVideoUri(
        normalized,
        mapDownloadProgress(onProgress),
      );

      emitProgress(onProgress, {
        phase: "share",
        ratio: 0.95,
        label: "共有シートを開いています...",
      });

      await Share.share({
        title: shareTitle,
        files: [localUri],
        dialogTitle: "動画を共有",
      });
      return { ok: true, mode: "share_sheet" };
    }

    if (canUseWebShare()) {
      emitProgress(onProgress, {
        phase: "share",
        ratio: 0.95,
        label: "共有しています...",
      });

      await navigator.share({
        title: shareTitle,
        url: normalized,
      });
      return { ok: true, mode: "web_share" };
    }

    if (navigator.clipboard?.writeText) {
      emitProgress(onProgress, {
        phase: "share",
        ratio: 0.95,
        label: "リンクをコピーしています...",
      });

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
