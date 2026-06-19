"use client";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { fetchTodayAssignedSeconds } from "@/lib/recording/daily-assignment";
import { BottomNav, DEFAULT_BOTTOM_NAV_INSET } from "./BottomNav";
import { HomeStarfieldBackground } from "./HomeStarfieldBackground";
import { useEffect, useState } from "react";

type HomeScreenDiagProps = {
  stage: number;
};

/**
 * iOS load-failure bisection. Stages:
 * 0 = minimal text only
 * 1 = nav/notify group (NO BubbleField)
 * 2 = BubbleField (see HomeScreenDiagStage2.tsx)
 * 3 = BubbleField, masks forced circle-only (no path()/SVG)
 */
export function HomeScreenDiag({ stage }: HomeScreenDiagProps) {
  const [bottomInset, setBottomInset] = useState(DEFAULT_BOTTOM_NAV_INSET);
  const [assignedSeconds, setAssignedSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (stage < 1) return;
    fetchTodayAssignedSeconds()
      .then(setAssignedSeconds)
      .catch(() => setAssignedSeconds(null));
  }, [stage]);

  if (stage <= 0) {
    return (
      <main
        style={{
          padding: "1.5rem",
          fontFamily: "system-ui, sans-serif",
          color: "#eee",
          background: "#111",
          minHeight: "100dvh",
        }}
      >
        <h1>minimal home OK</h1>
        <p>STAGE 0 — HomeScreen 部品なし</p>
      </main>
    );
  }

  if (stage === 1) {
    return (
      <div className="app-page relative flex flex-col overflow-hidden bg-[#020208]">
        <HomeStarfieldBackground />
        <header className="z-header relative flex shrink-0 items-center justify-between gap-2 px-4 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 sm:pb-2 sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">
              ?Seconds
            </h1>
            <p className="truncate text-[10px] text-violet-300 sm:text-xs">
              STAGE 1: 通知/ナビ系のみ（BubbleField なし）
            </p>
            {assignedSeconds !== null ? (
              <p className="truncate text-[10px] text-violet-200/90 sm:text-xs">
                今日の撮影時間は{assignedSeconds}秒です
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <NotificationBell />
            <SignOutButton />
          </div>
        </header>
        <main
          className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted"
          style={{ paddingBottom: bottomInset }}
        >
          <p>
            この画面が表示されていれば、通知/ナビ系チャンクは読み込めています。
            <br />
            BubbleField はまだ含めていません。
          </p>
        </main>
        <BottomNav onInsetChange={setBottomInset} />
      </div>
    );
  }

  return (
    <main style={{ padding: "1.5rem", color: "#eee", background: "#111" }}>
      <h1>Unknown stage {stage}</h1>
    </main>
  );
}
