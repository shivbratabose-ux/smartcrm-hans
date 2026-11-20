# Intelligent Quote Builder, Pricing Master and Billing Engine

Assessment, gap analysis, design and plan against the specification of 20 Nov 2026.
Every finding below was checked in the code or the live database; file references are given so it can be re-checked.

**In one paragraph.** Quoting is about 80% there, as the specification says: one product master, a central price list, slabs, discount approval, versions, a customer document that already keeps one-time, subscription and usage charges apart. What is missing sits *after* the quote. The approved quote is not kept as a commercial agreement, the contract and the bill copy only the quote's total, and actual usage is not recorded anywhere, so nothing can be invoiced on consumption. One thing in the quote itself conflicts with the specification and needs a decision before it is changed: expected volume × rate is added into the quote total today.

---

## 1. Assessment of what exists

| Area | What is built | Where |
|---|---|---|
| Product Master | One Product Catalogue; each product has price rows ("components") and display modules | `src/data/seed.js`, `src/components/Masters.jsx` |
| Pricing Master | Central price list in Masters → Products & Pricing. Each row: code, name, pricing model, unit, rate source (flat / user band / rate card / slab), list price, cost, minimum quantity, discount cap, effective-dated rates, segment and currency prices, active flag | `src/data/quotationMasters.js`, `src/components/QuotationMasters.jsx` |
| Slabs | Volume (all-units) and progressive (graduated) slabs, monthly or yearly basis, prepaid pack + overage, minimum billing, pooled volume, yearly escalation, one calculation shared by builder and document (PR #315) | `src/lib/quotation/slabs.js` |
| Pricing engine | Pure functions: unit price, line, quote totals, GST split, AMC | `src/lib/quotation/pricingEngine.js`, `amc.js` |
| Quote builder | Customer or lead, KYC, lines from the price list, discounts, hosting, billing details, Quote Assistant (chat) | `src/components/HansQuoteBuilder.jsx` |
| Customer document | Letterhead, sections by charge type, slab tables, show / hide discount, draft marking, confidentiality footnote, terms and EULA by product | `src/lib/quotation/quoteDocument.js`, `termSets.js` |
| Approval | Discount cap (company and per product), margin guardrail, AMC deviations; approvers; approve / reject; re-approval on revision | `HansQuoteBuilder.jsx:286`, `Quotations.jsx:1223` |
| Versions | Revision = new record, same number, version + 1, parent marked Revised; statuses Draft, Sent, Under Review, Accepted, Rejected, Expired, Revised | `src/lib/quotation/docNumbers.js:63` |
| Acceptance | Customer accepts online with KYC; Final quote; Accounts pack | `supabase/functions/quote-accept`, `handoverCore.js` |
| Contract | Created on acceptance | `Quotations.jsx:1364` |
| Bill | One proforma invoice raised from the Final quote; customer confirms online; project created | `handoverCore.js:152` |

## 2. Gap analysis

Status: ✅ built · 🟡 partly · ⬜ not built.

| Spec § | Requirement | Status | Gap |
|---|---|---|---|
| 3 | Product classification (SaaS / Transaction / One-time / Hybrid) | 🟡 | Each price row has a pricing model, but there is no stored billing class per component and none per product. Product Catalogue has no code, category, edition or status of its own |
| 3 | Unit, frequency, minimum, taxes, currency, effective dates per product | 🟡 | Unit, minimum, currency prices and effective dates exist on price rows. GST rate and SAC are one company-wide value. Billing frequency is per quote, not per component |
| 3 | Missing configuration blocks a final quote | 🟡 | A missing rate is flagged on the line; it does not block issue |
| 4A | Product-wise pricing, allowances, extra usage, currency | ✅ | Built (pack + overage in PR #315) |
| 4A | Customer-specific pricing | ⬜ | No stored rate per customer |
| 4B–D | Slabs, both methods, all parameters | ✅ | Built (PR #315). Slab maximum is implied by the next slab's start |
| 4E | Only authorised users change prices | 🟡 | Seven roles can write all of Masters; no separate pricing permission |
| 4E | Audit history of price changes | ⬜ | The settings row is overwritten; only "last updated by / at" is kept |
| 4E | Approved quotes keep their prices | 🟡 | Stored lines keep their rates for printing, but **editing re-prices from the masters** (as of the quote date) |
| 5 | Guided workflow, customer data, pricing rules | ✅ | Built. Existing agreements are not shown because none are stored |
| 5 | Only the relevant inputs per billing model | 🟡 | Usage lines ask for quantity and months like a subscription |
| 6 | SaaS quoting | ✅ | Built, including user slabs |
| 6 | Recurring billing, mid-cycle changes, proration | ⬜ | Not built |
| 7 | Transaction quote shows the rate, not a committed total | 🟡 | The customer document shows rate only. **Internally, expected volume × rate × months is added to the quote total, the contract value and the bill** (`pricingEngine.js:256–323`, `HansQuoteBuilder.jsx:397`) |
| 7 | Bill on actual consumption; reconciliation; audit trail | ⬜ | No usage records anywhere |
| 8 | One-time and project pricing | 🟡 | Amounts and terms print; milestones are free text, not a schedule |
| 9 | Hybrid quote, three separate sections | 🟡 | Sections exist (one-time, subscription, usage). Variable section is titled "Add-on services"; class is not stored per line |
| 10 | Dynamic quotation format | ✅ | Built; template wording per product is editable for terms and EULA only |
| 11 | Billing engine | ⬜ | The bill is the quote total copied once (`handoverCore.js:122–181`); `collections` has no line items; no `invoices` table |
| 12 | Discounts and approval levels | 🟡 | One approval level. Older (non-builder) quotes use hard-coded thresholds (`seed.js:421`). No reason captured on approval |
| 12 | No double discount on slabs | ✅ | Line and overall discounts apply once, on the slab-resolved rate |
| 13 | Statuses and versions | ✅ | Built. "Internal review" and "Approved" are a separate approval field, not statuses |
| 13 | Amendments (users, modules, rates, renewal) | ⬜ | Only a full revision exists |
| 14 | Customer-wise commercial agreements | ⬜ | The contract stores a total, dates and terms, **no lines or rates** (`schema.sql:258`) |
| 15 | Reports | ⬜ | Reports ignore quotes; only the Quotations page KPIs exist |
| 16 | Modular, rule-driven, backward compatible | ✅ | The engine is pure and rule-driven; new products need no code |

## 3. Conflicts with the current design, and what I recommend

These change existing behaviour, so they are listed for a decision rather than changed silently.

1. **Usage in the quote total.** Today: expected volume × rate × months is in the total, the contract value and the bill. Specification: never. *Recommendation:* split every quote into **Committed** (one-time + fixed recurring + contractual minimums) and **Variable** (rates only). Expected volume stays as an optional internal figure and feeds a separate "estimated variable revenue" number for the pipeline. Bill and contract value use Committed only. Quotes already saved keep their stored totals; the new rule applies from the next save.
2. **Editing re-prices.** *Recommendation:* once a quote is approved or accepted, a revision starts from its stored rates; taking current master prices becomes an explicit "re-price" action that is logged.
3. **Two places describe a product's price.** Product Catalogue modules carry price fields (MRP, pricing model, billing frequency) next to the price rows. *Recommendation:* the price rows are the Pricing Master; module price fields become read-only summaries of them.
4. **Masters stored as one settings record.** It cannot hold history or per-field permissions. *Recommendation:* keep it as the working copy (no migration of the 94 saved rows) and add an append-only history table written by a database trigger, plus a pricing-specific write permission.
5. **Bill = copy of a total.** *Recommendation:* the Billing Engine writes invoices with lines and a calculation trail into new tables and posts the totals into `collections`, so the Collections screen and its reports keep working.

## 4. Product Master enhancements

- Product: add **code, category, edition, status**, and a derived **commercial classification** (SaaS / Transaction / One-time / Hybrid) shown on the card. Hybrid is computed from the components, not typed.
- Component (price row): add **billing class** (`subscription` | `transaction` | `one_time`), defaulted from the pricing model and editable; **billing frequency** and **usage measurement basis** for transaction rows; **GST rate** and **SAC** (blank = company default).
- Validation: a product with no active component, a component with no rate, slab or class → flagged in Masters and **blocks Final** unless an approver overrides with a reason.

## 5. Pricing Master structure

One record per component, all of it already in the price row or added by section 4:

```
component { code, productId, name, billingClass, pricingModel, unit,
  rate: flat listPrice | slabs[{from, rate}] + slabMode (volume | graduated) + slabPeriod (month | year)
        | user band | rate card,
  packQty, packPrice, monthlyMinimum, minQty, pool, escalationPct,
  segmentPrices, currencyPrices, rateSchedule[{effectiveFrom, …}], effectiveTo,
  maxDiscountPct, costPrice, gstRatePct, sac, billingFrequency, active }
```

Governance: pricing write permission (admin + named pricing owners), history table, effective dates, and the rule that agreements never follow a later master change.

## 6. Database changes

All additive. Nothing existing is altered or dropped.

| Table | Purpose | Key columns |
|---|---|---|
| `pricing_master_history` | Audit of every price change | changed_at, changed_by, component code, before, after (written by trigger on `app_settings`) |
| `commercial_agreements` | The accepted quote as an agreement | account_id, quote_id, contract_id, quote_no, version, start_date, end_date, status, billing entity, currency, payment terms |
| `agreement_lines` | Frozen terms per component | agreement_id, component code, billing_class, unit, rate or slabs + method, pack, minimum, escalation, discount, billing_frequency, billing_day, effective_from / to, superseded_by |
| `billing_milestones` | One-time schedules | agreement_line_id, name, percent or amount, due basis, status, invoice_id |
| `usage_records` | Actual consumption | account_id, agreement_line_id, period (month), quantity, source, external_ref, status (draft / approved / corrected), corrects_id; **unique (agreement_line_id, period, external_ref)** to stop duplicates |
| `invoices` | Engine output | agreement_id, account_id, period, type, status (preview / final / cancelled), taxable, gst, total, collection_id |
| `invoice_lines` | Lines with the calculation | invoice_id, agreement_line_id, description, quantity, rate, slab detail, amount, calc (the full working, as data) |
| `credit_notes` | Approved adjustments | invoice_id, reason, amount, approved_by |

Relationships: account → agreements → agreement lines → usage records / milestones → invoice lines → invoice → collection. Row-level security follows the existing pattern (owner, downline, Finance, top roles).

## 7. Quotation workflow, updated

1. Customer: as today, plus **active agreements** for that customer and their agreed rates.
2. Product: components load with their billing class.
3. Pricing rules: agreement rate if one is in force, else Pricing Master (segment, currency, effective date, slab).
4. Inputs by class: subscription = quantity, months; transaction = rate, unit, method, optional expected volume (internal); one-time = amount, milestone schedule.
5. Calculation: Committed and Variable shown separately.
6. Document: sections **A Fixed recurring · B Variable, billed on actual consumption · C One-time**.
7. Approval: by level (section 10).
8. Issue: number, version, validity. On acceptance → agreement + agreement lines.

## 8. Slab calculation

Built and tested (`slabs.js`, 35 tests):

- **Volume:** rate of the slab the volume falls in × whole volume. 20,000 at ₹2 = ₹40,000.
- **Progressive:** each band at its own rate. 5,000 × ₹3 + 10,000 × ₹2.50 + 5,000 × ₹2 = ₹50,000.
- Then: prepaid pack (included volume, overage at the rate) → minimum billing floor → yearly escalation → discount, once.
- Slab period monthly or yearly; pooled volume across components.

The Billing Engine will call the same function with the agreement line and the actual quantity, so a quote and an invoice can never disagree.

## 9. Billing Engine

Monthly run, per agreement:

1. **Subscription lines:** fixed charge for the period, by frequency; proration for mid-period start, change or end when the agreement says so.
2. **Transaction lines:** take approved usage for the period → check duplicates, gaps and corrections → apply the line's frozen rate or slabs, pack, minimum.
3. **One-time lines:** milestones that fell due.
4. **Preview** with the working shown per line → Accounts approves → **final** invoice → total posted to `collections`.
5. Separate invoices by billing entity, agreement or billing day where configured; one consolidated invoice otherwise.
6. Corrections after final go through a credit note.

Usage arrives first by entry or spreadsheet upload by Accounts, later by a feed from AMS, WiseDox and the other products.

## 10. Approval and version control

- Approval **levels**, configurable: for example up to X% the rep, up to Y% Sales Head, above that Management; the same for prices outside the slabs and for low margin. Reason required on every exception; approver, date and reason stored.
- Older quotes move to the same rules (the hard-coded thresholds are removed).
- Statuses stay; "Internal review" is added. Approved and accepted quotes are frozen.
- **Amendment** = a revision that changes agreement lines from an effective date (users, modules, rates, renewal) and keeps the earlier lines as history.

## 11. Acceptance tests

`node scripts/acceptance-commercial.mjs` runs all 15 scenarios against the real code.
"Start" is the position on 20 Nov 2026 before any change; "After Phase A" is the position once Phase A is merged.

| # | Scenario | Start | After Phase A | Remaining |
|---|---|---|---|---|
| 1 | SaaS quotation | ✅ | ✅ | — |
| 2 | SaaS volume slab | ✅ | ✅ | — |
| 3 | Transaction quote shows the rate | 🟡 | ✅ Rate only on the document; nothing in the total; estimate internal | — |
| 4 | Monthly billing on actual usage | 🟡 | 🟡 Calculation only | Phase C |
| 5 | Progressive slab | ✅ | ✅ | — |
| 6 | Volume slab | ✅ | ✅ | — |
| 7 | One-time with milestones | 🟡 | ✅ Milestone schedule on the quote, printed with amounts | Stage invoicing in Phase C |
| 8 | Hybrid quotation | 🟡 | ✅ Class stored per line; sections A / B / C | — |
| 9 | Minimum commitment | 🟡 | 🟡 Committed on the quote; not yet on invoices | Phase C |
| 10 | Pricing revision | 🟡 | 🟡 Approved, sent and accepted quotes keep their rates on edit; no agreement record yet | Phase B |
| 11 | Customer-specific rates | ⬜ | ⬜ | Phase B |
| 12 | Usage reconciliation | ⬜ | ⬜ | Phase C |
| 13 | Discount approval | ✅ one level | ✅ Levels: Sales Head, Management, configurable | — |
| 14 | Mixed billing frequency | ⬜ | ⬜ | Phase C |
| 15 | Missing configuration | 🟡 | ✅ No rate: cannot save. Incomplete configuration: approver's sign-off | — |

Start: 5 pass, 7 partial, 3 not built. After Phase A: 9 pass, 3 partial, 3 not built.

## 12. Implementation plan

| Phase | Scope | Database | Completed / modified / new |
|---|---|---|---|
| Done | Product master, price list, engine, builder, document, approval, versions, acceptance, slabs and usage rules | — | Completed |
| **A. Quote side** | Billing class per component and product; Committed vs Variable totals; document sections A / B / C; inputs by class; milestone schedule; missing configuration blocks Final; approval levels with reasons; frozen rates on revision | None | Modified: engine totals, builder, document, approvals. New: classification, milestone schedule |
| **B. Agreements and governance** | Agreement + lines on acceptance; customer-specific rates in the builder; amendments; pricing permission and price history | 3 tables + trigger | New |
| **C. Billing Engine** | Usage records (entry, upload, duplicate and gap checks, corrections); monthly run; preview, final, credit note; minimums, slabs, mixed frequency, milestones; posting to Collections | 5 tables | New; Collections reused |
| **D. Reports** | The 15 reports, with committed, variable and one-time revenue kept apart | — | New |

Each phase ends with the acceptance script showing its scenarios as Pass.

## Decisions taken (20 Nov 2026)

1. Usage leaves the quote total; expected volume is an internal estimate, shown separately. Quotes saved earlier keep their stored totals until they are next saved.
2. Approval levels start as: rep up to 10%, Sales Head up to 20%, Management above. They are edited in Quotation Rules → Config.
3. Approved, sent and accepted quotes are frozen; "Re-price from the price list" is an explicit action recorded on the quote.

## Phase A as built

- `src/lib/quotation/commercial.js`: billing class (`subscription` | `transaction` | `one_time`), commercial model (SaaS / Transaction / One-time / Hybrid), approval levels.
- Price list: a "Billed as" column per component; each product shows its commercial model.
- Engine: `computeLine` / `computeQuote` keep variable lines out of every total; only a contractual minimum is committed; `variableEstimate` is reported separately.
- Builder: variable lines show "on actual use" and an internal estimate; milestone schedule for one-time charges; approval level on the banner; frozen rates with an explicit re-price.
- Document: A Fixed recurring · B Variable, billed on actual consumption · C One-time; milestones with amounts; GST on variable charges "on each invoice".
- Approval: level-based approvers; a reason is required to approve and is stored with approver and date.
