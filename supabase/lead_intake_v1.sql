-- ══════════════════════════════════════════════════════════════════════
-- Migration: lead_intake_v1
-- ══════════════════════════════════════════════════════════════════════
-- Website demo requests arrive through the `lead-intake` edge function
-- (posted by the website's Netlify forwarder, submission-created.js).
-- This migration adds what that flow needs:
--
--   1. Lead columns for website leads: demo status, first-touch campaign
--      (UTM, landing page, referrer), marketing consent, the website's own
--      lead reference, preferred demo time and the visitor's time zone.
--      Campaign fields are FIRST TOUCH: the intake writes them once and
--      never overwrites them on a repeat enquiry.
--   2. lead_intake_log: one row per Netlify submission. Its primary key
--      makes the intake idempotent (Netlify retries never create a second
--      lead) and it is the audit trail for every website submission,
--      including the ones deliberately not turned into leads.
--   3. allocate_lead_id() was executable by the public (anon) key:
--      CREATE FUNCTION grants EXECUTE to PUBLIC by default and
--      lead_id_unique_v1.sql only added a grant. Anyone with the website
--      key could burn lead numbers. Restrict it to signed-in users and
--      the service role (the intake function).
--
-- Additive and re-runnable. The live app ignores the new columns until it
-- maps them, and passes unknown columns through unchanged on save.
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

-- 1 ── Lead columns ────────────────────────────────────────────────────
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS demo_status          TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_source           TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_medium           TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_campaign         TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_content          TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_term             TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS landing_page         TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS first_referrer       TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS marketing_consent    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS marketing_consent_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS website_lead_ref     TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS preferred_time       TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS visitor_timezone     TEXT;

CREATE INDEX IF NOT EXISTS leads_email_lower_idx ON public.leads (lower(email)) WHERE is_deleted = false;

-- 2 ── Intake log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_intake_log (
  submission_id TEXT PRIMARY KEY,           -- Netlify submission id
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  form_name     TEXT,
  intent        TEXT,
  email         TEXT,
  outcome       TEXT NOT NULL,              -- created | updated | skipped | error
  reason        TEXT,
  lead_id       TEXT                        -- leads.id when a lead was created or updated
);
-- Service role only: RLS on with no policies. Admins read it in the SQL editor.
ALTER TABLE public.lead_intake_log ENABLE ROW LEVEL SECURITY;

-- 3 ── allocate_lead_id: signed-in users and the service role only ─────
REVOKE EXECUTE ON FUNCTION public.allocate_lead_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.allocate_lead_id() FROM anon;
GRANT  EXECUTE ON FUNCTION public.allocate_lead_id() TO authenticated, service_role;

COMMIT;

-- ── Verification ──────────────────────────────────────────────────────
-- SELECT count(*) AS new_cols FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='leads'
--    AND column_name IN ('demo_status','utm_source','utm_medium','utm_campaign','utm_content',
--      'utm_term','landing_page','first_referrer','marketing_consent','marketing_consent_at',
--      'website_lead_ref','preferred_time','visitor_timezone');              -- expect 13
-- SELECT to_regclass('public.lead_intake_log');                              -- expect lead_intake_log
-- SELECT has_function_privilege('anon','public.allocate_lead_id()','EXECUTE'); -- expect false
