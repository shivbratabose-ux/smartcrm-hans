// Headless acceptance tests for the quotation pricing engine (brief §11).
// Run: node scripts/test-pricing-engine.mjs
// Pure — imports the engine + masters directly, no app/UI/DB.

import {
  resolveUnitPrice, computeLine, computeQuote, computeGst,
  evaluateDiscountGuardrail, evaluateMarginGuardrail, lineMargin, validateCcsRule, validateWiseHandlingModules,
  formatQuoteNumber, fiscalYearSuffix, effectiveListPrice,
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
