-- ═══════════════════════════════════════════════════════════════════
-- PRODUCT RESOURCES — sales collateral library (URLs only)
-- ═══════════════════════════════════════════════════════════════════
-- A shared library of marketing/sales collateral organised per product:
-- presentations, product datasheets, pricing decks, brochures, demo
-- videos, case studies, etc. Files themselves live wherever the team
-- already hosts them (Google Drive, Dropbox, SharePoint, S3) — this
-- table only stores the metadata + the URL pointer, mirroring how
-- `quotations.attachments` and `files.url` already work in this app.
-- See PR description for the rationale on URL-only vs Supabase Storage.
--
-- Org-wide visibility:
--   Read: every active CRM user (reps need to attach resources to
--     their outbound emails). RLS just narrows further to authenticated
--     CRM profiles via the existing get_crm_role() helper.
--   Write: admin / md / director / vp_sales_mkt / line_mgr — same
--     role set that maintains app_settings (Masters / Catalog), since
--     curating sales collateral is the same kind of org-config work.
--
-- product_id is FREE-FORM TEXT (not an FK):
--   The catalog lives in app_settings.catalog as JSONB and IDs there
--   are user-supplied strings (e.g. "iCAFFE", "WiseAMS"). A foreign key
--   to a JSONB-derived id can't be enforced; we use a plain TEXT column
--   and trust the UI to pick from the catalog dropdown. Catalog renames
--   that change a product's id will orphan resources — handle that in
--   the Masters editor by offering a rename-resources option.
--
-- kind is a controlled vocabulary but stored as TEXT for forward
-- compatibility — the UI's <select> is the authoritative list.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.product_resources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    TEXT NOT NULL,
  -- Presentation / Product Details / Pricing / Brochure / Datasheet /
  -- Demo Video / Case Study / Other. UI enforces the picklist.
  kind          TEXT NOT NULL,
  name          TEXT NOT NULL,
  -- Pointer to the actual file. Validated as http(s) on the client;
  -- not enforced at the DB level so signed/expiring URLs from any
  -- provider are accepted as-is.
  url           TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  -- Free-form version label ("v2", "Q3-2026", "Final"). Sortable as
  -- text alone is unreliable — the UI sorts by updated_at descending
  -- so the freshest variant of a doc shows first regardless of label.
  version       TEXT NOT NULL DEFAULT '',
  -- TEXT, not UUID — public.users.id is TEXT in this schema (see
  -- app_settings_v1.sql header for the same explanation).
  uploaded_by   TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "List resources for product X" is the hot path — every email-compose
-- session can query it. Index on product_id alone is enough at expected
-- volume (low hundreds of rows per product max).
CREATE INDEX IF NOT EXISTS idx_product_resources_product
  ON public.product_resources (product_id);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE public.product_resources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "product_resources_read" ON public.product_resources;
CREATE POLICY "product_resources_read" ON public.product_resources FOR SELECT USING (
  public.get_crm_role() IS NOT NULL
);

DROP POLICY IF EXISTS "product_resources_write" ON public.product_resources;
CREATE POLICY "product_resources_write" ON public.product_resources FOR ALL USING (
  public.get_crm_role() IN (
    'admin', 'md', 'director', 'vp_sales_mkt', 'line_mgr', 'country_mgr'
  )
) WITH CHECK (
  public.get_crm_role() IN (
    'admin', 'md', 'director', 'vp_sales_mkt', 'line_mgr', 'country_mgr'
  )
);

-- ── Auto-stamp updated_at ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_product_resources()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  -- Only stamp uploaded_by on INSERT — edits (e.g. swap URL to a new
  -- version) shouldn't reattribute the original uploader.
  IF TG_OP = 'INSERT' AND NEW.uploaded_by IS NULL THEN
    NEW.uploaded_by := public.get_crm_user_id();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_product_resources_touch ON public.product_resources;
CREATE TRIGGER trg_product_resources_touch
  BEFORE INSERT OR UPDATE ON public.product_resources
  FOR EACH ROW EXECUTE FUNCTION public.touch_product_resources();

-- ── Realtime ─────────────────────────────────────────────────────
-- So a sales rep composing an email sees a freshly-uploaded brochure
-- without refreshing. Idempotent add (matches the app_settings pattern).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'product_resources'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_resources;
  END IF;
END $$;
