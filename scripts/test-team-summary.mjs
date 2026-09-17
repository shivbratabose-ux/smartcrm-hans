// Verifies the Calendar's Team summary logic — the same module the
// Team view renders. Run: node scripts/test-team-summary.mjs
import { buildTeamSummary, teamColumns, callReportState, workingDaysElapsed, hasCallTarget, offDayMap, offDaysIn, leaveByUser, isLeaveEvent, leaveDaysIn, leaveDatesToCreate, fmtDays,
  canApproveLeave, initialLeaveStatus, lineManagerOf, leaveState, groupLeaveRequests, pendingLeaveFor } from "../src/utils/teamSummary.js";

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

console.log("— call target compliance (5 calls / working day) —");
check("Mon–Fri week, today Thu → 4 working days", workingDaysElapsed("2026-09-07", "2026-09-13", "2026-09-10"), 4);
check("weekend days never count", workingDaysElapsed("2026-09-12", "2026-09-13", "2026-09-30"), 0);
check("future bucket → 0", workingDaysElapsed("2026-09-14", "2026-09-18", "2026-09-10"), 0);
check("full past week → 5", workingDaysElapsed("2026-09-07", "2026-09-13", "2026-09-20"), 5);
check("month Sept 2026 to 30th → 22", workingDaysElapsed("2026-09-01", "2026-09-30", "2026-10-05"), 22);
check("target roles", ["sales_exec", "bd_lead", "country_mgr", "line_mgr"].every(hasCallTarget), true);
check("non-target roles", ["support", "tech_lead", "admin", "md", "viewer", undefined].some(hasCallTarget), false);

const calls = (who, date, n) => Array.from({ length: n }, () => ({ marketingPerson: who, callDate: date, outcome: "No Answer" }));
const c = buildTeamSummary({
  today: "2026-09-10", columns: wk,
  users: [
    { id: "se", name: "Exec", role: "sales_exec" },
    { id: "lm", name: "Line", role: "line_mgr" },
    { id: "sp", name: "Support", role: "support" },
  ],
  callReports: [
    ...calls("se", "2026-09-07", 5), ...calls("se", "2026-09-08", 5), ...calls("se", "2026-09-09", 6), ...calls("se", "2026-09-10", 4),
    ...calls("lm", "2026-09-07", 3), ...calls("lm", "2026-09-09", 5),
    ...calls("sp", "2026-09-08", 9),
    ...calls("se", "2026-09-11", 5).map(r => ({ ...r, outcome: "Rescheduled" })), // future plan, not a call made
  ],
});
const SE = c.rows.find(r => r.user.id === "se"), LM = c.rows.find(r => r.user.id === "lm"), SP = c.rows.find(r => r.user.id === "sp");
check("exec target to date = 5 × 4", SE.callTarget, 20);
check("exec 20 calls → 100%", SE.callCompliancePct, 100);
check("Saturday cell carries no target", SE.cellTargets["2026-09-12"], 0);
check("future Friday cell carries no target", SE.cellTargets["2026-09-11"], 0);
check("line manager 8 / 20 → 40%", [LM.callTarget, LM.callCompliancePct], [20, 40]);
check("support has no target, no compliance", [SP.targeted, SP.callTarget, SP.callCompliancePct], [false, 0, null]);
check("team compliance excludes non-target roles", c.compliance, { target: 40, calls: 28, eligible: 2, onTarget: 1, pct: 70, leaveDays: 0 });

console.log("— holidays & admin days —");
const hol = [
  { date: "2026-09-08", name: "Festival", type: "Holiday" },     // Tue
  { date: "2026-09-10", name: "Offsite", type: "Admin day" },    // Thu
  { date: "2026-09-12", name: "Sat event", type: "Admin day" },  // Sat → no effect
  { date: "bad", name: "Junk" },                                 // ignored
];
const off = offDayMap(hol);
check("invalid dates ignored", off.size, 3);
check("holiday + admin day drop from working days", workingDaysElapsed("2026-09-07", "2026-09-13", "2026-09-20", off), 3);
check("weekend off-day changes nothing", workingDaysElapsed("2026-09-12", "2026-09-13", "2026-09-20", off), 0);
check("only weekday off-days listed", offDaysIn("2026-09-07", "2026-09-13", off).map(h => h.name), ["Festival", "Offsite"]);

const h = buildTeamSummary({
  today: "2026-09-10", columns: wk, holidays: hol,
  users: [{ id: "se", name: "Exec", role: "sales_exec" }],
  callReports: [...calls("se", "2026-09-07", 5), ...calls("se", "2026-09-08", 2), ...calls("se", "2026-09-09", 5)],
});
const HS = h.rows[0];
check("target to Thu with Tue+Thu off = 5 × 2", HS.callTarget, 10);
check("holiday cell carries no target", HS.cellTargets["2026-09-08"], 0);
check("calls on a holiday still count → 12 / 10 = 120%", [HS.total.callsMade, HS.callCompliancePct], [12, 120]);
check("column off-days exposed for headers", h.columnOffDays["2026-09-10"].map(x => x.type), ["Admin day"]);
check("period off-day list", h.offDays.length, 2);
const mh = buildTeamSummary({ today: "2026-09-30", columns: teamColumns("month", "2026-09-14"), holidays: hol, users: [{ id: "se", name: "Exec", role: "sales_exec" }] });
check("month target Sept 2026 = 5 × (22 − 2)", mh.rows[0].callTarget, 100);

console.log("— individual leave —");
const lv = (owner, date, type = "Leave", extra = {}) => ({ id: `lv${date}${type}`, owner, date, type, title: "On leave", status: "Scheduled", ...extra });
const leaveEvents = [
  lv("se", "2026-09-07"),                                   // Mon full day
  lv("se", "2026-09-09", "Half-day leave"),                 // Wed half
  lv("se", "2026-09-12"),                                   // Sat → no effect
  lv("se", "2026-09-08", "Leave", { status: "Cancelled" }), // ignored
  lv("se", "2026-09-10", "Leave", { isDeleted: true }),     // ignored
  lv("lm", "2026-09-11"),                                   // future (today Thu) → planned
];
const lmap = leaveByUser(leaveEvents);
check("cancelled / deleted leave ignored", [...lmap.get("se").keys()].sort(), ["2026-09-07", "2026-09-09", "2026-09-12"]);
check("half day = 0.5", lmap.get("se").get("2026-09-09"), 0.5);
check("full + half on same day caps at 1", leaveByUser([lv("x", "2026-09-07"), lv("x", "2026-09-07", "Half-day leave")]).get("x").get("2026-09-07"), 1);
check("isLeaveEvent", [isLeaveEvent(lv("a", "2026-09-07")), isLeaveEvent({ type: "Meeting" })], [true, false]);
check("working days minus 1.5 leave → 2.5", workingDaysElapsed("2026-09-07", "2026-09-13", "2026-09-10", new Map(), lmap.get("se")), 2.5);
check("holiday on a leave day not double-counted", leaveDaysIn("2026-09-07", "2026-09-07", lmap.get("se"), offDayMap([{ date: "2026-09-07", name: "H" }])), 0);
check("create dates skip weekend, holiday and existing leave",
  leaveDatesToCreate("2026-09-04", "2026-09-09", offDayMap([{ date: "2026-09-08", name: "H" }]), lmap.get("se")), ["2026-09-04"]);
check("fmtDays", [fmtDays(20), fmtDays(12.5)], ["20", "12.5"]);

const L = buildTeamSummary({
  today: "2026-09-10", columns: wk,
  users: [{ id: "se", name: "Exec", role: "sales_exec" }, { id: "lm", name: "Line", role: "line_mgr" }, { id: "fl", name: "Away", role: "bd_lead" }],
  events: [...leaveEvents, ...["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10"].map(d => lv("fl", d))],
  callReports: [...calls("se", "2026-09-08", 5), ...calls("se", "2026-09-09", 3), ...calls("se", "2026-09-10", 5)],
});
const LS = L.rows.find(r => r.user.id === "se"), LL = L.rows.find(r => r.user.id === "lm"), LF = L.rows.find(r => r.user.id === "fl");
check("exec target 5 × 2.5 = 12.5", LS.callTarget, 12.5);
check("exec 13 / 12.5 → 104%", LS.callCompliancePct, 104);
check("full leave cell target 0, half day 2.5", [LS.cellTargets["2026-09-07"], LS.cellTargets["2026-09-09"]], [0, 2.5]);
check("exec leave days in week = 1.5 (Sat ignored)", LS.leaveDays, 1.5);
check("future leave shows in cell but target untouched so far", [LL.cellLeave["2026-09-11"], LL.callTarget], [1, 20]);
check("leave is never pending / overdue / a meeting", [LS.total.pending, LS.total.overdue, LS.total.meetings, LL.total.pending], [0, 0, 0, 0]);
check("on leave all week to date → no target, no compliance", [LF.callTarget, LF.callCompliancePct], [0, null]);
check("team leave days", L.compliance.leaveDays, 1.5 + 1 + 4);
check("fully-away member not eligible", L.compliance.eligible, 2);

console.log("— leave approval —");
const org = [
  { id: "ad", name: "Admin", role: "admin" },
  { id: "vp", name: "VP", role: "vp_sales_mkt" },
  { id: "cm", name: "Country", role: "country_mgr" },
  { id: "lm1", name: "LineMgr", role: "line_mgr", reportsTo: "cm" },
  { id: "rep", name: "Rep", role: "sales_exec", reportsTo: "lm1" },
  { id: "peer", name: "Peer", role: "sales_exec", reportsTo: "lm1" },
  { id: "orph", name: "No manager", role: "sales_exec" },
  { id: "loopA", role: "sales_exec", reportsTo: "loopB" }, { id: "loopB", role: "sales_exec", reportsTo: "loopA" },
];
check("line manager can approve", canApproveLeave("lm1", "rep", org), true);
check("manager's manager can approve", canApproveLeave("cm", "rep", org), true);
check("global role can approve", [canApproveLeave("ad", "rep", org), canApproveLeave("vp", "orph", org)], [true, true]);
check("peer / self / report-of cannot approve", [canApproveLeave("peer", "rep", org), canApproveLeave("rep", "rep", org), canApproveLeave("rep", "lm1", org)], [false, false, false]);
check("reporting loop terminates", canApproveLeave("ad2", "loopA", org), false);
check("rep marking own leave → pending", initialLeaveStatus("rep", "rep", org), "Pending approval");
check("line manager marking for report → approved", initialLeaveStatus("lm1", "rep", org), "Approved");
check("line manager's own leave → pending (for country mgr)", initialLeaveStatus("lm1", "lm1", org), "Pending approval");
check("admin's own leave → approved", initialLeaveStatus("ad", "ad", org), "Approved");
check("lineManagerOf", [lineManagerOf("rep", org)?.id, lineManagerOf("orph", org)], ["lm1", null]);
check("legacy Scheduled leave = approved", leaveState({ type: "Leave", status: "Scheduled" }), "approved");
check("pending / rejected / cancelled states", ["Pending approval", "Rejected", "Cancelled"].map(s => leaveState({ type: "Leave", status: s })), ["pending", "rejected", "cancelled"]);

const req = (rid, owner, dates, status, type = "Leave") => dates.map(d => ({ id: `lv_${rid}_${d}`, owner, date: d, type, status, notes: "Family function" }));
const apprEvents = [
  ...req("r1", "rep", ["2026-09-07", "2026-09-08"], "Pending approval"),
  ...req("r2", "peer", ["2026-09-09"], "Rejected"),
  ...req("r3", "rep", ["2026-09-10"], "Approved", "Half-day leave"),
  ...req("r4", "orph", ["2026-09-11"], "Pending approval"),
];
const groups = groupLeaveRequests(apprEvents);
const g1 = groups.find(g => g.id === "r1");
check("request groups by id prefix", [g1.dates, g1.days, g1.state, g1.reason], [["2026-09-07", "2026-09-08"], 2, "pending", "Family function"]);
check("groups sorted newest first", groups.map(g => g.id), ["r4", "r3", "r2", "r1"]);
check("line manager sees their report's pending only", pendingLeaveFor("lm1", apprEvents, org).map(g => g.id), ["r1"]);
check("admin sees all pending incl. no-manager rep", pendingLeaveFor("ad", apprEvents, org).map(g => g.id), ["r4", "r1"]);
check("rep sees nothing to approve", pendingLeaveFor("rep", apprEvents, org).length, 0);
check("only approved leave counts", [...leaveByUser(apprEvents).keys()], ["rep"]);
check("includePending blocks re-requesting pending days", [...leaveByUser(apprEvents, { includePending: true }).get("rep").keys()].sort(), ["2026-09-07", "2026-09-08", "2026-09-10"]);

const P = buildTeamSummary({ today: "2026-09-10", columns: wk, users: [{ id: "rep", name: "Rep", role: "sales_exec" }], events: apprEvents });
check("pending leave shown, target not reduced", [P.rows[0].pendingLeaveDays, P.rows[0].cellPendingLeave["2026-09-07"], P.rows[0].leaveDays, P.rows[0].callTarget], [2, 1, 0.5, 17.5]);
check("rejected leave neither counts nor shows as pending", buildTeamSummary({ today: "2026-09-10", columns: wk, users: [{ id: "peer", name: "P", role: "sales_exec" }], events: apprEvents }).rows[0].callTarget, 20);

console.log("— admin day (individual) —");
const adEvents = [
  { id: "lv_a1_2026-09-08", owner: "se", date: "2026-09-08", type: "Admin day", status: "Approved" },
  { id: "lv_a2_2026-09-09", owner: "se", date: "2026-09-09", type: "Admin day", status: "Pending approval" },
  { id: "lv_a3_2026-09-07", owner: "se", date: "2026-09-07", type: "Leave", status: "Approved" },
];
const AD = buildTeamSummary({ today: "2026-09-10", columns: wk, users: [{ id: "se", name: "Exec", role: "sales_exec" }], events: adEvents }).rows[0];
check("approved admin day + leave off target: 5 × (4 − 2)", AD.callTarget, 10);
check("admin day counted separately from leave", [AD.leaveDays, AD.adminDayCount, AD.cellAdminDays["2026-09-08"], AD.cellAdminDays["2026-09-07"]], [2, 1, 1, 0]);
check("pending admin day shown, not deducted", [AD.pendingLeaveDays, AD.cellTargets["2026-09-09"]], [1, 5]);
check("admin day is a leave type (approval flow, never pending work)", [isLeaveEvent({ type: "Admin day", status: "Approved" }), AD.total.pending, AD.total.overdue], [true, 0, 0]);
check("admin day grouped as its own request", groupLeaveRequests(adEvents).find(g => g.id === "a1").type, "Admin day");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
