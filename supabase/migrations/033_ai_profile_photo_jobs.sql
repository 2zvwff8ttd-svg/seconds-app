-- AI profile photo (証明写真風) job tracking + daily quota

create table if not exists public.ai_profile_photo_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null
    check (status in ('running', 'succeeded', 'failed', 'quota_denied')),
  model text not null,
  error_code text,
  provider_request_id text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists ai_profile_photo_jobs_user_created_idx
  on public.ai_profile_photo_jobs (user_id, created_at desc);

create index if not exists ai_profile_photo_jobs_user_running_idx
  on public.ai_profile_photo_jobs (user_id)
  where status = 'running';

comment on table public.ai_profile_photo_jobs is
  'Profile photo AI edit jobs. Stores status/model/error only — no image or prompt payloads.';

alter table public.ai_profile_photo_jobs enable row level security;

drop policy if exists "ai_profile_photo_jobs_select_own" on public.ai_profile_photo_jobs;
create policy "ai_profile_photo_jobs_select_own"
  on public.ai_profile_photo_jobs
  for select
  to authenticated
  using (user_id = auth.uid());

-- Atomic reserve: enforce 1 concurrent job + daily limit (UTC day).
create or replace function public.reserve_ai_profile_photo_job(
  p_model text,
  p_daily_limit integer default 3
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_job_id uuid;
  v_running integer;
  v_used_today integer;
  v_limit integer := greatest(coalesce(p_daily_limit, 3), 0);
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  if p_model is null or length(trim(p_model)) = 0 then
    raise exception 'Model is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('ai_profile_photo_jobs'), hashtext(v_user_id::text));

  -- Expire stuck jobs (client disconnect / worker crash) after 10 minutes.
  update public.ai_profile_photo_jobs
  set
    status = 'failed',
    error_code = 'STALE',
    finished_at = now()
  where user_id = v_user_id
    and status = 'running'
    and created_at < now() - interval '10 minutes';

  select count(*)::integer
  into v_running
  from public.ai_profile_photo_jobs
  where user_id = v_user_id
    and status = 'running';

  if v_running > 0 then
    raise exception 'AI_PROFILE_PHOTO_BUSY'
      using errcode = 'P0001';
  end if;

  select count(*)::integer
  into v_used_today
  from public.ai_profile_photo_jobs
  where user_id = v_user_id
    and created_at >= date_trunc('day', timezone('utc', now()))
    and status in ('running', 'succeeded', 'failed');

  if v_used_today >= v_limit then
    -- Do not insert here: RAISE rolls back the transaction.
    raise exception 'AI_PROFILE_PHOTO_DAILY_LIMIT'
      using errcode = 'P0001';
  end if;

  insert into public.ai_profile_photo_jobs (user_id, status, model)
  values (v_user_id, 'running', trim(p_model))
  returning id into v_job_id;

  return v_job_id;
end;
$$;

revoke all on function public.reserve_ai_profile_photo_job(text, integer) from public;
grant execute on function public.reserve_ai_profile_photo_job(text, integer) to authenticated;

create or replace function public.finish_ai_profile_photo_job(
  p_job_id uuid,
  p_status text,
  p_error_code text default null,
  p_provider_request_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Unauthorized' using errcode = '28000';
  end if;

  if p_status not in ('succeeded', 'failed') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  update public.ai_profile_photo_jobs
  set
    status = p_status,
    error_code = p_error_code,
    provider_request_id = p_provider_request_id,
    finished_at = now()
  where id = p_job_id
    and user_id = v_user_id
    and status = 'running';

  if not found then
    raise exception 'Job not found or not running' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.finish_ai_profile_photo_job(uuid, text, text, text) from public;
grant execute on function public.finish_ai_profile_photo_job(uuid, text, text, text) to authenticated;
