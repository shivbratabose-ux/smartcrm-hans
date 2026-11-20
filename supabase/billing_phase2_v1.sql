-- Billing module, Phase 2: plan visibility and approval (decisions 20 Nov 2026).
-- Undo: supabase/billing_phase2_v1_down.sql.
--
--  * Sales see only their own accounts' plans; managers see their team's;
--    the billing desk and management see all.
--  * Version 1 (the accepted quote's agreement) is written as 'active' the
--    first time a plan is amended, by the quote's owner or the billing desk.
--  * decide_billing_plan(id, 'approve' | 'reject', note): one atomic step.
--    Approve: the previous active version ends the day before the new one
--    takes effect, the new one becomes active, the approver is recorded.
--    A plan within the rep's discount authority is approved by the account
--    owner; above it by an approver (management roles, Line Manager, or the
--    people named in Quotation Rules → approval levels). The app decides the
--    exact level; the database refuses anyone who could never approve.

BEGIN;

ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS decision_note TEXT;
ALTER TABLE public.billing_plans ADD COLUMN IF NOT EXISTS approval_route TEXT;   -- 'owner' | level label, set on submit

CREATE OR REPLACE FUNCTION public.billing_plan_visible(p_account TEXT, p_quote TEXT, p_created_by TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_billing_desk()
      OR public.get_crm_role() IN ('admin', 'md', 'director', 'vp_sales_mkt')
      OR p_created_by = public.get_crm_user_id()
      OR EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = p_quote AND q.owner = public.get_crm_user_id())
      OR EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = p_account
                 AND (a.owner = public.get_crm_user_id()
                      OR a.owner IN (SELECT user_id FROM public.user_downline(public.get_crm_user_id()))));
$$;

DROP POLICY IF EXISTS billing_plans_read ON public.billing_plans;
CREATE POLICY billing_plans_read ON public.billing_plans FOR SELECT
  USING (public.billing_plan_visible(account_id, quote_id, created_by));

-- Drafts and submissions by anyone who can see the account; version 1 of an
-- accepted quote may be written as active by its owner or the billing desk.
DROP POLICY IF EXISTS billing_plans_insert ON public.billing_plans;
CREATE POLICY billing_plans_insert ON public.billing_plans FOR INSERT WITH CHECK (
  public.billing_plan_visible(account_id, quote_id, created_by)
  AND (
    status IN ('draft', 'pending_approval')
    OR (version = 1 AND status = 'active' AND EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = quote_id AND q.status = 'Accepted'
          AND (q.owner = public.get_crm_user_id() OR public.is_billing_desk())))
  )
);

-- Editing a draft or a sent-back version, and submitting it: its author or the billing desk.
-- Approving is only through decide_billing_plan().
DROP POLICY IF EXISTS billing_plans_update ON public.billing_plans;
CREATE POLICY billing_plans_update ON public.billing_plans FOR UPDATE
  USING (status IN ('draft', 'rejected', 'pending_approval') AND (created_by = public.get_crm_user_id() OR public.is_billing_desk()))
  WITH CHECK (status IN ('draft', 'rejected', 'pending_approval'));

CREATE OR REPLACE FUNCTION public.decide_billing_plan(p_id TEXT, p_decision TEXT, p_note TEXT DEFAULT NULL)
RETURNS public.billing_plans LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me TEXT := public.get_crm_user_id();
  p public.billing_plans;
  owner_id TEXT;
  listed BOOLEAN;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign in to approve.'; END IF;
  SELECT * INTO p FROM public.billing_plans WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found.'; END IF;
  IF p.status <> 'pending_approval' THEN RAISE EXCEPTION 'This version is not waiting for approval.'; END IF;
  SELECT a.owner INTO owner_id FROM public.accounts a WHERE a.id = p.account_id;
  SELECT EXISTS (
    SELECT 1 FROM public.app_settings s,
      LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(s.masters #> '{quotation,quoteConfig,approvalLevels}') = 'array'
                                        THEN s.masters #> '{quotation,quoteConfig,approvalLevels}' ELSE '[]'::jsonb END) lvl,
      LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(lvl->'userIds') = 'array' THEN lvl->'userIds' ELSE '[]'::jsonb END) uid
    WHERE uid = me
    UNION ALL
    SELECT 1 FROM public.app_settings s,
      LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(s.masters #> '{quotation,quoteConfig,approverIds}') = 'array'
                                             THEN s.masters #> '{quotation,quoteConfig,approverIds}' ELSE '[]'::jsonb END) uid
    WHERE uid = me
  ) INTO listed;
  IF p.approval_route = 'owner' THEN
    IF NOT (me = owner_id OR public.get_crm_role() IN ('admin', 'md', 'director', 'vp_sales_mkt') OR listed) THEN
      RAISE EXCEPTION 'Only the account owner (or a manager) can approve this plan.';
    END IF;
  ELSE
    IF NOT (public.get_crm_role() IN ('admin', 'md', 'director', 'vp_sales_mkt', 'line_mgr') OR listed) THEN
      RAISE EXCEPTION 'This plan needs % approval.', coalesce(p.approval_route, 'a manager''s');
    END IF;
    IF me = p.created_by AND public.get_crm_role() NOT IN ('admin', 'md', 'director') THEN
      RAISE EXCEPTION 'A discounted plan cannot be approved by the person who made it.';
    END IF;
  END IF;

  IF p_decision = 'reject' THEN
    UPDATE public.billing_plans SET status = 'rejected', decision_note = p_note WHERE id = p_id RETURNING * INTO p;
    RETURN p;
  ELSIF p_decision <> 'approve' THEN
    RAISE EXCEPTION 'Decision must be approve or reject.';
  END IF;

  UPDATE public.billing_plans SET status = 'superseded', effective_to = p.effective_from - 1
   WHERE plan_no = p.plan_no AND status = 'active';
  UPDATE public.billing_plans SET status = 'active', approved_by = me, approved_at = now(), decision_note = p_note
   WHERE id = p_id RETURNING * INTO p;
  RETURN p;
END $$;
REVOKE ALL ON FUNCTION public.decide_billing_plan(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_billing_plan(TEXT, TEXT, TEXT) TO authenticated;

COMMIT;
