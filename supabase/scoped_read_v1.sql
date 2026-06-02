-- ═══════════════════════════════════════════════════════════════════
-- SCOPED READ v1  — hierarchy-scoped row visibility (reverses company-wide read)
-- ───────────────────────────────────────────────────────────────────
-- Replaces the company-wide SELECT policies from company_wide_read_v1.sql
-- (FOR SELECT USING (true)) with hierarchy-scoped read: each user can SELECT
-- only the rows they own plus their reporting-line downline (solid + dotted),
-- computed by public.user_downline().  This is the DB half of the "restrict to
-- own + team" model; the app half is the visible* selectors in SmartCRM.jsx.
--
-- WHO SEES WHAT
--   • admin / md / director / vp_sales_mkt — everything (global roles).
--   • finance — everything on the FINANCIAL tables (accounts, contracts,
--     collections, invoices) so it can run the account-number approval queue
--     and manage billing for records it doesn't own; scoped like anyone else
--     on the rest.
--   • line_mgr / country_mgr / bd_lead — own rows + their downline's rows.
--   • sales_exec and other non-global roles — own rows only (downline is just
--     themselves when they have no reports).
--   • product_head — scoped like a normal user here. Its product-scoped read
--     can't be expressed in SQL (product ownership lives in the app_settings
--     catalog JSONB), so product_head sees own + downline at the DB layer.
--
-- NOT CHANGED (stay company-wide)
--   contacts (no owner column; account-scoped), notes, files — left as
--   USING (true) from company_wide_read_v1.sql.
--
-- OWNER COLUMN PER TABLE
--   accounts.owner, leads.owner (the app's assignedTo aliases to owner),
--   opportunities.owner, activities.owner, call_reports.marketing_person,
--   tickets.assigned, contracts.owner, collections.owner (NULL = unrouted,
--   kept visible to scoped users), quotations.owner, comm_logs.owner,
--   events.owner, targets.user_id, projects.owner, invoices.owner.
--
-- PREREQUISITES
--   • dotted_line_v1.sql / rls_owner_writes_v1.sql — public.user_downline()
--   • production_safety_v1.sql — public.get_crm_role(), get_crm_user_id()
--   • company_wide_read_v1.sql — the policies this migration tightens
--
-- IDEMPOTENT: every CREATE POLICY is preceded by DROP POLICY IF EXISTS.
-- REVERSIBLE: re-run company_wide_read_v1.sql to go back to company-wide read.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- Reusable predicate fragments are inlined per policy (USING clauses can't
-- call a parameterised helper cleanly), so the shape repeats by design.

-- ── accounts (finance-extended) ──────────────────────────────────
DROP POLICY IF EXISTS "accounts_read" ON public.accounts;
CREATE POLICY "accounts_read" ON public.accounts FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','finance')
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- ── leads (owner = app's assignedTo) ─────────────────────────────
DROP POLICY IF EXISTS "leads_read" ON public.leads;
CREATE POLICY "leads_read" ON public.leads FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- ── opportunities ────────────────────────────────────────────────
DROP POLICY IF EXISTS "opps_read" ON public.opportunities;
CREATE POLICY "opps_read" ON public.opportunities FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- ── activities ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "activities_read" ON public.activities;
CREATE POLICY "activities_read" ON public.activities FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- ── call_reports (owner = marketing_person) ──────────────────────
DROP POLICY IF EXISTS "call_reports_read" ON public.call_reports;
CREATE POLICY "call_reports_read" ON public.call_reports FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
  OR marketing_person = public.get_crm_user_id()
  OR marketing_person IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- ── tickets (owner = assigned) ───────────────────────────────────
DROP POLICY IF EXISTS "tickets_read" ON public.tickets;
CREATE POLICY "tickets_read" ON public.tickets FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
  OR assigned = public.get_crm_user_id()
  OR assigned IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- ── contracts (finance-extended) ─────────────────────────────────
DROP POLICY IF EXISTS "contracts_read" ON public.contracts;
CREATE POLICY "contracts_read" ON public.contracts FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','finance')
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- ── collections (finance-extended; NULL owner = unrouted, kept visible) ──
DROP POLICY IF EXISTS "collections_read" ON public.collections;
CREATE POLICY "collections_read" ON public.collections FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','finance')
  OR owner IS NULL
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- ── quotations ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "quotations_read" ON public.quotations;
CREATE POLICY "quotations_read" ON public.quotations FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- ── comm_logs ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "comm_logs_read" ON public.comm_logs;
CREATE POLICY "comm_logs_read" ON public.comm_logs FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- ── events ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "events_read" ON public.events;
CREATE POLICY "events_read" ON public.events FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- ── targets (owner = user_id) ────────────────────────────────────
DROP POLICY IF EXISTS "targets_read" ON public.targets;
CREATE POLICY "targets_read" ON public.targets FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
  OR user_id = public.get_crm_user_id()
  OR user_id IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- ── projects (read was USING(true) in add_projects_v1.sql) ────────
DROP POLICY IF EXISTS "projects_read" ON public.projects;
CREATE POLICY "projects_read" ON public.projects FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
  OR owner = public.get_crm_user_id()
  OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
);

-- ── invoices (optional table; finance-extended) ──────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='invoices') THEN
    EXECUTE 'DROP POLICY IF EXISTS "invoices_read" ON public.invoices';
    EXECUTE $p$CREATE POLICY "invoices_read" ON public.invoices FOR SELECT USING (
      public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','finance')
      OR owner = public.get_crm_user_id()
      OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
    )$p$;
  END IF;
END $$;

-- contacts / notes / files: intentionally left company-wide (USING true).

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- IMPORTANT: this depends on a populated org chart. A manager only sees a
-- report's rows if that report's users.reports_to (or dotted_to[]) chains up
-- to the manager. Run this to find users with no manager set:
--
--   SELECT name, email, role FROM public.users
--   WHERE active = true AND reports_to IS NULL
--     AND role NOT IN ('admin','md','director','vp_sales_mkt');
--
-- Any manager-type role there (or whose reports lack reports_to) will see only
-- their own rows until the chart is filled in.
-- ═══════════════════════════════════════════════════════════════════
