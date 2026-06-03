-- ═══════════════════════════════════════════════════════════════════
-- VERIFY SYNC — read-only check that the live DB matches the last few
-- days of migrations. Changes nothing. Every row should read 'OK'.
-- Anything 'MISSING' → run the named migration file (all are idempotent).
-- ═══════════════════════════════════════════════════════════════════
WITH checks AS (
  SELECT 'app_settings.ai_config (add_ai_config_v1)' AS item,
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_settings' AND column_name='ai_config') AS ok
  UNION ALL SELECT 'opportunities.is_tender (add_tender_fields_v1)',
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='opportunities' AND column_name='is_tender')
  UNION ALL SELECT 'opportunities.bid_qualification (add_bid_qualification_v1)',
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='opportunities' AND column_name='bid_qualification')
  UNION ALL SELECT 'opportunities.bid_instruments (add_tender_register_v1)',
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='opportunities' AND column_name='bid_instruments')
  UNION ALL SELECT 'projects table (add_projects_v1)',
         EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='projects')
  UNION ALL SELECT 'quotations.cc_contact_ids (fix_quotation_columns_v1)',
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='quotations' AND column_name='cc_contact_ids')
  UNION ALL SELECT 'accounts.erp_account_no = FinID (add_erp_account_no_v1)',
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='accounts' AND column_name='erp_account_no')
  UNION ALL SELECT 'users.reports_to (add_reports_to_v1)',
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='reports_to')
  UNION ALL SELECT 'users.dotted_to (dotted_line_v1)',
         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='dotted_to')
  UNION ALL SELECT 'fn user_downline (rls_owner_writes_v1 / dotted_line_v1)',
         EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='user_downline')
  UNION ALL SELECT 'scoped read policy leads_read (scoped_read_v1)',
         EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='leads_read')
  UNION ALL SELECT 'scoped read NOT company-wide (leads_read qual <> true)',
         EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='leads_read' AND coalesce(qual,'') <> 'true')
  UNION ALL SELECT 'owner-write policy leads_update (rls_owner_writes_v1)',
         EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='leads_update')
  UNION ALL SELECT 'reassign fix: leads_update has WITH CHECK (rls_reassign_fix_v1)',
         EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='leads_update' AND with_check IS NOT NULL)
)
SELECT item,
       CASE WHEN ok THEN 'OK' ELSE 'MISSING — run the named migration' END AS status
FROM checks
ORDER BY status DESC, item;
