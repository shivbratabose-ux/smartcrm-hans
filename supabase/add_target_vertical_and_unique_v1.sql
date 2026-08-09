-- ══════════════════════════════════════════════════════════════════════
-- Migration: add_target_vertical_and_unique_v1
-- ══════════════════════════════════════════════════════════════════════
-- Two things for the ABP/AOP governance dashboard:
--
-- 1. `vertical` on targets. The plan is cut across Line Managers by
--    vertical AND product (CHA, Freight Forwarder, Port Management,
--    Airline/Liner, Warehouse, TMS ...), but targets could only carry a
--    product. Plain TEXT — the UI reads the list from Masters when a
--    `verticals` master exists and falls back to the built-in set, so
--    the DB stays schema-light. The client's schema-heal path means the
--    app is safe to deploy before OR after this runs; the value simply
--    doesn't persist until the column exists.
--
-- 2. Duplicate-target prevention IN THE DATABASE. The form now blocks a
--    second target for the same salesperson + period + product +
--    vertical, but UI validation alone cannot stop a bulk import or a
--    concurrent write from creating the pair — and a duplicate is not
--    "a bigger target": achievement is computed per target, so both
--    rows claim the same won deals and every roll-up double-counts.
--
--    The index is created inside a guarded DO block because the LIVE
--    DATA ALREADY CONTAINS at least one duplicate pair; creating it
--    unconditionally would abort the migration. If creation fails, the
--    NOTICE lists the offending rows — soft-delete the extras from the
--    Targets page (they are marked "duplicate" there), re-run, done.
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS vertical TEXT;

COMMIT;

-- Unique commitment per salesperson × period × product × vertical, over
-- live rows only (soft-deleted rows shouldn't block re-creating a target).
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS targets_unique_commitment
    ON public.targets (user_id, period, coalesce(product, 'All'), coalesce(vertical, ''))
    WHERE NOT is_deleted;
  RAISE NOTICE 'targets_unique_commitment index in place — duplicates are now blocked at the database.';
EXCEPTION WHEN unique_violation OR others THEN
  RAISE NOTICE 'Could not create targets_unique_commitment — existing duplicates block it. Resolve these rows (keep one, soft-delete the rest from the Targets page), then re-run this file:';
  RAISE NOTICE '%', (
    SELECT string_agg(format('user %s · %s · %s · count %s', user_id, period, coalesce(product, 'All'), n), E'\n')
    FROM (
      SELECT user_id, period, coalesce(product, 'All') AS product, count(*) AS n
      FROM public.targets WHERE NOT is_deleted
      GROUP BY 1, 2, 3, coalesce(vertical, '') HAVING count(*) > 1
    ) dups
  );
END $$;

-- ── Verification ──────────────────────────────────────────────────────
-- SELECT indexname FROM pg_indexes
--  WHERE tablename = 'targets' AND indexname = 'targets_unique_commitment';
-- (one row = the constraint is live; zero rows = duplicates still need resolving)
