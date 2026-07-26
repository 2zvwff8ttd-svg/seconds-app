-- Verify videos_one_per_posting_day_idx rejects a 2nd insert in the same posting day.
-- Temporarily inserts then deletes; leaves no rows.

do $$
declare
  v_user uuid;
  v_id1 uuid := gen_random_uuid();
  v_id2 uuid := gen_random_uuid();
  v_rejected boolean := false;
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'videos_one_per_posting_day_idx'
  ) then
    raise exception 'videos_one_per_posting_day_idx missing';
  end if;

  select id into v_user
  from public.profiles
  where coalesce(is_banned, false) = false
  order by created_at
  limit 1;

  if v_user is null then
    raise exception 'VERIFY_SKIP: no profile';
  end if;

  insert into public.videos (id, user_id, video_url, title, duration_seconds, country, status)
  values (v_id1, v_user, 'https://example.invalid/n1-a.mp4', 'n1-verify-a', 1, 'JP', 'pending');

  begin
    insert into public.videos (id, user_id, video_url, title, duration_seconds, country, status)
    values (v_id2, v_user, 'https://example.invalid/n1-b.mp4', 'n1-verify-b', 1, 'JP', 'pending');
  exception
    when unique_violation then
      v_rejected := true;
  end;

  delete from public.videos where id in (v_id1, v_id2);

  if not v_rejected then
    raise exception 'VERIFY_FAIL: second insert was allowed';
  end if;
end;
$$;

select 'VERIFY_OK' as result;
