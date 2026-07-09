-- Schedule process-push-outbox every 3 minutes (UTC).
-- Dashboard → Edge Functions → process-push-outbox → Schedules is equivalent.
--
-- Requires: pg_cron enabled, 031-notification-push.sql applied

create extension if not exists pg_cron with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'process-push-outbox';

-- Invoke via Supabase HTTP if using pg_net; prefer Dashboard schedule for Edge Functions.
-- This SQL documents the intended cadence only:
--   */3 * * * *  (every 3 minutes)

comment on schema public is
  'Push outbox: schedule process-push-outbox Edge Function every 3 minutes in Supabase Dashboard.';
