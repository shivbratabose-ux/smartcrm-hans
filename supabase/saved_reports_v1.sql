-- ═══════════════════════════════════════════════════════════════════
-- saved_reports_v1 — Reports → Custom Reports saved in the cloud.
--
-- One row per saved report: its name and the report definition (spec:
-- main table, columns, filters, grouping, sort, chart). The spec holds
-- NO business data — running a report always reads the viewer's own
-- visible records, so sharing a report never shares data a colleague
-- can't already see.
--
-- Who can do what (row-level security):
--   • read    your own reports, plus any report marked shared
--   • create  only as yourself
--   • change / delete  your own reports; an Admin can also tidy up others'
--
-- Additive only: a new table, nothing existing is touched.
-- Undo: saved_reports_v1_down.sql
-- ═══════════════════════════════════════════════════════════════════
BEGIN;

CREATE TABLE IF NOT EXISTS public.saved_reports (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  name        TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  spec        JSONB NOT NULL DEFAULT '{}'::jsonb,
  shared      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_reports_owner_idx  ON public.saved_reports (owner_id);
CREATE INDEX IF NOT EXISTS saved_reports_shared_idx ON public.saved_reports (shared) WHERE shared;

-- Keep updated_at honest.
CREATE OR REPLACE FUNCTION public.saved_reports_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS saved_reports_touch ON public.saved_reports;
CREATE TRIGGER saved_reports_touch BEFORE UPDATE ON public.saved_reports
  FOR EACH ROW EXECUTE FUNCTION public.saved_reports_touch();

ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_reports_read ON public.saved_reports;
CREATE POLICY saved_reports_read ON public.saved_reports FOR SELECT USING (
  public.get_crm_user_id() IS NOT NULL
  AND (owner_id = public.get_crm_user_id() OR shared)
);

DROP POLICY IF EXISTS saved_reports_insert ON public.saved_reports;
CREATE POLICY saved_reports_insert ON public.saved_reports FOR INSERT WITH CHECK (
  public.get_crm_user_id() IS NOT NULL
  AND owner_id = public.get_crm_user_id()
);

DROP POLICY IF EXISTS saved_reports_update ON public.saved_reports;
CREATE POLICY saved_reports_update ON public.saved_reports FOR UPDATE
  USING (owner_id = public.get_crm_user_id() OR public.get_crm_role() = 'admin')
  WITH CHECK (owner_id = public.get_crm_user_id() OR public.get_crm_role() = 'admin');

DROP POLICY IF EXISTS saved_reports_delete ON public.saved_reports;
CREATE POLICY saved_reports_delete ON public.saved_reports FOR DELETE
  USING (owner_id = public.get_crm_user_id() OR public.get_crm_role() = 'admin');

REVOKE ALL ON public.saved_reports FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_reports TO authenticated;

COMMIT;
