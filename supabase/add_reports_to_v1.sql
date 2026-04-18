-- ═══════════════════════════════════════════════════════════════════
-- Add reports_to column to users table
-- Enables hierarchical reporting structure: each user can report to
-- another user (their manager). Drives data visibility scoping.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS reports_to TEXT REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_reports_to ON public.users(reports_to);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
