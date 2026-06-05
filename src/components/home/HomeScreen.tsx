"use client";

import { SignOutButton } from "@/components/auth/SignOutButton";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { BubbleField } from "./BubbleField";
import { BottomNav, DEFAULT_BOTTOM_NAV_INSET } from "./BottomNav";
import { HomeStarfieldBackground } from "./HomeStarfieldBackground";
import { useState } from "react";

export function HomeScreen() {
  const [countryCode, setCountryCode] = useState("JP");
  const [bottomInset, setBottomInset] = useState(DEFAULT_BOTTOM_NAV_INSET);

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#04060f]">
      <HomeStarfieldBackground />
      <header className="z-header relative flex shrink-0 items-center justify-between px-4 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 sm:pb-2 sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
            ?Seconds
          </h1>
          <p className="text-[10px] text-muted sm:text-xs">Yesterday&apos;s moments</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-surface-elevated px-2.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted sm:px-3 sm:py-1 sm:text-[10px]">
            {countryCode} #1
          </span>
          <NotificationBell />
          <SignOutButton />
        </div>
      </header>

      <BubbleField bottomInset={bottomInset} onCountryChange={setCountryCode} />
      <BottomNav onInsetChange={setBottomInset} />
    </div>
  );
}
