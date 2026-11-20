-- Undo supabase/billing_phase1_v1.sql. Run only while billing_plans,
-- billing_entity_checks and billing_audit_log hold nothing you need: the
-- tables are dropped. Fails (by design) if an invoice uses a lifecycle status
-- or a debit type the original checks do not allow.

BEGIN;

DROP TRIGGER IF EXISTS trg_app_settings_billing_audit ON public.app_settings;
DROP FUNCTION IF EXISTS public.billing_masters_audit();
DROP TRIGGER IF EXISTS trg_billing_usage_audit ON public.billing_usage;
DROP TRIGGER IF EXISTS trg_billing_invoices_audit ON public.billing_invoices;
DROP TRIGGER IF EXISTS trg_billing_entity_checks_audit ON public.billing_entity_checks;
DROP TRIGGER IF EXISTS trg_billing_plans_audit ON public.billing_plans;
DROP FUNCTION IF EXISTS public.billing_audit();

ALTER TABLE public.billing_usage DROP COLUMN IF EXISTS plan_id;
ALTER TABLE public.billing_invoices DROP COLUMN IF EXISTS plan_id;
ALTER TABLE public.billing_invoices DROP CONSTRAINT IF EXISTS billing_invoices_type_check;
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_type_check CHECK (type IN ('invoice', 'credit'));
ALTER TABLE public.billing_invoices DROP CONSTRAINT IF EXISTS billing_invoices_status_check;
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_status_check CHECK (status = 'final');

DROP TABLE IF EXISTS public.billing_audit_log;
DROP TABLE IF EXISTS public.billing_entity_checks;
DROP TRIGGER IF EXISTS trg_billing_plans_guard ON public.billing_plans;
DROP FUNCTION IF EXISTS public.billing_plans_guard();
DROP TABLE IF EXISTS public.billing_plans;

COMMIT;
