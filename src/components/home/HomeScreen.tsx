"use client";

import { CrownCelebrationModal } from "@/components/crown/CrownCelebrationModal";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useBottomNavInset } from "@/components/layout/BottomNavInset";
import {
  fetchPendingCrownCelebration,
  type PendingCrownCelebration,
} from "@/lib/crown/celebration";
import {
  readCrownCelebrationCache,
  readHomeShellCache,
  writeCrownCelebrationCache,
  writeHomeShellCache,
} from "@/lib/home/feed-cache";
import { scheduleHomeNavPrefetches } from "@/lib/navigation/prefetch-routes";
import { fetchTodayAssignedSeconds } from "@/lib/recording/daily-assignment";
import { BubbleField } from "./BubbleField";
import { HomeStarfieldBackground } from "./HomeStarfieldBackground";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export function HomeScreen() {
  const router = useRouter();
  const prefetchCleanupRef = useRef<(() => void) | null>(null);
  const bottomInset = useBottomNavInset();
  const [countryCode, setCountryCode] = useState("JP");
  const [assignedSeconds, setAssignedSeconds] = useState<number | null>(() => {
    return readHomeShellCache()?.assignedSeconds ?? null;
  });
  const [immersive, setImmersive] = useState(false);
  const [backgroundHidden, setBackgroundHidden] = useState(false);
  const [crownCelebration, setCrownCelebration] =
    useState<PendingCrownCelebration | null>(() => {
      const cached = readCrownCelebrationCache<PendingCrownCelebration>();
      return cached ? cached.pending : null;
    });

  // Free the starfield only when the main thread is idle after the fullscreen
  // enter settles, so its teardown never competes with the first video frame
  // (keeps the iPhone 13 OOM win: still unmounted during steady playback).
  // Restore instantly on close.
  useEffect(() => {
    if (!immersive) {
      setBackgroundHidden(false);
      return;
    }
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let idleId: number | undefined;
    const timer = window.setTimeout(() => {
      if (typeof win.requestIdleCallback === "function") {
        idleId = win.requestIdleCallback(() => setBackgroundHidden(true), {
          timeout: 1500,
        });
      } else {
        setBackgroundHidden(true);
      }
    }, 1200);
    return () => {
      window.clearTimeout(timer);
      if (idleId !== undefined && typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(idleId);
      }
    };
  }, [immersive]);

  useEffect(() => {
    const cached = readHomeShellCache();
    if (cached) {
      setAssignedSeconds(cached.assignedSeconds);
      return;
    }
    let cancelled = false;
    fetchTodayAssignedSeconds()
      .then((seconds) => {
        if (cancelled) return;
        setAssignedSeconds(seconds);
        writeHomeShellCache(seconds);
      })
      .catch(() => {
        if (!cancelled) setAssignedSeconds(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cached = readCrownCelebrationCache<PendingCrownCelebration>();
    if (cached) {
      if (cached.pending) setCrownCelebration(cached.pending);
      return;
    }

    let cancelled = false;
    fetchPendingCrownCelebration()
      .then((pending) => {
        if (cancelled) return;
        writeCrownCelebrationCache(pending);
        if (pending) setCrownCelebration(pending);
      })
      .catch(() => {
        /* ignore — RPC may not exist until SQL is applied */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFeedReady = useCallback(() => {
    prefetchCleanupRef.current?.();
    prefetchCleanupRef.current = scheduleHomeNavPrefetches(router);
  }, [router]);

  useEffect(() => {
    return () => {
      prefetchCleanupRef.current?.();
    };
  }, []);

  return (
    <div className="app-page relative flex flex-col overflow-hidden bg-[#020208]">
      {!backgroundHidden && <HomeStarfieldBackground />}
      <header className="z-header relative flex shrink-0 items-center justify-between gap-2 px-4 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 sm:pb-2 sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">
            ?Seconds
          </h1>
          {assignedSeconds !== null ? (
            <p className="truncate text-[10px] text-violet-200/90 sm:text-xs">
              今日の撮影時間は{assignedSeconds}秒です
            </p>
          ) : (
            <p className="truncate text-[10px] text-muted sm:text-xs">Yesterday&apos;s moments</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <span className="hidden rounded-full border border-border bg-surface-elevated px-2.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted sm:inline sm:px-3 sm:py-1 sm:text-[10px]">
            {countryCode} #1
          </span>
          <NotificationBell />
        </div>
      </header>

      <BubbleField
        bottomInset={bottomInset}
        onCountryChange={setCountryCode}
        onFeedReady={handleFeedReady}
        onFullscreenChange={setImmersive}
      />

      {crownCelebration && !immersive ? (
        <CrownCelebrationModal
          celebration={crownCelebration}
          onDismissed={() => {
            setCrownCelebration(null);
            writeCrownCelebrationCache(null);
          }}
        />
      ) : null}
    </div>
  );
}
