-- ═══════════════════════════════════════════════════════════════════
-- CALL REPORT PARTICIPANTS v1
-- ───────────────────────────────────────────────────────────────────
-- Log Call has always collected "Our Participants", call time, extra
-- contacts and a next-step description, but call_reports had no columns
-- for them. The client's sync strips unknown columns (db.js
-- UNKNOWN_COLUMNS), so these were silently dropped on every save: a demo
-- joined by three people was stored as the logger's alone.
--
-- participant_ids drives the multi-person demo feature: every person on a
-- call/demo sees it on their calendar and gets it in their individual
-- numbers (src/utils/teamSummary.js callPeople).
--
-- Additive and nullable-safe; existing rows get empty arrays / NULL.
-- IDEMPOTENT.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.call_reports
  ADD COLUMN IF NOT EXISTS participant_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contact_ids     TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS call_time       TEXT,
  ADD COLUMN IF NOT EXISTS next_step_desc  TEXT,
  ADD COLUMN IF NOT EXISTS created_by      TEXT;

-- "Calls I was on" lookups (participant filter, per-person reports).
CREATE INDEX IF NOT EXISTS idx_call_reports_participants
  ON public.call_reports USING GIN (participant_ids);

COMMIT;

NOTIFY pgrst, 'reload schema';
