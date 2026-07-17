-- Phase 2b: precomposed circle+starfield save/share MP4 URL

alter table public.videos
  add column if not exists save_video_url text;

comment on column public.videos.save_video_url is
  'Optional circle-masked starfield MP4 for camera-roll save/share. Null = fall back to video_url.';
