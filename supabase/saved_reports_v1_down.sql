-- Undo saved_reports_v1.sql. Deletes every cloud-saved custom report.
-- The app falls back to saving reports in each user's browser.
BEGIN;
DROP TABLE IF EXISTS public.saved_reports;
DROP FUNCTION IF EXISTS public.saved_reports_touch();
COMMIT;
