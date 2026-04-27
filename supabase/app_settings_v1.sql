-- ═══════════════════════════════════════════════════════════════════
-- APP SETTINGS — masters & catalog persistence
-- ═══════════════════════════════════════════════════════════════════
-- Up to now `masters` (every dropdown's allowed values) and `catalog`
-- (the product catalogue with module pricing logic added in PRs #90/#94)
-- only persisted to the user's localStorage. Result: any line manager
-- editing pipeline stages (#96), product modules (#90), or any of the
-- 60+ reference-data masters saved their changes only on their own
-- browser. Other users / other devices never saw the customisation,
-- and a cleared cache wiped it.
--
-- This migration adds a single `app_settings` row per scope (today
-- always 'org', leaving room for per-team / per-user scopes later)
-- that stores the masters + catalog as JSONB blobs.
--
-- Why JSONB and not 30+ relational tables?
--   - Masters is a heterogeneous bag (chip lists, color-coded stages,
--     priority-ordered SLA hours, etc.) — relational schema would need
--     either one table per master (60+ tables) or an EAV pattern (slow,
--     unindexable). JSONB matches how the React state already looks.
--   - Edits are infrequent (weekly at most) and happen via Masters UI;
--     no hot-path queries hit individual masters by SQL.
--   - GIN-indexed for cheap key-existence / contains queries if we
--     ever need them.
--
-- Concurrency model:
--   - Whole-blob upsert. The Masters editor is a single-pane CRUD UI,
--     not a multi-pane collaborative editor — last-write-wins is the
--     intended behaviour and matches how the chip editor already works.
--   - Realtime channel notifies other tabs to refetch on remote write.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.app_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'org' = single org-wide settings row. Future: 'team:<id>' or
  -- 'user:<id>' overrides without changing the schema.
  scope       TEXT NOT NULL DEFAULT 'org',
  masters     JSONB NOT NULL DEFAULT '{}'::jsonb,
  catalog     JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- TEXT (not UUID) because public.users.id is TEXT in this schema —
  -- see supabase/schema.sql line 8. Original v1 declared UUID and the
  -- FK creation failed with PG 42804 ("incompatible types: uuid and
  -- text") on real Supabase projects, leaving no table behind. Fixed
  -- in-place since the original migration was atomic / never applied.
  updated_by  TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exactly one row per scope. Combined with the upsert in db.js this
  -- gives us safe last-write-wins without a separate primary key dance.
  UNIQUE (scope)
);

-- GIN index for ad-hoc JSONB queries (e.g. "which orgs have a
-- pipelineStage named 'Negotiation'?"). Cheap on a single-row-per-org
-- table; future-proofs us when scope grows beyond 'org'.
CREATE INDEX IF NOT EXISTS idx_app_settings_masters_gin ON public.app_settings USING GIN (masters);
CREATE INDEX IF NOT EXISTS idx_app_settings_catalog_gin ON public.app_settings USING GIN (catalog);

-- ── RLS ──────────────────────────────────────────────────────────
-- Read: every active CRM user needs the master lists to populate
--   dropdowns (Stage, Vertical, Lead Source, etc.) — denying read
--   would break the whole UI for non-admins.
-- Write: management roles. Includes line_mgr because each product in
--   the catalog (iCAFFE, WiseAMS, WiseHandling, etc.) is owned by a
--   "Line Manager" who is responsible for adding / editing modules
--   under that product. Bottlenecking every catalog change on
--   admin/md isn't realistic in an internal CRM where ~10 different
--   line managers maintain their own product lines.
--   Excludes sales_exec, tech_lead, support, viewer — those don't
--   manage product/master data.
--   (Tightened from the original v1 policy in app_settings_v2_relax_rls.sql.)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_read" ON public.app_settings;
CREATE POLICY "app_settings_read" ON public.app_settings FOR SELECT USING (
  -- Any authenticated CRM user. Anonymous read is denied by Supabase by
  -- default; this just narrows further to active CRM profiles via the
  -- helper function pattern used elsewhere.
  public.get_crm_role() IS NOT NULL
);

DROP POLICY IF EXISTS "app_settings_write" ON public.app_settings;
CREATE POLICY "app_settings_write" ON public.app_settings FOR ALL USING (
  public.get_crm_role() IN (
    'admin', 'md', 'director', 'vp_sales_mkt',
    'line_mgr', 'country_mgr', 'bd_lead'
  )
) WITH CHECK (
  public.get_crm_role() IN (
    'admin', 'md', 'director', 'vp_sales_mkt',
    'line_mgr', 'country_mgr', 'bd_lead'
  )
);

-- ── Auto-update timestamp trigger ────────────────────────────────
-- Stamps updated_at + updated_by on every write so audit shows who
-- changed the org config and when. The user id is pulled from the
-- existing get_crm_user_id() helper.
CREATE OR REPLACE FUNCTION public.touch_app_settings()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := public.get_crm_user_id();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_app_settings_touch ON public.app_settings;
CREATE TRIGGER trg_app_settings_touch
  BEFORE INSERT OR UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_app_settings();

-- ── Realtime ─────────────────────────────────────────────────────
-- Subscribed by the SmartCRM client so two reps editing in two tabs
-- don't end up looking at stale lists. Whole-row payload is fine —
-- the JSONB blobs are small (typically 20–50KB combined).
-- Idempotent: re-running the migration won't fail if the publication
-- already includes this table (PG would otherwise raise "relation
-- already member of publication").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
  END IF;
END $$;
