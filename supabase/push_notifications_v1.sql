-- ═══════════════════════════════════════════════════════════════════
-- PUSH NOTIFICATIONS — schema for the mobile app's Expo Push integration
-- ═══════════════════════════════════════════════════════════════════
-- Two pieces:
--
-- 1. `users.expo_push_token` (TEXT, nullable) — the device-bound Expo
--    Push token registered by the mobile app on each successful auth.
--    One per user is enough today (the rep typically has one phone).
--    A future "many devices per user" requirement would split this into
--    a separate `user_devices` table; for now keeping it on `users`
--    avoids the join on every notification dispatch.
--
-- 2. `notification_log` — audit trail of every push we sent. Powers
--    "why didn't I get the reminder?" debugging and a future delivery-
--    rate dashboard. Every row has the user, channel, payload digest,
--    Expo's response status, and the timestamp.
--
-- The `notify-followups` edge function reads `users.expo_push_token`
-- and writes to `notification_log`. It runs on a Postgres cron schedule
-- (configured separately via `pg_cron` extension or Supabase scheduled
-- function — both supported in the dashboard).
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Token column on users ─────────────────────────────────────────
-- Idempotent — safe to re-run on any schema state.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT,
  ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMPTZ;

-- Cheap index for the cron query "select all users with a token".
CREATE INDEX IF NOT EXISTS idx_users_expo_push_token
  ON public.users(expo_push_token)
  WHERE expo_push_token IS NOT NULL;

-- ── 2. Notification log ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES public.users(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL DEFAULT 'expo_push',  -- room for 'sms' / 'email' later
  kind          TEXT NOT NULL,                      -- 'daily_followup' | 'meeting_15m' | etc.
  title         TEXT NOT NULL,
  body          TEXT,
  payload       JSONB DEFAULT '{}'::jsonb,          -- arbitrary extra data forwarded to the app
  expo_status   TEXT,                                -- 'ok' | 'error' | null while in-flight
  expo_message  TEXT,                                -- raw error message from Expo if any
  expo_ticket_id TEXT,                               -- Expo's per-message id, useful for receipts
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_user_sent_at
  ON public.notification_log(user_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_log_kind_sent_at
  ON public.notification_log(kind, sent_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────
-- Users can read their own log rows (helps with "why no reminder?" debug);
-- inserts come from the service-role-bearing edge function so we don't
-- need an INSERT policy.
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_log_self_read" ON public.notification_log;
CREATE POLICY "notification_log_self_read" ON public.notification_log
  FOR SELECT USING (
    user_id = public.get_crm_user_id()
    OR public.get_crm_role() IN ('admin','md','director')
  );

-- ── Realtime ─────────────────────────────────────────────────────────
-- Optional: subscribe in the mobile app to in-app banners for new
-- notifications without waiting for the OS-level push.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_log;
