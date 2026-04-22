-- ═══════════════════════════════════════════════════════════════════
-- ADMIN-INITIATED PASSWORD RESET — 24-hour temporary access window
--
-- Lets an admin force a user through a password change on next login.
-- Flow:
--   1. Admin clicks "Reset Password" in Team & Users
--   2. App calls Supabase auth.resetPasswordForEmail() (sends email link)
--   3. App calls request_admin_password_reset() RPC, which sets the
--      must_change_password flag + a 24-hour expiry timestamp
--   4. Next time the user signs in, the app checks the flag:
--        - flag set + within 24h → force "Set new password" screen
--        - flag set + over 24h    → sign out + ask admin to reset again
--        - flag clear             → normal access
--   5. After successful change, app calls clear_password_change_flag()
--
-- Safe to re-run.
--
-- ── 0. PREREQUISITE ──────────────────────────────────────────────────
-- Set the email-link TTL to 24h in Supabase Dashboard:
--   Authentication → Email Templates → Reset Password
--   Set "Email link expiry" (or in URL config: OTP expiry) to 86400 sec.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Schema: add columns ──────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_change_password    BOOLEAN     DEFAULT false,
  ADD COLUMN IF NOT EXISTS temp_password_expires_at TIMESTAMPTZ;

-- ── 2. Admin-only RPC: mark a user as needing password change ───────
CREATE OR REPLACE FUNCTION public.request_admin_password_reset(target_user_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Caller must be an admin / md / director — anyone else gets refused.
  caller_role := public.get_crm_role();
  IF caller_role NOT IN ('admin','md','director') THEN
    RAISE EXCEPTION 'Only admins can reset another user''s password (your role: %)', caller_role;
  END IF;

  IF target_user_id IS NULL OR target_user_id = '' THEN
    RAISE EXCEPTION 'target_user_id is required';
  END IF;

  UPDATE public.users
     SET must_change_password    = true,
         temp_password_expires_at = NOW() + INTERVAL '24 hours'
   WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', target_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_admin_password_reset(TEXT) TO authenticated;

-- ── 3. Self-RPC: clear the flag after the user successfully changes ──
-- The user has just called supabase.auth.updateUser({password: ...}).
-- This RPC clears their own flag — keyed off get_crm_user_id() so a user
-- can never clear someone else's flag, even by guessing an id.
CREATE OR REPLACE FUNCTION public.clear_password_change_flag()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me TEXT;
BEGIN
  me := public.get_crm_user_id();
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.users
     SET must_change_password    = false,
         temp_password_expires_at = NULL
   WHERE id = me;
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_password_change_flag() TO authenticated;
