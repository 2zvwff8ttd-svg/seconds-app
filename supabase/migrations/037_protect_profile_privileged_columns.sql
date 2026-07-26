-- #1 Security: prevent clients from elevating/changing privileged profile columns.
-- Existing is_admin rows are UNCHANGED by this migration (trigger only guards future writes).
--
-- BEFORE APPLY — verify intended admins (read-only):
--   select id, username, is_admin, is_banned, created_at
--   from public.profiles
--   where is_admin = true
--   order by created_at;
--
-- Production check (2026-07-27): only kai (85e3736b-33bd-4d02-b305-3b9c394cf07b) is admin.
-- Apply in SQL Editor (same as migrations/037_protect_profile_privileged_columns.sql).

create or replace function public.enforce_profile_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  jwt_role text := coalesce(auth.jwt() ->> 'role', '');
  as_definer boolean := current_user in ('postgres', 'supabase_admin');
begin
  -- service_role (Edge / dashboard service key): full allow
  if jwt_role = 'service_role' then
    return new;
  end if;

  -- SQL Editor / migrations: no JWT and no auth.uid()
  if auth.uid() is null and jwt_role = '' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Clients must not insert themselves as admin/banned/hidden
    new.is_admin := false;
    new.is_banned := false;
    new.moderation_hidden := false;
    return new;
  end if;

  -- UPDATE: never allow client (or accidental SECURITY DEFINER) self-grant of is_admin
  -- Only service_role / JWT-less SQL sessions (handled above) may change is_admin.
  if new.is_admin is distinct from old.is_admin then
    raise exception 'profiles.is_admin can only be changed by service_role'
      using errcode = '42501';
  end if;

  -- is_banned / moderation_hidden: admins via RPC, or SECURITY DEFINER helpers (postgres)
  if new.is_banned is distinct from old.is_banned
     or new.moderation_hidden is distinct from old.moderation_hidden then
    if not as_definer and not public.is_admin() then
      raise exception 'profiles moderation columns cannot be changed by this role'
        using errcode = '42501';
    end if;
  end if;

  -- birth_date: immutable after signup for clients
  if new.birth_date is distinct from old.birth_date then
    if not as_definer then
      raise exception 'profiles.birth_date cannot be changed after signup'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_profile_privileged_columns() is
  'Blocks authenticated clients from changing is_admin / moderation flags / birth_date. service_role and JWT-less SQL sessions allowed; admins may change ban/hidden via security definer RPCs.';

drop trigger if exists trg_enforce_profile_privileged_columns on public.profiles;
create trigger trg_enforce_profile_privileged_columns
  before insert or update on public.profiles
  for each row
  execute function public.enforce_profile_privileged_columns();

notify pgrst, 'reload schema';

-- AFTER APPLY — confirm admins still intact:
--   select id, username, is_admin from public.profiles where is_admin = true;
