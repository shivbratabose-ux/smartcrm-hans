-- ═══════════════════════════════════════════════════════════════════
-- TENDER MANAGEMENT — Phase 2: Bid qualification & approval
-- Run once against the live Supabase DB. Safe & re-runnable.
-- ───────────────────────────────────────────────────────────────────
-- Adds the bid qualification checklist, Bid/No-Bid/Hold decision, and the
-- 3-tier approval chain (Sales Manager → Vertical Head → CEO) to
-- opportunities. JSONB for the checklist + approval chain. Additive.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS bid_qualification   JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS bid_decision        TEXT,
  ADD COLUMN IF NOT EXISTS bid_decision_notes  TEXT,
  ADD COLUMN IF NOT EXISTS bid_approval_status TEXT DEFAULT 'Not Submitted',
  ADD COLUMN IF NOT EXISTS bid_approval_chain  JSONB DEFAULT '[]'::jsonb;
