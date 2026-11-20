// Commercial classification, committed vs variable totals, approval levels and
// the A / B / C quotation layout (Phase A). Run: node scripts/test-commercial.mjs
import { billingClassOf, commercialModelOf, productCommercialModel, rowConfigIssues, approvalLevels, maxEffectiveDiscount, requiredApprovalLevel, levelApproverIds, DEFAULT_APPROVAL_LEVELS } from "../src/lib/quotation/commercial.js";
import { computeLine, computeQuote } from "../src/lib/quotation/pricingEngine.js";
import { quoteDocumentHtml } from "../src/lib/quotation/quoteDocument.js";
import { HANS_CATALOGUE } from "../src/data/quotationMasters.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`}`);
};
const text = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script>[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

console.log("\nBilling class");
check("from the pricing model", ["SaaS Subscription", "AMC", "Per-transaction", "PaaS Per-Flight", "One-time Licence", "Implementation"].map((m) => billingClassOf({ pricingModel: m })),
  ["subscription", "subscription", "transaction", "transaction", "one_time", "one_time"]);
check("override on the price row", [billingClassOf({ pricingModel: "Per-transaction", billingClass: "subscription" }), billingClassOf({ pricingModel: "SaaS Subscription", billingClass: "transaction" })], ["subscription", "transaction"]);
check("a one-time model is always one-time", billingClassOf({ pricingModel: "Implementation", billingClass: "transaction" }), "one_time");
check("commercial model", [["subscription"], ["transaction"], ["one_time"], ["subscription", "transaction"], []].map((c) => commercialModelOf(c).label),
  ["SaaS / Subscription", "Transaction-Based", "One-Time / Project", "Hybrid", "Not classified"]);
const byProduct = (id) => productCommercialModel(HANS_CATALOGUE.filter((r) => r.productId === id)).label;
check("products classify themselves from their price rows", [byProduct("AMSIGM"), byProduct("AMSOcean"), byProduct("OrbisOne")], ["Transaction-Based", "Hybrid", "Hybrid"]);
check("inactive rows do not count", productCommercialModel([{ pricingModel: "SaaS Subscription" }, { pricingModel: "Per-transaction", active: false }]).label, "SaaS / Subscription");
check("configuration issues", [rowConfigIssues({ pricingModel: "SaaS Subscription", unit: "User" }), rowConfigIssues({ pricingModel: "", unit: "" }), rowConfigIssues(null)],
  [[], ["no pricing model", "no unit of measurement"], ["Not in the price list"]]);

console.log("\nCommitted and variable totals");
const lines = [
  { name: "ERP", pricingModel: "SaaS Subscription", unitPriceResolved: 2500, qty: 10, months: 12, discountPct: 0 },          // 25,000 a month
  { name: "WiseDox", pricingModel: "Per-transaction", unitPriceResolved: 2, qty: 25000, months: 12, discountPct: 0 },         // 50,000 a month, estimate
  { name: "Tracking", pricingModel: "Per-transaction", unitPriceResolved: 1, qty: 1000, months: 12, discountPct: 0, monthlyMinimum: 5000 },
  { name: "Implementation", pricingModel: "Implementation", unitPriceResolved: 100000, qty: 1, months: 1, discountPct: 0 },
];
const q = computeQuote(lines, {}, { gstRatePct: 18, homeState: "Delhi" });
check("variable line: nothing committed, estimate kept apart", (({ lineTotal, lineEstimate, isVariable }) => [lineTotal, lineEstimate, isVariable])(computeLine(lines[1])), [0, 600000, true]);
check("fixed recurring = subscription + contractual minimum", q.recurringSubtotal, 25000 * 12 + 5000 * 12);
check("one-time", q.oneTimeSubtotal, 100000);
check("total excludes expected volume × rate", [q.subtotal, q.committedTotal, q.tcv], [460000, 460000, 460000 * 1.18]);
check("internal estimate of variable revenue", [q.variableEstimate, q.variableEstimateMonthly, q.variableLineCount], [600000 + 60000, 50000 + 5000, 2]);
check("quote is hybrid", q.commercialModel.label, "Hybrid");
check("a subscription-only quote is unchanged", computeQuote([lines[0]], {}, { gstRatePct: 18 }).subtotal, 300000);
check("overall discount applies to the estimate too", computeQuote([lines[1]], { overallDiscountPct: 10 }, { gstRatePct: 18 }).variableEstimate, 540000);

console.log("\nApproval levels");
const cfg = { maxUserDiscountPct: 10 };
check("standard levels", approvalLevels(cfg).map((l) => [l.label, l.maxDiscountPct]), [["Sales Head", 20], ["Management", 100]]);
check("line and overall discount combine once", [maxEffectiveDiscount([{ discountPct: 10 }], 10), maxEffectiveDiscount([{ discountPct: 15 }, { discountPct: 5 }], 0)], [19, 15]);
const lvl = (d, extra = {}) => requiredApprovalLevel({ needsApproval: true, lines: [{ discountPct: d }], overallDiscountPct: 0, ...extra }, cfg)?.label;
check("15% → Sales Head, 20% → Sales Head, 25% → Management", [lvl(15), lvl(20), lvl(25)], ["Sales Head", "Sales Head", "Management"]);
check("low margin or a no-discount product → Management", lvl(12, { topLevel: true }), "Management");
check("no approval needed → no level", requiredApprovalLevel({ needsApproval: false, lines: [{ discountPct: 5 }] }, cfg), null);
check("configured levels are used", requiredApprovalLevel({ needsApproval: true, lines: [{ discountPct: 22 }] }, { approvalLevels: [{ key: "a", label: "Team lead", maxDiscountPct: 15 }, { key: "b", label: "VP", maxDiscountPct: 30 }, { key: "c", label: "MD", maxDiscountPct: 100 }] }).label, "VP");
const who = { liveUserIds: ["rep", "head", "md", "appr"], generalApproverIds: ["appr"], topRoleUserIds: ["md"] };
check("nobody picked: level 1 = quote approvers + higher, top = top roles", [levelApproverIds(0, cfg, who), levelApproverIds(1, cfg, who)], [["appr", "md"], ["md"]]);
const picked = { approvalLevels: [{ ...DEFAULT_APPROVAL_LEVELS[0], userIds: ["head"] }, { ...DEFAULT_APPROVAL_LEVELS[1], userIds: ["md", "gone"] }] };
check("picked people; a higher level can approve a lower one; leavers ignored", [levelApproverIds(0, picked, who), levelApproverIds(1, picked, who)], [["head", "md"], ["md"]]);

console.log("\nQuotation: A fixed recurring · B variable · C one-time");
const priceRows = [
  { code: "E1", name: "ERP", pricingModel: "SaaS Subscription", unit: "User", rateSource: "Flat", listPrice: 2500 },
  { code: "D1", name: "WiseDox Document Processing", pricingModel: "Per-transaction", unit: "Document", rateSource: "Flat", listPrice: 2 },
  { code: "T1", name: "Tracking", pricingModel: "Per-transaction", unit: "Transaction", rateSource: "Flat", listPrice: 1, monthlyMinimum: 5000 },
  { code: "I1", name: "Implementation", pricingModel: "Implementation", unit: "Fixed", rateSource: "Flat", listPrice: 100000 },
];
const items = [
  { productCode: "E1", name: "ERP", pricingModel: "SaaS Subscription", billingClass: "subscription", unit: "User", qty: 10, months: 12, unitPriceResolved: 2500, discountPct: 0, lineTotal: 300000 },
  { productCode: "D1", name: "WiseDox Document Processing", pricingModel: "Per-transaction", billingClass: "transaction", unit: "Document", qty: 25000, months: 12, unitPriceResolved: 2, discountPct: 0, lineTotal: 0, lineEstimate: 600000 },
  { productCode: "T1", name: "Tracking", pricingModel: "Per-transaction", billingClass: "transaction", unit: "Transaction", qty: 1000, months: 12, unitPriceResolved: 1, discountPct: 0, lineTotal: 60000, monthlyMinimum: 5000 },
  { productCode: "I1", name: "Implementation", pricingModel: "Implementation", billingClass: "one_time", unit: "Fixed", qty: 1, months: 1, unitPriceResolved: 100000, discountPct: 0, lineTotal: 100000 },
];
const doc = { quoteNo: "H1", createdDate: "2026-11-20", items, hans: { party: { name: "Hybrid Customer" }, milestones: [{ name: "With the purchase order", pct: 40 }, { name: "On UAT sign-off", pct: 40 }, { name: "On go-live", pct: 20 }] } };
const t = text(quoteDocumentHtml(doc, { priceRows, catalog: [], autoPrint: false }));
const at = (s) => t.indexOf(s);
check("three lettered sections, in order", [at("A Fixed recurring charges") > 0, at("B Variable charges, billed on actual consumption") > at("A Fixed recurring charges"), at("C One-time charges") > at("B Variable charges")], [true, true, true]);
check("subscription priced", t.includes("ERP Per user per month ₹2,500 10 ₹25,000"), true);
check("variable line: rate and unit only", [t.includes("WiseDox Document Processing Per document ₹2 On actual use"), t.includes("50,000"), t.includes("6,00,000")], [true, false, false]);
check("contractual minimum is a fixed recurring charge", [t.includes("Minimum billing: Tracking Per month ₹5,000"), t.includes("Total fixed recurring charges per month ₹30,000")], [true, true]);
check("GST: on fixed and one-time; variable on each invoice", [t.includes("GST on fixed recurring charges, per month ₹5,400"), t.includes("GST on variable charges On each invoice"), t.includes("GST on one-time charges ₹18,000")], [true, true, true]);
check("says no volume is committed", t.includes("No volume is committed beyond the minimum billing shown."), true);
check("milestones with amounts", t.includes("40% (₹40,000) with the purchase order; 40% (₹40,000) on UAT sign-off; 20% (₹20,000) on go-live."), true);
check("class from the price row when the line has none (older quotes)", text(quoteDocumentHtml({ ...doc, items: items.map(({ billingClass, ...it }) => it) }, { priceRows, catalog: [], autoPrint: false })).includes("B Variable charges, billed on actual consumption"), true);
check("an admin can make a per-transaction row fixed recurring", text(quoteDocumentHtml({ ...doc, items: [{ ...items[1], billingClass: undefined, lineTotal: 600000 }] }, { priceRows: priceRows.map((r) => (r.code === "D1" ? { ...r, billingClass: "subscription" } : r)), catalog: [], autoPrint: false })).includes("A Fixed recurring charges"), true);
const saasOnly = text(quoteDocumentHtml({ ...doc, items: [items[0], items[3]] }, { priceRows, catalog: [], autoPrint: false }));
const wh = [
  { productCode: "WH01", name: "Manpower & Roster Management", pricingModel: "PaaS Per-Flight", billingClass: "transaction", unit: "Flight", qty: 1500, months: 12, unitPriceResolved: 50, discountPct: 0, minMonthFloor: 100000, lineTotal: 1200000 },
  { productCode: "WH06", name: "MIS & Dashboard", pricingModel: "PaaS Per-Flight", billingClass: "transaction", unit: "Flight", qty: 1500, months: 12, unitPriceResolved: 0, discountPct: 0, lineTotal: 0 },
];
const wt = text(quoteDocumentHtml({ ...doc, items: wh, hans: { party: { name: "Handler" } } }, { priceRows: HANS_CATALOGUE, catalog: [], autoPrint: false }));
check("platform floor is a committed minimum (older lines carry minMonthFloor)", [wt.includes("Minimum billing: Manpower & Roster Management Per month ₹1,00,000"), wt.includes("Manpower & Roster Management Per flight ₹50 On actual use")], [true, true]);
check("a ₹0 module prints Included, not On request", [wt.includes("MIS & Dashboard Per flight Included"), wt.includes("Per flight On request")], [true, false]);
check("engine commits the platform floor", computeLine({ pricingModel: "PaaS Per-Flight", unitPriceResolved: 50, qty: 1500, months: 12, minMonthFloor: 100000 }).lineTotal, 1200000);
check("SEZ filing per user is fixed recurring", billingClassOf(HANS_CATALOGUE.find((r) => r.code === "OB18")), "subscription");
check("no variable section when there is none; letters stay in sequence", [saasOnly.includes("Variable charges"), saasOnly.includes("A Fixed recurring charges"), saasOnly.includes("B One-time charges")], [false, true, true]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
