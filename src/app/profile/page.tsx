"use client";

import { useBottomNavInset } from "@/components/layout/BottomNavInset";
import { ProfileScreen } from "@/components/profile/ProfileScreen";
import Link from "next/link";

export default function ProfilePage() {
  const bottomInset = useBottomNavInset();

  return (
    <div className="flex h-[100dvh] flex-col bg-black">
      <header className="z-header relative flex shrink-0 items-center justify-between px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div>
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">プロフィール</h1>
          <p className="text-[10px] text-muted sm:text-xs">いいね・投稿一覧</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-muted transition hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-foreground"
            aria-label="設定"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87 1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
            </svg>
          </Link>
        </div>
      </header>

      <div className="min-h-0 flex-1" style={{ paddingBottom: bottomInset }}>
        <ProfileScreen />
      </div>
    </div>
  );
}
