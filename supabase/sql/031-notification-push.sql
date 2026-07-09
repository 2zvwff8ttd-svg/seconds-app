-- =============================================================================
-- 031: Push notification preferences + outbox (social/crown batching)
-- Run ENTIRE file in Supabase SQL Editor after 030-crown-awards.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Per-user push toggles (in-app bell is NOT affected)
-- ---------------------------------------------------------------------------
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  push_morning_digest boolean not null default true,
  push_like boolean not null default true,
  push_comment boolean not null default true,
  push_follow boolean not null default true,
  push_mention boolean not null default true,
  push_crown boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
  on public.notification_preferences for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own"
  on public.notification_preferences for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
  on public.notification_preferences for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on table public.notification_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Push delivery queue (APNs only; bell uses notifications table)
-- ---------------------------------------------------------------------------
create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  push_type text not null,
  actor_id uuid references public.profiles (id) on delete set null,
  video_id uuid references public.videos (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  award_date date,
  bucket_key text not null,
  status text not null default 'pending',
  skip_reason text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint push_outbox_status_check
    check (status in ('pending', 'sent', 'skipped')),
  constraint push_outbox_type_check
    check (push_type in ('like', 'comment', 'follow', 'mention', 'crown'))
);

create index if not exists push_outbox_pending_bucket_idx
  on public.push_outbox (bucket_key, created_at)
  where status = 'pending';

create index if not exists push_outbox_recipient_created_idx
  on public.push_outbox (recipient_user_id, created_at desc);

alter table public.push_outbox enable row level security;

-- No client policies: service_role / security definer only

-- ---------------------------------------------------------------------------
-- 3) Sent log for cooldown / aggregation
-- ---------------------------------------------------------------------------
create table if not exists public.push_send_log (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  push_type text not null,
  bucket_key text not null,
  actor_count integer not null default 1,
  title text not null,
  body text not null,
  sent_at timestamptz not null default now()
);

create index if not exists push_send_log_recipient_sent_idx
  on public.push_send_log (recipient_user_id, sent_at desc);

create index if not exists push_send_log_bucket_sent_idx
  on public.push_send_log (bucket_key, sent_at desc);

alter table public.push_send_log enable row level security;

-- ---------------------------------------------------------------------------
-- 4) Helpers
-- ---------------------------------------------------------------------------
create or replace function public.make_push_bucket_key(
  p_push_type text,
  p_recipient_user_id uuid,
  p_video_id uuid default null,
  p_comment_id uuid default null,
  p_award_date date default null
)
returns text
language plpgsql
immutable
as $$
begin
  case p_push_type
    when 'like' then
      return 'like:' || p_recipient_user_id::text || ':' || coalesce(p_video_id::text, '');
    when 'comment' then
      return 'comment:' || p_recipient_user_id::text || ':' || coalesce(p_video_id::text, '');
    when 'follow' then
      return 'follow:' || p_recipient_user_id::text;
    when 'mention' then
      return 'mention:' || p_recipient_user_id::text || ':' || coalesce(p_comment_id::text, '');
    when 'crown' then
      return 'crown:' || p_recipient_user_id::text || ':' || coalesce(p_award_date::text, '');
    else
      return p_push_type || ':' || p_recipient_user_id::text;
  end case;
end;
$$;

create or replace function public.user_push_enabled(
  p_user_id uuid,
  p_push_type text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prefs public.notification_preferences%rowtype;
begin
  if p_user_id is null then
    return false;
  end if;

  select * into v_prefs
  from public.notification_preferences np
  where np.user_id = p_user_id;

  if not found then
    return true;
  end if;

  case p_push_type
    when 'morning_digest' then return v_prefs.push_morning_digest;
    when 'like' then return v_prefs.push_like;
    when 'comment' then return v_prefs.push_comment;
    when 'follow' then return v_prefs.push_follow;
    when 'mention' then return v_prefs.push_mention;
    when 'crown' then return v_prefs.push_crown;
    else return true;
  end case;
end;
$$;

grant execute on function public.user_push_enabled(uuid, text) to service_role;

create or replace function public.enqueue_push_event(
  p_recipient_user_id uuid,
  p_push_type text,
  p_actor_id uuid default null,
  p_video_id uuid default null,
  p_comment_id uuid default null,
  p_award_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bucket text;
begin
  if p_recipient_user_id is null then
    return;
  end if;

  if p_actor_id is not null and p_recipient_user_id = p_actor_id then
    return;
  end if;

  if p_push_type not in ('like', 'comment', 'follow', 'mention', 'crown') then
    return;
  end if;

  v_bucket := public.make_push_bucket_key(
    p_push_type,
    p_recipient_user_id,
    p_video_id,
    p_comment_id,
    p_award_date
  );

  insert into public.push_outbox (
    recipient_user_id,
    push_type,
    actor_id,
    video_id,
    comment_id,
    award_date,
    bucket_key
  )
  values (
    p_recipient_user_id,
    p_push_type,
    p_actor_id,
    p_video_id,
    p_comment_id,
    p_award_date,
    v_bucket
  );
end;
$$;

grant execute on function public.enqueue_push_event(uuid, text, uuid, uuid, uuid, date) to service_role;

-- ---------------------------------------------------------------------------
-- 5) Patch insert_social_notification — bell unchanged + enqueue push
-- ---------------------------------------------------------------------------
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

  if p_type in ('like', 'comment', 'follow', 'mention') then
    begin
      perform public.enqueue_push_event(
        p_user_id,
        p_type,
        p_actor_id,
        p_video_id,
        p_comment_id,
        null
      );
    exception
      when others then
        raise warning 'enqueue_push_event failed for %: %', p_type, sqlerrm;
    end;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Patch award_daily_crowns — enqueue crown push on new award
-- ---------------------------------------------------------------------------
create or replace function public.award_daily_crowns(p_award_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_award_date date := coalesce(
    p_award_date,
    (timezone('Asia/Tokyo', now()))::date - 1
  );
  v_country text;
  v_inserted integer := 0;
  v_skipped_existing integer := 0;
  v_skipped_no_views integer := 0;
  v_winner record;
  v_rows integer;
begin
  for v_country in
    select distinct v.country
    from public.videos v
    where v.status = 'published'::public.video_status
      and v.country is not null
      and length(trim(v.country)) > 0
  loop
    if exists (
      select 1 from public.crown_awards a
      where a.country = v_country and a.award_date = v_award_date
    ) then
      v_skipped_existing := v_skipped_existing + 1;
      continue;
    end if;

    select
      v.id as video_id,
      v.user_id,
      coalesce(d.view_count, 0) as daily_views,
      coalesce(v.view_count, 0) as total_views
    into v_winner
    from public.videos v
    left join public.video_daily_views d
      on d.video_id = v.id and d.view_date = v_award_date
    where v.status = 'published'::public.video_status
      and v.country = v_country
      and not exists (
        select 1 from public.crown_awards ca
        where ca.user_id = v.user_id
          and ca.award_date < v_award_date
          and ca.award_date > (v_award_date - 10)
      )
    order by
      coalesce(d.view_count, 0) desc,
      coalesce(v.view_count, 0) desc,
      v.published_at asc nulls last,
      v.id asc
    limit 1;

    if v_winner.video_id is null then
      continue;
    end if;

    if v_winner.daily_views <= 0 then
      v_skipped_no_views := v_skipped_no_views + 1;
      continue;
    end if;

    insert into public.crown_awards (
      award_date,
      country,
      video_id,
      user_id,
      daily_view_count,
      total_view_count
    )
    values (
      v_award_date,
      v_country,
      v_winner.video_id,
      v_winner.user_id,
      v_winner.daily_views,
      v_winner.total_views
    )
    on conflict (country, award_date) do nothing;

    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      v_inserted := v_inserted + 1;
      begin
        perform public.enqueue_push_event(
          v_winner.user_id,
          'crown',
          null,
          v_winner.video_id,
          null,
          v_award_date
        );
      exception
        when others then
          raise warning 'enqueue_push_event crown failed: %', sqlerrm;
      end;
    end if;
  end loop;

  return jsonb_build_object(
    'award_date', v_award_date,
    'inserted', v_inserted,
    'skipped_existing', v_skipped_existing,
    'skipped_no_views', v_skipped_no_views
  );
end;
$$;

grant execute on function public.award_daily_crowns(date) to service_role;

comment on table public.notification_preferences is
  'Per-user push notification toggles; in-app bell is always on';
comment on table public.push_outbox is
  'Pending APNs events; aggregated by process-push-outbox Edge Function';
comment on table public.push_send_log is
  'APNs send history for cooldown and debugging';

notify pgrst, 'reload schema';
