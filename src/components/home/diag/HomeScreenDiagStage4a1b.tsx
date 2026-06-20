"use client";

import { parseVideoDisplayMaskShape } from "@/lib/video/display-mask";

/**
 * STAGE 4a-1b — display-mask.ts module only (map-feed の依存、トップレベルで MASK_DEFINITIONS 構築)
 */
export function HomeScreenDiagStage4a1b() {
  void parseVideoDisplayMaskShape;

  return (
    <main
      className="app-page flex min-h-[100dvh] flex-col px-6 py-8"
      style={{ fontFamily: "system-ui, sans-serif", color: "#eee", background: "#111" }}
    >
      <h1 className="text-lg font-bold">STAGE 4a-1b</h1>
      <p className="mt-1 text-sm text-violet-300">display-mask.ts import のみ</p>
      <p className="mt-6 text-sm text-muted">
        path(evenodd) 文字列・SVG data-URL マスク定義をモジュール読み込み時に評価。
      </p>
    </main>
  );
}
