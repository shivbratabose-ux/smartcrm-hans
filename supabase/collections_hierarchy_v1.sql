-- ═══════════════════════════════════════════════════════════════════
-- COLLECTIONS HIERARCHY RLS — run once after dotted_line_v1.sql
--
-- Brings collections.read in line with leads/opps/activities: any
-- manager (solid OR dotted line) sees their full downline; sales
-- execs see only their own. Global roles already pass through.
--
-- Depends on public.user_downline() created by dotted_line_v1.sql.
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "collections_read"  ON public.collections;
DROP POLICY IF EXISTS "collections_all"   ON public.collections;

CREATE POLICY "collections_read" ON public.collections FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','bd_lead')
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  OR owner IS NULL  -- finance-uploaded invoices not yet routed stay visible
);

-- Write policy unchanged from rls_tighten_v1.sql — managers and exec roles
-- can write; viewers/support/tech_lead cannot.
CREATE POLICY "collections_write" ON public.collections FOR ALL USING (
  public.get_crm_role() NOT IN ('viewer','support','tech_lead')
);
