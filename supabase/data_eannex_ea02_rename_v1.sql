-- ═══════════════════════════════════════════════════════════════════
-- Data fix (one row): rename E-Annex Ultra price row EA02 in the saved
-- price master to the standard name from the Nov 2026 rate list.
--   "E-Annex Ultra — CHA Licence Change"
--     → "E-Annex Ultra — CHA Licence Modification & Update"
-- The saved copy overrides the name in code, so the code change alone
-- doesn't show. Price (₹20,000 one-time) and everything else stay as they are.
-- Touches only the EA02 element of app_settings.masters.quotation.catalogue.
-- Undo: run again with the two names swapped.
-- ═══════════════════════════════════════════════════════════════════
BEGIN;
UPDATE public.app_settings s
SET masters = jsonb_set(
  s.masters, '{quotation,catalogue}',
  (SELECT jsonb_agg(
            CASE WHEN r->>'code' = 'EA02'
                 THEN r || jsonb_build_object(
                        'name', 'E-Annex Ultra — CHA Licence Modification & Update',
                        'description', 'Modification and update of the CHA licence on an existing E-Annex Ultra installation')
                 ELSE r END
            ORDER BY ord)
     FROM jsonb_array_elements(s.masters #> '{quotation,catalogue}') WITH ORDINALITY AS t(r, ord)))
WHERE s.scope = 'org'
  AND jsonb_typeof(s.masters #> '{quotation,catalogue}') = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.masters #> '{quotation,catalogue}') r WHERE r->>'code' = 'EA02');
COMMIT;
