-- ═══════════════════════════════════════════════════════════════════
-- APP SETTINGS — split RLS into explicit INSERT / UPDATE / DELETE
-- ═══════════════════════════════════════════════════════════════════
-- Production is still surfacing:
--   "new row violates row-level security policy for table app_settings"
-- for users in the supposedly-allowed write set (admin, md, director,
-- vp_sales_mkt, line_mgr, country_mgr, bd_lead).
--
-- Two possible causes — this migration fixes both:
--
--   1) v2 (app_settings_v2_relax_rls.sql) was never actually run on
--      this Supabase project; the live policy is still the v1
--      admin/md-only one. The DROP IF EXISTS + idempotent re-create
--      below makes this safe to run regardless.
--
--   2) The combined "FOR ALL USING (...) WITH CHECK (...)" form bites
--      INSERT in some Supabase / PG versions the same way it bit the
--      users table (see supabase/users_rls_explicit_insert_v1.sql).
--      The split-policy form below is defensive — INSERT only checks
--      WITH CHECK, UPDATE checks both USING and WITH CHECK, DELETE
--      checks USING. No combined "FOR ALL" anywhere.
--
-- Read policy left alone (everyone needs masters to populate
-- dropdowns) — only the write side is restructured.
-- ═══════════════════════════════════════════════════════════════════

-- Drop ALL existing write-side policies on app_settings so we start
-- from a known state. DROP IF EXISTS is no-op when the policy doesn't
-- exist, so this is safe to re-run.
DROP POLICY IF EXISTS "app_settings_write"  ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_insert" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_update" ON public.app_settings;
DROP POLICY IF EXISTS "app_settings_delete" ON public.app_settings;

-- Allowed write roles. Kept in sync with v2: every role responsible
-- for adding / editing masters or catalogue rows. Excludes
-- sales_exec, tech_lead, support, viewer — they don't manage
-- reference data.
-- ── INSERT — only WITH CHECK is consulted by PG for new rows.
CREATE POLICY "app_settings_insert" ON public.app_settings
  FOR INSERT
  WITH CHECK (
    public.get_crm_role() IN (
      'admin', 'md', 'director', 'vp_sales_mkt',
      'line_mgr', 'country_mgr', 'bd_lead'
    )
  );

-- ── UPDATE — USING gates which rows are visible to update; WITH
--   CHECK gates the post-update state. Both required because RLS
--   would otherwise let a row through that satisfies USING but not
--   WITH CHECK after the patch.
CREATE POLICY "app_settings_update" ON public.app_settings
  FOR UPDATE
  USING (
    public.get_crm_role() IN (
      'admin', 'md', 'director', 'vp_sales_mkt',
      'line_mgr', 'country_mgr', 'bd_lead'
    )
  )
  WITH CHECK (
    public.get_crm_role() IN (
      'admin', 'md', 'director', 'vp_sales_mkt',
      'line_mgr', 'country_mgr', 'bd_lead'
    )
  );

-- ── DELETE — gated to admin / md / director only. Catalogue and
--   masters are append-mostly; full row delete is a destructive
--   admin operation. (The Masters UI doesn't actually delete the
--   app_settings row — only mutates the JSONB columns via UPDATE
--   — but we still need a policy so a manual SQL delete is
--   not silently allowed for line managers.)
CREATE POLICY "app_settings_delete" ON public.app_settings
  FOR DELETE
  USING (
    public.get_crm_role() IN ('admin', 'md', 'director')
  );

-- ── Diagnostics block — run this AFTER the migration to verify the
--   live policies match what we just wrote. Returns one row per
--   policy with its command type and the rendered USING / WITH CHECK
--   expressions. If the output shows the old "app_settings_write
--   FOR ALL" policy, the DROP above didn't reach this DB and you
--   should re-run with elevated privileges.
--
--   SELECT polname, cmd, pg_get_expr(polqual, polrelid) AS using_expr,
--          pg_get_expr(polwithcheck, polrelid) AS check_expr
--   FROM pg_policy
--   WHERE polrelid = 'public.app_settings'::regclass
--   ORDER BY polname;
