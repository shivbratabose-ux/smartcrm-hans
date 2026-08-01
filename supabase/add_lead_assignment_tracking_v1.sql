-- ═══════════════════════════════════════════════════════════════════
-- ADD LEAD ASSIGNMENT TRACKING v1  —  run in the Supabase SQL Editor
-- ───────────────────────────────────────────────────────────────────
-- Adds who/when a lead was (re)assigned, for the Lead Assignment grid
-- ("Assigned By" + "Assigned date") and incentive-credit traceability.
--   • assigned_by  — CRM user id (public.users.id) who assigned it.
--   • assigned_at  — date it was assigned / reassigned.
-- The app writes these via toSnake mapping (assignedBy/assignedAt). Until
-- this migration runs, the client's schema-heal simply strips them, so
-- lead sync keeps working — they just won't persist to the cloud yet.
-- IDEMPOTENT: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_by TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at DATE;

-- Backfill existing rows: treat creation as the first assignment.
UPDATE public.leads
   SET assigned_at = COALESCE(assigned_at, created_date)
 WHERE assigned_at IS NULL AND created_date IS NOT NULL;
