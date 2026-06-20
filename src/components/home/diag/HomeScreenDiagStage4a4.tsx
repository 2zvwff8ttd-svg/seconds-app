"use client";

import { detectCountryCode } from "@/lib/country/detect";
import { useEffect, useState } from "react";
import { FeedDiagShell } from "./FeedDiagShell";

/** STAGE 4a-4 — invoke detectCountryCode only (locale + ipapi.co) */
export function HomeScreenDiagStage4a4() {
  const [line, setLine] = useState("取得中…");

  useEffect(() => {
    let cancelled = false;
    detectCountryCode()
      .then((code) => {
        if (!cancelled) setLine(`✅ OK — country: ${code}`);
      })
      .catch((err) => {
        if (!cancelled) {
          setLine(`❌ ${err instanceof Error ? err.message : "failed"}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <FeedDiagShell stage="4a-4" title="detectCountryCode() のみ（ipapi.co 含む）">
      <p>{line}</p>
      <p className="text-muted">feed.ts / map-feed / display-mask は import しません。</p>
    </FeedDiagShell>
  );
}
