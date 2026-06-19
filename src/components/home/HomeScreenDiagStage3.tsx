"use client";

import { BubbleField } from "./BubbleField";
import { DEFAULT_BOTTOM_NAV_INSET } from "./BottomNav";
import { useState } from "react";

/**
 * STAGE 3 — BubbleField with FORCE_CIRCLE_HOME_DISPLAY_MASK (circle clip-path only).
 */
export function HomeScreenDiagStage3() {
  const [countryCode, setCountryCode] = useState("JP");
  const [bottomInset] = useState(DEFAULT_BOTTOM_NAV_INSET);

  return (
    <div className="app-page relative flex flex-col overflow-hidden bg-[#020208]">
      <header className="z-header relative shrink-0 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5">
        <h1 className="text-lg font-bold text-foreground">?Seconds</h1>
        <p className="text-[10px] text-violet-300">
          STAGE 3: BubbleField 系・形マスク丸のみ
        </p>
        <p className="text-[10px] text-muted">
          path(evenodd)/inset/SVG マスク無効。星・角丸データも丸で描画。
        </p>
      </header>
      <BubbleField bottomInset={bottomInset} onCountryChange={setCountryCode} />
      <p className="sr-only">country {countryCode}</p>
    </div>
  );
}
