export type DmThreadStatus = "pending" | "active" | "declined";

export type DmMessage = {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
  isMine: boolean;
};

export type DmThreadSummary = {
  id: string;
  status: DmThreadStatus;
  isInitiator: boolean;
  isRequest: boolean;
  otherUserId: string;
  otherUsername: string;
  otherAvatarUrl: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
};
