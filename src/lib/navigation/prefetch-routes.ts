import { prefetchNavData } from "@/lib/prefetch/prefetch-nav-data";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/** Tab routes prefetched from home idle (excludes heavy /post). */
export const PREFETCH_NAV_ROUTES = [
  "/messages",
  "/search",
  "/profile",
] as const;

const IDLE_DELAY_MS = 1_500;
const IDLE_TIMEOUT_MS = 5_000;

let homePrefetchScheduled = false;

function runWhenIdle(task: () => void): void {
  if (typeof window === "undefined") return;

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS });
  } else {
    setTimeout(task, 0);
  }
}

/**
 * After home feed is ready: prefetch tab routes + DM/profile data during idle.
 * Runs at most once per full page load.
 */
export function scheduleHomeNavPrefetches(router: AppRouterInstance): () => void {
  if (typeof window === "undefined" || homePrefetchScheduled) {
    return () => {};
  }

  homePrefetchScheduled = true;
  let cancelled = false;

  const timerId = window.setTimeout(() => {
    if (cancelled) return;

    runWhenIdle(() => {
      if (cancelled) return;

      for (const href of PREFETCH_NAV_ROUTES) {
        router.prefetch(href);
      }

      void prefetchNavData();
    });
  }, IDLE_DELAY_MS);

  return () => {
    cancelled = true;
    window.clearTimeout(timerId);
  };
}
