// ═══════════════════════════════════════════════════════════════════
// test-dates.mjs — verifies the local-calendar date helpers in
// mobile/src/utils/format.ts.
// ───────────────────────────────────────────────────────────────────
// Re-execs itself under Asia/Kolkata (our users) and America/New_York
// (negative offset + DST), so these are real timezone assertions.
//
// format.ts is TypeScript and the app's node_modules aren't committed, so
// — same convention as the web app's scripts/test-*.mjs — the pure
// functions are mirrored below. KEEP IN SYNC with format.ts.
// ═══════════════════════════════════════════════════════════════════

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ZONES = ["Asia/Kolkata", "America/New_York"];

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

// ── Mirror of mobile/src/utils/format.ts ──────────────────────────
const toLocalISODate = (d = new Date()) => {
  if (d == null || d === "") return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

const parseLocalDate = (value) => {
  if (value == null || value === "") return new Date(NaN);
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const bare = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (bare) return new Date(Number(bare[1]), Number(bare[2]) - 1, Number(bare[3]));
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return new Date(NaN);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const daysFromToday = (iso) => {
  const target = parseLocalDate(iso);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - parseLocalDate(new Date()).getTime()) / 864e5);
};

const todayIso = () => toLocalISODate(new Date());

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
};

const TZ = process.env.TZ;
const IST = TZ === "Asia/Kolkata";
console.log(`\nMobile calendar dates — TZ=${TZ}\n`);

check("timezone applied", -new Date("2026-08-08T12:00:00Z").getTimezoneOffset(), IST ? 330 : -240);

// ── The date pickers ──────────────────────────────────────────────
// @react-native-community/datetimepicker hands back a Date at LOCAL
// midnight on the day tapped. Formatting that with toISOString subtracts
// the offset, so in IST every pick was stored as the day before: tapping
// "15 Aug" in Reschedule saved "14 Aug".
{
  const tapped = new Date(2026, 7, 15);
  check("picker → local midnight → correct date stored", toLocalISODate(tapped), "2026-08-15");
  check("picker → old toISOString path", tapped.toISOString().slice(0, 10), IST ? "2026-08-14" : "2026-08-15");
  check("picker value prop round-trips", toLocalISODate(parseLocalDate("2026-08-15")), "2026-08-15");
  check("parsed picker value is local midnight", [parseLocalDate("2026-08-15").getHours(), parseLocalDate("2026-08-15").getDate()], [0, 15]);
}

// ── todayIso, which the Today/Plan tabs query on ──────────────────
if (IST) {
  // 00:30 IST is 19:00 UTC the previous day, so the Plan and Today tabs
  // showed yesterday's agenda to anyone opening the app before 05:30.
  const early = new Date("2026-08-07T19:00:00Z");
  check("00:30 IST → local calendar day", toLocalISODate(early), "2026-08-08");
  check("00:30 IST → old UTC way returned yesterday", early.toISOString().slice(0, 10), "2026-08-07");
} else {
  const lateEvening = new Date("2026-08-09T02:00:00Z"); // 22:00 EDT Aug 8
  check("22:00 EDT → local calendar day", toLocalISODate(lateEvening), "2026-08-08");
  check("22:00 EDT → old UTC way returned tomorrow", lateEvening.toISOString().slice(0, 10), "2026-08-09");
}
check("todayIso matches the local calendar day", todayIso(), toLocalISODate(new Date()));

// ── Plan window bounds (usePlan dateRangeFor) ─────────────────────
{
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const week = new Date(); week.setDate(week.getDate() + 7);
  check("plan window: tomorrow is today + 1 day", daysFromToday(toLocalISODate(tomorrow)), 1);
  check("plan window: week bound is today + 7 days", daysFromToday(toLocalISODate(week)), 7);
}

// ── Relative labels + overdue, anchored on calendar days ──────────
{
  const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return toLocalISODate(d); };
  check("daysFromToday(today) === 0", daysFromToday(todayIso()), 0);
  check("daysFromToday(+1) === 1", daysFromToday(plus(1)), 1);
  check("daysFromToday(-1) === -1", daysFromToday(plus(-1)), -1);
  // A deal closing today must not read as overdue during its own close date —
  // the instant-based comparison floored to -1 for most of the day in IST.
  check("closing today is not overdue", (daysFromToday(todayIso()) ?? 0) < 0, false);
}

// ── DST + boundaries ──────────────────────────────────────────────
if (!IST) {
  const d = parseLocalDate("2026-03-08"); // spring-forward
  d.setDate(d.getDate() + 7);
  check("DST spring-forward: 03-08 + 7d → 03-15", toLocalISODate(d), "2026-03-15");
}
{
  const eom = parseLocalDate("2026-01-31"); eom.setDate(eom.getDate() + 1);
  check("31 Jan + 1d → 01 Feb", toLocalISODate(eom), "2026-02-01");
  const leap = parseLocalDate("2028-02-28"); leap.setDate(leap.getDate() + 1);
  check("leap year: 28 Feb 2028 + 1d → 29 Feb", toLocalISODate(leap), "2028-02-29");
}

// ── Null guards ───────────────────────────────────────────────────
check("null → empty (not the 1970 epoch)", toLocalISODate(null), "");
check("empty string → empty", toLocalISODate(""), "");
check("daysFromToday(null) → null", daysFromToday(null), null);
check("parse(null) → invalid, not epoch", Number.isNaN(parseLocalDate(null).getTime()), true);

// A full timestamp resolves to the local calendar day it falls on.
check("timestamp → local calendar day", toLocalISODate(parseLocalDate("2026-08-08T12:00:00Z")), "2026-08-08");

console.log(`\n${fail === 0 ? "✓" : "✗"} ${pass} passed, ${fail} failed  (TZ=${TZ})\n`);
process.exit(fail === 0 ? 0 : 1);
