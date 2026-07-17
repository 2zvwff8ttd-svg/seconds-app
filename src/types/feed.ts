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
  creatorDisplayName: string | null;
  creatorAvatar?: string;
  isViralTop?: boolean;
  countryCode?: string;
  /** 新着順・レコメンド用（published_at または created_at） */
  publishedAt?: string;
  /** 公開予定（pending 時の残り日数見積もり用） */
  publishAt?: string;
  videoStatus?: "pending" | "published";
  displayMaskShape?: VideoDisplayMaskShape;
  /** Circle+starfield MP4 for save/share; fall back to videoUrl when absent. */
  saveVideoUrl?: string;
};
