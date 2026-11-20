-- Commercial system, Phase C: Billing Engine (specification of 20 Nov 2026).
-- Additive and idempotent: safe to run more than once. Nothing existing is
-- altered or dropped.
--
-- 1. billing_usage    — actual consumption per agreement line per month.
--      An agreement is the accepted quote (quotations.agreement), so a record
--      points at quote_id + line_code. Usage for a month = the sum of its
--      APPROVED records. A record is never deleted: it is voided, and a
--      correction is a new record pointing at the one it replaces.
--      The same external reference cannot be recorded twice for a line and
--      month (unique index) — the duplicate guard.
--
-- 2. billing_invoices — final invoices and credit notes worked out by the
--      Billing Engine (src/lib/billing/engine.js), with their lines and the
--      full calculation. Insert-only through the API: an invoice is never
--      edited or deleted; a correction is a credit note. The id is
--      inv_<quote>_<period>_<cycle>, so a period cannot be invoiced twice.
--
-- Who: the billing desk = Admin, MD, Director, VP Sales & Marketing, Finance,
-- and the approvers / Accounts team named in Masters (is_quote_desk_member()).
-- The quote's owner can read the usage and invoices of their own quotes.

BEGIN;

-- Is the signed-in user on the billing desk?
CREATE OR REPLACE FUNCTION public.is_billing_desk()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.get_crm_role() IN ('admin', 'md', 'director', 'vp_sales_mkt', 'finance'), false)
      OR COALESCE(public.is_quote_desk_member(), false);
$$;

-- ── 1. Usage ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_usage (
  id            TEXT PRIMARY KEY,
  quote_id      TEXT NOT NULL,
  account_id    TEXT,
  line_code     TEXT NOT NULL,
  period        TEXT NOT NULL CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  quantity      NUMERIC NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  external_ref  TEXT NOT NULL DEFAULT '',
  source        TEXT NOT NULL DEFAULT 'manual',        -- manual | upload | correction | system
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'void')),
  corrects_id   TEXT,
  note          TEXT,
  entered_by    TEXT,
  entered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by   TEXT,
  approved_at   TIMESTAMPTZ,
  voided_by     TEXT,
  voided_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_billing_usage_line ON public.billing_usage (quote_id, line_code, period);
CREATE INDEX IF NOT EXISTS idx_billing_usage_period ON public.billing_usage (period);
-- Duplicate guard: one live record per reference, line and month.
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_usage_ref
  ON public.billing_usage (quote_id, line_code, period, external_ref)
  WHERE status <> 'void' AND external_ref <> '';

ALTER TABLE public.billing_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "billing_usage_read" ON public.billing_usage;
CREATE POLICY "billing_usage_read" ON public.billing_usage FOR SELECT TO authenticated USING (
  public.is_billing_desk()
  OR EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = billing_usage.quote_id AND q.owner = public.get_crm_user_id())
);
DROP POLICY IF EXISTS "billing_usage_insert" ON public.billing_usage;
CREATE POLICY "billing_usage_insert" ON public.billing_usage FOR INSERT TO authenticated WITH CHECK (public.is_billing_desk());
DROP POLICY IF EXISTS "billing_usage_update" ON public.billing_usage;
CREATE POLICY "billing_usage_update" ON public.billing_usage FOR UPDATE TO authenticated USING (public.is_billing_desk()) WITH CHECK (public.is_billing_desk());
-- No DELETE policy: usage is voided, never deleted.
REVOKE ALL ON public.billing_usage FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.billing_usage TO authenticated;

-- ── 2. Invoices ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id            TEXT PRIMARY KEY,
  invoice_no    TEXT NOT NULL UNIQUE,
  type          TEXT NOT NULL DEFAULT 'invoice' CHECK (type IN ('invoice', 'credit')),
  status        TEXT NOT NULL DEFAULT 'final' CHECK (status IN ('final')),
  quote_id      TEXT NOT NULL,
  agreement_no  TEXT,
  account_id    TEXT,
  customer      TEXT,
  period        TEXT NOT NULL CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  cycle         TEXT NOT NULL,                          -- period | subscription | usage | milestone-N
  currency      TEXT DEFAULT 'INR',
  lines         JSONB NOT NULL DEFAULT '[]'::jsonb,     -- with the full calculation per line
  taxable       NUMERIC NOT NULL DEFAULT 0,
  gst_pct       NUMERIC,
  cgst          NUMERIC DEFAULT 0,
  sgst          NUMERIC DEFAULT 0,
  igst          NUMERIC DEFAULT 0,
  gst           NUMERIC DEFAULT 0,
  total         NUMERIC NOT NULL DEFAULT 0,
  credit_of     TEXT,                                   -- for a credit note: the invoice it credits
  reason        TEXT,
  collection_id TEXT,                                   -- the Collections record it was posted to
  finalised_by  TEXT,
  finalised_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_quote ON public.billing_invoices (quote_id, period);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_account ON public.billing_invoices (account_id, period);

ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "billing_invoices_read" ON public.billing_invoices;
CREATE POLICY "billing_invoices_read" ON public.billing_invoices FOR SELECT TO authenticated USING (
  public.is_billing_desk()
  OR EXISTS (SELECT 1 FROM public.quotations q WHERE q.id = billing_invoices.quote_id AND q.owner = public.get_crm_user_id())
);
DROP POLICY IF EXISTS "billing_invoices_insert" ON public.billing_invoices;
CREATE POLICY "billing_invoices_insert" ON public.billing_invoices FOR INSERT TO authenticated WITH CHECK (public.is_billing_desk());
-- No UPDATE or DELETE policy: an invoice is final; a correction is a credit note.
REVOKE ALL ON public.billing_invoices FROM anon, authenticated;
GRANT SELECT, INSERT ON public.billing_invoices TO authenticated;

COMMIT;
