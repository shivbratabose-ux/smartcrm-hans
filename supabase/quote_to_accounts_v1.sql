-- Quote → Accounts → Implementation, Phase 1 (flow approved 14 Nov 2026).
-- Additive and idempotent: safe to run more than once.
--
-- 1. quotations.hosting  — "Hans" | "Client" (asked on every quote).
-- 2. quotations.handover — progress after the customer accepts:
--      { finalAt, finalBy, billId, billNo, billAt, billBy,
--        confirmedAt, confirmedBy, projectId, projectNo, projectAt }
--    KYC itself uses the existing legal_name / pan / gstin /
--    billing_address_snapshot columns.
-- 3. Who may update a quote, widened for the people the flow needs:
--      the approvers picked in Masters → Quotation → Config (to approve),
--      the Accounts team picked there, and the Finance role (to raise the
--      bill and record the customer's confirmation).
--    Everyone who could update a quote before still can.

BEGIN;

ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS hosting  TEXT;
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS handover JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Is the signed-in user on the quote desk (an approver or Accounts, as
-- picked in Masters)? Reads the org settings with definer rights so the
-- answer does not depend on app_settings' own read policy.
CREATE OR REPLACE FUNCTION public.is_quote_desk_member()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_settings s,
         LATERAL (
           SELECT jsonb_array_elements_text(
                    CASE WHEN jsonb_typeof(s.masters #> '{quotation,quoteConfig,approverIds}') = 'array'
                         THEN s.masters #> '{quotation,quoteConfig,approverIds}' ELSE '[]'::jsonb END
                    || CASE WHEN jsonb_typeof(s.masters #> '{quotation,quoteConfig,accountsUserIds}') = 'array'
                         THEN s.masters #> '{quotation,quoteConfig,accountsUserIds}' ELSE '[]'::jsonb END
                  ) AS uid
         ) ids
    WHERE s.scope = 'org'
      AND ids.uid = public.get_crm_user_id()
  );
$$;
REVOKE ALL ON FUNCTION public.is_quote_desk_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_quote_desk_member() TO authenticated, service_role;

DROP POLICY IF EXISTS quotations_update ON public.quotations;
CREATE POLICY quotations_update ON public.quotations
  FOR UPDATE
  USING (
    (get_crm_role() = ANY (ARRAY['admin','md','director','vp_sales_mkt','finance']))
    OR (owner = get_crm_user_id())
    OR (owner IN (SELECT user_downline.user_id FROM user_downline(get_crm_user_id()) user_downline(user_id)))
    OR public.is_quote_desk_member()
  )
  WITH CHECK (true);

-- 4. Project numbers (PRJ-2026-007) from the shared counter too, so the
--    project created when a customer confirms can't clash with one another
--    user is creating at the same moment. Same function, one more kind.
CREATE OR REPLACE FUNCTION public.allocate_doc_no(p_kind TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n BIGINT;
BEGIN
  IF p_kind IS NULL OR p_kind !~ '^(quote:[0-9]{2}-[0-9]{2}|contract|project:[0-9]{4})$' THEN
    RAISE EXCEPTION 'allocate_doc_no: unknown kind %', p_kind;
  END IF;
  INSERT INTO public.doc_counters (kind, last) VALUES (p_kind, 1)
  ON CONFLICT (kind) DO UPDATE SET last = public.doc_counters.last + 1, updated_at = now()
  RETURNING last INTO n;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.allocate_doc_no(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.allocate_doc_no(TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.allocate_doc_no(TEXT) TO authenticated, service_role;

-- Seed from existing projects (PRJ-2026-007 → project:2026 = 7), deleted ones included.
INSERT INTO public.doc_counters (kind, last)
SELECT 'project:' || m[1], max(m[2]::bigint)
  FROM (SELECT regexp_match(project_no, '^PRJ-([0-9]{4})-([0-9]+)$') AS m FROM public.projects) s
 WHERE m IS NOT NULL
 GROUP BY m[1]
ON CONFLICT (kind) DO UPDATE SET last = greatest(public.doc_counters.last, excluded.last);

COMMIT;

-- Verify:
--   SELECT column_name FROM information_schema.columns WHERE table_name='quotations' AND column_name IN ('hosting','handover');
--   SELECT pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polname='quotations_update';
--   SELECT * FROM public.doc_counters ORDER BY kind;
