import type { AppNotification } from "@/types/notification";

export function getNotificationHref(notification: AppNotification): string | null {
  switch (notification.type) {
    case "follow":
      return notification.actorId ? `/profile/${notification.actorId}` : null;
    case "like":
    case "comment":
    case "mention":
      return notification.videoId ? `/video/${notification.videoId}` : null;
    case "morning_digest":
      return "/post";
    default:
      return null;
  }
}

export function notificationTypeLabel(type: AppNotification["type"]): string {
  switch (type) {
    case "like":
      return "いいね";
    case "comment":
      return "コメント";
    case "follow":
      return "フォロー";
    case "mention":
      return "メンション";
    case "morning_digest":
      return "お知らせ";
    default:
      return "通知";
  }
}
