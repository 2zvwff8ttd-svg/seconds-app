export type SearchUserResult = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  followerCount: number;
};

export type SearchVideoResult = {
  id: string;
  title: string;
  thumbnailUrl?: string;
  creatorId: string;
  creatorName: string;
};

export type SearchTab = "users" | "videos";
