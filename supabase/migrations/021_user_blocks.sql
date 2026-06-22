-- User blocks for UGC moderation (Phase 1)

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocker_idx on public.user_blocks (blocker_id);
create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

create policy "user_blocks_select_own"
  on public.user_blocks for select to authenticated
  using (auth.uid() = blocker_id);

create policy "user_blocks_insert_own"
  on public.user_blocks for insert to authenticated
  with check (auth.uid() = blocker_id);

create policy "user_blocks_delete_own"
  on public.user_blocks for delete to authenticated
  using (auth.uid() = blocker_id);

create or replace function public.is_blocked_with(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = other_user_id)
       or (b.blocker_id = other_user_id and b.blocked_id = auth.uid())
  );
$$;

revoke all on function public.is_blocked_with(uuid) from public;
grant execute on function public.is_blocked_with(uuid) to authenticated;

create or replace function public.block_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
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

create or replace function public.unblock_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.user_blocks
  where blocker_id = auth.uid() and blocked_id = p_blocked_id;
end;
$$;

revoke all on function public.block_user(uuid) from public;
grant execute on function public.block_user(uuid) to authenticated;
revoke all on function public.unblock_user(uuid) from public;
grant execute on function public.unblock_user(uuid) to authenticated;

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
  v_trimmed text := trim(p_body);
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

  if public.is_blocked_with(p_recipient_id) then
    raise exception 'Cannot message this user';
  end if;

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
