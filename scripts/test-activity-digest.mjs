// Tests the daily / weekly activity digest: which period each report covers,
// who receives which sections, the numbers (shared with the Calendar's Team
// view via teamSummary.js), leave, escaping, and the weekly comparison.
// Imports the REAL module the edge function uses.
// Run: node scripts/test-activity-digest.mjs
import {
  isSendDay, dailyPeriod, weeklyPeriod, wonStageNames, planDigests, esc, fmtRange, addDays,
} from "../supabase/functions/activity-digest/logic.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`}`);
};

// Calendar: Tue 13 Oct 2026. Mon 12, Sat 10, Sun 11. 2 Oct (Fri) is Gandhi Jayanti.
const HOLIDAYS = [{ date: "2026-10-02", name: "Gandhi Jayanti", type: "Holiday" }];

console.log("\nWhich days send, and what each report covers");
check("Sunday never sends", isSendDay("2026-10-11"), false);
check("Saturday sends", isSendDay("2026-10-10"), true);
check("a holiday does not send", isSendDay("2026-10-02", HOLIDAYS), false);
check("Tuesday's daily covers Monday", dailyPeriod("2026-10-13"), { from: "2026-10-12", to: "2026-10-12" });
check("Monday's daily covers Saturday and Sunday", dailyPeriod("2026-10-12"), { from: "2026-10-10", to: "2026-10-11" });
check("Saturday's daily covers Friday", dailyPeriod("2026-10-10"), { from: "2026-10-09", to: "2026-10-09" });
check("the day after a holiday includes it", dailyPeriod("2026-10-03", HOLIDAYS), { from: "2026-10-01", to: "2026-10-02" });
check("weekly on Monday 12 Oct covers 5–11 Oct", weeklyPeriod("2026-10-12"), { from: "2026-10-05", to: "2026-10-11" });
check("weekly is stable through the week", weeklyPeriod("2026-10-13"), { from: "2026-10-05", to: "2026-10-11" });
check("range label, same month", fmtRange("2026-10-05", "2026-10-11"), "5–11 Oct");
check("range label, single day", fmtRange("2026-10-12", "2026-10-12"), "Mon 12 Oct");
check("addDays crosses months", addDays("2026-10-01", -1), "2026-09-30");

console.log("\nWon deals are found by stage KIND");
check("renamed won stage still counts", [...wonStageNames([{ name: "Closed Won", kind: "won" }, { name: "Won", kind: "open" }])], ["Closed Won"]);
check("no stage config → 'Won'", [...wonStageNames([])], ["Won"]);

// ── A small org ────────────────────────────────────────────────────────
const USERS = [
  { id: "vp", name: "Vera VP", email: "vp@x.com", role: "vp_sales_mkt", reportsTo: null, active: true },
  { id: "lm", name: "Lal Manager", email: "lm@x.com", role: "line_mgr", reportsTo: "vp", active: true },
  { id: "a", name: "Asha Rep", email: "a@x.com", role: "sales_exec", reportsTo: "lm", active: true },
  { id: "b", name: "Bala Rep", email: "b@x.com", role: "sales_exec", reportsTo: "lm", active: true },
  { id: "c", name: "Chitra Rep", email: "c@x.com", role: "sales_exec", reportsTo: "lm", active: true },
  { id: "s", name: "Sam Support", email: "s@x.com", role: "support", reportsTo: null, active: true },
  { id: "x", name: "Ex Employee", email: "x@x.com", role: "sales_exec", reportsTo: "lm", active: false },
  { id: "u1", name: "Shivbrata Bose", email: "sb@x.com", role: "admin", reportsTo: null, active: true },
];
const MON = "2026-10-12", TUE = "2026-10-13";
const DATA = {
  users: USERS,
  callReports: [
    { marketingPerson: "a", callDate: MON, outcome: "Completed", callType: "Telephone Call" },
    { marketingPerson: "a", callDate: MON, outcome: "No Answer", callType: "Telephone Call" },
    { marketingPerson: "a", participantIds: ["lm"], callDate: MON, outcome: "Completed", callType: "Demo" },
    { marketingPerson: "a", callDate: MON, outcome: "Completed", isDeleted: true },
    { marketingPerson: "x", callDate: MON, outcome: "Completed" },
  ],
  activities: [
    { owner: "a", date: MON, type: "Meeting", status: "Completed", title: "Kick-off" },
    { owner: "a", date: TUE, time: "11:00", type: "Call", status: "Planned", title: "Call <script>alert(1)</script> & co" },
    { owner: "a", date: TUE, time: "09:30", type: "Demo", status: "Planned", title: "WiseCargo demo" },
    { owner: "a", date: "2026-10-09", type: "Call", status: "Planned", title: "Old" },
    { owner: "s", date: MON, type: "Email", status: "Completed", title: "Ticket reply" },
  ],
  events: [
    { owner: "c", date: MON, type: "Leave", status: "Approved", title: "Leave" },
  ],
  leads: [
    { id: "l1", owner: "a", company: "ACME", createdDate: MON, source: "Website", contact: "Anita", product: "WiseCargo", stage: "MQL" },
    { id: "l2", owner: "a", company: "BETA", createdDate: "2026-09-01", nextCall: "2026-10-10", stage: "SQL" },
    { id: "l3", owner: "a", company: "GAMMA", createdDate: "2026-09-01", nextCall: "2026-10-10", stage: "Converted" },
  ],
  quotes: [{ owner: "a", sentDate: MON, quoteNo: "Q1" }],
  opps: [
    { owner: "a", stage: "Closed Won", closeDate: MON, value: 12.5, createdDate: "2026-09-01" },
    { owner: "a", stage: "Prospect", closeDate: "2026-12-01", value: 4, createdDate: MON },
  ],
};
const STAGES = [{ name: "Closed Won", kind: "won" }, { name: "Prospect", kind: "open" }];

console.log("\nDaily (Tue 13 Oct, covering Mon 12 Oct) — recipients");
const d = planDigests({ kind: "daily", today: TUE, data: DATA, holidays: HOLIDAYS, stages: STAGES, rollupUserIds: ["u1"] });
const byId = Object.fromEntries(d.messages.map(m => [m.recipient.id, m]));
const types = (id) => byId[id]?.sections.map(s => s.type) ?? null;
check("period is Monday", d.period, { from: MON, to: MON });
check("rep with a target gets a personal section", types("a"), ["personal"]);
check("quiet rep still gets one (target applies)", types("b"), ["personal"]);
check("line manager: personal + team", types("lm"), ["personal", "team"]);
check("VP: team (LM reports to VP) + company", types("vp"), ["team", "company"]);
check("support with logged work: personal only", types("s"), ["personal"]);
check("extra roll-up user (admin u1) gets company", types("u1"), ["company"]);
check("inactive user gets nothing", byId.x, undefined);

console.log("\nDaily — numbers (shared with the Team view)");
const a = byId.a.sections[0].me;
check("calls made: 3 (deleted ignored)", a.row.total.callsMade, 3);
check("connected: 2", a.row.total.connected, 2);
check("target: 5 for one working day", a.row.callTarget, 5);
check("compliance 60%", a.row.callCompliancePct, 60);
check("meeting counted", a.row.total.meetings, 1);
check("new lead, quote, won deal, pipeline added", [a.x.newLeads, a.x.quotesSent, a.x.dealsWon, a.x.wonValue, a.x.pipelineAdded], [1, 1, 1, 12.5, 4]);
check("shared demo credits the participant too", byId.lm.sections[0].me.row.total.callsMade, 1);
const c = byId.lm.sections[1].people.find(p => p.user.id === "c");
check("approved leave removes the day's target", [c.row.callTarget, c.leaveDays], [0, 1]);
const b = byId.lm.sections[1].people.find(p => p.user.id === "b");
check("quiet rep flagged", b.quiet, true);
check("inactive user not in the team table", byId.lm.sections[1].people.some(p => p.user.id === "x"), false);

console.log("\nDaily — today's plan");
const plan = byId.a.sections[0].plan;
check("planned today, sorted by time", plan.planned.map(x => x.title), ["WiseCargo demo", "Call <script>alert(1)</script> & co"]);
check("overdue planned activities", plan.overdue, 1);
check("lead follow-ups due (closed lead excluded)", plan.followUps.map(l => l.company), ["BETA"]);
check("new website lead listed", plan.newWebsiteLeads.map(l => l.company), ["ACME"]);

console.log("\nDaily — e-mail");
const html = byId.a.html;
check("subject carries the headline numbers", byId.a.subject, "SmartCRM daily · Mon 12 Oct — 3 calls, 1 meeting");
check("user text is escaped", [html.includes("<script>alert(1)</script>"), html.includes("&lt;script&gt;alert(1)&lt;/script&gt; &amp; co")], [false, true]);
check("shows calls vs target", html.includes("60% of target (5)"), true);
check("company table has a company total row", byId.vp.html.includes("<b>Company</b>"), true);
check("company groups by manager", byId.vp.html.includes("Lal Manager&#39;s team"), true);
check("quiet reps are called out for managers", byId.lm.html.includes("Nothing logged"), true);
check("esc handles quotes", esc(`"a'b"`), "&quot;a&#39;b&quot;");
check("declares UTF-8 (· and — would garble without it)", html.includes('<meta charset="utf-8">'), true);
check("tiles wrap on phones (no fixed 4-column table)", [html.includes("display:inline-block;vertical-align:top;width:136px"), html.includes('cellspacing="6"')], [true, false]);

console.log("\nMonday daily covers the weekend: no target, work still counts");
const wkend = planDigests({ kind: "daily", today: MON, data: { ...DATA, callReports: [{ marketingPerson: "a", callDate: "2026-10-10", outcome: "Completed" }] }, holidays: HOLIDAYS, stages: STAGES });
const aw = wkend.messages.find(m => m.recipient.id === "a").sections[0].me.row;
check("weekend period", wkend.period, { from: "2026-10-10", to: "2026-10-11" });
check("Saturday call counted, target 0", [aw.total.callsMade, aw.callTarget, aw.callCompliancePct], [1, 0, null]);

console.log("\nWeekly (Mon 12 Oct, covering 5–11 Oct) with last-week comparison");
const W = { ...DATA, callReports: [
  ...["2026-10-05", "2026-10-06", "2026-10-07"].map(dt => ({ marketingPerson: "a", callDate: dt, outcome: "Completed" })),
  { marketingPerson: "a", callDate: "2026-09-29", outcome: "Completed" },
] };
const wk = planDigests({ kind: "weekly", today: MON, data: W, holidays: HOLIDAYS, stages: STAGES });
const aMsg = wk.messages.find(m => m.recipient.id === "a");
check("weekly period", wk.period, { from: "2026-10-05", to: "2026-10-11" });
check("week calls and 5-day target", [aMsg.sections[0].me.row.total.callsMade, aMsg.sections[0].me.row.callTarget], [3, 25]);
check("previous week remembered", aMsg.sections[0].me.prevCalls, 1);
check("weekly has no 'today' plan", aMsg.sections[0].plan, null);
check("weekly subject", aMsg.subject, "SmartCRM weekly · 5–11 Oct — 3 calls, 0 meetings");
check("delta shown vs last week", aMsg.html.includes("+2 vs last week"), true);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
