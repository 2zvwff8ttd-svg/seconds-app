-- Supabase SQL Editor: run this once to add display_mask_shape to videos.
-- Phase 1: circle | star | square (rounded square)

alter table public.videos
  add column if not exists display_mask_shape text not null default 'circle';

alter table public.videos
  drop constraint if exists videos_display_mask_shape_check;

alter table public.videos
  add constraint videos_display_mask_shape_check
  check (display_mask_shape in ('circle', 'star', 'square'));

comment on column public.videos.display_mask_shape is
  'Display mask for bubbles / fullscreen playback (square = rounded square).';

-- Verify:
-- select column_name, data_type, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'videos' and column_name = 'display_mask_shape';
