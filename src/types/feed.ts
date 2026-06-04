export type FeedVideo = {
  id: string;
  videoUrl: string;
  thumbnailUrl?: string;
  title: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  isViralTop?: boolean;
  countryCode?: string;
  /** 新着順・レコメンド用（published_at または created_at） */
  publishedAt?: string;
};
