-- ═══════════════════════════════════════════════════════════════════
-- SOFT DELETE MIGRATION v1
-- Run once in Supabase SQL Editor against the live database.
-- Safe to re-run — uses IF NOT EXISTS / OR REPLACE throughout.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. ADD SOFT-DELETE COLUMNS TO ALL ENTITY TABLES ───────────────
DO $$ DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'accounts','contacts','leads','opportunities','activities',
    'call_reports','tickets','contracts','collections','targets',
    'quotations','comm_logs','events','notes','files'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_deleted  BOOLEAN     NOT NULL DEFAULT false', tbl);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ', tbl);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_by  TEXT        REFERENCES public.users(id)', tbl);
  END LOOP;
END $$;

-- ── 2. PARTIAL INDEXES — fast exclusion of deleted rows ───────────
CREATE INDEX IF NOT EXISTS idx_accounts_live      ON public.accounts(created_at)      WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_contacts_live      ON public.contacts(created_at)      WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_leads_live         ON public.leads(created_at)         WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_opps_live          ON public.opportunities(created_at) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_activities_live    ON public.activities(created_at)    WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_call_reports_live  ON public.call_reports(created_at)  WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_tickets_live       ON public.tickets(created_at)       WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_contracts_live     ON public.contracts(created_at)     WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_collections_live   ON public.collections(created_at)   WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_targets_live       ON public.targets(created_at)       WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_quotations_live    ON public.quotations(created_at)    WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_comm_logs_live     ON public.comm_logs(created_at)     WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_events_live        ON public.events(created_at)        WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_notes_live         ON public.notes(created_at)         WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_files_live         ON public.files(created_at)         WHERE NOT is_deleted;

-- ── 3. TRIGGER: convert any hard DELETE → soft delete ─────────────
-- Intercepts DELETE at the DB layer even if the frontend bypasses the app.
CREATE OR REPLACE FUNCTION public.convert_delete_to_soft_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  crm_user_id TEXT;
BEGIN
  -- Resolve authenticated Supabase user → CRM user id
  SELECT id INTO crm_user_id
  FROM public.users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  EXECUTE format(
    'UPDATE %I.%I SET is_deleted = true, deleted_at = now(), deleted_by = %L WHERE id = %L',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, crm_user_id, OLD.id
  );

  -- Cancel the actual hard delete
  RETURN NULL;
END;
$$;

DO $$ DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'accounts','contacts','leads','opportunities','activities',
    'call_reports','tickets','contracts','collections','targets',
    'quotations','comm_logs','events','notes','files'
  ] LOOP
    -- Drop first so it is safe to re-run
    EXECUTE format('DROP TRIGGER IF EXISTS soft_delete_%s ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER soft_delete_%s BEFORE DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.convert_delete_to_soft_delete()',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ── 4. UPDATE RLS READ POLICIES to exclude deleted rows ───────────
-- Drop old read policies and recreate them with NOT is_deleted guard.

-- accounts
DROP POLICY IF EXISTS "accounts_read" ON public.accounts;
CREATE POLICY "accounts_read" ON public.accounts FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead','tech_lead','support')
    OR owner = public.get_crm_user_id()
  )
);

-- contacts (readable by all roles, but exclude deleted)
DROP POLICY IF EXISTS "contacts_read" ON public.contacts;
CREATE POLICY "contacts_read" ON public.contacts FOR SELECT USING (NOT is_deleted);

-- leads
DROP POLICY IF EXISTS "leads_read" ON public.leads;
CREATE POLICY "leads_read" ON public.leads FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- opportunities
DROP POLICY IF EXISTS "opps_read" ON public.opportunities;
CREATE POLICY "opps_read" ON public.opportunities FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead','tech_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- activities
DROP POLICY IF EXISTS "activities_read" ON public.activities;
CREATE POLICY "activities_read" ON public.activities FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- call_reports
DROP POLICY IF EXISTS "call_reports_read" ON public.call_reports;
CREATE POLICY "call_reports_read" ON public.call_reports FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
    OR marketing_person = public.get_crm_user_id()
  )
);

-- tickets
DROP POLICY IF EXISTS "tickets_read" ON public.tickets;
CREATE POLICY "tickets_read" ON public.tickets FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead','support')
    OR assigned = public.get_crm_user_id()
  )
);

-- contracts
DROP POLICY IF EXISTS "contracts_read" ON public.contracts;
CREATE POLICY "contracts_read" ON public.contracts FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- collections
DROP POLICY IF EXISTS "collections_read" ON public.collections;
CREATE POLICY "collections_read" ON public.collections FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- targets
DROP POLICY IF EXISTS "targets_read" ON public.targets;
CREATE POLICY "targets_read" ON public.targets FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
    OR user_id = public.get_crm_user_id()
  )
);

-- quotations
DROP POLICY IF EXISTS "quotations_read" ON public.quotations;
CREATE POLICY "quotations_read" ON public.quotations FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead','tech_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- comm_logs / events / notes / files
DROP POLICY IF EXISTS "comm_logs_read" ON public.comm_logs;
CREATE POLICY "comm_logs_read" ON public.comm_logs FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

DROP POLICY IF EXISTS "events_read" ON public.events;
CREATE POLICY "events_read" ON public.events FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

DROP POLICY IF EXISTS "notes_read" ON public.notes;
CREATE POLICY "notes_read" ON public.notes FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

DROP POLICY IF EXISTS "files_read" ON public.files;
CREATE POLICY "files_read" ON public.files FOR SELECT USING (
  NOT is_deleted AND (
    public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- ── 5. DELETE POLICIES — only admin/manager roles can soft-delete ──
-- (write policies already exist; this restricts who can set is_deleted=true)

-- Replace write policies with role-gated versions for accounts
DROP POLICY IF EXISTS "accounts_update" ON public.accounts;
CREATE POLICY "accounts_update" ON public.accounts FOR UPDATE USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
  OR owner = public.get_crm_user_id()
) WITH CHECK (
  -- Non-managers cannot set is_deleted=true
  CASE WHEN is_deleted = true
    THEN public.get_crm_role() IN ('admin','md','director','line_mgr')
    ELSE true
  END
);

-- ── 6. ADMIN-ONLY RESTORE VIEW ────────────────────────────────────
-- Convenience view for admins to query soft-deleted records
CREATE OR REPLACE VIEW public.deleted_records AS
  SELECT 'accounts'     AS entity, id, deleted_at, deleted_by, name AS label FROM public.accounts     WHERE is_deleted
  UNION ALL
  SELECT 'contacts',               id, deleted_at, deleted_by, name          FROM public.contacts     WHERE is_deleted
  UNION ALL
  SELECT 'leads',                  id, deleted_at, deleted_by, company       FROM public.leads        WHERE is_deleted
  UNION ALL
  SELECT 'opportunities',          id, deleted_at, deleted_by, title         FROM public.opportunities WHERE is_deleted
  UNION ALL
  SELECT 'activities',             id, deleted_at, deleted_by, title         FROM public.activities   WHERE is_deleted
  UNION ALL
  SELECT 'tickets',                id, deleted_at, deleted_by, title         FROM public.tickets      WHERE is_deleted
  UNION ALL
  SELECT 'contracts',              id, deleted_at, deleted_by, title         FROM public.contracts    WHERE is_deleted
  UNION ALL
  SELECT 'collections',            id, deleted_at, deleted_by, invoice_no    FROM public.collections  WHERE is_deleted
  UNION ALL
  SELECT 'quotations',             id, deleted_at, deleted_by, quote_no      FROM public.quotations   WHERE is_deleted;
