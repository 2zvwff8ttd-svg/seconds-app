const VIDEO_PATH_PATTERN = /\/clip-\d+\.(webm|mp4|mov|m4v)(\?|$)/i;
const VIDEO_EXT_PATTERN = /\.(webm|mp4|mov|m4v)(\?|$)/i;

/** シャボン玉用: 画像 URL のみ返す（動画パスは除外） */
export function resolveBubbleThumbnailUrl(
  thumbnailUrl?: string,
): string | undefined {
  if (!thumbnailUrl?.trim()) return undefined;

  const url = thumbnailUrl.trim();
  const path = url.split("?")[0] ?? url;

  if (VIDEO_PATH_PATTERN.test(path) || VIDEO_EXT_PATTERN.test(path)) {
    return undefined;
  }

  return url;
}
