"use client";

import { NotificationItem } from "@/components/notifications/NotificationItem";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/list";
import { subscribeNotificationUpdates } from "@/lib/notifications/subscribe";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/types/notification";
import { useCallback, useEffect, useState } from "react";

export function NotificationList() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await fetchNotifications();
      setItems(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "通知の取得に失敗しました");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof subscribeNotificationUpdates> | null = null;

    const setup = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      channel = subscribeNotificationUpdates(user.id, () => {
        void load();
      });
    };

    void setup();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  const handleMarkRead = (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    markNotificationRead(id).catch(() => {});
  };

  const handleMarkAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await markAllNotificationsRead();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
      void load();
    }
  };

  const hasUnread = items.some((n) => !n.read);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-muted">読み込み中…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          再試行
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-elevated text-muted">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
        <p className="text-sm font-medium text-foreground">通知はありません</p>
        <p className="text-xs text-muted">いいね・コメント・フォローが届くとここに表示されます</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-5">
      {hasUnread && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            すべて既読にする
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((notification) => (
          <li key={notification.id}>
            <NotificationItem
              notification={notification}
              onMarkRead={handleMarkRead}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
