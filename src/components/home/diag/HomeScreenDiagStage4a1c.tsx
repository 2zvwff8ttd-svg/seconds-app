"use client";

import { normalizeVideoRow } from "@/lib/videos/map-feed";

/**
 * STAGE 4a-1c — map-feed.ts import only (pulls display-mask)
 */
export function HomeScreenDiagStage4a1c() {
  void normalizeVideoRow;

  return (
    <main
      className="app-page flex min-h-[100dvh] flex-col px-6 py-8"
      style={{ fontFamily: "system-ui, sans-serif", color: "#eee", background: "#111" }}
    >
      <h1 className="text-lg font-bold">STAGE 4a-1c</h1>
      <p className="mt-1 text-sm text-violet-300">map-feed.ts import のみ（→ display-mask）</p>
    </main>
  );
}
