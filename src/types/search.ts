export type SearchUserResult = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  followerCount: number;
};

export type SearchVideoResult = {
  id: string;
  title: string;
  thumbnailUrl?: string;
  creatorId: string;
  creatorName: string;
  creatorDisplayName: string | null;
};

export type SearchTab = "users" | "videos";
