# Billing module: double-check of the specification, and plan

Date: 20 Nov 2026 · Status: **approved with the decisions below; Phase 1 built** (section 6).

## Decisions (20 Nov 2026)

1. The agreement becomes the versioned billing plan.
2. Widening the empty Phase C invoice table's status rule: yes.
3. One invoice series per legal entity per financial year (e.g. `HI/2627/000123`): yes. The prefix is set per entity.
4. Legal entities: seed Hans Infomatic only. An admin adds the others (e.g. Carico System) with GSTIN, address and bank details, and Finance verifies them.
5. Products: add AAI ICMS, eAWB Solutions, SCMTR Filing Desk and Gate Management (ACMES was already in the live catalogue). HR Expert is the existing HRMS, billed per user; its slabs will be shared separately. AMS keeps three profiles.
6. The handover step stops raising a bill once Billing issues invoices (Phase 4).
7. Calculate in whole paise, with a rounding option: none, nearest rupee, or up to the next rupee.
8. **Invoices are printed by the accounting / ERP system, not SmartCRM.** Phase 4 therefore exports approved invoices to the ERP and records the ERP's invoice number instead of printing PDFs. Open point for Phase 4: if the ERP issues the GST tax invoice, the GST serial is the ERP's and the SmartCRM series is the billing reference.
9. Plan and discount approvals reuse the quote approval levels, now named **Line Manager** (up to 20%) and **Management Committee** (above).
10. The Accounts team (Quotation Rules → Accounts) works the billing desk and can open the quote from Billing.

## 1. Summary

About half of this specification already exists in SmartCRM, built in Phases A–D (PRs #314–#322). It covers the price list with slabs, quote-to-agreement, the Billing Engine (usage, proration, escalation, invoices, credit notes, posting to Collections) and 15 commercial reports.

The plan therefore **extends what exists rather than building a second billing system.** A parallel "contract billing plan" next to today's agreements would give two sources of truth for the same customer's rates.

Five points in the specification conflict with the current system or with Indian invoicing rules. They are listed in section 3 and need a decision before Phase 1.

Live data check (read-only, 20 Nov 2026): 0 invoices, 0 usage rows, 0 collections, 1 contract. Changing invoice numbering or invoice states now affects no real records.

## 2. Coverage: what exists, what is partial, what is missing

| Specification item | Today | Status |
|---|---|---|
| **Stack / reuse** | React 18 + Vite SPA, Supabase (Postgres + RLS + edge functions), no ORM, own UI (`shared.jsx`, `pg-head`, `kpi-grid`). Products = Product Catalogue; customers = Accounts; roles = `get_crm_role()` + permission map in `constants.js` | Reuse as is |
| Billing models (16) | `pricingModel` on price rows (7 values) + billing class (subscription / transaction / one-time) + commercial model (SaaS / Transaction / One-time / Hybrid) | **Partial**: no model master; revenue share, freemium, outcome-based, BOT/BOOT, OEM, reseller, POC have no behaviour |
| Billing units by dimension | Free-text `unit` on price rows (20 values in use) | **Partial**: no unit master or dimensions |
| Rate structures | Flat ✓, tiered (graduated slabs) ✓, volume bands ✓, base + overage (pack) ✓, minimum monthly ✓, module-wise (row per module) ✓, rate cards / bands ✓ | **Missing**: monthly cap, prepaid wallet, bundle price, peak / after-hours, rate by cargo type |
| Fee types (one-time / recurring) | Billing class + pricing model per row; AMC engine | **Partial**: no fee-type master |
| Payer types, split, collected-by | — | **Missing** |
| Currencies + FX | `currencies[].fxToInr` (static) | **Partial**: no dated rate table |
| Taxes | GST % (CGST/SGST/IGST by state); TDS field in Collections | **Partial**: no VAT, withholding, gross-up rules |
| Contract plan: products, models, rates, fees, milestones | Quote → accepted → **agreement** (frozen lines, milestones, billing settings) | **Exists**, as the agreement |
| Term, renewal, escalation | Term, % escalation per line; Contracts hold renewal fields | **Partial**: no lock-in, index-linked or step-up escalation |
| Discounts, SLA credits, interest, termination | Line, overall and prepayment discounts with approval levels | **Missing**: named discount types, SLA credits, late interest |
| Revenue share (share %, floor, who collects, settlement) | — | **Missing** |
| Plan versioning with approver | A new accepted quote supersedes the agreement; quote approvals logged | **Partial**: no in-place amendment with effective date and approver |
| Usage: manual, upload, API | Manual entry ✓, paste from spreadsheet ✓, approve / void / correct ✓, duplicate-reference guard ✓ | **Missing**: file upload (.csv/.xlsx), REST push endpoint |
| Rating engine + calculation trace | Slabs, bands, minimum, overage (pack), escalation, proration ✓; trace per line ✓ (`lines` jsonb) | **Missing**: cap, wallet, revenue share, peak rates |
| Invoice lifecycle | Preview → final; credit notes; posted to Collections | **Missing**: draft / review / approved / issued / part-paid / paid / overdue / cancelled, debit notes, PDF |
| Invoice numbering | `BI/<agreement no>/YYYYMM` | **Non-compliant**, see 3.2 |
| Collections, TDS, ageing, reminders | Collections module: TDS, ageing (Current, 0-30 … 180+), follow-up reminders | **Partial**: no payment allocation across invoices |
| Revenue share statements | — | **Missing** |
| Dashboard | 15 commercial reports (billed vs quoted, recurring by product, usage, reconciliation, renewals) | **Partial**: reports, no dashboard screen |
| Audit log | Quote change log, price history (DB trigger), insert-only invoices, usage entries never deleted | **Partial**: no unified log |
| Money as decimal | DB columns `NUMERIC` ✓; JavaScript calculation in floating point, rounded to paise | **Partial**, see 3.4 |
| Product billing profiles | Product Catalogue + price rows per product; the product-led quote builder (#322) shows only a product's items | **Partial**: no profile record (allowed models, units, entity, status) |

## 3. Conflicts and risks in the specification (decision needed)

1. **Plan versus agreement.** The specification describes a new "contract billing plan" entity. SmartCRM already freezes the same thing as the agreement when a quote is accepted.
   - *Recommendation:* make the agreement the billing plan. Move it into its own table, `billing_plans`, with versions, effective date and approver. Version 1 is created on acceptance. An amendment creates version 2 and leaves version 1 read-only. Contracts link to the plan.
   - *Avoids:* one customer having two sets of rates.

2. **Invoice numbering breaks GST rules.** Rule 46 of the CGST Rules requires a consecutive serial number, unique per financial year, of at most 16 characters. Today's `BI/DEL/SQ/0001/2627/202611` is 26 characters.
   - *Recommendation:* one series per legal entity per financial year, e.g. `HI/2627/000123` (14 characters), using the existing shared document counter (`doc_numbers`).
   - *Timing:* no live invoices exist, so the change is free now.

3. **"Do not alter existing tables beyond foreign keys."** Invoice states need the `billing_invoices.status` check constraint widened (it allows only `final`). That table was added in Phase C and holds no rows.
   - *Recommendation:* allow this one reversible change, rather than a second invoice table.

4. **Decimal money.** The database already uses `NUMERIC`. JavaScript numbers are floating point.
   - *Recommendation:* calculate in integer paise inside the rating engine and invoices, and add a guard test that totals reconcile to the paisa.
   - *Effect:* quote totals may change by at most ₹0.01 where rounding differs.

5. **"No rates in code; seed masters blank."** The live Pricing Master already holds the approved rates in the database. The code seed is only a fallback.
   - *Recommendation:* leave the live price list untouched. New masters and profiles are seeded with names only and blank rates. The code fallback rates stay, since removing them would change approved behaviour.

Other points:

6. **Two billing paths (open since Phase C).** The handover step raises one proforma for the whole quote while Billing invoices month by month.
   - *Recommendation:* once Phase 4 issues invoices, the handover step stops raising an amount.

7. **Legal entity.** ACMES bills as Carico System, but SmartCRM has a single company record. A legal-entity master is needed (name, GSTIN, address, bank, invoice series), and the entity has to be carried on the plan and the invoice. An admin enters the registration and bank details.

8. **Product list mismatch:**
   - *In the specification but not in the catalogue:* AAI ICMS, eAWB solutions, SCMTR filing desk, Gate Management, and ACMES as a product (today only an unlinked price row). HR Expert may be the existing HRMS.
   - *In the catalogue but not in the specification:* E-Annex Ultra, WiseDo, BagTrack, SmartCRM, VMS and Orbis EDI. AMS is three catalogue products, not one.

9. **Ageing buckets.** The specification has 4 (0-30, 31-60, 61-90, 90+); Collections has 7.
   - *Recommendation:* keep the 7 and show the 4 as a roll-up on the billing dashboard.

10. **PDF output.** *Recommendation:* the same approach as quotations, an HTML invoice printed or saved to PDF from the browser. No server PDF library.

11. **Usage API.** Each product system pushing usage needs its own key. Creating and storing those keys is yours to do, not mine.

## 4. Plan

### Data model (new tables; each migration has an up and a down script)

| Table | Purpose | Notes |
|---|---|---|
| masters in `app_settings` (`billing.*`) | Billing models, units by dimension, rate structures, fee types, payer types, taxes, legal entities, product billing profiles | Same store and history trigger as the Pricing Master. Names only, rates blank. Profiles carry entity, currency, frequency, credit days, taxes, allowed models / units / modules, required fee lines (e.g. WiseHandling SaaS/PaaS → setup fee), status CONFIRMED / PROPOSED, retired flag |
| `billing_plans` | Versioned plan per customer contract | id, account_id → accounts, contract_id → contracts, quote_id → quotations, version, status (draft, pending_approval, active, superseded, retired), effective_from / to, legal_entity, currency, terms jsonb (lines, fees, milestones, discounts, escalation, revenue share, SLA, interest, termination), created / approved by and at. Backfilled from `quotations.agreement` |
| `billing_fx_rates` | Dated exchange rates | currency, rate_to_inr NUMERIC(18,6), effective_from |
| `billing_invoices` (existing) | Widen `status` to the full lifecycle; add `debit` type, `plan_id` FK, `legal_entity`, `fy_seq` | Reversible constraint change (point 3) |
| `billing_usage` (existing) | Add `plan_id` FK and optional `unit`, `amount` (for value-based units such as % of charges collected) | FK and nullable columns only |
| `billing_payments`, `billing_allocations` | Payments with TDS and allocation across invoices | Each payment also updates the invoice's Collections record |
| `billing_statements` | Revenue share statements per party and settlement period | Stored once final |
| `billing_audit_log` | Every create, edit, approval and status change | entity, id, action, before / after, by, at; written by triggers |

RLS on every new table: the same roles as today (`get_crm_role()`, `is_billing_desk()`); sales see their own accounts.

### Endpoints (Supabase edge functions)

- `usage-ingest`, `POST`: customer, plan or contract, unit, quantity, period, source, reference. Key per source system. Idempotent on reference. Stored as draft for finance to approve.
- Extension points as stubs with documented interfaces: `invoice-irn` (GST e-invoice), `payment-webhook` (gateway), `accounting-export` (ledger sync).

### Screens (existing patterns: `pg-head`, `kpi-grid`, `filter-bar`, `shared.jsx`)

1. Masters → new **Billing** tab: models, units, rate structures, fee types, payer types, taxes, currencies and FX, legal entities, product profiles (add, edit, clone, retire).
2. **Plan builder**, step by step: products (only models, units and modules the profile allows) → rates → fees and milestones → terms → discounts and revenue share → review with live monthly estimate → approval. Opens from an accepted quote or a contract.
3. **Usage register**: existing screen plus file upload (.csv/.xlsx) and the API source shown per entry.
4. **Billing run**: existing screen plus draft → review → approve → issue.
5. **Invoices**: list, detail with calculation trace, PDF, credit and debit notes, cancel.
6. **Collections and ageing**: existing module plus payment allocation and the 4-bucket roll-up.
7. **Billing dashboard**: billed vs collected, recurring revenue by product and model, usage trend, overdue by customer, renewals and escalations due, revenue share payable / receivable.

### Phases (stop for your review after each)

| Phase | Builds | Tests |
|---|---|---|
| 1 | Masters (models, units, structures, fee types, payer types, taxes, FX, legal entities) and product profiles seeded CONFIRMED / PROPOSED with blank rates; `billing_plans` + backfill; audit log; migrations with down scripts | Masters CRUD, profile clone / retire, migration up / down on a test copy, RLS parity |
| 2 | Plan builder with profile filtering, versioning, approval thresholds, bundle discount | Version and approval rules, builder validation |
| 3 | Usage upload + `usage-ingest`; rating engine in integer paise: cap, wallet, peak / after-hours, cargo-type rates, step-up / index escalation, revenue share with floor | Required unit tests: flat, tiered, band, minimum, cap, overage, escalation, pro-rating, revenue share with floor |
| 4 | Invoice lifecycle, GST-compliant numbering per entity and FY, debit notes, PDF, payments and allocation, ageing roll-up, reminders; handover bill retired | Lifecycle transitions, numbering, allocation, credit / debit notes |
| 5 | Billing dashboard, revenue share statements | Figures reconcile with invoices and payments |

Each phase is deployed only on your "merge", and database migrations only on your yes.

## 5. Questions to answer before Phase 1

1. Agreement becomes the versioned billing plan (recommended), or a separate plan entity?
2. Allow widening `billing_invoices.status` (Phase C table, no rows)?
3. Invoice series per legal entity per financial year, max 16 characters, e.g. `HI/2627/000123`? Prefix per entity?
4. Legal entities: Hans Infomatic and Carico System only, or more? (Admin enters GSTIN, address, bank.)
5. Products: add AAI ICMS, eAWB solutions, SCMTR filing desk, Gate Management and ACMES to the Product Catalogue? Is HR Expert the existing HRMS? Do profiles cover E-Annex Ultra, WiseDo, BagTrack, SmartCRM, VMS and Orbis EDI too, and one AMS profile or three?
6. Stop the handover bill once Billing issues invoices?
7. Integer-paise calculation, accepting at most ₹0.01 difference on existing quote totals?
8. Browser print-to-PDF for invoices, as for quotations?
9. Approval threshold for plans and discounts: reuse the quote approval levels (Sales Head 20%, then Management)?
10. Finance role = billing desk automatically, or keep the "Accounts team" list in Quotation Rules?

## 6. Phase 1 as built

- **Masters → Billing** (`src/components/BillingMasters.jsx`): billing models (18), units in 10 dimensions, rate structures (each marked "calculated today" or "Phase 3"), fee types, payer types, taxes (rates blank), currencies with dated exchange rates (decimal text, never floating point), rounding, legal entities and product billing profiles. Admin edits; Finance verifies entities; others read.
- **Seed** (`src/data/billingMasters.js`): names only, no rates. 23 product profiles (19 products with AMS as three, plus 4 services), CONFIRMED or PROPOSED as specified. Saved values (`masters.billing`) always win; items are retired, never deleted.
- **Profiles:** add, edit, clone, retire; each carries legal entity, currency, frequency, credit days, taxes, default and allowed models, primary and allowed units, variables, modules, fees offered, fee lines a model requires (WiseHandling SaaS/PaaS → setup) and flags (revenue share statement, separate collection account). Catalogue products without a profile are listed with a button to start one.
- **Legal entities:** Hans Infomatic reads its details from Quotation Rules → Company; others have their own. Invoice prefix of 1–4 characters, unique, numbers at most 16 characters (`TC/2627/000001`). Finance's verification stores a fingerprint of the details, so any later change shows "Details changed since verification".
- **Catalogue:** ACMES, AAI ICMS, eAWB Solutions, SCMTR Filing Desk and Gate Management added to the built-in list; a live catalogue picks up the missing ones on load (no existing price row changes product, except ACMES's own row, as already live).
- **Approval levels** renamed Line Manager / Management Committee (keys unchanged, so existing quotes still match).
- **Billing → Open quote** for the Accounts team.
- **Database** (`supabase/billing_phase1_v1.sql`, undo: `billing_phase1_v1_down.sql`; not yet applied): `billing_plans` (versioned; an active version cannot be edited, enforced by trigger), `billing_entity_checks` (Finance only, insert only), `billing_audit_log` (written by triggers on every billing table and on billing masters changes), invoice status widened to the lifecycle, `debit` type, `plan_id` foreign keys on invoices and usage. The screens work before it is applied; Finance's verification needs it.
- **Tests:** `scripts/test-billing-masters.mjs` (40 checks).

### How to test Phase 1

1. Masters → Billing → Product profiles: open WiseHandling, set credit days (2.5 is refused, 30 saves); clone WiseGSA, then retire the copy.
2. Legal entities: add an entity (prefix HI is refused as taken; the series preview updates). As a Finance user, Verify it; as admin, change its bank account: it shows "Details changed since verification".
3. Currencies & FX: "abc" is refused; 84.25 from today is added. Taxes: enter the GST rate. Rounding: pick "Up to the next rupee".
4. Quotations → Billing → an agreement → Open quote.

### Open questions for Phase 2

1. Who approves a plan with no discount: any Line Manager, or the account owner's own line manager?
2. Should sales see plans for all accounts (as quotes today), or only their own?
3. ERP: which system (Tally, SAP, other), and the export format it imports?
