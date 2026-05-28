-- ============================================================
-- CheckFridge — Cron Job Setup
-- Run this in Supabase → SQL editor AFTER deploying both
-- edge functions and setting the CRON_SECRET.
--
-- BEFORE RUNNING:
--   1. Deploy edge functions:
--        supabase functions deploy check-expiry
--        supabase functions deploy monthly-summary
--
--   2. Set the secret (pick any random string):
--        supabase secrets set CRON_SECRET=<your-random-string>
--
--   3. Replace BOTH occurrences of YOUR_CRON_SECRET_HERE below
--      with that same random string.
--
--   4. Make sure pg_net is enabled:
--        Supabase dashboard → Database → Extensions → pg_net → Enable
-- ============================================================

-- Enable required extensions (if not already on)
-- NOTE: if these fail with "permission denied", enable them manually:
--   Supabase dashboard → Database → Extensions → enable pg_cron and pg_net
create extension if not exists pg_cron;
create extension if not exists pg_net schema extensions;

-- Remove existing schedules if you're re-running this script
do $$
begin
  perform cron.unschedule('check-expiry-daily');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('monthly-summary-monthly');
exception when others then null;
end $$;

-- ── Daily expiry check at 9:00 AM UTC ────────────────────────────────────
select cron.schedule(
  'check-expiry-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url     := 'https://hjskgitapxxhytrxnbed.supabase.co/functions/v1/check-expiry',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', 'YOUR_CRON_SECRET_HERE'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ── Monthly summary on the 1st of each month at 10:00 AM UTC ─────────────
select cron.schedule(
  'monthly-summary-monthly',
  '0 10 1 * *',
  $$
  select net.http_post(
    url     := 'https://hjskgitapxxhytrxnbed.supabase.co/functions/v1/monthly-summary',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', 'YOUR_CRON_SECRET_HERE'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Verify the schedules were created
select jobid, jobname, schedule, active from cron.job order by jobid;
