const VIDEO_PATH_PATTERN = /\/clip-\d+\.(webm|mp4|mov|m4v)(\?|$)/i;
const VIDEO_EXT_PATTERN = /\.(webm|mp4|mov|m4v)(\?|$)/i;

export function isVideoMediaUrl(url?: string): boolean {
  if (!url?.trim()) return false;
  const path = url.trim().split("?")[0] ?? url;
  return VIDEO_PATH_PATTERN.test(path) || VIDEO_EXT_PATTERN.test(path);
}

/** シャボン玉用: 画像 URL のみ返す（動画パスは除外） */
export function resolveBubbleThumbnailUrl(
  thumbnailUrl?: string,
): string | undefined {
  if (!thumbnailUrl?.trim()) return undefined;
  if (isVideoMediaUrl(thumbnailUrl)) return undefined;
  return thumbnailUrl.trim();
}

function storageDirFromMediaUrl(url: string): string | undefined {
  const path = url.split("?")[0] ?? url;
  const slash = path.lastIndexOf("/");
  if (slash < 0) return undefined;
  return path.slice(0, slash);
}

/** 動画 URL や誤った thumbnail_url から、同ディレクトリのサムネ候補を導出 */
export function deriveStorageThumbnailUrls(mediaUrl?: string): string[] {
  if (!mediaUrl?.trim()) return [];
  const trimmed = mediaUrl.trim();
  const dir = storageDirFromMediaUrl(trimmed);
  if (!dir) return [];

  const query = trimmed.includes("?") ? trimmed.slice(trimmed.indexOf("?")) : "";
  return [`${dir}/thumb.jpg${query}`, `${dir}/clip-0-thumb.jpg${query}`];
}

export type BubbleThumbnailInput = {
  thumbnailUrl?: string;
  clipThumbnailUrls?: string[];
  videoUrl?: string;
};

function uniqueImageUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    const resolved = resolveBubbleThumbnailUrl(url);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    result.push(resolved);
  }
  return result;
}

/** ホーム泡表示用: クリップ配列 → 単一サムネ → ストレージ導出の順で解決 */
export function resolveBubbleDisplayUrls(
  input: BubbleThumbnailInput,
): string[] {
  const fromClips = uniqueImageUrls(input.clipThumbnailUrls ?? []);
  if (fromClips.length > 0) return fromClips;

  const primary = resolveBubbleThumbnailUrl(input.thumbnailUrl);
  if (primary) return [primary];

  const fallbackSources = [
    input.thumbnailUrl,
    input.videoUrl,
    ...(input.clipThumbnailUrls ?? []),
  ].filter((url): url is string => Boolean(url?.trim()));

  for (const source of fallbackSources) {
    for (const candidate of deriveStorageThumbnailUrls(source)) {
      const resolved = resolveBubbleThumbnailUrl(candidate);
      if (resolved) return [resolved];
    }
  }

  return [];
}
