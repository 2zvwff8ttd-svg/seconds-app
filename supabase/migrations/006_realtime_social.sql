-- =============================================================================
-- Realtime: likes & comments を supabase_realtime に追加
-- Supabase Dashboard → SQL Editor → Run
-- または: npm run db:enable-realtime
-- =============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'likes'
  ) then
    alter publication supabase_realtime add table public.likes;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;

-- 確認
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('likes', 'comments')
order by tablename;
