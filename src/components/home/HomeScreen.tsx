"use client";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { scheduleHomeNavPrefetches } from "@/lib/navigation/prefetch-routes";
import { fetchTodayAssignedSeconds } from "@/lib/recording/daily-assignment";
import { BubbleField } from "./BubbleField";
import { BottomNav, DEFAULT_BOTTOM_NAV_INSET } from "./BottomNav";
import { HomeStarfieldBackground } from "./HomeStarfieldBackground";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export function HomeScreen() {
  const router = useRouter();
  const prefetchCleanupRef = useRef<(() => void) | null>(null);
  const [countryCode, setCountryCode] = useState("JP");
  const [bottomInset, setBottomInset] = useState(DEFAULT_BOTTOM_NAV_INSET);
  const [assignedSeconds, setAssignedSeconds] = useState<number | null>(null);
  const [immersive, setImmersive] = useState(false);
  const [backgroundHidden, setBackgroundHidden] = useState(false);

  // Free the starfield only *after* the fullscreen enter settles, so its
  // teardown never competes with the first video frame (kept the iPhone 13
  // OOM win: it's still unmounted during steady playback). Restore instantly.
  useEffect(() => {
    if (!immersive) {
      setBackgroundHidden(false);
      return;
    }
    const timer = window.setTimeout(() => setBackgroundHidden(true), 500);
    return () => window.clearTimeout(timer);
  }, [immersive]);

  useEffect(() => {
    fetchTodayAssignedSeconds()
      .then(setAssignedSeconds)
      .catch(() => setAssignedSeconds(null));
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
          <SignOutButton />
        </div>
      </header>

      <BubbleField
        bottomInset={bottomInset}
        onCountryChange={setCountryCode}
        onFeedReady={handleFeedReady}
        onFullscreenChange={setImmersive}
      />
      <BottomNav onInsetChange={setBottomInset} />
    </div>
  );
}
