-- =============================================================================
-- 毎朝 7:00 JST の日次ジョブ（Edge Function から run_daily_morning_job を呼ぶ）
-- =============================================================================

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
begin
  -- 1. pending → published（7時ジョブ時点のすべての pending）
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

  -- 2–4. 全ユーザーに撮影秒数割当 + 通知
  for v_user in select id from public.profiles loop
    v_seconds := 5 + floor(random() * 26)::int; -- 5..30 秒（含む）

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
      v_message := format(
        '昨日の動画が公開されました！今日の撮影時間は%s秒です。',
        v_seconds
      );
      insert into public.notifications (user_id, type, title, body)
      values (v_user.id, 'morning_digest', v_message, v_message);
    else
      v_message := format('今日の撮影時間は%s秒です。', v_seconds);
      insert into public.notifications (user_id, type, title, body)
      values (v_user.id, 'morning_digest', v_message, v_message);
    end if;

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

grant execute on function public.run_daily_morning_job() to service_role;

comment on function public.run_daily_morning_job is
  'Daily 7:00 JST: publish pending videos, assign 5–30s, send morning_digest notifications. Invoked by Edge Function daily-morning.';
