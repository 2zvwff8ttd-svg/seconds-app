-- =============================================================================
-- 当日 daily_assignments のオンデマンド補完 RPC（SQL Editor で実行）
-- アプリ起動時に割り当てが無いユーザーへ、その場で 5〜30 秒を付与する
-- =============================================================================

create or replace function public.ensure_daily_assignment(p_date date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
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

  v_seconds := 5 + floor(random() * 26)::int;

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

-- 手動テスト（ログイン中の JWT で）:
-- select public.ensure_daily_assignment(current_date);
