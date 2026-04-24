-- ══════════════════════════════════════════════════════════════════════
-- Helper: Audit + reassign records stuck at default owner "u1"
-- ══════════════════════════════════════════════════════════════════════
-- Context:
--   Before PR #77 (leads) and PR #78 (all other modules), every BLANK_*
--   template defaulted owner/assigned/user_id to "u1". When non-admin
--   users created records and didn't manually change the owner dropdown,
--   the records persisted with owner=u1. RLS then hid them from the real
--   creator — admin could see everything, the real creator saw nothing.
--
-- Post-fix (PRs #77/#78):
--   New records correctly default to the current user. This file helps
--   an admin find and reassign the pre-fix orphans.
--
-- WARNING:
--   Do NOT run the UPDATE blindly. u1 is a real admin user; they may
--   legitimately own some records. Run the SELECT first, review, then
--   UPDATE only the rows you're sure belong to someone else.
-- ══════════════════════════════════════════════════════════════════════

-- ── Step 1: Audit what's owned by u1 across every module ──────────────
-- Copy/paste this, look at the results, decide what needs reassigning.

SELECT 'leads' AS module, COUNT(*) AS owned_by_u1 FROM public.leads       WHERE owner = 'u1'
UNION ALL
SELECT 'opportunities',     COUNT(*) FROM public.opportunities             WHERE owner = 'u1'
UNION ALL
SELECT 'accounts',          COUNT(*) FROM public.accounts                  WHERE owner = 'u1'
UNION ALL
SELECT 'activities',        COUNT(*) FROM public.activities                WHERE owner = 'u1'
UNION ALL
SELECT 'tickets',           COUNT(*) FROM public.tickets                   WHERE assigned = 'u1' OR assigned = 'u7'
UNION ALL
SELECT 'contracts',         COUNT(*) FROM public.contracts                 WHERE owner = 'u1'
UNION ALL
SELECT 'collections',       COUNT(*) FROM public.collections               WHERE owner = 'u1'
UNION ALL
SELECT 'quotations',        COUNT(*) FROM public.quotations                WHERE owner = 'u1'
UNION ALL
SELECT 'events',            COUNT(*) FROM public.events                    WHERE owner = 'u1'
UNION ALL
SELECT 'comm_logs',         COUNT(*) FROM public.comm_logs                 WHERE owner = 'u1'
UNION ALL
SELECT 'call_reports',      COUNT(*) FROM public.call_reports              WHERE marketing_person = 'u1'
UNION ALL
SELECT 'targets',           COUNT(*) FROM public.targets                   WHERE user_id = 'u1';


-- ── Step 2: List a specific module's orphans (example: leads) ─────────
-- Use this to identify which records should be reassigned.

SELECT id, lead_id, company, contact_name, email, created_at
FROM public.leads
WHERE owner = 'u1'
ORDER BY created_at DESC;


-- ── Step 3: Targeted reassignment ─────────────────────────────────────
-- Replace 'u-adarsh' with the real user id. List the record ids you
-- want to move. Do NOT do a blanket UPDATE ... WHERE owner = 'u1'.

-- Example — move specific leads to Adarsh:
-- UPDATE public.leads
--   SET owner = 'u-adarsh'
--   WHERE id IN ('ld001', 'ld002', 'ld003');

-- Example — move specific opportunities:
-- UPDATE public.opportunities
--   SET owner = 'u-adarsh'
--   WHERE id IN ('o001', 'o002');

-- Example — reassign by date range (records created by Adarsh's device
-- during a known period) — still use with care:
-- UPDATE public.leads
--   SET owner = 'u-adarsh'
--   WHERE owner = 'u1'
--     AND created_at BETWEEN '2026-04-20' AND '2026-04-24';


-- ── Step 4: Verify ─────────────────────────────────────────────────────
-- Re-run Step 1 after reassignment to confirm the counts dropped.
