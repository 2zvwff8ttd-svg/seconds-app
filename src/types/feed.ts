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
};
