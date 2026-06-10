-- =============================================================================
-- 当日 daily_assignments のオンデマンド補完 RPC（SQL Editor で実行）
-- 018_post_streak 適用後: ストリークに応じた秒数（10の倍数日は5〜60秒）
-- =============================================================================

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
  where da.user_id = v_user_id
    and da.date = p_date;

  if found then
    return v_seconds;
  end if;

  select coalesce(p.current_streak, 0) into v_streak
  from public.profiles p
  where p.id = v_user_id;

  v_seconds := public.random_assigned_seconds(v_streak);

  insert into public.daily_assignments (user_id, assigned_seconds, date)
  values (v_user_id, v_seconds, p_date)
  on conflict (user_id, date) do nothing;

  select da.assigned_seconds into v_seconds
  from public.daily_assignments da
  where da.user_id = v_user_id
    and da.date = p_date;

  if not found then
    raise exception 'Failed to create daily assignment';
  end if;

  return v_seconds;
end;
$$;

grant execute on function public.ensure_daily_assignment(date) to authenticated;

notify pgrst, 'reload schema';
