/**
 * Recent search history (device-local).
 * Key: seconds_search_history — max 10 entries, newest first.
 */

import type { SearchTab } from "@/types/search";

export const SEARCH_HISTORY_KEY = "seconds_search_history";
export const SEARCH_HISTORY_MAX = 10;

export type SearchHistoryEntry = {
  query: string;
  tab: SearchTab;
  at: number;
};

function normalizeQuery(query: string): string {
  return query.trim();
}

function readRaw(): SearchHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: SearchHistoryEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const query =
        typeof row.query === "string" ? normalizeQuery(row.query) : "";
      const tab = row.tab === "videos" || row.tab === "users" ? row.tab : null;
      const at = typeof row.at === "number" && Number.isFinite(row.at) ? row.at : 0;
      if (!query || !tab) continue;
      out.push({ query, tab, at });
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

/** Upsert by query (case-insensitive); move to front. Caps at SEARCH_HISTORY_MAX. */
export function addSearchHistory(
  query: string,
  tab: SearchTab,
): SearchHistoryEntry[] {
  const normalized = normalizeQuery(query);
  if (normalized.length < 2) return readRaw();

  const lower = normalized.toLowerCase();
  const next = readRaw().filter((e) => e.query.toLowerCase() !== lower);
  next.unshift({
    query: normalized,
    tab,
    at: Date.now(),
  });
  const capped = next.slice(0, SEARCH_HISTORY_MAX);
  writeRaw(capped);
  return capped;
}

/** Remove one entry by exact query + tab match (as stored). */
export function removeSearchHistory(
  query: string,
  tab: SearchTab,
): SearchHistoryEntry[] {
  const normalized = normalizeQuery(query);
  const next = readRaw().filter(
    (e) =>
      !(
        e.tab === tab &&
        e.query.toLowerCase() === normalized.toLowerCase()
      ),
  );
  writeRaw(next);
  return next;
}
