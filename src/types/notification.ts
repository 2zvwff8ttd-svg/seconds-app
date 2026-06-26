export type NotificationType =
  | "like"
  | "comment"
  | "follow"
  | "mention"
  | "morning_digest";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  actorId: string | null;
  actorUsername: string | null;
  actorDisplayName: string | null;
  videoId: string | null;
  commentId: string | null;
};
