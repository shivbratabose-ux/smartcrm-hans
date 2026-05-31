-- ═══════════════════════════════════════════════════════════════════
-- ADD "Head GM – Product Delivery & Success" ROLE  (role id: product_head)
-- Run once against the live Supabase DB.
-- ───────────────────────────────────────────────────────────────────
-- users.role is plain TEXT (no CHECK), so the value is already accepted.
-- This migration only widens the WRITE policies this role needs to manage
-- delivery/customer records for the product(s) it owns:
--   • accounts  — onboarding / customer-experience edits
--   • contracts — implementation / delivery terms
-- Tickets & activities writes already allow any non-viewer role, so issues,
-- requirements and enhancements are covered without change. Reads are
-- company-wide (company_wide_read_v1.sql). Product-level scoping (only the
-- products this user line-manages) is enforced in the app via
-- canEditRecord() + catalog.lineManagerId. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- accounts: allow product_head to UPDATE
DROP POLICY IF EXISTS "accounts_update" ON public.accounts;
CREATE POLICY "accounts_update" ON public.accounts FOR UPDATE USING (
  public.get_crm_role() IN ('admin','md','director','finance','product_head','line_mgr','country_mgr','bd_lead')
  OR owner = public.get_crm_user_id()
);

-- contracts: allow product_head to write
DROP POLICY IF EXISTS "contracts_write" ON public.contracts;
CREATE POLICY "contracts_write" ON public.contracts FOR ALL USING (
  public.get_crm_role() IN ('admin','md','director','finance','product_head','line_mgr','country_mgr','bd_lead')
  OR owner = public.get_crm_user_id()
);
