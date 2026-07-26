-- N2 verification (safe: rolls back / deletes test rows)

-- 1) Objects exist
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('assert_user_rate_limit','post_comment','follow_user','unfollow_user','send_dm_message')
  ) as rpc_count,
  (select count(*) from pg_constraint
    where conname in ('comments_content_max_len','dm_messages_body_max_len')
  ) as check_count,
  (select count(*) from pg_policies
    where schemaname='public' and tablename in ('comments','follows')
      and policyname in ('comments_insert_own','follows_insert_own','follows_delete_own')
  ) as closed_policies_still_present;

-- 2) Length CHECK rejects oversize comment (RLS bypass as owner; CHECK still applies)
do $$
declare
  v_user uuid;
  v_video uuid;
  v_rejected boolean := false;
begin
  select id into v_user from public.profiles
  where coalesce(is_banned, false) = false order by created_at limit 1;
  select id into v_video from public.videos order by created_at desc limit 1;
  if v_user is null or v_video is null then
    raise notice 'SKIP length test: need profile+video';
    return;
  end if;
  begin
    insert into public.comments (video_id, user_id, content)
    values (v_video, v_user, repeat('あ', 501));
  exception
    when check_violation then
      v_rejected := true;
  end;
  if not v_rejected then
    delete from public.comments where user_id = v_user and content = repeat('あ', 501);
    raise exception 'VERIFY_FAIL: 501-char comment allowed';
  end if;
  raise notice 'VERIFY_OK: comment max length enforced';
end;
$$;

-- 3) Normal-length comment insert still works at table level (trigger smoke)
do $$
declare
  v_user uuid;
  v_video uuid;
  v_id uuid := gen_random_uuid();
begin
  select id into v_user from public.profiles
  where coalesce(is_banned, false) = false order by created_at limit 1;
  select id into v_video from public.videos order by created_at desc limit 1;
  if v_user is null or v_video is null then
    raise notice 'SKIP normal insert test';
    return;
  end if;
  insert into public.comments (id, video_id, user_id, content)
  values (v_id, v_video, v_user, 'n2-verify-ok');
  delete from public.comments where id = v_id;
  raise notice 'VERIFY_OK: normal comment insert+delete';
end;
$$;

select 'VERIFY_DONE' as result;
