-- Supabase SQL Editor: run this once to enable self-service account deletion.
-- Same as supabase/migrations/022_delete_own_account.sql
--
-- Edge Function delete-account calls this RPC before auth.admin.deleteUser.
-- Cleans reports with no FK on target_id; DB rows cascade from auth.users delete.

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

  -- Reports about this profile (target_id has no FK)
  delete from public.reports
  where target_type = 'profile'
    and target_id = v_user_id;

  -- Reports about this user's videos
  delete from public.reports
  where target_type = 'video'
    and target_id in (
      select v.id
      from public.videos v
      where v.user_id = v_user_id
    );

  -- Reports about this user's comments
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
