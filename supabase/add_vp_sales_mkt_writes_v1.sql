-- ══════════════════════════════════════════════════════════════════════
-- Migration: add_vp_sales_mkt_writes_v1
-- ══════════════════════════════════════════════════════════════════════
-- Problem:
--   add_vp_sales_mkt_to_rls_v1.sql added `vp_sales_mkt` to every READ
--   policy — and only to read policies. rls_owner_writes_v1.sql then
--   rebuilt most WRITE policies and did include the role, but it skipped
--   two tables. Its own closing note records the assumption that went
--   wrong (line 382):
--
--     -- targets   — managers-only write policy already correct
--
--   It was not correct. targets_write still reads
--     ('admin','md','director','line_mgr','country_mgr','bd_lead')
--   with no vp_sales_mkt, and the users write policies say
--     ('admin','md','director').
--
--   Meanwhile the client grants the VP write on both: helpers.jsx
--   `canRoleWrite()` returns true for every GLOBAL_ROLES member (which
--   includes vp_sales_mkt), and USER_ADMIN_ROLES is
--   ['admin','md','vp_sales_mkt'] — so the VP is shown the Team & Users
--   page and the Add Target button, the edit updates local state, and
--   then the sync push is rejected by RLS. The row survives until the
--   next reload and then disappears.
--
--   Symptom: VP Sales & Marketing adds a target, watches it appear,
--   reloads, and it is gone. Same for creating or editing a user.
--
--   This went unnoticed because it is a narrow gap. Every other write
--   path either uses a deny-list (`NOT IN ('viewer',…)`), which lets the
--   VP through by construction, or was rebuilt by rls_owner_writes_v1
--   with the role included. Only targets and users were missed.
--
-- Fix:
--   Add vp_sales_mkt to the two write paths that omit it. Re-runnable.
--
-- Deliberately NOT touched — these already grant the role, and
-- recreating them here would UNDO work:
--   - accounts_update / contracts_update / and the rest of the split
--     insert/update/delete set from rls_owner_writes_v1.sql. Those carry
--     a per-record ownership check (owner, plus the user_downline walk)
--     and a finance-role clause on the financial tables. Replacing any
--     of them with a role-only FOR ALL policy would silently drop the
--     ownership tightening that migration exists to enforce.
--   - Delete policies (contacts_delete, projects_delete, updates_delete,
--     users_admin_delete) stay ('admin','md','director'). That matches
--     the client's `canDelete` gate in SmartCRM.jsx, so both layers agree
--     the VP is not a deleter.
--   - app_settings_write and product_resources_write already include the
--     role; they were written after it existed.
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── targets ──────────────────────────────────────────────────────────
-- Role-level FOR ALL is intentional here and is NOT split into
-- insert/update/delete like the tables in rls_owner_writes_v1: targets
-- must not be self-settable, so "can I write this row" is a question
-- about the writer's role, never about owning the record. The VP owns
-- the company-level ABP and has to be able to enter and revise it.
-- Base shape: production_safety_v1.sql, keeping its non-null CRM user
-- guard.
DROP POLICY IF EXISTS "targets_write" ON public.targets;
CREATE POLICY "targets_write" ON public.targets FOR ALL USING (
  public.get_crm_user_id() IS NOT NULL
  AND public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','line_mgr','country_mgr','bd_lead')
);

-- ── users (INSERT / UPDATE) ──────────────────────────────────────────
-- Base shape: users_rls_explicit_insert_v1.sql, which split the old
-- users_admin_write FOR ALL policy because INSERT needs its own WITH
-- CHECK. Only the role list changes here.
--
-- users_admin_delete is left alone on purpose — see the header.
--
-- Note a pre-existing mismatch in the other direction: 'director' can
-- write users through the API but the client never shows them Team &
-- Users (USER_ADMIN_ROLES is ['admin','md','vp_sales_mkt']). Left as-is
-- because withdrawing a privilege is not this migration's job; raised in
-- the PR instead.
DROP POLICY IF EXISTS "users_admin_insert" ON public.users;
CREATE POLICY "users_admin_insert" ON public.users
  FOR INSERT
  WITH CHECK (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
  );

DROP POLICY IF EXISTS "users_admin_update" ON public.users;
CREATE POLICY "users_admin_update" ON public.users
  FOR UPDATE
  USING (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
  )
  WITH CHECK (
    public.get_crm_role() IN ('admin','md','director','vp_sales_mkt')
  );

COMMIT;

-- ══════════════════════════════════════════════════════════════════════
-- Verification — run after applying.
-- ══════════════════════════════════════════════════════════════════════
-- 1. The three policies above should each list vp_sales_mkt:
--
-- SELECT c.relname AS "table", p.polname AS policy,
--        CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
--                      WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
--                      ELSE 'ALL' END AS cmd,
--        pg_get_expr(p.polqual,      p.polrelid) AS using_expr,
--        pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
--   FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
--  WHERE p.polname IN ('targets_write','users_admin_insert','users_admin_update')
--  ORDER BY c.relname, p.polname;
--
-- 2. Sweep for any OTHER allow-list write policy still missing the role.
--    Should return only the delete policies listed in the header:
--
-- SELECT c.relname, p.polname,
--        pg_get_expr(p.polqual, p.polrelid) AS using_expr
--   FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
--  WHERE c.relnamespace = 'public'::regnamespace
--    AND p.polcmd <> 'r'
--    AND pg_get_expr(p.polqual, p.polrelid) LIKE '%line_mgr%'
--    AND pg_get_expr(p.polqual, p.polrelid) NOT LIKE '%vp_sales_mkt%'
--  ORDER BY c.relname;
--
-- 3. Confirm no leftover FOR ALL policy shadows the split ownership
--    policies from rls_owner_writes_v1 (a stray permissive policy would
--    OR away the ownership check). Expect zero rows:
--
-- SELECT c.relname, p.polname
--   FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
--  WHERE c.relnamespace = 'public'::regnamespace
--    AND p.polcmd = '*'
--    AND c.relname IN ('accounts','leads','opportunities','activities','tickets',
--                      'quotations','contracts','collections','comm_logs',
--                      'events','call_reports')
--  ORDER BY c.relname;
