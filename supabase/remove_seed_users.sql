-- ═══════════════════════════════════════════════════════════════════
-- REMOVE SEED / DUMMY USERS
-- Run in Supabase SQL Editor (service_role).
--
-- STEP 1: Run the DRY RUN block — review every row before deleting.
-- STEP 2: Uncomment the DELETE blocks and run one at a time.
-- ═══════════════════════════════════════════════════════════════════


-- ── STEP 1 — DRY RUN: see every CRM user and their auth status ─────
SELECT
  u.id,
  u.name,
  u.email,
  u.role,
  u.active,
  u.auth_user_id,
  CASE
    WHEN u.auth_user_id IS NULL                    THEN 'NO AUTH — seed/dummy, safe to delete'
    WHEN au.email_confirmed_at IS NULL             THEN 'AUTH EXISTS but email never confirmed'
    ELSE                                                'REAL — confirmed auth account'
  END AS status,
  au.email_confirmed_at
FROM public.users u
LEFT JOIN auth.users au ON au.id = u.auth_user_id
ORDER BY status, u.name;


-- ── STEP 2A — Delete CRM profiles with NO auth account ─────────────
-- These are pure seed records: they have a row in public.users but no
-- entry in auth.users at all. Deleting them only affects the CRM table;
-- there is no auth account to worry about.
--
-- Uncomment to execute:
/*
DELETE FROM public.users
WHERE auth_user_id IS NULL;
*/


-- ── STEP 2B — Delete CRM profiles whose auth email was NEVER confirmed ─
-- These accounts were created (signup happened) but the user never clicked
-- the verification link. They have never been able to log in.
-- Adjust the interval if you want a shorter/longer grace period.
--
-- Uncomment to execute:
/*
DELETE FROM public.users
WHERE auth_user_id IN (
  SELECT id FROM auth.users
  WHERE email_confirmed_at IS NULL
    AND created_at < now() - INTERVAL '1 day'
);
*/


-- ── STEP 2C — Also remove the dangling auth.users entries (optional) ─
-- Run AFTER Step 2B. Cleans up auth.users rows for accounts that are
-- now profileless. Requires service_role.
--
-- Uncomment to execute:
/*
DELETE FROM auth.users
WHERE email_confirmed_at IS NULL
  AND created_at < now() - INTERVAL '1 day'
  AND id NOT IN (SELECT auth_user_id FROM public.users WHERE auth_user_id IS NOT NULL);
*/


-- ── STEP 3 — Verify cleanup ────────────────────────────────────────
-- Run after deletions to confirm only real users remain.
SELECT u.id, u.name, u.email, u.role, u.active,
       CASE WHEN u.auth_user_id IS NULL THEN 'NO AUTH' ELSE 'HAS AUTH' END AS auth_status
FROM public.users u
ORDER BY u.name;
