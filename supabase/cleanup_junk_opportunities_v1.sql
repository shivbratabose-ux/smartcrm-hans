-- Clean up junk / phantom opportunities that clutter Pipeline + Reports.
-- ─────────────────────────────────────────────────────────────────────
-- SYMPTOM: the Reports → "Stalled Deals — Immediate Action Required" list
-- shows deals like "E-ANNEX – EIFFEL LOGISTICS PRIVATE LIMITED" twice,
-- each ₹0 value, no owner, no activity. The user deleted the duplicate
-- LEAD, but the opportunities created from it are separate live rows and
-- were never removed — deleting a lead does not cascade to its opps.
--
-- These are "phantom" opps: value = 0 AND no owner. They are almost always
-- byproducts of the pre-#199 ghost-conversion bug (a conversion that half-
-- completed, or ran more than once). This script finds them, and (Part 2)
-- soft-deletes them so they drop out of Pipeline + Reports while remaining
-- fully recoverable from Trash.
--
-- SAFE BY DESIGN:
--   * Soft delete only (is_deleted = true) — nothing is hard-purged, so
--     anything caught by mistake is one click to restore in the app's Trash.
--   * Run Part 1 FIRST and eyeball the list. Only run Part 2 if the rows
--     shown are genuinely junk.
--   * Conservative filter: a row must have BOTH zero/blank value AND no
--     owner to qualify. A real deal a rep is working will have at least
--     one of those set, so it won't be touched.

-- ═══════════════════════════════════════════════════════════════════
-- PART 1 — DIAGNOSTIC (read-only). Review before deleting anything.
-- ═══════════════════════════════════════════════════════════════════

-- 1a. The phantom opps that Part 2 would soft-delete: live, ₹0 value,
--     no owner. Includes a linked-activity count so you can confirm they
--     really have no history.
SELECT
  o.id,
  o.opp_no,
  o.title,
  o.stage,
  o.value,
  o.owner,
  o.account_id,
  o.lead_id,
  o.created_at,
  (SELECT COUNT(*) FROM public.activities a
     WHERE a.opp_id = o.id AND a.is_deleted = false)          AS activity_count
FROM public.opportunities o
WHERE o.is_deleted = false
  AND COALESCE(o.value, 0) = 0
  AND COALESCE(NULLIF(TRIM(o.owner), ''), NULL) IS NULL
ORDER BY o.title, o.created_at;

-- 1b. Duplicate detection (independent of value/owner): live opps sharing
--     the same title + stage. Useful to spot dupes that DO have a value or
--     owner and therefore won't be auto-cleaned — handle those by hand.
SELECT
  o.title,
  o.stage,
  COUNT(*)                       AS copies,
  SUM(COALESCE(o.value, 0))      AS total_value,
  array_agg(o.id ORDER BY o.created_at) AS opp_ids
FROM public.opportunities o
WHERE o.is_deleted = false
GROUP BY o.title, o.stage
HAVING COUNT(*) > 1
ORDER BY copies DESC, o.title;

-- ═══════════════════════════════════════════════════════════════════
-- PART 2 — CLEANUP (writes). Soft-delete the phantom opps from 1a.
--          Uncomment (remove the leading "-- ") and run only after you've
--          reviewed Part 1a and are happy with the list.
-- ═══════════════════════════════════════════════════════════════════

-- UPDATE public.opportunities o
-- SET
--   is_deleted   = true,
--   deleted_at   = now(),
--   delete_reason          = 'Phantom opp cleanup: ₹0 value + no owner, orphaned by a deleted duplicate lead (cleanup_junk_opportunities_v1.sql).',
--   delete_reason_category = 'Duplicate'
-- WHERE o.is_deleted = false
--   AND COALESCE(o.value, 0) = 0
--   AND COALESCE(NULLIF(TRIM(o.owner), ''), NULL) IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- PART 3 — VERIFY (read-only). After Part 2, this should return 0.
-- ═══════════════════════════════════════════════════════════════════
-- SELECT COUNT(*) AS remaining_phantoms
-- FROM public.opportunities o
-- WHERE o.is_deleted = false
--   AND COALESCE(o.value, 0) = 0
--   AND COALESCE(NULLIF(TRIM(o.owner), ''), NULL) IS NULL;
