-- ═══════════════════════════════════════════════════════════════════
-- DOTTED-LINE REPORTING — run once against the live Supabase DB
--
-- Adds matrix-org support: a person has ONE solid-line manager
-- (`reports_to`) and 0..N dotted-line managers (`dotted_to TEXT[]`).
-- Both manager types see the report's leads/opps/activities through
-- the app-side hierarchy walker; this migration adds DB-level support
-- so the field actually persists, plus an RLS helper that lets a
-- non-global manager see records owned by anyone in their full
-- (solid + dotted) downline.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Schema: add dotted_to column ─────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS dotted_to TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_users_dotted_to ON public.users USING GIN (dotted_to);

-- ── 2. Helper: full downline for a manager (solid + dotted, recursive) ──
-- Returns the set of user IDs that report (directly or transitively) up
-- to `mgr_id` via either reports_to or any dotted_to entry.
CREATE OR REPLACE FUNCTION public.user_downline(mgr_id TEXT)
RETURNS TABLE(user_id TEXT)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE tree AS (
    SELECT id FROM public.users WHERE id = mgr_id
    UNION
    SELECT u.id FROM public.users u JOIN tree t
      ON u.reports_to = t.id OR t.id = ANY(u.dotted_to)
  )
  SELECT id FROM tree;
$$;

-- ── 3. RLS: extend leads/opps/activities/call_reports/etc. so any
--          manager (solid or dotted) sees their full downline ────────
-- Pattern: drop old per-table read policy, recreate with downline check.
-- Global roles still pass through unchanged.

-- leads
DROP POLICY IF EXISTS "leads_read" ON public.leads;
CREATE POLICY "leads_read" ON public.leads FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','bd_lead')
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- opportunities
DROP POLICY IF EXISTS "opps_read" ON public.opportunities;
CREATE POLICY "opps_read" ON public.opportunities FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','bd_lead','tech_lead')
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- activities
DROP POLICY IF EXISTS "activities_read" ON public.activities;
CREATE POLICY "activities_read" ON public.activities FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','bd_lead')
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- call_reports
DROP POLICY IF EXISTS "call_reports_read" ON public.call_reports;
CREATE POLICY "call_reports_read" ON public.call_reports FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','bd_lead')
  OR marketing_person = public.get_crm_user_id()
  OR marketing_person IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- ── 4. (Optional) seed your own dotted lines here, e.g. PM dotted to S&M head:
-- UPDATE public.users SET dotted_to = ARRAY['<sales_marketing_head_id>']
--   WHERE id = '<pm_user_id>';
