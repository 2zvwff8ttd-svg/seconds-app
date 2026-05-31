"use client";

import {
  fetchUnreadNotificationCount,
} from "@/lib/notifications/list";
import { subscribeUnreadNotificationCount } from "@/lib/notifications/subscribe";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useEffect, useState } from "react";

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof subscribeUnreadNotificationCount> | null = null;

    const setup = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      try {
        const count = await fetchUnreadNotificationCount();
        setUnreadCount(count);
      } catch {
        setUnreadCount(0);
      }

      channel = subscribeUnreadNotificationCount(user.id, setUnreadCount);
    };

    void setup();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const showBadge = unreadCount > 0;

  return (
    <Link
      href="/notifications"
      className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-elevated text-muted transition hover:text-foreground"
      aria-label={showBadge ? `通知（未読${unreadCount}件）` : "通知"}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {showBadge && (
        <span
          className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-black"
          aria-hidden
        />
      )}
    </Link>
  );
}
