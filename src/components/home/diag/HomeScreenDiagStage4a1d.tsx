"use client";

import { probeVideoSchema } from "@/lib/supabase/video-schema";

/**
 * STAGE 4a-1d — video-schema.ts import only
 */
export function HomeScreenDiagStage4a1d() {
  void probeVideoSchema;

  return (
    <main
      className="app-page flex min-h-[100dvh] flex-col px-6 py-8"
      style={{ fontFamily: "system-ui, sans-serif", color: "#eee", background: "#111" }}
    >
      <h1 className="text-lg font-bold">STAGE 4a-1d</h1>
      <p className="mt-1 text-sm text-violet-300">video-schema.ts import のみ</p>
    </main>
  );
}
