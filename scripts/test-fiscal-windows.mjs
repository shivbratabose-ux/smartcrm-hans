// Verifies fiscalWindows() — the My Performance timeline: month, rolling
// last-3-months, fiscal quarters (Apr-Mar FY), halves and full FY, plus the
// month-composed goal formula the page uses (month = quarter / 3).
// Run: node scripts/test-fiscal-windows.mjs  (or npm run test:windows)
import { fiscalWindows, periodOf } from "../src/utils/fiscal.js";
let pass=0, fail=0;
const check=(n,g,w)=>{const ok=JSON.stringify(g)===JSON.stringify(w); ok?pass++:fail++;
  console.log(`  ${ok?"\u2713":"\u2717"} ${n}${ok?"":`  expected ${JSON.stringify(w)} got ${JSON.stringify(g)}`}`);};

// Today 2026-08-18 → FY 26-27
const W = Object.fromEntries(fiscalWindows("2026-08-18").map(w=>[w.key,w]));
check("this month", [W.month.start, W.month.end], ["2026-08-01","2026-08-31"]);
check("last 3M (Jun-Aug)", [W.l3m.start, W.l3m.end], ["2026-06-01","2026-08-31"]);
check("Q1 Apr–Jun", [W.q1.start, W.q1.end], ["2026-04-01","2026-06-30"]);
check("Q2 Jul–Sep", [W.q2.start, W.q2.end], ["2026-07-01","2026-09-30"]);
check("Q3 Oct–Dec", [W.q3.start, W.q3.end], ["2026-10-01","2026-12-31"]);
check("Q4 Jan–Mar crosses year", [W.q4.start, W.q4.end], ["2027-01-01","2027-03-31"]);
check("H1 Apr–Sep", [W.h1.start, W.h1.end], ["2026-04-01","2026-09-30"]);
check("H2 Oct–Mar", [W.h2.start, W.h2.end], ["2026-10-01","2027-03-31"]);
check("FY Apr–Mar", [W.fy.start, W.fy.end], ["2026-04-01","2027-03-31"]);
check("FY label", W.fy.label, "FY 26–27 (Apr–Mar)");
check("FY covers 12 months", W.fy.months.length, 12);
check("Q4 months map to FY-start period", periodOf(W.q4.months[0]+"-15"), "2026-Q4");

// Jan of the NEXT calendar year: FY still 26-27, l3m crosses year boundary
const J = Object.fromEntries(fiscalWindows("2027-01-10").map(w=>[w.key,w]));
check("Jan: FY start unchanged", J.fy.start, "2026-04-01");
check("Jan: l3m Nov–Jan", [J.l3m.start, J.l3m.end], ["2026-11-01","2027-01-31"]);
check("Feb leap month end", Object.fromEntries(fiscalWindows("2028-02-10").map(w=>[w.key,w])).month.end, "2028-02-29");

// goal composition: quarter window = 3×(g/3) = g exactly
const goal = { "2026-Q1": 30, "2026-Q2": 45 };
const wGoal = (w) => +w.months.reduce((s,ym)=>s+(goal[periodOf(ym+"-15")]||0)/3,0).toFixed(2);
check("month goal = qtr/3", wGoal(W.month), 15);
check("quarter goal exact", wGoal(W.q2), 45);
check("H1 = Q1+Q2", wGoal(W.h1), 75);
check("l3m spans two quarters (Jun 10 + Jul 15 + Aug 15)", wGoal(W.l3m), 40);
console.log(`\n${fail===0?"ALL PASS":"FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
