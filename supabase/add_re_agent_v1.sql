-- ═══════════════════════════════════════════════════════════════════
-- Customer Re-engagement Agent — R1 schema (CRM AI Agents, Module A)
-- ═══════════════════════════════════════════════════════════════════
-- Daily selection of accounts with no meaningful contact for N days,
-- AI-drafted follow-ups, human approval, send. Draft-only by doctrine:
-- nothing here can send an email; sending happens through send-email
-- with the approving user's own JWT, and every step is audited in
-- agent_audit_events (module 're_engagement').

-- ── Last meaningful contact per account ─────────────────────────────
-- One definition the selection scan and the UI share. "Meaningful" =
-- completed activities (Module B's email activities land here too, so
-- a CC'd email resets the clock with zero extra code — spec §13),
-- call reports, logged communications, quotes, and ticket touches.
CREATE OR REPLACE VIEW public.v_last_meaningful_contact AS
SELECT a.id AS account_id,
  GREATEST(
    COALESCE((SELECT MAX(act.date) FROM public.activities act
              WHERE act.account_id = a.id AND act.is_deleted = false
                AND act.status = 'Completed'), '1900-01-01'::date),
    COALESCE((SELECT MAX(cr.call_date) FROM public.call_reports cr
              WHERE cr.account_id = a.id AND cr.is_deleted = false), '1900-01-01'::date),
    COALESCE((SELECT MAX(cl.date) FROM public.comm_logs cl
              WHERE cl.account_id = a.id AND cl.is_deleted = false), '1900-01-01'::date),
    COALESCE((SELECT MAX(q.created_at::date) FROM public.quotes q
              WHERE q.account_id = a.id AND q.is_deleted = false), '1900-01-01'::date),
    COALESCE((SELECT MAX(t.updated_at::date) FROM public.tickets t
              WHERE t.account_id = a.id AND t.is_deleted = false), '1900-01-01'::date)
  ) AS last_contact
FROM public.accounts a
WHERE a.is_deleted = false;

-- ── Candidates: one row per (account, run) still open ───────────────
CREATE TABLE IF NOT EXISTS public.re_candidates (
  id TEXT PRIMARY KEY,
  run_date DATE NOT NULL,
  account_id TEXT NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id TEXT,                      -- best verified-email contact
  owner_id TEXT REFERENCES public.users(id),
  last_contact_at DATE,
  days_inactive INTEGER DEFAULT 0,
  classification TEXT NOT NULL DEFAULT 'ready',
    -- ready | internal_pending | complaint | waiting_customer
    -- | do_not_contact | insufficient
  selection_reasons JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'new',
    -- new | drafted | sent | skipped | closed (fresh contact arrived)
  skip_reason TEXT DEFAULT '',
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Drafts: the AI output awaiting a human ──────────────────────────
CREATE TABLE IF NOT EXISTS public.re_drafts (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES public.re_candidates(id) ON DELETE CASCADE,
  crm_summary JSONB DEFAULT '{}'::jsonb,   -- spec §2 internal summary
  subject_options JSONB DEFAULT '[]'::jsonb,
  recommended_subject TEXT DEFAULT '',
  body TEXT DEFAULT '',
  edited_subject TEXT,                     -- what the human actually sent
  edited_body TEXT,
  reasoning TEXT DEFAULT '',
  recommended_action TEXT DEFAULT '',
  followup_date DATE,
  risk_flags JSONB DEFAULT '[]'::jsonb,
  approved_by TEXT,
  sent_at TIMESTAMPTZ,
  send_message_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Module A config knobs (agent_config table shipped in E1).
ALTER TABLE public.agent_config
  ADD COLUMN IF NOT EXISTS re_paused BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS re_inactivity_days INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS re_cooldown_days INTEGER DEFAULT 21,
  ADD COLUMN IF NOT EXISTS re_draft_cap_per_run INTEGER DEFAULT 20;

-- ── RLS: owner sees/works their queue; global roles see all ─────────
ALTER TABLE public.re_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.re_drafts     ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY re_candidates_select ON public.re_candidates FOR SELECT
    USING (
      owner_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid()
                 AND u.role IN ('admin','md','director','vp_sales_mkt'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY re_candidates_update ON public.re_candidates FOR UPDATE
    USING (
      owner_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid()
                 AND u.role IN ('admin','md','director','vp_sales_mkt'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY re_drafts_select ON public.re_drafts FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.re_candidates c WHERE c.id = re_drafts.candidate_id
      AND (c.owner_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
           OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid()
                      AND u.role IN ('admin','md','director','vp_sales_mkt')))));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY re_drafts_update ON public.re_drafts FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.re_candidates c WHERE c.id = re_drafts.candidate_id
      AND (c.owner_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
           OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid()
                      AND u.role IN ('admin','md','director','vp_sales_mkt')))));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_re_candidates_status ON public.re_candidates (status, owner_id);
CREATE INDEX IF NOT EXISTS idx_re_candidates_account ON public.re_candidates (account_id) WHERE status IN ('new','drafted');
CREATE INDEX IF NOT EXISTS idx_re_drafts_candidate ON public.re_drafts (candidate_id);

-- ── Spec §13: fresh contact closes open candidates automatically ────
-- A new completed activity on an account (a call logged, a CC'd email
-- via Module B, anything) means the customer is no longer unattended.
CREATE OR REPLACE FUNCTION public.re_close_on_contact() RETURNS trigger AS $$
BEGIN
  IF NEW.account_id IS NOT NULL AND NEW.status = 'Completed' THEN
    UPDATE public.re_candidates
       SET status = 'closed', decided_at = now(), skip_reason = 'fresh contact recorded'
     WHERE account_id = NEW.account_id AND status IN ('new', 'drafted');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_re_close_on_contact ON public.activities;
CREATE TRIGGER trg_re_close_on_contact
  AFTER INSERT OR UPDATE OF status ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.re_close_on_contact();
