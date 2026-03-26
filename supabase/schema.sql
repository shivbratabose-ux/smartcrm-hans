-- ═══════════════════════════════════════════════════════════════════
-- SmartCRM Database Schema for Supabase
-- Run this in Supabase SQL Editor: Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Users & Auth ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  initials TEXT,
  role TEXT NOT NULL DEFAULT 'sales_exec',
  lob TEXT DEFAULT 'All',
  branch_id TEXT,
  dept_id TEXT,
  country TEXT DEFAULT 'India',
  active BOOLEAN DEFAULT true,
  join_date DATE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  auth_user_id UUID REFERENCES auth.users(id)
);

-- ── 2. Accounts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accounts (
  id TEXT PRIMARY KEY,
  account_no TEXT,
  name TEXT NOT NULL,
  type TEXT,
  country TEXT,
  city TEXT,
  address TEXT,
  website TEXT,
  segment TEXT,
  products TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'Active',
  owner TEXT REFERENCES public.users(id),
  arr_revenue NUMERIC DEFAULT 0,
  potential NUMERIC DEFAULT 0,
  parent_id TEXT,
  hierarchy_level TEXT,
  hierarchy_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 3. Contacts ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id TEXT PRIMARY KEY,
  contact_id TEXT,
  account_id TEXT REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  designation TEXT,
  role TEXT,
  email TEXT,
  phone TEXT,
  department TEXT,
  departments TEXT[] DEFAULT '{}',
  products TEXT[] DEFAULT '{}',
  branches TEXT[] DEFAULT '{}',
  countries TEXT[] DEFAULT '{}',
  "primary" BOOLEAN DEFAULT false,
  linked_opps TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 4. Leads ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leads (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  company TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  designation TEXT,
  source TEXT,
  product TEXT,
  stage TEXT DEFAULT 'MQL',
  score INTEGER DEFAULT 0,
  temperature TEXT DEFAULT 'Warm',
  owner TEXT REFERENCES public.users(id),
  account_id TEXT,
  next_call TEXT,
  remarks TEXT,
  created_date DATE,
  no_of_users INTEGER DEFAULT 0,
  business_type TEXT,
  staff_size TEXT,
  branches INTEGER DEFAULT 0,
  monthly_volume JSONB DEFAULT '{}',
  current_software TEXT,
  sw_age TEXT,
  sw_satisfaction INTEGER DEFAULT 0,
  pain_points TEXT[] DEFAULT '{}',
  budget_range TEXT,
  decision_maker TEXT,
  decision_timeline TEXT,
  evaluating_others TEXT,
  next_step TEXT,
  objections TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 5. Opportunities ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opportunities (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES public.accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  products TEXT[] DEFAULT '{}',
  stage TEXT DEFAULT 'Prospect',
  value NUMERIC DEFAULT 0,
  probability INTEGER DEFAULT 10,
  owner TEXT REFERENCES public.users(id),
  close_date DATE,
  country TEXT,
  notes TEXT,
  source TEXT,
  primary_contact_id TEXT,
  secondary_contact_ids TEXT[] DEFAULT '{}',
  hierarchy_level TEXT,
  lead_id TEXT,
  created_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 6. Activities ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.activities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'Planned',
  date DATE,
  time TEXT,
  duration TEXT,
  account_id TEXT REFERENCES public.accounts(id) ON DELETE CASCADE,
  contact_id TEXT,
  opp_id TEXT,
  owner TEXT REFERENCES public.users(id),
  title TEXT NOT NULL,
  notes TEXT,
  outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 7. Call Reports ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.call_reports (
  id TEXT PRIMARY KEY,
  call_date DATE,
  call_type TEXT,
  marketing_person TEXT REFERENCES public.users(id),
  lead_name TEXT,
  company TEXT,
  account_id TEXT,
  product TEXT,
  notes TEXT,
  next_call_date DATE,
  outcome TEXT,
  objective TEXT,
  duration TEXT,
  lead_stage TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 8. Tickets ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tickets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  account_id TEXT REFERENCES public.accounts(id) ON DELETE CASCADE,
  product TEXT,
  type TEXT,
  priority TEXT DEFAULT 'Medium',
  status TEXT DEFAULT 'Open',
  assigned TEXT REFERENCES public.users(id),
  created DATE,
  sla TEXT,
  description TEXT,
  resolved DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 9. Contracts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contracts (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES public.accounts(id) ON DELETE CASCADE,
  title TEXT,
  type TEXT,
  status TEXT DEFAULT 'Draft',
  start_date DATE,
  end_date DATE,
  value NUMERIC DEFAULT 0,
  products TEXT[] DEFAULT '{}',
  owner TEXT REFERENCES public.users(id),
  terms TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 10. Collections ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.collections (
  id TEXT PRIMARY KEY,
  invoice_no TEXT,
  account_id TEXT REFERENCES public.accounts(id) ON DELETE CASCADE,
  invoice_date DATE,
  due_date DATE,
  billed_amount NUMERIC DEFAULT 0,
  collected_amount NUMERIC DEFAULT 0,
  pending_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Current',
  payment_mode TEXT,
  remarks TEXT,
  owner TEXT REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 11. Targets ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.targets (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES public.users(id),
  period TEXT,
  product TEXT,
  target_value NUMERIC DEFAULT 0,
  achieved_value NUMERIC DEFAULT 0,
  target_deals INTEGER DEFAULT 0,
  achieved_deals INTEGER DEFAULT 0,
  target_calls INTEGER DEFAULT 0,
  achieved_calls INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 12. Quotations ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quotations (
  id TEXT PRIMARY KEY,
  quote_no TEXT,
  account_id TEXT,
  contact_id TEXT,
  opp_id TEXT,
  title TEXT,
  status TEXT DEFAULT 'Draft',
  items JSONB DEFAULT '[]',
  subtotal NUMERIC DEFAULT 0,
  tax_type TEXT,
  tax_rate NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  validity TEXT,
  terms TEXT[] DEFAULT '{}',
  notes TEXT,
  owner TEXT REFERENCES public.users(id),
  created_date DATE,
  sent_date DATE,
  expiry_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 13. Communication Logs ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.comm_logs (
  id TEXT PRIMARY KEY,
  type TEXT,
  direction TEXT,
  account_id TEXT,
  contact_id TEXT,
  opp_id TEXT,
  subject TEXT,
  body TEXT,
  status TEXT DEFAULT 'Sent',
  owner TEXT REFERENCES public.users(id),
  date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 14. Calendar Events ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT,
  date DATE,
  time TEXT,
  end_time TEXT,
  account_id TEXT,
  contact_id TEXT,
  opp_id TEXT,
  owner TEXT REFERENCES public.users(id),
  status TEXT DEFAULT 'Scheduled',
  notes TEXT,
  attendees TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 15. Notes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notes (
  id TEXT PRIMARY KEY,
  record_type TEXT,
  record_id TEXT,
  content TEXT,
  owner TEXT REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 16. Files ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.files (
  id TEXT PRIMARY KEY,
  name TEXT,
  type TEXT,
  size TEXT,
  url TEXT,
  linked_to JSONB DEFAULT '[]',
  owner TEXT REFERENCES public.users(id),
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- ── 17. Audit Log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id TEXT,
  old_data JSONB,
  new_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════
-- INDEXES for performance
-- ═══════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_accounts_owner ON public.accounts(owner);
CREATE INDEX IF NOT EXISTS idx_contacts_account ON public.contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_leads_owner ON public.leads(owner);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(stage);
CREATE INDEX IF NOT EXISTS idx_opps_account ON public.opportunities(account_id);
CREATE INDEX IF NOT EXISTS idx_opps_owner ON public.opportunities(owner);
CREATE INDEX IF NOT EXISTS idx_opps_stage ON public.opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_activities_owner ON public.activities(owner);
CREATE INDEX IF NOT EXISTS idx_activities_account ON public.activities(account_id);
CREATE INDEX IF NOT EXISTS idx_activities_opp ON public.activities(opp_id);
CREATE INDEX IF NOT EXISTS idx_tickets_account ON public.tickets(account_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON public.tickets(assigned);
CREATE INDEX IF NOT EXISTS idx_collections_account ON public.collections(account_id);
CREATE INDEX IF NOT EXISTS idx_call_reports_person ON public.call_reports(marketing_person);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON public.audit_log(table_name);

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comm_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's CRM user_id from auth
CREATE OR REPLACE FUNCTION public.get_crm_user_id()
RETURNS TEXT AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION public.get_crm_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ── Manager+ roles can see everything ──
-- ── Sales exec sees only their own data ──
-- ── Support sees tickets + read-only accounts ──

-- USERS: everyone can read users (for dropdowns), only admin can write
CREATE POLICY "users_read" ON public.users FOR SELECT USING (true);
CREATE POLICY "users_admin_write" ON public.users FOR ALL USING (
  public.get_crm_role() IN ('admin','md','director')
);

-- ACCOUNTS: managers see all, sales exec sees own
CREATE POLICY "accounts_read" ON public.accounts FOR SELECT USING (
  CASE public.get_crm_role()
    WHEN 'admin' THEN true
    WHEN 'md' THEN true
    WHEN 'director' THEN true
    WHEN 'line_mgr' THEN true
    WHEN 'country_mgr' THEN true
    WHEN 'bd_lead' THEN true
    WHEN 'tech_lead' THEN true
    WHEN 'support' THEN true
    ELSE owner = public.get_crm_user_id()
  END
);
CREATE POLICY "accounts_write" ON public.accounts FOR INSERT WITH CHECK (true);
CREATE POLICY "accounts_update" ON public.accounts FOR UPDATE USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
  OR owner = public.get_crm_user_id()
);
CREATE POLICY "accounts_delete" ON public.accounts FOR DELETE USING (
  public.get_crm_role() IN ('admin','md','director')
);

-- Generic policy for most tables: managers see all, exec sees own
-- Apply same pattern to contacts, leads, opportunities, activities, etc.

CREATE POLICY "contacts_read" ON public.contacts FOR SELECT USING (true);
CREATE POLICY "contacts_write" ON public.contacts FOR ALL USING (
  public.get_crm_role() NOT IN ('viewer','support') OR false
);

CREATE POLICY "leads_read" ON public.leads FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
  OR owner = public.get_crm_user_id()
);
CREATE POLICY "leads_write" ON public.leads FOR ALL USING (
  public.get_crm_role() NOT IN ('viewer','support','tech_lead')
);

CREATE POLICY "opps_read" ON public.opportunities FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead','tech_lead')
  OR owner = public.get_crm_user_id()
);
CREATE POLICY "opps_write" ON public.opportunities FOR ALL USING (
  public.get_crm_role() NOT IN ('viewer','support')
);

CREATE POLICY "activities_read" ON public.activities FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr','country_mgr','bd_lead')
  OR owner = public.get_crm_user_id()
);
CREATE POLICY "activities_write" ON public.activities FOR ALL USING (
  public.get_crm_role() NOT IN ('viewer')
);

CREATE POLICY "call_reports_all" ON public.call_reports FOR ALL USING (true);
CREATE POLICY "tickets_all" ON public.tickets FOR ALL USING (true);
CREATE POLICY "contracts_all" ON public.contracts FOR ALL USING (true);
CREATE POLICY "collections_all" ON public.collections FOR ALL USING (true);
CREATE POLICY "targets_all" ON public.targets FOR ALL USING (true);
CREATE POLICY "quotations_all" ON public.quotations FOR ALL USING (true);
CREATE POLICY "comm_logs_all" ON public.comm_logs FOR ALL USING (true);
CREATE POLICY "events_all" ON public.events FOR ALL USING (true);
CREATE POLICY "notes_all" ON public.notes FOR ALL USING (true);
CREATE POLICY "files_all" ON public.files FOR ALL USING (true);
CREATE POLICY "audit_read" ON public.audit_log FOR SELECT USING (
  public.get_crm_role() IN ('admin','md','director','line_mgr')
);
CREATE POLICY "audit_insert" ON public.audit_log FOR INSERT WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- REALTIME: Enable realtime on key tables
-- ═══════════════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE public.accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.opportunities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.collections;

-- ═══════════════════════════════════════════════════════════════════
-- AUTO-UPDATE TIMESTAMPS
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'users','accounts','contacts','leads','opportunities','activities',
    'call_reports','tickets','contracts','collections','targets',
    'quotations','events'
  ]) LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at()', t
    );
  END LOOP;
END $$;
