-- ═══════════════════════════════════════════════════════════════════
-- ACCOUNTS — add erp_account_no for ERP system cross-reference
-- ═══════════════════════════════════════════════════════════════════
-- Hans Infomatic's ERP issues account codes like SHP/2881 and
-- CTM/1952 that reps already use day-to-day. Until now the bulk upload
-- stored those codes in `account_no`, which forced the CRM and ERP to
-- share a numbering space — new accounts created in the CRM got a
-- different format (ACC-2026-NNN) and the two systems drifted.
--
-- This migration adds a separate erp_account_no column so:
--   - CRM owns `account_no` (auto-generated ACC-YYYY-NNN)
--   - ERP code lives in `erp_account_no` for cross-system mapping
--   - Reps can search/filter on either
--   - Cross-system reports (collections, billing, audit) join cleanly
--
-- The column is nullable — only ERP-imported accounts carry an ERP
-- code; greenfield accounts created in the CRM UI leave it blank.
-- Indexed for the search/filter use case (Accounts list view will
-- offer it as an opt-in column post-PR).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS erp_account_no TEXT;

-- Search-by-ERP-code is the hot path (rep types "SHP/2881" into the
-- accounts search bar). Btree index supports both equality and prefix
-- matches against the LIKE 'SHP/%' patterns used in client filters.
CREATE INDEX IF NOT EXISTS idx_accounts_erp_account_no
  ON public.accounts (erp_account_no);

-- No RLS changes — the column inherits the existing accounts policies.
-- No realtime change — accounts is already in supabase_realtime.
