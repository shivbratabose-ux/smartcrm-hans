# QA cycle 1: execution, defects, changes and result

Date: 20 Nov 2026 · Branch `qa/baseline-2026-11-20` (from `master` @ `9cc2cee`) · 4 of 10 fix iterations used.
Environment: local Vite dev server, browser-only data (no Supabase configured, nothing sent to the live database). Test records created: account "QA TEST FORWARDERS", deal "QA Orbis One + AMS", quote DEL/SQ/0001/2627 and a Custom quote, all in the browser's local storage only.

## A. Test execution report

| ID | Module | Scenario | Expected | Actual | Result |
|---|---|---|---|---|---|
| T1-01 | All | 32 baseline automated suites + build | All pass | 32/32 pass, build clean | Pass |
| T2-01 | All | Load all 30 routes, empty data | No crash / console error | None | Pass |
| T2-02 | All | Page width at 1024 / 1280 / 375 px | No sideways scroll; actions reachable | Quotations overflowed at 1024 and 1280, Calendar at 1024 | **Fail → DEF-01, fixed** |
| T4-01 | Accounts | Save with empty / whitespace name | "Account name is required" | As expected | Pass |
| T5-01 | Accounts | Create account | Saved, name upper-cased, number ACC-2026-001 | As expected | Pass |
| T4-02 | Accounts | Duplicate name + country | Warning, user may continue | Confirm dialog shown (design) | Pass |
| T4-03 | Pipeline | Save empty deal | Title, account, close date, product line required | All four messages | Pass |
| T4-04 | Pipeline | Negative deal value | Rejected | "Value cannot be negative" | Pass |
| T5-02 | Pipeline | Create deal ₹12L, Prospect | Saved; weighted ₹1.2L | As expected; counted as "Stalled" (OBS-01) | Pass |
| T3-01 | Quote builder | Orbis One Enterprise 20 users × 12 months | ₹10,07,760; GST 9+9%; ₹11,89,157 | Exact | Pass |
| T4-05 | Quote builder | Users below 20-user minimum / negative | Bills the minimum | Bills 20 | Pass |
| T4-06 | Quote builder | Line discount 150% | Held to 0-100 | Negative quote −₹5,94,578, saveable | **Fail → DEF-02, fixed** |
| T4-07 | Quote builder | Line discount −10% | Held to 0-100 | Silent 10% markup, no approval | **Fail → DEF-03, fixed** |
| T4-08 | Quote builder | Subscription months 0 | At least 1 | ₹0 quote, saveable | **Fail → DEF-04, fixed** |
| T4-09 | Quote builder | Overall discount 250% / −20% | Held to 0-100 | Same defect as DEF-02/03 | **Fail → fixed with DEF-02/03** |
| T4-10 | Quote builder | Negative qty on a one-time line | Not below 0 | Negative line | **Fail → fixed with DEF-02/03** |
| T3-02 | Quote builder | AMS agreed rate ₹27.50 / ₹25 / ₹35 / −₹5 | 8.33% no approval / Sales Head / list rate / Management | As expected | Pass |
| T3-03 | Quote builder | Mixed quote (subscription + AMS + one-time) | Hybrid; variable not in total; ₹17,20,157; milestones 50/50 | As expected | Pass |
| T3-04 | Quote builder | Save | Draft DEL/SQ/0001/2627, lines stored | As expected | Pass |
| T3-05 | Quotations | View an engine quote | Names, rates, discount, amounts, products | Every line INR 0, no names, "No products selected", "Tax ()" | **Fail → DEF-05, fixed** |
| T3-06 | Quotations | CSV export of an engine quote | IGST / CGST / SGST filled | 0 | **Fail → DEF-06, fixed** |
| T3-07 | Quotations | View a Custom quote (regression) | Unchanged | Unchanged | Pass |
| T6-01 | Quotations → Contracts | Accept a Sent quote | Accepted, agreement, contract draft | Agreement DEL/SQ/0001/2627 (3 lines, AMS open-ended), contract CT-001 | Pass |
| T6-02 | Billing | November run | Orbis One prorated 11/30 = ₹30,793; AMS needs usage | As expected | Pass |
| T4-11 | Billing | Usage −5 | Rejected | Rejected | Pass |
| T4-12 | Billing | Duplicate usage reference (manual) | Rejected | Production: rejected by DB index. Offline mode: accepted, then flagged | Pass (OBS-04) |
| T6-03 | Billing | Approve 120 HAWB, void duplicate | 120 × ₹27.50 = ₹3,300; ₹40,229 payable | As expected; rate shown "₹27.5" | **Pass with DEF-07, fixed** |
| T6-04 | Billing → Collections | Finalise; finalise again | Posted once; no second finalise | As expected | Pass |
| T6-05 | Billing | Raise milestone 1 | ₹2,25,000 + GST = ₹2,65,500, once | As expected | Pass |
| T3-08 | Agreements | List | Active, 20 Nov 2026 – 19 Nov 2027, Hybrid, ₹83,980/month | As expected | Pass |
| T3-09 | Reports | All 15 commercial reports | Render; figures match invoices | No errors; ₹30,793 fixed, ₹3,300 usage, reconciliation 120/120 | Pass |
| T5-03 | Trash | Delete → Trash → Restore a quote | Soft delete, restorable | As expected | Pass |
| T7-01 | Access | Sales rep: Delete, Billing, Restore/Purge, Team | Hidden / redirected | As expected | Pass |
| T7-02 | Access | Sales rep: Masters | Not editable (DB refuses their writes) | Editable on screen | **Fail → DEF-08, needs decision** |
| T1-02 | All | Regression after fixes (33 suites incl. new test) + build | All pass | 33/33, 1,274 checks, build clean | Pass |

Totals: 35 scenarios executed · 26 passed · 9 failed (8 fixed and verified, 1 awaiting a decision) · 0 blocked within scope.

## B. Defect register

| ID | Severity | Module | Description | Root cause | Correction | Status |
|---|---|---|---|---|---|---|
| DEF-01 | Medium | UI (Quotations, Calendar) | Header buttons overflow at 1024-1330 px; New Quote (Pricing Engine) off-screen, page scrolls sideways | `.pg-actions` had `flex-shrink:0` and no wrap; Phase C/D added three buttons | Allow shrink + wrap, right-aligned | Fixed, verified |
| DEF-02 | High | Quote builder | Discount > 100% gives a negative, saveable quote | Typed value stored as-is; HTML `max` does not stop typing | Hold to 0-100 (line, overall, prepayment) | Fixed, verified |
| DEF-03 | High | Quote builder | Negative discount marks the price up with no approval | Same as DEF-02 (`min` not enforced) | Same | Fixed, verified |
| DEF-04 | Medium | Quote builder | 0 months on a subscription gives a ₹0 saveable quote; negative qty gives a negative line | `min` not enforced | Months raised to 1 on leaving the box; qty ≥ 0 | Fixed, verified |
| DEF-05 | High | Quotations View | Engine quotes show every line as ₹0 with no product, "No products selected", "Tax ()" | Table reads Custom-quote fields only | `engineLineView` maps engine lines per billing class; GST from stored breakdown; products from lines | Fixed, verified |
| DEF-06 | Medium | Quotations CSV export | IGST/CGST/SGST 0 for engine quotes | Summed per-line fields engine quotes don't have | Fall back to stored quote GST | Fixed, verified |
| DEF-07 | Low | Billing preview | Rate "₹27.5" instead of "₹27.50" | Formatter had no minimum decimals | Two decimals when fractional (rule from #320) | Fixed, verified |
| DEF-08 | Medium | Masters / access | Sales reps can edit Masters on screen; the database refuses their writes, so edits are lost | No role check on the Masters route or controls (Team has one) | **Recommendation:** make Masters read-only for roles outside the `app_settings_write` policy (admin, md, director, vp_sales_mkt, line_mgr, country_mgr, bd_lead) | Open: needs approval (permission behaviour) |

### Observations (not changed; need a business decision)

| ID | Observation |
|---|---|
| OBS-01 | A new deal with no completed activity counts as "Stalled" (KPI sub-label ">14 days idle"). Explicit rule in `getDealHealth`. Confirm intent or relabel. |
| OBS-02 | Two price rows share the name "Advanced Manifest System — One-time Registration" (AMS01, AMS03); a rep cannot tell them apart in the product picker. Configuration data, not code. |
| OBS-03 | Accepting a quote does not move its deal; the register shows the accepted quote at the deal's probability (10% for Prospect). |
| OBS-04 | In offline (browser-only) mode a duplicate usage reference is accepted then flagged; the database index rejects it in production. Offline mode only. |
| OBS-05 | Billing posts to Collections with pending = taxable value (GST in `gstAmount` / `netPayable`), matching the existing Collections convention. Finance to confirm. |
| OBS-06 | Still open from earlier: the handover step's single bill for the whole quote can double-bill alongside the Billing screen. |
| OBS-07 | GST rows in the quote View use the browser number format (₹131,198.4), as for Custom quotes before this cycle. |

## C. Code change register

| Commit | Files | Reason | Before | After | Review |
|---|---|---|---|---|---|
| `3d7fed9` | `src/styles.js` | DEF-01 | `.pg-actions { flex-shrink:0 }` | shrink, wrap, right-aligned | Pending developer review |
| `9513885` | `src/components/HansQuoteBuilder.jsx` | DEF-02/03/04 | Typed values stored raw | `pct0to100` on 3 boxes; qty ≥ 0; months ≥ 1 on blur (subscription lines only; transaction lines untouched) | Pending |
| `0a5e115` | `src/lib/quotation/engineLineView.js` (new), `src/components/Quotations.jsx`, `scripts/test-engine-line-view.mjs` (new) | DEF-05/06 | Legacy-only table and CSV | Engine branch in the same 9 columns; GST fallback; products panel fallback | Pending |
| `0656e7b` | `src/components/BillingPanel.jsx` | DEF-07 | `maximumFractionDigits:2` | plus 2 minimum when fractional | Pending |
| (uncommitted) | `qa/run-all.mjs`, `qa/reports/*` | QA tooling and reports | none | runner + reports | Pending |

No pricing, billing, slab, approval, permission, report or database logic was changed. No migrations, no deploys, no merges.

## D. Regression report

- Before fixes: 32 suites, all pass. After fixes: 33 suites (new `test-engine-line-view`, 10 checks), all pass, 1,274 checks in total; build clean.
- Browser re-tests after each fix: all 30 routes at 1024 / 1280 / 375 px; builder totals unchanged for valid input (₹11,89,157; ₹17,20,157); Custom quote View unchanged; agreement, billing, milestone and report figures as above.
- New failures: none.

## E. Final QA report

| Measure | Count |
|---|---|
| Automated suites / checks | 33 / 1,274, all passing |
| Manual + scripted scenarios | 35 (26 pass, 9 fail) |
| Blocked (out of this environment) | Supabase sync and RLS against a real database, e-mail, AI functions, load (no k6/JMeter), OWASP ZAP, non-Chromium browsers |
| Defects found | 8 (3 High, 4 Medium, 1 Low) |
| Defects fixed and verified | 7 |
| Defects pending | 1 (DEF-08, needs a permission decision) |

**Outstanding risks:** DEF-08; areas not exercised this cycle (Leads intake, Contacts, Activities, Call Reports, Tickets, Projects, Contracts editing, Targets/ABP, Email Agent, Bulk Upload, public accept / bill-confirm / terms pages, edge functions); behaviour against the real database (RLS, sync, schema-heal) could not be tested without a separate test project.

**Recommendation: QA BLOCKED - HUMAN INTERVENTION REQUIRED** for sign-off: DEF-08 needs a permission decision, and a non-production Supabase project is needed to test sync and RLS. The seven fixes on `qa/baseline-2026-11-20` are ready for developer review; none is deployed.
