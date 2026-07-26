-- Rate-limit smoke: seed 20 comments in 1 minute window, assert rejects 21st intent.
do $$
declare
  v_user uuid;
  v_video uuid;
  v_i int;
  v_rejected boolean := false;
  v_ids uuid[] := '{}';
  v_id uuid;
begin
  select id into v_user from public.profiles
  where coalesce(is_banned, false) = false order by created_at limit 1;
  select id into v_video from public.videos order by created_at desc limit 1;
  if v_user is null or v_video is null then
    raise exception 'need profile+video';
  end if;

  -- Make auth.uid() resolve to v_user for this transaction (Supabase JWT GUC)
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );

  for v_i in 1..20 loop
    v_id := gen_random_uuid();
    insert into public.comments (id, video_id, user_id, content)
    values (v_id, v_video, v_user, 'n2-rl-' || v_i);
    v_ids := array_append(v_ids, v_id);
  end loop;

  begin
    perform public.assert_user_rate_limit('comment', interval '1 minute', 20);
  exception
    when others then
      if sqlerrm like '%rate_limit_exceeded%' then
        v_rejected := true;
      else
        raise;
      end if;
  end;

  delete from public.comments where id = any (v_ids);

  if not v_rejected then
    raise exception 'VERIFY_FAIL: rate limit did not fire after 20 comments';
  end if;
end;
$$;

select 'RATE_LIMIT_OK' as result;
