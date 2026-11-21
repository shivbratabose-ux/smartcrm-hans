-- ═══════════════════════════════════════════════════════════════════
-- Projects: "Run as a project" on any deal or lead (decision 21 Nov 2026)
-- Safe & re-runnable. Undo: projects_selected_v1_down.sql
-- ───────────────────────────────────────────────────────────────────
-- Deals of ₹50 lakh or more are always projects. Anything smaller is a
-- project only when someone ticks "Run as a project" on the deal (Pipeline)
-- or the lead (Leads), or adds it on the Projects screen:
--   selected  true = chosen to be run as a project (shown on Projects)
--   lead_id   the lead a project was started from (deals use opp_id)
-- Adds two columns to public.projects; nothing else changes. Existing rows
-- get selected = false and lead_id = NULL, so today's projects look exactly
-- as they do now. RLS policies on projects are unchanged.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS selected BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS lead_id  TEXT;

COMMENT ON COLUMN public.projects.selected IS 'Chosen to be run as a project (ticked on the deal or lead, or added on the Projects screen). Deals of ₹50 lakh or more are projects regardless.';
COMMENT ON COLUMN public.projects.lead_id  IS 'Lead the project was started from (Leads → Run as a project).';

NOTIFY pgrst, 'reload schema';
