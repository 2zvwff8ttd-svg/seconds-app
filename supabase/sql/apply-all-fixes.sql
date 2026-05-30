-- =============================================================================
-- ?Seconds — 投稿エラー一括修正（SQL Editor に全文コピー → Run）
-- ・status / publish_at / published_at カラム追加
-- ・RLS: 自分の動画を INSERT / SELECT（insert 後の返却用）
-- ・profiles 未作成ユーザーの補完
-- =============================================================================

-- --- 004: status カラム ---
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

update public.videos
set
  status = 'published'::public.video_status,
  published_at = coalesce(published_at, created_at),
  publish_at = coalesce(publish_at, created_at)
where published_at is null;

create index if not exists videos_status_publish_at_idx
  on public.videos (status, publish_at);

create index if not exists videos_published_at_idx
  on public.videos (published_at desc);

create or replace function public.set_video_publish_at()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_created_jst timestamp;
  v_publish_jst timestamp;
begin
  v_created_jst := timezone('Asia/Tokyo', coalesce(new.created_at, now()));
  v_publish_jst :=
    date_trunc('day', v_created_jst)
    + interval '1 day'
    + interval '7 hours';
  new.publish_at := v_publish_jst at time zone 'Asia/Tokyo';
  if new.status is null then
    new.status := 'pending'::public.video_status;
  end if;
  if new.status = 'published'::public.video_status and new.published_at is null then
    new.published_at := timezone('Asia/Tokyo', now());
  end if;
  return new;
end;
$$;

drop trigger if exists videos_set_publish_at on public.videos;
create trigger videos_set_publish_at
  before insert on public.videos
  for each row
  execute function public.set_video_publish_at();

create or replace function public.can_view_video(p_video_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
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

create or replace function public.insert_pending_video(
  p_id uuid,
  p_user_id uuid,
  p_video_url text,
  p_thumbnail_url text,
  p_title text,
  p_duration_seconds integer,
  p_visibility public.video_visibility,
  p_country text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.videos;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Unauthorized';
  end if;
  insert into public.videos (
    id, user_id, video_url, thumbnail_url, title,
    duration_seconds, visibility, country, status
  )
  values (
    p_id, p_user_id, p_video_url, p_thumbnail_url, p_title,
    p_duration_seconds, p_visibility, p_country, 'pending'::public.video_status
  )
  returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'publish_at', v_row.publish_at);
end;
$$;

revoke all on function public.insert_pending_video(uuid, uuid, text, text, text, integer, public.video_visibility, text) from public;
grant execute on function public.insert_pending_video(uuid, uuid, text, text, text, integer, public.video_visibility, text) to authenticated;

-- --- 005: profiles + RLS ---
insert into public.profiles (id, username, country)
select
  u.id,
  'user_' || left(replace(u.id::text, '-', ''), 12),
  coalesce(nullif(trim(u.raw_user_meta_data->>'country'), ''), 'JP')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict do nothing;

alter table public.videos enable row level security;

drop policy if exists "videos_select_visible" on public.videos;
drop policy if exists "videos_select_own" on public.videos;
drop policy if exists "videos_insert_own" on public.videos;
drop policy if exists "Users can insert own videos" on public.videos;
drop policy if exists "videos_update_own" on public.videos;
drop policy if exists "videos_delete_own" on public.videos;

create policy "videos_select_own"
  on public.videos for select to authenticated
  using (auth.uid() = user_id);

create policy "videos_select_visible"
  on public.videos for select to authenticated, anon
  using (public.can_view_video(id));

create policy "Users can insert own videos"
  on public.videos for insert to authenticated
  with check (auth.uid() = user_id);

create policy "videos_update_own"
  on public.videos for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "videos_delete_own"
  on public.videos for delete to authenticated
  using (auth.uid() = user_id);

-- clips: 自分の動画への clip 追加を確実に
drop policy if exists "Users can insert own clips" on public.clips;
drop policy if exists "clips_insert_own_video" on public.clips;

create policy "Users can insert own clips"
  on public.clips for insert to authenticated
  with check (
    exists (
      select 1 from public.videos v
      where v.id = clips.video_id and v.user_id = auth.uid()
    )
  );

grant usage on schema public to anon, authenticated;
grant select on public.videos to anon, authenticated;
grant insert, update, delete on public.videos to authenticated;
grant insert on public.clips to authenticated;
grant usage on type public.video_visibility to anon, authenticated;
grant usage on type public.video_status to anon, authenticated;

notify pgrst, 'reload schema';

select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'videos'
  and column_name in ('status', 'publish_at', 'published_at');

select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'videos'
order by policyname;
