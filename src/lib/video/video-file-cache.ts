import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { normalizeMediaPublicUrl } from "@/lib/videos/normalize-media-url";

const CACHE_DIR = "seconds-video-cache";
const MIN_VIDEO_BYTES = 1024;

export type VideoCacheProgress = {
  phase: "download";
  ratio: number;
  label: string;
};

type WebCacheEntry = {
  blob: Blob;
};

const webBlobCache = new Map<string, WebCacheEntry>();
const webInflight = new Map<string, Promise<Blob>>();

function hashUrl(url: string): string {
  let hash = 5381;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 33) ^ url.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function cacheRelativePath(url: string): string {
  return `${CACHE_DIR}/${hashUrl(url)}.mp4`;
}

async function nativeCacheFileReady(path: string): Promise<boolean> {
  try {
    const stat = await Filesystem.stat({
      path,
      directory: Directory.Cache,
    });
    return (stat.size ?? 0) >= MIN_VIDEO_BYTES;
  } catch {
    return false;
  }
}

async function downloadToNativeCache(
  url: string,
  path: string,
  onProgress?: (progress: VideoCacheProgress) => void,
): Promise<void> {
  onProgress?.({
    phase: "download",
    ratio: 0,
    label: "動画を取得中...",
  });

  await Filesystem.downloadFile({
    url,
    path,
    directory: Directory.Cache,
  });

  onProgress?.({
    phase: "download",
    ratio: 1,
    label: "動画を取得中...",
  });
}

async function fetchVideoBlobWithProgress(
  url: string,
  onProgress?: (progress: VideoCacheProgress) => void,
): Promise<Blob> {
  onProgress?.({
    phase: "download",
    ratio: 0,
    label: "動画を取得中...",
  });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`動画の取得に失敗しました (${response.status})`);
  }

  const contentLength = Number(response.headers.get("Content-Length") ?? 0);
  const contentType = response.headers.get("Content-Type") ?? "video/mp4";

  if (!response.body || !Number.isFinite(contentLength) || contentLength <= 0) {
    const blob = await response.blob();
    if (blob.size < MIN_VIDEO_BYTES) {
      throw new Error("動画データが小さすぎます");
    }
    onProgress?.({
      phase: "download",
      ratio: 1,
      label: "動画を取得中...",
    });
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.({
      phase: "download",
      ratio: Math.min(0.99, received / contentLength),
      label: "動画を取得中...",
    });
  }

  const blob = new Blob(chunks as BlobPart[], { type: contentType });
  if (blob.size < MIN_VIDEO_BYTES) {
    throw new Error("動画データが小さすぎます");
  }

  onProgress?.({
    phase: "download",
    ratio: 1,
    label: "動画を取得中...",
  });

  return blob;
}

/**
 * Returns a Capacitor file URI for the cached video (native only).
 * Reuses a stable cache path per URL instead of downloading on every action.
 */
export async function getOrFetchNativeVideoUri(
  url: string,
  onProgress?: (progress: VideoCacheProgress) => void,
): Promise<string> {
  const normalized = normalizeMediaPublicUrl(url);
  if (!normalized) {
    throw new Error("動画 URL が無効です");
  }

  const path = cacheRelativePath(normalized);
  const ready = await nativeCacheFileReady(path);
  if (!ready) {
    await downloadToNativeCache(normalized, path, onProgress);
  }

  const { uri } = await Filesystem.getUri({
    path,
    directory: Directory.Cache,
  });

  if (!uri) {
    throw new Error("動画ファイルのパスを取得できませんでした");
  }

  return uri;
}

/** Web: in-memory blob cache with in-flight request deduplication. */
export async function getOrFetchVideoBlob(
  url: string,
  onProgress?: (progress: VideoCacheProgress) => void,
): Promise<Blob> {
  const normalized = normalizeMediaPublicUrl(url);
  if (!normalized) {
    throw new Error("動画 URL が無効です");
  }

  const cached = webBlobCache.get(normalized);
  if (cached) {
    return cached.blob;
  }

  let inflight = webInflight.get(normalized);
  if (!inflight) {
    inflight = fetchVideoBlobWithProgress(normalized, onProgress)
      .then((blob) => {
        webBlobCache.set(normalized, { blob });
        webInflight.delete(normalized);
        return blob;
      })
      .catch((err) => {
        webInflight.delete(normalized);
        throw err;
      });
    webInflight.set(normalized, inflight);
    return inflight;
  }

  onProgress?.({
    phase: "download",
    ratio: 0,
    label: "動画を取得中...",
  });
  return inflight;
}

/** Warm the save/share cache while fullscreen is open (no UI block). */
export function prefetchVideoForSaveShare(url?: string | null): void {
  const normalized = normalizeMediaPublicUrl(url);
  if (!normalized) return;

  if (Capacitor.isNativePlatform()) {
    void getOrFetchNativeVideoUri(normalized).catch(() => {
      /* background prefetch */
    });
    return;
  }

  void getOrFetchVideoBlob(normalized).catch(() => {
    /* background prefetch */
  });
}

export function isVideoFileCached(url?: string | null): boolean {
  const normalized = normalizeMediaPublicUrl(url);
  if (!normalized) return false;
  return webBlobCache.has(normalized);
}
