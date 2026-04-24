-- ══════════════════════════════════════════════════════════════════════
-- Migration: add_missing_quotation_fields_v1
-- ══════════════════════════════════════════════════════════════════════
-- Same class of drift as PR #75 (leads) and PR #81 (opp/contract/collection):
--
--   BLANK_QUOTE (src/data/seed.js:233) writes ~35 fields, but
--   supabase/schema.sql:367 only defines 22 columns on `quotations`.
--   Every write silently loses 13+ fields — writeWithSchemaHeal strips
--   unknowns and the data never reaches cloud. On reload from a new
--   device the quote shell remains, but product selection, discount,
--   approval state, emailLog, changeLog, supersedes chain etc. all
--   come back blank.
--
-- In addition, "verify before quote" requires snapshotting customer
-- billing context onto the quote at creation time so the PDF stays
-- historically accurate even if the account is edited later.
--
-- Scope (all additive, re-runnable):
--   1. Existing BLANK_QUOTE drift columns  (~20)
--   2. New customer-billing snapshot columns (~12)
--   3. New sales-narrative columns (scope/assumptions/exclusions)
--
-- Safety:
--   - All ADD COLUMN IF NOT EXISTS
--   - No NOT NULL on new columns (protects existing rows)
--   - Single transaction
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.quotations
  -- ── 1. Existing BLANK_QUOTE drift (fields the UI already writes) ──
  ADD COLUMN IF NOT EXISTS product               TEXT,
  ADD COLUMN IF NOT EXISTS product_selection     JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS discount              NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version               INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_final              BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS quote_file_url        TEXT,
  ADD COLUMN IF NOT EXISTS approval_notes        TEXT,
  ADD COLUMN IF NOT EXISTS supersedes_quote_id   TEXT,
  ADD COLUMN IF NOT EXISTS contract_id           TEXT,
  ADD COLUMN IF NOT EXISTS approval_status       TEXT DEFAULT 'Not Required',
  ADD COLUMN IF NOT EXISTS approval_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by           TEXT,
  ADD COLUMN IF NOT EXISTS approved_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_reason       TEXT,
  ADD COLUMN IF NOT EXISTS accepted_date         DATE,
  ADD COLUMN IF NOT EXISTS signed_quote_url      TEXT,
  ADD COLUMN IF NOT EXISTS email_log             JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_reminder_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS change_log            JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachments           JSONB DEFAULT '[]'::jsonb,

  -- ── 2. Customer billing snapshot (taken at quote creation) ──
  -- These are SNAPSHOT values copied from the account/contact/opp at
  -- the moment the quote was drafted. Keep them editable on the quote
  -- so a later account edit doesn't rewrite historical quote PDFs.
  ADD COLUMN IF NOT EXISTS currency                 TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS exchange_rate            NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS legal_name               TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS shipping_address_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS gstin                    TEXT,
  ADD COLUMN IF NOT EXISTS pan                      TEXT,
  ADD COLUMN IF NOT EXISTS tax_treatment            TEXT,
  ADD COLUMN IF NOT EXISTS po_mandatory             TEXT,
  ADD COLUMN IF NOT EXISTS po_number                TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms            TEXT,
  ADD COLUMN IF NOT EXISTS credit_days              INTEGER,
  ADD COLUMN IF NOT EXISTS billing_contact_name     TEXT,
  ADD COLUMN IF NOT EXISTS billing_contact_email    TEXT,
  ADD COLUMN IF NOT EXISTS finance_contact_email    TEXT,

  -- ── 3. Sales / deal context copied from Opportunity ──
  ADD COLUMN IF NOT EXISTS territory        TEXT,
  ADD COLUMN IF NOT EXISTS lob              TEXT,
  ADD COLUMN IF NOT EXISTS deal_size        TEXT,
  ADD COLUMN IF NOT EXISTS secondary_contact_ids TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contact_roles    JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_lead_id   TEXT,

  -- ── 4. Sales narrative (scope / assumptions / exclusions / CL) ──
  ADD COLUMN IF NOT EXISTS scope            TEXT,
  ADD COLUMN IF NOT EXISTS assumptions      TEXT,
  ADD COLUMN IF NOT EXISTS exclusions       TEXT,
  ADD COLUMN IF NOT EXISTS deliverables     TEXT,
  ADD COLUMN IF NOT EXISTS prepared_by      TEXT,
  ADD COLUMN IF NOT EXISTS sales_engineer   TEXT,
  ADD COLUMN IF NOT EXISTS cover_letter     TEXT;

-- ── Indexes for the new lookup/filter paths ──
CREATE INDEX IF NOT EXISTS quotations_account_id_idx     ON public.quotations (account_id);
CREATE INDEX IF NOT EXISTS quotations_opp_id_idx         ON public.quotations (opp_id);
CREATE INDEX IF NOT EXISTS quotations_status_idx         ON public.quotations (status);
CREATE INDEX IF NOT EXISTS quotations_contract_id_idx    ON public.quotations (contract_id);
CREATE INDEX IF NOT EXISTS quotations_supersedes_idx     ON public.quotations (supersedes_quote_id);
CREATE INDEX IF NOT EXISTS quotations_accepted_date_idx  ON public.quotations (accepted_date);

COMMIT;

-- ══════════════════════════════════════════════════════════════════════
-- Post-apply:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='quotations'
--   ORDER BY ordinal_position;
--
--   NOTIFY pgrst, 'reload schema';
-- ══════════════════════════════════════════════════════════════════════
