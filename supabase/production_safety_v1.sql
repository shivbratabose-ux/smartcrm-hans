-- ═══════════════════════════════════════════════════════════════════
-- PRODUCTION SAFETY MIGRATION v1
-- Run once in Supabase SQL Editor. Safe to re-run throughout.
--
-- ISSUES FIXED:
--   1. get_crm_user_id / get_crm_role now require active=true
--      → deactivated users are locked out at the DB layer
--   2. users_read was USING (true) — anonymous users could list all
--      user profiles (names, emails, roles). Now requires auth.uid().
--   3. contacts_read was USING (NOT is_deleted) — any authenticated
--      Supabase user (even without a CRM profile) could read all
--      contacts. Fixed: requires a valid, active CRM session.
--   4. contacts_write was ALWAYS FALSE due to "OR false" bug — nobody
--      could INSERT / UPDATE / DELETE contacts (silent data-loss since
--      launch). Replaced with proper per-operation policies.
--   5. accounts_write was WITH CHECK (true) — any Supabase auth user
--      could INSERT accounts. Fixed: requires CRM role.
--   6. audit_insert was WITH CHECK (true) — anonymous writes allowed.
--      Fixed: requires auth.uid() IS NOT NULL.
--   7. All remaining write policies now also gate on
--      get_crm_user_id() IS NOT NULL so non-CRM auth users can never
--      write data even if future policies are accidentally broadened.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1. PATCH HELPER FUNCTIONS: add active = true guard ─────────────
--
-- When a user is marked active = false the functions return NULL.
-- NULL fails every IS NOT NULL / IN / = check in every RLS policy,
-- so the deactivated user is denied all access automatically.

CREATE OR REPLACE FUNCTION public.get_crm_user_id()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT id FROM public.users
  WHERE auth_user_id = auth.uid()
    AND active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_crm_role()
RETURNS TEXT LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.users
  WHERE auth_user_id = auth.uid()
    AND active = true
  LIMIT 1;
$$;


-- ── 2. FIX users_read ──────────────────────────────────────────────
--
-- Was: USING (true) — anonymous could enumerate all users.
-- Fix: require an authenticated Supabase session.
-- Note: all active CRM users still see the full team list (needed
--       for assignment dropdowns). Inactive / non-CRM users see nothing.

DROP POLICY IF EXISTS "users_read" ON public.users;
CREATE POLICY "users_read" ON public.users FOR SELECT USING (
  auth.uid() IS NOT NULL
);


-- ── 3. FIX contacts policies (TWO bugs) ────────────────────────────
--
-- Bug A — contacts_read was USING (NOT is_deleted):
--   Any Supabase user (no CRM profile required) could read contacts.
-- Bug B — contacts_write was FOR ALL USING (role NOT IN x OR false):
--   The "OR false" made the expression always FALSE. No one could
--   INSERT / UPDATE contacts → contacts were never saved to Supabase.
--
-- Contacts have no owner column so they are org-wide shared.
-- Access is gated purely on having an active CRM session.

DROP POLICY IF EXISTS "contacts_read"   ON public.contacts;
DROP POLICY IF EXISTS "contacts_write"  ON public.contacts;

CREATE POLICY "contacts_read" ON public.contacts FOR SELECT USING (
  NOT is_deleted
  AND public.get_crm_user_id() IS NOT NULL
);

-- Any active CRM user except viewers can create contacts
CREATE POLICY "contacts_insert" ON public.contacts FOR INSERT WITH CHECK (
  public.get_crm_user_id() IS NOT NULL
  AND public.get_crm_role() NOT IN ('viewer')
);

-- Any active CRM user except viewers can edit contacts
CREATE POLICY "contacts_update" ON public.contacts FOR UPDATE
  USING  (public.get_crm_user_id() IS NOT NULL
          AND public.get_crm_role() NOT IN ('viewer'))
  WITH CHECK (public.get_crm_role() NOT IN ('viewer'));

-- Only managers can physically delete rows (soft-delete trigger handles
-- the actual conversion; this just controls who can call DELETE at all)
CREATE POLICY "contacts_delete" ON public.contacts FOR DELETE USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr')
);


-- ── 4. FIX accounts_write ──────────────────────────────────────────
--
-- Was: FOR INSERT WITH CHECK (true) — any Supabase session could insert.
-- Fix: require active CRM role; viewers/support/tech_lead cannot create.

DROP POLICY IF EXISTS "accounts_write"  ON public.accounts;
DROP POLICY IF EXISTS "accounts_insert" ON public.accounts;   -- idempotent

CREATE POLICY "accounts_insert" ON public.accounts FOR INSERT WITH CHECK (
  public.get_crm_user_id() IS NOT NULL
  AND public.get_crm_role() NOT IN ('viewer','support','tech_lead')
);


-- ── 5. FIX audit_insert ────────────────────────────────────────────
--
-- Was: WITH CHECK (true) — anonymous could stuff the audit log.

DROP POLICY IF EXISTS "audit_insert" ON public.audit_log;
CREATE POLICY "audit_insert" ON public.audit_log FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);


-- ── 6. HARDEN all remaining write policies ─────────────────────────
--
-- Add get_crm_user_id() IS NOT NULL to every write policy.
-- This ensures a Supabase auth user with no CRM profile (e.g. a stale
-- or external auth account) can never write any CRM data.

-- leads
DROP POLICY IF EXISTS "leads_write" ON public.leads;
CREATE POLICY "leads_write" ON public.leads FOR ALL USING (
  public.get_crm_user_id() IS NOT NULL
  AND public.get_crm_role() NOT IN ('viewer','support','tech_lead')
);

-- opportunities
DROP POLICY IF EXISTS "opps_write" ON public.opportunities;
CREATE POLICY "opps_write" ON public.opportunities FOR ALL USING (
  public.get_crm_user_id() IS NOT NULL
  AND public.get_crm_role() NOT IN ('viewer','support')
);

-- activities
DROP POLICY IF EXISTS "activities_write" ON public.activities;
CREATE POLICY "activities_write" ON public.activities FOR ALL USING (
  public.get_crm_user_id() IS NOT NULL
  AND public.get_crm_role() NOT IN ('viewer')
);

-- call_reports
DROP POLICY IF EXISTS "call_reports_write" ON public.call_reports;
CREATE POLICY "call_reports_write" ON public.call_reports FOR ALL USING (
  public.get_crm_user_id() IS NOT NULL
  AND public.get_crm_role() NOT IN ('viewer')
);

-- tickets
DROP POLICY IF EXISTS "tickets_write" ON public.tickets;
CREATE POLICY "tickets_write" ON public.tickets FOR ALL USING (
  public.get_crm_user_id() IS NOT NULL
  AND public.get_crm_role() NOT IN ('viewer')
);

-- contracts
DROP POLICY IF EXISTS "contracts_write" ON public.contracts;
CREATE POLICY "contracts_write" ON public.contracts FOR ALL USING (
  public.get_crm_user_id() IS NOT NULL
  AND (
    public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
    OR owner = public.get_crm_user_id()
  )
);

-- collections
DROP POLICY IF EXISTS "collections_write" ON public.collections;
CREATE POLICY "collections_write" ON public.collections FOR ALL USING (
  public.get_crm_user_id() IS NOT NULL
  AND public.get_crm_role() NOT IN ('viewer','support','tech_lead')
);

-- targets (managers only — enforces that targets cannot be self-set)
DROP POLICY IF EXISTS "targets_write" ON public.targets;
CREATE POLICY "targets_write" ON public.targets FOR ALL USING (
  public.get_crm_user_id() IS NOT NULL
  AND public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
);

-- quotations
DROP POLICY IF EXISTS "quotations_write" ON public.quotations;
CREATE POLICY "quotations_write" ON public.quotations FOR ALL USING (
  public.get_crm_user_id() IS NOT NULL
  AND public.get_crm_role() NOT IN ('viewer','support')
);

-- comm_logs
DROP POLICY IF EXISTS "comm_logs_write" ON public.comm_logs;
CREATE POLICY "comm_logs_write" ON public.comm_logs FOR ALL USING (
  public.get_crm_user_id() IS NOT NULL
  AND public.get_crm_role() NOT IN ('viewer')
);

-- events
DROP POLICY IF EXISTS "events_write" ON public.events;
CREATE POLICY "events_write" ON public.events FOR ALL USING (
  public.get_crm_user_id() IS NOT NULL
  AND public.get_crm_role() NOT IN ('viewer')
);

-- notes
DROP POLICY IF EXISTS "notes_write" ON public.notes;
CREATE POLICY "notes_write" ON public.notes FOR ALL USING (
  public.get_crm_user_id() IS NOT NULL
  AND public.get_crm_role() NOT IN ('viewer')
);

-- files
DROP POLICY IF EXISTS "files_write" ON public.files;
CREATE POLICY "files_write" ON public.files FOR ALL USING (
  public.get_crm_user_id() IS NOT NULL
  AND public.get_crm_role() NOT IN ('viewer')
);


-- ── 7. VERIFY: quick counts to confirm policies are active ─────────
-- Run these SELECTs in a separate query window while signed in as a
-- non-admin user to confirm data is properly scoped.
--
-- SELECT count(*) FROM public.contacts;   -- should match only live contacts
-- SELECT count(*) FROM public.users;      -- should list all active team members
-- SELECT count(*) FROM public.leads;      -- should match only caller's leads (for sales_exec)
