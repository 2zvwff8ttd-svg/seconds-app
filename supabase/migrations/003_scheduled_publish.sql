-- =============================================================================
-- ?Seconds — Scheduled publish (pending → published at 7:00 JST daily)
-- + daily assignments + morning notifications
-- Run after 001_initial_schema.sql and 002_storage.sql
-- =============================================================================

create extension if not exists pg_cron with schema extensions;

-- -----------------------------------------------------------------------------
-- Types & columns
-- -----------------------------------------------------------------------------
create type public.video_status as enum ('pending', 'published');

alter table public.videos
  add column if not exists status public.video_status not null default 'pending',
  add column if not exists publish_at timestamptz,
  add column if not exists published_at timestamptz;

-- Existing rows (if any) are treated as already published
update public.videos
set
  status = 'published',
  published_at = coalesce(published_at, created_at),
  publish_at = coalesce(publish_at, created_at)
where status = 'pending' and published_at is null;

create index if not exists videos_status_publish_at_idx
  on public.videos (status, publish_at);

create index if not exists videos_published_at_idx
  on public.videos (published_at desc);

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null default 'morning_digest',
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select to authenticated
  using (auth.uid() = user_id);

create policy "notifications_update_own"
  on public.notifications for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, update on public.notifications to authenticated;

-- -----------------------------------------------------------------------------
-- publish_at: next day 7:00 JST from created_at
-- -----------------------------------------------------------------------------
create or replace function public.set_video_publish_at()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_created_jst timestamp;
  v_publish_jst timestamp;
begin
  v_created_jst := timezone('Asia/Tokyo', new.created_at);
  -- Next calendar day at 07:00 JST
  v_publish_jst :=
    date_trunc('day', v_created_jst)
    + interval '1 day'
    + interval '7 hours';

  new.publish_at := v_publish_jst at time zone 'Asia/Tokyo';
  new.status := coalesce(new.status, 'pending'::public.video_status);

  if new.status = 'published'::public.video_status and new.published_at is null then
    new.published_at := new.publish_at;
  end if;

  return new;
end;
$$;

drop trigger if exists videos_set_publish_at on public.videos;
create trigger videos_set_publish_at
  before insert on public.videos
  for each row
  execute function public.set_video_publish_at();

-- -----------------------------------------------------------------------------
-- Updated visibility: only published videos are public to others
-- -----------------------------------------------------------------------------
create or replace function public.can_view_video(p_video_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    v.user_id = auth.uid()
    or (
      v.status = 'published'::public.video_status
      and (
        v.visibility = 'public'::public.video_visibility
        or (
          v.visibility = 'followers_only'::public.video_visibility
          and auth.uid() is not null
          and public.is_following(v.user_id)
        )
      )
    )
  from public.videos v
  where v.id = p_video_id;
$$;

-- -----------------------------------------------------------------------------
-- Daily morning job (7:00 JST via pg_cron)
-- 1. pending → published
-- 2. daily_assignments for all users (5–30 sec)
-- 3. morning notifications
-- -----------------------------------------------------------------------------
create or replace function public.run_daily_morning_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('Asia/Tokyo', now()))::date;
  v_user record;
  v_seconds integer;
  v_published_count integer := 0;
  v_assignment_count integer := 0;
  v_notification_count integer := 0;
  v_had_video_published boolean;
begin
  -- Publish videos whose scheduled time has arrived
  with published as (
    update public.videos
    set
      status = 'published'::public.video_status,
      published_at = timezone('Asia/Tokyo', now())
    where status = 'pending'::public.video_status
      and publish_at <= now()
    returning user_id, id
  )
  select count(*) into v_published_count from published;

  -- Assign recording seconds + notifications for every profile
  for v_user in select id from public.profiles loop
    v_seconds := 5 + floor(random() * 26)::int; -- 5..30 inclusive

    insert into public.daily_assignments (user_id, assigned_seconds, date)
    values (v_user.id, v_seconds, v_today)
    on conflict (user_id, date) do update
      set assigned_seconds = excluded.assigned_seconds;

    v_assignment_count := v_assignment_count + 1;

    select exists (
      select 1
      from public.videos v
      where v.user_id = v_user.id
        and v.status = 'published'::public.video_status
        and (timezone('Asia/Tokyo', v.published_at))::date = v_today
    ) into v_had_video_published;

    if v_had_video_published then
      insert into public.notifications (user_id, type, title, body)
      values (
        v_user.id,
        'morning_digest',
        '昨日の動画が公開されました',
        format('昨日の動画が公開されました！今日の撮影時間は%s秒です。', v_seconds)
      );
    else
      insert into public.notifications (user_id, type, title, body)
      values (
        v_user.id,
        'morning_digest',
        '今日の撮影時間',
        format('今日の撮影時間は%s秒です。', v_seconds)
      );
    end if;

    v_notification_count := v_notification_count + 1;
  end loop;

  return jsonb_build_object(
    'published_videos', v_published_count,
    'assignments', v_assignment_count,
    'notifications', v_notification_count,
    'date_jst', v_today
  );
end;
$$;

grant execute on function public.run_daily_morning_job() to service_role;

-- pg_cron: every day at 07:00 JST = 22:00 UTC (previous UTC day)
select cron.unschedule(jobid)
from cron.job
where jobname = 'seconds-daily-morning-jst';

select cron.schedule(
  'seconds-daily-morning-jst',
  '0 22 * * *',
  $$select public.run_daily_morning_job();$$
);

comment on function public.run_daily_morning_job is
  'Runs at 07:00 JST: publishes pending videos, assigns daily seconds, creates notifications.';
