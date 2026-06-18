-- ═══════════════════════════════════════════════════════════════════
-- LEADS — duplicate flag (duplicate_of)
-- ═══════════════════════════════════════════════════════════════════
-- A lead created that matches an existing one (same company AND
-- (same contact OR email) AND a shared product) is not blocked — it is
-- created and tagged with the matched lead's id so the list can flag it
-- (amber row + DUPLICATE badge) for the rep to action.
--
-- Without this column the flag lived only in local state: the write-time
-- schema-heal stripped the unknown `duplicate_of` key on sync, so the
-- badge vanished after any cloud hydration. This persists it.
--
-- Nullable; blank for non-duplicate leads. Stores the matched lead's id.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS duplicate_of TEXT;

-- No RLS change — inherits existing leads policies.
-- No realtime change — leads is already in supabase_realtime.
