// Verifies the Calendar's Team summary logic — the same module the
// Team view renders. Run: node scripts/test-team-summary.mjs
import { buildTeamSummary, teamColumns, callReportState } from "../src/utils/teamSummary.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)} got ${JSON.stringify(got)}`}`);
};

console.log("— columns —");
const wk = teamColumns("week", "2026-09-10"); // Thursday
check("week starts Monday", wk[0].from, "2026-09-07");
check("week ends Sunday", wk[6].to, "2026-09-13");
check("7 day columns", wk.length, 7);
check("week anchored on a Sunday still Mon-start", teamColumns("week", "2026-09-13")[0].from, "2026-09-07");
const mo = teamColumns("month", "2026-09-14");
check("month first bucket starts on the 1st", mo[0].from, "2026-09-01");
check("month last bucket clipped to the 30th", mo[mo.length - 1].to, "2026-09-30");
check("buckets contiguous", mo.every((c, i) => i === 0 || c.from > mo[i - 1].to), true);

console.log("— counting —");
const today = "2026-09-10";
const users = [{ id: "a", name: "Asha" }, { id: "b", name: "Bala" }, { id: "z", name: "Zero Work" }];
const s = buildTeamSummary({
  today, users, columns: wk,
  callReports: [
    { marketingPerson: "a", callDate: "2026-09-08", outcome: "Completed" },
    { marketingPerson: "a", callDate: "2026-09-08", outcome: "No Answer" },    // attempt, not connected
    { marketingPerson: "a", callDate: "2026-09-09", outcome: "Rescheduled" },  // past reschedule → overdue
    { marketingPerson: "a", callDate: "2026-09-12", outcome: "Completed" },    // future-dated → pending
    { marketingPerson: "b", callDate: "2026-09-01", outcome: "Completed" },    // outside week → ignored
    { marketingPerson: "x", callDate: "2026-09-08", outcome: "Completed" },    // out of scope → ignored
    { marketingPerson: "a", callDate: "2026-09-08", outcome: "Completed", isDeleted: true },
  ],
  activities: [
    { owner: "b", date: "2026-09-09", type: "Call", status: "Completed" },
    { owner: "b", date: "2026-09-09", type: "Meeting", status: "Completed" },
    { owner: "b", date: "2026-09-08", type: "Email", status: "Completed" },
    { owner: "b", date: "2026-09-07", type: "Call", status: "Planned" },       // overdue
    { owner: "b", date: "2026-09-11", type: "Demo", status: "Planned" },       // pending
    { owner: "b", date: "2026-09-08", type: "Call", status: "Cancelled" },     // neither
  ],
  events: [{ owner: "a", date: "2026-09-10", type: "Meeting", status: "Completed" }],
});
const A = s.rows.find(r => r.user.id === "a"), B = s.rows.find(r => r.user.id === "b"), Z = s.rows.find(r => r.user.id === "z");
check("A calls made (attempts count)", A.total.callsMade, 2);
check("A connected", A.total.connected, 1);
check("A completed event counts as meeting", A.total.meetings, 1);
check("A past reschedule is overdue", A.total.overdue, 1);
check("A future-dated report is pending", A.total.pending, 1);
check("B completed call activity", [B.total.callsMade, B.total.connected], [1, 1]);
check("B meetings / other", [B.total.meetings, B.total.otherDone], [1, 1]);
check("B planned: overdue 1, pending 1; cancelled ignored", [B.total.overdue, B.total.pending], [1, 1]);
check("deleted / out-of-scope / out-of-range ignored", s.totals.connected, 2);
check("zero-activity member still listed", !!Z && Z.done === 0, true);
check("zero member has no completion %", Z.completionPct, null);
check("A completion = 3 done / (3 + 1 overdue)", A.completionPct, 75);
check("rows sorted by done desc", s.rows.map(r => r.user.id), ["a", "b", "z"]);
check("day cell lands on the right day", A.cells["2026-09-08"].callsMade, 2);
check("column total sums users", s.columnTotals["2026-09-09"].meetings + s.columnTotals["2026-09-09"].callsMade, 2);
check("grand done total", s.totalsDone, 6);

console.log("— shared call-report rule (Calendar header uses this too) —");
const T = "2026-09-14";
check("past No Answer = made, not overdue", callReportState("No Answer", "2026-09-01", T), "made");
check("past Voicemail = made", callReportState("Voicemail", "2026-09-01", T), "made");
check("past Left Message = made", callReportState("Left Message", "2026-09-01", T), "made");
check("past Completed = made", callReportState("Completed", "2026-09-01", T), "made");
check("today No Answer = made", callReportState("No Answer", T, T), "made");
check("past Rescheduled = overdue", callReportState("Rescheduled", "2026-09-01", T), "overdue");
check("today Rescheduled = pending", callReportState("Rescheduled", T, T), "pending");
check("future-dated any outcome = pending", callReportState("Completed", "2026-09-20", T), "pending");
check("blank outcome in the past = made (a logged call)", callReportState("", "2026-09-01", T), "made");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
