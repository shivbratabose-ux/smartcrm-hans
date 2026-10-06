-- ═══════════════════════════════════════════════════════════════════
-- Agent consent & cooldown fields (CRM AI Agents — Phase 0)
-- ═══════════════════════════════════════════════════════════════════
-- Prerequisites for the Re-engagement Agent (Module A) and the
-- Email-to-CRM Activity Agent (Module B). Module A's selection rules
-- (§1 of the spec) exclude opted-out / do-not-contact customers and
-- honour a per-account cooldown — these are the columns those rules
-- read. Nothing in the existing app writes them yet except the new
-- form controls shipped alongside this migration.
--
-- contacts.do_not_contact + preferred_contact_mode already exist
-- (add_missing_account_contact_ticket_fields_v1.sql). This adds the
-- email-specific consent pair on contacts, and account-level blocks:
-- an account-wide "do not contact" outranks any contact-level setting.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS throughout, safe to re-run.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS email_verified  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_opt_out   BOOLEAN DEFAULT false;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS do_not_contact        TEXT DEFAULT 'No',
  ADD COLUMN IF NOT EXISTS do_not_contact_reason TEXT DEFAULT '',
  -- Cooldown clock for Module A: stamped when an agent follow-up is
  -- sent for this account; selection skips accounts stamped within
  -- re_agent_config.cooldown_days.
  ADD COLUMN IF NOT EXISTS last_agent_followup_at DATE;

-- Selection scans filter on these; partial indexes keep them cheap.
CREATE INDEX IF NOT EXISTS idx_contacts_email_opt_out
  ON public.contacts (email_opt_out) WHERE email_opt_out = true;
CREATE INDEX IF NOT EXISTS idx_accounts_do_not_contact
  ON public.accounts (do_not_contact) WHERE do_not_contact <> 'No';
