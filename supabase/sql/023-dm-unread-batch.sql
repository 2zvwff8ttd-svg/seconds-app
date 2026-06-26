-- Supabase SQL Editor: run this once to batch DM unread counts (Phase 2).
-- Same as supabase/migrations/023_dm_unread_batch.sql
--
-- Replaces per-thread count queries with one RPC. Matches client logic:
--   unread = messages from others where (last_read_at IS NULL OR created_at > last_read_at)

create or replace function public.dm_thread_unread_counts()
returns table (thread_id uuid, unread_count int)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.id as thread_id,
    count(m.id)::int as unread_count
  from public.dm_threads t
  left join public.dm_thread_reads r
    on r.thread_id = t.id
    and r.user_id = auth.uid()
  left join public.dm_messages m
    on m.thread_id = t.id
    and m.sender_id <> auth.uid()
    and (r.last_read_at is null or m.created_at > r.last_read_at)
  where auth.uid() in (t.participant_low, t.participant_high)
  group by t.id;
$$;

revoke all on function public.dm_thread_unread_counts() from public;
grant execute on function public.dm_thread_unread_counts() to authenticated;

notify pgrst, 'reload schema';
