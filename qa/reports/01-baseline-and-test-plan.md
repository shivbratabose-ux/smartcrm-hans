# QA cycle 1: baseline and test plan

Date: 20 Nov 2026 · QA branch: `qa/baseline-2026-11-20` (from `master` @ `9cc2cee`, PR #320)

## 1. Baseline

| Item | Recorded |
|---|---|
| Repository | `D:\Desktop\smartcrm-hans` (GitHub `shivbratabose-ux/smartcrm-hans`, default `master`) |
| Version / commit | package 1.0.0 · `9cc2cee` "Quote: agreed rate for transaction lines; complete feature list (#320)" |
| Uncommitted developer changes | None (clean tree). Five older stashes exist (`stash@{0..4}`); left untouched. |
| `C:\Users\msdnu\Desktop\smartcrm-hans` | Not the repository (holds only `.claude`, `supabase`, `users.json`). Not used. |
| Runtime | Node v24.14.1 · Vite 5 · React 18 |
| Build | `vite build` passes (2,688 modules). One warning that predates this cycle: the main chunk is 2.57 MB, over Vite's 500 kB advisory limit. |
| Automated tests | 32 suites (`scripts/test-*.mjs`, `acceptance-commercial.mjs`, `check-rls-role-parity.mjs`): **32 pass, 0 fail**. Runner: `node qa/run-all.mjs`. `smoke-email-agent.mjs` excluded (calls a live service). |
| Test environment | Local Vite dev server with no `.env`, so Supabase is not configured and all data lives in the browser's `localStorage`. Nothing reaches the live database (`kiiykerktkvfkzlyqtza`) or the live site. |

## 2. Architecture

- **Frontend:** single-page React 18 app (`src/SmartCRM.jsx` shell, hash routing, 64 components in `src/components`). State is in memory, persisted to `localStorage` and, when configured, synced to Supabase (upsert by id, schema-heal).
- **Backend:** Supabase Postgres with row-level security (`get_crm_role()`, `get_crm_user_id()`, `is_quote_desk_member()`, `is_billing_desk()`); 71 SQL files in `supabase/`; 11 edge functions (`quote-accept`, `quote-handover`, `quote-terms`, `send-email`, `lead-intake`, `ai-claude`, `notify-*`, `activity-digest`, `em-ingest`, `re-agent-run`, `admin-set-temp-password`).
- **Hosting:** Vercel (auto-deploys `master`).
- **Pure business logic, covered by unit tests:** `src/lib/quotation/*` (pricing engine, slabs, commercial classes, agreements, AMC, terms, quote document, doc numbers, handover), `src/lib/billing/*` (engine, reports), `src/utils/*` (fiscal, targets, team summary, lead score, card match, email).

## 3. Module inventory

| Area | Screens (route) | Logic / tests |
|---|---|---|
| Overview | Dashboard (`/`), Updates, Dashboards, My Performance | team summary, fiscal windows |
| Sales | Leads, Lead Assignment, Accounts, Contacts, Pipeline, Activities, Call Reports, Calendar, Communications | lead intake, card match, related contacts, activity digest, delete-sync |
| Post-sale | Quotations (legacy + Hans engine builder, Agreements, Billing, Commercial Reports, Handover), Contracts, Projects, Collections, Tickets | pricing, slabs, usage pricing, commercial, agreements, billing, reports, AMC, handover, doc numbers, quote document, acceptance |
| Targets | Targets / ABP | target allocation, attainment, ABP roll-up |
| Tools | Email Agent, Re-engagement, Bulk Upload, Help | email agent, RE agent |
| Admin | Masters (incl. Quotation Rules, Pricing Master, Terms & EULA, Product Catalogue), AI Settings, Org, Team & Users, Profile, Trash | RLS role parity |
| Public pages | `#/quote-accept/<token>`, `#/bill-confirm/<token>`, `#/terms/<id>` | quote-accept, quote-terms functions |

## 4. Test plan

Order: highest business risk and most recent change first.

| Phase | Scope | Method |
|---|---|---|
| T1 Automated regression | All 32 suites + build | `node qa/run-all.mjs`; re-run after every fix |
| T2 UI smoke | All 30 routes, empty data and with test data | Browser pane: load each route, capture uncaught errors and `console.error` |
| T3 Quotations, functional | Engine builder: subscription, transaction (AMS), slab (Ocean Consol), one-time, mixed; save, edit, view, customer PDF, approval, accept, agreement, billing | Browser + unit tests |
| T4 Negative | Missing mandatory fields, zero/negative quantities and rates, invalid discount, duplicate records, invalid dates | Browser forms + unit-level probes |
| T5 Core CRM CRUD | Account, contact, lead, opportunity, activity, ticket: create, edit, delete to Trash, restore | Browser |
| T6 Integration | Quote → contract → collection; agreement → billing run; lead → opportunity | Browser + engine tests |
| T7 Security (static) | RLS parity, edge-function auth checks, HTML escaping in generated documents | Code review + `check:rls` |

Not in scope this cycle (BLOCKED, needs a human or a separate environment): Supabase sync and RLS against a real database (no test project configured; the live project must not be used), e-mail sending, AI functions, load testing (no k6/JMeter), OWASP ZAP (not installed), cross-browser (only the built-in Chromium pane is available).

## 5. Rules applied

- Fix only confirmed defects; no change to pricing, billing, slab, approval, permission or report logic. Where a fix would change business behaviour, it is logged as a recommendation, not made.
- No database migrations, no production deploys, no merges. Fixes stay on the QA branch for developer review.
- Maximum 10 fix-and-test iterations this cycle.
