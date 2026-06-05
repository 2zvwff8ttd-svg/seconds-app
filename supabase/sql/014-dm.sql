-- DM（1対1）+ リクエスト + Realtime

create type public.dm_thread_status as enum ('pending', 'active', 'declined');

create table public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  participant_low uuid not null references public.profiles (id) on delete cascade,
  participant_high uuid not null references public.profiles (id) on delete cascade,
  initiated_by uuid not null references public.profiles (id) on delete cascade,
  status public.dm_thread_status not null default 'pending',
  accepted_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  constraint dm_threads_participant_order check (participant_low < participant_high),
  constraint dm_threads_unique_pair unique (participant_low, participant_high),
  constraint dm_threads_distinct_participants check (participant_low <> participant_high)
);

create index dm_threads_participant_low_idx on public.dm_threads (participant_low, last_message_at desc nulls last);
create index dm_threads_participant_high_idx on public.dm_threads (participant_high, last_message_at desc nulls last);
create index dm_threads_status_idx on public.dm_threads (status, last_message_at desc nulls last);

create table public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint dm_messages_body_not_empty check (char_length(trim(body)) > 0)
);

create index dm_messages_thread_id_created_at_idx
  on public.dm_messages (thread_id, created_at asc);

create table public.dm_thread_reads (
  thread_id uuid not null references public.dm_threads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

-- 最終メッセージをスレッドに反映
create or replace function public.dm_threads_touch_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.dm_threads
  set
    last_message_at = new.created_at,
    last_message_preview = left(new.body, 160)
  where id = new.thread_id;
  return new;
end;
$$;

create trigger dm_messages_touch_thread
  after insert on public.dm_messages
  for each row
  execute function public.dm_threads_touch_last_message();

create or replace function public.is_dm_thread_participant(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dm_threads t
    where t.id = p_thread_id
      and auth.uid() in (t.participant_low, t.participant_high)
  );
$$;

-- メッセージ送信（スレッド自動作成・フォロー外は pending）
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

create or replace function public.accept_dm_request(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.dm_threads;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

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
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

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

revoke all on function public.send_dm_message(uuid, text) from public;
grant execute on function public.send_dm_message(uuid, text) to authenticated;
revoke all on function public.accept_dm_request(uuid) from public;
grant execute on function public.accept_dm_request(uuid) to authenticated;
revoke all on function public.decline_dm_request(uuid) from public;
grant execute on function public.decline_dm_request(uuid) to authenticated;

alter table public.dm_threads enable row level security;
alter table public.dm_messages enable row level security;
alter table public.dm_thread_reads enable row level security;

create policy "dm_threads_select_participant"
  on public.dm_threads for select to authenticated
  using (auth.uid() in (participant_low, participant_high));

create policy "dm_messages_select_participant"
  on public.dm_messages for select to authenticated
  using (public.is_dm_thread_participant(thread_id));

create policy "dm_thread_reads_select_own"
  on public.dm_thread_reads for select to authenticated
  using (user_id = auth.uid());

create policy "dm_thread_reads_insert_own"
  on public.dm_thread_reads for insert to authenticated
  with check (user_id = auth.uid() and public.is_dm_thread_participant(thread_id));

create policy "dm_thread_reads_update_own"
  on public.dm_thread_reads for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dm_messages'
  ) then
    alter publication supabase_realtime add table public.dm_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dm_threads'
  ) then
    alter publication supabase_realtime add table public.dm_threads;
  end if;
end $$;

notify pgrst, 'reload schema';
