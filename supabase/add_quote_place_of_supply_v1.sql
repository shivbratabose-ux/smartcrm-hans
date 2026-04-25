-- ══════════════════════════════════════════════════════════════════════
-- Migration: add_quote_place_of_supply_v1
-- ══════════════════════════════════════════════════════════════════════
-- Quotations need a "Place of Supply" to drive the GST split per line:
--   POS == seller's home state → CGST + SGST (intra-state)
--   POS != seller's home state → IGST         (inter-state)
--   POS == "Outside India"     → Export / zero-rated
--
-- Per-line GST rates and amounts live inside the existing `items` JSONB
-- column (BLANK_QUOTE_ITEM extended in src/data/seed.js), so no DDL is
-- required for the line-level split — only this top-level POS field.
--
-- Safety: ADD COLUMN IF NOT EXISTS, no NOT NULL.
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS place_of_supply TEXT;

COMMIT;

-- ══════════════════════════════════════════════════════════════════════
-- Post-apply:
--   NOTIFY pgrst, 'reload schema';
-- ══════════════════════════════════════════════════════════════════════
