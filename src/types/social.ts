export type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl?: string | null;
};

export type LikeState = {
  count: number;
  likedByMe: boolean;
};
