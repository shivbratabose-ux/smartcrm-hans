-- ═══════════════════════════════════════════════════════════════════
-- APP SETTINGS — relax write policy
-- ═══════════════════════════════════════════════════════════════════
-- Lotak (role=line_mgr) hit:
--   "new row violates row-level security policy for table app_settings"
-- when trying to add modules under his own WiseAMS product line. The v1
-- policy from PR #97 / #108 only allowed admin + md to write — too
-- tight for the actual workflow:
--
--   - Each product (iCAFFE, WiseAMS, WiseHandling, etc.) is owned by a
--     "Line Manager" — typically a user with role=line_mgr who is
--     responsible for adding / editing modules under that product.
--   - The frontend already shows write controls (+ Module, Edit, Delete)
--     to those users — they have masters:r in PERMISSIONS but the UI
--     doesn't fully gate the edit buttons.
--   - Bottlenecking every catalog change on admin/md isn't realistic in
--     an internal CRM where ~10 different line managers maintain their
--     own product lines.
--
-- New policy: allow write for the broader management set
-- (admin, md, director, vp_sales_mkt, line_mgr, country_mgr, bd_lead).
-- Continue to deny write for sales_exec, tech_lead, support, viewer
-- since those don't manage product/master data.
--
-- Read policy is unchanged — every active CRM user can read masters
-- (everyone needs the dropdowns populated).
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "app_settings_write" ON public.app_settings;
CREATE POLICY "app_settings_write" ON public.app_settings FOR ALL USING (
  public.get_crm_role() IN (
    'admin', 'md', 'director', 'vp_sales_mkt',
    'line_mgr', 'country_mgr', 'bd_lead'
  )
) WITH CHECK (
  public.get_crm_role() IN (
    'admin', 'md', 'director', 'vp_sales_mkt',
    'line_mgr', 'country_mgr', 'bd_lead'
  )
);
