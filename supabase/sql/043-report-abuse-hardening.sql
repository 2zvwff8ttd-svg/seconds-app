-- N4: Report brigade / auto-hide abuse hardening.
-- A) Rate-limit reports: 10/hour, 30/day
-- B) Weighted auto-hide: <7d account = 0.25, >=7d = 1.0; threshold 10
-- C) Seal direct INSERT on reports (submit_report RPC only)
-- Apply in SQL Editor (same as migrations/043_report_abuse_hardening.sql).

-- ---------------------------------------------------------------------------
-- Index for report rate-limit counts
-- ---------------------------------------------------------------------------
create index if not exists reports_reporter_id_created_at_idx
  on public.reports (reporter_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Extend assert_user_rate_limit with 'report'
-- ---------------------------------------------------------------------------
create or replace function public.assert_user_rate_limit(
  p_action text,
  p_window interval,
  p_max integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_max is null or p_max < 1 then
    raise exception 'Invalid rate limit max';
  end if;

  if p_action = 'comment' then
    select count(*)::integer into v_count
    from public.comments c
    where c.user_id = v_uid
      and c.created_at > now() - p_window;
  elsif p_action = 'dm' then
    select count(*)::integer into v_count
    from public.dm_messages m
    where m.sender_id = v_uid
      and m.created_at > now() - p_window;
  elsif p_action = 'follow' then
    select count(*)::integer into v_count
    from public.follows f
    where f.follower_id = v_uid
      and f.created_at > now() - p_window;
  elsif p_action = 'report' then
    select count(*)::integer into v_count
    from public.reports r
    where r.reporter_id = v_uid
      and r.created_at > now() - p_window;
  else
    raise exception 'Unknown rate limit action: %', p_action;
  end if;

  if v_count >= p_max then
    raise exception 'rate_limit_exceeded'
      using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.assert_user_rate_limit(text, interval, integer) is
  'Rejects when the current user exceeds p_max writes of p_action within p_window.';

revoke all on function public.assert_user_rate_limit(text, interval, integer) from public;

-- ---------------------------------------------------------------------------
-- B) Weighted auto-hide
-- ---------------------------------------------------------------------------
create or replace function public.reports_apply_auto_hide(
  p_target_type public.report_target_type,
  p_target_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_weight numeric;
begin
  select coalesce(sum(
    case
      when p.created_at > now() - interval '7 days' then 0.25
      else 1.0
    end
  ), 0)
  into v_weight
  from public.reports r
  join public.profiles p on p.id = r.reporter_id
  where r.target_type = p_target_type
    and r.target_id = p_target_id
    and r.status = 'pending';

  if v_weight < 10 then
    return;
  end if;

  case p_target_type
    when 'video' then
      update public.videos
      set moderation_hidden = true
      where id = p_target_id;
    when 'comment' then
      update public.comments
      set moderation_hidden = true
      where id = p_target_id;
    when 'profile' then
      update public.profiles
      set moderation_hidden = true
      where id = p_target_id;
  end case;
end;
$$;

comment on function public.reports_apply_auto_hide(public.report_target_type, uuid) is
  'Hides target when pending report weight sum >= 10 (mature reporter=1.0, <7d=0.25).';

-- ---------------------------------------------------------------------------
-- submit_report: rate limits + existing ban / unique checks
-- ---------------------------------------------------------------------------
create or replace function public.submit_report(
  p_target_type public.report_target_type,
  p_target_id uuid,
  p_reason public.report_reason,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter uuid := auth.uid();
  v_owner uuid;
  v_trimmed text := nullif(trim(p_details), '');
begin
  perform public.assert_not_banned();
  perform public.assert_user_rate_limit('report', interval '1 hour', 10);
  perform public.assert_user_rate_limit('report', interval '1 day', 30);

  case p_target_type
    when 'video' then
      select v.user_id into v_owner
      from public.videos v
      where v.id = p_target_id;
      if not found then
        raise exception 'Video not found';
      end if;
    when 'comment' then
      select c.user_id into v_owner
      from public.comments c
      where c.id = p_target_id;
      if not found then
        raise exception 'Comment not found';
      end if;
    when 'profile' then
      v_owner := p_target_id;
      if not exists (select 1 from public.profiles p where p.id = p_target_id) then
        raise exception 'Profile not found';
      end if;
  end case;

  if v_owner = v_reporter then
    raise exception 'Cannot report your own content';
  end if;

  insert into public.reports (
    reporter_id, target_type, target_id, reason, details
  )
  values (
    v_reporter, p_target_type, p_target_id, p_reason, v_trimmed
  );

  perform public.reports_apply_auto_hide(p_target_type, p_target_id);

  return jsonb_build_object(
    'target_type', p_target_type,
    'target_id', p_target_id,
    'reason', p_reason
  );
exception
  when unique_violation then
    raise exception 'Already reported';
end;
$$;

revoke all on function public.submit_report(public.report_target_type, uuid, public.report_reason, text) from public;
grant execute on function public.submit_report(public.report_target_type, uuid, public.report_reason, text) to authenticated;

-- ---------------------------------------------------------------------------
-- C) Seal direct client INSERT (RPC-only; DEFINER bypasses RLS)
-- ---------------------------------------------------------------------------
drop policy if exists "reports_insert_own" on public.reports;

notify pgrst, 'reload schema';
