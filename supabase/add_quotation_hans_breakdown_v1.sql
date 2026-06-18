-- ═══════════════════════════════════════════════════════════════════
-- QUOTATIONS — engine pricing breakdown (hans)
-- ═══════════════════════════════════════════════════════════════════
-- Quotes built with the Hans pricing engine carry a `hans` object with
-- the full breakdown: one-time/recurring subtotals, overall + prepayment
-- discount, GST split, grand total, Licence base, ALR (shown separately),
-- TCV, party snapshot and terms. This is what the engine-quote print /
-- re-open reads.
--
-- Without this column the write-time schema-heal stripped `hans` on sync,
-- so after a cloud reload the breakdown (ALR / TCV / GST split) was lost
-- and the saved quote could not be reprinted faithfully. JSONB persists
-- the whole object as-is.
--
-- Nullable; only engine-built quotes populate it. Legacy quotes leave it
-- NULL and render through the existing per-line tax path unchanged.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS hans JSONB;

-- No RLS change — inherits existing quotations policies.
-- No realtime change — quotations is already in supabase_realtime.
