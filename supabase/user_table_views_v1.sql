-- ═══════════════════════════════════════════════════════════════════
-- USER TABLE VIEWS — per-user saved column presets
-- ═══════════════════════════════════════════════════════════════════
-- Lets each user save multiple "views" (column visibility + order +
-- width) per module: Pipeline list, Leads list, Accounts list. Users
-- can pick from a dropdown, save new ones, rename, delete, and mark
-- one as their default for that module.
--
-- Why one row per (user, module, name):
--   - A view is the user's *personal* shape of a table; not org-wide
--     and not shared. Two reps in the same office want different
--     columns visible.
--   - "Saved views" must support multiple presets per user/module
--     (e.g. "My Hot Leads", "West Region", "Quarter Close"), so the
--     unique key includes a user-supplied name — not just (user,
--     module) like app_settings.
--   - Default selection is a separate flag (is_default) rather than a
--     reserved-name convention. A trigger guarantees at most one
--     default per (user, module).
--
-- column_config shape (JSONB):
--   [
--     { "key": "company",   "visible": true,  "width": 220 },
--     { "key": "stage",     "visible": true,  "width": 140 },
--     { "key": "score",     "visible": false, "width": 80  },
--     ...
--   ]
-- Order-in-array IS the column order on screen. The client never
-- re-sorts this array — "no auto-rearrange" is a product requirement:
-- the user drags to reorder, and that order is what we persist.
--
-- Columns NOT present in the array are simply hidden. When the app
-- adds a new column to the registry later, existing saved views won't
-- show it until the user explicitly enables it from the column picker
-- — same "no auto-rearrange / no auto-add" guarantee.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_table_views (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- TEXT (not UUID) because public.users.id is TEXT in this schema.
  -- Same reasoning as app_settings.updated_by — see app_settings_v1.sql.
  user_id         TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Free-form module key. Today: 'pipeline_list', 'leads_list',
  -- 'accounts_list'. Free-form (not an enum) so adding a new module
  -- later doesn't require a migration.
  module          TEXT NOT NULL,
  -- User-supplied label shown in the Saved Views dropdown.
  name            TEXT NOT NULL,
  -- At most one row per (user, module) has is_default = true. Enforced
  -- by trg_user_table_views_one_default below — using a partial unique
  -- index would also work but the trigger lets us auto-flip the
  -- previous default off transparently when a new one is set.
  is_default      BOOLEAN NOT NULL DEFAULT false,
  column_config   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One name per user per module. Saving over an existing name is an
  -- upsert (db.js does ON CONFLICT (user_id, module, name) DO UPDATE).
  UNIQUE (user_id, module, name)
);

-- Loading "all views for module X for user Y" is the hot path —
-- happens every time a user opens Pipeline / Leads / Accounts.
CREATE INDEX IF NOT EXISTS idx_user_table_views_user_module
  ON public.user_table_views (user_id, module);

-- ── RLS ──────────────────────────────────────────────────────────
-- Each user can only see / edit / delete their own views. No admin
-- override — these are personal preferences, not org config.
ALTER TABLE public.user_table_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_table_views_owner_read" ON public.user_table_views;
CREATE POLICY "user_table_views_owner_read" ON public.user_table_views
  FOR SELECT USING (user_id = public.get_crm_user_id());

DROP POLICY IF EXISTS "user_table_views_owner_write" ON public.user_table_views;
CREATE POLICY "user_table_views_owner_write" ON public.user_table_views
  FOR ALL
  USING (user_id = public.get_crm_user_id())
  WITH CHECK (user_id = public.get_crm_user_id());

-- ── Auto-update updated_at + enforce single-default ─────────────
-- Two responsibilities in one trigger to avoid a second BEFORE pass:
--   1. stamp updated_at on every write
--   2. if NEW.is_default = true, flip every other view for the same
--      (user_id, module) to is_default = false
-- The flip is done with an UPDATE on the same table; the WHERE clause
-- excludes the current NEW row by id so we never recurse into our own
-- trigger on the row we're inserting/updating.
CREATE OR REPLACE FUNCTION public.touch_user_table_views()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.is_default = true THEN
    UPDATE public.user_table_views
       SET is_default = false
     WHERE user_id = NEW.user_id
       AND module  = NEW.module
       AND id     <> NEW.id
       AND is_default = true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_user_table_views_touch ON public.user_table_views;
CREATE TRIGGER trg_user_table_views_touch
  BEFORE INSERT OR UPDATE ON public.user_table_views
  FOR EACH ROW EXECUTE FUNCTION public.touch_user_table_views();

-- ── Realtime ─────────────────────────────────────────────────────
-- Optional but cheap: lets a user editing views in one tab see them
-- update in another. Idempotent add (matches app_settings_v1 pattern).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_table_views'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_table_views;
  END IF;
END $$;
