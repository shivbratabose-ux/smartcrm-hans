-- ══════════════════════════════════════════════════════════════════════
-- Migration: quote_accept_token_v1
-- ══════════════════════════════════════════════════════════════════════
-- The quote-accept links emailed to customers (and printed as QR codes on
-- the quote PDF) carried the RAW QUOTE ID — and pointed at a page behind
-- the login wall, so a customer could never use them anyway. The public
-- accept flow replaces both problems at once:
--
--   - `accept_token`: an unguessable capability token per quotation. The
--     public link becomes #/quote-accept/<token>; knowing or guessing a
--     quote id is no longer enough to view or accept anything.
--   - The quotations table stays CLOSED to anonymous reads. The public
--     page never touches PostgREST — it talks to the `quote-accept` edge
--     function, which validates the token server-side with the service
--     role and returns only a sanitised summary.
--
-- Backfill uses two concatenated UUIDv4s (≈244 bits of entropy, 64 hex
-- chars) — core gen_random_uuid(), no pgcrypto dependency. Re-runnable.
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS accept_token TEXT;

UPDATE public.quotations
   SET accept_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
 WHERE accept_token IS NULL OR accept_token = '';

CREATE UNIQUE INDEX IF NOT EXISTS quotations_accept_token_key
  ON public.quotations (accept_token)
  WHERE accept_token IS NOT NULL;

COMMIT;

-- ── Verification ──────────────────────────────────────────────────────
-- SELECT count(*) AS missing FROM public.quotations
--  WHERE accept_token IS NULL OR accept_token = '';   -- expect 0
