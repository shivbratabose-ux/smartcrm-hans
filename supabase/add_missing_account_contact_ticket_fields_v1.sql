-- ══════════════════════════════════════════════════════════════════════
-- Migration: add_missing_account_contact_ticket_fields_v1
-- ══════════════════════════════════════════════════════════════════════
-- Problem:
--   The accounts, contacts, tickets, activities, call_reports, comm_logs,
--   and events tables drifted behind the BLANK_* templates in
--   src/data/seed.js. UI fields were silently stripped on every insert /
--   update by writeWithSchemaHeal (src/lib/db.js): the user typed a
--   value, hit save, the toast said "saved", but on next reload the
--   field was blank because Postgres rejected the column and the heal
--   path quietly dropped it.
--
--   Most visible breakages:
--     - accounts: Customer addresses[] from CSV bulk upload (commit
--       a3b87ad) never persisted. legalName/pan/gstin/billing*/payment*
--       all wiped on save.
--     - contacts: addressId (PR #102 "every contact must link to an
--       Account address") never reached the cloud, so the auto-heal
--       backfill (src/SmartCRM.jsx:915) was working off local state
--       only and re-running every reload.
--     - tickets: severity/category/escalation/SLA/CSAT all dropped.
--     - call_reports: contact / opp linkage dropped.
--
-- Fix:
--   Add every missing column with safe defaults. Existing rows get NULL
--   (or zero / empty-array equivalents). All ADD COLUMN IF NOT EXISTS
--   so the migration is re-runnable.
--
-- Safety:
--   - Pure additive — no rewrites of existing rows.
--   - No NOT NULL on the new columns — protects production data.
--   - The companion JS change in src/lib/db.js extends toSnake / toCamel
--     so the new columns are properly mapped both ways.
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. accounts: legal / billing / contact / commercial drift ─────────
ALTER TABLE public.accounts
  -- Product / segmentation
  ADD COLUMN IF NOT EXISTS product_selection      JSONB  DEFAULT '[]'::jsonb,
  -- Geo
  ADD COLUMN IF NOT EXISTS state                  TEXT,
  ADD COLUMN IF NOT EXISTS pincode                TEXT,
  -- Legal / tax identity
  ADD COLUMN IF NOT EXISTS legal_name             TEXT,
  ADD COLUMN IF NOT EXISTS pan                    TEXT,
  ADD COLUMN IF NOT EXISTS gstin                  TEXT,
  ADD COLUMN IF NOT EXISTS cin                    TEXT,
  ADD COLUMN IF NOT EXISTS tax_treatment          TEXT,
  ADD COLUMN IF NOT EXISTS tds_applicable         TEXT DEFAULT 'No',
  ADD COLUMN IF NOT EXISTS po_mandatory           TEXT DEFAULT 'No',
  -- Billing block (separate from physical address)
  ADD COLUMN IF NOT EXISTS billing_address        TEXT,
  ADD COLUMN IF NOT EXISTS billing_city           TEXT,
  ADD COLUMN IF NOT EXISTS billing_state          TEXT,
  ADD COLUMN IF NOT EXISTS billing_pincode        TEXT,
  ADD COLUMN IF NOT EXISTS billing_country        TEXT,
  -- Primary contact snapshot (denormalised for list views)
  ADD COLUMN IF NOT EXISTS primary_contact        TEXT,
  ADD COLUMN IF NOT EXISTS primary_email          TEXT,
  ADD COLUMN IF NOT EXISTS primary_phone          TEXT,
  -- Billing / finance contacts
  ADD COLUMN IF NOT EXISTS billing_contact_name   TEXT,
  ADD COLUMN IF NOT EXISTS billing_contact_email  TEXT,
  ADD COLUMN IF NOT EXISTS finance_contact_email  TEXT,
  -- Commercial defaults (inherited by quotes / contracts)
  ADD COLUMN IF NOT EXISTS payment_terms          TEXT DEFAULT 'Net 30',
  ADD COLUMN IF NOT EXISTS credit_days            INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS currency               TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS billing_frequency      TEXT DEFAULT 'Annual',
  -- Org structure / segmentation
  ADD COLUMN IF NOT EXISTS entity_type            TEXT DEFAULT 'Head Office',
  ADD COLUMN IF NOT EXISTS group_code             TEXT,
  ADD COLUMN IF NOT EXISTS territory              TEXT,
  ADD COLUMN IF NOT EXISTS region                 TEXT,
  ADD COLUMN IF NOT EXISTS source                 TEXT,
  ADD COLUMN IF NOT EXISTS notes                  TEXT,
  -- Address book — drives every contact's addressId linkage (PR #102)
  ADD COLUMN IF NOT EXISTS addresses              JSONB  DEFAULT '[]'::jsonb;

-- ── 2. contacts: address linkage / extra channels / qualification ─────
ALTER TABLE public.contacts
  -- Address linkage (PR #102 — required for every contact)
  ADD COLUMN IF NOT EXISTS address_id              TEXT,
  ADD COLUMN IF NOT EXISTS city                    TEXT,
  ADD COLUMN IF NOT EXISTS state                   TEXT,
  ADD COLUMN IF NOT EXISTS country                 TEXT,
  ADD COLUMN IF NOT EXISTS pincode                 TEXT,
  -- Extra contact channels
  ADD COLUMN IF NOT EXISTS alternate_email         TEXT,
  ADD COLUMN IF NOT EXISTS alternate_phone         TEXT,
  ADD COLUMN IF NOT EXISTS linked_in_url           TEXT,
  -- Qualification / segmentation
  ADD COLUMN IF NOT EXISTS decision_level          TEXT,
  ADD COLUMN IF NOT EXISTS influence               TEXT DEFAULT 'Medium',
  ADD COLUMN IF NOT EXISTS category                TEXT,
  ADD COLUMN IF NOT EXISTS preferred_contact_mode  TEXT DEFAULT 'Email',
  ADD COLUMN IF NOT EXISTS do_not_contact          TEXT DEFAULT 'No',
  ADD COLUMN IF NOT EXISTS last_contact_date       DATE,
  ADD COLUMN IF NOT EXISTS source                  TEXT;

-- ── 3. tickets: SLA / triage / classification ─────────────────────────
ALTER TABLE public.tickets
  -- Identifiers / product breakdown
  ADD COLUMN IF NOT EXISTS ticket_no          TEXT,
  ADD COLUMN IF NOT EXISTS product_selection  JSONB DEFAULT '[]'::jsonb,
  -- Triage / escalation / outcome
  ADD COLUMN IF NOT EXISTS escalation         TEXT,
  ADD COLUMN IF NOT EXISTS resolution         TEXT,
  ADD COLUMN IF NOT EXISTS csat               INTEGER DEFAULT 0,
  -- Classification
  ADD COLUMN IF NOT EXISTS category           TEXT,
  ADD COLUMN IF NOT EXISTS sub_category       TEXT,
  -- Reporting / lifecycle dates
  ADD COLUMN IF NOT EXISTS reported_by        TEXT,
  ADD COLUMN IF NOT EXISTS reported_date      DATE,
  ADD COLUMN IF NOT EXISTS resolved_date      DATE,
  -- Diagnostics
  ADD COLUMN IF NOT EXISTS affected_module    TEXT,
  ADD COLUMN IF NOT EXISTS severity           TEXT DEFAULT 'Medium',
  ADD COLUMN IF NOT EXISTS environment        TEXT DEFAULT 'Production',
  ADD COLUMN IF NOT EXISTS workaround         TEXT DEFAULT 'No',
  ADD COLUMN IF NOT EXISTS internal_notes     TEXT,
  ADD COLUMN IF NOT EXISTS revisit_date       DATE,
  ADD COLUMN IF NOT EXISTS tags               TEXT;

-- ── 4. activities: file attachments ───────────────────────────────────
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS files JSONB DEFAULT '[]'::jsonb;

-- ── 5. call_reports: contact / opp linkage + product detail ───────────
ALTER TABLE public.call_reports
  ADD COLUMN IF NOT EXISTS contact_id          TEXT,
  ADD COLUMN IF NOT EXISTS opp_id              TEXT,
  ADD COLUMN IF NOT EXISTS product_selection   JSONB DEFAULT '[]'::jsonb;

-- ── 6. comm_logs: counterparty addresses ──────────────────────────────
-- "from" and "to" are not reserved words in Postgres, but we double-quote
-- them to avoid ambiguity with positional clauses in future queries.
ALTER TABLE public.comm_logs
  ADD COLUMN IF NOT EXISTS "from" TEXT,
  ADD COLUMN IF NOT EXISTS "to"   TEXT;

-- ── 7. events: meeting location & reminder lead-time ──────────────────
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS location     TEXT,
  ADD COLUMN IF NOT EXISTS reminder_min INTEGER DEFAULT 15;

-- ── 8. Indexes (low-cost, high-value reads) ───────────────────────────
CREATE INDEX IF NOT EXISTS idx_contacts_address ON public.contacts(address_id) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_tickets_category ON public.tickets(category)    WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_call_reports_opp ON public.call_reports(opp_id) WHERE NOT is_deleted;

COMMIT;
