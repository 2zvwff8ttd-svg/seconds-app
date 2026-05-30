-- =============================================================================
-- ?Seconds — Initial schema + RLS
-- Run in Supabase Dashboard → SQL Editor, or via: supabase db push
-- =============================================================================

-- Extensions
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.video_visibility as enum ('public', 'followers_only');

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  bio text,
  avatar_url text,
  country text not null default 'JP',
  created_at timestamptz not null default now(),
  constraint profiles_username_length check (char_length(username) between 2 and 30),
  constraint profiles_username_format check (username ~ '^[a-zA-Z0-9_]+$')
);

create unique index profiles_username_key on public.profiles (lower(username));

comment on table public.profiles is 'User public profile linked to auth.users';

-- -----------------------------------------------------------------------------
-- videos
-- -----------------------------------------------------------------------------
create table public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  video_url text not null,
  thumbnail_url text,
  title text not null default '',
  duration_seconds integer not null default 0,
  visibility public.video_visibility not null default 'public',
  country text not null,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint videos_duration_non_negative check (duration_seconds >= 0),
  constraint videos_view_count_non_negative check (view_count >= 0)
);

create index videos_user_id_created_at_idx on public.videos (user_id, created_at desc);
create index videos_country_created_at_idx on public.videos (country, created_at desc);
create index videos_visibility_idx on public.videos (visibility);

-- -----------------------------------------------------------------------------
-- clips
-- -----------------------------------------------------------------------------
create table public.clips (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos (id) on delete cascade,
  clip_url text not null,
  clip_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint clips_order_non_negative check (clip_order >= 0),
  constraint clips_unique_order_per_video unique (video_id, clip_order)
);

create index clips_video_id_idx on public.clips (video_id, clip_order);

-- -----------------------------------------------------------------------------
-- likes
-- -----------------------------------------------------------------------------
create table public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint likes_unique_user_video unique (user_id, video_id)
);

create index likes_video_id_idx on public.likes (video_id);
create index likes_user_id_idx on public.likes (user_id);

-- -----------------------------------------------------------------------------
-- comments
-- -----------------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  video_id uuid not null references public.videos (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  constraint comments_content_not_empty check (char_length(trim(content)) > 0)
);

create index comments_video_id_created_at_idx on public.comments (video_id, created_at desc);

-- -----------------------------------------------------------------------------
-- follows
-- -----------------------------------------------------------------------------
create table public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint follows_unique_pair unique (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);

create index follows_follower_id_idx on public.follows (follower_id);
create index follows_following_id_idx on public.follows (following_id);

-- -----------------------------------------------------------------------------
-- daily_assignments
-- -----------------------------------------------------------------------------
create table public.daily_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  assigned_seconds integer not null,
  date date not null,
  created_at timestamptz not null default now(),
  constraint daily_assignments_seconds_range check (
    assigned_seconds between 5 and 30
  ),
  constraint daily_assignments_unique_user_date unique (user_id, date)
);

create index daily_assignments_user_id_date_idx on public.daily_assignments (user_id, date desc);

-- =============================================================================
-- Helper functions (RLS)
-- =============================================================================

-- Returns true if the current user follows the given profile
create or replace function public.is_following(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.follows f
    where f.follower_id = auth.uid()
      and f.following_id = target_user_id
  );
$$;

-- Returns true if the current user may view the given video
create or replace function public.can_view_video(p_video_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    v.user_id = auth.uid()
    or v.visibility = 'public'::public.video_visibility
    or (
      v.visibility = 'followers_only'::public.video_visibility
      and auth.uid() is not null
      and public.is_following(v.user_id)
    )
  from public.videos v
  where v.id = p_video_id;
$$;

-- =============================================================================
-- Triggers
-- =============================================================================

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  final_username text;
  suffix int := 0;
begin
  base_username := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    'user_' || left(replace(new.id::text, '-', ''), 8)
  );
  final_username := base_username;

  while exists (select 1 from public.profiles where lower(username) = lower(final_username)) loop
    suffix := suffix + 1;
    final_username := base_username || '_' || suffix;
  end loop;

  insert into public.profiles (id, username, country)
  values (
    new.id,
    final_username,
    coalesce(nullif(trim(new.raw_user_meta_data->>'country'), ''), 'JP')
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.clips enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.daily_assignments enable row level security;

-- -----------------------------------------------------------------------------
-- profiles policies
-- -----------------------------------------------------------------------------
create policy "profiles_select_public"
  on public.profiles
  for select
  to authenticated, anon
  using (true);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- videos policies
-- -----------------------------------------------------------------------------
create policy "videos_select_visible"
  on public.videos
  for select
  to authenticated, anon
  using (public.can_view_video(id));

create policy "videos_insert_own"
  on public.videos
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "videos_update_own"
  on public.videos
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "videos_delete_own"
  on public.videos
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- clips policies
-- -----------------------------------------------------------------------------
create policy "clips_select_if_video_visible"
  on public.clips
  for select
  to authenticated, anon
  using (
    exists (
      select 1
      from public.videos v
      where v.id = clips.video_id
        and public.can_view_video(v.id)
    )
  );

create policy "clips_insert_own_video"
  on public.clips
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.videos v
      where v.id = clips.video_id
        and v.user_id = auth.uid()
    )
  );

create policy "clips_update_own_video"
  on public.clips
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.videos v
      where v.id = clips.video_id
        and v.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.videos v
      where v.id = clips.video_id
        and v.user_id = auth.uid()
    )
  );

create policy "clips_delete_own_video"
  on public.clips
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.videos v
      where v.id = clips.video_id
        and v.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- likes policies
-- -----------------------------------------------------------------------------
create policy "likes_select_if_video_visible"
  on public.likes
  for select
  to authenticated, anon
  using (
    exists (
      select 1
      from public.videos v
      where v.id = likes.video_id
        and public.can_view_video(v.id)
    )
  );

create policy "likes_insert_own"
  on public.likes
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.videos v
      where v.id = likes.video_id
        and public.can_view_video(v.id)
    )
  );

create policy "likes_delete_own"
  on public.likes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- comments policies
-- -----------------------------------------------------------------------------
create policy "comments_select_if_video_visible"
  on public.comments
  for select
  to authenticated, anon
  using (
    exists (
      select 1
      from public.videos v
      where v.id = comments.video_id
        and public.can_view_video(v.id)
    )
  );

create policy "comments_insert_own"
  on public.comments
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.videos v
      where v.id = comments.video_id
        and public.can_view_video(v.id)
    )
  );

create policy "comments_update_own"
  on public.comments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "comments_delete_own"
  on public.comments
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- follows policies
-- -----------------------------------------------------------------------------
create policy "follows_select_public"
  on public.follows
  for select
  to authenticated, anon
  using (true);

create policy "follows_insert_own"
  on public.follows
  for insert
  to authenticated
  with check (auth.uid() = follower_id);

create policy "follows_delete_own"
  on public.follows
  for delete
  to authenticated
  using (auth.uid() = follower_id);

-- -----------------------------------------------------------------------------
-- daily_assignments policies
-- (INSERT はバックエンド / cron の service_role 推奨)
-- -----------------------------------------------------------------------------
create policy "daily_assignments_select_own"
  on public.daily_assignments
  for select
  to authenticated
  using (auth.uid() = user_id);

-- =============================================================================
-- Grants
-- =============================================================================
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;

grant usage on type public.video_visibility to anon, authenticated;
