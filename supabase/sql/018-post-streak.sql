-- 連続投稿ストリーク + ボーナス秒数（SQL Editor 用）
-- supabase/migrations/018_post_streak.sql と同内容

alter table public.profiles
  add column if not exists current_streak integer not null default 0,
  add column if not exists last_post_date date;

alter table public.daily_assignments
  drop constraint if exists daily_assignments_seconds_range;

alter table public.daily_assignments
  add constraint daily_assignments_seconds_range check (
    assigned_seconds between 5 and 60
  );

create or replace function public.random_assigned_seconds(p_streak integer)
returns integer
language plpgsql
volatile
set search_path = public
as $$
begin
  if coalesce(p_streak, 0) >= 10 and mod(p_streak, 10) = 0 then
    return 5 + floor(random() * 56)::int;
  end if;
  return 5 + floor(random() * 26)::int;
end;
$$;

create or replace function public.record_post_streak(p_posting_day date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_streak integer;
  v_last date;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;
  if p_posting_day is null then
    raise exception 'Date is required';
  end if;

  select p.current_streak, p.last_post_date
  into v_streak, v_last
  from public.profiles p
  where p.id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if v_last = p_posting_day then
    return v_streak;
  end if;

  if v_last = p_posting_day - 1 then
    v_streak := coalesce(v_streak, 0) + 1;
  else
    v_streak := 1;
  end if;

  update public.profiles
  set current_streak = v_streak, last_post_date = p_posting_day
  where id = v_user_id;

  return v_streak;
end;
$$;

grant execute on function public.record_post_streak(date) to authenticated;

create or replace function public.ensure_daily_assignment(p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_streak integer := 0;
  v_seconds integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;
  if p_date is null then
    raise exception 'Date is required';
  end if;

  select da.assigned_seconds into v_seconds
  from public.daily_assignments da
  where da.user_id = v_user_id and da.date = p_date;

  if found then
    return v_seconds;
  end if;

  select coalesce(p.current_streak, 0) into v_streak
  from public.profiles p where p.id = v_user_id;

  v_seconds := public.random_assigned_seconds(v_streak);

  insert into public.daily_assignments (user_id, assigned_seconds, date)
  values (v_user_id, v_seconds, p_date)
  on conflict (user_id, date) do nothing;

  select da.assigned_seconds into v_seconds
  from public.daily_assignments da
  where da.user_id = v_user_id and da.date = p_date;

  if not found then
    raise exception 'Failed to create daily assignment';
  end if;

  return v_seconds;
end;
$$;

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
  v_message text;
  v_bonus boolean;
begin
  with published as (
    update public.videos
    set
      status = 'published'::public.video_status,
      published_at = coalesce(published_at, timezone('Asia/Tokyo', now()))
    where status = 'pending'::public.video_status
    returning user_id, id
  )
  select count(*) into v_published_count from published;

  for v_user in
    select p.id, coalesce(p.current_streak, 0) as current_streak
    from public.profiles p
  loop
    v_seconds := public.random_assigned_seconds(v_user.current_streak);
    v_bonus := v_user.current_streak >= 10 and mod(v_user.current_streak, 10) = 0;

    insert into public.daily_assignments (user_id, assigned_seconds, date)
    values (v_user.id, v_seconds, v_today)
    on conflict (user_id, date) do update
      set assigned_seconds = excluded.assigned_seconds;

    v_assignment_count := v_assignment_count + 1;

    select exists (
      select 1 from public.videos v
      where v.user_id = v_user.id
        and v.status = 'published'::public.video_status
        and (timezone('Asia/Tokyo', v.published_at))::date = v_today
    ) into v_had_video_published;

    if v_had_video_published then
      v_message := case when v_bonus then
        format('昨日の動画が公開されました！連続投稿ボーナスで今日の撮影時間は%s秒です。', v_seconds)
      else
        format('昨日の動画が公開されました！今日の撮影時間は%s秒です。', v_seconds)
      end;
    else
      v_message := case when v_bonus then
        format('連続投稿ボーナス！今日の撮影時間は%s秒です。', v_seconds)
      else
        format('今日の撮影時間は%s秒です。', v_seconds)
      end;
    end if;

    insert into public.notifications (user_id, type, title, body)
    values (v_user.id, 'morning_digest', v_message, v_message);

    v_notification_count := v_notification_count + 1;
  end loop;

  return jsonb_build_object(
    'published_videos', v_published_count,
    'assignments', v_assignment_count,
    'notifications', v_notification_count,
    'date_jst', v_today,
    'ran_at_jst', timezone('Asia/Tokyo', now())
  );
end;
$$;

notify pgrst, 'reload schema';
