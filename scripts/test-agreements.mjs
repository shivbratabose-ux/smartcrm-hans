// Customer agreements, agreed rates, amendments, price history (Phase B).
// Run: node scripts/test-agreements.mjs
import { buildAgreement, needsAgreement, agreementHash, agreementStatus, listAgreements, activeAgreementLines, agreedUnitPrice, monthlyCharge, fixedMonthly, pricingSnapshot, termEnd } from "../src/lib/quotation/agreements.js";
import { priceChangeSummary, canEditPricing } from "../src/lib/quotation/priceHistory.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`}`);
};

const SLABS = [{ from: 0, rate: 800 }, { from: 201, rate: 700 }, { from: 501, rate: 500 }, { from: 700, rate: 400 }];
const priceRows = [
  { code: "ERP", name: "ERP", pricingModel: "SaaS Subscription", unit: "User", rateSource: "Flat", listPrice: 2500 },
  { code: "DOX", name: "WiseDox", pricingModel: "Per-transaction", unit: "Document", rateSource: "Flat", listPrice: 2, monthlyMinimum: 15000 },
  { code: "HBL", name: "Ocean filing", pricingModel: "Per-transaction", unit: "HBL", rateSource: "Slab", slabs: SLABS },
  { code: "IMP", name: "Implementation", pricingModel: "Implementation", unit: "Fixed", rateSource: "Flat", listPrice: 100000 },
];
const quote = (over = {}) => ({
  id: "q1", quoteNo: "DEL/SQ/0050/2627", version: 1, status: "Accepted", acceptedDate: "2026-12-01", accountId: "accA", currency: "INR", paymentTerms: "30 days",
  billingFrequency: "Monthly",
  items: [
    { productCode: "ERP", name: "ERP", pricingModel: "SaaS Subscription", billingClass: "subscription", unit: "User", qty: 10, months: 12, unitPriceResolved: 2500, discountPct: 10, lineTotal: 270000 },
    { productCode: "DOX", name: "WiseDox", pricingModel: "Per-transaction", billingClass: "transaction", unit: "Document", qty: 25000, months: 12, unitPriceResolved: 2, discountPct: 0, monthlyMinimum: 15000, lineTotal: 180000 },
    { productCode: "HBL", name: "Ocean filing", pricingModel: "Per-transaction", billingClass: "transaction", unit: "HBL", qty: 300, months: 12, unitPriceResolved: 700, discountPct: 0, lineTotal: 0 },
    { productCode: "IMP", name: "Implementation", pricingModel: "Implementation", billingClass: "one_time", unit: "Fixed", qty: 1, months: 1, unitPriceResolved: 100000, discountPct: 0, lineTotal: 100000 },
  ],
  hans: { party: { name: "Customer A" }, overallDiscountPct: 0, milestones: [{ name: "With the order", pct: 50 }, { name: "On go-live", pct: 50 }] },
  ...over,
});

console.log("\nAgreement from an accepted quote");
const q1 = quote();
const a = buildAgreement(q1, { priceRows, today: "2026-12-05", now: "2026-12-05T00:00:00Z" });
check("only accepted engine quotes need one", [needsAgreement(q1), needsAgreement({ ...q1, status: "Sent" }), needsAgreement({ ...q1, hans: null }), needsAgreement({ ...q1, isDeleted: true })], [true, false, false, false]);
check("header", [a.agreementNo, a.status, a.startDate, a.endDate, a.accountId, a.commercialModel.label, a.paymentTerms], ["DEL/SQ/0050/2627", "Active", "2026-12-01", "2027-11-30", "accA", "Hybrid", "30 days"]);
check("each line keeps class, unit, list rate, discount and agreed rate", a.lines.map((l) => [l.code, l.billingClass, l.unit, l.listRate, l.discountPct, l.netRate]),
  [["ERP", "subscription", "User", 2500, 10, 2250], ["DOX", "transaction", "Document", 2, 0, 2], ["HBL", "transaction", "HBL", 700, 0, 700], ["IMP", "one_time", "Fixed", 100000, 0, 100000]]);
check("slabs and minimum are snapshotted into the agreement", [a.lines[2].pricing.slabs.length, a.lines[2].pricing.slabMode, a.lines[1].monthlyMinimum, a.lines[1].pricing.monthlyMinimum], [4, "volume", 15000, 15000]);
check("line dates; one-time has no term", a.lines.map((l) => [l.effectiveFrom, l.effectiveTo]), [["2026-12-01", "2027-11-30"], ["2026-12-01", "2027-11-30"], ["2026-12-01", "2027-11-30"], ["2026-12-01", ""]]);
check("milestones carried", a.milestones.map((m) => m.pct), [50, 50]);
check("fixed monthly = subscription + minimum", fixedMonthly(a), 2250 * 10 + 15000);
check("overall discount is folded into the agreed rate, once", buildAgreement(quote({ hans: { overallDiscountPct: 10 } }), { priceRows }).lines[0], { ...a.lines[0], discountPct: 19, netRate: 2025 });
const withA = { ...q1, agreement: a };
check("stable once created", [needsAgreement(withA), agreementHash(withA) === a.sourceHash], [false, true]);
check("terms changed on the accepted quote → refresh, keeping the start date", (() => { const ch = { ...withA, items: withA.items.map((l, i) => (i ? l : { ...l, qty: 15 })) }; return [needsAgreement(ch), buildAgreement(ch, { priceRows, today: "2027-03-01" }).startDate]; })(), [true, "2026-12-01"]);
check("term end", [termEnd("2026-12-01", 12), termEnd("2027-01-31", 1), termEnd("2026-12-01", 0)], ["2027-11-30", "2027-02-27", ""]);
check("no snapshot for a plain flat row", pricingSnapshot(priceRows[0]), null);

console.log("\nTEST 10: the price list changes after acceptance");
const dearer = priceRows.map((r) => (r.code === "ERP" ? { ...r, listPrice: 3200 } : r.code === "HBL" ? { ...r, slabs: SLABS.map((s) => ({ ...s, rate: s.rate + 100 })) } : r));
check("agreement keeps ₹2,250 while the list moves to ₹3,200", [agreedUnitPrice(a.lines[0], 10), dearer[0].listPrice], [2250, 3200]);
check("agreed slabs are the old ones", [100, 300, 600, 900].map((v) => agreedUnitPrice(a.lines[2], v)), [800, 700, 500, 400]);
check("rebuilding from the same quote with the new price list changes nothing agreed", buildAgreement(withA, { priceRows: dearer }).lines.map((l) => l.netRate), [2250, 2, 700, 100000]);

console.log("\nTEST 11: customer-specific rates");
const qB = quote({ id: "q2", quoteNo: "BOM/SQ/0007/2627", accountId: "accB", acceptedDate: "2026-11-10", items: [{ ...q1.items[0], discountPct: 20, lineTotal: 240000 }], hans: { party: { name: "Customer B" } } });
const all = [withA, { ...qB, agreement: buildAgreement(qB, { priceRows }) }];
const rateFor = (acc, date = "2026-12-15") => activeAgreementLines(all, acc, date).ERP?.line.netRate ?? null;
check("A pays ₹2,250, B pays ₹2,000, a new customer has no agreed rate", [rateFor("accA"), rateFor("accB"), rateFor("accC")], [2250, 2000, null]);
check("not before the agreement starts, not after the term ends", [rateFor("accA", "2026-11-30"), rateFor("accA", "2027-12-01")], [null, null]);
check("agreements listed newest first with status", listAgreements(all, "2026-12-15").map((x) => [x.agreement.agreementNo, x.status]), [["DEL/SQ/0050/2627", "Active"], ["BOM/SQ/0007/2627", "Active"]]);

console.log("\nAmendment: an accepted revision supersedes");
const rev = quote({ id: "q1r", version: 2, supersedesQuoteId: "q1", acceptedDate: "2027-03-01", items: [{ ...q1.items[0], qty: 25, discountPct: 20, lineTotal: 600000 }, q1.items[1]] });
const revA = { ...rev, agreement: buildAgreement(rev, { priceRows }) };
const chain = [withA, revA];
check("revision's agreement", [revA.agreement.agreementNo, revA.agreement.amends, revA.agreement.startDate], ["DEL/SQ/0050/2627-v2", "q1", "2027-03-01"]);
check("the earlier version is superseded, kept as history", [agreementStatus(withA, chain, "2027-03-15"), agreementStatus(revA, chain, "2027-03-15")], ["Superseded", "Active"]);
check("rates in force come from the revision; dropped components no longer apply", (() => { const m = activeAgreementLines(chain, "accA", "2027-03-15"); return [m.ERP.line.netRate, m.ERP.line.qty, !!m.DOX, !!m.HBL]; })(), [2000, 25, true, false]);
check("a second quotation for the same customer adds its components", (() => {
  const extra = quote({ id: "q3", quoteNo: "DEL/SQ/0061/2627", acceptedDate: "2027-01-15", items: [{ productCode: "TRK", name: "Tracking", pricingModel: "Per-transaction", billingClass: "transaction", unit: "Transaction", qty: 1000, months: 12, unitPriceResolved: 1, discountPct: 0, lineTotal: 0 }] });
  const m = activeAgreementLines([withA, { ...extra, agreement: buildAgreement(extra, { priceRows }) }], "accA", "2027-02-01");
  return Object.keys(m).sort();
})(), ["DOX", "ERP", "HBL", "IMP", "TRK"]);
check("ended and cancelled", [agreementStatus(withA, [withA], "2027-12-01"), agreementStatus({ ...withA, status: "Rejected" }, [], "2026-12-15")], ["Ended", "Cancelled"]);

console.log("\nMonthly charge under an agreement (used by the Billing Engine)");
check("subscription: agreed rate × committed quantity", monthlyCharge(a.lines[0]).amount, 22500);
check("variable: actual volume × agreed rate", monthlyCharge(a.lines[1], 25000), { amount: 50000, usage: 50000, minimum: 15000, minimumApplied: false, basis: "actual", qty: 25000 });
check("variable below the minimum bills the minimum", [monthlyCharge(a.lines[1], 5000).amount, monthlyCharge(a.lines[1], 5000).minimumApplied], [15000, true]);
check("variable on agreed slabs, by the actual volume", [150, 300, 800].map((v) => monthlyCharge(a.lines[2], v).amount), [150 * 800, 300 * 700, 800 * 400]);
check("one-time is billed by milestone, not monthly", monthlyCharge(a.lines[3]).amount, 0);

console.log("\nPrice history and pricing owners");
check("price change in words", priceChangeSummary({ section: "price", change: "changed", before: { code: "ERP", listPrice: 2500, active: true }, after: { code: "ERP", listPrice: 3200, active: true } }), ["List price: ₹2,500 → ₹3,200"]);
check("slab change", priceChangeSummary({ section: "price", change: "changed", before: { slabs: [{ from: 0, rate: 800 }] }, after: { slabs: [{ from: 0, rate: 900 }] } }), ["Slabs: 0+ ₹800 → 0+ ₹900"]);
check("added / removed", [priceChangeSummary({ section: "price", change: "added", after: { listPrice: 30 } }), priceChangeSummary({ section: "price", change: "removed", before: {} })], [["Added at ₹30"], ["Removed"]]);
check("rules change lists the settings", priceChangeSummary({ section: "quoteConfig", change: "changed", before: { maxUserDiscountPct: 10, gstRatePct: 18 }, after: { maxUserDiscountPct: 12, gstRatePct: 18 } }), ["maxUserDiscountPct: 10 → 12"]);
const rep = { id: "rep", role: "line_mgr" }, owner = { id: "po", role: "line_mgr" }, md = { id: "md", role: "md" };
check("no owners named → as before", canEditPricing({}, rep), true);
check("owners named → only they, Admin and MD", [canEditPricing({ pricingOwnerIds: ["po"] }, rep), canEditPricing({ pricingOwnerIds: ["po"] }, owner), canEditPricing({ pricingOwnerIds: ["po"] }, md), canEditPricing({ pricingOwnerIds: ["po"] }, null)], [false, true, true, false]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
