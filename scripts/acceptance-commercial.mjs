// Acceptance scenarios for the commercial system (spec §17, 15 tests).
// Each scenario runs against the real pricing / quotation code and reports
//   PASS      proven here
//   PARTIAL   the calculation works; a named piece of the workflow is missing
//   NOT BUILT nothing to run yet (needs the Billing Engine / agreements)
// Run: node scripts/acceptance-commercial.mjs      (exit 1 only if a PASS regresses)
import { resolveUnitPrice, computeLine, computeQuote } from "../src/lib/quotation/pricingEngine.js";
import { billingClassOf, requiredApprovalLevel, rowConfigIssues } from "../src/lib/quotation/commercial.js";
import { buildAgreement, activeAgreementLines, agreedUnitPrice, monthlyCharge } from "../src/lib/quotation/agreements.js";
import { previewInvoices, reconcileUsage, correctUsage, finaliseProblems, finalise } from "../src/lib/billing/engine.js";
import { usagePrice, graduatedCost } from "../src/lib/quotation/slabs.js";
import { quoteDocumentHtml } from "../src/lib/quotation/quoteDocument.js";
import { HANS_CATALOGUE } from "../src/data/quotationMasters.js";
import { INIT_PRODUCT_CATALOG } from "../src/data/seed.js";

const results = [];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const text = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script>[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const scenario = (no, title, status, checks, note) => results.push({ no, title, status, ok: checks.every(Boolean), note });

// Sample rows, as an administrator would configure them in the Pricing Master.
const USER_SLABS = [{ from: 0, rate: 1000 }, { from: 11, rate: 850 }, { from: 26, rate: 700 }, { from: 51, rate: 550 }];
const TXN_SLABS = [{ from: 0, rate: 3 }, { from: 5001, rate: 2.5 }, { from: 15001, rate: 2 }, { from: 50001, rate: 1.5 }];
const saas = { code: "T-SAAS", name: "ERP subscription", pricingModel: "SaaS Subscription", unit: "User", rateSource: "Slab", slabs: USER_SLABS };
const wisedox = { code: "T-DOX", name: "WiseDox Document Processing", pricingModel: "Per-transaction", unit: "Document", rateSource: "Flat", listPrice: 2, productId: "WiseDox" };
const txnVolume = { code: "T-TXN", name: "Transactions", pricingModel: "Per-transaction", unit: "Transaction", rateSource: "Slab", slabs: TXN_SLABS, slabMode: "volume" };
const txnProgressive = { ...txnVolume, slabMode: "graduated" };
const impl = { code: "T-IMPL", name: "Implementation", pricingModel: "Implementation", unit: "Fixed", rateSource: "Flat", listPrice: 100000 };
const orbis = HANS_CATALOGUE.find((r) => r.code === "OB01");
const line = (row, qty, months = 12) => {
  const unit = resolveUnitPrice(row, { qty }).unitPrice;
  return { productCode: row.code, name: row.name, pricingModel: row.pricingModel, billingClass: billingClassOf(row), unit: row.unit, qty, months, unitPriceResolved: unit, discountPct: 0, monthlyMinimum: row.monthlyMinimum || 0, ...computeLine({ pricingModel: row.pricingModel, unitPriceResolved: unit, qty, months, minQty: row.minQty, monthlyMinimum: row.monthlyMinimum }) };
};

// 1. SaaS quotation: Orbis One, 10 users, rate from the Pricing Master.
{
  const l = line(orbis, 10);
  scenario(1, "SaaS quotation (Orbis One, 10 users)", "PASS", [l.unitPriceResolved === orbis.listPrice, l.lineTotal === 10 * orbis.listPrice * 12],
    `₹${orbis.listPrice} per user from the price list → ₹${(10 * orbis.listPrice).toLocaleString("en-IN")} a month`);
}
// 2. SaaS volume discount: 10 → 50 users picks the new slab.
{
  const r = [10, 25, 50].map((q) => resolveUnitPrice(saas, { qty: q }).unitPrice);
  scenario(2, "SaaS volume slab (10 → 50 users)", "PASS", [eq(r, [1000, 850, 700])],
    "User slabs on a subscription row: 10 users ₹1,000 · 25 users ₹850 · 50 users ₹700. (Orbis One itself has one flat rate today; slabs are a setting on its price row.)");
}
// 3. Transaction quotation shows the unit rate, not qty × rate.
{
  const t = text(quoteDocumentHtml({ quoteNo: "A3", createdDate: "2026-11-20", items: [{ ...line(wisedox, 25000), }], hans: { party: { name: "C" } } },
    { priceRows: [wisedox], catalog: INIT_PRODUCT_CATALOG, autoPrint: false }));
  const q3 = computeQuote([line(wisedox, 25000)], {}, { gstRatePct: 18 });
  scenario(3, "Transaction quotation shows the rate only", "PASS", [t.includes("Per document ₹2 On actual use"), !t.includes("50,000"), !/Estimate at/.test(t), q3.grandTotal === 0, q3.variableEstimateMonthly === 50000],
    "Customer document: ₹2 per document, 'on actual use', no 25,000 × ₹2. Quote total and TCV: ₹0 committed; the ₹50,000 a month is an internal estimate only.");
}
// 4. Monthly billing on actual usage.
// An accepted quote becomes the customer's agreement; billing reads its frozen lines.
const accepted = (id, accountId, rows, extra = {}) => {
  const q = { id, quoteNo: `Q-${id}`, version: 1, status: "Accepted", acceptedDate: "2026-12-01", accountId, currency: "INR", items: rows, hans: { party: { name: accountId } }, ...extra };
  return { ...q, agreement: buildAgreement(q, { priceRows: [wisedox, { ...wisedox, code: "T-DOXMIN", monthlyMinimum: 15000 }], today: "2026-12-01" }) };
};
const doxAgreement = accepted("a4", "custA", [line(wisedox, 25000)]);
const GST = { gstRatePct: 18, homeState: "Delhi" };
const usageRec = (quoteId, lineCode, period, quantity, extra = {}) => ({ id: `${quoteId}-${lineCode}-${period}-${quantity}-${extra.externalRef || ""}`, quoteId, lineCode, period, quantity, externalRef: "", status: "approved", ...extra });
{
  const rec = reconcileUsage([usageRec("a4", "T-DOX", "2026-12", 25000, { externalRef: "DEC-REPORT" })], [{ quoteId: "a4", lineCode: "T-DOX", period: "2026-12" }]);
  const inv = previewInvoices(doxAgreement, "2026-12", rec.totals, { config: GST })[0];
  const m = inv.lines[0].calc.months[0];
  scenario(4, "Monthly billing on actual usage (25,000 documents)", "PASS",
    [rec.ready, inv.lines[0].qty === 25000, inv.lines[0].amount === 50000, inv.taxable === 50000, inv.gst === 9000, inv.total === 59000, inv.period === "2026-12", m.usage === 50000, inv.agreementNo === "Q-a4"],
    "The December run takes the approved usage (25,000 documents), prices it at the agreement's ₹2 and produces the invoice: ₹50,000 + GST ₹9,000 = ₹59,000, with period, rate, quantity and working on the line.");
}
// 5. Progressive slab, 20,000 transactions.
scenario(5, "Progressive slab (20,000 transactions)", "PASS", [graduatedCost(20000, TXN_SLABS) === 5000 * 3 + 10000 * 2.5 + 5000 * 2, usagePrice(txnProgressive, 20000).amount === 50000],
  "5,000 × ₹3 + 10,000 × ₹2.50 + 5,000 × ₹2 = ₹50,000");
// 6. Volume slab, 20,000 transactions.
scenario(6, "Volume slab (20,000 transactions)", "PASS", [usagePrice(txnVolume, 20000).amount === 40000],
  "20,000 × ₹2 = ₹40,000");
// 7. One-time project with milestones.
{
  const ms = [{ name: "Advance with the order", pct: 40 }, { name: "On UAT sign-off", pct: 40 }, { name: "On go-live", pct: 20 }];
  const t = text(quoteDocumentHtml({ quoteNo: "A7", createdDate: "2026-11-20", items: [line(impl, 1, 1)], hans: { party: { name: "C" }, milestones: ms } },
    { priceRows: [impl], catalog: INIT_PRODUCT_CATALOG, autoPrint: false }));
  scenario(7, "One-time project with milestone terms", "PASS", [t.includes("One-time charges"), t.includes("₹1,00,000"), t.includes("40% (₹40,000) advance with the order; 40% (₹40,000) on UAT sign-off; 20% (₹20,000) on go-live.")],
    "₹1,00,000 one time; milestones 40 / 40 / 20% are a schedule on the quote, printed with their amounts. (Invoicing each stage comes with the Billing Engine.)");
}
// 8. Hybrid quotation keeps the classifications apart.
{
  const ams = HANS_CATALOGUE.find((r) => r.code === "AMS04");
  const items = [line(orbis, 10), line(wisedox, 25000), line(ams, 500), line(impl, 1, 1)];
  const html = quoteDocumentHtml({ quoteNo: "A8", createdDate: "2026-11-20", hosting: "Hans", items, hans: { party: { name: "C" } } },
    { priceRows: [...HANS_CATALOGUE, wisedox, impl], catalog: INIT_PRODUCT_CATALOG, autoPrint: false });
  const t = text(html);
  const q8 = computeQuote(items, {}, { gstRatePct: 18 });
  scenario(8, "Hybrid quotation (SaaS + two usage services + one-time)", "PASS",
    [t.includes("A Fixed recurring charges"), t.includes("B Variable charges, billed on actual consumption"), t.includes("C One-time charges"), t.includes("WiseDox Document Processing Per document ₹2"), t.includes("Air Consol Filing Per HAWB ₹30"), !t.includes("50,000"),
      eq(items.map((i) => i.billingClass), ["subscription", "transaction", "transaction", "one_time"]), q8.commercialModel.label === "Hybrid", q8.subtotal === 10 * orbis.listPrice * 12 + 100000],
    "One document; each line keeps its class (fixed recurring, variable, variable, one-time); sections A / B / C; the total is subscription + one-time only.");
}
// 9. Minimum commitment.
{
  const row = { ...wisedox, monthlyMinimum: 15000 };
  const low = Math.max(usagePrice(row, 5000).amount, usagePrice(row, 5000).floor), high = Math.max(usagePrice(row, 9000).amount, usagePrice(row, 9000).floor);
  const minAgr = accepted("a9", "custA", [line({ ...row, code: "T-DOXMIN" }, 5000)]).agreement.lines[0];
  const minQuote = accepted("a9", "custA", [line({ ...row, code: "T-DOXMIN" }, 5000)]);
  const bill = (qty) => previewInvoices(minQuote, "2026-12", { "a9|T-DOXMIN|2026-12": qty }, { config: GST })[0].lines[0];
  scenario(9, "Minimum monthly commitment", "PASS", [low === 15000, high === 18000, monthlyCharge(minAgr, 5000).amount === 15000, bill(5000).amount === 15000, bill(5000).calc.months[0].minimumApplied === true, bill(9000).amount === 18000, bill(9000).calc.months[0].minimumApplied === false],
    "On the invoice: 5,000 documents (₹10,000 at ₹2) is billed at the agreed ₹15,000 minimum and says so; 9,000 documents is billed at ₹18,000.");
}
// 10. Pricing revision after approval.
{
  const saved = line(wisedox, 1000);
  const revised = { ...wisedox, listPrice: 3 };
  const agr = accepted("a10", "custA", [saved]);
  scenario(10, "Pricing Master revised after approval", "PASS", [saved.unitPriceResolved === 2, resolveUnitPrice(revised, { qty: 1000 }).unitPrice === 3, agreedUnitPrice(agr.agreement.lines[0], 1000) === 2,
    activeAgreementLines([agr], "custA", "2027-01-15")["T-DOX"].line.netRate === 2],
    "The accepted quote is kept as the customer's agreement at ₹2. The price list moves to ₹3 for new customers; this agreement, and anything billed under it, stays at ₹2.");
}
// 11. Customer-specific rates.
{
  const a = accepted("a11a", "custA", [{ ...line(wisedox, 1000), discountPct: 0 }]);
  const b = accepted("a11b", "custB", [{ ...line(wisedox, 1000), discountPct: 25 }]);
  const rate = (acc) => activeAgreementLines([a, b], acc, "2027-01-15")["T-DOX"]?.line.netRate ?? null;
  scenario(11, "Customer-specific rates", "PASS", [rate("custA") === 2, rate("custB") === 1.5, rate("custC") === null],
    "Customer A's agreement is ₹2 per document, Customer B's is ₹1.50; a new customer gets the price list. A new quote for A or B starts from their agreed rate.");
}
// 12. Usage reconciliation.
{
  const need = [{ quoteId: "a4", lineCode: "T-DOX", period: "2026-12" }];
  const kinds = (recs) => reconcileUsage(recs, need).issues.map((i) => `${i.level}:${i.type}`);
  const dup = [usageRec("a4", "T-DOX", "2026-12", 25000, { externalRef: "DEC-REPORT" }), usageRec("a4", "T-DOX", "2026-12", 25000, { externalRef: "DEC-REPORT", id: "second" })];
  const orig = usageRec("a4", "T-DOX", "2026-12", 25000);
  const { voided, correction } = correctUsage(orig, 24000, { by: "fin", at: "2027-01-03", id: "corr" });
  const fixed = reconcileUsage([voided, { ...correction, status: "approved" }], need);
  const blocked = previewInvoices(doxAgreement, "2026-12", {}, { config: GST })[0];
  const inv = finalise(previewInvoices(doxAgreement, "2026-12", fixed.totals, { config: GST })[0], { by: "fin" });
  scenario(12, "Usage reconciliation (duplicate / missing / corrected)", "PASS",
    [eq(kinds([]), ["blocking:missing"]), eq(kinds(dup), ["blocking:duplicate"]), eq(kinds([{ ...orig, status: "draft" }]), ["blocking:missing", "blocking:unapproved"]),
      fixed.ready, fixed.totals["a4|T-DOX|2026-12"] === 24000, eq(fixed.issues.map((i) => i.type), ["corrected"]), finaliseProblems(blocked).length === 1, inv.taxable === 48000,
      previewInvoices(doxAgreement, "2026-12", fixed.totals, { config: GST, invoices: [inv] }).length === 0],
    "Before an invoice can be finalised: missing usage blocks it, the same reference twice is a duplicate, an unapproved entry blocks, and a correction (25,000 → 24,000) voids the original and bills ₹48,000. Once final, the month cannot be invoiced again.");
}
// 13. Discount approval.
{
  const lv = (d) => requiredApprovalLevel({ needsApproval: d > 10, lines: [{ discountPct: d }], overallDiscountPct: 0 }, { maxUserDiscountPct: 10 })?.label || "no approval";
  scenario(13, "Discount over authority goes for approval", "PASS", [eq([lv(8), lv(15), lv(25)], ["no approval", "Line Manager", "Management Committee"])],
    "8% within the rep's 10% → no approval · 15% → Line Manager · 25% → Management Committee. Levels, ceilings and people are set in Quotation Rules; approving records the approver, date and reason.");
}
// 14. Mixed billing frequency.
{
  const hybrid = accepted("a14", "custA", [line(orbis, 10), line(wisedox, 25000)]);
  const mixed = { ...hybrid, agreement: { ...hybrid.agreement, billing: { subscriptionFrequency: "Monthly", usageFrequency: "Quarterly", separateUsageInvoice: true } } };
  const u = { "a14|T-DOX|2026-12": 25000, "a14|T-DOX|2027-01": 20000, "a14|T-DOX|2027-02": 30000 };
  const run = (p) => previewInvoices(mixed, p, u, { config: GST }).map((i) => [i.cycle, i.taxable]);
  const saas = 10 * orbis.listPrice;
  scenario(14, "Mixed billing frequency (monthly SaaS + separate usage cycle)", "PASS",
    [eq(run("2026-12"), [["subscription", saas]]), eq(run("2027-01"), [["subscription", saas]]), eq(run("2027-02"), [["subscription", saas], ["usage", 150000]])],
    `SaaS is invoiced every month (₹${saas.toLocaleString("en-IN")}); usage is on its own quarterly cycle: nothing in December or January, then one usage invoice in February for the quarter (25,000 + 20,000 + 30,000 documents = ₹1,50,000), each month priced on its own volume.`);
}
// 15. Missing product configuration.
{
  const blank = { code: "T-NONE", name: "Unpriced product", pricingModel: "SaaS Subscription", unit: "User", rateSource: "Flat", listPrice: null };
  scenario(15, "Missing pricing configuration is flagged", "PASS", [resolveUnitPrice(blank, { qty: 5 }).missingRate === true, resolveUnitPrice({ ...txnVolume, slabs: [] }, { qty: 5 }).missingRate === true, rowConfigIssues({ pricingModel: "SaaS Subscription", unit: "" }).length === 1],
    "No rate → the quote cannot be saved. Incomplete configuration (no unit / model) → the quote needs an approver's sign-off with a reason, and stays a draft until then.");
}

const icon = { PASS: "✅", PARTIAL: "🟡", "NOT BUILT": "⬜" };
let regress = 0;
for (const r of results) {
  const bad = !r.ok;
  if (bad) regress++;
  console.log(`${bad ? "❌" : icon[r.status]} TEST ${String(r.no).padStart(2)} ${r.status.padEnd(9)} ${r.title}\n      ${bad ? "CHECK FAILED — " : ""}${r.note}`);
}
const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\n${count("PASS")} pass · ${count("PARTIAL")} partial · ${count("NOT BUILT")} not built · ${regress} failed checks`);
process.exit(regress ? 1 : 0);
