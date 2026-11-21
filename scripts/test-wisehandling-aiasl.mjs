// WiseHandling Enterprise price rows reproduce the AIASL GHOMS budgetary quotes
// (software side only; hardware is quoted separately by hand).
import { HANS_CATALOGUE } from "../src/data/quotationMasters.js";
import { computeQuote } from "../src/lib/quotation/pricingEngine.js";
import { computeAmc } from "../src/lib/quotation/amc.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};
const row = (code) => HANS_CATALOGUE.find((r) => r.code === code);
const line = (code, qty, months = 1) => { const r = row(code); return { productCode: code, pricingModel: r.pricingModel, billingClass: r.billingClass, unitPriceResolved: r.listPrice, qty, months, discountPct: 0 }; };
const cfg = { gstRatePct: 18, homeState: "Delhi" };
const stations = 85;
const common = [line("WH15", stations), line("WH16", stations), line("WH17", 1), line("WH18", 2), line("WH19", 1)];

// ── SaaS model (quote v3) ────────────────────────────────────────────
const saas = computeQuote([line("WH13", 200000 / 12, 12), ...common], { customerState: "Delhi" }, cfg);
check("SaaS: software one-time = ₹4,68,25,000 (implementation, training, configuration, integrations, maps)", saas.oneTimeSubtotal, 46825000);
check("SaaS: the per-flight fee is billed on actual flights, never in the total", saas.recurringSubtotal, 0);
check("SaaS: 2 lakh flights a year at ₹350 = ₹7,00,00,000 a year (internal estimate)", Math.round(saas.variableEstimateMonthly * 12), 70000000);
check("SaaS: ₹350 per flight, billed on use", [row("WH13").listPrice, row("WH13").billingClass, row("WH13").unit], [350, "transaction", "Flight"]);

// ── Licence model (quote v1) ─────────────────────────────────────────
const lic = computeQuote([line("WH14", 1), ...common, line("WH21", 1), line("WH20", 1, 12), line("WH22", 1, 12)], { customerState: "Delhi" }, cfg);
check("licence: software one-time = ₹27,60,25,000", lic.oneTimeSubtotal, 276025000);
check("licence: hosting + map licence + security audit = ₹95,00,000 a year", Math.round(lic.recurringSubtotal), 9500000);
const amc = computeAmc(lic.lines, { config: { amcEscalationPct: 0 }, catalogue: HANS_CATALOGUE });
check("licence: AMC 20% of the licence = ₹4,53,60,000 a year from year 2", [amc.annual, amc.schedule[0].contractYear], [45360000, 2]);
check("licence: software recurring a year = AMC + hosting + map + audit = ₹5,48,60,000", Math.round(amc.annual + lic.recurringSubtotal), 54860000);
check("licence: 5-year software = ₹50,49,65,000 (4 years of AMC, 5 of hosting / map / audit)", Math.round(lic.oneTimeSubtotal + amc.annual * 4 + lic.recurringSubtotal * 5), 504965000);

check("per-station rates", [row("WH15").listPrice, row("WH16").listPrice, row("WH18").listPrice, row("WH11").listPrice], [175000, 70000, 2500000, 16800]);
check("no hardware in the price list", HANS_CATALOGUE.filter((r) => /tracker|SIM|field engineer|GPS hardware/i.test(r.name)).map((r) => r.code), []);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
