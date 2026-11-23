-- ═══════════════════════════════════════════════════════════════════
-- Data fix (one row): E-Annex Ultra licence P18 back to a one-time licence
-- per branch + ALR, as confirmed by the user on 23 Nov 2026.
--
-- The saved price master had P18 as a "SaaS Subscription" per "Year" with
-- a minimum of 5 units (any quote billed at least 5 × ₹55,000) and a
-- "per filing" description. This sets it back to the code definition:
--   One-time Licence · per Branch · ₹55,000 · ALR (amcFixed) ₹10,000 per
--   branch per year from year 2 · no minimum quantity.
-- Touches only the P18 element of app_settings.masters.quotation.catalogue.
-- Undo (previous values): pricingModel "SaaS Subscription", unit "Year",
--   minQty 5, notes "Per filing (BoE / SB)", description
--   "ICEGATE customs filing — Bills of Entry & Shipping Bills".
-- ═══════════════════════════════════════════════════════════════════
BEGIN;
UPDATE public.app_settings s
SET masters = jsonb_set(
  s.masters, '{quotation,catalogue}',
  (SELECT jsonb_agg(
            CASE WHEN r->>'code' = 'P18'
                 THEN (r - 'minQty') || jsonb_build_object(
                        'pricingModel', 'One-time Licence',
                        'unit', 'Branch',
                        'listPrice', 55000,
                        'amcFixed', 10000,
                        'description', 'E-Annex Ultra licence per location / branch, up to 1+4 users — Export & Import documentation',
                        'notes', 'Multi-location 100% extra · ALR ₹10,000 per branch per year after 365 days')
                 ELSE r END
            ORDER BY ord)
     FROM jsonb_array_elements(s.masters #> '{quotation,catalogue}') WITH ORDINALITY AS t(r, ord)))
WHERE s.scope = 'org'
  AND jsonb_typeof(s.masters #> '{quotation,catalogue}') = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.masters #> '{quotation,catalogue}') r WHERE r->>'code' = 'P18');
COMMIT;
