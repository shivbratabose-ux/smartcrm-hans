-- ═══════════════════════════════════════════════════════════════════
-- FIX ACCESS & VISIBILITY v1  —  run ONCE in the Supabase SQL Editor
-- ───────────────────────────────────────────────────────────────────
-- Symptom this fixes (diagnosed June 2026):
--   • sales_exec users (e.g. Amit Kumar Sharma) saw 0 deals/leads and
--     got "your role doesn't have permission" (42501) on save.
--   • Root causes found in the live DB:
--       1. company_wide_read_v1.sql was never applied → every _read
--          policy was scoped to "management role OR owner-in-downline",
--          so a sales_exec with no downline could read only their own
--          rows (and the post-insert read-back failed → 42501).
--       2. Some records carried orphaned owner ids (legacy/seed ids not
--          present in public.users), which no scoped user can read/edit.
--
-- What this script does (idempotent — safe to re-run):
--   PART 1  Re-assert the security-definer helper functions (active=true).
--   PART 2  COMPANY-WIDE READ: every role may SELECT all records.
--   PART 3  Reassign orphaned / null owners to the fallback admin so the
--           rows become visible + editable and stop failing to sync.
--
-- Writes are intentionally NOT changed here — the existing owner-or-manager
-- INSERT/UPDATE/DELETE policies already let a user write their own records;
-- Part 3 fixes the rows whose owner was wrong.
--
-- ⚠️ Before running: clear the Supabase "Outstanding invoices" alert — a
--    paused project won't sync no matter what these policies say.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ── PART 1 — helper functions ───────────────────────────────────────
-- get_crm_user_id / get_crm_role map the Supabase auth user → CRM user,
-- and require active=true (a deactivated user is denied automatically).
-- user_downline walks the org chart (solid reports_to + dotted_to[]).
CREATE OR REPLACE FUNCTION public.get_crm_user_id()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT id FROM public.users
  WHERE auth_user_id = auth.uid() AND active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_crm_role()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER STABLE
SET search_path = public AS $$
  SELECT role FROM public.users
  WHERE auth_user_id = auth.uid() AND active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_downline(mgr_id TEXT)
RETURNS TABLE(user_id TEXT) LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public AS $$
  WITH RECURSIVE tree AS (
    SELECT id FROM public.users WHERE id = mgr_id
    UNION
    SELECT u.id FROM public.users u
      JOIN tree t ON u.reports_to = t.id OR t.id = ANY(u.dotted_to)
  )
  SELECT id FROM tree;
$$;

-- ── PART 2 — company-wide READ (every role reads all records) ────────
-- Editing stays owner-scoped (existing *_write / *_update / *_delete
-- policies, unchanged). Only SELECT is opened here.
DROP POLICY IF EXISTS "accounts_read"     ON public.accounts;     CREATE POLICY "accounts_read"     ON public.accounts     FOR SELECT USING (true);
DROP POLICY IF EXISTS "contacts_read"     ON public.contacts;     CREATE POLICY "contacts_read"     ON public.contacts     FOR SELECT USING (true);
DROP POLICY IF EXISTS "leads_read"        ON public.leads;        CREATE POLICY "leads_read"        ON public.leads        FOR SELECT USING (true);
DROP POLICY IF EXISTS "opps_read"         ON public.opportunities;CREATE POLICY "opps_read"         ON public.opportunities FOR SELECT USING (true);
DROP POLICY IF EXISTS "activities_read"   ON public.activities;   CREATE POLICY "activities_read"   ON public.activities   FOR SELECT USING (true);
DROP POLICY IF EXISTS "call_reports_read" ON public.call_reports; CREATE POLICY "call_reports_read" ON public.call_reports FOR SELECT USING (true);
DROP POLICY IF EXISTS "tickets_read"      ON public.tickets;      CREATE POLICY "tickets_read"      ON public.tickets      FOR SELECT USING (true);
DROP POLICY IF EXISTS "contracts_read"    ON public.contracts;    CREATE POLICY "contracts_read"    ON public.contracts    FOR SELECT USING (true);
DROP POLICY IF EXISTS "collections_read"  ON public.collections;  CREATE POLICY "collections_read"  ON public.collections  FOR SELECT USING (true);
DROP POLICY IF EXISTS "targets_read"      ON public.targets;      CREATE POLICY "targets_read"      ON public.targets      FOR SELECT USING (true);
DROP POLICY IF EXISTS "quotations_read"   ON public.quotations;   CREATE POLICY "quotations_read"   ON public.quotations   FOR SELECT USING (true);
DROP POLICY IF EXISTS "comm_logs_read"    ON public.comm_logs;    CREATE POLICY "comm_logs_read"    ON public.comm_logs    FOR SELECT USING (true);
DROP POLICY IF EXISTS "events_read"       ON public.events;       CREATE POLICY "events_read"       ON public.events       FOR SELECT USING (true);
DROP POLICY IF EXISTS "notes_read"        ON public.notes;        CREATE POLICY "notes_read"        ON public.notes        FOR SELECT USING (true);
DROP POLICY IF EXISTS "files_read"        ON public.files;        CREATE POLICY "files_read"        ON public.files        FOR SELECT USING (true);

-- projects + invoices only if those tables exist in this schema.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='projects') THEN
    EXECUTE 'DROP POLICY IF EXISTS "projects_read" ON public.projects';
    EXECUTE 'CREATE POLICY "projects_read" ON public.projects FOR SELECT USING (true)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    EXECUTE 'DROP POLICY IF EXISTS "invoices_read" ON public.invoices';
    EXECUTE 'CREATE POLICY "invoices_read" ON public.invoices FOR SELECT USING (true)';
  END IF;
END $$;

-- ── PART 3 — reassign orphaned / null owners → fallback admin ────────
-- Fallback = the first active admin. Change the WHERE in this CTE if you
-- want a specific user (e.g. AND email='you@hansinfomatic.com').
-- Each UPDATE only touches rows whose owner is NULL or points at an id
-- that isn't a real public.users row, so valid ownership is preserved.
DO $$
DECLARE fb TEXT;
BEGIN
  SELECT id INTO fb FROM public.users
    WHERE role = 'admin' AND active = true ORDER BY id LIMIT 1;
  IF fb IS NULL THEN
    RAISE NOTICE 'No active admin found — skipping owner reassignment.';
    RETURN;
  END IF;

  UPDATE public.accounts      SET owner = fb            WHERE owner IS NULL            OR owner            NOT IN (SELECT id FROM public.users);
  UPDATE public.leads         SET owner = fb            WHERE owner IS NULL            OR owner            NOT IN (SELECT id FROM public.users);
  UPDATE public.opportunities SET owner = fb            WHERE owner IS NULL            OR owner            NOT IN (SELECT id FROM public.users);
  UPDATE public.activities    SET owner = fb            WHERE owner IS NULL            OR owner            NOT IN (SELECT id FROM public.users);
  UPDATE public.call_reports  SET marketing_person = fb WHERE marketing_person IS NULL OR marketing_person NOT IN (SELECT id FROM public.users);
  UPDATE public.tickets       SET assigned = fb         WHERE assigned IS NULL         OR assigned         NOT IN (SELECT id FROM public.users);
  UPDATE public.contracts     SET owner = fb            WHERE owner IS NULL            OR owner            NOT IN (SELECT id FROM public.users);
  UPDATE public.collections   SET owner = fb            WHERE owner IS NOT NULL        AND owner           NOT IN (SELECT id FROM public.users);
  UPDATE public.quotations    SET owner = fb            WHERE owner IS NULL            OR owner            NOT IN (SELECT id FROM public.users);
  UPDATE public.comm_logs     SET owner = fb            WHERE owner IS NULL            OR owner            NOT IN (SELECT id FROM public.users);
  UPDATE public.events        SET owner = fb            WHERE owner IS NULL            OR owner            NOT IN (SELECT id FROM public.users);

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='projects') THEN
    EXECUTE format('UPDATE public.projects SET owner = %L WHERE owner IS NULL OR owner NOT IN (SELECT id FROM public.users)', fb);
  END IF;
  -- targets uses user_id, not owner
  UPDATE public.targets       SET user_id = fb          WHERE user_id IS NULL          OR user_id          NOT IN (SELECT id FROM public.users);
END $$;

COMMIT;

-- ── VERIFY (run after committing) ───────────────────────────────────
-- 1) Reads are open everywhere:
--    SELECT tablename, policyname, qual FROM pg_policies
--    WHERE schemaname='public' AND cmd='SELECT' ORDER BY tablename;
-- 2) No orphaned owners remain (each should return 0):
--    SELECT count(*) FROM public.opportunities WHERE owner NOT IN (SELECT id FROM public.users);
--    SELECT count(*) FROM public.leads         WHERE owner NOT IN (SELECT id FROM public.users);
-- 3) Have Amit refresh the app — Pipeline/Leads should populate and the
--    "permission" toasts should stop.
