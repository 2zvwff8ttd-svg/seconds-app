-- 10-day video retention: config + expiry helpers (apply via Edge / scripts; off by default).

create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default timezone('Asia/Tokyo', now())
);

insert into public.app_config (key, value)
values (
  'video_retention',
  jsonb_build_object(
    'policy_start_jst',
    ((timezone('Asia/Tokyo', now()) + interval '1 day')::date)::text,
    'retention_days',
    10,
    'expiry_enabled',
    false
  )
)
on conflict (key) do nothing;

comment on table public.app_config is 'App-wide config (video retention policy, feature flags).';

create or replace function public.get_video_retention_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select value
      from public.app_config
      where key = 'video_retention'
    ),
    jsonb_build_object(
      'policy_start_jst',
      ((timezone('Asia/Tokyo', now()) + interval '1 day')::date)::text,
      'retention_days',
      10,
      'expiry_enabled',
      false
    )
  );
$$;

grant execute on function public.get_video_retention_config() to anon, authenticated, service_role;

create or replace function public.video_retention_expires_at(p_published_at timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cfg jsonb;
  v_days integer;
  v_policy_start date;
  v_policy_expiry timestamptz;
begin
  if p_published_at is null then
    return null;
  end if;

  v_cfg := public.get_video_retention_config();
  v_days := greatest(1, coalesce((v_cfg->>'retention_days')::integer, 10));
  v_policy_start := coalesce(
    (v_cfg->>'policy_start_jst')::date,
    (timezone('Asia/Tokyo', now()))::date
  );
  v_policy_expiry :=
    (v_policy_start::timestamp + make_interval(days => v_days))
    at time zone 'Asia/Tokyo';

  return greatest(
    p_published_at + make_interval(days => v_days),
    v_policy_expiry
  );
end;
$$;

grant execute on function public.video_retention_expires_at(timestamptz) to anon, authenticated, service_role;

create or replace function public.list_videos_for_retention_expiry()
returns table (
  video_id uuid,
  user_id uuid,
  title text,
  published_at timestamptz,
  expires_at timestamptz,
  video_url text,
  thumbnail_url text,
  bgm_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id as video_id,
    v.user_id,
    v.title,
    v.published_at,
    public.video_retention_expires_at(v.published_at) as expires_at,
    v.video_url,
    v.thumbnail_url,
    v.bgm_url
  from public.videos v
  where v.status = 'published'::public.video_status
    and v.published_at is not null
    and public.video_retention_expires_at(v.published_at) <= timezone('Asia/Tokyo', now())
  order by v.published_at asc;
$$;

grant execute on function public.list_videos_for_retention_expiry() to service_role;

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
  v_retention_pending integer := 0;
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
    'date_jst', v_today,
    'ran_at_jst', timezone('Asia/Tokyo', now())
  );
end;
$$;

grant execute on function public.run_daily_morning_job() to service_role;
