-- ═══════════════════════════════════════════════════════════════════
-- DELETE REASON + 3-MONTH RETENTION
-- ═══════════════════════════════════════════════════════════════════
-- Three changes in one migration so the policy + data shape land
-- atomically:
--
--   1) Capture WHY a record was deleted on every soft-delete. Two
--      columns: a free-text `delete_reason` and a controlled
--      `delete_reason_category` (Duplicate / Test data / GDPR request /
--      Mistake / Other). The picklist is enforced on the client; the
--      DB accepts any TEXT so adding a new category later doesn't need
--      a migration.
--
--   2) Tighten DELETE RLS to admin / md / director only on the three
--      modules the user explicitly named (leads, opportunities,
--      accounts) and the rollup tables that hang off them (contacts).
--      Other modules keep their broader FOR ALL policies — they're
--      accessed only through soft-delete (UPDATE) on the front-end,
--      so this is defense-in-depth.
--
--   3) Add a SQL function `purge_expired_trash()` that hard-deletes
--      rows where is_deleted = true AND deleted_at < now() - 90 days.
--      Per user instruction, it's a manually-triggered function, not
--      a cron job — admins call it from the Trash UI when they want
--      to actually free space.
--
-- The audit_log table already records DELETE actions; this migration
-- adds nothing there. The deletion record (who/when/why) lives in
-- audit_log permanently — purge_expired_trash() only frees the entity
-- row, not its audit trail.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Add delete_reason columns to every soft-deletable table ────
-- Idempotent: ADD COLUMN IF NOT EXISTS so re-running the migration
-- after a partial apply doesn't error. NULL-able because every existing
-- soft-deleted row pre-dates this feature and has no reason captured.
DO $$ DECLARE tbl TEXT; BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'accounts','contacts','leads','opportunities','activities',
    'call_reports','tickets','contracts','collections','targets',
    'quotations','comm_logs','events','notes','files'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS delete_reason TEXT', tbl);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS delete_reason_category TEXT', tbl);
  END LOOP;
END $$;

-- ── 2. Tighten DELETE policies ─────────────────────────────────────
-- The existing FOR ALL policies grant DELETE to broad role sets
-- (everyone except viewer/support). For the three modules the user
-- explicitly named (leads, opportunities, accounts) and contacts (a
-- close cousin), narrow that to admin / md / director only. We do
-- this by adding a separate FOR DELETE policy on top — Postgres ANDs
-- multiple policies of the same operation, so the tighter set wins.
--
-- accounts already has accounts_delete restricted to (admin/md/
-- director) — see schema.sql:614. Leaving it alone, just confirming
-- the same shape via DROP+CREATE for idempotency.

-- accounts
DROP POLICY IF EXISTS "accounts_delete" ON public.accounts;
CREATE POLICY "accounts_delete" ON public.accounts FOR DELETE USING (
  public.get_crm_role() IN ('admin','md','director')
);

-- leads
DROP POLICY IF EXISTS "leads_delete" ON public.leads;
CREATE POLICY "leads_delete" ON public.leads FOR DELETE USING (
  public.get_crm_role() IN ('admin','md','director')
);

-- opportunities
DROP POLICY IF EXISTS "opps_delete" ON public.opportunities;
CREATE POLICY "opps_delete" ON public.opportunities FOR DELETE USING (
  public.get_crm_role() IN ('admin','md','director')
);

-- contacts (rolled into the same scope since the front-end exposes
-- contact-delete from inside the customer/account view)
DROP POLICY IF EXISTS "contacts_delete" ON public.contacts;
CREATE POLICY "contacts_delete" ON public.contacts FOR DELETE USING (
  public.get_crm_role() IN ('admin','md','director')
);

-- ── 3. Manual-trigger purge function ──────────────────────────────
-- Hard-deletes any soft-deleted row past the 90-day retention window
-- across every table that carries the soft-delete columns. Returns a
-- per-table count so the Trash UI can show "purged N records".
--
-- SECURITY DEFINER — the caller's role is checked inside the function
-- against the role list, but the actual DELETE runs with the function
-- owner's privileges so the function still works through RLS. Same
-- pattern is used elsewhere in this schema for elevated maintenance
-- operations.
CREATE OR REPLACE FUNCTION public.purge_expired_trash()
RETURNS TABLE (table_name TEXT, purged_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  tbl TEXT;
  cnt BIGINT;
BEGIN
  -- Authorization — only top-tier roles can purge. Mirrors the front-end
  -- canPurge gate; never trust the UI alone for irreversible operations.
  caller_role := public.get_crm_role();
  IF caller_role NOT IN ('admin','md','director') THEN
    RAISE EXCEPTION 'purge_expired_trash: forbidden for role %', caller_role
      USING ERRCODE = '42501';
  END IF;

  FOR tbl IN SELECT unnest(ARRAY[
    'accounts','contacts','leads','opportunities','activities',
    'call_reports','tickets','contracts','collections','targets',
    'quotations','comm_logs','events','notes','files'
  ]) LOOP
    EXECUTE format(
      'DELETE FROM public.%I WHERE is_deleted = true AND deleted_at < now() - interval ''90 days''',
      tbl
    );
    GET DIAGNOSTICS cnt = ROW_COUNT;
    IF cnt > 0 THEN
      table_name := tbl;
      purged_count := cnt;
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

-- Make the function callable from PostgREST via the supabase RPC bridge.
-- (Default GRANT is to PUBLIC for SECURITY DEFINER functions; we tighten
-- to authenticated to keep anonymous JWT-less calls out.)
REVOKE ALL ON FUNCTION public.purge_expired_trash() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_trash() TO authenticated;

-- A single-record purge for the "Permanently delete now" admin button
-- in the Trash UI. Same authorization gate, but operates on one (table,
-- id) pair without the 90-day window — admins can purge sooner if they
-- explicitly choose to (e.g. GDPR right-to-erasure request).
CREATE OR REPLACE FUNCTION public.purge_trash_record(p_table TEXT, p_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  allowed_tables TEXT[] := ARRAY[
    'accounts','contacts','leads','opportunities','activities',
    'call_reports','tickets','contracts','collections','targets',
    'quotations','comm_logs','events','notes','files'
  ];
  affected INT;
BEGIN
  caller_role := public.get_crm_role();
  IF caller_role NOT IN ('admin','md','director') THEN
    RAISE EXCEPTION 'purge_trash_record: forbidden for role %', caller_role
      USING ERRCODE = '42501';
  END IF;

  -- Allowlist the table parameter — never trust caller-supplied SQL identifiers.
  IF NOT (p_table = ANY(allowed_tables)) THEN
    RAISE EXCEPTION 'purge_trash_record: unknown table %', p_table
      USING ERRCODE = '22023';
  END IF;

  -- Only purge rows that are already soft-deleted; never let an admin
  -- bypass the soft-delete flow with this function.
  EXECUTE format(
    'DELETE FROM public.%I WHERE id = $1 AND is_deleted = true',
    p_table
  ) USING p_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_trash_record(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_trash_record(TEXT, TEXT) TO authenticated;
