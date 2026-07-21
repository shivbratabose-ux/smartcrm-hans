-- Lead ID uniqueness — systematic fix for duplicate #FL-YYYY-NNN numbers.
--
-- ROOT CAUSE: the client generated lead numbers as "max + 1" over the
-- RLS-scoped list the CURRENT USER could see. A sales exec with no leads
-- of their own computed max=0 and got #FL-2026-001 — which is why three
-- separate live leads all carry #FL-2026-001 today. The number was also
-- computed at modal-open (not at save), widening the race window.
--
-- FIX (defense in depth, this file + client PR):
--   Layer 1: a Postgres SEQUENCE is the single allocator of lead numbers.
--   Layer 2: allocate_lead_id() RPC — client reserves a number atomically
--            at modal-open. SECURITY DEFINER so it sees the global max,
--            not the caller's RLS slice.
--   Layer 3: BEFORE INSERT/UPDATE trigger — any row arriving with a
--            colliding lead_id (offline fallback, bulk import, legacy
--            sync) is silently reassigned the next free number.
--   Layer 4: UNIQUE partial index on live rows — the hard guarantee.
--            With the trigger healing collisions first, this should
--            never fire; it exists as the final backstop.
--   One-time: renumber today's duplicates (keep the OLDEST row per
--            number; later rows get fresh numbers + an audit note in
--            remarks).
--
-- Run in the Supabase SQL editor as one script. Idempotent where
-- possible. RUN THIS BEFORE the ghost-converted repair (Part 2 of
-- fix_ghost_converted_leads.sql) so reps don't see three #FL-2026-001s
-- reappear in their SAL queue.

-- ═══════════════════════════════════════════════════════════════════
-- 1. Sequence, initialised to the current global max lead number
-- ═══════════════════════════════════════════════════════════════════
CREATE SEQUENCE IF NOT EXISTS public.lead_no_seq;

SELECT setval(
  'public.lead_no_seq',
  GREATEST(
    (SELECT COALESCE(MAX((substring(lead_id from '(\d+)$'))::int), 0)
     FROM public.leads
     WHERE lead_id ~ '\d+$'),
    1
  )
);

-- ═══════════════════════════════════════════════════════════════════
-- 2. Allocator function — the ONLY way a new number should be minted
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.allocate_lead_id()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT '#FL-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.lead_no_seq')::text, 3, '0');
$$;

GRANT EXECUTE ON FUNCTION public.allocate_lead_id() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 3. One-time renumber of existing duplicates (live rows only).
--    Keeps the oldest row (created_date, then created_at, then id) on
--    the original number; every later duplicate gets a fresh number
--    from the sequence and an audit note appended to remarks.
-- ═══════════════════════════════════════════════════════════════════
WITH ranked AS (
  SELECT
    id,
    lead_id,
    row_number() OVER (
      PARTITION BY lead_id
      ORDER BY created_date ASC NULLS LAST, created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.leads
  WHERE is_deleted = false
    AND lead_id IS NOT NULL
    AND lead_id <> ''
),
dupes AS (
  SELECT id, lead_id FROM ranked WHERE rn > 1
)
UPDATE public.leads l
SET
  lead_id = public.allocate_lead_id(),
  remarks = COALESCE(NULLIF(l.remarks, ''), '') ||
            CASE WHEN COALESCE(l.remarks, '') = '' THEN '' ELSE E'\n' END ||
            '[system ' || to_char(now(), 'YYYY-MM-DD') || '] Renumbered from ' ||
            d.lead_id || ' — duplicate ID repair (see lead_id_unique_v1.sql).'
FROM dupes d
WHERE l.id = d.id;

-- ═══════════════════════════════════════════════════════════════════
-- 4. Healing trigger — any insert/update that would collide with a
--    live row gets the next free number instead of failing. Covers the
--    offline fallback path, bulk imports, and stale clients that still
--    compute numbers locally.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.heal_duplicate_lead_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_id IS NULL OR NEW.lead_id = '' THEN
    NEW.lead_id := public.allocate_lead_id();
    RETURN NEW;
  END IF;
  -- Reassign while the incoming number collides with a DIFFERENT live row.
  -- Sequence values are unique by construction, so this loop terminates
  -- on the first iteration in practice.
  WHILE EXISTS (
    SELECT 1 FROM public.leads x
    WHERE x.lead_id = NEW.lead_id
      AND x.id <> NEW.id
      AND x.is_deleted = false
  ) LOOP
    NEW.lead_id := public.allocate_lead_id();
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_heal_duplicate_lead_id ON public.leads;
CREATE TRIGGER trg_heal_duplicate_lead_id
  BEFORE INSERT OR UPDATE OF lead_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.heal_duplicate_lead_id();

-- ═══════════════════════════════════════════════════════════════════
-- 5. Hard backstop — unique among live rows. Soft-deleted rows keep
--    their number (audit trail) without blocking reuse checks, and the
--    healing trigger means this index should never actually reject.
-- ═══════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_lead_id_live
  ON public.leads (lead_id)
  WHERE is_deleted = false AND lead_id IS NOT NULL AND lead_id <> '';

-- ═══════════════════════════════════════════════════════════════════
-- Sanity checks (read-only) — run after the script:
--   a) should return 0 rows (no live duplicates left)
-- ═══════════════════════════════════════════════════════════════════
SELECT lead_id, COUNT(*) AS copies
FROM public.leads
WHERE is_deleted = false AND lead_id IS NOT NULL AND lead_id <> ''
GROUP BY lead_id
HAVING COUNT(*) > 1;

-- NOTE on yearly reset: numbers no longer restart at 001 each January —
-- the sequence keeps counting up (uniqueness beats pretty numbering).
-- If you want per-year restarts, an admin can run
--   SELECT setval('public.lead_no_seq', 0);
-- on Jan 1 — the year segment in the ID keeps old and new years distinct,
-- and the unique index + trigger keep it safe either way.
