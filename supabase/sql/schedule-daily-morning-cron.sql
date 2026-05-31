-- =============================================================================
-- 毎日 7:00 JST に日次ジョブを実行する Cron 登録
--
-- 方法 A（推奨・DB 直実行）: run_daily_morning_job RPC を呼ぶ
--   前提: daily-morning-job.sql 適用済み、pg_cron 有効
--
-- 方法 B: Edge Function daily-morning を HTTP で呼ぶ
--   Dashboard → Edge Functions → Schedules でも可（0 22 * * * UTC）
-- =============================================================================

-- pg_cron 拡張（ホスト環境で未作成の場合）
create extension if not exists pg_cron with schema extensions;

-- 既存ジョブを削除してから再登録（冪等）
select cron.unschedule(jobid)
from cron.job
where jobname in ('seconds-daily-morning-jst', 'seconds-daily-morning-rpc');

-- 7:00 JST = 22:00 UTC（前日）
select cron.schedule(
  'seconds-daily-morning-rpc',
  '0 22 * * *',
  $$select public.run_daily_morning_job();$$
);

-- 確認
select jobid, jobname, schedule, command
from cron.job
where jobname = 'seconds-daily-morning-rpc';
