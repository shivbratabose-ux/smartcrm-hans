-- ═══════════════════════════════════════════════════════════════════
-- RLS TIGHTEN MIGRATION — run once against the live Supabase DB
-- Replaces the broad USING (true) policies with owner-scoped ones.
-- Safe to re-run: drops before recreating.
-- ═══════════════════════════════════════════════════════════════════

-- ── call_reports ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "call_reports_all" ON public.call_reports;
CREATE POLICY "call_reports_read" ON public.call_reports FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
  OR marketing_person = public.get_crm_user_id()
);
CREATE POLICY "call_reports_write" ON public.call_reports FOR ALL USING (
  public.get_crm_role() NOT IN ('viewer')
);

-- ── tickets ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tickets_all" ON public.tickets;
CREATE POLICY "tickets_read" ON public.tickets FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead','support')
  OR assigned = public.get_crm_user_id()
);
CREATE POLICY "tickets_write" ON public.tickets FOR ALL USING (
  public.get_crm_role() NOT IN ('viewer')
);

-- ── contracts ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "contracts_all" ON public.contracts;
CREATE POLICY "contracts_read" ON public.contracts FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
  OR owner = public.get_crm_user_id()
);
CREATE POLICY "contracts_write" ON public.contracts FOR ALL USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
  OR owner = public.get_crm_user_id()
);

-- ── collections ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "collections_all" ON public.collections;
CREATE POLICY "collections_read" ON public.collections FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
  OR owner = public.get_crm_user_id()
);
CREATE POLICY "collections_write" ON public.collections FOR ALL USING (
  public.get_crm_role() NOT IN ('viewer','support','tech_lead')
);

-- ── targets ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "targets_all" ON public.targets;
CREATE POLICY "targets_read" ON public.targets FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
  OR user_id = public.get_crm_user_id()
);
CREATE POLICY "targets_write" ON public.targets FOR ALL USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
);

-- ── quotations ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "quotations_all" ON public.quotations;
CREATE POLICY "quotations_read" ON public.quotations FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead','tech_lead')
  OR owner = public.get_crm_user_id()
);
CREATE POLICY "quotations_write" ON public.quotations FOR ALL USING (
  public.get_crm_role() NOT IN ('viewer','support')
);

-- ── comm_logs ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "comm_logs_all" ON public.comm_logs;
CREATE POLICY "comm_logs_read" ON public.comm_logs FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
  OR owner = public.get_crm_user_id()
);
CREATE POLICY "comm_logs_write" ON public.comm_logs FOR ALL USING (
  public.get_crm_role() NOT IN ('viewer')
);

-- ── events ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "events_all" ON public.events;
CREATE POLICY "events_read" ON public.events FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
  OR owner = public.get_crm_user_id()
);
CREATE POLICY "events_write" ON public.events FOR ALL USING (
  public.get_crm_role() NOT IN ('viewer')
);

-- ── notes ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "notes_all" ON public.notes;
CREATE POLICY "notes_read" ON public.notes FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
  OR owner = public.get_crm_user_id()
);
CREATE POLICY "notes_write" ON public.notes FOR ALL USING (
  public.get_crm_role() NOT IN ('viewer')
);

-- ── files ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "files_all" ON public.files;
CREATE POLICY "files_read" ON public.files FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
  OR owner = public.get_crm_user_id()
);
CREATE POLICY "files_write" ON public.files FOR ALL USING (
  public.get_crm_role() NOT IN ('viewer')
);
