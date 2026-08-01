-- ═══════════════════════════════════════════════════════════════════
-- ADD LEAD ASSIGNMENT TRACKING v2  —  run in the Supabase SQL Editor
-- ───────────────────────────────────────────────────────────────────
-- Adds the append-only assignment audit trail behind the handoff
-- workflow (assigner visibility, timeline entries, incentive credit):
--   • assignment_history — JSONB array of {from,to,by,date,note},
--     appended on every (re)assignment by the app (withLeadAssignment).
-- Prereq: add_lead_assignment_tracking_v1.sql (assigned_by/assigned_at).
-- Until this runs, the client's schema-heal strips the column so lead
-- sync keeps working — the trail just won't persist to the cloud yet.
-- IDEMPOTENT: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assignment_history JSONB DEFAULT '[]'::jsonb;

-- Backfill: rows already carrying assigned_by/assigned_at get a single
-- seed entry so the timeline isn't empty for existing leads.
UPDATE public.leads
   SET assignment_history = jsonb_build_array(jsonb_build_object(
         'from', '', 'to', COALESCE(owner, ''), 'by', COALESCE(assigned_by, ''),
         'date', COALESCE(assigned_at::text, created_date::text, ''), 'note', ''))
 WHERE (assignment_history IS NULL OR assignment_history = '[]'::jsonb)
   AND assigned_by IS NOT NULL AND assigned_by <> '';
