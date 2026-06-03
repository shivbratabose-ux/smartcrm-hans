-- ═══════════════════════════════════════════════════════════════════
-- ACCOUNT FinID — finance team's shared identifier on the account
-- ═══════════════════════════════════════════════════════════════════
-- Lead ID (#FL-…), Opportunity ID (OPP-…) and Account No. (ACC-…) are all
-- system-generated. FinID is different: a free-text finance/accounting
-- identifier the Finance team enters MANUALLY on the account and shares
-- across the team (e.g. the customer code from the accounting/ERP system).
--
-- Stored on the account (finance operates at the account level). Used as a
-- 4th way to link bulk-uploaded call reports to a customer, and is editable
-- in the Account form's billing/finance section.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS fin_id TEXT;

-- Optional: speed up lookups when matching a FinID during bulk import.
CREATE INDEX IF NOT EXISTS idx_accounts_fin_id ON public.accounts (fin_id);
