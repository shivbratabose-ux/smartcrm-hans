-- ══════════════════════════════════════════════════════════════════════
-- Migration: add_missing_lead_fields_v1
-- ══════════════════════════════════════════════════════════════════════
-- Problem:
--   BLANK_LEAD (src/data/seed.js) accumulated ~25 fields that drive the
--   Leads UI — multi-contact linkage, stage history, lead→opp conversion
--   tracking, pipeline signals, address/team breakdown — but these columns
--   were never added to public.leads. Writes silently stripped them via
--   writeWithSchemaHeal (PR #74 raised MAX_RETRIES to 30 so the heal
--   could finish), but the data never persisted to the cloud: editing
--   a lead on device A and opening it on device B showed an empty
--   Primary Contact list, no conversion link, no proposal flag, etc.
--
-- Fix:
--   Add the missing columns with safe defaults. Existing rows get NULLs
--   (or sensible zero-values), new writes land in the right column via
--   the camelCase↔snake_case map in src/lib/db.js.
--
-- Safety:
--   - All ADD COLUMN IF NOT EXISTS — re-runnable.
--   - No NOT NULL on new columns (protects existing rows).
--   - No data rewrites — pure additive.
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Multi-contact linkage (drives Lead→Opp conversion) ──────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_ids     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contact_roles   JSONB  DEFAULT '{}'::jsonb;

-- ── 2. Lifecycle / conversion audit trail ──────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS stage_history      JSONB  DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS converted_opp_ids  TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS converted_date     DATE;

-- ── 3. Forecasting / pipeline signals ──────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS estimated_value      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expected_close_date  DATE,
  ADD COLUMN IF NOT EXISTS proposal_sent        TEXT DEFAULT 'No',
  ADD COLUMN IF NOT EXISTS demo_scheduled       TEXT DEFAULT 'No',
  ADD COLUMN IF NOT EXISTS competitor_name      TEXT,
  ADD COLUMN IF NOT EXISTS last_contact_date    DATE;

-- ── 4. Products & segmentation ─────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS product_selection    JSONB  DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS additional_products  TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vertical             TEXT,
  ADD COLUMN IF NOT EXISTS region               TEXT;

-- ── 5. Org / address / team breakdown ──────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS branch       TEXT,
  ADD COLUMN IF NOT EXISTS location     TEXT,
  ADD COLUMN IF NOT EXISTS department   TEXT,
  ADD COLUMN IF NOT EXISTS country      TEXT,
  ADD COLUMN IF NOT EXISTS state        TEXT,
  ADD COLUMN IF NOT EXISTS city         TEXT,
  ADD COLUMN IF NOT EXISTS addresses    JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sales_team   TEXT[] DEFAULT '{}';

-- ── 6. Extra contact fields ────────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS company_website  TEXT,
  ADD COLUMN IF NOT EXISTS alternate_phone  TEXT,
  ADD COLUMN IF NOT EXISTS alternate_email  TEXT,
  ADD COLUMN IF NOT EXISTS linked_in_url    TEXT;

-- ── 7. Marketing / attribution ─────────────────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS annual_revenue  NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS campaign_name   TEXT,
  ADD COLUMN IF NOT EXISTS referred_by     TEXT;

-- ── 8. Free-form notes (separate from `remarks`) ───────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS notes  TEXT;

-- ── 9. Qualification checklist (MQL → SQL gate) ────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS qualification_checklist JSONB DEFAULT '{}'::jsonb;

-- ── Indexes (help common filter paths) ─────────────────────────────────
CREATE INDEX IF NOT EXISTS leads_vertical_idx          ON public.leads (vertical);
CREATE INDEX IF NOT EXISTS leads_region_idx            ON public.leads (region);
CREATE INDEX IF NOT EXISTS leads_expected_close_idx    ON public.leads (expected_close_date);
CREATE INDEX IF NOT EXISTS leads_converted_opp_ids_gin ON public.leads USING GIN (converted_opp_ids);
CREATE INDEX IF NOT EXISTS leads_contact_ids_gin       ON public.leads USING GIN (contact_ids);

COMMIT;

-- ══════════════════════════════════════════════════════════════════════
-- Post-apply verification (run as a separate query):
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'leads'
--   ORDER BY ordinal_position;
--
-- Expect ~35 columns; the 25 new ones listed above should all appear.
-- Then reload the Supabase PostgREST schema cache:
--
--   NOTIFY pgrst, 'reload schema';
--
-- ══════════════════════════════════════════════════════════════════════
