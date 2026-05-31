-- =============================================================================
-- ソーシャル通知（いいね・コメント・フォロー・メンション）+ Realtime
--
-- 実行順（どちらか）:
--   A) 1回で済ませる → setup-notifications-full.sql
--   B) 2回に分ける → 1. create-notifications-table.sql → 2. このファイル
--
-- 前提: public.likes, public.comments, public.follows, public.videos が存在すること
-- 詳細: supabase/migrations/007_social_notifications.sql
-- =============================================================================

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'notifications'
  ) then
    raise exception 'public.notifications がありません。先に supabase/sql/create-notifications-table.sql を実行してください。';
  end if;
end $$;

alter table public.notifications
  add column if not exists actor_id uuid references public.profiles (id) on delete set null,
  add column if not exists video_id uuid references public.videos (id) on delete cascade,
  add column if not exists comment_id uuid references public.comments (id) on delete cascade;

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read = false;

create index if not exists notifications_actor_id_idx
  on public.notifications (actor_id);

create or replace function public.insert_social_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_actor_id uuid default null,
  p_video_id uuid default null,
  p_comment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_user_id = p_actor_id then
    return;
  end if;
  insert into public.notifications (
    user_id, type, title, body, actor_id, video_id, comment_id
  )
  values (
    p_user_id, p_type, p_title, p_body, p_actor_id, p_video_id, p_comment_id
  );
end;
$$;

create or replace function public.notify_on_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_actor_name text;
begin
  select v.user_id into v_owner from public.videos v where v.id = new.video_id;
  if v_owner is null then return new; end if;
  select p.username into v_actor_name from public.profiles p where p.id = new.user_id;
  perform public.insert_social_notification(
    v_owner, 'like',
    coalesce(v_actor_name, 'ユーザー') || ' がいいねしました',
    'あなたの動画にいいねがつきました',
    new.user_id, new.video_id, null
  );
  return new;
end;
$$;

create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
begin
  select p.username into v_actor_name from public.profiles p where p.id = new.follower_id;
  perform public.insert_social_notification(
    new.following_id, 'follow',
    coalesce(v_actor_name, 'ユーザー') || ' がフォローしました',
    '新しいフォロワーがいます',
    new.follower_id, null, null
  );
  return new;
end;
$$;

create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_actor_name text;
  v_mention record;
  v_mentioned_id uuid;
begin
  select v.user_id into v_owner from public.videos v where v.id = new.video_id;
  select p.username into v_actor_name from public.profiles p where p.id = new.user_id;
  if v_owner is not null then
    perform public.insert_social_notification(
      v_owner, 'comment',
      coalesce(v_actor_name, 'ユーザー') || ' がコメントしました',
      left(new.content, 120),
      new.user_id, new.video_id, new.id
    );
  end if;
  for v_mention in
    select distinct lower(m[1]) as uname
    from regexp_matches(new.content, '@([a-zA-Z0-9_]{2,30})', 'g') as m
  loop
    select p.id into v_mentioned_id from public.profiles p
    where lower(p.username) = v_mention.uname limit 1;
    if v_mentioned_id is null or v_mentioned_id = v_owner then continue; end if;
    perform public.insert_social_notification(
      v_mentioned_id, 'mention',
      coalesce(v_actor_name, 'ユーザー') || ' があなたに言及しました',
      left(new.content, 120),
      new.user_id, new.video_id, new.id
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_notify_on_like on public.likes;
create trigger trg_notify_on_like after insert on public.likes
  for each row execute function public.notify_on_like();

drop trigger if exists trg_notify_on_follow on public.follows;
create trigger trg_notify_on_follow after insert on public.follows
  for each row execute function public.notify_on_follow();

drop trigger if exists trg_notify_on_comment on public.comments;
create trigger trg_notify_on_comment after insert on public.comments
  for each row execute function public.notify_on_comment();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

notify pgrst, 'reload schema';
