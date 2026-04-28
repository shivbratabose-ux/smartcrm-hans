-- ══════════════════════════════════════════════════════════════════════
-- Migration: add_vp_sales_mkt_to_rls_v1
-- ══════════════════════════════════════════════════════════════════════
-- Problem:
--   The JS layer treats `vp_sales_mkt` as a global role
--   (src/utils/helpers.jsx:356 GLOBAL_ROLES) — meant to oversee every
--   sales / support / marketing record across the org. But the SQL RLS
--   read policies (schema.sql + soft_delete_v1.sql + rls_tighten_v1.sql)
--   only enumerate admin/md/director/line_mgr/country_mgr/bd_lead. So a
--   vp_sales_mkt user logs in: the client expects every row, but RLS
--   only returns rows they personally own.
--
--   Symptom: VP Sales & Marketing logs in and sees a near-empty CRM —
--   no team activity, no leads from anyone but themselves, no quotes /
--   contracts / collections from their downline.
--
-- Fix:
--   Drop and recreate every read policy with `vp_sales_mkt` added to
--   the privileged role list. Same NOT is_deleted guard. Re-runnable.
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── accounts ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "accounts_read" ON public.accounts;
CREATE POLICY "accounts_read" ON public.accounts FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','line_mgr','country_mgr','bd_lead','tech_lead','support')
    OR owner = public.get_crm_user_id()
  )
);

-- ── contacts ─────────────────────────────────────────────────────────
-- contacts are intentionally org-wide (NOT is_deleted only); no role
-- gating, so vp_sales_mkt is already covered. Re-state to be explicit.
DROP POLICY IF EXISTS "contacts_read" ON public.contacts;
CREATE POLICY "contacts_read" ON public.contacts FOR SELECT USING (NOT is_deleted);

-- ── leads ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "leads_read" ON public.leads;
CREATE POLICY "leads_read" ON public.leads FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- ── opportunities ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "opps_read" ON public.opportunities;
CREATE POLICY "opps_read" ON public.opportunities FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','line_mgr','country_mgr','bd_lead','tech_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- ── activities ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "activities_read" ON public.activities;
CREATE POLICY "activities_read" ON public.activities FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- ── call_reports ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "call_reports_read" ON public.call_reports;
CREATE POLICY "call_reports_read" ON public.call_reports FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','line_mgr','country_mgr','bd_lead')
    OR marketing_person = public.get_crm_user_id()
  )
);

-- ── tickets ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tickets_read" ON public.tickets;
CREATE POLICY "tickets_read" ON public.tickets FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','line_mgr','country_mgr','bd_lead','support')
    OR assigned = public.get_crm_user_id()
  )
);

-- ── contracts ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "contracts_read" ON public.contracts;
CREATE POLICY "contracts_read" ON public.contracts FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- ── collections ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "collections_read" ON public.collections;
CREATE POLICY "collections_read" ON public.collections FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- ── targets ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "targets_read" ON public.targets;
CREATE POLICY "targets_read" ON public.targets FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','line_mgr','country_mgr','bd_lead')
    OR user_id = public.get_crm_user_id()
  )
);

-- ── quotations ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "quotations_read" ON public.quotations;
CREATE POLICY "quotations_read" ON public.quotations FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','line_mgr','country_mgr','bd_lead','tech_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- ── comm_logs ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "comm_logs_read" ON public.comm_logs;
CREATE POLICY "comm_logs_read" ON public.comm_logs FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- ── events ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "events_read" ON public.events;
CREATE POLICY "events_read" ON public.events FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- ── notes ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notes_read" ON public.notes;
CREATE POLICY "notes_read" ON public.notes FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- ── files ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "files_read" ON public.files;
CREATE POLICY "files_read" ON public.files FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

COMMIT;
