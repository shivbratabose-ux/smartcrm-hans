-- ═══════════════════════════════════════════════════════════════════
-- Email-to-CRM Activity Agent — E1 schema (CRM AI Agents, Module B)
-- ═══════════════════════════════════════════════════════════════════
-- Metadata for emails processed via communication@hansinfomatic.com.
-- DELIBERATELY ABSENT everywhere in this file: subject lines, email
-- bodies, external addresses, attachment names, raw messages. The spec
-- (§10) forbids storing them, and the fingerprint is all dedupe needs.
-- The raw mail exists only transiently inside the em-ingest function.

-- One row per processed (or attempted) email.
CREATE TABLE IF NOT EXISTS public.em_processed (
  -- HMAC-SHA256 of (provider message id + mailbox), hex. Content-free
  -- duplicate detection per spec §4.
  fingerprint TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ DEFAULT now(),
  -- The verified CRM user who sent/forwarded the mail. NULL when the
  -- sender could not be verified (status 'unverified_sender').
  sender_user_id TEXT REFERENCES public.users(id),
  direction TEXT DEFAULT '',           -- Outbound | Inbound | Internal | ''
  direction_confidence NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processed',
    -- processed | needs_match | suggested | unmatched | high_impact
    -- | duplicate | unverified_sender | failed | ignored
  match_confidence NUMERIC DEFAULT 0,
  extract_confidence NUMERIC DEFAULT 0,
  matched_entity_type TEXT DEFAULT '', -- lead | account | contact | opp | ''
  matched_entity_id TEXT DEFAULT '',
  -- Candidates offered when no auto-link was safe (ids + basis only).
  match_candidates JSONB DEFAULT '[]'::jsonb,
  activity_id TEXT,                    -- the CRM activity row created
  intent JSONB DEFAULT '[]'::jsonb,    -- spec §6 classifications
  sentiment TEXT DEFAULT '',
  attachment_omitted BOOLEAN DEFAULT false,
  auth_results TEXT DEFAULT '',        -- SPF/DKIM/DMARC summary string
  error TEXT DEFAULT '',               -- when status = 'failed'
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ
);

-- Suggested field changes awaiting human approval (spec §7 conditional /
-- §9 conflict flow). E1 creates the table; E3 populates it.
CREATE TABLE IF NOT EXISTS public.em_suggested_updates (
  id TEXT PRIMARY KEY,
  fingerprint TEXT REFERENCES public.em_processed(fingerprint) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT DEFAULT '',
  new_value TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  confidence NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',       -- pending | approved | rejected
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Append-only audit for agent actions (spec §14). INSERT-only by policy:
-- no UPDATE/DELETE policies exist, so even admins cannot rewrite history
-- through the API.
CREATE TABLE IF NOT EXISTS public.agent_audit_events (
  id BIGSERIAL PRIMARY KEY,
  module TEXT NOT NULL,                -- 'email_agent' | 're_engagement'
  ref TEXT NOT NULL,                   -- fingerprint / candidate id
  event TEXT NOT NULL,                 -- verified | matched | summarised | ...
  actor TEXT NOT NULL DEFAULT 'agent', -- user id or 'agent'
  detail JSONB DEFAULT '{}'::jsonb,
  at TIMESTAMPTZ DEFAULT now()
);

-- Shared agent configuration (both modules read it; admins write it).
-- Singleton row keyed 'org', mirroring the app_settings scope pattern.
CREATE TABLE IF NOT EXISTS public.agent_config (
  scope TEXT PRIMARY KEY DEFAULT 'org',
  em_enabled BOOLEAN DEFAULT false,    -- master switch, off until launch
  em_paused BOOLEAN DEFAULT false,     -- emergency pause (checked each poll)
  em_min_match_confidence NUMERIC DEFAULT 0.9,
  re_enabled BOOLEAN DEFAULT false,    -- Module A switch (Phase R1)
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);
INSERT INTO public.agent_config (scope) VALUES ('org') ON CONFLICT DO NOTHING;

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.em_processed         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.em_suggested_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_audit_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_config         ENABLE ROW LEVEL SECURITY;

-- Same role climate as the rest of the CRM: global roles see all rows,
-- everyone else sees rows where they are the sender. (Manager-scope
-- refinement lands with the queue team view in E2; the app already
-- scopes what it shows, this is the server-side floor.)
DO $$ BEGIN
  CREATE POLICY em_processed_select ON public.em_processed FOR SELECT
    USING (
      sender_user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid()
                 AND u.role IN ('admin','md','director','vp_sales_mkt'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reviews (re-link, ignore) go through the authenticated user. RLS is
-- row-level; column discipline is the app + audit trail. New rows come
-- only from the service role (em-ingest), which bypasses RLS.
DO $$ BEGIN
  CREATE POLICY em_processed_update ON public.em_processed FOR UPDATE
    USING (
      sender_user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid()
                 AND u.role IN ('admin','md','director','vp_sales_mkt'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY em_suggested_select ON public.em_suggested_updates FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.em_processed p WHERE p.fingerprint = em_suggested_updates.fingerprint
      AND (p.sender_user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
           OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid()
                      AND u.role IN ('admin','md','director','vp_sales_mkt')))));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY em_suggested_update ON public.em_suggested_updates FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.em_processed p WHERE p.fingerprint = em_suggested_updates.fingerprint
      AND (p.sender_user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
           OR EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid()
                      AND u.role IN ('admin','md','director','vp_sales_mkt')))));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Audit: any active CRM user may read; nobody UPDATEs/DELETEs (no policy
-- exists for those verbs, so they are denied); INSERT via service role only.
DO $$ BEGIN
  CREATE POLICY agent_audit_select ON public.agent_audit_events FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY agent_config_select ON public.agent_config FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY agent_config_update ON public.agent_config FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.users u WHERE u.auth_user_id = auth.uid()
                   AND u.role IN ('admin','md','director')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_em_processed_status ON public.em_processed (status);
CREATE INDEX IF NOT EXISTS idx_em_processed_sender ON public.em_processed (sender_user_id);
CREATE INDEX IF NOT EXISTS idx_agent_audit_ref     ON public.agent_audit_events (module, ref);
