-- ═══════════════════════════════════════════════════════════════════
-- TENDER MANAGEMENT — Phase 4: Project Delivery module
-- Run once against the live Supabase DB. Safe & re-runnable.
-- ───────────────────────────────────────────────────────────────────
-- New `projects` table. A Project is auto-created when an opportunity is
-- Won (CRM→Project handover) and carries delivery execution: phase,
-- progress %, milestones, team, go-live dates. Reads are company-wide;
-- writes are owner/manager/delivery-role scoped (matches the app model).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.projects (
  id              TEXT PRIMARY KEY,
  project_no      TEXT,
  name            TEXT,
  account_id      TEXT,
  opp_id          TEXT,
  contract_id     TEXT,
  owner           TEXT,
  products        TEXT[] DEFAULT '{}',
  status          TEXT DEFAULT 'Requirement Gathering',
  progress        NUMERIC DEFAULT 0,
  start_date      DATE,
  go_live_target  DATE,
  go_live_actual  DATE,
  value           NUMERIC DEFAULT 0,
  scope           TEXT,
  deliverables    TEXT,
  risks           TEXT,
  notes           TEXT,
  milestones      JSONB DEFAULT '[]'::jsonb,
  team            JSONB DEFAULT '[]'::jsonb,
  created_date    DATE,
  is_deleted      BOOLEAN DEFAULT false,
  deleted_at      TIMESTAMPTZ,
  deleted_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Reads: company-wide (matches every other table's policy)
DROP POLICY IF EXISTS "projects_read" ON public.projects;
CREATE POLICY "projects_read" ON public.projects FOR SELECT USING (true);

-- Insert: any non-viewer (Won→Project handover, delivery team)
DROP POLICY IF EXISTS "projects_insert" ON public.projects;
CREATE POLICY "projects_insert" ON public.projects FOR INSERT WITH CHECK (
  public.get_crm_role() <> 'viewer'
);

-- Update: owner, managers, delivery roles
DROP POLICY IF EXISTS "projects_update" ON public.projects;
CREATE POLICY "projects_update" ON public.projects FOR UPDATE USING (
  public.get_crm_role() IN ('admin','md','director','vp_sales_mkt','product_head','line_mgr','country_mgr','bd_lead','tech_lead')
  OR owner = public.get_crm_user_id()
);

-- Delete: admins / management only
DROP POLICY IF EXISTS "projects_delete" ON public.projects;
CREATE POLICY "projects_delete" ON public.projects FOR DELETE USING (
  public.get_crm_role() IN ('admin','md','director')
);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
