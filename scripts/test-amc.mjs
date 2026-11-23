// AMC on one-time licences. Run: node scripts/test-amc.mjs
import { computeAmc, amcRules, escalationFactor, amcTermText, describeEscalation } from "../src/lib/quotation/amc.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`}`);
};

const licence = { productCode: "S03", name: "Perpetual Licence", pricingModel: "One-time Licence", lineTotal: 1000000 };
const impl = { productCode: "S01", name: "Implementation", pricingModel: "Implementation", lineTotal: 300000 };
const saas = { productCode: "P01", name: "iCAFFE", pricingModel: "SaaS Subscription", lineTotal: 500000 };
const catalogue = [{ code: "S03", amcPct: null }, { code: "WH-LIC", amcPct: 18 }];

console.log("\nRules");
check("defaults", amcRules({}), { defaultPct: 20, startYear: 2, fixedYears: 2, escalationPct: 10, escalationEvery: 2, scheduleYears: 5, base: "net" });
check("old ALR % is used when no AMC % is set", amcRules({ alrPctOfLicence: 22 }).defaultPct, 22);
check("AMC % wins over the old ALR %", amcRules({ alrPctOfLicence: 22, amcDefaultPct: 18 }).defaultPct, 18);
check("fixed 2 yrs, then +10% every 2 yrs", [1, 2, 3, 4, 5, 6].map((k) => +escalationFactor(k, { fixedYears: 2, escalationPct: 10, escalationEvery: 2 }).toFixed(4)), [1, 1, 1.1, 1.1, 1.21, 1.21]);

console.log("\nWhat AMC is charged on");
const a = computeAmc([licence, impl, saas], { catalogue });
check("only the licence counts (not implementation / SaaS)", [a.applies, a.base, a.annual], [true, 1000000, 200000]);
check("schedule: from contract year 2, 5 AMC years", a.schedule.map((y) => [y.contractYear, y.amount]), [[2, 200000], [3, 200000], [4, 220000], [5, 220000], [6, 242000]]);
check("5-year AMC total", a.scheduleTotal, 1082000);
check("on the rules → no approval", [a.deviations, a.breached], [[], false]);
check("no licence → no AMC", computeAmc([impl, saas]).applies, false);
check("after the overall discount", computeAmc([licence], { overallDiscountPct: 10 }).base, 900000);
check("product's own AMC %", computeAmc([{ ...licence, productCode: "WH-LIC" }], { catalogue }).lines[0].pct, 18);
check("blank product % → default", computeAmc([licence], { catalogue, config: { amcDefaultPct: 15 } }).annual, 150000);

console.log("\nChanges on a quote need approval");
const early = computeAmc([licence], { overrides: { startYear: 1 } });
check("from go-live (year 1)", [early.schedule[0].contractYear, early.breached], [1, true]);
check("reason says what changed", early.deviations, ["AMC starts in year 1 instead of year 2"]);
const flat = computeAmc([licence], { overrides: { escalationPct: 0 } });
check("no increase", [flat.schedule.map((y) => y.amount), flat.deviations], [[200000, 200000, 200000, 200000, 200000], ["AMC increase: no increase instead of fixed 2 yrs, then +10% every 2 yrs"]]);
const yearly = computeAmc([licence], { overrides: { fixedYears: 1, escalationPct: 5, escalationEvery: 1 } });
check("custom: fixed 1 yr, +5% yearly", yearly.schedule.map((y) => y.amount), [200000, 210000, 220500, 231525, 243101.25]);
const rate = computeAmc([licence], { overrides: { linePct: { S03: 15 } } });
check("lower rate on a line", [rate.annual, rate.deviations], [150000, ["AMC on Perpetual Licence: 15% instead of 20%"]]);
check("same values as the rules are not a change", computeAmc([licence], { overrides: { startYear: 2, escalationPct: 10, linePct: { S03: 20 } } }).breached, false);
check("overrides with no licence don't flag", computeAmc([saas], { overrides: { startYear: 1 } }).breached, false);

console.log("\nWording");
check("escalation text", [describeEscalation({ fixedYears: 2, escalationPct: 10, escalationEvery: 2 }), describeEscalation({ fixedYears: 1, escalationPct: 5, escalationEvery: 1 })], ["fixed 2 yrs, then +10% every 2 yrs", "fixed 1 yr, then +5% every year"]);
check("term line", amcTermText(a), "AMC: 20% of the licence fee per year, from contract year 2 (year 1 under warranty); fixed 2 yrs, then +10% every 2 yrs. Billed annually in advance.");

console.log("\nCustomizable: list price, fixed amount per unit");
const disc = { ...licence, discountPct: 10, grossPerPeriod: 1000000, lineTotal: 900000, billedQty: 1 };
check("net (default): after line + overall discount", computeAmc([disc], { overallDiscountPct: 10 }).base, 810000);
check("list: the listed fee, discounts ignored (invoice wording)", computeAmc([disc], { overallDiscountPct: 10, config: { amcBase: "list" } }).base, 1000000);
check("list base + 25% gives the invoice's ALR", computeAmc([disc], { config: { amcBase: "list", amcDefaultPct: 25 } }).annual, 250000);
const eannex = { productCode: "P18", name: "E-Annex Ultra", pricingModel: "One-time Licence", lineTotal: 110000, grossPerPeriod: 110000, billedQty: 2, qty: 2 };
const ea = computeAmc([eannex], { catalogue: [{ code: "P18", amcFixed: 10000 }] });
check("fixed ₹10,000 per branch × 2 branches", [ea.annual, ea.lines[0].fixed, ea.breached], [20000, 10000, false]);
check("fixed amount wording", amcTermText(ea).startsWith("AMC: ₹10,000 per unit per year"), true);
const eaPct = computeAmc([eannex], { catalogue: [{ code: "P18", amcFixed: 10000 }], overrides: { linePct: { P18: 15 } } });
check("rep switches a fixed-AMC product to a % → approval", [eaPct.annual, eaPct.breached], [16500, true]);
check("list-base wording", amcTermText(computeAmc([licence], { config: { amcBase: "list" } }), { amcBase: "list" }).includes("listed licence fee (before any discount)"), true);

console.log("\nFlat ALR per product, moved up or down on a quote");
const P18FLAT = [{ code: "P18", amcFixed: 10000, amcEscalationPct: 0 }];
const flatA = computeAmc([eannex], { catalogue: P18FLAT });
check("E-Annex ALR flat: ₹20,000 every year for 2 branches", flatA.schedule.map((y) => y.amount), [20000, 20000, 20000, 20000, 20000]);
check("flat by the product's own rule is not a change", flatA.breached, false);
check("flat wording", amcTermText(flatA), "AMC: ₹10,000 per unit per year, from contract year 2 (year 1 under warranty); no increase. Billed annually in advance.");
const up = computeAmc([eannex], { catalogue: P18FLAT, overrides: { lineFixed: { P18: 12000 } } });
check("rep moves ALR up to ₹12,000 → approval", [up.annual, up.breached, up.deviations], [24000, true, ["AMC on E-Annex Ultra: ₹12,000 per unit instead of ₹10,000"]]);
const down = computeAmc([eannex], { catalogue: P18FLAT, overrides: { lineFixed: { P18: 8000 } } });
check("rep moves ALR down to ₹8,000 → approval", [down.annual, down.breached], [16000, true]);
const esc = computeAmc([eannex], { catalogue: P18FLAT, overrides: { lineEscalation: { P18: 5 } } });
check("rep adds a 5% increase to the flat ALR → approval", [esc.schedule.map((y) => y.amount), esc.breached], [[20000, 20000, 21000, 21000, 22050], true]);
const dec = computeAmc([eannex], { catalogue: P18FLAT, overrides: { lineEscalation: { P18: -10 } } });
check("or a decrease", [dec.schedule.map((y) => y.amount), describeEscalation(dec.terms)], [[20000, 20000, 18000, 18000, 16200], "fixed 2 yrs, then −10% every 2 yrs"]);
check("same as the product's rule is not a change", computeAmc([eannex], { catalogue: P18FLAT, overrides: { lineFixed: { P18: 10000 }, lineEscalation: { P18: 0 } } }).breached, false);
const both = computeAmc([eannex, licence], { catalogue: P18FLAT });
check("flat ALR beside a licence on the company rule: each keeps its own increase",
  both.schedule.map((y) => y.amount), [220000, 220000, 240000, 240000, 262000]);
check("mixed wording names each line", [both.terms.mixed, amcTermText(both).startsWith("AMC: E-Annex Ultra: ₹10,000 per unit per year, no increase; Perpetual Licence: 20% of the licence fee per year, fixed 2 yrs, then +10% every 2 yrs")], [true, true]);
check("company escalation change doesn't touch the flat ALR", computeAmc([eannex], { catalogue: P18FLAT, overrides: { escalationPct: 15 } }).schedule.map((y) => y.amount), [20000, 20000, 20000, 20000, 20000]);
check("…and isn't a deviation when only the flat line is on the quote", computeAmc([eannex], { catalogue: P18FLAT, overrides: { escalationPct: 15 } }).breached, false);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
