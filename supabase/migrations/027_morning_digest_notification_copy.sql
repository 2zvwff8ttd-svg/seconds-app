-- Morning digest notification copy: fixed title/body, no seconds in message.

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
  v_morning_digest_title constant text := '?Seconds';
  v_morning_digest_body constant text :=
    '今日の秒数が届いたよ、何秒だろうね？見てみよ！';
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
    'date_jst', v_today,
    'ran_at_jst', timezone('Asia/Tokyo', now())
  );
end;
$$;

grant execute on function public.run_daily_morning_job() to service_role;
