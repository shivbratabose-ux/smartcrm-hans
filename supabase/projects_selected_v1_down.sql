-- Undo projects_selected_v1.sql: drops the two columns it added.
-- The app keeps working without them (it falls back to the ₹50 lakh rule only).
ALTER TABLE public.projects DROP COLUMN IF EXISTS selected;
ALTER TABLE public.projects DROP COLUMN IF EXISTS lead_id;
NOTIFY pgrst, 'reload schema';
