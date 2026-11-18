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
check("defaults", amcRules({}), { defaultPct: 20, startYear: 2, fixedYears: 2, escalationPct: 10, escalationEvery: 2, scheduleYears: 5 });
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

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
