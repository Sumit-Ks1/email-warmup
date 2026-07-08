-- ============================================================================
-- Warm-up engine scheduler — run AFTER your Vercel deployment is live.
-- ============================================================================
-- The warm-up engine is advanced by calling  https://<your-app>/api/cron/tick
-- once per minute. Vercel's free (Hobby) plan only allows daily crons, so the
-- minute-level trigger comes from Supabase itself using pg_cron + pg_net —
-- both available on the Supabase FREE plan. No extra service needed.
--
-- BEFORE RUNNING:
--   1. Replace YOUR_APP_URL   with your deployed URL (e.g. https://my-warmup.vercel.app)
--   2. Replace YOUR_CRON_SECRET with the exact CRON_SECRET value you set in Vercel
--
-- Bonus: this minute-level activity also keeps your free Supabase project
-- from being paused for inactivity.
-- ============================================================================

-- Lift read-only mode for this session if the platform has it enabled
set default_transaction_read_only = off;

-- 1) Enable the required extensions (idempotent)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Remove a previous schedule if it exists (safe to ignore errors on first run)
do $$
begin
    perform cron.unschedule('warmup-tick');
exception when others then
    null;
end $$;

do $$
begin
    perform cron.unschedule('warmup-rate-limit-cleanup');
exception when others then
    null;
end $$;

-- 3) Call the tick endpoint every minute
select cron.schedule(
    'warmup-tick',
    '* * * * *',
    $$
    select net.http_post(
        url := 'YOUR_APP_URL/api/cron/tick',
        headers := jsonb_build_object(
            'Authorization', 'Bearer YOUR_CRON_SECRET',
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 55000
    );
    $$
);

-- 4) Daily cleanup of expired rate-limit windows
select cron.schedule(
    'warmup-rate-limit-cleanup',
    '30 3 * * *',
    $$ delete from public.rate_limits where window_start < now() - interval '1 day'; $$
);

-- ============================================================================
-- Useful management queries
-- ============================================================================
-- See scheduled jobs:            select * from cron.job;
-- See recent runs:               select * from cron.job_run_details order by start_time desc limit 20;
-- See recent HTTP responses:     select id, status_code, content::text from net._http_response order by id desc limit 20;
-- Pause the engine:              select cron.unschedule('warmup-tick');
