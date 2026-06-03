-- ═══════════════════════════════════════════════════════════════════
-- SCOPED READ — SUPPORT TEAM ACCESS v1
-- ───────────────────────────────────────────────────────────────────
-- The support team (support engineers, tech leads) service tickets, which
-- must link to an account they usually don't own. Under hierarchy-scoped
-- read they saw none of those records, so they couldn't create or work
-- tickets. This grants the support roles company-wide READ on accounts,
-- leads, opportunities and tickets (like finance has on financial tables),
-- and lets them UPDATE any ticket.
--
-- Roles added to the broad-read set: 'support', 'tech_lead'.
-- Contacts are already company-wide (USING true) from company_wide_read_v1.
--
-- Reversible: re-run scoped_read_v1.sql to drop the support roles from these
-- read policies. IDEMPOTENT: DROP POLICY IF EXISTS precedes each CREATE.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- accounts (keep finance; add support, tech_lead)
DROP POLICY IF EXISTS "accounts_read" ON public.accounts;
CREATE POLICY "accounts_read" ON public.accounts FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','finance','support','tech_lead')
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- leads
DROP POLICY IF EXISTS "leads_read" ON public.leads;
CREATE POLICY "leads_read" ON public.leads FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','support','tech_lead')
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- opportunities
DROP POLICY IF EXISTS "opps_read" ON public.opportunities;
CREATE POLICY "opps_read" ON public.opportunities FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','support','tech_lead')
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- tickets (read all; owner field is `assigned`)
DROP POLICY IF EXISTS "tickets_read" ON public.tickets;
CREATE POLICY "tickets_read" ON public.tickets FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','support','tech_lead')
  OR assigned = public.get_crm_user_id()
  OR assigned IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- tickets UPDATE: support team can update any ticket. WITH CHECK (true) so a
-- ticket can be reassigned to anyone (matches rls_reassign_fix_v1).
DROP POLICY IF EXISTS "tickets_update" ON public.tickets;
CREATE POLICY "tickets_update" ON public.tickets
  FOR UPDATE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','support','tech_lead')
    OR assigned = public.get_crm_user_id()
    OR assigned IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  )
  WITH CHECK (true);

COMMIT;
