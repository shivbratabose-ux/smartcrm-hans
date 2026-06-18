-- ═══════════════════════════════════════════════════════════════════
-- ACCOUNTS — end-to-end ID lineage (lead → opportunity → account)
-- ═══════════════════════════════════════════════════════════════════
-- Goal: trace any account back through the chain that created it.
--   • Lead carries its own  lead_id  (#FL-YYYY-NNN)
--   • Opportunity carries    opp_no   (OPP-YYYY-NNN) + lead_id + source_lead_ids
--   • Account (this table) now carries the upstream references so the
--     full chain is recorded end-to-end, alongside the Finance-issued
--     account_no (the "Finance ID") set on approval.
--
-- Populated by:
--   • Lead → Opportunity conversion (creates the prospect account)
--   • Deal Won handler (creates / updates the Pending-Approval account)
--   • Finance approval (backfills opp_no / lead_id from the linked opp
--     while issuing account_no)
--
-- All nullable — legacy accounts and manually-created ones simply leave
-- them blank. Adding columns is also guarded by the app's write-time
-- schema-heal, so this migration is the durable (persisted) counterpart.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS source_opp_id  TEXT,  -- internal opportunity id (opps.id)
  ADD COLUMN IF NOT EXISTS opp_no         TEXT,  -- human opportunity number (OPP-YYYY-NNN)
  ADD COLUMN IF NOT EXISTS source_lead_id TEXT,  -- internal lead id (leads.id)
  ADD COLUMN IF NOT EXISTS lead_id        TEXT;  -- human lead number (#FL-YYYY-NNN)

-- Trace-by-opportunity is the join hot path (account → its winning deal).
CREATE INDEX IF NOT EXISTS idx_accounts_source_opp_id
  ON public.accounts (source_opp_id);

-- No RLS changes — columns inherit the existing accounts policies.
-- No realtime change — accounts is already in supabase_realtime.
