-- Client debug evidence logs ([clip-av] / [clip-av-native]) for Windows-side diagnosis.
-- Default: upload only on A/V mismatch. Optional always-on via app_config.client_debug_logs.enabled.
-- Apply in SQL Editor (same as migrations/035_client_debug_logs.sql).

create table if not exists public.client_debug_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id text not null,
  source text not null,
  event text not null,
  clip_index integer,
  payload jsonb not null default '{}'::jsonb,
  app_version text,
  platform text not null default 'unknown',
  trigger text not null,
  constraint client_debug_logs_source_check
    check (source in ('clip-av', 'clip-av-native', 'post-guard')),
  constraint client_debug_logs_trigger_check
    check (trigger in ('mismatch', 'debug_flag', 'manual'))
);

create index if not exists client_debug_logs_user_created_idx
  on public.client_debug_logs (user_id, created_at desc);

create index if not exists client_debug_logs_session_idx
  on public.client_debug_logs (session_id, created_at);

alter table public.client_debug_logs enable row level security;

drop policy if exists "client_debug_logs_select_own" on public.client_debug_logs;
create policy "client_debug_logs_select_own"
  on public.client_debug_logs for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "client_debug_logs_insert_own" on public.client_debug_logs;
create policy "client_debug_logs_insert_own"
  on public.client_debug_logs for insert to authenticated
  with check (auth.uid() = user_id);

grant select, insert on table public.client_debug_logs to authenticated;

insert into public.app_config (key, value)
values (
  'client_debug_logs',
  jsonb_build_object(
    'enabled', false,
    'retention_days', 14
  )
)
on conflict (key) do nothing;

comment on table public.client_debug_logs is
  'Recording/A-V evidence logs from clients. Prefer mismatch-triggered uploads; enable via app_config for verbose mode.';

create or replace function public.get_client_debug_logs_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select value
      from public.app_config
      where key = 'client_debug_logs'
    ),
    jsonb_build_object(
      'enabled', false,
      'retention_days', 14
    )
  );
$$;

grant execute on function public.get_client_debug_logs_config() to anon, authenticated, service_role;

notify pgrst, 'reload schema';

-- Toggle verbose mode (optional):
-- update public.app_config
-- set value = jsonb_set(value, '{enabled}', 'true'::jsonb),
--     updated_at = timezone('Asia/Tokyo', now())
-- where key = 'client_debug_logs';

-- Inspect recent logs:
-- select created_at, source, event, clip_index, trigger, payload
-- from public.client_debug_logs
-- order by created_at desc
-- limit 100;
