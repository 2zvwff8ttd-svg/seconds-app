-- 通報・モデレーション・管理者

create type public.report_reason as enum (
  'spam',
  'violence',
  'sexual',
  'hate_speech',
  'other'
);

create type public.report_target_type as enum ('video', 'comment', 'profile');

create type public.report_status as enum ('pending', 'dismissed', 'banned');

alter table public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists is_banned boolean not null default false,
  add column if not exists moderation_hidden boolean not null default false;

alter table public.videos
  add column if not exists moderation_hidden boolean not null default false;

alter table public.comments
  add column if not exists moderation_hidden boolean not null default false;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type public.report_target_type not null,
  target_id uuid not null,
  reason public.report_reason not null,
  details text,
  status public.report_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint reports_unique_reporter_target unique (reporter_id, target_type, target_id)
);

create index reports_target_idx
  on public.reports (target_type, target_id, status, created_at desc);
create index reports_status_created_idx
  on public.reports (status, created_at desc);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.is_banned_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.is_banned from public.profiles p where p.id = p_user_id),
    false
  );
$$;

-- 動画閲覧可否（モデレーション・BAN 反映）
create or replace function public.can_view_video(p_video_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    v.user_id = auth.uid()
    or public.is_admin()
    or (
      not v.moderation_hidden
      and not public.is_banned_user(v.user_id)
      and not exists (
        select 1
        from public.profiles p
        where p.id = v.user_id
          and p.moderation_hidden
      )
      and v.status = 'published'::public.video_status
      and (
        v.visibility = 'public'::public.video_visibility
        or (
          v.visibility = 'followers_only'::public.video_visibility
          and auth.uid() is not null
          and public.is_following(v.user_id)
        )
      )
    )
  from public.videos v
  where v.id = p_video_id;
$$;

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
  v_count integer;
begin
  select count(*)::integer into v_count
  from public.reports r
  where r.target_type = p_target_type
    and r.target_id = p_target_id
    and r.status = 'pending';

  if v_count < 10 then
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
  if v_reporter is null then
    raise exception 'Unauthorized';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id = v_reporter and p.is_banned
  ) then
    raise exception 'Account suspended';
  end if;

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

create or replace function public.admin_moderation_action(
  p_target_type public.report_target_type,
  p_target_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  if p_action not in ('dismiss', 'ban') then
    raise exception 'Invalid action';
  end if;

  case p_target_type
    when 'video' then
      select v.user_id into v_user_id
      from public.videos v
      where v.id = p_target_id;
    when 'comment' then
      select c.user_id into v_user_id
      from public.comments c
      where c.id = p_target_id;
    when 'profile' then
      v_user_id := p_target_id;
  end case;

  if v_user_id is null then
    raise exception 'Target not found';
  end if;

  if p_action = 'dismiss' then
    case p_target_type
      when 'video' then
        update public.videos
        set moderation_hidden = false
        where id = p_target_id;
      when 'comment' then
        update public.comments
        set moderation_hidden = false
        where id = p_target_id;
      when 'profile' then
        update public.profiles
        set moderation_hidden = false
        where id = p_target_id;
    end case;

    update public.reports
    set status = 'dismissed'
    where target_type = p_target_type
      and target_id = p_target_id
      and status = 'pending';
  else
    update public.profiles
    set is_banned = true, moderation_hidden = true
    where id = v_user_id;

    update public.reports
    set status = 'banned'
    where target_type = p_target_type
      and target_id = p_target_id
      and status = 'pending';
  end if;

  return jsonb_build_object(
    'action', p_action,
    'target_type', p_target_type,
    'target_id', p_target_id,
    'user_id', v_user_id
  );
end;
$$;

revoke all on function public.submit_report(public.report_target_type, uuid, public.report_reason, text) from public;
grant execute on function public.submit_report(public.report_target_type, uuid, public.report_reason, text) to authenticated;
revoke all on function public.admin_moderation_action(public.report_target_type, uuid, text) from public;
grant execute on function public.admin_moderation_action(public.report_target_type, uuid, text) to authenticated;

alter table public.reports enable row level security;

create policy "reports_insert_own"
  on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());

create policy "reports_select_admin"
  on public.reports for select to authenticated
  using (public.is_admin());

create policy "profiles_select_admin"
  on public.profiles for select to authenticated
  using (public.is_admin());

drop policy if exists "videos_select_admin" on public.videos;
create policy "videos_select_admin"
  on public.videos for select to authenticated
  using (public.is_admin());

drop policy if exists "comments_select_admin" on public.comments;
create policy "comments_select_admin"
  on public.comments for select to authenticated
  using (public.is_admin());

drop policy if exists "comments_select_if_video_visible" on public.comments;
create policy "comments_select_if_video_visible"
  on public.comments for select to authenticated, anon
  using (
    public.is_admin()
    or (
      not moderation_hidden
      and exists (
        select 1
        from public.videos v
        where v.id = comments.video_id
          and public.can_view_video(v.id)
      )
    )
  );

drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public"
  on public.profiles for select to authenticated, anon
  using (
    public.is_admin()
    or (
      not is_banned
      and not moderation_hidden
    )
    or id = auth.uid()
  );

drop policy if exists "Users can insert own videos" on public.videos;
create policy "Users can insert own videos"
  on public.videos for insert to authenticated
  with check (
    auth.uid() = user_id
    and not public.is_banned_user(auth.uid())
  );

notify pgrst, 'reload schema';

-- 初回管理者の付与例（自分の user id に置き換えて実行）:
-- update public.profiles set is_admin = true where id = 'YOUR-USER-UUID';
