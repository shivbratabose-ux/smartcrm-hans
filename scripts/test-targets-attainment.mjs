// ═══════════════════════════════════════════════════════════════════
// test-targets-attainment.mjs — covers the correctness fixes in
// src/components/Targets.jsx: fiscal-period mapping, the Masters-driven
// won stage, and deduplicated achievement totals.
// ───────────────────────────────────────────────────────────────────
// Targets.jsx is JSX and can't be imported from node, so — same
// convention as the other scripts/test-*.mjs — the pure functions are
// mirrored here. KEEP IN SYNC.
//
// Runs under two timezones because periodOf decides which fiscal
// quarter a deal's revenue books to, and the old `new Date(str)` parse
// moved quarter-boundary deals into the wrong quarter west of UTC.
// ═══════════════════════════════════════════════════════════════════

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ZONES = ["Asia/Kolkata", "America/New_York"];
if (!process.env.__TZ_CHILD) {
  const self = fileURLToPath(import.meta.url);
  let failed = 0;
  for (const tz of ZONES) {
    const r = spawnSync(process.execPath, [self], {
      stdio: "inherit", env: { ...process.env, TZ: tz, __TZ_CHILD: "1" },
    });
    if (r.status !== 0) failed++;
  }
  process.exit(failed === 0 ? 0 : 1);
}

// ── Mirrors of Targets.jsx ────────────────────────────────────────
function periodOf(dateStr) {
  if (!dateStr) return "";
  let y, mo;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
  if (m) { y = Number(m[1]); mo = Number(m[2]) - 1; }
  else {
    const d = new Date(dateStr);
    if (isNaN(d)) return "";
    y = d.getFullYear(); mo = d.getMonth();
  }
  if (mo < 0 || mo > 11) return "";
  const fyStart = mo >= 3 ? y : y - 1;
  return `${fyStart}-Q${Math.floor(((mo - 3 + 12) % 12) / 3) + 1}`;
}
// The code being replaced, so we can assert it actually differed.
function periodOfOld(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  const m = d.getMonth(), y = d.getFullYear();
  return `${m >= 3 ? y : y - 1}-Q${Math.floor(((m - 3 + 12) % 12) / 3) + 1}`;
}

const LEGACY_WON_STAGES = ["Won", "closed_won"];
const wonStageNames = (masters) => {
  const won = Array.isArray(masters?.stages) ? masters.stages.find(s => s?.kind === "won") : null;
  return new Set([won?.name, ...LEGACY_WON_STAGES].filter(Boolean));
};
const prodMatches = (tProd, arr, single) => {
  if (!tProd || tProd === "All") return true;
  if (Array.isArray(arr) && arr.includes(tProd)) return true;
  return single === tProd;
};

// Deduplicated KPI achievement.
function achievedTotals(filtered, opps, wonNames) {
  const counted = new Set();
  let value = 0, deals = 0;
  (opps || []).forEach(o => {
    if (!o?.id || counted.has(o.id) || !wonNames.has(o?.stage)) return;
    const per = periodOf(o.closeDate);
    if (!per) return;
    if (!filtered.some(t => t.userId === o.owner && t.period === per && prodMatches(t.product, o.products))) return;
    counted.add(o.id); value += Number(o.value) || 0; deals += 1;
  });
  return { value: +value.toFixed(2), deals };
}
// The old KPI: sum of each target's own achievement.
function perTargetAchieved(filtered, opps, wonNames) {
  return +filtered.reduce((sum, t) => sum + (opps || []).reduce((s, o) => {
    if (o.owner !== t.userId || !wonNames.has(o.stage)) return s;
    if (periodOf(o.closeDate) !== t.period) return s;
    if (!prodMatches(t.product, o.products)) return s;
    return s + (Number(o.value) || 0);
  }, 0), 0).toFixed(2);
}

const dupKeys = (filtered) => {
  const seen = {};
  filtered.forEach(t => {
    const k = `${t.userId}|${t.period}|${t.product || "All"}`;
    seen[k] = (seen[k] || 0) + 1;
  });
  return new Set(Object.keys(seen).filter(k => seen[k] > 1));
};

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};

const TZ = process.env.TZ, IST = TZ === "Asia/Kolkata";
console.log(`\nTargets attainment — TZ=${TZ}\n`);

// ── Fiscal period, India FY (Apr–Mar) ─────────────────────────────
check("1 Apr → Q1 of that FY",      periodOf("2026-04-01"), "2026-Q1");
check("31 Mar → Q4 of the prior FY", periodOf("2026-03-31"), "2025-Q4");
check("15 Aug → Q2",                 periodOf("2026-08-15"), "2026-Q2");
check("1 Jan → Q4 of the prior FY",  periodOf("2026-01-01"), "2025-Q4");
check("1 Jul → Q2",                  periodOf("2026-07-01"), "2026-Q2");
check("1 Oct → Q3",                  periodOf("2026-10-01"), "2026-Q3");
check("blank date → no period",      periodOf(""), "");
check("garbage → no period",         periodOf("not a date"), "");

if (!IST) {
  // The bug: a bare date parsed as UTC midnight renders as the previous
  // day west of UTC, so a deal closing on the first day of the financial
  // year booked to the LAST quarter of the previous one.
  check("1 Apr is unaffected by timezone now", periodOf("2026-04-01"), "2026-Q1");
  check("…the old UTC parse booked it to the prior FY", periodOfOld("2026-04-01"), "2025-Q4");
  check("1 Jul quarter boundary held", periodOf("2026-07-01"), "2026-Q2");
  check("…old parse slipped it to Q1", periodOfOld("2026-07-01"), "2026-Q1");
} else {
  check("IST: both parses agree (offset is positive)",
    [periodOf("2026-04-01"), periodOfOld("2026-04-01")], ["2026-Q1", "2026-Q1"]);
}

// ── Masters-driven won stage ──────────────────────────────────────
{
  const renamed = { stages: [
    { name: "Prospect", kind: "open" },
    { name: "Closed Won", kind: "won" },
    { name: "Closed Lost", kind: "lost" },
  ]};
  const names = wonStageNames(renamed);
  check("a renamed won stage counts", names.has("Closed Won"), true);
  check("historical 'Won' rows still count after the rename", names.has("Won"), true);
  check("legacy closed_won still counts", names.has("closed_won"), true);
  check("an open stage never counts", names.has("Prospect"), false);

  const noMasters = wonStageNames(undefined);
  check("no Masters yet → falls back to the legacy literals",
    [...noMasters].sort(), ["Won", "closed_won"]);
  check("Masters with no won-kind stage → still falls back",
    [...wonStageNames({ stages: [{ name: "Prospect", kind: "open" }] })].sort(), ["Won", "closed_won"]);
}

// ── Deduplicated achievement ──────────────────────────────────────
const Q = "2026-Q2", CLOSE = "2026-08-15";
const WON = wonStageNames({ stages: [{ name: "Won", kind: "won" }] });

{
  // The live data shape: one salesperson, one period, two identical targets.
  const filtered = [
    { id: "t1", userId: "u1", period: Q, product: "All", targetValue: 22.5 },
    { id: "t2", userId: "u1", period: Q, product: "All", targetValue: 19.5 },
  ];
  const opps = [{ id: "o1", owner: "u1", stage: "Won", closeDate: CLOSE, products: ["iCAFFE"], value: 10 }];

  check("duplicate commitments are detected", dupKeys(filtered).size, 1);
  check("the deal counts ONCE across duplicate targets", achievedTotals(filtered, opps, WON).value, 10);
  check("…where the old per-target sum double-counted it", perTargetAchieved(filtered, opps, WON), 20);
  check("deal count is deduped too", achievedTotals(filtered, opps, WON).deals, 1);
}

{
  // Company-wide plus product-specific for the same person and period.
  const filtered = [
    { id: "t1", userId: "u1", period: Q, product: "All",    targetValue: 100 },
    { id: "t2", userId: "u1", period: Q, product: "iCAFFE", targetValue: 40 },
  ];
  const opps = [{ id: "o1", owner: "u1", stage: "Won", closeDate: CLOSE, products: ["iCAFFE"], value: 25 }];
  check("overlapping All + product target counts the deal once", achievedTotals(filtered, opps, WON).value, 25);
  check("…where the old sum counted it twice", perTargetAchieved(filtered, opps, WON), 50);
  check("overlap is not reported as an exact duplicate", dupKeys(filtered).size, 0);
}

{
  // Non-overlapping targets must be unaffected by the dedupe.
  const filtered = [
    { id: "t1", userId: "u1", period: Q, product: "iCAFFE",    targetValue: 50 },
    { id: "t2", userId: "u2", period: Q, product: "WiseCargo", targetValue: 30 },
  ];
  const opps = [
    { id: "o1", owner: "u1", stage: "Won", closeDate: CLOSE, products: ["iCAFFE"],    value: 20 },
    { id: "o2", owner: "u2", stage: "Won", closeDate: CLOSE, products: ["WiseCargo"], value: 8 },
  ];
  check("distinct targets still add up normally", achievedTotals(filtered, opps, WON).value, 28);
  check("new and old agree when nothing overlaps",
    achievedTotals(filtered, opps, WON).value, perTargetAchieved(filtered, opps, WON));
}

{
  // Exclusions.
  const filtered = [{ id: "t1", userId: "u1", period: Q, product: "All", targetValue: 50 }];
  const opps = [
    { id: "o1", owner: "u1", stage: "Won",         closeDate: CLOSE,        products: ["iCAFFE"], value: 10 },
    { id: "o2", owner: "u1", stage: "Negotiation", closeDate: CLOSE,        products: ["iCAFFE"], value: 99 },
    { id: "o3", owner: "u1", stage: "Won",         closeDate: "",           products: ["iCAFFE"], value: 99 },
    { id: "o4", owner: "u1", stage: "Won",         closeDate: "2026-05-15", products: ["iCAFFE"], value: 99 },
    { id: "o5", owner: "u9", stage: "Won",         closeDate: CLOSE,        products: ["iCAFFE"], value: 99 },
  ];
  check("open / undated / out-of-period / other-owner deals all excluded",
    achievedTotals(filtered, opps, WON).value, 10);
  check("undated won deals are countable for the warning",
    opps.filter(o => WON.has(o.stage) && !periodOf(o.closeDate)).length, 1);
}

{
  // Float hygiene on the cards.
  const filtered = [
    { id: "t1", userId: "u1", period: Q, product: "iCAFFE", targetValue: 10.1 },
    { id: "t2", userId: "u2", period: Q, product: "WiseDox", targetValue: 20.2 },
  ];
  const opps = [
    { id: "o1", owner: "u1", stage: "Won", closeDate: CLOSE, products: ["iCAFFE"],  value: 0.1 },
    { id: "o2", owner: "u2", stage: "Won", closeDate: CLOSE, products: ["WiseDox"], value: 0.2 },
  ];
  check("achieved total is rounded, not 0.30000000000000004",
    achievedTotals(filtered, opps, WON).value, 0.3);
  check("target total is rounded too",
    +filtered.reduce((s, t) => s + (Number(t.targetValue) || 0), 0).toFixed(2), 30.3);
  check("a CSV string target value still sums numerically",
    +[{ targetValue: "10" }, { targetValue: 5 }].reduce((s, t) => s + (Number(t.targetValue) || 0), 0).toFixed(2), 15);
}

console.log(`\n${fail === 0 ? "✓" : "✗"} ${pass} passed, ${fail} failed  (TZ=${TZ})\n`);
process.exit(fail === 0 ? 0 : 1);
