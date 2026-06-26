-- Supabase SQL Editor: run this once to allow heart and diamond display masks.
-- Same as supabase/migrations/026_display_mask_heart_diamond.sql
--
-- Extends videos.display_mask_shape CHECK to include heart and diamond.

alter table public.videos
  drop constraint if exists videos_display_mask_shape_check;

alter table public.videos
  add constraint videos_display_mask_shape_check
  check (display_mask_shape in ('circle', 'star', 'square', 'heart', 'diamond'));

comment on column public.videos.display_mask_shape is
  'Display mask for bubbles / fullscreen playback (square = rounded square).';

-- Verify:
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.videos'::regclass and conname = 'videos_display_mask_shape_check';
