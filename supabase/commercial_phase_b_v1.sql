-- Commercial system, Phase B (specification of 20 Nov 2026).
-- Additive and idempotent: safe to run more than once. Nothing existing is
-- altered or dropped.
--
-- 1. quotations.agreement — the accepted quote's frozen commercial terms
--    (customer agreement): lines with billing class, unit, agreed rate or
--    slabs, minimum, discount and dates. Written by the app
--    (src/lib/quotation/agreements.js). NULL until a customer accepts.
--
-- 2. pricing_master_history — an append-only audit of every change to the
--    Pricing Master (masters.quotation in app_settings): one row per price
--    row added / changed / removed, and one per changed rules section.
--    Written by a trigger; nobody can insert, update or delete through the API.
--
-- 3. Pricing owners — when Quotation Rules names pricing owners
--    (quoteConfig.pricingOwnerIds), a save by anyone else (except Admin / MD)
--    keeps the Pricing Master exactly as it was. Their other Masters changes
--    still save. With no owners named, behaviour is unchanged.
--
-- Both triggers swallow their own errors: a fault in the audit or the guard
-- can never block a Masters save.

BEGIN;

-- ── 1. Agreement on the accepted quote ───────────────────────────────
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS agreement JSONB;
CREATE INDEX IF NOT EXISTS idx_quotations_agreement_account
  ON public.quotations ((agreement->>'accountId')) WHERE agreement IS NOT NULL;

-- ── 2. Price history ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pricing_master_history (
  id          BIGSERIAL PRIMARY KEY,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by  TEXT,              -- CRM user id; NULL = changed outside the app
  section     TEXT NOT NULL,     -- 'price' or a rules section (quoteConfig, bands, …)
  item_code   TEXT,              -- price row code, for section 'price'
  item_name   TEXT,
  change      TEXT NOT NULL,     -- added | changed | removed
  before      JSONB,
  after       JSONB
);
CREATE INDEX IF NOT EXISTS idx_pricing_history_at   ON public.pricing_master_history (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_history_code ON public.pricing_master_history (item_code, changed_at DESC);

ALTER TABLE public.pricing_master_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pricing_history_read" ON public.pricing_master_history;
CREATE POLICY "pricing_history_read" ON public.pricing_master_history
  FOR SELECT TO authenticated USING (true);
-- No INSERT / UPDATE / DELETE policy: only the trigger below writes.
REVOKE ALL ON public.pricing_master_history FROM anon;
GRANT SELECT ON public.pricing_master_history TO authenticated;

CREATE OR REPLACE FUNCTION public.log_pricing_master_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o   JSONB := COALESCE(OLD.masters -> 'quotation', '{}'::jsonb);
  nw  JSONB := COALESCE(NEW.masters -> 'quotation', '{}'::jsonb);
  who TEXT;
  r   RECORD;
  sec TEXT;
BEGIN
  IF o IS NOT DISTINCT FROM nw THEN RETURN NEW; END IF;
  BEGIN who := public.get_crm_user_id(); EXCEPTION WHEN OTHERS THEN who := NULL; END;

  -- Price rows, matched by code.
  FOR r IN
    SELECT COALESCE(a.code, b.code) AS code, a.rw AS before_row, b.rw AS after_row
    FROM (SELECT e ->> 'code' AS code, e AS rw
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o -> 'catalogue') = 'array' THEN o -> 'catalogue' ELSE '[]'::jsonb END) e
           WHERE e ->> 'code' IS NOT NULL) a
    FULL JOIN (SELECT e ->> 'code' AS code, e AS rw
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(nw -> 'catalogue') = 'array' THEN nw -> 'catalogue' ELSE '[]'::jsonb END) e
           WHERE e ->> 'code' IS NOT NULL) b USING (code)
    WHERE a.rw IS DISTINCT FROM b.rw
  LOOP
    INSERT INTO public.pricing_master_history (changed_by, section, item_code, item_name, change, before, after)
    VALUES (who, 'price', r.code, COALESCE(r.after_row ->> 'name', r.before_row ->> 'name'),
            CASE WHEN r.before_row IS NULL THEN 'added' WHEN r.after_row IS NULL THEN 'removed' ELSE 'changed' END,
            r.before_row, r.after_row);
  END LOOP;

  -- Rules sections, logged whole.
  FOREACH sec IN ARRAY ARRAY['quoteConfig', 'bands', 'editions', 'rateCards', 'termSets', 'terms', 'documents'] LOOP
    IF (o -> sec) IS DISTINCT FROM (nw -> sec) THEN
      INSERT INTO public.pricing_master_history (changed_by, section, change, before, after)
      VALUES (who, sec, CASE WHEN o -> sec IS NULL THEN 'added' WHEN nw -> sec IS NULL THEN 'removed' ELSE 'changed' END, o -> sec, nw -> sec);
    END IF;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pricing history not written: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_settings_pricing_history ON public.app_settings;
CREATE TRIGGER trg_app_settings_pricing_history
  AFTER UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.log_pricing_master_changes();

-- ── 3. Pricing owners ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_pricing_master()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owners JSONB;
  who    TEXT;
  role   TEXT;
BEGIN
  IF (OLD.masters -> 'quotation') IS NOT DISTINCT FROM (NEW.masters -> 'quotation') THEN RETURN NEW; END IF;
  owners := OLD.masters #> '{quotation,quoteConfig,pricingOwnerIds}';
  IF owners IS NULL OR jsonb_typeof(owners) <> 'array' OR jsonb_array_length(owners) = 0 THEN RETURN NEW; END IF;
  who  := public.get_crm_user_id();
  role := public.get_crm_role();
  IF who IS NULL THEN RETURN NEW; END IF;                       -- SQL editor / service role
  IF role IN ('admin', 'md') OR owners ? who THEN RETURN NEW; END IF;
  -- Not a pricing owner: the Pricing Master stays as it was.
  NEW.masters := jsonb_set(COALESCE(NEW.masters, '{}'::jsonb), '{quotation}', OLD.masters -> 'quotation', true);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_settings_protect_pricing ON public.app_settings;
CREATE TRIGGER trg_app_settings_protect_pricing
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.protect_pricing_master();

COMMIT;
