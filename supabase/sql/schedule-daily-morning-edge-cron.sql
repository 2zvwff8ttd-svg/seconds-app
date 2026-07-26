-- Reference: seconds-daily-morning-edge (pg_cron + pg_net → Edge Function)
-- Production uses this pattern instead of seconds-daily-morning-rpc.
-- See schedule-process-push-outbox-cron.sql for the push-outbox sibling job.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Example (CRON_SECRET set on Edge Functions — replace secret value):
--
-- select cron.schedule(
--   'seconds-daily-morning-edge',
--   '0 22 * * *',
--   $$
--   select net.http_post(
--     url := 'https://ynnabzfgkrrqrtrdckyk.supabase.co/functions/v1/daily-morning',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'x-cron-secret', '<YOUR_CRON_SECRET>'
--     ),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 120000
--   ) as request_id;
--   $$
-- );
--
-- Example (no CRON_SECRET):
--
-- select cron.schedule(
--   'seconds-daily-morning-edge',
--   '0 22 * * *',
--   $$
--   select net.http_post(
--     url := 'https://ynnabzfgkrrqrtrdckyk.supabase.co/functions/v1/daily-morning',
--     headers := jsonb_build_object('Content-Type', 'application/json'),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 120000
--   ) as request_id;
--   $$
-- );

-- Legacy RPC-only job (disable if using edge job above):
-- select cron.unschedule(jobid) from cron.job where jobname = 'seconds-daily-morning-rpc';
