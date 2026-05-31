"use client";

import { BottomNav, DEFAULT_BOTTOM_NAV_INSET } from "@/components/home/BottomNav";
import { ProfileScreen } from "@/components/profile/ProfileScreen";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { useState } from "react";

export default function ProfilePage() {
  const [bottomInset, setBottomInset] = useState(DEFAULT_BOTTOM_NAV_INSET);

  return (
    <div className="flex h-[100dvh] flex-col bg-black">
      <header className="z-header relative flex shrink-0 items-center justify-between px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div>
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">プロフィール</h1>
          <p className="text-[10px] text-muted sm:text-xs">いいね・投稿一覧</p>
        </div>
        <SignOutButton />
      </header>

      <div className="min-h-0 flex-1" style={{ paddingBottom: bottomInset }}>
        <ProfileScreen />
      </div>
      <BottomNav onInsetChange={setBottomInset} />
    </div>
  );
}
