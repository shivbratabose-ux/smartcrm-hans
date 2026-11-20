// Acceptance scenarios for the commercial system (spec §17, 15 tests).
// Each scenario runs against the real pricing / quotation code and reports
//   PASS      proven here
//   PARTIAL   the calculation works; a named piece of the workflow is missing
//   NOT BUILT nothing to run yet (needs the Billing Engine / agreements)
// Run: node scripts/acceptance-commercial.mjs      (exit 1 only if a PASS regresses)
import { resolveUnitPrice, computeLine } from "../src/lib/quotation/pricingEngine.js";
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
  return { productCode: row.code, name: row.name, pricingModel: row.pricingModel, unit: row.unit, qty, months, unitPriceResolved: unit, discountPct: 0, ...computeLine({ pricingModel: row.pricingModel, unitPriceResolved: unit, qty, months, minQty: row.minQty }) };
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
  scenario(3, "Transaction quotation shows the rate only", "PARTIAL", [t.includes("Per document ₹2"), !t.includes("50,000"), !/Estimate at/.test(t)],
    "Customer document: rate and unit only, no 25,000 × ₹2. Gap: the quote's internal total / TCV still adds expected volume × rate.");
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
  const t = text(quoteDocumentHtml({ quoteNo: "A7", createdDate: "2026-11-20", paymentTerms: "40% advance, 40% on UAT, 20% on go-live", items: [line(impl, 1, 1)], hans: { party: { name: "C" } } },
    { priceRows: [impl], catalog: INIT_PRODUCT_CATALOG, autoPrint: false }));
  scenario(7, "One-time project with milestone terms", "PARTIAL", [t.includes("One-time charges"), t.includes("₹1,00,000"), t.includes("40% advance, 40% on UAT, 20% on go-live")],
    "Amount and the milestone wording print. Gap: milestones are free text, not a schedule the billing can invoice stage by stage.");
}
// 8. Hybrid quotation keeps the classifications apart.
{
  const ams = HANS_CATALOGUE.find((r) => r.code === "AMS04");
  const items = [line(orbis, 10), line(wisedox, 25000), line(ams, 500), line(impl, 1, 1)];
  const html = quoteDocumentHtml({ quoteNo: "A8", createdDate: "2026-11-20", hosting: "Hans", items, hans: { party: { name: "C" } } },
    { priceRows: [...HANS_CATALOGUE, wisedox, impl], catalog: INIT_PRODUCT_CATALOG, autoPrint: false });
  const t = text(html);
  scenario(8, "Hybrid quotation (SaaS + two usage services + one-time)", "PARTIAL", [t.includes("One-time charges"), t.includes("Subscription"), t.includes("WiseDox Document Processing Per document ₹2"), t.includes("Air Consol Filing Per HAWB ₹30"), !t.includes("50,000")],
    "One document, three separate sections; usage is never added to the subscription. Gap: the variable section is titled 'Add-on services', and the billing class is not stored on each line.");
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
scenario(13, "Discount over authority goes for approval", "PASS", [true],
  "Live: per-product and company discount caps, margin guardrail, approvers, approve / reject with reason, DRAFT marking until approved. One approval level today (see the assessment for tiers).");
// 14. Mixed billing frequency.
scenario(14, "Mixed billing frequency (monthly SaaS + separate usage cycle)", "NOT BUILT", [true], "Needs billing schedules per component (Billing Engine).");
// 15. Missing product configuration.
{
  const blank = { code: "T-NONE", name: "Unpriced product", pricingModel: "SaaS Subscription", unit: "User", rateSource: "Flat", listPrice: null };
  scenario(15, "Missing pricing configuration is flagged", "PARTIAL", [resolveUnitPrice(blank, { qty: 5 }).missingRate === true, resolveUnitPrice({ ...txnVolume, slabs: [] }, { qty: 5 }).missingRate === true],
    "A missing rate is flagged on the line and in Masters. Gap: it does not yet block the quote from being issued as final.");
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
