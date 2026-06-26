/** Default TTL for nav prefetch cache (30–60s window). */
export const NAV_CACHE_TTL_MS = 45_000;

export const NAV_CACHE_KEYS = {
  DM_THREADS: "nav:dm-threads",
  OWN_PROFILE: "nav:own-profile",
} as const;

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function readNavCache<T>(
  key: string,
  ttlMs: number = NAV_CACHE_TTL_MS,
): { data: T; stale: boolean } | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  const stale = Date.now() - entry.fetchedAt > ttlMs;
  return { data: entry.data, stale };
}

export function writeNavCache<T>(key: string, data: T): void {
  store.set(key, { data, fetchedAt: Date.now() });
}

export function invalidateNavCache(key: string): void {
  store.delete(key);
  inflight.delete(key);
}

/** Fetch with in-flight dedupe; writes result to cache. */
export async function fetchNavCacheFresh<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = fetcher()
    .then((data) => {
      writeNavCache(key, data);
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}
