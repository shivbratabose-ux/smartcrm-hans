-- ═══════════════════════════════════════════════════════════════════
-- LEAD PRODUCT FIELDS — dynamic, product-specific lead-capture answers
-- ═══════════════════════════════════════════════════════════════════
-- Hans sells multiple product lines (LOBs) with different qualifying
-- questions per product (see Hans_LOB_LeadCapture_Fields). The common
-- A–F fields stay as normal columns; the EXTRA product-specific answers
-- are stored together in one JSONB blob so we don't add ~100 columns and
-- existing data is untouched:
--
--   product_fields = {
--     "WiseDox":  { "buyerType": "Government", "tenderRefNo": "...", ... },
--     "WiseTrax": { "messageTypes": ["FWB","FHL"], "monthlyMessageVolume": 5000 }
--   }
--
-- Keyed by the dictionary's canonical product key (see leadFieldDict.js).
-- IDEMPOTENT; no data loss (new column, default empty object).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS product_fields JSONB NOT NULL DEFAULT '{}'::jsonb;

-- No RLS change: leads policies already govern this column. No realtime
-- change: leads is already published.
