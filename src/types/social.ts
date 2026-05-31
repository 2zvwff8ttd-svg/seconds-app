export type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  username: string;
};

export type LikeState = {
  count: number;
  likedByMe: boolean;
};
