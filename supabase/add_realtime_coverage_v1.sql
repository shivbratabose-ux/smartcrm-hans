-- ══════════════════════════════════════════════════════════════════════
-- Migration: add_realtime_coverage_v1
-- ══════════════════════════════════════════════════════════════════════
-- Problem:
--   The supabase_realtime publication (schema.sql:745-752) only
--   includes 8 of the 16 entity tables. Eight tables — contracts,
--   targets, quotations, comm_logs, events, notes, files, users —
--   never emit realtime events. Any change a user / tab makes to
--   these tables only becomes visible to other browsers after a
--   manual reload.
--
--   Symptoms:
--     - Sales engineer creates a quote → sales rep doesn't see it
--       appear in the Quotations list until they refresh.
--     - Admin updates a user's role / deactivates them → that user's
--       other open tabs continue acting under the old role.
--     - Two reps editing the same contract concurrently → no live
--       conflict signal; last-write-wins on save.
--
-- Fix:
--   ALTER PUBLICATION to include the missing tables. The companion JS
--   change extends subscribeToAll in SmartCRM.jsx to register handlers
--   for all 16 modules.
--
-- Safety:
--   Re-runnable via DO block that catches duplicate_object — the
--   `ALTER PUBLICATION ... ADD TABLE` syntax errors if the table is
--   already a member, which would otherwise block the whole migration
--   on a partial re-run.
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'contracts',
    'targets',
    'quotations',
    'comm_logs',
    'events',
    'notes',
    'files',
    'users'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION
      WHEN duplicate_object THEN
        -- Already a member of the publication; nothing to do.
        NULL;
    END;
  END LOOP;
END $$;

COMMIT;
