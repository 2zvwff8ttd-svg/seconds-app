-- Extend display_mask_shape CHECK for heart and diamond masks

alter table public.videos
  drop constraint if exists videos_display_mask_shape_check;

alter table public.videos
  add constraint videos_display_mask_shape_check
  check (display_mask_shape in ('circle', 'star', 'square', 'heart', 'diamond'));

comment on column public.videos.display_mask_shape is
  'Display mask for bubbles / fullscreen playback (square = rounded square).';
