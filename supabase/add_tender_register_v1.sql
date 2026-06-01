-- ═══════════════════════════════════════════════════════════════════
-- TENDER MANAGEMENT — Phase 3: instrument register, pre-bid log, docs
-- Run once against the live Supabase DB. Safe & re-runnable.
-- ───────────────────────────────────────────────────────────────────
-- Adds three JSONB lists to opportunities:
--   bid_instruments — EMD / Bid Security / PBG / Tender Fee register
--                     (type, instrument, amount, ref, dates, status)
--   pre_bid_log     — queries / clarifications / corrigendum / site visits
--                     / pre-bid meetings with notes
--   tender_docs     — categorized document repository (Technical Bid,
--                     Financial Bid, Annexure, Compliance Sheet, …)
-- Additive; existing opportunities unaffected.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS bid_instruments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pre_bid_log     JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS tender_docs     JSONB DEFAULT '[]'::jsonb;
