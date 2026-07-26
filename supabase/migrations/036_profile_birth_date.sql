-- Age gate: profiles.birth_date for App Store / terms (13+).
-- Existing rows stay null (no backfill). New signups must supply DOB via auth metadata.
-- Apply in SQL Editor (same as migrations/036_profile_birth_date.sql).

alter table public.profiles
  add column if not exists birth_date date;

comment on column public.profiles.birth_date is
  'User date of birth. Required for new signups; null allowed for legacy tester accounts. Must be at least 13 years before today when set.';

alter table public.profiles
  drop constraint if exists profiles_birth_date_not_future;

alter table public.profiles
  add constraint profiles_birth_date_not_future
  check (birth_date is null or birth_date <= current_date);

alter table public.profiles
  drop constraint if exists profiles_birth_date_min_age_13;

alter table public.profiles
  add constraint profiles_birth_date_min_age_13
  check (
    birth_date is null
    or (birth_date + interval '13 years') <= current_date
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_username text;
  base_username text;
  final_username text;
  suffix int := 0;
  suffix_text text;
  raw_birth text;
  parsed_birth date;
begin
  raw_birth := nullif(trim(new.raw_user_meta_data->>'birth_date'), '');
  if raw_birth is null then
    raise exception 'birth_date is required for signup'
      using errcode = 'check_violation';
  end if;

  begin
    parsed_birth := raw_birth::date;
  exception
    when others then
      raise exception 'birth_date must be a valid date (YYYY-MM-DD)'
        using errcode = 'check_violation';
  end;

  if parsed_birth > current_date then
    raise exception 'birth_date cannot be in the future'
      using errcode = 'check_violation';
  end if;

  if (parsed_birth + interval '13 years') > current_date then
    raise exception 'users under 13 cannot sign up'
      using errcode = 'check_violation';
  end if;

  raw_username := nullif(trim(new.raw_user_meta_data->>'username'), '');
  base_username := null;

  if raw_username is not null then
    base_username := lower(regexp_replace(raw_username, '[^a-zA-Z0-9_]', '', 'g'));
    if char_length(base_username) < 2 then
      base_username := null;
    elsif char_length(base_username) > 30 then
      base_username := left(base_username, 30);
    end if;
  end if;

  if base_username is null then
    base_username := 'user_' || left(replace(new.id::text, '-', ''), 8);
  end if;

  final_username := base_username;

  while exists (
    select 1
    from public.profiles p
    where lower(p.username) = lower(final_username)
  ) loop
    suffix := suffix + 1;
    suffix_text := '_' || suffix::text;
    final_username :=
      left(base_username, 30 - char_length(suffix_text)) || suffix_text;
  end loop;

  insert into public.profiles (id, username, country, birth_date)
  values (
    new.id,
    final_username,
    coalesce(nullif(trim(new.raw_user_meta_data->>'country'), ''), 'JP'),
    parsed_birth
  );

  return new;
end;
$$;

alter function public.handle_new_user() owner to postgres;
grant execute on function public.handle_new_user() to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;

notify pgrst, 'reload schema';
