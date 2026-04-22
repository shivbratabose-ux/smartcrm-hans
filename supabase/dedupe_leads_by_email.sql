-- =====================================================================
-- dedupe_leads_by_email.sql
-- ---------------------------------------------------------------------
-- One-shot cleanup: collapse duplicate leads down to one row per email.
-- "Winner" = the oldest row (min created_at, tiebreak on id ASC). All
-- losing rows are SOFT-deleted (is_deleted=true, deleted_at=now(),
-- deleted_by='dedupe-script') so they remain recoverable from Trash.
--
-- Dedup key:
--   lower(trim(email))   — case/whitespace insensitive
--
-- Skipped (never touched):
--   - Rows where email is NULL or empty (we can't safely dedupe)
--   - Rows already soft-deleted (is_deleted=true)
--   - Singleton emails (only one live row per email)
--
-- USAGE
--   1. Open the Supabase SQL Editor for the SmartCRM project
--   2. Run STEP 1 alone first → review the preview rows
--   3. If the preview looks right, run STEP 2 (the UPDATE) in a
--      transaction. The BEGIN/COMMIT block lets you ROLLBACK if
--      anything looks off after the affected count.
--   4. Run STEP 3 to verify zero duplicates remain.
--
-- ROLLBACK
--   Soft-deleted rows can be restored from the Trash module in the
--   app (or by running:  UPDATE public.leads SET is_deleted=false,
--   deleted_at=NULL, deleted_by=NULL WHERE deleted_by='dedupe-script';)
-- =====================================================================


-- ─── STEP 1: PREVIEW ────────────────────────────────────────────────
-- Lists every duplicate group with: keep_id (winner) and drop_ids (losers).
-- Run this first and eyeball it. Nothing is changed yet.

WITH ranked AS (
  SELECT
    id,
    company,
    contact_name,
    email,
    created_at,
    lower(trim(email)) AS email_key,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(email))
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.leads
  WHERE is_deleted = false
    AND email IS NOT NULL
    AND length(trim(email)) > 0
),
groups AS (
  SELECT email_key
  FROM ranked
  GROUP BY email_key
  HAVING count(*) > 1
)
SELECT
  r.email_key                                          AS email,
  count(*)                                             AS total_rows,
  max(CASE WHEN r.rn = 1 THEN r.id END)                AS keep_id,
  max(CASE WHEN r.rn = 1 THEN r.company END)           AS keep_company,
  max(CASE WHEN r.rn = 1 THEN r.created_at::text END)  AS keep_created_at,
  array_agg(r.id ORDER BY r.rn) FILTER (WHERE r.rn > 1) AS drop_ids
FROM ranked r
JOIN groups g USING (email_key)
GROUP BY r.email_key
ORDER BY total_rows DESC, r.email_key;


-- ─── STEP 2: APPLY (wrapped in a transaction) ──────────────────────
-- This is the destructive part. Soft-deletes every "loser" row.
-- After running, check the rowcount Supabase reports. If it doesn't
-- match the preview, ROLLBACK and re-investigate. Otherwise COMMIT.

BEGIN;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(email))
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.leads
  WHERE is_deleted = false
    AND email IS NOT NULL
    AND length(trim(email)) > 0
)
UPDATE public.leads l
   SET is_deleted = true,
       deleted_at = now(),
       deleted_by = 'dedupe-script'
  FROM ranked r
 WHERE l.id = r.id
   AND r.rn > 1;

-- After reviewing the row count printed by the UPDATE above:
--   COMMIT;        ← keep changes
--   ROLLBACK;      ← undo, nothing changed
COMMIT;


-- ─── STEP 3: VERIFY ────────────────────────────────────────────────
-- Should return ZERO rows if the dedupe worked.

SELECT
  lower(trim(email)) AS email,
  count(*)           AS still_duplicated
FROM public.leads
WHERE is_deleted = false
  AND email IS NOT NULL
  AND length(trim(email)) > 0
GROUP BY lower(trim(email))
HAVING count(*) > 1;
