export type ProfileData = {
  userId: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  country: string;
};

export type FollowStats = {
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
};

export type FollowListUser = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type FollowListKind = "followers" | "following";
