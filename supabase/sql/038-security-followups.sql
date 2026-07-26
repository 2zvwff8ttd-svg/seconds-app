-- #3 / #7 / #8 follow-ups from security audit.
-- Safe to apply after 037. Does not modify existing row data.
-- Apply in SQL Editor (same as migrations/038_security_followups.sql).

-- ---------------------------------------------------------------------------
-- #3 birth_date: hide from PostgREST clients (column privilege)
-- App never selects birth_date today; owners/admins don't need it in UI.
-- ---------------------------------------------------------------------------
revoke select (birth_date) on table public.profiles from anon, authenticated;

-- ---------------------------------------------------------------------------
-- #7 videos: clients cannot set status / publish / moderation fields
-- Legitimate publish paths use security definer RPCs / service_role / JWT-less SQL.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_video_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
  as_definer boolean := current_user in ('postgres', 'supabase_admin');
begin
  if jwt_role = 'service_role' then
    return new;
  end if;

  if auth.uid() is null and jwt_role = '' then
    return new;
  end if;

  -- SECURITY DEFINER RPCs (publish job, auto-hide) run as postgres
  if as_definer then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending'::public.video_status then
      new.status := 'pending'::public.video_status;
    end if;
    new.published_at := null;
    new.moderation_hidden := false;
    return new;
  end if;

  if new.status is distinct from old.status
     or new.published_at is distinct from old.published_at
     or new.moderation_hidden is distinct from old.moderation_hidden then
    if not public.is_admin() then
      raise exception 'videos privileged columns cannot be changed by this role'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_video_privileged_columns() is
  'Blocks authenticated clients from publishing or un-hiding videos directly. Admins and service_role / SQL sessions allowed.';

drop trigger if exists trg_enforce_video_privileged_columns on public.videos;
create trigger trg_enforce_video_privileged_columns
  before insert or update on public.videos
  for each row
  execute function public.enforce_video_privileged_columns();

-- ---------------------------------------------------------------------------
-- #8 RLS on config / job tables (deny-by-default for anon/authenticated)
-- ---------------------------------------------------------------------------
alter table if exists public.app_config enable row level security;
alter table if exists public.daily_morning_job_runs enable row level security;

-- No client policies → authenticated/anon cannot read/write when grants exist.
-- Keep service_role / security definer access intact.

notify pgrst, 'reload schema';
