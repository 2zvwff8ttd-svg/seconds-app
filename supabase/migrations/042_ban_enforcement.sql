-- N3: Consistent ban enforcement (assert_not_banned + RLS + RPC guards).
-- Auth session kill is handled by Edge Function enforce-auth-ban (not SQL).
-- Allowed while banned: delete_own_account, unfollow_user, unblock_user.
-- Apply in SQL Editor (same as migrations/042_ban_enforcement.sql).

-- ---------------------------------------------------------------------------
-- Shared guard
-- ---------------------------------------------------------------------------
create or replace function public.assert_not_banned()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if public.is_banned_user(auth.uid()) then
    raise exception 'Banned' using errcode = '42501';
  end if;
end;
$$;

comment on function public.assert_not_banned() is
  'Raises if the JWT user is missing or profiles.is_banned. Call from user write RPCs.';

revoke all on function public.assert_not_banned() from public;
-- Invoked by other SECURITY DEFINER RPCs only.

-- ---------------------------------------------------------------------------
-- Priority: insert_pending_video (main post path)
-- ---------------------------------------------------------------------------
create or replace function public.insert_pending_video(
  p_id uuid,
  p_user_id uuid,
  p_video_url text,
  p_thumbnail_url text,
  p_title text,
  p_duration_seconds integer,
  p_visibility public.video_visibility,
  p_country text,
  p_bgm_url text default null
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

  perform public.assert_not_banned();

  insert into public.videos (
    id,
    user_id,
    video_url,
    thumbnail_url,
    title,
    duration_seconds,
    visibility,
    country,
    status,
    bgm_url
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
    'pending'::public.video_status,
    nullif(trim(p_bgm_url), '')
  )
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'publish_at', v_row.publish_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Social RPCs: unify on assert_not_banned
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
  perform public.assert_not_banned();

  if p_video_id is null then
    raise exception 'Invalid video';
  end if;
  if char_length(v_trimmed) = 0 then
    raise exception 'Comment is empty';
  end if;
  if char_length(v_trimmed) > 500 then
    raise exception 'Comment too long';
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

create or replace function public.follow_user(p_target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  perform public.assert_not_banned();

  if p_target_user_id is null or p_target_user_id = v_uid then
    raise exception 'Invalid target';
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

-- unfollow_user: intentionally NO assert_not_banned (allowed while banned)

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
  perform public.assert_not_banned();

  if p_recipient_id is null or p_recipient_id = v_sender then
    raise exception 'Invalid recipient';
  end if;
  if char_length(v_trimmed) = 0 then
    raise exception 'Message is empty';
  end if;
  if char_length(v_trimmed) > 2000 then
    raise exception 'Message too long';
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

create or replace function public.block_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_not_banned();

  if auth.uid() = p_blocked_id then
    raise exception 'Cannot block yourself';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (auth.uid(), p_blocked_id)
  on conflict do nothing;

  delete from public.follows
  where (follower_id = auth.uid() and following_id = p_blocked_id)
     or (follower_id = p_blocked_id and following_id = auth.uid());
end;
$$;

-- unblock_user: intentionally NO assert_not_banned

create or replace function public.accept_dm_request(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.dm_threads;
begin
  perform public.assert_not_banned();

  update public.dm_threads
  set status = 'active', accepted_at = now()
  where id = p_thread_id
    and status = 'pending'
    and initiated_by <> auth.uid()
    and auth.uid() in (participant_low, participant_high)
  returning * into v_row;

  if not found then
    raise exception 'Request not found or already handled';
  end if;

  return jsonb_build_object('thread_id', v_row.id, 'status', v_row.status);
end;
$$;

create or replace function public.decline_dm_request(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.dm_threads;
begin
  perform public.assert_not_banned();

  update public.dm_threads
  set status = 'declined'
  where id = p_thread_id
    and status = 'pending'
    and initiated_by <> auth.uid()
    and auth.uid() in (participant_low, participant_high)
  returning * into v_row;

  if not found then
    raise exception 'Request not found or already handled';
  end if;

  return jsonb_build_object('thread_id', v_row.id, 'status', v_row.status);
end;
$$;

-- submit_report: keep existing logic; use assert_not_banned
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
  perform public.assert_not_banned();

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

-- ---------------------------------------------------------------------------
-- RLS: ban actors on direct writes (DELETE unblock/unlike often left open)
-- ---------------------------------------------------------------------------

-- likes INSERT
drop policy if exists "likes_insert_own" on public.likes;
create policy "likes_insert_own"
  on public.likes for insert to authenticated
  with check (
    auth.uid() = user_id
    and not public.is_banned_user(auth.uid())
    and exists (
      select 1 from public.videos v
      where v.id = likes.video_id
        and public.can_view_video(v.id)
    )
  );

-- profiles UPDATE
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = id and not public.is_banned_user(auth.uid()))
  with check (auth.uid() = id and not public.is_banned_user(auth.uid()));

-- reports INSERT
drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
  on public.reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and not public.is_banned_user(auth.uid())
  );

-- user_blocks INSERT (block); DELETE stays open for unblock while banned
drop policy if exists "user_blocks_insert_own" on public.user_blocks;
create policy "user_blocks_insert_own"
  on public.user_blocks for insert to authenticated
  with check (
    auth.uid() = blocker_id
    and not public.is_banned_user(auth.uid())
  );

-- videos UPDATE
drop policy if exists "videos_update_own" on public.videos;
create policy "videos_update_own"
  on public.videos for update to authenticated
  using (auth.uid() = user_id and not public.is_banned_user(auth.uid()))
  with check (auth.uid() = user_id and not public.is_banned_user(auth.uid()));

-- clips INSERT / UPDATE
drop policy if exists "clips_insert_own_video" on public.clips;
create policy "clips_insert_own_video"
  on public.clips for insert to authenticated
  with check (
    not public.is_banned_user(auth.uid())
    and exists (
      select 1 from public.videos v
      where v.id = clips.video_id and v.user_id = auth.uid()
    )
  );

drop policy if exists "clips_update_own_video" on public.clips;
create policy "clips_update_own_video"
  on public.clips for update to authenticated
  using (
    not public.is_banned_user(auth.uid())
    and exists (
      select 1 from public.videos v
      where v.id = clips.video_id and v.user_id = auth.uid()
    )
  )
  with check (
    not public.is_banned_user(auth.uid())
    and exists (
      select 1 from public.videos v
      where v.id = clips.video_id and v.user_id = auth.uid()
    )
  );

-- comments UPDATE (delete own left for cleanup)
drop policy if exists "comments_update_own" on public.comments;
create policy "comments_update_own"
  on public.comments for update to authenticated
  using (auth.uid() = user_id and not public.is_banned_user(auth.uid()))
  with check (auth.uid() = user_id and not public.is_banned_user(auth.uid()));

-- dm_thread_reads
drop policy if exists "dm_thread_reads_insert_own" on public.dm_thread_reads;
create policy "dm_thread_reads_insert_own"
  on public.dm_thread_reads for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_banned_user(auth.uid())
    and public.is_dm_thread_participant(thread_id)
  );

drop policy if exists "dm_thread_reads_update_own" on public.dm_thread_reads;
create policy "dm_thread_reads_update_own"
  on public.dm_thread_reads for update to authenticated
  using (user_id = auth.uid() and not public.is_banned_user(auth.uid()))
  with check (user_id = auth.uid() and not public.is_banned_user(auth.uid()));

-- video_engagements
drop policy if exists "video_engagements_insert_own" on public.video_engagements;
create policy "video_engagements_insert_own"
  on public.video_engagements for insert to authenticated
  with check (auth.uid() = user_id and not public.is_banned_user(auth.uid()));

drop policy if exists "video_engagements_update_own" on public.video_engagements;
create policy "video_engagements_update_own"
  on public.video_engagements for update to authenticated
  using (auth.uid() = user_id and not public.is_banned_user(auth.uid()))
  with check (auth.uid() = user_id and not public.is_banned_user(auth.uid()));

-- push tokens / notification prefs / debug logs
drop policy if exists "push_device_tokens_insert_own" on public.push_device_tokens;
create policy "push_device_tokens_insert_own"
  on public.push_device_tokens for insert to authenticated
  with check (user_id = auth.uid() and not public.is_banned_user(auth.uid()));

drop policy if exists "push_device_tokens_update_own" on public.push_device_tokens;
create policy "push_device_tokens_update_own"
  on public.push_device_tokens for update to authenticated
  using (user_id = auth.uid() and not public.is_banned_user(auth.uid()))
  with check (user_id = auth.uid() and not public.is_banned_user(auth.uid()));

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own"
  on public.notification_preferences for insert to authenticated
  with check (user_id = auth.uid() and not public.is_banned_user(auth.uid()));

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
  on public.notification_preferences for update to authenticated
  using (user_id = auth.uid() and not public.is_banned_user(auth.uid()))
  with check (user_id = auth.uid() and not public.is_banned_user(auth.uid()));

drop policy if exists "client_debug_logs_insert_own" on public.client_debug_logs;
create policy "client_debug_logs_insert_own"
  on public.client_debug_logs for insert to authenticated
  with check (auth.uid() = user_id and not public.is_banned_user(auth.uid()));

notify pgrst, 'reload schema';
