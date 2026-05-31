"use client";

import {
  getNotificationHref,
  notificationTypeLabel,
} from "@/lib/notifications/navigation";
import { formatRelativeTime } from "@/lib/utils/format-time";
import type { AppNotification } from "@/types/notification";
import { useRouter } from "next/navigation";

function TypeIcon({ type }: { type: AppNotification["type"] }) {
  const className = "h-5 w-5 shrink-0";
  switch (type) {
    case "like":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21s-6.7-4.1-9.2-8.6C.8 9.2 2.5 5.5 6.2 5.5c2 0 3.2 1.2 3.8 2.1.6-.9 1.8-2.1 3.8-2.1 3.7 0 5.4 3.7 3.4 6.9C18.7 16.9 12 21 12 21z" />
        </svg>
      );
    case "comment":
    case "mention":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 5h16v11H7l-3 3V5z" />
        </svg>
      );
    case "follow":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="8" r="3" />
          <path d="M2 20c0-3.3 3.1-5 7-5M16 11v6M13 14h6" />
        </svg>
      );
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      );
  }
}

type NotificationItemProps = {
  notification: AppNotification;
  onMarkRead: (id: string) => void;
};

export function NotificationItem({
  notification,
  onMarkRead,
}: NotificationItemProps) {
  const router = useRouter();
  const href = getNotificationHref(notification);
  const sender =
    notification.actorUsername ??
    (notification.type === "morning_digest" ? "システム" : "ユーザー");

  const handleClick = () => {
    if (!notification.read) {
      onMarkRead(notification.id);
    }
    if (href) router.push(href);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!href}
      className={`flex w-full gap-3 rounded-xl border px-3 py-3 text-left transition touch-manipulation ${
        notification.read
          ? "border-border bg-surface/60 opacity-80"
          : "border-violet-400/30 bg-violet-500/10"
      } ${href ? "hover:border-border hover:bg-surface-elevated" : "cursor-default"}`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          notification.read ? "bg-surface-elevated text-muted" : "bg-violet-500/20 text-violet-300"
        }`}
      >
        <TypeIcon type={notification.type} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
            {notificationTypeLabel(notification.type)}
          </span>
          <time
            dateTime={notification.createdAt}
            className="shrink-0 text-[10px] text-muted"
          >
            {formatRelativeTime(notification.createdAt)}
          </time>
        </span>
        <span className="mt-0.5 block truncate text-sm font-medium text-foreground">
          {notification.title}
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          <span className="text-foreground/70">@{sender}</span>
          {notification.body ? ` · ${notification.body}` : null}
        </span>
      </span>

      {!notification.read && (
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-violet-400" aria-hidden />
      )}
    </button>
  );
}
