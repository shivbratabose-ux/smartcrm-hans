-- Billing module, Phase 1 (docs/billing-module-plan.md). Reversible:
-- supabase/billing_phase1_v1_down.sql undoes everything here.
--
--  1. billing_plans          — the customer's billing plan, versioned. The
--                               accepted quote's agreement becomes version 1
--                               (Phase 2 writes it); a change after activation
--                               is a new version with effective date + approver.
--  2. billing_entity_checks  — Finance's verification of a legal entity's
--                               details (insert only; a fingerprint of what was
--                               checked, so a later change lapses it).
--  3. billing_audit_log      — every create, edit, approval and status change on
--                               billing tables and the billing masters, by
--                               trigger (who, when, before, after).
--  4. billing_invoices       — status widened to the invoice lifecycle; type
--                               adds 'debit'; plan_id foreign key.
--  5. billing_usage          — plan_id foreign key.
-- Existing tables only gain foreign-key columns and the widened checks (approved
-- 20 Nov 2026). No existing row changes: billing_invoices and billing_usage are empty.

BEGIN;

-- ── 1. Billing plans ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_plans (
  id               TEXT PRIMARY KEY,
  plan_no          TEXT NOT NULL,                       -- the agreement number; same across versions
  version          INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'pending_approval', 'active', 'superseded', 'retired', 'rejected')),
  account_id       TEXT REFERENCES public.accounts (id) ON DELETE RESTRICT,
  contract_id      TEXT REFERENCES public.contracts (id) ON DELETE RESTRICT,
  quote_id         TEXT REFERENCES public.quotations (id) ON DELETE RESTRICT,
  supersedes_id    TEXT REFERENCES public.billing_plans (id) ON DELETE RESTRICT,
  legal_entity     TEXT,
  currency         TEXT NOT NULL DEFAULT 'INR',
  effective_from   DATE,
  effective_to     DATE,
  terms            JSONB NOT NULL DEFAULT '{}'::jsonb,  -- lines, fees, milestones, discounts, escalation, revenue share, SLA, interest, termination
  reason           TEXT,                                -- why this version (amendments)
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_by     TEXT,
  submitted_at     TIMESTAMPTZ,
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_no, version),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
CREATE INDEX IF NOT EXISTS billing_plans_account_idx ON public.billing_plans (account_id);
CREATE INDEX IF NOT EXISTS billing_plans_quote_idx ON public.billing_plans (quote_id);
-- One active version per plan.
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_plans_active ON public.billing_plans (plan_no) WHERE status = 'active';

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_plans_read ON public.billing_plans;
CREATE POLICY billing_plans_read ON public.billing_plans FOR SELECT USING (
  public.is_billing_desk()
  OR created_by = public.get_crm_user_id()
  OR EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = billing_plans.quote_id AND q.owner = public.get_crm_user_id())
);
DROP POLICY IF EXISTS billing_plans_insert ON public.billing_plans;
CREATE POLICY billing_plans_insert ON public.billing_plans FOR INSERT WITH CHECK (
  public.get_crm_user_id() IS NOT NULL
  AND (status IN ('draft', 'pending_approval') OR public.is_billing_desk())
);
-- Drafts: their author or the billing desk. Active / superseded versions are
-- read-only except for the billing desk's status change (superseded, retired).
DROP POLICY IF EXISTS billing_plans_update ON public.billing_plans;
CREATE POLICY billing_plans_update ON public.billing_plans FOR UPDATE USING (
  public.is_billing_desk()
  OR (status IN ('draft', 'pending_approval', 'rejected') AND created_by = public.get_crm_user_id())
);
-- No delete policy: plans are retired, never deleted.

-- An active or superseded version's terms never change; a change is a new version.
CREATE OR REPLACE FUNCTION public.billing_plans_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('active', 'superseded', 'retired') AND (
       NEW.terms IS DISTINCT FROM OLD.terms OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from OR NEW.legal_entity IS DISTINCT FROM OLD.legal_entity
    OR NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.version IS DISTINCT FROM OLD.version) THEN
    RAISE EXCEPTION 'An active billing plan cannot be edited: create a new version.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_billing_plans_guard ON public.billing_plans;
CREATE TRIGGER trg_billing_plans_guard BEFORE UPDATE ON public.billing_plans
  FOR EACH ROW EXECUTE FUNCTION public.billing_plans_guard();

-- ── 2. Legal-entity verification ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_entity_checks (
  id           TEXT PRIMARY KEY,
  entity_id    TEXT NOT NULL,
  fingerprint  TEXT NOT NULL,
  note         TEXT,
  checked_by   TEXT NOT NULL DEFAULT public.get_crm_user_id(),
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_entity_checks_entity_idx ON public.billing_entity_checks (entity_id, checked_at DESC);
ALTER TABLE public.billing_entity_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_entity_checks_read ON public.billing_entity_checks;
CREATE POLICY billing_entity_checks_read ON public.billing_entity_checks FOR SELECT USING (public.get_crm_user_id() IS NOT NULL);
-- Finance verifies, as itself.
DROP POLICY IF EXISTS billing_entity_checks_insert ON public.billing_entity_checks;
CREATE POLICY billing_entity_checks_insert ON public.billing_entity_checks FOR INSERT WITH CHECK (
  public.get_crm_role() = 'finance' AND checked_by = public.get_crm_user_id()
);
-- No update or delete: a newer check replaces an older one.

-- ── 3. Audit log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  entity      TEXT NOT NULL,          -- table name, or 'billing_masters'
  entity_id   TEXT,
  action      TEXT NOT NULL,          -- insert | update | status:<from>→<to>
  before      JSONB,
  after       JSONB,
  by_user     TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_audit_entity_idx ON public.billing_audit_log (entity, entity_id, at DESC);
ALTER TABLE public.billing_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS billing_audit_read ON public.billing_audit_log;
CREATE POLICY billing_audit_read ON public.billing_audit_log FOR SELECT USING (public.is_billing_desk());
-- Written only by the triggers below (SECURITY DEFINER); nobody inserts directly.
REVOKE INSERT, UPDATE, DELETE ON public.billing_audit_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.billing_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  act TEXT := lower(TG_OP);
  old_status TEXT; new_status TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_status := to_jsonb(OLD)->>'status'; new_status := to_jsonb(NEW)->>'status';
    IF old_status IS DISTINCT FROM new_status THEN act := 'status:' || coalesce(old_status, '') || '→' || coalesce(new_status, ''); END IF;
  END IF;
  INSERT INTO public.billing_audit_log (entity, entity_id, action, before, after, by_user)
  VALUES (TG_TABLE_NAME, coalesce(to_jsonb(NEW)->>'id', to_jsonb(OLD)->>'id'), act,
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
          public.get_crm_user_id());
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_billing_plans_audit ON public.billing_plans;
CREATE TRIGGER trg_billing_plans_audit AFTER INSERT OR UPDATE OR DELETE ON public.billing_plans FOR EACH ROW EXECUTE FUNCTION public.billing_audit();
DROP TRIGGER IF EXISTS trg_billing_entity_checks_audit ON public.billing_entity_checks;
CREATE TRIGGER trg_billing_entity_checks_audit AFTER INSERT ON public.billing_entity_checks FOR EACH ROW EXECUTE FUNCTION public.billing_audit();
DROP TRIGGER IF EXISTS trg_billing_invoices_audit ON public.billing_invoices;
CREATE TRIGGER trg_billing_invoices_audit AFTER INSERT OR UPDATE OR DELETE ON public.billing_invoices FOR EACH ROW EXECUTE FUNCTION public.billing_audit();
DROP TRIGGER IF EXISTS trg_billing_usage_audit ON public.billing_usage;
CREATE TRIGGER trg_billing_usage_audit AFTER INSERT OR UPDATE OR DELETE ON public.billing_usage FOR EACH ROW EXECUTE FUNCTION public.billing_audit();

-- Billing masters live in app_settings.masters->'billing': log each changed list.
CREATE OR REPLACE FUNCTION public.billing_masters_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o JSONB := coalesce(OLD.masters->'billing', '{}'::jsonb);
  n JSONB := coalesce(NEW.masters->'billing', '{}'::jsonb);
  k TEXT;
BEGIN
  IF o IS NOT DISTINCT FROM n THEN RETURN NULL; END IF;
  FOR k IN SELECT DISTINCT key FROM (SELECT jsonb_object_keys(o) AS key UNION SELECT jsonb_object_keys(n)) keys LOOP
    IF (o->k) IS DISTINCT FROM (n->k) THEN
      INSERT INTO public.billing_audit_log (entity, entity_id, action, before, after, by_user)
      VALUES ('billing_masters', k, 'update', o->k, n->k, public.get_crm_user_id());
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_app_settings_billing_audit ON public.app_settings;
CREATE TRIGGER trg_app_settings_billing_audit AFTER UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.billing_masters_audit();

-- ── 4. Invoices: lifecycle, debit notes, plan link ───────────────────
ALTER TABLE public.billing_invoices DROP CONSTRAINT IF EXISTS billing_invoices_status_check;
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_status_check CHECK (status IN
  ('final', 'draft', 'review', 'approved', 'issued', 'part_paid', 'paid', 'overdue', 'cancelled'));
ALTER TABLE public.billing_invoices DROP CONSTRAINT IF EXISTS billing_invoices_type_check;
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_type_check CHECK (type IN ('invoice', 'credit', 'debit'));
ALTER TABLE public.billing_invoices ADD COLUMN IF NOT EXISTS plan_id TEXT REFERENCES public.billing_plans (id) ON DELETE RESTRICT;

-- ── 5. Usage: plan link ──────────────────────────────────────────────
ALTER TABLE public.billing_usage ADD COLUMN IF NOT EXISTS plan_id TEXT REFERENCES public.billing_plans (id) ON DELETE RESTRICT;

GRANT SELECT, INSERT, UPDATE ON public.billing_plans TO authenticated;
GRANT SELECT, INSERT ON public.billing_entity_checks TO authenticated;
GRANT SELECT ON public.billing_audit_log TO authenticated;

COMMIT;
