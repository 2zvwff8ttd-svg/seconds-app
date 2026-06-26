-- Push device tokens for APNs/FCM (Phase 1: morning digest push)

create table if not exists public.push_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  platform text not null,
  token text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_device_tokens_platform_check
    check (platform in ('ios', 'android')),
  constraint push_device_tokens_token_not_empty
    check (char_length(trim(token)) > 0),
  constraint push_device_tokens_user_token_unique unique (user_id, token)
);

create index if not exists push_device_tokens_user_enabled_idx
  on public.push_device_tokens (user_id)
  where enabled = true;

create index if not exists push_device_tokens_platform_enabled_idx
  on public.push_device_tokens (platform)
  where enabled = true;

comment on table public.push_device_tokens is
  'Mobile push tokens (APNs/FCM). One row per user device token.';

create or replace function public.push_device_tokens_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists push_device_tokens_set_updated_at on public.push_device_tokens;
create trigger push_device_tokens_set_updated_at
  before update on public.push_device_tokens
  for each row
  execute function public.push_device_tokens_set_updated_at();

alter table public.push_device_tokens enable row level security;

drop policy if exists "push_device_tokens_select_own" on public.push_device_tokens;
create policy "push_device_tokens_select_own"
  on public.push_device_tokens for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_device_tokens_insert_own" on public.push_device_tokens;
create policy "push_device_tokens_insert_own"
  on public.push_device_tokens for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "push_device_tokens_update_own" on public.push_device_tokens;
create policy "push_device_tokens_update_own"
  on public.push_device_tokens for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push_device_tokens_delete_own" on public.push_device_tokens;
create policy "push_device_tokens_delete_own"
  on public.push_device_tokens for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on table public.push_device_tokens to authenticated;

notify pgrst, 'reload schema';
