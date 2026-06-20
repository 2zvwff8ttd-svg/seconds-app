"use client";

import { fetchHomeFeed } from "@/lib/videos/feed";
import { FeedDiagShell } from "./FeedDiagShell";

/**
 * STAGE 4a-1 — load feed.ts module (evaluates map-feed → display-mask), do not call.
 */
export function HomeScreenDiagStage4a1() {
  void fetchHomeFeed;

  return (
    <FeedDiagShell stage="4a-1" title="feed.ts import のみ（実行しない）">
      <p>feed.ts とその依存（map-feed → display-mask 等）をバンドル読み込み済み。</p>
      <p className="text-muted">fetchHomeFeed は呼んでいません。</p>
    </FeedDiagShell>
  );
}
