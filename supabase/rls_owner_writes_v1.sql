-- ═══════════════════════════════════════════════════════════════════
-- RLS OWNER WRITES v1
-- ───────────────────────────────────────────────────────────────────
-- Enforces per-record ownership on UPDATE/DELETE so the database
-- itself rejects writes to records a user doesn't own or manage,
-- removing sole reliance on the client-side canEditRecord() check
-- in src/utils/helpers.jsx.
--
-- PROBLEM (before this migration)
--   Write policies are role-level only (e.g. "opps_write FOR ALL
--   USING (role NOT IN viewer/support)").  Any in-scope-role user
--   can UPDATE or DELETE any row via a direct API call, bypassing
--   the UI ownership gate.
--
-- SOLUTION
--   Split every FOR ALL write policy into three separate commands:
--     • FOR INSERT  WITH CHECK (true)          — permissive, unchanged
--     • FOR UPDATE  USING (<ownership check>)  — tightened
--     • FOR DELETE  USING (<ownership check>)  — tightened
--
--   A write is allowed only when the current user satisfies ONE of:
--     1. Global management role: admin | md | director | vp_sales_mkt
--     2. Finance role on financial tables: accounts / collections /
--        contracts  (mirrors the client's finance role gate)
--     3. Record owner  (owner / assigned / marketing_person column
--        equals get_crm_user_id())
--     4. Manager of the record owner — transitively via
--        users.reports_to (solid line) AND users.dotted_to[]
--        (dotted/matrix lines), computed by user_downline()
--
-- OUT OF SCOPE (left client-side)
--   Owner-granted access via Access Request comm_logs.  Enforcing
--   these grants server-side would require per-row JSON parsing
--   inside USING clauses, and the approval flow has a circular
--   dependency (the record owner must UPDATE a comm_log created by
--   the requester, but may not be in the requester's management
--   chain).  The client canEditRecord() / hasEditGrant() check
--   covers this path.
--
-- TABLES COVERED
--   accounts, leads, opportunities, activities, tickets, quotations,
--   contracts, collections, comm_logs, events, call_reports
--
-- SELECT policies are NOT changed.
--
-- PREREQUISITES
--   dotted_line_v1.sql must have been applied (adds users.reports_to,
--   users.dotted_to[], and the original user_downline() stub).
--   This migration adds SECURITY DEFINER + search_path to the
--   function so it runs safely from inside policy USING clauses.
--
-- IDEMPOTENT: every CREATE POLICY is preceded by DROP POLICY IF EXISTS.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ── Hierarchy helper ─────────────────────────────────────────────
-- Recursively walks the org chart downward from mgr_id, following
-- both the solid line (reports_to) and every dotted line (dotted_to[]).
-- Returns a set of user IDs: the manager themselves plus all
-- direct/transitive reports.
--
-- SECURITY DEFINER + fixed search_path: the function runs as its
-- definer (bypassing RLS on the users table), which is safe because
-- users_read is already USING(true).  The fixed search_path prevents
-- search-path injection attacks.
CREATE OR REPLACE FUNCTION public.user_downline(mgr_id TEXT)
RETURNS TABLE(user_id TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE tree AS (
    SELECT id FROM public.users WHERE id = mgr_id
    UNION
    SELECT u.id
      FROM public.users u
      JOIN tree t ON u.reports_to = t.id OR t.id = ANY(u.dotted_to)
  )
  SELECT id FROM tree;
$$;


-- ════════════════════════════════════════════════════════════════
-- ACCOUNTS  (owner field: owner)
-- Finance may UPDATE any account (billing approval, account-number
-- assignment, activation).  DELETE stays global + owner + manager
-- only — finance does not get blanket delete permission.
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "accounts_write"  ON public.accounts;
DROP POLICY IF EXISTS "accounts_insert" ON public.accounts;
DROP POLICY IF EXISTS "accounts_update" ON public.accounts;
DROP POLICY IF EXISTS "accounts_delete" ON public.accounts;

CREATE POLICY "accounts_insert" ON public.accounts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "accounts_update" ON public.accounts
  FOR UPDATE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','finance')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );

CREATE POLICY "accounts_delete" ON public.accounts
  FOR DELETE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );


-- ════════════════════════════════════════════════════════════════
-- LEADS  (owner field: owner)
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "leads_write"  ON public.leads;
DROP POLICY IF EXISTS "leads_insert" ON public.leads;
DROP POLICY IF EXISTS "leads_update" ON public.leads;
DROP POLICY IF EXISTS "leads_delete" ON public.leads;

CREATE POLICY "leads_insert" ON public.leads
  FOR INSERT WITH CHECK (true);

CREATE POLICY "leads_update" ON public.leads
  FOR UPDATE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );

CREATE POLICY "leads_delete" ON public.leads
  FOR DELETE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );


-- ════════════════════════════════════════════════════════════════
-- OPPORTUNITIES  (owner field: owner)
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "opps_write"  ON public.opportunities;
DROP POLICY IF EXISTS "opps_insert" ON public.opportunities;
DROP POLICY IF EXISTS "opps_update" ON public.opportunities;
DROP POLICY IF EXISTS "opps_delete" ON public.opportunities;

CREATE POLICY "opps_insert" ON public.opportunities
  FOR INSERT WITH CHECK (true);

CREATE POLICY "opps_update" ON public.opportunities
  FOR UPDATE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );

CREATE POLICY "opps_delete" ON public.opportunities
  FOR DELETE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );


-- ════════════════════════════════════════════════════════════════
-- ACTIVITIES  (owner field: owner)
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "activities_write"  ON public.activities;
DROP POLICY IF EXISTS "activities_insert" ON public.activities;
DROP POLICY IF EXISTS "activities_update" ON public.activities;
DROP POLICY IF EXISTS "activities_delete" ON public.activities;

CREATE POLICY "activities_insert" ON public.activities
  FOR INSERT WITH CHECK (true);

CREATE POLICY "activities_update" ON public.activities
  FOR UPDATE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );

CREATE POLICY "activities_delete" ON public.activities
  FOR DELETE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );


-- ════════════════════════════════════════════════════════════════
-- TICKETS  (owner field: assigned — the assignee is the de-facto owner)
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "tickets_write"  ON public.tickets;
DROP POLICY IF EXISTS "tickets_insert" ON public.tickets;
DROP POLICY IF EXISTS "tickets_update" ON public.tickets;
DROP POLICY IF EXISTS "tickets_delete" ON public.tickets;

CREATE POLICY "tickets_insert" ON public.tickets
  FOR INSERT WITH CHECK (true);

CREATE POLICY "tickets_update" ON public.tickets
  FOR UPDATE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR assigned = public.get_crm_user_id()
    OR assigned IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );

CREATE POLICY "tickets_delete" ON public.tickets
  FOR DELETE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR assigned = public.get_crm_user_id()
    OR assigned IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );


-- ════════════════════════════════════════════════════════════════
-- QUOTATIONS  (owner field: owner)
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "quotations_write"  ON public.quotations;
DROP POLICY IF EXISTS "quotations_insert" ON public.quotations;
DROP POLICY IF EXISTS "quotations_update" ON public.quotations;
DROP POLICY IF EXISTS "quotations_delete" ON public.quotations;

CREATE POLICY "quotations_insert" ON public.quotations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "quotations_update" ON public.quotations
  FOR UPDATE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );

CREATE POLICY "quotations_delete" ON public.quotations
  FOR DELETE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );


-- ════════════════════════════════════════════════════════════════
-- CONTRACTS  (owner field: owner)
-- Finance may UPDATE and DELETE contracts (billing-term management).
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "contracts_write"  ON public.contracts;
DROP POLICY IF EXISTS "contracts_insert" ON public.contracts;
DROP POLICY IF EXISTS "contracts_update" ON public.contracts;
DROP POLICY IF EXISTS "contracts_delete" ON public.contracts;

CREATE POLICY "contracts_insert" ON public.contracts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "contracts_update" ON public.contracts
  FOR UPDATE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','finance')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );

CREATE POLICY "contracts_delete" ON public.contracts
  FOR DELETE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','finance')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );


-- ════════════════════════════════════════════════════════════════
-- COLLECTIONS  (owner field: owner)
-- Finance may UPDATE and DELETE collections (invoice/payment management).
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "collections_write"  ON public.collections;
DROP POLICY IF EXISTS "collections_insert" ON public.collections;
DROP POLICY IF EXISTS "collections_update" ON public.collections;
DROP POLICY IF EXISTS "collections_delete" ON public.collections;

CREATE POLICY "collections_insert" ON public.collections
  FOR INSERT WITH CHECK (true);

CREATE POLICY "collections_update" ON public.collections
  FOR UPDATE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','finance')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );

CREATE POLICY "collections_delete" ON public.collections
  FOR DELETE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','finance')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );


-- ════════════════════════════════════════════════════════════════
-- COMM_LOGS  (owner field: owner)
-- Standard ownership applies.  Access Request approval (where the
-- record owner updates a comm_log created by the requester) is
-- handled client-side only — see note in file header.
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "comm_logs_write"  ON public.comm_logs;
DROP POLICY IF EXISTS "comm_logs_insert" ON public.comm_logs;
DROP POLICY IF EXISTS "comm_logs_update" ON public.comm_logs;
DROP POLICY IF EXISTS "comm_logs_delete" ON public.comm_logs;

CREATE POLICY "comm_logs_insert" ON public.comm_logs
  FOR INSERT WITH CHECK (true);

CREATE POLICY "comm_logs_update" ON public.comm_logs
  FOR UPDATE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );

CREATE POLICY "comm_logs_delete" ON public.comm_logs
  FOR DELETE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );


-- ════════════════════════════════════════════════════════════════
-- EVENTS  (owner field: owner)
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "events_write"  ON public.events;
DROP POLICY IF EXISTS "events_insert" ON public.events;
DROP POLICY IF EXISTS "events_update" ON public.events;
DROP POLICY IF EXISTS "events_delete" ON public.events;

CREATE POLICY "events_insert" ON public.events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "events_update" ON public.events
  FOR UPDATE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );

CREATE POLICY "events_delete" ON public.events
  FOR DELETE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR owner = public.get_crm_user_id()
    OR owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );


-- ════════════════════════════════════════════════════════════════
-- CALL_REPORTS  (owner field: marketing_person)
-- ════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "call_reports_write"  ON public.call_reports;
DROP POLICY IF EXISTS "call_reports_insert" ON public.call_reports;
DROP POLICY IF EXISTS "call_reports_update" ON public.call_reports;
DROP POLICY IF EXISTS "call_reports_delete" ON public.call_reports;

CREATE POLICY "call_reports_insert" ON public.call_reports
  FOR INSERT WITH CHECK (true);

CREATE POLICY "call_reports_update" ON public.call_reports
  FOR UPDATE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR marketing_person = public.get_crm_user_id()
    OR marketing_person IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );

CREATE POLICY "call_reports_delete" ON public.call_reports
  FOR DELETE USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
    OR marketing_person = public.get_crm_user_id()
    OR marketing_person IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))
  );


-- ════════════════════════════════════════════════════════════════
-- TABLES NOT CHANGED BY THIS MIGRATION
-- ════════════════════════════════════════════════════════════════
-- contacts  — FOR ALL write policy kept as-is (no owner column on
--             contacts; contact edits are always account-scoped)
-- targets   — managers-only write policy already correct
-- notes     — owner-scoped write kept as-is (low risk, no API surface)
-- files     — owner-scoped write kept as-is
-- users     — admin-only write, unchanged
-- audit_log — INSERT-only from app, unchanged

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
-- ROLLOUT NOTES
-- ═══════════════════════════════════════════════════════════════════
--
-- 1. APPLY ORDER
--    Must be applied AFTER:
--      • schema.sql               (base RLS + get_crm_user_id/role)
--      • add_reports_to_v1.sql    (users.reports_to column)
--      • dotted_line_v1.sql       (users.dotted_to[], user_downline())
--      • add_finance_role_v1.sql  (finance role policy names to drop)
--    May be applied before or after company_wide_read_v1.sql and
--    add_vp_sales_mkt_to_rls_v1.sql (those only touch SELECT).
--
-- 2. WHAT CHANGES FOR EACH ROLE
--    • admin / md / director / vp_sales_mkt — no change (still global)
--    • finance   — now restricted to own records + downline on
--                  leads/opps/activities/tickets/quotations/events/
--                  comm_logs/call_reports.  Full write on accounts/
--                  contracts/collections as before.
--    • line_mgr / country_mgr / bd_lead — previously any manager
--      could edit ANY record in their role class.  Now restricted to
--      their actual downline (records owned by direct/transitive
--      reports).  Managers with no reports_to assignments see only
--      their own records at the DB layer (same as the client
--      getScopedUserIds fallback-to-self path).
--    • sales_exec and all other non-global roles — restricted to
--      own records only.  No change in how their own records behave.
--    • viewer / support / tech_lead — INSERT is now wide-open
--      (WITH CHECK true); previously the FOR ALL USING gate blocked
--      them.  This is intentional: the spec says keep INSERT
--      permissive.  The canWrite() check in the UI still prevents
--      these roles from reaching the INSERT path.
--
-- 3. ACCESS REQUEST GRANTS (client-only)
--    The hasEditGrant() path in canEditRecord() continues to work
--    at the JS layer.  A user with an approved Access Request can
--    still submit the edit through the UI; the request reaches
--    Supabase and is rejected ONLY if the server-side ownership
--    check also fails.  To make grants enforceable end-to-end,
--    expose the approval action via a Supabase Edge Function that
--    runs with SERVICE_ROLE and performs both the comm_log update
--    and the guarded record update atomically.
--
-- 4. TESTING CHECKLIST
--    □ sales_exec A can update/delete their own lead, opp, account
--    □ sales_exec A CANNOT update/delete an opp owned by exec B
--    □ line_mgr can update records owned by their direct reports
--    □ line_mgr CANNOT update records owned by peers/other teams
--    □ finance can update accounts/contracts/collections they don't own
--    □ finance CANNOT update leads/opps/activities they don't own
--    □ admin/vp_sales_mkt can update any record
--    □ INSERT is allowed for all non-viewer roles (permissive gate)
-- ═══════════════════════════════════════════════════════════════════
