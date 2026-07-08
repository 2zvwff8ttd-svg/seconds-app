-- =============================================================================
-- 030: Crown awards (daily #1) + video_daily_views
-- Run this ENTIRE file in Supabase SQL Editor.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Lifetime unique view receipts (1 user × 1 video → one lifetime count)
-- ---------------------------------------------------------------------------
create table if not exists public.video_view_receipts (
  user_id uuid not null references auth.users (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  view_date date not null default (timezone('Asia/Tokyo', now()))::date,
  primary key (user_id, video_id)
);

create index if not exists video_view_receipts_video_date_idx
  on public.video_view_receipts (video_id, view_date);

alter table public.video_view_receipts enable row level security;

drop policy if exists "video_view_receipts_select_own" on public.video_view_receipts;
create policy "video_view_receipts_select_own"
  on public.video_view_receipts for select to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2) Daily view totals per video (JST calendar day) — ranking metric
-- ---------------------------------------------------------------------------
create table if not exists public.video_daily_views (
  video_id uuid not null references public.videos (id) on delete cascade,
  view_date date not null,
  view_count integer not null default 0 check (view_count >= 0),
  primary key (video_id, view_date)
);

create index if not exists video_daily_views_date_count_idx
  on public.video_daily_views (view_date, view_count desc);

alter table public.video_daily_views enable row level security;

drop policy if exists "video_daily_views_select_authenticated" on public.video_daily_views;
create policy "video_daily_views_select_authenticated"
  on public.video_daily_views for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 3) Crown awards (daily #1 snapshot + celebration seen)
-- ---------------------------------------------------------------------------
create table if not exists public.crown_awards (
  id uuid primary key default gen_random_uuid(),
  award_date date not null,
  country text not null,
  video_id uuid not null references public.videos (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  daily_view_count integer not null check (daily_view_count >= 0),
  total_view_count integer not null check (total_view_count >= 0),
  celebrated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (country, award_date)
);

create index if not exists crown_awards_user_award_date_idx
  on public.crown_awards (user_id, award_date desc);

create index if not exists crown_awards_user_uncelebrated_idx
  on public.crown_awards (user_id)
  where celebrated_at is null;

create index if not exists crown_awards_country_date_idx
  on public.crown_awards (country, award_date desc);

alter table public.crown_awards enable row level security;

drop policy if exists "crown_awards_select_authenticated" on public.crown_awards;
create policy "crown_awards_select_authenticated"
  on public.crown_awards for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 4) increment_video_view — lifetime unique + daily + videos.view_count
--    Client should call after ~2s meaningful fullscreen watch.
-- ---------------------------------------------------------------------------
create or replace function public.increment_video_view(p_video_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (timezone('Asia/Tokyo', now()))::date;
  v_rows integer;
  v_total integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  if p_video_id is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_video');
  end if;

  if not exists (
    select 1 from public.videos v
    where v.id = p_video_id
      and coalesce(v.status::text, 'published') = 'published'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_published');
  end if;

  insert into public.video_view_receipts (user_id, video_id, view_date)
  values (v_uid, p_video_id, v_today)
  on conflict (user_id, video_id) do nothing;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return jsonb_build_object('ok', true, 'counted', false, 'reason', 'already_viewed');
  end if;

  update public.videos
  set view_count = view_count + 1
  where id = p_video_id
  returning view_count into v_total;

  insert into public.video_daily_views (video_id, view_date, view_count)
  values (p_video_id, v_today, 1)
  on conflict (video_id, view_date) do update
    set view_count = public.video_daily_views.view_count + 1;

  return jsonb_build_object(
    'ok', true,
    'counted', true,
    'view_count', v_total,
    'view_date', v_today
  );
end;
$$;

grant execute on function public.increment_video_view(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) award_daily_crowns
--    Metric: video_daily_views.view_count for award_date (day's unique first-views)
--    Cooldown: users with crown_awards.award_date in (award_date-10, award_date)
--              i.e. crowned within the previous 10 days, not including award_date
--    Tie-break: daily_views DESC → total view_count DESC → published_at ASC → id
-- ---------------------------------------------------------------------------
create or replace function public.award_daily_crowns(p_award_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_award_date date := coalesce(
    p_award_date,
    (timezone('Asia/Tokyo', now()))::date - 1
  );
  v_country text;
  v_inserted integer := 0;
  v_skipped_existing integer := 0;
  v_skipped_no_views integer := 0;
  v_winner record;
  v_rows integer;
begin
  for v_country in
    select distinct v.country
    from public.videos v
    where v.status = 'published'::public.video_status
      and v.country is not null
      and length(trim(v.country)) > 0
  loop
    if exists (
      select 1 from public.crown_awards a
      where a.country = v_country and a.award_date = v_award_date
    ) then
      v_skipped_existing := v_skipped_existing + 1;
      continue;
    end if;

    select
      v.id as video_id,
      v.user_id,
      coalesce(d.view_count, 0) as daily_views,
      coalesce(v.view_count, 0) as total_views
    into v_winner
    from public.videos v
    left join public.video_daily_views d
      on d.video_id = v.id and d.view_date = v_award_date
    where v.status = 'published'::public.video_status
      and v.country = v_country
      and not exists (
        -- Crowned on day A blocks awards for D when A < D AND A > D - 10
        -- Example: A=7/1 excludes 7/2..7/10; eligible again for 7/11
        select 1 from public.crown_awards ca
        where ca.user_id = v.user_id
          and ca.award_date < v_award_date
          and ca.award_date > (v_award_date - 10)
      )
    order by
      coalesce(d.view_count, 0) desc,
      coalesce(v.view_count, 0) desc,
      v.published_at asc nulls last,
      v.id asc
    limit 1;

    if v_winner.video_id is null then
      continue;
    end if;

    if v_winner.daily_views <= 0 then
      v_skipped_no_views := v_skipped_no_views + 1;
      continue;
    end if;

    insert into public.crown_awards (
      award_date,
      country,
      video_id,
      user_id,
      daily_view_count,
      total_view_count
    )
    values (
      v_award_date,
      v_country,
      v_winner.video_id,
      v_winner.user_id,
      v_winner.daily_views,
      v_winner.total_views
    )
    on conflict (country, award_date) do nothing;

    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'award_date', v_award_date,
    'inserted', v_inserted,
    'skipped_existing', v_skipped_existing,
    'skipped_no_views', v_skipped_no_views
  );
end;
$$;

grant execute on function public.award_daily_crowns(date) to service_role;

-- ---------------------------------------------------------------------------
-- 6) Celebration RPCs
-- ---------------------------------------------------------------------------
create or replace function public.fetch_pending_crown_celebration()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.crown_awards%rowtype;
  v_title text;
  v_thumb text;
begin
  if v_uid is null then
    return null;
  end if;

  select a.* into v_row
  from public.crown_awards a
  where a.user_id = v_uid
    and a.celebrated_at is null
  order by a.award_date desc, a.created_at desc
  limit 1;

  if not found or v_row.id is null then
    return null;
  end if;

  select v.title, v.thumbnail_url into v_title, v_thumb
  from public.videos v
  where v.id = v_row.video_id;

  return jsonb_build_object(
    'id', v_row.id,
    'award_date', v_row.award_date,
    'country', v_row.country,
    'video_id', v_row.video_id,
    'daily_view_count', v_row.daily_view_count,
    'total_view_count', v_row.total_view_count,
    'title', coalesce(nullif(trim(v_title), ''), '無題のvlog'),
    'thumbnail_url', v_thumb
  );
end;
$$;

grant execute on function public.fetch_pending_crown_celebration() to authenticated;

create or replace function public.mark_crown_celebration_seen(p_award_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_rows integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  update public.crown_awards
  set celebrated_at = now()
  where id = p_award_id
    and user_id = v_uid
    and celebrated_at is null;

  get diagnostics v_rows = row_count;

  return jsonb_build_object('ok', true, 'updated', v_rows > 0);
end;
$$;

grant execute on function public.mark_crown_celebration_seen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Patch run_daily_morning_job — award crowns after publish
-- ---------------------------------------------------------------------------
create or replace function public.run_daily_morning_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('Asia/Tokyo', now()))::date;
  v_award_date date := v_today - 1;
  v_user record;
  v_seconds integer;
  v_published_count integer := 0;
  v_assignment_count integer := 0;
  v_notification_count integer := 0;
  v_retention_pending integer := 0;
  v_crown_result jsonb;
  v_morning_digest_title constant text := '?Seconds';
  v_morning_digest_body constant text :=
    '今日の秒数が届いたよ！何気ない1日を思い出に残そう';
begin
  with published as (
    update public.videos
    set
      status = 'published'::public.video_status,
      published_at = coalesce(
        published_at,
        timezone('Asia/Tokyo', now())
      )
    where status = 'pending'::public.video_status
    returning user_id, id
  )
  select count(*) into v_published_count from published;

  v_crown_result := public.award_daily_crowns(v_award_date);

  select count(*) into v_retention_pending
  from public.list_videos_for_retention_expiry();

  for v_user in
    select p.id, coalesce(p.current_streak, 0) as current_streak
    from public.profiles p
  loop
    v_seconds := public.random_assigned_seconds(v_user.current_streak);

    insert into public.daily_assignments (user_id, assigned_seconds, date)
    values (v_user.id, v_seconds, v_today)
    on conflict (user_id, date) do update
      set assigned_seconds = excluded.assigned_seconds;

    v_assignment_count := v_assignment_count + 1;

    insert into public.notifications (user_id, type, title, body)
    values (
      v_user.id,
      'morning_digest',
      v_morning_digest_title,
      v_morning_digest_body
    );

    v_notification_count := v_notification_count + 1;
  end loop;

  return jsonb_build_object(
    'published_videos', v_published_count,
    'assignments', v_assignment_count,
    'notifications', v_notification_count,
    'retention_expiry_pending', v_retention_pending,
    'retention_expiry_enabled', coalesce(
      (public.get_video_retention_config()->>'expiry_enabled')::boolean,
      false
    ),
    'crown_awards', v_crown_result,
    'date_jst', v_today,
    'ran_at_jst', timezone('Asia/Tokyo', now())
  );
end;
$$;

grant execute on function public.run_daily_morning_job() to service_role;

comment on table public.video_daily_views is
  'Per-video first-unique-view counts by JST day (daily crown ranking metric)';
comment on table public.crown_awards is
  'Daily country #1 crown snapshots; celebrated_at marks in-app celebration seen';
comment on function public.award_daily_crowns(date) is
  'Award crowns for award_date from video_daily_views; 10-day user cooldown';
comment on function public.increment_video_view(uuid) is
  'Count one lifetime unique view; also bumps videos.view_count and video_daily_views';
