"use client";

import { fetchUserRecommendationContext } from "@/lib/recommendation/context";
import { useEffect, useState } from "react";
import { FeedDiagShell } from "./FeedDiagShell";

/** STAGE 4a-3 — invoke fetchUserRecommendationContext only */
export function HomeScreenDiagStage4a3() {
  const [line, setLine] = useState("取得中…");

  useEffect(() => {
    let cancelled = false;
    fetchUserRecommendationContext()
      .then((ctx) => {
        if (!cancelled) {
          setLine(
            `✅ OK — isNewUser: ${ctx.isNewUser}, creators: ${Object.keys(ctx.creatorScores).length}`,
          );
        }
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
    <FeedDiagShell stage="4a-3" title="fetchUserRecommendationContext() のみ">
      <p>{line}</p>
      <p className="text-muted">feed.ts / display-mask は import しません。</p>
    </FeedDiagShell>
  );
}
