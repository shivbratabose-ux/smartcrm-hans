-- ═══════════════════════════════════════════════════════════════════
-- CREATE UPDATES SYNC v1  —  run in the Supabase SQL Editor (smartcrm)
-- ───────────────────────────────────────────────────────────────────
-- The Updates module (the bell 🔔) was local-only browser state, so
-- notifications never reached other users/devices. This creates the
-- cloud table so updates sync like every other module, enabling real
-- cross-device bell notifications (lead assigned / converted / won).
--
-- RLS: any signed-in user reads; any active CRM user inserts; any
-- active CRM user updates (recipients must write their own read_status
-- receipt into the JSONB); deletes are author or management only.
-- IDEMPOTENT: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.updates (
  id                 TEXT PRIMARY KEY,
  update_id          TEXT,
  title              TEXT,
  description        TEXT,
  category           TEXT DEFAULT 'Announcement',
  priority           TEXT DEFAULT 'Medium',
  tags               TEXT[] DEFAULT '{}',
  created_by         TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now(),
  recipient_mode     TEXT DEFAULT 'org',
  recipient_team_ids TEXT[] DEFAULT '{}',
  recipient_user_ids TEXT[] DEFAULT '{}',
  tagged_user_ids    TEXT[] DEFAULT '{}',
  attachments        JSONB DEFAULT '[]'::jsonb,
  read_status        JSONB DEFAULT '{}'::jsonb,
  edit_history       JSONB DEFAULT '[]'::jsonb,
  archived           BOOLEAN DEFAULT false,
  -- soft-delete envelope (matches every other table)
  is_deleted         BOOLEAN DEFAULT false,
  deleted_at         TIMESTAMPTZ,
  deleted_by         TEXT,
  delete_reason      TEXT,
  delete_reason_category TEXT
);

ALTER TABLE public.updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "updates_read"   ON public.updates;
CREATE POLICY "updates_read"   ON public.updates FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "updates_insert" ON public.updates;
CREATE POLICY "updates_insert" ON public.updates FOR INSERT WITH CHECK (
  public.get_crm_user_id() IS NOT NULL
);

-- Recipients must be able to stamp read_status[their-id]='read', so UPDATE
-- is open to any active CRM user (internal announcements — acceptable).
DROP POLICY IF EXISTS "updates_update" ON public.updates;
CREATE POLICY "updates_update" ON public.updates FOR UPDATE
  USING (public.get_crm_user_id() IS NOT NULL)
  WITH CHECK (public.get_crm_user_id() IS NOT NULL);

DROP POLICY IF EXISTS "updates_delete" ON public.updates;
CREATE POLICY "updates_delete" ON public.updates FOR DELETE USING (
  public.get_crm_role() IN ('admin','md','director')
  OR created_by = public.get_crm_user_id()
);

-- updated_at maintenance (reuses the shared trigger fn from schema.sql)
DROP TRIGGER IF EXISTS updates_updated_at ON public.updates;
CREATE TRIGGER updates_updated_at BEFORE UPDATE ON public.updates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Realtime so the bell rings live on other devices
DO $$ BEGIN
  BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.updates';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
