-- Phase 2b: precomposed circle+starfield save/share MP4 URL
-- Run in Supabase SQL Editor (full file).

alter table public.videos
  add column if not exists save_video_url text;

comment on column public.videos.save_video_url is
  'Optional circle-masked starfield MP4 for camera-roll save/share. Null = fall back to video_url.';

-- Verify:
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'videos' and column_name = 'save_video_url';
