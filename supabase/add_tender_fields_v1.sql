-- ═══════════════════════════════════════════════════════════════════
-- TENDER MANAGEMENT — Phase 1 fields on opportunities
-- Run once against the live Supabase DB. Safe & re-runnable.
-- ───────────────────────────────────────────────────────────────────
-- Adds government/RFP tender metadata + bid-calendar dates to the
-- opportunities table so a deal can also be tracked as a tender. All
-- additive; existing opportunities are unaffected (is_tender defaults false).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS is_tender         BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tender_no         TEXT,
  ADD COLUMN IF NOT EXISTS tender_authority  TEXT,
  ADD COLUMN IF NOT EXISTS tender_department TEXT,
  ADD COLUMN IF NOT EXISTS tender_portal     TEXT,
  ADD COLUMN IF NOT EXISTS tender_category   TEXT,
  ADD COLUMN IF NOT EXISTS tender_state      TEXT,
  ADD COLUMN IF NOT EXISTS pre_bid_date      DATE,
  ADD COLUMN IF NOT EXISTS tech_bid_date     DATE,
  ADD COLUMN IF NOT EXISTS fin_bid_date      DATE,
  ADD COLUMN IF NOT EXISTS submission_date   DATE,
  ADD COLUMN IF NOT EXISTS emd_amount        NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emd_validity      DATE,
  ADD COLUMN IF NOT EXISTS pbg_amount        NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pbg_validity      DATE,
  ADD COLUMN IF NOT EXISTS eligibility       TEXT,
  ADD COLUMN IF NOT EXISTS oem_reqs          TEXT,
  ADD COLUMN IF NOT EXISTS mandatory_reqs    TEXT;
