-- ══════════════════════════════════════════════════════════════════════
-- Migration: leads_read_support_scope_v1
-- ══════════════════════════════════════════════════════════════════════
-- Policy (Shivbrata, 3 Nov 2026): the support team is responsible for
-- onboarded accounts. They see ACCOUNTS (and tickets) company-wide, but NOT
-- the sales team's leads — only leads they created themselves.
--
-- Before this, leads_read was USING (true) for every role
-- (fix_access_and_visibility_v1.sql, Jun 2026), and the app additionally
-- exempted support roles from its own lead filter — so a Support Engineer
-- saw all ~1,088 leads.
--
-- This narrows SELECT on leads for the SUPPORT ROLES ONLY ('support',
-- 'tech_lead'). Every other role keeps exactly today's company-wide read —
-- that read was opened in June to fix 42501 errors on save, and nothing
-- here touches it. A support user can read a lead when it is:
--   • owned by them, or by someone in their downline
--   • created / assigned by them — the app records the creator in
--     assignment_history ({ by: <creator>, note: "Created" }) and assigned_by
--     on reassignment. Mirrors isLeadAssigner() in src/utils/helpers.jsx.
-- That last clause also matters for writes: the app saves with
-- upsert … RETURNING, and Postgres fails a write whose returned row the
-- writer cannot read. A support user creating a lead for a colleague can
-- still read it back, so the save never fails.
--
-- Writes are unchanged. Re-runnable. Revert: re-run the leads_read line of
-- fix_access_and_visibility_v1.sql (USING (true)).
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

DROP POLICY IF EXISTS "leads_read" ON public.leads;
CREATE POLICY "leads_read" ON public.leads FOR SELECT USING (
  -- Every role except the support team: unchanged (company-wide read).
  coalesce(public.get_crm_role(), '') NOT IN ('support', 'tech_lead')
  -- Support team: own + downline + leads they created / assigned.
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  OR assigned_by = public.get_crm_user_id()
  OR assignment_history @> jsonb_build_array(jsonb_build_object('by', public.get_crm_user_id()))
  OR assignment_history @> jsonb_build_array(jsonb_build_object('from', public.get_crm_user_id()))
);

COMMIT;

-- ── Verification ──────────────────────────────────────────────────────
-- SELECT qual FROM pg_policies WHERE tablename = 'leads' AND policyname = 'leads_read';
