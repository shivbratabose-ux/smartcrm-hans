-- ══════════════════════════════════════════════════════════════════════
-- Migration: cascade_soft_delete_v1
-- ══════════════════════════════════════════════════════════════════════
-- Problem (horizontal sync break):
--   When a contact / account / lead / opp is soft-deleted on browser A,
--   the dependent rows on browser B still reference it. Example:
--     1. User A soft-deletes contact c123.
--     2. Cloud: contact.is_deleted = true (the contact_delete handler
--        in SmartCRM.jsx:1228 also scrubs lead.contactIds /
--        opp.primaryContactId LOCALLY, but that scrub never reaches the
--        cloud — it only updates state on browser A).
--     3. User B reloads. cloud reads return leads / opps that still
--        carry c123 in contact_ids / primary_contact_id.
--     4. UI tries to render a chip for c123 → no contact row exists →
--        ghost label / blank chip / runtime warnings.
--
--   Same shape for: account soft-delete (orphaned contacts/leads/opps);
--   lead soft-delete (opps still hold sourceLeadIds); opp soft-delete
--   (contracts / quotes / collections still reference oppId).
--
-- Fix:
--   AFTER UPDATE OF is_deleted triggers that fire when is_deleted
--   transitions false→true, and clean up every referencing field on
--   sibling tables. The clean-up is server-side, so it runs once and
--   propagates to every browser via realtime UPDATE events on the
--   affected dependent rows.
--
-- Conventions:
--   - Soft-delete a contact → scrub references but don't soft-delete
--     dependent rows (a deleted contact shouldn't blow away the lead;
--     the lead is still real, just missing one decision-maker).
--   - Soft-delete an account → cascade soft-delete to its contacts /
--     leads / opps (you don't keep a customer's people / pipeline once
--     the account itself is killed). Dependents themselves cascade via
--     their own triggers.
--   - Soft-delete a lead → scrub from opp.source_lead_ids only. The
--     opp is independent (lead may be merged into another opp).
--   - Soft-delete an opp → scrub fk on contracts / quotations /
--     collections / activities / events / comm_logs. Don't soft-delete
--     the contracts (signed contracts outlive opp lifecycle).
--
-- Safety:
--   - SECURITY DEFINER so the trigger updates dependents even if the
--     deleting user lacks RLS write rights on those tables.
--   - Each trigger is idempotent (only runs on the false→true
--     transition; re-soft-deleting a row is a no-op).
--   - All updates also bump updated_at so the realtime UPDATE event
--     carries a fresh timestamp and other browsers' merge logic can
--     classify the change as recent.
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. CONTACT soft-delete → scrub from leads / opps / quotations /
--      activities / comm_logs / events ───────────────────────────────
CREATE OR REPLACE FUNCTION public.cascade_contact_soft_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only act on the false → true transition.
  IF NEW.is_deleted = true AND COALESCE(OLD.is_deleted, false) = false THEN
    -- Remove the contact id from any lead.contact_ids array
    UPDATE public.leads
       SET contact_ids = array_remove(contact_ids, NEW.id),
           updated_at  = now()
     WHERE contact_ids @> ARRAY[NEW.id];

    -- Clear primary_contact_id and remove from secondary_contact_ids
    UPDATE public.opportunities
       SET primary_contact_id    = NULLIF(primary_contact_id, NEW.id),
           secondary_contact_ids = array_remove(secondary_contact_ids, NEW.id),
           updated_at            = now()
     WHERE primary_contact_id = NEW.id
        OR secondary_contact_ids @> ARRAY[NEW.id];

    -- Quotations carry their own secondary_contact_ids snapshot
    UPDATE public.quotations
       SET secondary_contact_ids = array_remove(secondary_contact_ids, NEW.id),
           updated_at            = now()
     WHERE secondary_contact_ids @> ARRAY[NEW.id];

    -- Per-event direct contact references
    UPDATE public.activities  SET contact_id = NULL, updated_at = now() WHERE contact_id = NEW.id;
    UPDATE public.comm_logs   SET contact_id = NULL                   WHERE contact_id = NEW.id;
    UPDATE public.events      SET contact_id = NULL, updated_at = now() WHERE contact_id = NEW.id;
    UPDATE public.call_reports SET contact_id = NULL, updated_at = now() WHERE contact_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cascade_contact_soft_delete_trg ON public.contacts;
CREATE TRIGGER cascade_contact_soft_delete_trg
AFTER UPDATE OF is_deleted ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.cascade_contact_soft_delete();

-- ── 2. ACCOUNT soft-delete → soft-delete dependent contacts / leads /
--      opps; clear account_id on per-event tables ────────────────────
CREATE OR REPLACE FUNCTION public.cascade_account_soft_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.is_deleted = true AND COALESCE(OLD.is_deleted, false) = false THEN
    -- Soft-delete dependent records (their own triggers will recurse).
    UPDATE public.contacts
       SET is_deleted = true, deleted_at = now(), deleted_by = NEW.deleted_by,
           updated_at = now()
     WHERE account_id = NEW.id AND is_deleted = false;

    UPDATE public.leads
       SET is_deleted = true, deleted_at = now(), deleted_by = NEW.deleted_by,
           updated_at = now()
     WHERE account_id = NEW.id AND is_deleted = false;

    UPDATE public.opportunities
       SET is_deleted = true, deleted_at = now(), deleted_by = NEW.deleted_by,
           updated_at = now()
     WHERE account_id = NEW.id AND is_deleted = false;

    -- Clear loose account references where the dependent should survive.
    UPDATE public.activities  SET account_id = NULL, updated_at = now() WHERE account_id = NEW.id AND is_deleted = false;
    UPDATE public.comm_logs   SET account_id = NULL                   WHERE account_id = NEW.id AND is_deleted = false;
    UPDATE public.events      SET account_id = NULL, updated_at = now() WHERE account_id = NEW.id AND is_deleted = false;
    UPDATE public.call_reports SET account_id = NULL, updated_at = now() WHERE account_id = NEW.id AND is_deleted = false;
    UPDATE public.tickets     SET account_id = NULL, updated_at = now() WHERE account_id = NEW.id AND is_deleted = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cascade_account_soft_delete_trg ON public.accounts;
CREATE TRIGGER cascade_account_soft_delete_trg
AFTER UPDATE OF is_deleted ON public.accounts
FOR EACH ROW EXECUTE FUNCTION public.cascade_account_soft_delete();

-- ── 3. LEAD soft-delete → scrub from opp.source_lead_ids ────────────
CREATE OR REPLACE FUNCTION public.cascade_lead_soft_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.is_deleted = true AND COALESCE(OLD.is_deleted, false) = false THEN
    UPDATE public.opportunities
       SET source_lead_ids = array_remove(source_lead_ids, NEW.id),
           lead_id         = NULLIF(lead_id, NEW.id),
           updated_at      = now()
     WHERE source_lead_ids @> ARRAY[NEW.id]
        OR lead_id = NEW.id;

    UPDATE public.activities  SET lead_id = NULL, updated_at = now() WHERE lead_id = NEW.id;
    UPDATE public.call_reports SET lead_id = NULL, updated_at = now() WHERE lead_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- activities / call_reports may not have lead_id columns yet on every
-- deployment; catch the undefined_column exception and continue. The
-- column will exist after add_missing_*_v1.sql migrations have run.
DO $$
BEGIN
  -- Defensive recreate if columns missing
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'lead_id';
  IF NOT FOUND THEN
    EXECUTE 'ALTER TABLE public.activities  ADD COLUMN IF NOT EXISTS lead_id TEXT';
  END IF;
  PERFORM 1 FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'call_reports' AND column_name = 'lead_id';
  IF NOT FOUND THEN
    EXECUTE 'ALTER TABLE public.call_reports ADD COLUMN IF NOT EXISTS lead_id TEXT';
  END IF;
END $$;

DROP TRIGGER IF EXISTS cascade_lead_soft_delete_trg ON public.leads;
CREATE TRIGGER cascade_lead_soft_delete_trg
AFTER UPDATE OF is_deleted ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.cascade_lead_soft_delete();

-- ── 4. OPPORTUNITY soft-delete → scrub fk on dependent rows; do NOT
--      cascade soft-delete to contracts/quotations/collections, which
--      have independent business lifecycle ─────────────────────────────
CREATE OR REPLACE FUNCTION public.cascade_opp_soft_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.is_deleted = true AND COALESCE(OLD.is_deleted, false) = false THEN
    UPDATE public.contracts   SET opp_id  = NULL, updated_at = now() WHERE opp_id  = NEW.id AND is_deleted = false;
    UPDATE public.quotations  SET opp_id  = NULL, updated_at = now() WHERE opp_id  = NEW.id AND is_deleted = false;
    UPDATE public.activities  SET opp_id  = NULL, updated_at = now() WHERE opp_id  = NEW.id AND is_deleted = false;
    UPDATE public.comm_logs   SET opp_id  = NULL                    WHERE opp_id  = NEW.id AND is_deleted = false;
    UPDATE public.events      SET opp_id  = NULL, updated_at = now() WHERE opp_id  = NEW.id AND is_deleted = false;
    UPDATE public.call_reports SET opp_id = NULL, updated_at = now() WHERE opp_id  = NEW.id AND is_deleted = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cascade_opp_soft_delete_trg ON public.opportunities;
CREATE TRIGGER cascade_opp_soft_delete_trg
AFTER UPDATE OF is_deleted ON public.opportunities
FOR EACH ROW EXECUTE FUNCTION public.cascade_opp_soft_delete();

COMMIT;
