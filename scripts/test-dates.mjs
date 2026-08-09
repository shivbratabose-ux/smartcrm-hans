// ═══════════════════════════════════════════════════════════════════
// test-dates.mjs — verifies the local-calendar date helpers in
// src/utils/helpers.jsx (toLocalISODate / parseLocalDate).
// ───────────────────────────────────────────────────────────────────
// Runs itself under a real timezone (Asia/Kolkata, our users' zone, and
// America/New_York for the negative-offset + DST cases) by re-execing
// with TZ set, so these are genuine timezone assertions rather than a
// simulation.
//
// helpers.jsx can't be imported from node (it pulls in ./toast, which is
// JSX), so — same convention as test-delete-sync.mjs — the two pure
// functions are mirrored here. KEEP IN SYNC with helpers.jsx.
// ═══════════════════════════════════════════════════════════════════

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ZONES = ["Asia/Kolkata", "America/New_York"];

// ── Re-exec once per zone ─────────────────────────────────────────
if (!process.env.__TZ_CHILD) {
  const self = fileURLToPath(import.meta.url);
  let failed = 0;
  for (const tz of ZONES) {
    const r = spawnSync(process.execPath, [self], {
      stdio: "inherit",
      env: { ...process.env, TZ: tz, __TZ_CHILD: "1" },
    });
    if (r.status !== 0) failed++;
  }
  process.exit(failed === 0 ? 0 : 1);
}

// ── Mirror of src/utils/helpers.jsx ───────────────────────────────
const toLocalISODate = (d = new Date()) => {
  if (d == null || d === "") return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

const parseLocalDate = (s) => {
  if (s == null || s === "") return new Date(NaN);
  if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ""));
  if (!m) { const d = new Date(s); return Number.isNaN(d.getTime()) ? new Date(NaN) : new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

// The code being replaced, kept so we can assert it actually differed.
const oldWay = (d) => d.toISOString().slice(0, 10);

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};

const TZ = process.env.TZ;
console.log(`\nLocal calendar dates — TZ=${TZ}\n`);

// Sanity: confirm the child really is running in the zone we asked for.
const offsetMin = -new Date("2026-08-08T12:00:00Z").getTimezoneOffset();
check("timezone applied", offsetMin, TZ === "Asia/Kolkata" ? 330 : -240);

if (TZ === "Asia/Kolkata") {
  // The headline bug: early morning IST. 00:30 IST on Aug 8 is Aug 7
  // 19:00 UTC, so toISOString reported YESTERDAY to every user who
  // opened the CRM before 05:30.
  const earlyMorning = new Date("2026-08-07T19:00:00Z"); // 2026-08-08 00:30 IST
  check("00:30 IST → local calendar day", toLocalISODate(earlyMorning), "2026-08-08");
  check("00:30 IST → old UTC way returned yesterday", oldWay(earlyMorning), "2026-08-07");

  // Just after the 05:30 changeover the two agree — which is why this
  // only ever reproduced first thing in the morning.
  const midMorning = new Date("2026-08-08T04:00:00Z"); // 09:30 IST
  check("09:30 IST → both agree", [toLocalISODate(midMorning), oldWay(midMorning)], ["2026-08-08", "2026-08-08"]);

  // Month boundary — this is what shifted MTD. `new Date(y, m, 1)` is
  // local midnight on the 1st, which in IST is 18:30 UTC on the LAST day
  // of the previous month.
  const firstOfMonth = new Date(2026, 7, 1); // 1 Aug 2026, local
  check("1 Aug local → MTD starts 08-01", toLocalISODate(firstOfMonth), "2026-08-01");
  check("1 Aug local → old UTC way started a day early", oldWay(firstOfMonth), "2026-07-31");

  // Quarter boundary, same mechanism.
  const firstOfQuarter = new Date(2026, 6, 1); // 1 Jul 2026, local
  check("1 Jul local → QTD starts 07-01", toLocalISODate(firstOfQuarter), "2026-07-01");
  check("1 Jul local → old UTC way started a day early", oldWay(firstOfQuarter), "2026-06-30");

  // Year boundary is the worst case: MTD in January reported the prior YEAR.
  const firstOfYear = new Date(2026, 0, 1);
  check("1 Jan local → 2026-01-01", toLocalISODate(firstOfYear), "2026-01-01");
  check("1 Jan local → old UTC way crossed into 2025", oldWay(firstOfYear), "2025-12-31");
}

if (TZ === "America/New_York") {
  // Negative offset: late evening rolls the UTC date FORWARD, so the old
  // code reported tomorrow. Same bug, opposite direction — worth covering
  // since the multi-company rollout puts users outside IST.
  const lateEvening = new Date("2026-08-09T02:00:00Z"); // 22:00 EDT on Aug 8
  check("22:00 EDT → local calendar day", toLocalISODate(lateEvening), "2026-08-08");
  check("22:00 EDT → old UTC way returned tomorrow", oldWay(lateEvening), "2026-08-09");

  // Day arithmetic across a DST spring-forward. 8 Mar 2026 02:00 EST →
  // EDT. Adding 7 days must land on the 15th, not the 14th, which is what
  // a naive +7*864e5 on a UTC-parsed date gives.
  const d = parseLocalDate("2026-03-08");
  d.setDate(d.getDate() + 7);
  check("DST spring-forward: 03-08 + 7d → 03-15", toLocalISODate(d), "2026-03-15");

  const naive = new Date(new Date("2026-03-08").getTime() + 7 * 864e5);
  check("DST: naive UTC-parse + 7d drifts", oldWay(naive), "2026-03-15"); // UTC math is fine…
  check("DST: …but naive local render is off by a day", toLocalISODate(naive), "2026-03-14");
}

// ── Zone-independent behaviour ────────────────────────────────────
check("round-trip: format(parse(x)) === x", toLocalISODate(parseLocalDate("2026-08-08")), "2026-08-08");
check("parse yields local midnight", [parseLocalDate("2026-08-08").getHours(), parseLocalDate("2026-08-08").getMinutes()], [0, 0]);
check("parse accepts a full timestamp", toLocalISODate(parseLocalDate("2026-08-08T23:59:59Z")), "2026-08-08");
check("parse accepts a Date and normalises to midnight", parseLocalDate(new Date(2026, 7, 8, 17, 42)).getHours(), 0);

check("invalid string → empty", toLocalISODate("not a date"), "");
check("null → empty (not the 1970 epoch)", toLocalISODate(null), "");
check("empty string → empty", toLocalISODate(""), "");
check("parse(null) → invalid, not epoch", Number.isNaN(parseLocalDate(null).getTime()), true);
check("undefined → today (default arg)", toLocalISODate(undefined), toLocalISODate(new Date()));

// Day arithmetic must not drift across a month end.
const eom = parseLocalDate("2026-01-31");
eom.setDate(eom.getDate() + 1);
check("31 Jan + 1d → 01 Feb", toLocalISODate(eom), "2026-02-01");

// Leap day.
const leap = parseLocalDate("2028-02-28");
leap.setDate(leap.getDate() + 1);
check("leap year: 28 Feb 2028 + 1d → 29 Feb", toLocalISODate(leap), "2028-02-29");

console.log(`\n${fail === 0 ? "✓" : "✗"} ${pass} passed, ${fail} failed  (TZ=${TZ})\n`);
process.exit(fail === 0 ? 0 : 1);
