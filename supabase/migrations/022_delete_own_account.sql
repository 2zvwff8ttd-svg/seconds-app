-- Self-service account deletion prep RPC (App Store Guideline 5.1.1(v))

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.is_admin
  ) then
    raise exception '管理者アカウントは自己削除できません';
  end if;

  delete from public.reports
  where target_type = 'profile'
    and target_id = v_user_id;

  delete from public.reports
  where target_type = 'video'
    and target_id in (
      select v.id
      from public.videos v
      where v.user_id = v_user_id
    );

  delete from public.reports
  where target_type = 'comment'
    and target_id in (
      select c.id
      from public.comments c
      where c.user_id = v_user_id
    );
end;
$$;

alter function public.delete_own_account() owner to postgres;
grant execute on function public.delete_own_account() to authenticated;
