-- Undo supabase/billing_phase2_v1.sql: back to the Phase 1 rules.
BEGIN;
DROP FUNCTION IF EXISTS public.decide_billing_plan(TEXT, TEXT, TEXT);

DROP POLICY IF EXISTS billing_plans_read ON public.billing_plans;
CREATE POLICY billing_plans_read ON public.billing_plans FOR SELECT USING (
  public.is_billing_desk()
  OR created_by = public.get_crm_user_id()
  OR EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = billing_plans.quote_id AND q.owner = public.get_crm_user_id())
);
DROP POLICY IF EXISTS billing_plans_insert ON public.billing_plans;
CREATE POLICY billing_plans_insert ON public.billing_plans FOR INSERT WITH CHECK (
  public.get_crm_user_id() IS NOT NULL
  AND (status IN ('draft', 'pending_approval') OR public.is_billing_desk())
);
DROP POLICY IF EXISTS billing_plans_update ON public.billing_plans;
CREATE POLICY billing_plans_update ON public.billing_plans FOR UPDATE USING (
  public.is_billing_desk()
  OR (status IN ('draft', 'pending_approval', 'rejected') AND created_by = public.get_crm_user_id())
);
DROP FUNCTION IF EXISTS public.billing_plan_visible(TEXT, TEXT, TEXT);
ALTER TABLE public.billing_plans DROP COLUMN IF EXISTS approval_route;
ALTER TABLE public.billing_plans DROP COLUMN IF EXISTS decision_note;
COMMIT;
