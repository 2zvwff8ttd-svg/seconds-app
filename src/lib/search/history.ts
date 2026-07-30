/**
 * Recent opened search results (device-local).
 * Key: seconds_search_history — max 10 entries, newest first.
 * Stores tapped users / videos (not raw query strings).
 */

export const SEARCH_HISTORY_KEY = "seconds_search_history";
export const SEARCH_HISTORY_MAX = 10;

export type SearchHistoryUser = {
  kind: "user";
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  at: number;
};

export type SearchHistoryVideo = {
  kind: "video";
  videoId: string;
  title: string;
  thumbnailUrl?: string;
  creatorName: string;
  creatorDisplayName: string | null;
  at: number;
};

export type SearchHistoryEntry = SearchHistoryUser | SearchHistoryVideo;

function entryKey(entry: SearchHistoryEntry): string {
  return entry.kind === "user"
    ? `user:${entry.userId}`
    : `video:${entry.videoId}`;
}

function parseEntry(raw: unknown): SearchHistoryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const at =
    typeof row.at === "number" && Number.isFinite(row.at) ? row.at : Date.now();

  if (row.kind === "user") {
    const userId = typeof row.userId === "string" ? row.userId : "";
    const username = typeof row.username === "string" ? row.username : "";
    if (!userId || !username) return null;
    return {
      kind: "user",
      userId,
      username,
      displayName:
        typeof row.displayName === "string" || row.displayName === null
          ? (row.displayName as string | null)
          : null,
      avatarUrl:
        typeof row.avatarUrl === "string" || row.avatarUrl === null
          ? (row.avatarUrl as string | null)
          : null,
      at,
    };
  }

  if (row.kind === "video") {
    const videoId = typeof row.videoId === "string" ? row.videoId : "";
    const title = typeof row.title === "string" ? row.title : "";
    if (!videoId) return null;
    return {
      kind: "video",
      videoId,
      title: title || "無題のvlog",
      thumbnailUrl:
        typeof row.thumbnailUrl === "string" ? row.thumbnailUrl : undefined,
      creatorName:
        typeof row.creatorName === "string" ? row.creatorName : "unknown",
      creatorDisplayName:
        typeof row.creatorDisplayName === "string" ||
        row.creatorDisplayName === null
          ? (row.creatorDisplayName as string | null)
          : null,
      at,
    };
  }

  // Legacy query-string entries are dropped.
  return null;
}

function readRaw(): SearchHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: SearchHistoryEntry[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      const entry = parseEntry(item);
      if (!entry) continue;
      const key = entryKey(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
    return out.slice(0, SEARCH_HISTORY_MAX);
  } catch {
    return [];
  }
}

function writeRaw(entries: SearchHistoryEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      SEARCH_HISTORY_KEY,
      JSON.stringify(entries.slice(0, SEARCH_HISTORY_MAX)),
    );
  } catch {
    // Quota / private mode — ignore
  }
}

export function getSearchHistory(): SearchHistoryEntry[] {
  return readRaw();
}

/** Upsert by kind+id; move to front. Caps at SEARCH_HISTORY_MAX. */
export function addSearchHistoryEntry(
  entry: Omit<SearchHistoryUser, "at"> | Omit<SearchHistoryVideo, "at">,
): SearchHistoryEntry[] {
  const full = { ...entry, at: Date.now() } as SearchHistoryEntry;
  const key = entryKey(full);
  const next = readRaw().filter((e) => entryKey(e) !== key);
  next.unshift(full);
  const capped = next.slice(0, SEARCH_HISTORY_MAX);
  writeRaw(capped);
  return capped;
}

export function removeSearchHistoryEntry(
  entry: Pick<SearchHistoryUser, "kind" | "userId"> | Pick<SearchHistoryVideo, "kind" | "videoId">,
): SearchHistoryEntry[] {
  const key =
    entry.kind === "user" ? `user:${entry.userId}` : `video:${entry.videoId}`;
  const next = readRaw().filter((e) => entryKey(e) !== key);
  writeRaw(next);
  return next;
}

export function hrefForHistoryEntry(entry: SearchHistoryEntry): string {
  const path =
    entry.kind === "user"
      ? `/profile/${entry.userId}`
      : `/video/${entry.videoId}`;
  return `${path}?from=search`;
}
