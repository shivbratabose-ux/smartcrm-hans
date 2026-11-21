// A closed deal's close date locks one month after it; only an Admin can then
// change it or reopen the deal. Run: node scripts/test-deal-lock.mjs
import { closeLockDate, closedDealLock, guardClosedDeal, canOverrideClosedDeal } from "../src/lib/dealLock.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};
const ctx = (today, role = "sales_exec") => ({ today, role, closedStages: ["Won", "Lost"] });
const won = { id: "o1", stage: "Won", probability: 100, closeDate: "2026-10-15", value: 3 };

check("locks one calendar month after the close date", [closeLockDate("2026-10-15"), closeLockDate("2026-01-31"), closeLockDate("2028-01-31"), closeLockDate("2026-12-20"), closeLockDate("")], ["2026-11-15", "2026-02-28", "2028-02-29", "2027-01-20", ""]);
check("within the month the deal's editors can still correct it", closedDealLock(won, ctx("2026-11-14")).locked, false);
check("from the lock date it is locked for everyone but an Admin", [closedDealLock(won, ctx("2026-11-15")).locked, closedDealLock(won, ctx("2026-12-01", "line_mgr")).locked, closedDealLock(won, ctx("2026-12-01", "md")).locked, closedDealLock(won, ctx("2026-12-01", "admin")).locked], [true, true, true, false]);
check("an Admin is told it is past the lock date but may change it", [closedDealLock(won, ctx("2026-12-01", "admin")).past, canOverrideClosedDeal("admin"), canOverrideClosedDeal("director")], [true, true, false]);
check("Lost deals lock the same way", closedDealLock({ ...won, stage: "Lost" }, ctx("2026-12-01")).locked, true);
check("open deals never lock, however old the date", closedDealLock({ ...won, stage: "Negotiation" }, ctx("2027-06-01")).locked, false);
check("a closed deal with no close date does not lock", closedDealLock({ ...won, closeDate: "" }, ctx("2027-06-01")).locked, false);
check("a renamed Won stage is honoured", closedDealLock({ ...won, stage: "Closed – Won" }, { today: "2026-12-01", role: "sales_exec", closedStages: ["Closed – Won", "Closed – Lost"] }).locked, true);
check("the reason names the date and who can change it", closedDealLock(won, ctx("2026-12-01")).reason, "Closed Won on 2026-10-15: the close date locked on 2026-11-15. Only an Admin can change it or reopen the deal.");

const g1 = guardClosedDeal(won, { ...won, closeDate: "2026-11-30", notes: "x" }, ctx("2026-12-01"));
check("a save that moves a locked close date keeps the old date and the rest of the edit", [g1.next.closeDate, g1.next.notes, g1.blocked], ["2026-10-15", "x", ["closeDate"]]);
const g2 = guardClosedDeal(won, { ...won, stage: "Negotiation", probability: 75 }, ctx("2026-12-01"));
check("reopening a locked deal is blocked too", [g2.next.stage, g2.next.probability, g2.blocked], ["Won", 100, ["stage"]]);
check("an Admin's save goes through untouched", guardClosedDeal(won, { ...won, closeDate: "2026-11-30" }, ctx("2026-12-01", "admin")).blocked, []);
check("before the lock date nothing is blocked", guardClosedDeal(won, { ...won, closeDate: "2026-10-20" }, ctx("2026-11-01")).blocked, []);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
