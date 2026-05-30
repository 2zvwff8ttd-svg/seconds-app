-- =============================================================================
-- videos テーブル RLS 修正
-- Supabase Dashboard → SQL Editor → 全文コピー → Run
--
-- 修正内容:
--   1. ログインユーザーが自分の動画を INSERT できる
--   2. INSERT 後の .select() 用に、本人の動画を SELECT できる
--   3. can_view_video を「本人は常に閲覧可」に統一
--   4. profiles 未作成ユーザーへのバックフィル（任意）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. status カラムが無い場合は追加（004 未実行環境向け）
-- -----------------------------------------------------------------------------
do $$
begin
  create type public.video_status as enum ('pending', 'published');
exception
  when duplicate_object then null;
end $$;

alter table public.videos
  add column if not exists status public.video_status not null default 'pending';

alter table public.videos
  add column if not exists publish_at timestamptz;

alter table public.videos
  add column if not exists published_at timestamptz;

-- -----------------------------------------------------------------------------
-- 1. profiles が無い auth ユーザーを補完（FK / RLS 対策）
-- -----------------------------------------------------------------------------
insert into public.profiles (id, username, country)
select
  u.id,
  'user_' || left(replace(u.id::text, '-', ''), 12),
  coalesce(nullif(trim(u.raw_user_meta_data->>'country'), ''), 'JP')
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 2. can_view_video: 本人は常に true、他者は published のみ
-- -----------------------------------------------------------------------------
create or replace function public.can_view_video(p_video_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      (
        select
          v.user_id = auth.uid()
          or (
            v.status = 'published'::public.video_status
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
        where v.id = p_video_id
      ),
      false
    );
$$;

-- -----------------------------------------------------------------------------
-- 3. videos RLS ポリシーを作り直す
-- -----------------------------------------------------------------------------
alter table public.videos enable row level security;

drop policy if exists "videos_select_visible" on public.videos;
drop policy if exists "videos_select_own" on public.videos;
drop policy if exists "videos_insert_own" on public.videos;
drop policy if exists "Users can insert own videos" on public.videos;
drop policy if exists "videos_update_own" on public.videos;
drop policy if exists "videos_delete_own" on public.videos;

-- 本人の動画は pending でも SELECT 可能（PostgREST の insert().select() 対策）
create policy "videos_select_own"
  on public.videos
  as permissive
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- 他者の公開済み動画など
create policy "videos_select_visible"
  on public.videos
  as permissive
  for select
  to authenticated, anon
  using (public.can_view_video(id));

-- ログインユーザーが自分の user_id で投稿
create policy "Users can insert own videos"
  on public.videos
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "videos_update_own"
  on public.videos
  as permissive
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "videos_delete_own"
  on public.videos
  as permissive
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- 4. 権限の再付与
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.videos to anon, authenticated;
grant insert, update, delete on public.videos to authenticated;
grant usage on type public.video_visibility to anon, authenticated;
grant usage on type public.video_status to anon, authenticated;

notify pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- 5. 確認
-- -----------------------------------------------------------------------------
select policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename = 'videos'
order by policyname;
