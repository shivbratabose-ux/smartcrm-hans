// ═══════════════════════════════════════════════════════════════════
// test-call-slots.mjs — at most 2 calls per user per hour slot,
// enforced only on calls added or moved from now on (src/lib/callSlots.js).
// ═══════════════════════════════════════════════════════════════════
import { slotHour, callSlotProblem, guardCallSlots, MAX_CALLS_PER_SLOT } from "../src/lib/callSlots.js";

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name); } };

const act = (id, time, extra = {}) => ({ id, type: "Call", status: "Planned", date: "2026-11-24", time, owner: "u_rep", ...extra });
const cr  = (id, callTime, extra = {}) => ({ id, callDate: "2026-11-24", callTime, marketingPerson: "u_rep", outcome: "Completed", ...extra });

ok("limit is 2", MAX_CALLS_PER_SLOT === 2);
ok("slotHour parses times", slotHour("9:05") === "09" && slotHour("14:59") === "14" && slotHour("") === "" && slotHour("25:00") === "");

// Two calls already in 10:00–10:59 (one scheduled, one logged).
const activities = [act("a1", "10:00")];
const callReports = [cr("c1", "10:45")];
const data = { activities, callReports };

ok("3rd call in a full slot is refused", !!callSlotProblem("activity", act("a2", "10:30"), data));
ok("next hour is free", callSlotProblem("activity", act("a2", "11:00"), data) === "");
ok("another user's slot is separate", callSlotProblem("activity", act("a2", "10:30", { owner: "u_mgr" }), data) === "");
ok("another day is separate", callSlotProblem("callReport", cr("c2", "10:15", { callDate: "2026-11-25" }), data) === "");
ok("a call with no time isn't in any slot", callSlotProblem("activity", act("a2", ""), data) === "");
ok("cancelled calls don't count", callSlotProblem("activity", act("a2", "10:10"),
  { activities: [act("a1", "10:00", { status: "Cancelled" })], callReports }) === "");
ok("non-call activities don't count", callSlotProblem("activity", act("a2", "10:10"),
  { activities: [act("a1", "10:00", { type: "Meeting" })], callReports }) === "");
ok("re-saving a call in its own slot is fine", callSlotProblem("activity", { ...activities[0], notes: "x" }, data) === "");

{
  const full = { activities: [act("o1","09:00"), act("o2","09:10"), act("o3","09:20")], callReports: [] };
  ok("editing a saved call in an over-full slot (same slot) is fine", callSlotProblem("activity", { ...full.activities[2], notes: "x" }, full) === "");
  ok("moving a saved call into a full slot is refused", !!callSlotProblem("activity", { ...act("o4","15:00"), time: "09:30" }, { ...full, activities: [...full.activities, act("o4","15:00")] }));
}
// Guard: setter-level enforcement.
{
  const prev = activities;
  const { next, blocked } = guardCallSlots("activity", prev, [...prev, act("a2", "10:20")], callReports);
  ok("guard drops a new 3rd call", blocked.length === 1 && next.length === 1 && next[0].id === "a1");
}
{
  const prev = [...activities, act("a3", "15:00")];
  const { next, blocked } = guardCallSlots("activity", prev, prev.map(a => a.id === "a3" ? { ...a, time: "10:05" } : a), callReports);
  ok("guard reverts a call moved into a full slot", blocked.length === 1 && next.find(a => a.id === "a3").time === "15:00");
}
{
  const prev = [];
  const { next, blocked } = guardCallSlots("callReport", prev, [cr("n1", "12:00"), cr("n2", "12:10"), cr("n3", "12:20")], []);
  ok("three new calls at once: third refused", blocked.length === 1 && blocked[0].id === "n3" && next.length === 2);
}
// Past data untouched: an over-full slot that already exists stays as is.
{
  const legacy = [act("l1", "09:00"), act("l2", "09:00"), act("l3", "09:00"), act("l4", "09:00")];
  const edited = legacy.map(a => a.id === "l2" ? { ...a, notes: "updated", status: "Completed" } : a);
  const r1 = guardCallSlots("activity", legacy, edited, []);
  ok("existing over-full slot: editing notes/status passes", r1.blocked.length === 0 && r1.next === edited);
  const renamed = legacy.map(a => ({ ...a, accountId: "acc_x" }));
  const r2 = guardCallSlots("activity", legacy, renamed, []);
  ok("bulk relink of old calls passes", r2.blocked.length === 0 && r2.next === renamed);
  const r3 = guardCallSlots("activity", legacy, [...legacy, act("l5", "09:30")], []);
  ok("but a new call can't join that slot", r3.blocked.length === 1 && r3.next.length === 4);
}
{
  const prev = [act("d1", "10:00"), act("d2", "10:30")];
  const { blocked } = guardCallSlots("activity", prev, [act("d2", "10:30"), act("d3", "10:40")], []);
  ok("deleting a call frees its place", blocked.length === 0);
}

console.log(`\ncall slots: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
