export type VideoVisibility = "public" | "followers_only";
export type VideoStatus = "pending" | "published";

export type VideoRow = {
  id: string;
  user_id: string;
  video_url: string;
  bgm_url?: string | null;
  thumbnail_url: string | null;
  clip_thumbnail_urls?: string[] | null;
  title: string;
  duration_seconds: number;
  visibility: VideoVisibility;
  status: VideoStatus;
  publish_at: string | null;
  published_at: string | null;
  country: string;
  view_count: number;
  created_at: string;
  display_mask_shape?: string | null;
  profiles: { username: string; avatar_url?: string | null } | null;
};

export type PostUploadStage =
  | "idle"
  | "ai_enhancing"
  | "merging_audio"
  | "merging_clips"
  | "preparing"
  | "uploading_thumbnail"
  | "uploading_video"
  | "saving"
  | "done"
  | "error";
