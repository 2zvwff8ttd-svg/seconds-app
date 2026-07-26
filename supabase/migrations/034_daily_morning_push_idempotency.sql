-- Ensure the daily job and its APNs delivery remain single-shot when a cron
-- schedule retries or more than one scheduler invokes daily-morning.

create table if not exists public.daily_morning_job_runs (
  run_date date primary key,
  completed_at timestamptz not null default now()
);

create table if not exists public.morning_digest_push_deliveries (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  push_token_id uuid not null references public.push_device_tokens (id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (notification_id, push_token_id)
);

alter table public.morning_digest_push_deliveries enable row level security;

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
  insert into public.daily_morning_job_runs (run_date)
  values (v_today)
  on conflict do nothing;

  if not found then
    return jsonb_build_object(
      'already_ran', true,
      'notifications', 0,
      'date_jst', v_today,
      'ran_at_jst', timezone('Asia/Tokyo', now())
    );
  end if;

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
    'already_ran', false,
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

notify pgrst, 'reload schema';
