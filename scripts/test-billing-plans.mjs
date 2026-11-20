// Billing module Phase 2: versioned billing plans. Run: node scripts/test-billing-plans.mjs
import { buildAgreement } from "../src/lib/quotation/agreements.js";
import { previewInvoices } from "../src/lib/billing/engine.js";
import { resolveBillingMasters, entityFingerprint } from "../src/lib/billing/masters.js";
import { planFromAgreement, newVersion, versionsOf, activeVersion, openVersion, activation, planDiscountPct, approvalRoute, planProblems,
  monthlyEstimate, versionChanges, mergedAgreement, withPlans, canSeePlan, nextMonthStart, productsOfLines } from "../src/lib/billing/plans.js";
import { INIT_PRODUCT_CATALOG } from "../src/data/seed.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};
const catalog = INIT_PRODUCT_CATALOG;
const priceRows = [
  { code: "OB04", productId: "OrbisOne", name: "Orbis One Enterprise", pricingModel: "SaaS Subscription", unit: "User" },
  { code: "AMS04", productId: "AMSAir", name: "Air Consol Filing", pricingModel: "Per-transaction", unit: "HAWB" },
  { code: "AS03", productId: "_services", name: "Data Migration", pricingModel: "Implementation", unit: "Fixed" },
  { code: "WH01", productId: "WiseHandling", name: "WiseHandling PaaS", pricingModel: "PaaS Per-Flight", unit: "Flight" },
];
const company = { name: "Hans Infomatic Pvt. Ltd.", gstin: "07AAACH0000A1Z5", regdOffice: "New Delhi" };
const m = resolveBillingMasters(null);
const hans = m.legalEntities[0];
const checks = [{ entityId: "hans", fingerprint: entityFingerprint(hans, company), at: "2026-11-20T00:00:00Z", by: "fin" }];
const quote = {
  id: "q1", quoteNo: "DEL/SQ/0001/2627", version: 1, status: "Accepted", acceptedDate: "2026-11-20", accountId: "acc1", owner: "rep1", currency: "INR", billingFrequency: "Monthly",
  items: [
    { productCode: "OB04", name: "Orbis One Enterprise", pricingModel: "SaaS Subscription", billingClass: "subscription", unit: "User", qty: 20, months: 12, unitPriceResolved: 4199, discountPct: 0 },
    { productCode: "AMS04", name: "Air Consol Filing", pricingModel: "Per-transaction", billingClass: "transaction", unit: "HAWB", qty: 0, months: 0, unitPriceResolved: 30, discountPct: 8.3333 },
    { productCode: "AS03", name: "Data Migration", pricingModel: "Implementation", billingClass: "one_time", unit: "Fixed", qty: 1, months: 1, unitPriceResolved: 450000, discountPct: 0 },
  ],
  hans: { party: { name: "QA Forwarders", state: "Delhi" }, milestones: [{ name: "With the order", pct: 50 }, { name: "On go-live", pct: 50 }] },
};
quote.agreement = buildAgreement(quote, { priceRows, now: "2026-11-20T00:00:00Z" });
const ctxP = { priceRows, catalog, profiles: m.profiles };

// ── Version 1 = the accepted quote's agreement ───────────────────────
const v1 = planFromAgreement(quote, ctxP);
check("version 1 is the agreement, active, same number", [v1.planNo, v1.version, v1.status, v1.effectiveFrom, v1.terms.lines.length], ["DEL/SQ/0001/2627", 1, "active", "2026-11-20", 3]);
check("products on the plan, with their profile's default model", v1.terms.products.map((p) => [p.productId, p.profileId, p.modelId]), [["OrbisOne", "orbisone", "saas_infra"], ["AMSAir", "ams_air", "per_txn"]]);
check("services lines are not a product on the plan", productsOfLines([{ code: "AS03" }], ctxP), []);

// ── A new version ────────────────────────────────────────────────────
check("amendments start on the 1st of the next month by default", [nextMonthStart("2026-11-20"), nextMonthStart("2026-12-31")], ["2026-12-01", "2027-01-01"]);
const v2 = newVersion(v1, [v1], { by: "rep1", at: "2027-01-10T09:00:00Z" });
check("new version: draft, version 2, copied terms, effective from next month", [v2.version, v2.status, v2.supersedesId, v2.effectiveFrom, v2.terms.lines.length, v2.approvedBy], [2, "draft", v1.id, "2027-02-01", 3, ""]);
check("the default date is after the version it replaces started, even when that is in the future",
  newVersion({ ...v1, effectiveFrom: "2027-03-01" }, [v1], { at: "2027-01-10T09:00:00Z" }).effectiveFrom, "2027-04-01");
v2.terms.lines[0].netRate = 3999; v2.terms.lines[0].discountPct = 4.76;
check("its terms are a copy: version 1 unchanged", v1.terms.lines[0].netRate, 4199);
check("open and active versions", [openVersion([v1, v2], v1.planNo).id, activeVersion([v1, v2], v1.planNo).id, versionsOf([v2, v1], v1.planNo).map((p) => p.version)], [v2.id, v1.id, [1, 2]]);

// ── Discounts and approval ───────────────────────────────────────────
const cfg = { maxUserDiscountPct: 10, gstRatePct: 18, homeState: "Delhi" };
check("plan discount: the deepest line discount with plan discounts on top", planDiscountPct({ terms: { lines: [{ discountPct: 8.3333 }], discounts: [{ pct: "5" }] } }), 12.92);
check("no discount → account owner", approvalRoute({ terms: { lines: [{ discountPct: 0 }] } }, { config: cfg, accountOwnerId: "rep1" }), { route: "owner", label: "Account owner", discountPct: 0, userIds: ["rep1"] });
check("within the rep's authority (8.33%) → account owner", approvalRoute({ terms: { lines: [{ discountPct: 8.3333 }] } }, { config: cfg }).route, "owner");
check("15% → Line Manager; 25% → Management Committee", [approvalRoute({ terms: { lines: [{ discountPct: 15 }] } }, { config: cfg }).label, approvalRoute({ terms: { lines: [{ discountPct: 20 }], discounts: [{ pct: "7" }] } }, { config: cfg }).label],
  ["Line Manager", "Management Committee"]);

// ── Checks before approval ───────────────────────────────────────────
const ctx = { m, checks, company, plans: [v1, v2], priceRows, catalog };
check("a valid amendment has no problems", planProblems(v2, ctx), []);
check("an amendment takes effect on the 1st, after the version it replaces",
  [planProblems({ ...v2, effectiveFrom: "2027-02-15" }, ctx)[0], planProblems({ ...v2, effectiveFrom: "2026-11-01" }, ctx)[0]],
  ["A new version takes effect on the 1st of a month.", "The effective date must be after 2026-11-20, when version 1 started."]);
check("the legal entity must be verified by Finance", planProblems(v2, { ...ctx, checks: [] }), ["Hans Infomatic Pvt. Ltd. is not verified by Finance yet."]);
check("billing terms and escalation are checked", planProblems({ ...v2, terms: { ...v2.terms, billingTerms: { frequency: "Weekly", timing: "later", creditDays: "1.5" }, term: { lockInMonths: "x", escalation: { type: "fixed", pct: "" } }, lateInterestPct: "200" } }, ctx),
  ["Pick a billing frequency.", "Pick advance or arrears billing.", "Credit days must be a whole number.", "Lock-in must be a whole number of months.", "Escalation: enter the yearly %.", "Late-payment interest: a % up to 100."]);
check("plan discounts and fees are checked", planProblems({ ...v2, terms: { ...v2.terms, discounts: [{ type: "", pct: "0" }], fees: [{ feeTypeId: "nope", amount: "" }] } }, ctx),
  ["Discount 1: pick its type.", "Discount 1: a % from above 0 to 100.", "Fee 1: pick a fee type.", "Fee 1: enter the amount."]);
const wh = { ...v2, terms: { ...v2.terms, products: [{ productId: "WiseHandling", profileId: "wisehandling", modelId: "paas", unitIds: ["flight"], modules: ["Ramp"] }] } };
check("WiseHandling on PaaS needs a setup fee; a setup fee clears it", [planProblems(wh, ctx), planProblems({ ...wh, terms: { ...wh.terms, fees: [{ feeTypeId: "setup", productId: "WiseHandling", kind: "one_time", amount: "50000" }] } }, ctx)],
  [["WiseHandling: Setup fee is required with this model."], []]);
check("only the models, units and modules the profile allows", planProblems({ ...wh, terms: { ...wh.terms, fees: [{ feeTypeId: "setup", productId: "WiseHandling", amount: "1" }], products: [{ ...wh.terms.products[0], modelId: "revenue_share", unitIds: ["kg"], modules: ["Spaceflight"] }] } }, ctx).slice(0, 3),
  ["WiseHandling: the model is not allowed by its billing profile.", "WiseHandling: unit \"kg\" is not allowed by its billing profile.", "WiseHandling: module \"Spaceflight\" is not in its billing profile."]);
const rs = { ...v2, terms: { ...v2.terms, products: [{ productId: "WiseCCS", profileId: "wiseccs", modelId: "revenue_share", unitIds: ["pct_collected"] }], revenueShare: { sharePct: "" } } };
check("revenue share needs share %, collector and settlement cycle", planProblems(rs, ctx), ["Revenue share: enter the share %.", "Revenue share: who collects?", "Revenue share: pick the settlement cycle."]);

// ── Approval: activation ─────────────────────────────────────────────
const pending = { ...v2, status: "pending_approval" };
const rows = activation([v1, pending], pending.id, { by: "rep1", at: "2027-01-12T10:00:00Z" });
check("approval: version 1 superseded the day before; version 2 active, approver recorded", rows.map((r) => [r.version, r.status, r.effectiveTo || "", r.approvedBy]), [[1, "superseded", "2027-01-31", "rep1"], [2, "active", "", "rep1"]]);
check("only a version waiting for approval can be approved", activation([v1, v2], v2.id, {}), []);

// ── Estimate and changes ─────────────────────────────────────────────
const est = monthlyEstimate({ terms: { lines: [{ billingClass: "subscription", netRate: 4199, qty: 20 }, { billingClass: "transaction", netRate: 27.5, qty: 120, monthlyMinimum: 1000 }, { billingClass: "one_time", netRate: 450000, qty: 1 }],
  fees: [{ kind: "recurring", amount: "12000", per: "year" }, { kind: "one_time", amount: "50000" }], discounts: [{ type: "volume", pct: "10" }] } });
check("monthly estimate: fixed, minimum, fees, plan discount, usage, one-time", [est.fixed, est.minimums, est.recurringFees, est.committedMonthly, est.expectedUsage, est.oneTime], [83980, 1000, 1000, 77382, 2970, 500000]);
check("what changed, for the approver", versionChanges(v1, { ...v2, terms: { ...v2.terms, discounts: [{ type: "volume", pct: "5" }] } }), ["Orbis One Enterprise: rate 4199 → 3999", "Plan discounts changed"]);

// ── Billing reads the merged timeline ────────────────────────────────
const active2 = rows[1], sup1 = rows[0];
const merged = mergedAgreement([sup1, active2]);
check("merged: version 1 recurring until 31 Jan, version 2 from 1 Feb, one-time only once", merged.lines.map((l) => [l.code, l.netRate, l.effectiveFrom, l.effectiveTo]),
  [["OB04", 4199, "2026-11-20", "2027-01-31"], ["AMS04", 27.5, "2026-11-20", "2027-01-31"], ["AS03", 450000, "2026-11-20", ""], ["OB04", 3999, "2027-02-01", "2027-11-19"], ["AMS04", 27.5, "2027-02-01", ""]]);
const billQuotes = withPlans([quote], [sup1, active2]);
const bill = (period) => previewInvoices(billQuotes[0], period, { [`q1|AMS04|${period}`]: 100 }, { quotes: billQuotes, config: cfg })[0].lines.map((l) => [l.code, l.amount]);
check("January bills the old rate", bill("2027-01"), [["OB04", 83980], ["AMS04", 2750]]);
check("February bills the new rate, once", bill("2027-02"), [["OB04", 79980], ["AMS04", 2750]]);
check("a quote with no stored versions is untouched", withPlans([quote], [v1])[0] === quote, true);
check("same agreement number, so invoice numbers do not change", billQuotes[0].agreement.agreementNo, quote.agreement.agreementNo);
const esc = mergedAgreement([sup1, { ...active2, terms: { ...active2.terms, term: { escalation: { type: "fixed", pct: "5" } } } }]);
check("fixed escalation keeps the contract anniversary", esc.lines.filter((l) => l.planVersion === 2).map((l) => [l.code, l.escalationPct, l.escalationFrom]), [["OB04", 5, "2026-11-20"], ["AMS04", 5, "2026-11-20"]]);

// ── Who sees a plan ──────────────────────────────────────────────────
check("sales see only their own accounts' plans; managers their team's; the billing desk all",
  [canSeePlan(v1, { userId: "rep1", account: { owner: "rep1" } }), canSeePlan(v1, { userId: "rep2", account: { owner: "rep1" } }), canSeePlan(v1, { userId: "lm1", account: { owner: "rep1" }, downline: ["rep1"] }), canSeePlan(v1, { userId: "acc9", billingDesk: true })],
  [true, false, true, true]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
