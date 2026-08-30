-- ═══════════════════════════════════════════════════════════════════
-- Email Agent E3 — conditional suggestions, feedback, high-impact flag
-- ═══════════════════════════════════════════════════════════════════
-- Spec §7 "conditional updates" (lead status, opp stage, close date,
-- quote status, probability, priority) are never auto-applied: when an
-- email is explicit AND the admin has enabled the specific rule, the
-- agent files a suggestion carrying old value / new value / reason /
-- confidence, and a human approves or rejects it (§9 conflict flow).
-- Won/Lost indications are always suggestions and always high-impact,
-- whatever the rule config says (spec §7 "never automatically").

-- Per-rule admin toggles. Keys are "entityType:field" (e.g.
-- "opp:stage", "lead:stage", "opp:closeDate"); absent/false = off.
ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS em_conditional_rules JSONB DEFAULT '{}'::jsonb;

-- Won/Lost + similar irreversibles get a stronger visual + audit tier.
ALTER TABLE public.em_suggested_updates
  ADD COLUMN IF NOT EXISTS high_impact BOOLEAN DEFAULT false;

-- §11 "provide feedback to improve future drafts/results".
ALTER TABLE public.em_processed
  ADD COLUMN IF NOT EXISTS feedback TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_em_suggested_pending
  ON public.em_suggested_updates (status) WHERE status = 'pending';
