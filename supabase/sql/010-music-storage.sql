-- プリセット BGM 用 `music` バケット（Supabase SQL Editor で実行）
-- migrations/010_music_storage.sql と同内容

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'music',
  'music',
  true,
  52428800,
  array[
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "music_public_read" on storage.objects;
create policy "music_public_read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'music');
