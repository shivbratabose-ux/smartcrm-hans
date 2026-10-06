-- ═══════════════════════════════════════════════════════════════════
-- Re-engagement Agent daily run (Module A, R1)
-- ═══════════════════════════════════════════════════════════════════
-- Invokes re-agent-run every day at 03:30 UTC (09:00 IST) via pg_cron.
-- Safe to schedule before launch: the function gates on agent_config
-- (re_enabled defaults false; re_paused is the emergency stop).
--
-- BEFORE RUNNING — replace both placeholders (same drill as
-- schedule_em_poll_v1.sql; never commit the real key):
--   <PROJECT_REF>        Supabase project ref
--   <SERVICE_ROLE_KEY>   Dashboard → Project Settings → API

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN
  PERFORM cron.unschedule('re-agent-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  're-agent-daily',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/re-agent-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

-- Verify:   SELECT jobname, schedule, active FROM cron.job;
-- Pause:    UPDATE public.agent_config SET re_paused = true WHERE scope = 'org';
-- Remove:   SELECT cron.unschedule('re-agent-daily');
