-- ═══════════════════════════════════════════════════════════════════
-- Email Agent poll schedule (Module B, E2)
-- ═══════════════════════════════════════════════════════════════════
-- Invokes em-ingest in poll mode every 3 minutes via pg_cron + pg_net.
-- The function itself gates on agent_config (em_enabled / em_paused),
-- so scheduling this is safe before launch: a disabled agent answers
-- "skipped" and touches nothing.
--
-- BEFORE RUNNING — replace both placeholders below:
--   <PROJECT_REF>        your Supabase project ref (the subdomain)
--   <SERVICE_ROLE_KEY>   Dashboard → Project Settings → API. This file
--                        must NEVER be committed with the real key in
--                        it; paste it only in the SQL editor session.
--
-- Requires the pg_cron and pg_net extensions (Dashboard → Database →
-- Extensions — both are one-click on Supabase).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Re-runnable: drop any previous schedule of the same name first.
DO $$ BEGIN
  PERFORM cron.unschedule('em-poll');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'em-poll',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/em-ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{"mode":"poll"}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Verify:   SELECT jobname, schedule, active FROM cron.job;
-- Pause:    UPDATE public.agent_config SET em_paused = true WHERE scope = 'org';
--           (instant, no cron change needed — the function checks it first)
-- Remove:   SELECT cron.unschedule('em-poll');
