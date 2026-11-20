-- Billing Phase 1 follow-up (applied 20 Nov 2026): remove Supabase's default
-- grants that the access rules never allow anyway. Billing plans are retired,
-- never deleted; Finance's entity verifications are insert only.
-- Undo: GRANT DELETE ON public.billing_plans TO authenticated;
--       GRANT UPDATE, DELETE ON public.billing_entity_checks TO authenticated;
REVOKE DELETE ON public.billing_plans FROM anon, authenticated;
REVOKE UPDATE, DELETE ON public.billing_entity_checks FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_plans, public.billing_entity_checks FROM anon;
