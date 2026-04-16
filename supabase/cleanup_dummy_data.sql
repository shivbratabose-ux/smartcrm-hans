-- ═══════════════════════════════════════════════════════════════════
-- CLEANUP SCRIPT — Dummy Data & Unverified Users
--
-- INSTRUCTIONS:
--   Step 1: Run ONLY the DRY-RUN section first.
--           Review every result set carefully before deleting anything.
--   Step 2: Uncomment and run the DELETE blocks one at a time.
--   Step 3: This script requires the SQL Editor (service_role access).
--           DO NOT expose this to the application layer.
--
-- Safe conditions:
--   • auth users: must be email-unconfirmed AND older than 7 days
--   • CRM profiles: must have no linked auth account
--   • test records: matched by name/email pattern (review before delete)
-- ═══════════════════════════════════════════════════════════════════


-- ════════════════════════════════
-- SECTION A — DRY RUN (read-only)
-- Run this entire section first and review every result.
-- ════════════════════════════════

-- A1. Unverified auth users (signed up but never confirmed email, > 7 days old)
SELECT
  au.id                  AS auth_id,
  au.email,
  au.created_at          AS signed_up,
  au.email_confirmed_at,
  u.id                   AS crm_id,
  u.name                 AS crm_name,
  u.role                 AS crm_role
FROM auth.users au
LEFT JOIN public.users u ON u.auth_user_id = au.id
WHERE au.email_confirmed_at IS NULL
  AND au.created_at < now() - INTERVAL '7 days'
ORDER BY au.created_at;

-- A2. CRM profiles with no linked auth account (orphaned profiles)
SELECT
  u.id, u.name, u.email, u.role,
  u.auth_user_id,
  u.created_at
FROM public.users u
WHERE u.auth_user_id IS NULL
   OR NOT EXISTS (
        SELECT 1 FROM auth.users au WHERE au.id = u.auth_user_id
      );

-- A3. Test / dummy / demo data by name or email pattern (review before deleting)
SELECT 'leads'        AS entity, id, company   AS label, email,  created_at FROM public.leads
WHERE  lower(company) LIKE ANY(ARRAY['%test%','%dummy%','%demo%','%sample%','%fake%'])
    OR lower(email)   LIKE ANY(ARRAY['%test%','%dummy%','%demo%','%@example%'])
UNION ALL
SELECT 'accounts',               id, name,              '',      created_at FROM public.accounts
WHERE  lower(name)    LIKE ANY(ARRAY['%test%','%dummy%','%demo%','%sample%','%fake%'])
UNION ALL
SELECT 'contacts',               id, name,              email,   created_at FROM public.contacts
WHERE  lower(name)    LIKE ANY(ARRAY['%test%','%dummy%'])
    OR lower(email)   LIKE ANY(ARRAY['%test%','%dummy%','%@example%'])
UNION ALL
SELECT 'users',                  id, name,              email,   created_at FROM public.users
WHERE  lower(email)   LIKE ANY(ARRAY['%test%','%dummy%','%demo%','%@example%'])
ORDER BY entity, created_at;

-- A4. Audit log size check (large tables slow down RLS / vacuums)
SELECT
  table_name,
  count(*)           AS total_rows,
  min(created_at)    AS oldest,
  max(created_at)    AS newest
FROM public.audit_log
GROUP BY table_name
ORDER BY total_rows DESC;

-- A5. Soft-deleted records accumulation check
SELECT 'accounts'      AS entity, count(*) AS deleted_count FROM public.accounts      WHERE is_deleted
UNION ALL SELECT 'contacts',      count(*) FROM public.contacts      WHERE is_deleted
UNION ALL SELECT 'leads',         count(*) FROM public.leads         WHERE is_deleted
UNION ALL SELECT 'opportunities', count(*) FROM public.opportunities WHERE is_deleted
UNION ALL SELECT 'activities',    count(*) FROM public.activities    WHERE is_deleted
UNION ALL SELECT 'tickets',       count(*) FROM public.tickets       WHERE is_deleted
ORDER BY deleted_count DESC;


-- ════════════════════════════════════════════════
-- SECTION B — EXECUTE (uncomment ONE block at a time)
-- Only run AFTER reviewing Section A results above.
-- ════════════════════════════════════════════════

-- ── B1. Remove CRM profiles for unverified auth users (> 7 days) ──
-- Safe: these users never confirmed email, so they never logged in.
-- Uncomment to execute:
/*
DELETE FROM public.users
WHERE auth_user_id IN (
  SELECT id FROM auth.users
  WHERE email_confirmed_at IS NULL
    AND created_at < now() - INTERVAL '7 days'
);
*/

-- ── B2. Remove unverified auth.users entries (> 7 days) ───────────
-- Run AFTER B1 (profiles must be deleted first to avoid FK violation).
-- Requires service_role. Supabase cascades will clean up auth metadata.
-- Uncomment to execute:
/*
DELETE FROM auth.users
WHERE email_confirmed_at IS NULL
  AND created_at < now() - INTERVAL '7 days';
*/

-- ── B3. Remove orphaned CRM profiles (no auth account) ────────────
-- Uncomment to execute:
/*
DELETE FROM public.users
WHERE auth_user_id IS NULL
   OR NOT EXISTS (
        SELECT 1 FROM auth.users au WHERE au.id = public.users.auth_user_id
      );
*/

-- ── B4. Soft-delete test/dummy leads (recoverable) ────────────────
-- Uses soft delete so records can be reviewed / restored if needed.
-- Uncomment ONLY after confirming patterns in A3 match real test data:
/*
UPDATE public.leads
SET is_deleted = true, deleted_at = now(), deleted_by = 'cleanup_script'
WHERE is_deleted = false
  AND (
    lower(company) LIKE ANY(ARRAY['%test%','%dummy%','%demo%','%fake%'])
    OR lower(email) LIKE ANY(ARRAY['%@example.com','%test@%','%dummy@%'])
  );
*/

-- ── B5. Soft-delete test/dummy accounts ───────────────────────────
/*
UPDATE public.accounts
SET is_deleted = true, deleted_at = now(), deleted_by = 'cleanup_script'
WHERE is_deleted = false
  AND lower(name) LIKE ANY(ARRAY['%test%','%dummy%','%demo%','%fake%','%sample%']);
*/

-- ── B6. Trim audit log older than 1 year (optional) ───────────────
-- Keeps the last 12 months of audit trail. Adjust interval as needed.
-- WARNING: Permanent hard delete — export first if compliance requires it.
/*
DELETE FROM public.audit_log
WHERE created_at < now() - INTERVAL '1 year';
*/


-- ════════════════════════════════
-- SECTION C — POST-CLEANUP VERIFY
-- Run after B-block executions to confirm expected row counts.
-- ════════════════════════════════

-- C1. Confirm no orphaned CRM profiles remain
SELECT count(*) AS orphaned_profiles
FROM public.users u
WHERE u.auth_user_id IS NULL
   OR NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.auth_user_id);

-- C2. Confirm no unverified auth users > 7 days remain
SELECT count(*) AS stale_unverified
FROM auth.users
WHERE email_confirmed_at IS NULL
  AND created_at < now() - INTERVAL '7 days';

-- C3. Active user count sanity check
SELECT active, count(*) FROM public.users GROUP BY active ORDER BY active;
