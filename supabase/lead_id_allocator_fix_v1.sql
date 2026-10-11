-- ══════════════════════════════════════════════════════════════════════
-- Migration: lead_id_allocator_fix_v1
-- ══════════════════════════════════════════════════════════════════════
-- allocate_lead_id() built numbers with lpad(nextval::text, 3, '0').
-- Postgres lpad() PADS short strings but also TRUNCATES long ones:
-- lpad('9969', 3, '0') = '996'. Once lead_no_seq passed 999 the allocator
-- could only ever return 3-digit numbers, almost all already taken.
-- heal_duplicate_lead_id() then looped, drawing number after number until
-- it hit a free 3-digit value. Found 12 Oct 2026 with the sequence at 9,970,
-- 1,108 numbered leads, and only 16 free numbers left in 100–999; once
-- those ran out, every lead insert would have looped until it timed out.
--
-- Fix: pad to AT LEAST 3 digits, never truncate. Restart the sequence just
-- above the highest number ever issued (live or deleted), so numbering
-- continues where it left off (#FL-2026-1079, ...) rather than at 9971.
--
-- CREATE OR REPLACE keeps the function's existing grants
-- (authenticated + service_role, per lead_intake_v1.sql). Re-runnable.
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.allocate_lead_id()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT '#FL-' || to_char(now(), 'YYYY') || '-' ||
         lpad(n::text, greatest(3, length(n::text)), '0')
  FROM (SELECT nextval('public.lead_no_seq') AS n) s;
$$;

SELECT setval('public.lead_no_seq', greatest(999, (
  SELECT coalesce(max((regexp_match(lead_id, '^#FL-\d{4}-(\d+)$'))[1]::bigint), 0)
  FROM public.leads
)));

COMMIT;

-- ── Verification ──────────────────────────────────────────────────────
-- SELECT last_value FROM public.lead_no_seq;            -- = highest number in use
-- SELECT has_function_privilege('anon','public.allocate_lead_id()','EXECUTE'); -- false
