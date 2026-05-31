-- ═══════════════════════════════════════════════════════════════════
-- ADD FINANCE ROLE — run once against the live Supabase DB
-- ───────────────────────────────────────────────────────────────────
-- Introduces the new 'finance' role. The users.role column is plain TEXT
-- (no CHECK constraint), so the value is already accepted — this migration
-- only widens the RLS WRITE policies that gate Finance's job:
--   • accounts  — Finance approves new accounts & issues account numbers
--                 (an UPDATE on accounts they typically don't own).
--   • contracts — Finance manages billing terms / contract financials.
-- Collections writes already allow Finance (collections_write only excludes
-- viewer/support/tech_lead). Reads are company-wide (see
-- company_wide_read_v1.sql). Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- accounts: allow Finance to UPDATE (approve / activate / set account no.)
DROP POLICY IF EXISTS "accounts_update" ON public.accounts;
CREATE POLICY "accounts_update" ON public.accounts FOR UPDATE USING (
  public.get_crm_role() IN ('admin','md','director','finance','line_mgr','country_mgr','bd_lead')
  OR owner = public.get_crm_user_id()
);

-- contracts: allow Finance to write
DROP POLICY IF EXISTS "contracts_write" ON public.contracts;
CREATE POLICY "contracts_write" ON public.contracts FOR ALL USING (
  public.get_crm_role() IN ('admin','md','director','finance','line_mgr','country_mgr','bd_lead')
  OR owner = public.get_crm_user_id()
);
