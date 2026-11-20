// Usage pricing for data-processing services: volume / graduated slabs,
// monthly / yearly slab basis, prepaid pack + overage, monthly minimum,
// pooled volume, yearly escalation. Run: node scripts/test-usage-pricing.mjs
import { usagePrice, graduatedCost, escalationMonths, escalatedRates, poolVolumes, usageRuleText, hasUsageRules } from "../src/lib/quotation/slabs.js";
import { resolveUnitPrice, computeLine, computeQuote } from "../src/lib/quotation/pricingEngine.js";
import { quoteDocumentHtml } from "../src/lib/quotation/quoteDocument.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`}`);
};
const r2 = (v) => Math.round(v * 100) / 100;
const text = (html) => html.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<script>[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const SLABS = [{ from: 0, rate: 800 }, { from: 201, rate: 700 }, { from: 501, rate: 500 }, { from: 700, rate: 400 }];
const base = { code: "X1", name: "Filing", pricingModel: "Per-transaction", unit: "HBL", rateSource: "Slab", slabs: SLABS };

// Line through the engine, the way the builder prices it.
const price = (row, qty, months = 1, extra = {}) => {
  const up = usagePrice(row, qty, extra);
  const unit = resolveUnitPrice(row, { qty, poolQty: extra.poolQty }).unitPrice;
  return computeLine({ pricingModel: row.pricingModel, unitPriceResolved: unit, qty, months, discountPct: extra.discountPct || 0, monthlyMinimum: up.floor, escalationPct: row.escalationPct });
};

console.log("\n1. Volume slab (whole month at its slab's rate)");
check("300/month → all at ₹700", usagePrice(base, 300).amount, 210000);
check("engine agrees", price(base, 300).lineTotal, 210000);

console.log("\n2. Graduated slab (each band at its own rate)");
const grad = { ...base, slabMode: "graduated" };
check("cost of 300 = 200×800 + 100×700", graduatedCost(300, SLABS), 200 * 800 + 100 * 700);
check("cost of 800 = 200×800 + 300×700 + 199×500 + 101×400", graduatedCost(800, SLABS), 200 * 800 + 300 * 700 + 199 * 500 + 101 * 400);
check("monthly amount (graduated)", usagePrice(grad, 300).amount, 230000);
check("engine: average unit price × qty = graduated total", r2(price(grad, 300).lineTotal), 230000);
check("below the first band", usagePrice(grad, 50).amount, 40000);

console.log("\n3. Slab on yearly volume");
const yearly = { ...base, slabPeriod: "year", slabs: [{ from: 0, rate: 10 }, { from: 100000, rate: 8 }] };
check("9,000/month = 1,08,000/year → ₹8 slab", usagePrice(yearly, 9000).rate, 8);
check("8,000/month = 96,000/year → ₹10 slab", usagePrice(yearly, 8000).rate, 10);

console.log("\n4. Prepaid pack + overage");
const pack = { code: "P1", name: "Document reading", pricingModel: "Per-transaction", unit: "Page", rateSource: "Flat", listPrice: 10, packQty: 10000, packPrice: 80000 };
check("within the pack → pack price", usagePrice(pack, 6000).amount, 80000);
check("over the pack → pack + overage", usagePrice(pack, 12500).amount, 80000 + 2500 * 10);
check("engine: within pack", price(pack, 6000).lineTotal, 80000);
check("engine: over pack", price(pack, 12500).lineTotal, 105000);
check("engine: no usage still bills the pack", price(pack, 0).lineTotal, 80000);
check("pack + slab overage", usagePrice({ ...pack, rateSource: "Slab", slabs: [{ from: 0, rate: 10 }, { from: 12000, rate: 6 }] }, 12500).amount, 80000 + 2500 * 6);

console.log("\n5. Monthly minimum");
const minRow = { ...pack, packQty: 0, packPrice: 0, monthlyMinimum: 15000 };
check("low usage → minimum", price(minRow, 1000).lineTotal, 15000);
check("high usage → actual", price(minRow, 2000).lineTotal, 20000);
check("12 months at the minimum", price(minRow, 100, 12).lineTotal, 180000);
check("one-time rows ignore the minimum", computeLine({ pricingModel: "Implementation", unitPriceResolved: 100, qty: 1, months: 1, monthlyMinimum: 5000 }).lineTotal, 100);
check("existing rows unchanged (no minimum)", computeLine({ pricingModel: "Per-transaction", unitPriceResolved: 30, qty: 10, months: 12 }).lineTotal, 3600);

console.log("\n6. Pooled volume");
const igm = { code: "A5", name: "IGM", pricingModel: "Per-transaction", unit: "Flight", rateSource: "Slab", pool: "AMS manifests", slabs: [{ from: 0, rate: 185 }, { from: 500, rate: 150 }] };
const egm = { ...igm, code: "A6", name: "EGM" };
const rows = { A5: igm, A6: egm };
const pools = poolVolumes([{ productCode: "A5", qty: 300 }, { productCode: "A6", qty: 250 }], (c) => rows[c]);
check("pool total", pools, { "AMS manifests": 550 });
check("alone each is ₹185; pooled 550 → ₹150", [usagePrice(igm, 300).rate, usagePrice(igm, 300, { poolQty: 550 }).rate, usagePrice(egm, 250, { poolQty: 550 }).amount], [185, 150, 250 * 150]);

console.log("\n7. Yearly escalation");
check("rates by year at 10%", escalatedRates(1000, 10, 3), [1000, 1100, 1210]);
check("36 months = 12 + 13.2 + 14.52 month-equivalents", r2(escalationMonths(36, 10)), 39.72);
check("18 months = 12 + 6×1.1", r2(escalationMonths(18, 10)), 18.6);
check("12 months: no effect", escalationMonths(12, 10), 12);
const esc = { ...minRow, monthlyMinimum: 0, escalationPct: 10 };
check("engine: 1,000 pages × ₹10 for 24 months at +10% from year 2", r2(price(esc, 1000, 24).lineTotal), 10000 * 12 + 11000 * 12);
const q = computeQuote([{ ...esc, unitPriceResolved: 10, qty: 1000, months: 24, escalationPct: 10 }], {});
check("quote total carries the escalation", r2(q.recurringSubtotal ?? q.subtotal ?? q.netTotal ?? 0) > 240000, true);

console.log("\n8. On the quotation");
const priceRows = [grad, pack, igm, egm, minRow, esc].map((r, i) => ({ ...r, code: ["G1", "P1", "A5", "A6", "M1", "E1"][i] }));
const items = [
  { productCode: "G1", name: "Graduated filing", pricingModel: "Per-transaction", unit: "HBL", qty: 300, months: 12, unitPriceResolved: 230000 / 300, discountPct: 0, lineTotal: 230000 * 12 },
  { productCode: "P1", name: "Document reading", pricingModel: "Per-transaction", unit: "Page", qty: 12500, months: 12, unitPriceResolved: 105000 / 12500, discountPct: 0, lineTotal: 105000 * 12 },
  { productCode: "A5", name: "IGM", pricingModel: "Per-transaction", unit: "Flight", qty: 300, months: 12, unitPriceResolved: 150, discountPct: 0, lineTotal: 300 * 150 * 12 },
  { productCode: "A6", name: "EGM", pricingModel: "Per-transaction", unit: "Flight", qty: 250, months: 12, unitPriceResolved: 150, discountPct: 0, lineTotal: 250 * 150 * 12 },
  { productCode: "E1", name: "Escalating service", pricingModel: "Per-transaction", unit: "Page", qty: 1000, months: 24, unitPriceResolved: 10, discountPct: 0, lineTotal: 252000 },
];
const t = text(quoteDocumentHtml({ quoteNo: "Q1", createdDate: "2026-11-20", items, hans: { party: { name: "C" } } }, { priceRows, catalog: [], autoPrint: false }));
check("graduated explained", t.includes("(each band at its own rate)"), true);
check("no estimated charge on the customer quote (billed on actual volume)", /Estimate at/.test(t), false);
check("pack explained, rate is the overage rate", [t.includes("Prepaid pack: 10,000 Page a month for ₹80,000; beyond that, the rate per Page."), t.includes("Per page beyond the pack ₹10")], [true, true]);
check("pool explained on both lines", [t.includes("Volume counted together with: EGM."), t.includes("Volume counted together with: IGM.")], [true, true]);
check("escalation by year", [t.includes("Rates increase by 10% each year from year 2."), t.includes("Year 1 ₹10 · Year 2 ₹11 · Year 3 ₹12.1 per Page.")], [true, true]);
check("rule flags", [hasUsageRules(pack), hasUsageRules({ listPrice: 5 }), usageRuleText(minRow)], [true, false, ["Minimum billing: ₹15,000 a month."]]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
