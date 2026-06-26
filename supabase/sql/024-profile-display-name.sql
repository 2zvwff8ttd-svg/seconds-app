-- Supabase SQL Editor: run this once to add profile display names (Phase A).
-- Same as supabase/migrations/024_profile_display_name.sql
--
-- display_name: optional user-facing name (Unicode / emoji OK, max 30 chars).
-- Empty/null falls back to username in the app.

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
