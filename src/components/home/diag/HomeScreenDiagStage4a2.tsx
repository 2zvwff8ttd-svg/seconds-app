"use client";

import { fetchHomeFeed } from "@/lib/videos/feed";
import { useEffect, useState } from "react";
import { FeedDiagShell } from "./FeedDiagShell";

/** STAGE 4a-2 — invoke fetchHomeFeed only */
export function HomeScreenDiagStage4a2() {
  const [line, setLine] = useState("取得中…");

  useEffect(() => {
    let cancelled = false;
    fetchHomeFeed()
      .then(({ videos, countryCode }) => {
        if (!cancelled) {
          setLine(`✅ OK — videos: ${videos.length}, country: ${countryCode}`);
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
    <FeedDiagShell stage="4a-2" title="fetchHomeFeed() のみ">
      <p>{line}</p>
    </FeedDiagShell>
  );
}
