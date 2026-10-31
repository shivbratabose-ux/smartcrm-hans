-- ══════════════════════════════════════════════════════════════════════
-- Migration: activity_digest_v1
-- ══════════════════════════════════════════════════════════════════════
-- Daily and weekly activity e-mails (edge function `activity-digest`).
--
--   1. digest_log — one row per (report kind, period, recipient). Its key
--      makes sending idempotent: a retried cron call never e-mails the same
--      report twice. Also the audit trail (who got what, and any error).
--   2. pg_cron schedules, 08:30 IST = 03:00 UTC (pg_cron runs in UTC):
--        digest-daily   Mon–Sat   (the function skips holidays itself)
--        digest-weekly  Monday    (5 minutes after the daily one)
--
-- The schedules authenticate with DIGEST_CRON_TOKEN, a narrow token that
-- can only trigger a digest — NOT the service-role key, so the SQL stored
-- in cron.job can never be used for anything else.
--
-- BEFORE RUNNING section 2: replace <DIGEST_CRON_TOKEN> with the value set
-- in Supabase secrets. Never commit this file with the real token in it.
-- ══════════════════════════════════════════════════════════════════════

-- 1 ── Send log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.digest_log (
  kind          TEXT NOT NULL,                 -- daily | weekly
  period_key    TEXT NOT NULL,                 -- 'YYYY-MM-DD..YYYY-MM-DD'
  recipient_id  TEXT NOT NULL,                 -- users.id
  sent_to       TEXT,                          -- address used (preview address during rollout)
  outcome       TEXT NOT NULL,                 -- sending | sent | error
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, period_key, recipient_id)
);
-- Service role only: RLS on with no policies.
ALTER TABLE public.digest_log ENABLE ROW LEVEL SECURITY;

-- 2 ── Schedules ───────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN PERFORM cron.unschedule('digest-daily');  EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('digest-weekly'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('digest-daily', '0 3 * * 1-6', $$
  SELECT net.http_post(
    url     := 'https://kiiykerktkvfkzlyqtza.supabase.co/functions/v1/activity-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <DIGEST_CRON_TOKEN>'),
    body    := '{"kind":"daily","mode":"send"}'::jsonb,
    timeout_milliseconds := 120000);
$$);

SELECT cron.schedule('digest-weekly', '5 3 * * 1', $$
  SELECT net.http_post(
    url     := 'https://kiiykerktkvfkzlyqtza.supabase.co/functions/v1/activity-digest',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <DIGEST_CRON_TOKEN>'),
    body    := '{"kind":"weekly","mode":"send"}'::jsonb,
    timeout_milliseconds := 120000);
$$);

-- Verify:   SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'digest-%';
-- History:  SELECT * FROM public.digest_log ORDER BY created_at DESC LIMIT 50;
-- Pause:    SELECT cron.unschedule('digest-daily'); SELECT cron.unschedule('digest-weekly');
