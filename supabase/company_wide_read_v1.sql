-- ═══════════════════════════════════════════════════════════════════
-- COMPANY-WIDE READ MIGRATION — run once against the live Supabase DB
-- ───────────────────────────────────────────────────────────────────
-- Policy change (Hans Infomatic, May 2026): EVERY role may READ all
-- records across the company. Editing stays owner-scoped and is enforced
-- by the existing *_write / *_update / *_delete policies (unchanged here)
-- plus the client-side canEditRecord() check + owner-granted access.
--
-- This replaces the role-gated SELECT policies (which limited sales_exec /
-- viewer to owner = self) with open reads. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- accounts
DROP POLICY IF EXISTS "accounts_read" ON public.accounts;
CREATE POLICY "accounts_read" ON public.accounts FOR SELECT USING (true);

-- contacts (already open, kept for completeness)
DROP POLICY IF EXISTS "contacts_read" ON public.contacts;
CREATE POLICY "contacts_read" ON public.contacts FOR SELECT USING (true);

-- leads
DROP POLICY IF EXISTS "leads_read" ON public.leads;
CREATE POLICY "leads_read" ON public.leads FOR SELECT USING (true);

-- opportunities
DROP POLICY IF EXISTS "opps_read" ON public.opportunities;
CREATE POLICY "opps_read" ON public.opportunities FOR SELECT USING (true);

-- activities
DROP POLICY IF EXISTS "activities_read" ON public.activities;
CREATE POLICY "activities_read" ON public.activities FOR SELECT USING (true);

-- call_reports
DROP POLICY IF EXISTS "call_reports_read" ON public.call_reports;
CREATE POLICY "call_reports_read" ON public.call_reports FOR SELECT USING (true);

-- tickets
DROP POLICY IF EXISTS "tickets_read" ON public.tickets;
CREATE POLICY "tickets_read" ON public.tickets FOR SELECT USING (true);

-- contracts
DROP POLICY IF EXISTS "contracts_read" ON public.contracts;
CREATE POLICY "contracts_read" ON public.contracts FOR SELECT USING (true);

-- collections
DROP POLICY IF EXISTS "collections_read" ON public.collections;
CREATE POLICY "collections_read" ON public.collections FOR SELECT USING (true);

-- targets
DROP POLICY IF EXISTS "targets_read" ON public.targets;
CREATE POLICY "targets_read" ON public.targets FOR SELECT USING (true);

-- quotations
DROP POLICY IF EXISTS "quotations_read" ON public.quotations;
CREATE POLICY "quotations_read" ON public.quotations FOR SELECT USING (true);

-- comm_logs (also carries Access Request entries — must be readable by all)
DROP POLICY IF EXISTS "comm_logs_read" ON public.comm_logs;
CREATE POLICY "comm_logs_read" ON public.comm_logs FOR SELECT USING (true);

-- events
DROP POLICY IF EXISTS "events_read" ON public.events;
CREATE POLICY "events_read" ON public.events FOR SELECT USING (true);

-- notes
DROP POLICY IF EXISTS "notes_read" ON public.notes;
CREATE POLICY "notes_read" ON public.notes FOR SELECT USING (true);

-- files
DROP POLICY IF EXISTS "files_read" ON public.files;
CREATE POLICY "files_read" ON public.files FOR SELECT USING (true);

-- invoices (only if the table exists in your schema)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='invoices') THEN
    EXECUTE 'DROP POLICY IF EXISTS "invoices_read" ON public.invoices';
    EXECUTE 'CREATE POLICY "invoices_read" ON public.invoices FOR SELECT USING (true)';
  END IF;
END $$;
