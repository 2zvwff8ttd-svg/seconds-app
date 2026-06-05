"use client";

import { BottomNav, DEFAULT_BOTTOM_NAV_INSET } from "@/components/home/BottomNav";
import { SearchScreen } from "@/components/search/SearchScreen";
import { useState } from "react";

export default function SearchPage() {
  const [bottomInset, setBottomInset] = useState(DEFAULT_BOTTOM_NAV_INSET);

  return (
    <div className="flex h-[100dvh] flex-col bg-black">
      <header className="z-header relative shrink-0 px-4 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
          検索
        </h1>
        <p className="text-[10px] text-muted sm:text-xs">
          ユーザー・動画を探す
        </p>
      </header>

      <div className="min-h-0 flex-1" style={{ paddingBottom: bottomInset }}>
        <SearchScreen />
      </div>
      <BottomNav onInsetChange={setBottomInset} />
    </div>
  );
}
