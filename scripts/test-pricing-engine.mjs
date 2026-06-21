// Headless acceptance tests for the quotation pricing engine (brief §11).
// Run: node scripts/test-pricing-engine.mjs
// Pure — imports the engine + masters directly, no app/UI/DB.

import {
  resolveUnitPrice, computeLine, computeQuote, computeGst,
  evaluateDiscountGuardrail, evaluateMarginGuardrail, lineMargin, validateCcsRule, validateWiseHandlingModules,
  formatQuoteNumber, fiscalYearSuffix, effectiveListPrice, effectiveBandRate, effectiveEditionRates,
} from "../src/lib/quotation/pricingEngine.js";
import { HANS_CATALOGUE } from "../src/data/quotationMasters.js";

let pass = 0, fail = 0;
const approx = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
function check(name, got, want) {
  const ok = typeof want === "number" ? approx(got, want) : got === want;
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); }
}
const prod = (code) => HANS_CATALOGUE.find((p) => p.code === code);
const up = (code, qty) => resolveUnitPrice(prod(code), { qty }).unitPrice;

console.log("§11.1 iCAFFE 2-D lookup (FX=1)");
check("FULL Stack iCAFFE 5 users → 3500", up("IC01", 5), 3500);
check("FULL Stack iCAFFE 8 users → 3400", up("IC01", 8), 3400);
check("FULL Stack iCAFFE 20 users → 3100", up("IC01", 20), 3100);
check("FULL Stack iCAFFE 200 users → 2500", up("IC01", 200), 2500);
check("EDI + Billing 40 users → 2200", up("IC04", 40), 2200);

console.log("§11.2 SaaS line total");
{
  const a = computeLine({ pricingModel: "SaaS Subscription", unitPriceResolved: 3100, qty: 10, months: 12, discountPct: 0 });
  check("qty10 × 3100 × 12, disc0 → 372000", a.lineTotal, 372000);
  check("  → lineRecurring 372000", a.lineRecurring, 372000);
  check("  → lineOneTime 0", a.lineOneTime, 0);
  const b = computeLine({ pricingModel: "SaaS Subscription", unitPriceResolved: 3100, qty: 10, months: 12, discountPct: 10 });
  check("disc10% → 334800", b.lineTotal, 334800);
}

console.log("§11.3 Per-flight floor (greater-of)");
{
  const l = computeLine({ pricingModel: "PaaS Per-Flight", unitPriceResolved: 50, qty: 500, months: 12, discountPct: 0, minMonthFloor: 100000 });
  check("per-period max(25000,100000) = 100000", l.grossPerPeriod, 100000);
  check("lineTotal 1200000", l.lineTotal, 1200000);
  check("  → recurring (oneTime 0)", l.lineOneTime, 0);
}

console.log("§11.4 One-time licence ignores months + ALR");
{
  const l = computeLine({ pricingModel: "One-time Licence", unitPriceResolved: 500000, qty: 1, months: 24, discountPct: 0 });
  check("months forced 1 → 500000", l.lineTotal, 500000);
  check("  → lineOneTime 500000", l.lineOneTime, 500000);
  const q = computeQuote(
    [{ pricingModel: "One-time Licence", unitPriceResolved: 500000, qty: 1, months: 24, discountPct: 0 }],
    { customerState: "Delhi" }
  );
  check("alrAnnual = 500000 × 20% = 100000", q.alrAnnual, 100000);
  check("grandTotal excludes ALR (base 500000 + 18% GST)", q.grandTotal, 590000);
}

console.log("§11.5 GST split");
{
  const intra = computeGst(1000000, "Delhi");
  check("Delhi → CGST 90000", intra.cgst, 90000);
  check("Delhi → SGST 90000", intra.sgst, 90000);
  check("Delhi → IGST 0", intra.igst, 0);
  const inter = computeGst(1000000, "Maharashtra");
  check("Maharashtra → IGST 180000", inter.igst, 180000);
  check("Maharashtra → CGST 0", inter.cgst, 0);
  check("Maharashtra → SGST 0", inter.sgst, 0);
}

console.log("§11.6 Prepayment (workbook basis: % of subtotal − overall disc)");
{
  const q = computeQuote(
    [{ pricingModel: "SaaS Subscription", unitPriceResolved: 1000000, qty: 1, months: 1, discountPct: 0 }],
    { customerState: "Delhi", prepaymentApplicable: true, prepaymentDiscountPct: 5 }
  );
  check("recurringSubtotal 1,000,000", q.recurringSubtotal, 1000000);
  check("prepaymentDisc 50,000", q.prepaymentDisc, 50000);
  check("taxableBase (net) 950,000", q.taxableBase, 950000);
}

console.log("§11.7 Discount guardrail");
{
  const g = evaluateDiscountGuardrail([{ discountPct: 15 }], {});
  check("line disc 15% (policy 10%) → breached", g.breached, true);
  const ok = evaluateDiscountGuardrail([{ discountPct: 10 }], {});
  check("line disc 10% (== policy) → not breached", ok.breached, false);
}

console.log("Effective-dated rates (Phase 2a)");
{
  const base = { rateSource: "Flat", listPrice: 1000 };
  check("no schedule → base price", effectiveListPrice(base, "2026-06-21"), 1000);
  check("no asOf → base price", effectiveListPrice({ ...base, rateSchedule: [{ effectiveFrom: "2026-01-01", listPrice: 1200 }] }, null), 1000);
  const sched = { rateSource: "Flat", listPrice: 1000, rateSchedule: [
    { effectiveFrom: "2026-04-01", listPrice: 1100 },
    { effectiveFrom: "2026-09-01", listPrice: 1300 },
  ] };
  check("before first schedule → base", effectiveListPrice(sched, "2026-03-31"), 1000);
  check("on/after first schedule → 1100", effectiveListPrice(sched, "2026-06-21"), 1100);
  check("after second schedule → 1300", effectiveListPrice(sched, "2026-10-01"), 1300);
  // resolveUnitPrice threads asOf for Flat products (fx=1)
  const r = resolveUnitPrice(sched, { qty: 1, asOf: "2026-09-15" });
  check("resolveUnitPrice picks scheduled 1300", r.unitPrice, 1300);

  // Band rate scheduling
  const band = { fromUsers: 0, toUsers: 150, ratePerUserMonth: 3000, rateSchedule: [{ effectiveFrom: "2026-07-01", ratePerUserMonth: 3300 }] };
  check("band: before schedule → base 3000", effectiveBandRate(band, "2026-06-30"), 3000);
  check("band: on/after schedule → 3300", effectiveBandRate(band, "2026-07-01"), 3300);
  const bandProd = { rateSource: "Band", name: "iCAFFE" };
  const rb = resolveUnitPrice(bandProd, { qty: 10, bands: [band], asOf: "2026-08-01" });
  check("resolveUnitPrice Band picks scheduled 3300", rb.unitPrice, 3300);

  // iCAFFE edition rate-row scheduling
  const ed = { name: "EDI", rates: [2400, 2350, 2300], rateSchedule: [{ effectiveFrom: "2026-07-01", rates: [2500, 2450, 2400] }] };
  check("edition: before schedule → base row", effectiveEditionRates(ed, "2026-06-30")[0], 2400);
  check("edition: on/after schedule → new row", effectiveEditionRates(ed, "2026-07-01")[0], 2500);
  const icProd = { rateSource: "iCAFFE", name: "EDI" };
  const ri = resolveUnitPrice(icProd, { qty: 5, editions: [ed], asOf: "2026-08-01" });
  check("resolveUnitPrice iCAFFE picks scheduled 2500 (band0)", ri.unitPrice, 2500);
}

console.log("Segment price lists (Phase 2b)");
{
  const prod = { rateSource: "Flat", listPrice: 1000, segmentPrices: { "Government / PSU": 1200, "SME": 850 } };
  check("no segment → base", effectiveListPrice(prod, null, null), 1000);
  check("Commercial (no override) → base", effectiveListPrice(prod, null, "Commercial"), 1000);
  check("Government segment → 1200", effectiveListPrice(prod, null, "Government / PSU"), 1200);
  check("SME segment → 850", effectiveListPrice(prod, null, "SME"), 850);
  const r = resolveUnitPrice(prod, { qty: 1, segment: "SME" });
  check("resolveUnitPrice applies segment 850", r.unitPrice, 850);
  // Segment override wins over a schedule
  const both = { rateSource: "Flat", listPrice: 1000, rateSchedule: [{ effectiveFrom: "2026-01-01", listPrice: 1100 }], segmentPrices: { "SME": 900 } };
  check("segment override wins over schedule", effectiveListPrice(both, "2026-06-01", "SME"), 900);
  check("no segment → schedule still applies", effectiveListPrice(both, "2026-06-01", "Commercial"), 1100);
}

console.log("Currency price lists (Phase 2c)");
{
  const prod = { rateSource: "Flat", listPrice: 8350, currencyPrices: { USD: 99 } };
  // FX path: INR base / fx
  check("INR base / fx 83.5 → 100", resolveUnitPrice(prod, { qty: 1, currency: "INR", fx: 1 }).unitPrice, 8350);
  check("USD via fx (no... has native) → native 99", resolveUnitPrice(prod, { qty: 1, currency: "USD", fx: 83.5 }).unitPrice, 99);
  // currency with no native price → FX-converted
  const prod2 = { rateSource: "Flat", listPrice: 8350 };
  check("EUR no native → 8350/90 ≈ 92.78", resolveUnitPrice(prod2, { qty: 1, currency: "EUR", fx: 90 }).unitPrice, 92.7778);
  // native price bypasses FX (fx ignored)
  check("USD native ignores fx", resolveUnitPrice(prod, { qty: 1, currency: "USD", fx: 83.5 }).unitPrice, 99);
}

console.log("Per-product / per-country band rates (Phase 2d)");
{
  const gbands = [
    { fromUsers: 0, toUsers: 150, ratePerUserMonth: 3000 },
    { fromUsers: 151, toUsers: 250, ratePerUserMonth: 2800 },
  ];
  // no bandRates → global band rate
  const p0 = { rateSource: "Band", name: "iCAFFE" };
  check("band: no product override → global 3000", resolveUnitPrice(p0, { qty: 10, bands: gbands }).unitPrice, 3000);
  // per-product Default row overrides global
  const p1 = { rateSource: "Band", name: "iCAFFE", bandRates: { Default: [3500, 3300] } };
  check("band: product Default row → 3500", resolveUnitPrice(p1, { qty: 10, bands: gbands }).unitPrice, 3500);
  check("band: product Default row band2 → 3300", resolveUnitPrice(p1, { qty: 200, bands: gbands }).unitPrice, 3300);
  // per-country row wins over Default
  const p2 = { rateSource: "Band", name: "iCAFFE", bandRates: { Default: [3500, 3300], UAE: [4000, 3800] } };
  check("band: UAE country row → 4000", resolveUnitPrice(p2, { qty: 10, bands: gbands, country: "UAE" }).unitPrice, 4000);
  check("band: country with no row → Default 3500", resolveUnitPrice(p2, { qty: 10, bands: gbands, country: "India" }).unitPrice, 3500);
  // missing country cell falls back to global
  const p3 = { rateSource: "Band", name: "iCAFFE", bandRates: { India: [null, 2900] } };
  check("band: India null cell → global 3000", resolveUnitPrice(p3, { qty: 10, bands: gbands, country: "India" }).unitPrice, 3000);
}

console.log("Generic rate-card matrix (Phase 2e)");
{
  // Card: rows Basic/Pro × 10 iCAFFE bands, per country. Band index by qty.
  const card = { id: "rc1", rows: [{ name: "Basic", productCode: "X1" }, { name: "Pro", productCode: "X2" }],
    rates: {
      Default: { Basic: [500,490,480,470,460,450,440,430,420,400], Pro: [900,880,860,840,820,800,780,760,740,700] },
      UAE: { Pro: [1200,1180,1160,1140,1120,1100,1080,1060,1040,1000] },
    } };
  const basic = { rateSource: "Flat", name: "Basic", matrixId: "rc1", matrixRow: "Basic" };
  const pro = { rateSource: "Flat", name: "Pro", matrixId: "rc1", matrixRow: "Pro" };
  check("matrix Basic, 5 users (band0) → 500", resolveUnitPrice(basic, { qty: 5, rateCards: [card] }).unitPrice, 500);
  check("matrix Pro, 8 users (band1) → 880", resolveUnitPrice(pro, { qty: 8, rateCards: [card] }).unitPrice, 880);
  check("matrix Pro, 200 users (band9) → 700", resolveUnitPrice(pro, { qty: 200, rateCards: [card] }).unitPrice, 700);
  check("matrix Pro UAE band0 → 1200", resolveUnitPrice(pro, { qty: 5, rateCards: [card], country: "UAE" }).unitPrice, 1200);
  check("matrix Pro UAE missing→ Default 900", resolveUnitPrice(basic, { qty: 5, rateCards: [card], country: "UAE" }).unitPrice, 500);
  check("matrix no card → missing rate", resolveUnitPrice(pro, { qty: 5, rateCards: [] }).missingRate, true);
}

console.log("Margin floor guardrail (Phase 3a)");
{
  // lineMargin: post-discount margin vs cost
  check("margin: price 100, cost 80 → 20%", lineMargin(100, 80), 20);
  check("margin: price 100, cost 50, 10% disc → ~44.4%", lineMargin(100, 50, 10), 44.4444);
  check("margin: no cost → null", lineMargin(100, 0), null);
  // off when minMarginPct = 0 (default)
  const off = evaluateMarginGuardrail([{ productCode: "X", unitPriceResolved: 100, costPerUnit: 99 }], { minMarginPct: 0 });
  check("minMargin 0 → never breaches", off.breached, false);
  // breaches when margin below floor
  const bad = evaluateMarginGuardrail([{ productCode: "X", unitPriceResolved: 100, costPerUnit: 85 }], { minMarginPct: 25 });
  check("margin 15% < floor 25% → breached", bad.breached, true);
  // ok when margin above floor
  const ok = evaluateMarginGuardrail([{ productCode: "X", unitPriceResolved: 100, costPerUnit: 50 }], { minMarginPct: 25 });
  check("margin 50% ≥ floor 25% → not breached", ok.breached, false);
  // no cost on the line → not assessed, not breached
  const noCost = evaluateMarginGuardrail([{ productCode: "X", unitPriceResolved: 100, costPerUnit: null }], { minMarginPct: 25 });
  check("no cost → not breached", noCost.breached, false);
}

console.log("§11.8 CC03 > CC04 rule");
{
  const bad = validateCcsRule([{ code: "CC03", listPrice: 100 }, { code: "CC04", listPrice: 100 }]);
  check("CC03 ≤ CC04 rejected", bad.ok, false);
  const good = validateCcsRule([{ code: "CC03", listPrice: 200 }, { code: "CC04", listPrice: 100 }]);
  check("CC03 > CC04 accepted", good.ok, true);
}

console.log("Extra: WiseHandling ≥ 3 modules + numbering");
{
  const warn = validateWiseHandlingModules([{ productCode: "WH01" }, { productCode: "WH02" }]);
  check("2 functional WH modules → not ok", warn.ok, false);
  const ok = validateWiseHandlingModules([{ productCode: "WH01" }, { productCode: "WH02" }, { productCode: "WH03" }]);
  check("3 functional WH modules → ok", ok.ok, true);
  check("FY suffix for 2026-06-17 → 26-27", fiscalYearSuffix(new Date("2026-06-17")), "26-27");
  check("FY suffix for 2026-02-01 → 25-26", fiscalYearSuffix(new Date("2026-02-01")), "25-26");
  check("quote number format", formatQuoteNumber(1059, new Date("2026-06-17")), "SQ/M001059/26-27");
  check("missing rate flagged", resolveUnitPrice(prod("P03"), { qty: 1 }).missingRate, true);
  check("inclusive WH06 not flagged (explicit 0)", resolveUnitPrice(prod("WH06"), { qty: 1 }).missingRate, false);
}

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
