-- Fix ghost-converted leads: leads marked stage='Converted' but with no
-- matching opportunities row in the DB.
--
-- Root cause (fixed in the client code): the Convert modal was persisting
-- accountId="" on the new opp when no account was linked. Postgres treats
-- "" as an invalid FK value against public.accounts(id), so the opp insert
-- failed with an FK violation, while the parallel lead.stage='Converted'
-- update still succeeded. Users saw "Converted" on the lead but nothing in
-- Pipeline.
--
-- This script:
--   PART 1 — AUDIT. Lists every ghost-converted lead. Run it first to see
--            the damage. Read-only, safe.
--   PART 2 — REPAIR. Reverts each ghost-converted lead back to stage='SAL'
--            (the stage before Converted) with an entry in stage_history so
--            the rep can re-run the Convert flow with the fixed client. The
--            client code now writes accountId=NULL correctly, so the retry
--            will succeed.
--
-- Run in the Supabase SQL editor. Nothing in this script is destructive
-- beyond stage flips + history log entries — no data is deleted.

-- ═══════════════════════════════════════════════════════════════════
-- PART 1 — AUDIT (read-only)
-- ═══════════════════════════════════════════════════════════════════
SELECT
  l.id,
  l.lead_id,
  l.company,
  l.stage,
  l.converted_date,
  l.owner
FROM public.leads l
WHERE l.stage = 'Converted'
  AND l.is_deleted = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.opportunities o
    WHERE o.is_deleted = false
      AND (
        o.lead_id = l.lead_id
        OR l.id = ANY(o.source_lead_ids)
      )
  )
ORDER BY l.converted_date DESC NULLS LAST, l.lead_id;

-- ═══════════════════════════════════════════════════════════════════
-- PART 2 — REPAIR (write). Uncomment to run after reviewing PART 1.
-- ═══════════════════════════════════════════════════════════════════
-- WITH ghosts AS (
--   SELECT l.id, l.stage_history
--   FROM public.leads l
--   WHERE l.stage = 'Converted'
--     AND l.is_deleted = false
--     AND NOT EXISTS (
--       SELECT 1
--       FROM public.opportunities o
--       WHERE o.is_deleted = false
--         AND (
--           o.lead_id = l.lead_id
--           OR l.id = ANY(o.source_lead_ids)
--         )
--     )
-- )
-- UPDATE public.leads l
-- SET
--   stage = 'SAL',
--   converted_date = NULL,
--   converted_opp_ids = '{}',
--   stage_history = COALESCE(l.stage_history, '[]'::jsonb) || jsonb_build_array(
--     jsonb_build_object(
--       'from', 'Converted',
--       'to', 'SAL',
--       'date', to_char(now(), 'YYYY-MM-DD'),
--       'by', 'system-repair',
--       'reason', 'Ghost-converted repair: opportunity row was never persisted (empty-string account FK bug). Rep should re-run Convert flow.'
--     )
--   )
-- FROM ghosts g
-- WHERE l.id = g.id;

-- Sanity check after PART 2: should return 0 rows.
-- SELECT COUNT(*) AS still_ghosted
-- FROM public.leads l
-- WHERE l.stage = 'Converted'
--   AND l.is_deleted = false
--   AND NOT EXISTS (
--     SELECT 1 FROM public.opportunities o
--     WHERE o.is_deleted = false
--       AND (o.lead_id = l.lead_id OR l.id = ANY(o.source_lead_ids))
--   );
