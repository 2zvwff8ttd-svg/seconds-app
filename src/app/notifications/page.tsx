"use client";

import { useBottomNavInset } from "@/components/layout/BottomNavInset";
import { NotificationList } from "@/components/notifications/NotificationList";
import Link from "next/link";

export default function NotificationsPage() {
  const bottomInset = useBottomNavInset();

  return (
    <div className="flex h-[100dvh] flex-col bg-black">
      <header className="z-header relative flex shrink-0 items-center gap-3 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          href="/"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted transition hover:text-foreground"
          aria-label="ホームに戻る"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">通知</h1>
          <p className="text-[10px] text-muted sm:text-xs">いいね・コメント・フォロー</p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col" style={{ paddingBottom: bottomInset }}>
        <NotificationList />
      </div>
    </div>
  );
}
