"use client";

import { BottomNav, DEFAULT_BOTTOM_NAV_INSET } from "@/components/home/BottomNav";
import { ProfileScreen } from "@/components/profile/ProfileScreen";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

function cameFromSearch(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("from") === "search";
}

export default function UserProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const router = useRouter();
  const [bottomInset, setBottomInset] = useState(DEFAULT_BOTTOM_NAV_INSET);

  const handleBack = () => {
    if (cameFromSearch()) {
      router.push("/search");
      return;
    }
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-black">
      <header className="z-header relative flex shrink-0 items-center gap-3 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted transition hover:text-foreground"
          aria-label="戻る"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <div>
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">プロフィール</h1>
          <p className="text-[10px] text-muted sm:text-xs">ユーザーを表示</p>
        </div>
      </header>

      <div className="min-h-0 flex-1" style={{ paddingBottom: bottomInset }}>
        <ProfileScreen userId={userId} />
      </div>
      <BottomNav onInsetChange={setBottomInset} />
    </div>
  );
}
