// Acceptance scenarios for the commercial system (spec §17, 15 tests).
// Each scenario runs against the real pricing / quotation code and reports
//   PASS      proven here
//   PARTIAL   the calculation works; a named piece of the workflow is missing
//   NOT BUILT nothing to run yet (needs the Billing Engine / agreements)
// Run: node scripts/acceptance-commercial.mjs      (exit 1 only if a PASS regresses)
import { resolveUnitPrice, computeLine, computeQuote } from "../src/lib/quotation/pricingEngine.js";
import { billingClassOf, requiredApprovalLevel, rowConfigIssues } from "../src/lib/quotation/commercial.js";
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
scenario(4, "Monthly billing on actual usage (25,000 documents)", "PARTIAL", [usagePrice(wisedox, 25000).amount === 50000],
  "The calculation exists (25,000 × ₹2 = ₹50,000). Gap: no usage records and no invoice run; bills are raised from the quote amount.");
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
  scenario(9, "Minimum monthly commitment", "PARTIAL", [low === 15000, high === 18000],
    "5,000 documents (₹10,000) bills the ₹15,000 minimum; 9,000 documents bills ₹18,000. Gap: applied on quotes, not yet on invoices (no invoice run).");
}
// 10. Pricing revision after approval.
{
  const saved = line(wisedox, 1000);
  const revised = { ...wisedox, listPrice: 3 };
  scenario(10, "Pricing Master revised after approval", "PARTIAL", [saved.unitPriceResolved === 2, resolveUnitPrice(revised, { qty: 1000 }).unitPrice === 3],
    "A saved quote keeps its own line rates (₹2) when the master moves to ₹3. Gap: no contract-level agreement record for billing to read the frozen rate from.");
}
// 11. Customer-specific rates.
scenario(11, "Customer-specific rates", "NOT BUILT", [true],
  "Today a rep reaches a special rate with a discount (approval-controlled). There is no per-customer agreed rate that the next quote or the invoice picks up.");
// 12. Usage reconciliation.
scenario(12, "Usage reconciliation (duplicate / missing / corrected)", "NOT BUILT", [true], "Needs usage records (Billing Engine).");
// 13. Discount approval.
{
  const lv = (d) => requiredApprovalLevel({ needsApproval: d > 10, lines: [{ discountPct: d }], overallDiscountPct: 0 }, { maxUserDiscountPct: 10 })?.label || "no approval";
  scenario(13, "Discount over authority goes for approval", "PASS", [eq([lv(8), lv(15), lv(25)], ["no approval", "Sales Head", "Management"])],
    "8% within the rep's 10% → no approval · 15% → Sales Head · 25% → Management. Levels, ceilings and people are set in Quotation Rules; approving records the approver, date and reason.");
}
// 14. Mixed billing frequency.
scenario(14, "Mixed billing frequency (monthly SaaS + separate usage cycle)", "NOT BUILT", [true], "Needs billing schedules per component (Billing Engine).");
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
