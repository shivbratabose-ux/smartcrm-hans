-- ═══════════════════════════════════════════════════════════════════
-- RLS REASSIGN FIX v1 — allow handing a record to ANY user
-- ───────────────────────────────────────────────────────────────────
-- PROBLEM
--   rls_owner_writes_v1.sql created FOR UPDATE policies with a USING
--   clause but no WITH CHECK. For UPDATE, Postgres applies the USING
--   expression to BOTH the existing row (can I edit it?) AND the new
--   row (is the result allowed?) when WITH CHECK is omitted. Since
--   USING requires owner = me / my downline, reassigning a record to a
--   PEER (someone not in my downline) made the *new* row fail the
--   implicit check — so "assign this lead/deal to a teammate" was
--   silently rejected for non-global users.
--
-- FIX
--   Add WITH CHECK (true) to every owner-scoped UPDATE policy. The
--   write gate stays on the EXISTING row (USING: you must own/manage it
--   to edit it at all); once you can edit it, you may set the new owner
--   to anyone. Global roles and finance (on financial tables) are
--   unaffected — they already passed USING.
--
-- TABLES: accounts, leads, opportunities, activities, tickets,
--   quotations, contracts, collections, comm_logs, events,
--   call_reports, projects.
--
-- IDEMPOTENT: ALTER POLICY only sets WITH CHECK; re-running is safe.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

ALTER POLICY "accounts_update"     ON public.accounts      WITH CHECK (true);
ALTER POLICY "leads_update"        ON public.leads         WITH CHECK (true);
ALTER POLICY "opps_update"         ON public.opportunities WITH CHECK (true);
ALTER POLICY "activities_update"   ON public.activities    WITH CHECK (true);
ALTER POLICY "tickets_update"      ON public.tickets       WITH CHECK (true);
ALTER POLICY "quotations_update"   ON public.quotations    WITH CHECK (true);
ALTER POLICY "contracts_update"    ON public.contracts     WITH CHECK (true);
ALTER POLICY "collections_update"  ON public.collections   WITH CHECK (true);
ALTER POLICY "comm_logs_update"    ON public.comm_logs     WITH CHECK (true);
ALTER POLICY "events_update"       ON public.events        WITH CHECK (true);
ALTER POLICY "call_reports_update" ON public.call_reports  WITH CHECK (true);
ALTER POLICY "projects_update"     ON public.projects      WITH CHECK (true);

COMMIT;
