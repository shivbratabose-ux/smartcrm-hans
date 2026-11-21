// ═══════════════════════════════════════════════════════════════════
// test-my-day.mjs — the home page's due today / overdue / scheduled
// calls / last 7 days lists (src/lib/myDay.js).
// ═══════════════════════════════════════════════════════════════════
import { myDay, addDays } from "../src/lib/myDay.js";

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name); } };

const today = "2026-11-21";
const me = "u_rep";
const activities = [
  { id: "a1", owner: me, type: "Call", status: "Planned", date: today, time: "15:00", title: "Call Acme" },
  { id: "a2", owner: me, type: "Meeting", status: "Planned", date: today, time: "10:00", title: "Meet Beta" },
  { id: "a3", owner: me, type: "Call", status: "Planned", date: "2026-11-18", title: "Old call" },
  { id: "a4", owner: me, type: "Call", status: "Planned", date: "2026-11-24", time: "11:00", title: "Next week call" },
  { id: "a5", owner: me, type: "Call", status: "Planned", date: "2026-11-30", title: "Too far" },
  { id: "a6", owner: "u_mgr", type: "Call", status: "Planned", date: today, title: "Not mine" },
  { id: "a7", owner: me, type: "Meeting", status: "Completed", date: "2026-11-19", title: "Done meeting" },
  { id: "a8", owner: me, type: "Email", status: "Completed", date: "2026-11-10", title: "Too old" },
  { id: "a9", owner: me, type: "Call", status: "Planned", date: today, isDeleted: true, title: "Deleted" },
  { id: "a10", owner: me, type: "Call", status: "Cancelled", date: today, title: "Cancelled" },
];
const callReports = [
  { id: "c1", marketingPerson: me, callDate: "2026-11-20", outcome: "Completed", callType: "Product Demo" },
  { id: "c2", marketingPerson: "u_mgr", participantIds: [me], callDate: "2026-11-17", outcome: "Interested" },
  { id: "c3", marketingPerson: me, callDate: "2026-11-23", callTime: "09:30", outcome: "Interested", company: "Future Co" },
  { id: "c4", marketingPerson: me, callDate: "2026-11-19", outcome: "Rescheduled", company: "Slipped Co" },
  { id: "c5", marketingPerson: me, callDate: "2026-11-01", outcome: "Completed" },
];
const leads = [
  { id: "l1", assignedTo: me, nextCall: today, company: "Lead Today", stage: "MQL", createdDate: "2026-11-20" },
  { id: "l2", assignedTo: me, nextCall: "2026-11-15", company: "Lead Late", stage: "MQL" },
  { id: "l3", assignedTo: me, nextCall: "2026-11-10", company: "Converted", stage: "Converted" },
];
const opps = [
  { id: "o1", owner: me, stage: "Won", closeDate: "2026-11-18", value: 12.5 },
  { id: "o2", owner: me, stage: "Won", closeDate: "2026-10-01", value: 50 },
];
const d = myDay({ activities, callReports, leads, opps, me, today, isWon: o => o.stage === "Won" });

ok("addDays crosses months", addDays("2026-11-28", 6) === "2026-12-04" && addDays(today, -6) === "2026-11-15");
ok("due today: 2 activities + 1 lead call, in time order",
  JSON.stringify(d.dueToday.map(i => i.key)) === JSON.stringify(["act:a2", "act:a1", "lead:l1"]));
ok("due today excludes others', deleted and cancelled", !d.dueToday.some(i => ["act:a6", "act:a9", "act:a10"].includes(i.key)));
ok("overdue: old call, slipped lead, rescheduled call",
  JSON.stringify(d.overdue.map(i => i.key)) === JSON.stringify(["lead:l2", "act:a3", "cr:c4"]));
ok("converted lead not overdue", !d.overdue.some(i => i.key === "lead:l3"));
ok("scheduled calls: today..+6 days, calls only",
  JSON.stringify(d.scheduledCalls.map(i => i.key)) === JSON.stringify(["act:a1", "lead:l1", "cr:c3", "act:a4"]));
ok("meeting isn't a scheduled call", !d.scheduledCalls.some(i => i.key === "act:a2"));
ok("call 9 days out not in the week", !d.scheduledCalls.some(i => i.key === "act:a5"));
ok("last 7 days: 2 calls made (one as participant), 1 demo", d.last7.calls === 2 && d.last7.demos === 1);
ok("last 7 days: 1 meeting, 1 activity done", d.last7.meetings === 1 && d.last7.activitiesDone === 1);
ok("last 7 days: 1 deal won worth 12.5", d.last7.dealsWon === 1 && d.last7.wonValue === 12.5);
ok("last 7 days: 1 lead added", d.last7.leadsAdded === 1);

console.log(`\nmy day: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
