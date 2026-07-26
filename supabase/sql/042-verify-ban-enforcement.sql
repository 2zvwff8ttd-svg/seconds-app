-- N3 verify: banned user cannot insert_pending_video; normal user can.
-- Temporarily flips is_banned on a non-admin profile, then restores.

do $$
declare
  v_user uuid;
  v_was_banned boolean;
  v_rejected boolean := false;
  v_id uuid := gen_random_uuid();
begin
  select id, is_banned into v_user, v_was_banned
  from public.profiles
  where coalesce(is_admin, false) = false
  order by created_at
  limit 1;

  if v_user is null then
    raise exception 'need a non-admin profile';
  end if;

  update public.profiles set is_banned = true where id = v_user;

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );

  begin
    perform public.insert_pending_video(
      v_id,
      v_user,
      'https://example.invalid/n3.mp4',
      'https://example.invalid/n3.jpg',
      'n3-ban-test',
      1,
      'public'::public.video_visibility,
      'JP',
      null
    );
  exception
    when others then
      if sqlerrm like '%Banned%' then
        v_rejected := true;
      else
        update public.profiles set is_banned = v_was_banned where id = v_user;
        raise;
      end if;
  end;

  -- cleanup any accidental row
  delete from public.videos where id = v_id;
  update public.profiles set is_banned = v_was_banned where id = v_user;

  if not v_rejected then
    raise exception 'VERIFY_FAIL: banned user was allowed to post';
  end if;
end;
$$;

-- Normal (unbanned) path still works
do $$
declare
  v_user uuid;
  v_id uuid := gen_random_uuid();
  v_ok boolean := false;
begin
  select id into v_user
  from public.profiles
  where coalesce(is_banned, false) = false
    and coalesce(is_admin, false) = false
  order by created_at
  limit 1;

  if v_user is null then
    raise notice 'SKIP normal post: no unbanned non-admin';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text,
    true
  );

  perform public.insert_pending_video(
    v_id,
    v_user,
    'https://example.invalid/n3-ok.mp4',
    'https://example.invalid/n3-ok.jpg',
    'n3-ok',
    1,
    'public'::public.video_visibility,
    'JP',
    null
  );
  v_ok := true;
  delete from public.videos where id = v_id;

  if not v_ok then
    raise exception 'VERIFY_FAIL: normal user could not post';
  end if;
end;
$$;

select
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='assert_not_banned') as assert_fn,
  'VERIFY_OK' as result;
