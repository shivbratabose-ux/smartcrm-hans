-- ═══════════════════════════════════════════════════════════════════
-- FIX QUOTATION COLUMNS — run once against the live Supabase DB
-- ───────────────────────────────────────────────────────────────────
-- Root cause of "quotes update: upstream request timeout" + lost quote
-- data on save: the client was writing fields with no matching column.
-- Every such field makes PostgREST reject the write; the app strips it
-- and retries, and across many quotes those retries pile up into gateway
-- timeouts — so the save never lands and the row is lost on reload.
--
-- Definite gap: `cc_contact_ids` (the quote's CC contacts) had no column,
-- so CC recipients were dropped on every save.
--
-- This migration adds cc_contact_ids and idempotently re-asserts the full
-- quotation column set (ADD COLUMN IF NOT EXISTS) so the live table matches
-- what the app sends — eliminating the strip/retry storm. Safe & re-runnable.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.quotations
  -- the missing one
  ADD COLUMN IF NOT EXISTS cc_contact_ids        TEXT[]  DEFAULT '{}',
  -- arrays / json
  ADD COLUMN IF NOT EXISTS secondary_contact_ids TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS product_selection     JSONB   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS items                 JSONB   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS change_log            JSONB   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS email_log             JSONB   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachments           JSONB   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_roles         JSONB   DEFAULT '[]'::jsonb,
  -- numerics
  ADD COLUMN IF NOT EXISTS subtotal              NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount            NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount              NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total                 NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version               INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS exchange_rate         NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS credit_days           INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate              NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_final              BOOLEAN DEFAULT false,
  -- text / metadata
  ADD COLUMN IF NOT EXISTS product               TEXT,
  ADD COLUMN IF NOT EXISTS tax_type              TEXT,
  ADD COLUMN IF NOT EXISTS validity              TEXT,
  ADD COLUMN IF NOT EXISTS notes                 TEXT,
  ADD COLUMN IF NOT EXISTS scope                 TEXT,
  ADD COLUMN IF NOT EXISTS assumptions           TEXT,
  ADD COLUMN IF NOT EXISTS exclusions            TEXT,
  ADD COLUMN IF NOT EXISTS deliverables          TEXT,
  ADD COLUMN IF NOT EXISTS prepared_by           TEXT,
  ADD COLUMN IF NOT EXISTS sales_engineer        TEXT,
  ADD COLUMN IF NOT EXISTS cover_letter          TEXT,
  ADD COLUMN IF NOT EXISTS legal_name            TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_snapshot  TEXT,
  ADD COLUMN IF NOT EXISTS shipping_address_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS gstin                 TEXT,
  ADD COLUMN IF NOT EXISTS pan                   TEXT,
  ADD COLUMN IF NOT EXISTS tax_treatment         TEXT,
  ADD COLUMN IF NOT EXISTS po_mandatory          TEXT,
  ADD COLUMN IF NOT EXISTS po_number             TEXT,
  ADD COLUMN IF NOT EXISTS payment_terms         TEXT,
  ADD COLUMN IF NOT EXISTS billing_contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS billing_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS finance_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS place_of_supply       TEXT,
  ADD COLUMN IF NOT EXISTS territory             TEXT,
  ADD COLUMN IF NOT EXISTS lob                   TEXT,
  ADD COLUMN IF NOT EXISTS deal_size             TEXT,
  ADD COLUMN IF NOT EXISTS source_lead_id        TEXT,
  ADD COLUMN IF NOT EXISTS quote_file_url        TEXT,
  ADD COLUMN IF NOT EXISTS approval_notes        TEXT,
  ADD COLUMN IF NOT EXISTS approval_status       TEXT,
  ADD COLUMN IF NOT EXISTS approval_requested_at TEXT,
  ADD COLUMN IF NOT EXISTS approved_by           TEXT,
  ADD COLUMN IF NOT EXISTS approved_at           TEXT,
  ADD COLUMN IF NOT EXISTS rejected_reason       TEXT,
  ADD COLUMN IF NOT EXISTS accepted_date         TEXT,
  ADD COLUMN IF NOT EXISTS signed_quote_url      TEXT,
  ADD COLUMN IF NOT EXISTS supersedes_quote_id   TEXT,
  ADD COLUMN IF NOT EXISTS contract_id           TEXT,
  ADD COLUMN IF NOT EXISTS last_reminder_at      TEXT,
  ADD COLUMN IF NOT EXISTS currency              TEXT;
