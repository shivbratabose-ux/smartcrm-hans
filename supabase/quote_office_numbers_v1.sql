-- Office-wise quote numbers (DEL/SQ/0005/2627), as on Hans' own quotations.
-- Additive: one more counter kind ("quote:DEL:26-27") and an optional
-- minimum, so an office can continue from the number its old system reached
-- instead of restarting at 0001. The one-argument call keeps working.

BEGIN;

CREATE OR REPLACE FUNCTION public.allocate_doc_no(p_kind TEXT, p_min BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n BIGINT;
BEGIN
  IF p_kind IS NULL OR p_kind !~ '^(quote:[0-9]{2}-[0-9]{2}|quote:[A-Z]{2,5}:[0-9]{2}-[0-9]{2}|contract|project:[0-9]{4})$' THEN
    RAISE EXCEPTION 'allocate_doc_no: unknown kind %', p_kind;
  END IF;
  INSERT INTO public.doc_counters (kind, last) VALUES (p_kind, GREATEST(1, COALESCE(p_min, 1)))
  ON CONFLICT (kind) DO UPDATE SET last = GREATEST(public.doc_counters.last + 1, COALESCE(p_min, 1)), updated_at = now()
  RETURNING last INTO n;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.allocate_doc_no(TEXT, BIGINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.allocate_doc_no(TEXT, BIGINT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.allocate_doc_no(TEXT, BIGINT) TO authenticated, service_role;

-- The one-argument version accepts the new kind too (calls without a minimum).
CREATE OR REPLACE FUNCTION public.allocate_doc_no(p_kind TEXT)
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.allocate_doc_no(p_kind, 1::BIGINT); $$;
REVOKE EXECUTE ON FUNCTION public.allocate_doc_no(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.allocate_doc_no(TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.allocate_doc_no(TEXT) TO authenticated, service_role;

COMMIT;

-- Verify:
--   SELECT public.allocate_doc_no('quote:TST:99-00', 40);  -- 40 (test kind; delete after)
--   DELETE FROM public.doc_counters WHERE kind = 'quote:TST:99-00';
