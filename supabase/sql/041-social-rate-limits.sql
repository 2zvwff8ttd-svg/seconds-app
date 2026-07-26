-- N2: Rate limits + max length for comments / DM / follows.
-- Pre-check (prod 2026-07-27): comments max len 0 (none >500);
--   dm_messages max len 6 (none >2000); follows.created_at already exists.
-- Notification triggers (notify_on_comment / notify_on_follow) stay on INSERT.
-- Apply in SQL Editor (same as migrations/041_social_rate_limits.sql).

-- ---------------------------------------------------------------------------
-- Length constraints
-- ---------------------------------------------------------------------------
alter table public.comments
  drop constraint if exists comments_content_max_len;
alter table public.comments
  add constraint comments_content_max_len
  check (char_length(content) <= 500);

alter table public.dm_messages
  drop constraint if exists dm_messages_body_max_len;
alter table public.dm_messages
  add constraint dm_messages_body_max_len
  check (char_length(body) <= 2000);

-- ---------------------------------------------------------------------------
-- Indexes for rate-limit counts
-- ---------------------------------------------------------------------------
create index if not exists comments_user_id_created_at_idx
  on public.comments (user_id, created_at desc);

create index if not exists dm_messages_sender_id_created_at_idx
  on public.dm_messages (sender_id, created_at desc);

create index if not exists follows_follower_id_created_at_idx
  on public.follows (follower_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Shared rate-limit helper (SECURITY DEFINER; uses auth.uid())
-- ---------------------------------------------------------------------------
create or replace function public.assert_user_rate_limit(
  p_action text,
  p_window interval,
  p_max integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_max is null or p_max < 1 then
    raise exception 'Invalid rate limit max';
  end if;

  if p_action = 'comment' then
    select count(*)::integer into v_count
    from public.comments c
    where c.user_id = v_uid
      and c.created_at > now() - p_window;
  elsif p_action = 'dm' then
    select count(*)::integer into v_count
    from public.dm_messages m
    where m.sender_id = v_uid
      and m.created_at > now() - p_window;
  elsif p_action = 'follow' then
    select count(*)::integer into v_count
    from public.follows f
    where f.follower_id = v_uid
      and f.created_at > now() - p_window;
  else
    raise exception 'Unknown rate limit action: %', p_action;
  end if;

  if v_count >= p_max then
    raise exception 'rate_limit_exceeded'
      using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.assert_user_rate_limit(text, interval, integer) is
  'Rejects when the current user exceeds p_max writes of p_action within p_window.';

revoke all on function public.assert_user_rate_limit(text, interval, integer) from public;
-- Callable from other DEFINER RPCs; not granted to authenticated directly.

-- ---------------------------------------------------------------------------
-- post_comment RPC
-- ---------------------------------------------------------------------------
create or replace function public.post_comment(
  p_video_id uuid,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_trimmed text := trim(coalesce(p_content, ''));
  v_comment public.comments;
  v_username text;
  v_display_name text;
  v_avatar_url text;
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_video_id is null then
    raise exception 'Invalid video';
  end if;
  if char_length(v_trimmed) = 0 then
    raise exception 'Comment is empty';
  end if;
  if char_length(v_trimmed) > 500 then
    raise exception 'Comment too long';
  end if;
  if public.is_banned_user(v_uid) then
    raise exception 'Banned' using errcode = '42501';
  end if;
  if not public.can_view_video(p_video_id) then
    raise exception 'Video not found' using errcode = '42501';
  end if;

  perform public.assert_user_rate_limit('comment', interval '1 minute', 20);
  perform public.assert_user_rate_limit('comment', interval '1 hour', 120);

  insert into public.comments (video_id, user_id, content)
  values (p_video_id, v_uid, v_trimmed)
  returning * into v_comment;

  select p.username, p.display_name, p.avatar_url
    into v_username, v_display_name, v_avatar_url
  from public.profiles p
  where p.id = v_uid;

  return jsonb_build_object(
    'id', v_comment.id,
    'content', v_comment.content,
    'created_at', v_comment.created_at,
    'user_id', v_comment.user_id,
    'username', coalesce(v_username, 'unknown'),
    'display_name', v_display_name,
    'avatar_url', v_avatar_url
  );
end;
$$;

revoke all on function public.post_comment(uuid, text) from public;
grant execute on function public.post_comment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- follow_user / unfollow_user RPCs
-- ---------------------------------------------------------------------------
create or replace function public.follow_user(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'Invalid target';
  end if;
  if public.is_banned_user(v_uid) then
    raise exception 'Banned' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_target_user_id) then
    raise exception 'User not found';
  end if;
  if public.is_blocked_with(p_target_user_id) then
    raise exception 'Cannot follow this user';
  end if;

  perform public.assert_user_rate_limit('follow', interval '1 minute', 20);
  perform public.assert_user_rate_limit('follow', interval '1 hour', 100);

  insert into public.follows (follower_id, following_id)
  values (v_uid, p_target_user_id)
  on conflict (follower_id, following_id) do nothing;
end;
$$;

create or replace function public.unfollow_user(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'Invalid target';
  end if;

  delete from public.follows
  where follower_id = v_uid
    and following_id = p_target_user_id;
end;
$$;

revoke all on function public.follow_user(uuid) from public;
grant execute on function public.follow_user(uuid) to authenticated;
revoke all on function public.unfollow_user(uuid) from public;
grant execute on function public.unfollow_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- send_dm_message: add max length + rate limits (preserve existing logic)
-- ---------------------------------------------------------------------------
create or replace function public.send_dm_message(p_recipient_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_low uuid;
  v_high uuid;
  v_thread public.dm_threads;
  v_message public.dm_messages;
  v_trimmed text := trim(coalesce(p_body, ''));
  v_status public.dm_thread_status;
begin
  if v_sender is null then
    raise exception 'Unauthorized';
  end if;
  if p_recipient_id is null or p_recipient_id = v_sender then
    raise exception 'Invalid recipient';
  end if;
  if char_length(v_trimmed) = 0 then
    raise exception 'Message is empty';
  end if;
  if char_length(v_trimmed) > 2000 then
    raise exception 'Message too long';
  end if;
  if public.is_banned_user(v_sender) then
    raise exception 'Banned' using errcode = '42501';
  end if;

  if public.is_blocked_with(p_recipient_id) then
    raise exception 'Cannot message this user';
  end if;

  perform public.assert_user_rate_limit('dm', interval '1 minute', 30);
  perform public.assert_user_rate_limit('dm', interval '1 hour', 200);

  v_low := least(v_sender, p_recipient_id);
  v_high := greatest(v_sender, p_recipient_id);

  select * into v_thread
  from public.dm_threads t
  where t.participant_low = v_low and t.participant_high = v_high;

  if not found then
    if exists (
      select 1
      from public.follows f
      where f.follower_id = p_recipient_id
        and f.following_id = v_sender
    ) then
      v_status := 'active';
    else
      v_status := 'pending';
    end if;

    insert into public.dm_threads (
      participant_low, participant_high, initiated_by, status, accepted_at
    )
    values (
      v_low,
      v_high,
      v_sender,
      v_status,
      case when v_status = 'active' then now() else null end
    )
    returning * into v_thread;
  elsif v_thread.status = 'declined' and v_thread.initiated_by = v_sender then
    update public.dm_threads
    set status = 'pending', accepted_at = null
    where id = v_thread.id
    returning * into v_thread;
  end if;

  if v_thread.status = 'pending' and v_thread.initiated_by <> v_sender then
    raise exception 'Request not accepted yet';
  end if;
  if v_thread.status = 'declined' then
    raise exception 'Request was declined';
  end if;

  insert into public.dm_messages (thread_id, sender_id, body)
  values (v_thread.id, v_sender, v_trimmed)
  returning * into v_message;

  return jsonb_build_object(
    'thread_id', v_thread.id,
    'message_id', v_message.id,
    'status', v_thread.status,
    'created_at', v_message.created_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Close direct client writes (RPC-only)
-- ---------------------------------------------------------------------------
drop policy if exists "comments_insert_own" on public.comments;
drop policy if exists "follows_insert_own" on public.follows;
drop policy if exists "follows_delete_own" on public.follows;

notify pgrst, 'reload schema';
