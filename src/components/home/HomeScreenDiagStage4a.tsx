"use client";

import { fetchUserRecommendationContext } from "@/lib/recommendation/context";
import { fetchHomeFeed } from "@/lib/videos/feed";
import { useEffect, useState } from "react";

type FeedDiagState =
  | { phase: "loading" }
  | { phase: "ok"; videoCount: number; countryCode: string; recNewUser: boolean }
  | { phase: "error"; message: string };

/**
 * STAGE 4a — same network calls as BubbleField.loadFeed, no VideoBubble/layout/render.
 */
export function HomeScreenDiagStage4a() {
  const [state, setState] = useState<FeedDiagState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const [{ videos, countryCode }, recCtx] = await Promise.all([
          fetchHomeFeed(),
          fetchUserRecommendationContext(),
        ]);
        if (cancelled) return;
        setState({
          phase: "ok",
          videoCount: videos.length,
          countryCode,
          recNewUser: recCtx.isNewUser,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : "フィード取得失敗",
        });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      className="app-page flex min-h-[100dvh] flex-col px-6 py-8"
      style={{ fontFamily: "system-ui, sans-serif", color: "#eee", background: "#111" }}
    >
      <h1 className="text-lg font-bold">STAGE 4a: フィード取得のみ</h1>
      <p className="mt-2 text-sm text-violet-300">
        fetchHomeFeed + fetchUserRecommendationContext（BubbleField 未使用）
      </p>

      {state.phase === "loading" && (
        <p className="mt-6 text-sm text-muted">取得中…</p>
      )}

      {state.phase === "ok" && (
        <ul className="mt-6 space-y-2 text-sm">
          <li>✅ 取得成功</li>
          <li>動画件数: {state.videoCount}</li>
          <li>国コード: {state.countryCode}</li>
          <li>レコメンド新規ユーザー: {state.recNewUser ? "はい" : "いいえ"}</li>
        </ul>
      )}

      {state.phase === "error" && (
        <p className="mt-6 text-sm text-red-400">❌ {state.message}</p>
      )}
    </main>
  );
}
