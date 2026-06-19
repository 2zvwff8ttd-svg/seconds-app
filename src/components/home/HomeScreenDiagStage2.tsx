"use client";

import { BubbleField } from "./BubbleField";
import { DEFAULT_BOTTOM_NAV_INSET } from "./BottomNav";
import { useState } from "react";

/**
 * STAGE 2 — static BubbleField import (matches production bundle layout).
 * Includes: BubbleField, VideoBubble, FullscreenPlayer, display-mask clip-path.
 */
export function HomeScreenDiagStage2() {
  const [countryCode, setCountryCode] = useState("JP");
  const [bottomInset] = useState(DEFAULT_BOTTOM_NAV_INSET);

  return (
    <div className="app-page relative flex flex-col overflow-hidden bg-[#020208]">
      <header className="z-header relative shrink-0 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5">
        <h1 className="text-lg font-bold text-foreground">?Seconds</h1>
        <p className="text-[10px] text-violet-300">
          STAGE 2: BubbleField 系（本番同等・形マスク有効）
        </p>
        <p className="text-[10px] text-muted">
          VideoBubble / FullscreenPlayer / display-mask 込み。通知/ナビなし。
        </p>
      </header>
      <BubbleField bottomInset={bottomInset} onCountryChange={setCountryCode} />
      <p className="sr-only">country {countryCode}</p>
    </div>
  );
}
