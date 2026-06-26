-- Profile display name (Phase A: optional Unicode label, username remains handle)

alter table public.profiles
  add column if not exists display_name text;

alter table public.profiles
  drop constraint if exists profiles_display_name_length;

alter table public.profiles
  add constraint profiles_display_name_length
  check (
    display_name is null
    or char_length(btrim(display_name)) between 1 and 30
  );

comment on column public.profiles.display_name is
  'User-facing display name (any Unicode). Empty/null falls back to username in UI.';

notify pgrst, 'reload schema';
