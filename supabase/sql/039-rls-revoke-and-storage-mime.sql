-- #8 / #9 security follow-ups (after 037–038).
-- Does NOT modify existing row data (REVOKE / RLS / policy replace only).
-- Apply in SQL Editor after 038.
-- Same as migrations/039_rls_revoke_and_storage_mime.sql

-- ---------------------------------------------------------------------------
-- #8 Defense-in-depth: revoke direct client table access
-- RLS is already enabled (038). Clients use SECURITY DEFINER RPCs instead.
-- service_role bypasses RLS; DEFINER functions still work as owner.
-- ---------------------------------------------------------------------------
revoke all on table public.app_config from anon, authenticated;
revoke all on table public.daily_morning_job_runs from anon, authenticated;

-- Sibling service-only tables (RLS already on, no client policies)
revoke all on table public.morning_digest_push_deliveries from anon, authenticated;
revoke all on table public.push_outbox from anon, authenticated;
revoke all on table public.push_send_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- #9 Storage: require declared MIME to match bucket allowlist on write
-- Ownership checks unchanged. Existing objects are not rewritten.
-- ---------------------------------------------------------------------------

-- media
drop policy if exists "media_insert_own_folder" on storage.objects;
create policy "media_insert_own_folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce(metadata->>'mimetype', '') = any (array[
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-msvideo',
      'image/jpeg',
      'image/png',
      'image/webp'
    ])
  );

drop policy if exists "media_update_own_folder" on storage.objects;
create policy "media_update_own_folder"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce(metadata->>'mimetype', '') = any (array[
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-msvideo',
      'image/jpeg',
      'image/png',
      'image/webp'
    ])
  );

-- avatars
drop policy if exists "avatars_insert_own_folder" on storage.objects;
create policy "avatars_insert_own_folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce(metadata->>'mimetype', '') = any (array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    ])
  );

drop policy if exists "avatars_update_own_folder" on storage.objects;
create policy "avatars_update_own_folder"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce(metadata->>'mimetype', '') = any (array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    ])
  );

notify pgrst, 'reload schema';
