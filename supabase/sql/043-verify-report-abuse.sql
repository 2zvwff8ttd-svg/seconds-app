-- N4 verify: weighted auto-hide + single submit_report + INSERT sealed.
-- Leaves no rows behind. Safe to re-run.

do $$
declare
  v_owner uuid;
  v_video uuid;
  v_comment uuid := gen_random_uuid();
  v_reporter uuid;
  v_ids uuid[] := '{}';
  v_i int := 0;
  v_hidden boolean;
  v_weight numeric;
  v_mature uuid[];
  v_fresh_ids uuid[] := '{}';
  v_saved_created timestamptz[] := '{}';
  v_uid uuid;
  v_submit_ok boolean := false;
  v_insert_blocked boolean := false;
begin
  -- Target: disposable comment on an existing video
  select v.id, v.user_id into v_video, v_owner
  from public.videos v
  order by v.created_at desc
  limit 1;
  if v_video is null then
    raise exception 'VERIFY_FAIL: no video';
  end if;

  insert into public.comments (id, video_id, user_id, content)
  values (v_comment, v_video, v_owner, 'n4-verify-target');

  -- -----------------------------------------------------------------------
  -- 1) Mature reporters (weight 1.0 each): 10 pending -> hide
  -- -----------------------------------------------------------------------
  select array_agg(p.id)
  into v_mature
  from (
    select id
    from public.profiles
    where created_at <= now() - interval '7 days'
      and id <> v_owner
    order by created_at
    limit 10
  ) p;

  if coalesce(array_length(v_mature, 1), 0) < 10 then
    raise exception 'VERIFY_FAIL: need 10 mature profiles, got %',
      coalesce(array_length(v_mature, 1), 0);
  end if;

  foreach v_uid in array v_mature loop
    insert into public.reports (
      reporter_id, target_type, target_id, reason, status
    ) values (
      v_uid, 'comment', v_comment, 'spam', 'pending'
    );
  end loop;

  select coalesce(sum(
    case when p.created_at > now() - interval '7 days' then 0.25 else 1.0 end
  ), 0)
  into v_weight
  from public.reports r
  join public.profiles p on p.id = r.reporter_id
  where r.target_type = 'comment'
    and r.target_id = v_comment
    and r.status = 'pending';

  if v_weight < 10 then
    raise exception 'VERIFY_FAIL: mature weight expected >=10, got %', v_weight;
  end if;

  perform public.reports_apply_auto_hide('comment', v_comment);

  select moderation_hidden into v_hidden
  from public.comments where id = v_comment;
  if coalesce(v_hidden, false) is not true then
    raise exception 'VERIFY_FAIL: mature weight did not hide';
  end if;

  delete from public.reports
  where target_type = 'comment' and target_id = v_comment;
  update public.comments set moderation_hidden = false where id = v_comment;

  -- -----------------------------------------------------------------------
  -- 2) Fresh-only weight: temporarily age 10 profiles to "new", 10 reports
  --    -> weight 2.5, must NOT hide. Always restore created_at.
  -- -----------------------------------------------------------------------
  select array_agg(p.id), array_agg(p.created_at)
  into v_fresh_ids, v_saved_created
  from (
    select id, created_at
    from public.profiles
    where id <> v_owner
    order by created_at
    limit 10
  ) p;

  begin
    for v_i in 1..array_length(v_fresh_ids, 1) loop
      update public.profiles
      set created_at = now() - interval '1 day'
      where id = v_fresh_ids[v_i];
    end loop;

    foreach v_uid in array v_fresh_ids loop
      insert into public.reports (
        reporter_id, target_type, target_id, reason, status
      ) values (
        v_uid, 'comment', v_comment, 'spam', 'pending'
      );
    end loop;

    select coalesce(sum(
      case when p.created_at > now() - interval '7 days' then 0.25 else 1.0 end
    ), 0)
    into v_weight
    from public.reports r
    join public.profiles p on p.id = r.reporter_id
    where r.target_type = 'comment'
      and r.target_id = v_comment
      and r.status = 'pending';

    if v_weight >= 10 then
      raise exception 'VERIFY_FAIL: fresh weight expected <10, got %', v_weight;
    end if;

    perform public.reports_apply_auto_hide('comment', v_comment);

    select moderation_hidden into v_hidden
    from public.comments where id = v_comment;
    if coalesce(v_hidden, false) then
      raise exception 'VERIFY_FAIL: fresh-only reports incorrectly hid';
    end if;

    delete from public.reports
    where target_type = 'comment' and target_id = v_comment;

    for v_i in 1..array_length(v_fresh_ids, 1) loop
      update public.profiles
      set created_at = v_saved_created[v_i]
      where id = v_fresh_ids[v_i];
    end loop;
  exception
    when others then
      delete from public.reports
      where target_type = 'comment' and target_id = v_comment;
      for v_i in 1..coalesce(array_length(v_fresh_ids, 1), 0) loop
        update public.profiles
        set created_at = v_saved_created[v_i]
        where id = v_fresh_ids[v_i];
      end loop;
      raise;
  end;

  -- -----------------------------------------------------------------------
  -- 3) Normal single submit_report succeeds
  -- -----------------------------------------------------------------------
  select id into v_reporter
  from public.profiles
  where id <> v_owner
    and coalesce(is_banned, false) = false
  order by created_at
  limit 1;

  perform set_config('request.jwt.claim.sub', v_reporter::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_reporter::text, 'role', 'authenticated')::text,
    true
  );

  begin
    perform public.submit_report('comment', v_comment, 'spam', 'n4-verify-one');
    v_submit_ok := true;
  exception
    when others then
      raise exception 'VERIFY_FAIL: submit_report failed: %', sqlerrm;
  end;

  if not exists (
    select 1 from public.reports
    where reporter_id = v_reporter
      and target_type = 'comment'
      and target_id = v_comment
  ) then
    raise exception 'VERIFY_FAIL: report row missing after submit';
  end if;

  delete from public.reports
  where target_type = 'comment' and target_id = v_comment;

  -- -----------------------------------------------------------------------
  -- 4) Direct INSERT as authenticated must fail (no insert policy)
  -- -----------------------------------------------------------------------
  begin
    insert into public.reports (
      reporter_id, target_type, target_id, reason
    ) values (
      v_reporter, 'comment', v_comment, 'other'
    );
  exception
    when insufficient_privilege then
      v_insert_blocked := true;
    when others then
      -- RLS violation typically: new row violates row-level security policy
      if sqlerrm ilike '%row-level security%' or sqlerrm ilike '%permission denied%' then
        v_insert_blocked := true;
      else
        raise;
      end if;
  end;

  -- Force RLS for this check: set role authenticated
  if not v_insert_blocked then
    begin
      set local role authenticated;
      insert into public.reports (
        reporter_id, target_type, target_id, reason
      ) values (
        v_reporter, 'comment', v_comment, 'other'
      );
      reset role;
    exception
      when others then
        v_insert_blocked := true;
        reset role;
    end;
  end if;

  if not v_insert_blocked then
    -- Cleanup accidental row then fail
    delete from public.reports
    where target_type = 'comment' and target_id = v_comment;
    raise exception 'VERIFY_FAIL: direct INSERT was allowed';
  end if;

  delete from public.comments where id = v_comment;

  if not v_submit_ok then
    raise exception 'VERIFY_FAIL: submit not ok';
  end if;
end;
$$;

select 'N4_VERIFY_OK' as result;
