-- =============================================================================
-- videos.status 完全修正（RPC + カラム + スキーマキャッシュ更新）
-- Supabase Dashboard → SQL Editor → 全文コピー → Run
-- =============================================================================

-- 1. enum
do $$
begin
  create type public.video_status as enum ('pending', 'published');
exception
  when duplicate_object then null;
end $$;

-- 2. columns
alter table public.videos
  add column if not exists status public.video_status not null default 'pending';

alter table public.videos
  add column if not exists publish_at timestamptz;

alter table public.videos
  add column if not exists published_at timestamptz;

-- 3. backfill
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

-- 4. publish_at trigger
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

-- 5. RLS helper
create or replace function public.can_view_video(p_video_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
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
  where v.id = p_video_id;
$$;

-- 6. RPC: PostgREST スキーマキャッシュに依存せず pending 動画を INSERT
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
    id,
    user_id,
    video_url,
    thumbnail_url,
    title,
    duration_seconds,
    visibility,
    country,
    status
  )
  values (
    p_id,
    p_user_id,
    p_video_url,
    p_thumbnail_url,
    p_title,
    p_duration_seconds,
    p_visibility,
    p_country,
    'pending'::public.video_status
  )
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'publish_at', v_row.publish_at
  );
end;
$$;

revoke all on function public.insert_pending_video(uuid, uuid, text, text, text, integer, public.video_visibility, text) from public;
grant execute on function public.insert_pending_video(uuid, uuid, text, text, text, integer, public.video_visibility, text) to authenticated;

-- 7. Force PostgREST schema reload (important!)
notify pgrst, 'reload schema';

-- 8. Verify
select column_name, udt_name, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'videos'
  and column_name in ('status', 'publish_at', 'published_at');

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'insert_pending_video';
