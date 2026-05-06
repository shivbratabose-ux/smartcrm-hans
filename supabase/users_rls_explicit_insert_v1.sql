-- ═══════════════════════════════════════════════════════════════════
-- USERS RLS — split FOR ALL into explicit INSERT / UPDATE / DELETE
-- ═══════════════════════════════════════════════════════════════════
-- Symptom in the field:
--   Cloud sync failed — users insert: new row violates row-level
--   security policy for table "users". Local changes are saved;
--   will retry on next edit.
--
-- Root cause:
--   The original users_admin_write policy was created as
--     FOR ALL USING (public.get_crm_role() IN ('admin','md','director'))
--   without an explicit WITH CHECK clause. Postgres documents that
--   USING is reused as WITH CHECK when the latter is missing — but
--   in practice, when policies are recreated post-launch (e.g. via a
--   later migration that drops + recreates), some Supabase deployments
--   end up with INSERT silently failing the WITH CHECK gate.
--
--   The portable fix is to declare each operation's policy explicitly:
--   INSERT gets WITH CHECK, UPDATE gets both, DELETE gets USING. No
--   ambiguity, same effective permission set.
--
-- Permission shape preserved:
--   - SELECT: every authenticated CRM user (untouched)
--   - INSERT / UPDATE / DELETE: admin, md, director only (same as before)
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- Drop the umbrella policy (and any prior split-policy attempts so
-- this migration is idempotent).
DROP POLICY IF EXISTS "users_admin_write"  ON public.users;
DROP POLICY IF EXISTS "users_admin_insert" ON public.users;
DROP POLICY IF EXISTS "users_admin_update" ON public.users;
DROP POLICY IF EXISTS "users_admin_delete" ON public.users;

-- INSERT — admins/md/director can create new user rows. WITH CHECK
-- is mandatory for INSERT; this is the gate that was silently failing
-- before. The check evaluates against the CURRENT user's CRM role
-- (not the new row's role), so it doesn't accidentally restrict the
-- role of users being created.
CREATE POLICY "users_admin_insert" ON public.users
  FOR INSERT
  WITH CHECK (
    public.get_crm_role() IN ('admin','md','director')
  );

-- UPDATE — same role gate, both for the existing row (USING) and the
-- updated row (WITH CHECK).
CREATE POLICY "users_admin_update" ON public.users
  FOR UPDATE
  USING (
    public.get_crm_role() IN ('admin','md','director')
  )
  WITH CHECK (
    public.get_crm_role() IN ('admin','md','director')
  );

-- DELETE — same role gate. Deleting users is rare; the application
-- prefers active=false toggles, but admins should still be able to
-- prune test/seed records.
CREATE POLICY "users_admin_delete" ON public.users
  FOR DELETE
  USING (
    public.get_crm_role() IN ('admin','md','director')
  );

-- SELECT policy is intentionally left alone (managed by
-- production_safety_v1.sql). Reading the user list is needed for
-- assignment dropdowns across the app, so it stays open to any
-- authenticated session.
