"use client";

import { ThreadRow } from "@/components/messages/ThreadRow";
import { fetchDmThreadsForUser } from "@/lib/dm/threads";
import { subscribeDmUpdates } from "@/lib/dm/subscribe";
import { createClient } from "@/lib/supabase/client";
import type { DmThreadSummary } from "@/types/dm";
import { useCallback, useEffect, useState } from "react";

type Tab = "inbox" | "requests";

export function MessagesScreen() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [inbox, setInbox] = useState<DmThreadSummary[]>([]);
  const [requests, setRequests] = useState<DmThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchDmThreadsForUser();
      setInbox(data.inbox);
      setRequests(data.requests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof subscribeDmUpdates> | null = null;

    const setup = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      channel = subscribeDmUpdates(user.id, () => {
        void load();
      });
    };

    void setup();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  const list = tab === "inbox" ? inbox : requests;
  const requestUnread = requests.reduce((n, t) => n + t.unreadCount, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex gap-1 rounded-xl bg-surface p-1">
          <button
            type="button"
            onClick={() => setTab("inbox")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              tab === "inbox"
                ? "bg-surface-elevated text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            受信トレイ
          </button>
          <button
            type="button"
            onClick={() => setTab("requests")}
            className={`relative flex-1 rounded-lg py-2 text-sm font-medium transition ${
              tab === "requests"
                ? "bg-surface-elevated text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            リクエスト
            {requestUnread > 0 && (
              <span className="absolute right-3 top-1.5 h-2 w-2 rounded-full bg-violet-500" />
            )}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
        {error && (
          <p className="mx-2 mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        {loading ? (
          <p className="py-16 text-center text-sm text-muted">読み込み中…</p>
        ) : list.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">
            {tab === "inbox"
              ? "メッセージはまだありません"
              : "リクエストはありません"}
          </p>
        ) : (
          <div className="flex flex-col">
            {list.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                showPendingBadge={tab === "inbox"}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
