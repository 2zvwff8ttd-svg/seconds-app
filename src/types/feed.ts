import type { VideoDisplayMaskShape } from "@/lib/video/display-mask";

export type FeedVideo = {
  id: string;
  videoUrl: string;
  /** プリセット BGM（再生時に動画と同時再生） */
  bgmUrl?: string;
  thumbnailUrl?: string;
  /** 2クリップ以上のとき、各クリップ先頭フレームの静止画（スライドショー用） */
  clipThumbnailUrls?: string[];
  title: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  isViralTop?: boolean;
  countryCode?: string;
  /** 新着順・レコメンド用（published_at または created_at） */
  publishedAt?: string;
  displayMaskShape?: VideoDisplayMaskShape;
};
