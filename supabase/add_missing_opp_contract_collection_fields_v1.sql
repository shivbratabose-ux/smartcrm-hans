-- ══════════════════════════════════════════════════════════════════════
-- Migration: add_missing_opp_contract_collection_fields_v1
-- ══════════════════════════════════════════════════════════════════════
-- Problem (same class as PR #75 for leads):
--   BLANK_OPP / BLANK_CONTRACT / BLANK_COLLECTION (src/data/seed.js)
--   accumulated ~66 UI-writable fields across three modules that were
--   never migrated into supabase/schema.sql. Writes currently succeed
--   because writeWithSchemaHeal strips unknown columns, but the data
--   never reaches the cloud — on reload from a different device the
--   fields silently reset to blank.
--
-- Scope:
--   - public.opportunities: 23 new columns
--   - public.contracts:     29 new columns
--   - public.collections:   14 new columns
--
-- Safety:
--   - All ADD COLUMN IF NOT EXISTS — re-runnable.
--   - No NOT NULL on new columns (protects existing rows).
--   - No data rewrites — pure additive.
--   - Wrapped in a single transaction.
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

-- ══════════════════════════════════════════════════════════════════════
-- 1. OPPORTUNITIES
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.opportunities
  -- Identifiers & references
  ADD COLUMN IF NOT EXISTS opp_no            TEXT,
  -- Product & segmentation
  ADD COLUMN IF NOT EXISTS product_selection JSONB  DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lob               TEXT,
  ADD COLUMN IF NOT EXISTS deal_size         TEXT,
  ADD COLUMN IF NOT EXISTS forecast_cat      TEXT,
  ADD COLUMN IF NOT EXISTS currency          TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS territory         TEXT,
  ADD COLUMN IF NOT EXISTS budget            TEXT,
  -- Multi-contact role linkage
  ADD COLUMN IF NOT EXISTS contact_roles     JSONB  DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_lead_ids   TEXT[] DEFAULT '{}',
  -- Competitors / loss analysis
  ADD COLUMN IF NOT EXISTS competitors              TEXT,
  ADD COLUMN IF NOT EXISTS loss_reason              TEXT,
  ADD COLUMN IF NOT EXISTS loss_reason_secondary    TEXT,
  ADD COLUMN IF NOT EXISTS lost_to_competitor       TEXT,
  ADD COLUMN IF NOT EXISTS loss_impact_areas        TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS loss_mgmt_feedback       TEXT,
  ADD COLUMN IF NOT EXISTS loss_improvement_notes   TEXT,
  ADD COLUMN IF NOT EXISTS loss_closed_at           TIMESTAMPTZ,
  -- Upsell / cross-sell
  ADD COLUMN IF NOT EXISTS upsell_flag       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cross_sell_notes  TEXT,
  -- Pipeline / next step
  ADD COLUMN IF NOT EXISTS next_step         TEXT,
  ADD COLUMN IF NOT EXISTS decision_date     DATE,
  -- Marketing attribution
  ADD COLUMN IF NOT EXISTS campaign_source   TEXT;

CREATE INDEX IF NOT EXISTS opportunities_territory_idx    ON public.opportunities (territory);
CREATE INDEX IF NOT EXISTS opportunities_forecast_cat_idx ON public.opportunities (forecast_cat);
CREATE INDEX IF NOT EXISTS opportunities_source_leads_gin ON public.opportunities USING GIN (source_lead_ids);


-- ══════════════════════════════════════════════════════════════════════
-- 2. CONTRACTS
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.contracts
  -- Identifiers & references
  ADD COLUMN IF NOT EXISTS contract_no          TEXT,
  ADD COLUMN IF NOT EXISTS opp_id               TEXT,
  -- Product
  ADD COLUMN IF NOT EXISTS product              TEXT,
  ADD COLUMN IF NOT EXISTS product_selection    JSONB DEFAULT '[]'::jsonb,
  -- Billing terms
  ADD COLUMN IF NOT EXISTS bill_term            TEXT,
  ADD COLUMN IF NOT EXISTS bill_type            TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms        TEXT DEFAULT 'Net 30',
  ADD COLUMN IF NOT EXISTS currency             TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS billing_frequency    TEXT DEFAULT 'Annual',
  ADD COLUMN IF NOT EXISTS invoice_gen_basis    TEXT,
  -- GRI (Global Rate Increase)
  ADD COLUMN IF NOT EXISTS gri_applicable       TEXT DEFAULT 'No',
  ADD COLUMN IF NOT EXISTS gri_percentage       NUMERIC DEFAULT 0,
  -- Capacity
  ADD COLUMN IF NOT EXISTS no_of_users          INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS no_of_branches       INTEGER DEFAULT 0,
  -- Approval & documents
  ADD COLUMN IF NOT EXISTS approval_stage       TEXT,
  ADD COLUMN IF NOT EXISTS doc_type             TEXT DEFAULT 'Contract',
  ADD COLUMN IF NOT EXISTS po_number            TEXT,
  ADD COLUMN IF NOT EXISTS signed_doc_url       TEXT,
  ADD COLUMN IF NOT EXISTS eula_url             TEXT,
  -- Renewal lifecycle
  ADD COLUMN IF NOT EXISTS renewal_date         DATE,
  ADD COLUMN IF NOT EXISTS renewal_type         TEXT,
  ADD COLUMN IF NOT EXISTS auto_renewal         TEXT DEFAULT 'No',
  ADD COLUMN IF NOT EXISTS renewal_notified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warranty_months      INTEGER DEFAULT 0,
  -- Commercial
  ADD COLUMN IF NOT EXISTS commercial_model     TEXT,
  -- Onboarding / delivery
  ADD COLUMN IF NOT EXISTS service_start_date   DATE,
  ADD COLUMN IF NOT EXISTS go_live_date         DATE,
  ADD COLUMN IF NOT EXISTS onboarding_notes     TEXT,
  -- Geography
  ADD COLUMN IF NOT EXISTS territory            TEXT;

CREATE INDEX IF NOT EXISTS contracts_renewal_date_idx    ON public.contracts (renewal_date);
CREATE INDEX IF NOT EXISTS contracts_opp_id_idx          ON public.contracts (opp_id);
CREATE INDEX IF NOT EXISTS contracts_service_start_idx   ON public.contracts (service_start_date);


-- ══════════════════════════════════════════════════════════════════════
-- 3. COLLECTIONS
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.collections
  -- References
  ADD COLUMN IF NOT EXISTS contract_id        TEXT,
  -- Tax / payable breakdown
  ADD COLUMN IF NOT EXISTS invoice_type       TEXT DEFAULT 'Tax Invoice',
  ADD COLUMN IF NOT EXISTS product            TEXT,
  ADD COLUMN IF NOT EXISTS currency           TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS gst_amount         NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_amount         NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_payable        NUMERIC DEFAULT 0,
  -- Billing period
  ADD COLUMN IF NOT EXISTS bill_period_from   DATE,
  ADD COLUMN IF NOT EXISTS bill_period_to     DATE,
  -- Payment lifecycle
  ADD COLUMN IF NOT EXISTS payment_date       DATE,
  ADD COLUMN IF NOT EXISTS aging_bucket       TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_date     DATE,
  ADD COLUMN IF NOT EXISTS cheque_ref         TEXT,
  ADD COLUMN IF NOT EXISTS approved_by        TEXT;

CREATE INDEX IF NOT EXISTS collections_contract_id_idx    ON public.collections (contract_id);
CREATE INDEX IF NOT EXISTS collections_follow_up_date_idx ON public.collections (follow_up_date);
CREATE INDEX IF NOT EXISTS collections_aging_bucket_idx   ON public.collections (aging_bucket);

COMMIT;

-- ══════════════════════════════════════════════════════════════════════
-- Post-apply:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public'
--     AND table_name IN ('opportunities','contracts','collections')
--   ORDER BY table_name, ordinal_position;
--
--   NOTIFY pgrst, 'reload schema';
-- ══════════════════════════════════════════════════════════════════════
