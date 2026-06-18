-- videos.display_mask_shape: per-video display mask (circle, star, square, …)

alter table public.videos
  add column if not exists display_mask_shape text not null default 'circle';

alter table public.videos
  drop constraint if exists videos_display_mask_shape_check;

alter table public.videos
  add constraint videos_display_mask_shape_check
  check (display_mask_shape in ('circle', 'star', 'square'));

comment on column public.videos.display_mask_shape is
  'Display mask for bubbles / fullscreen playback (square = rounded square).';
