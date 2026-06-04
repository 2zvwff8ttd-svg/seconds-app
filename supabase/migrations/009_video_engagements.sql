-- 視聴完了 / 途中離脱などレコメンド用シグナル
create table if not exists public.video_engagements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  watch_outcome text check (watch_outcome in ('completed', 'partial')),
  watch_progress real check (watch_progress is null or (watch_progress >= 0 and watch_progress <= 1)),
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index if not exists video_engagements_user_id_idx
  on public.video_engagements (user_id, updated_at desc);

comment on table public.video_engagements is 'ユーザーごとの視聴シグナル（レコメンド用）';

alter table public.video_engagements enable row level security;

create policy "video_engagements_select_own"
  on public.video_engagements
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "video_engagements_insert_own"
  on public.video_engagements
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "video_engagements_update_own"
  on public.video_engagements
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
