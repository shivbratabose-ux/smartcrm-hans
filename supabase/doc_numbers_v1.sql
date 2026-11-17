-- ══════════════════════════════════════════════════════════════════════
-- Migration: doc_numbers_v1
-- ══════════════════════════════════════════════════════════════════════
-- Quote and contract numbers were worked out in the browser from the
-- highest number THAT USER COULD SEE. Sales execs only see their own
-- team's quotes and nobody sees deleted ones, so two people could mint the
-- same id: with all 3 quotes deleted (Nov 2026), every user's next quote
-- was QT-001 — which already existed (deleted, owned by u1), so anyone
-- else's new quote failed RLS on save, and u1's would overwrite the
-- deleted row. Contract numbers used contracts.length + 1, same problem.
--
-- Fix: record ids become random in the app (qt_…, ct_…), and the HUMAN
-- numbers come from here — one counter per document kind, incremented
-- atomically (INSERT … ON CONFLICT DO UPDATE … RETURNING), so concurrent
-- users can never get the same number regardless of what each can see.
--
--   allocate_doc_no('quote:26-27')  → 1, 2, 3 … (per financial year)
--   allocate_doc_no('contract')     → 1, 2, 3 …
--
-- Counters are seeded from existing data so numbering continues. Re-runnable.
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.doc_counters (
  kind        TEXT PRIMARY KEY,
  last        BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.doc_counters ENABLE ROW LEVEL SECURITY;   -- no policies: only the function touches it

CREATE OR REPLACE FUNCTION public.allocate_doc_no(p_kind TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n BIGINT;
BEGIN
  IF p_kind IS NULL OR p_kind !~ '^(quote:[0-9]{2}-[0-9]{2}|contract)$' THEN
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

-- Seed: quote numbers look like SQ/M000123/26-27 → counter quote:26-27 = 123.
INSERT INTO public.doc_counters (kind, last)
SELECT 'quote:' || m[2], max(m[1]::bigint)
  FROM (SELECT regexp_match(quote_no, '([0-9]+)/([0-9]{2}-[0-9]{2})$') AS m FROM public.quotations) s
 WHERE m IS NOT NULL
 GROUP BY m[2]
ON CONFLICT (kind) DO UPDATE SET last = greatest(public.doc_counters.last, excluded.last);

-- Seed: contracts numbered CT-007 (in contract_no or the old id) → contract = 7.
INSERT INTO public.doc_counters (kind, last)
SELECT 'contract', coalesce(max(greatest(
         coalesce((regexp_match(contract_no, '^CT-([0-9]+)$'))[1]::bigint, 0),
         coalesce((regexp_match(id,          '^CT-([0-9]+)$'))[1]::bigint, 0))), 0)
  FROM public.contracts
ON CONFLICT (kind) DO UPDATE SET last = greatest(public.doc_counters.last, excluded.last);

COMMIT;

-- Verify:  SELECT * FROM public.doc_counters;
--          SELECT has_function_privilege('anon','public.allocate_doc_no(text)','EXECUTE');  -- false
