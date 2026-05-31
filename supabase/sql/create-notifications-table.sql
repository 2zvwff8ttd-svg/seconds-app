-- =============================================================================
-- notifications テーブル作成（SQL Editor 用・冪等）
--
-- 実行順（どちらか）:
--   A) 1回で済ませる → setup-notifications-full.sql
--   B) 2回に分ける → 1. このファイル → 2. 007-social-notifications.sql
--
-- 前提: public.profiles が存在すること（001_initial_schema.sql 適用後）
-- =============================================================================

-- profiles が無い場合は先に 001 を実行してください
do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'profiles'
  ) then
    raise exception 'public.profiles がありません。先に supabase/migrations/001_initial_schema.sql を実行してください。';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- テーブル
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null default 'morning_digest',
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.notifications is 'ユーザー向け通知（朝のダイジェスト・いいね・コメント・フォロー・メンション）';

-- -----------------------------------------------------------------------------
-- インデックス
-- -----------------------------------------------------------------------------
create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- RLS（クライアント: 自分の通知のみ参照・既読更新）
-- INSERT は DB トリガー / バッチ（security definer）のみ
-- -----------------------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, update on table public.notifications to authenticated;

-- -----------------------------------------------------------------------------
-- PostgREST スキーマキャッシュ更新
-- -----------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- 確認
-- -----------------------------------------------------------------------------
select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'notifications'
order by ordinal_position;

select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'notifications'
order by policyname;
