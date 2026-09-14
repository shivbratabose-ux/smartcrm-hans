// ═══════════════════════════════════════════════════════════════════
// Team activity summary — the Calendar's manager layer
// ═══════════════════════════════════════════════════════════════════
// Pure (no React, no imports) so scripts/test-team-summary.mjs exercises
// the exact code the Calendar renders.
//
// What counts, per person, per period bucket:
//   callsMade   call attempts that happened — a call report with any
//               outcome except "Rescheduled" dated on/before today, or a
//               Completed "Call" activity. A no-answer is still work done.
//   connected   the subset that actually connected: call report outcome
//               "Completed", or a Completed Call activity.
//   meetings    Completed Meeting/Demo/Site Visit/Presentation activities
//               plus Completed calendar events.
//   otherDone   every other Completed activity (email, WhatsApp, task…).
//   pending     planned work dated today or later (Planned activities,
//               Scheduled events, Rescheduled call reports).
//   overdue     planned work dated before today that never got done.
// "done" = callsMade + meetings + otherDone — the day-cell headline.

export const MEETING_TYPES = new Set(["Meeting", "Demo", "Site Visit", "Presentation"]);

// ── Daily call target (compliance) ──────────────────────────────────
// Business rule: every Sales Executive, BDM, Sales/Country Manager and
// Line Manager makes 5 calls per working day, Monday to Friday. The
// target for any period = perDay × working days elapsed in it, counting
// today (so "to date"); future days never count against anyone. Other
// roles (support, tech, finance, product, leadership) carry no target.
// Holidays and Admin days (Masters → Activity → Holidays & Admin Days,
// org-wide) are not working days: they carry no target, but calls made
// on them still count. A person's own leave (see LEAVE_TYPES) takes that
// day — or half of it — off their target the same way.
export const CALL_TARGET = {
  perDay: 5,
  workDays: new Set([1, 2, 3, 4, 5]),           // Date#getDay(): Mon..Fri
  roles: new Set(["sales_exec", "bd_lead", "country_mgr", "line_mgr"]),
};

export function hasCallTarget(role) {
  return CALL_TARGET.roles.has(String(role || "").trim().toLowerCase());
}

export const OFF_DAY_TYPES = ["Holiday", "Admin day"];

// Masters holiday list → Map(date → {date,name,type}). Ignores rows with
// no valid date; the first entry wins if a date is listed twice.
export function offDayMap(holidays = []) {
  const m = new Map();
  for (const h of holidays || []) {
    if (h && /^\d{4}-\d{2}-\d{2}$/.test(h.date || "") && !m.has(h.date)) m.set(h.date, h);
  }
  return m;
}

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Weekday off-days (holiday / admin day) falling in [from, to].
export function offDaysIn(from, to, offDays = new Map()) {
  return [...offDays.values()]
    .filter(h => h.date >= from && h.date <= to && CALL_TARGET.workDays.has(new Date(h.date + "T00:00:00").getDay()))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Every date in [from, to] as ISO strings (local calendar, DST-safe).
function eachDate(from, to) {
  if (!from || !to || from > to) return [];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ey, em, ed] = to.split("-").map(Number);
  const out = [];
  for (const d = new Date(fy, fm - 1, fd), last = new Date(ey, em - 1, ed); d <= last; d.setDate(d.getDate() + 1)) out.push(isoOf(d));
  return out;
}
const isWorkDay = (iso, offDays) => CALL_TARGET.workDays.has(new Date(iso + "T00:00:00").getDay()) && !offDays.has(iso);

// Working days in [from, to] that have started (<= today), inclusive,
// skipping weekends and any date in offDays (a Map or Set of ISO dates).
// `leave` (Map date → 1 | 0.5) takes that share of a day off, so the
// result can be fractional (a half-day leave counts as half a day).
export function workingDaysElapsed(from, to, today, offDays = new Map(), leave = new Map()) {
  const end = to < today ? to : today;
  return eachDate(from, end).reduce((n, iso) => isWorkDay(iso, offDays) ? n + 1 - Math.min(1, leave.get(iso) || 0) : n, 0);
}

// ── Individual leave ────────────────────────────────────────────────
// Stored as calendar events, one per day, owned by the person on leave:
// type "Leave" (full day) or "Half-day leave". Leave is never counted as
// work, pending or overdue.
//
// Approval (event.status):
//   "Pending approval"  requested by the person, awaiting their line manager
//   "Approved"          counts — comes off the call target
//   "Rejected"          does not count; the person can request again
//   "Cancelled"         withdrawn; ignored
//   anything else       (e.g. "Scheduled" on leave marked before approvals
//                       existed) is treated as Approved
// Only approved leave reduces the target. Days in one request share an id
// prefix "lv_<requestId>_<date>" so they are approved or rejected together.
export const LEAVE_TYPES = { "Leave": 1, "Half-day leave": 0.5 };
export const LEAVE_STATUS = { pending: "Pending approval", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" };

export const isLeaveType = (e) => !!e && Object.prototype.hasOwnProperty.call(LEAVE_TYPES, e.type);

export function leaveState(e) {
  if (!isLeaveType(e) || e.isDeleted || e.status === LEAVE_STATUS.cancelled) return "cancelled";
  if (e.status === LEAVE_STATUS.pending) return "pending";
  if (e.status === LEAVE_STATUS.rejected) return "rejected";
  return "approved";
}

// Approved leave — the only kind that comes off the target.
export function isLeaveEvent(e) {
  return leaveState(e) === "approved";
}

// Mirrors GLOBAL_ROLES in utils/helpers.jsx (kept import-free for node tests).
const APPROVER_GLOBAL_ROLES = new Set(["admin", "md", "director", "vp_sales_mkt"]);
const roleOf = (u) => String(u?.role || "").trim().toLowerCase();

// Can `approverId` approve leave for `ownerId`? Their line manager, anyone
// further up the solid reporting line (reportsTo), or a global role — never
// the person themselves.
export function canApproveLeave(approverId, ownerId, users = []) {
  if (!approverId || !ownerId || approverId === ownerId) return false;
  const byId = new Map(users.map(u => [u.id, u]));
  if (APPROVER_GLOBAL_ROLES.has(roleOf(byId.get(approverId)))) return true;
  const seen = new Set([ownerId]);
  for (let mgr = byId.get(ownerId)?.reportsTo; mgr && !seen.has(mgr); mgr = byId.get(mgr)?.reportsTo) {
    if (mgr === approverId) return true;
    seen.add(mgr);
  }
  return false;
}

export function lineManagerOf(ownerId, users = []) {
  const mgrId = users.find(u => u.id === ownerId)?.reportsTo;
  return mgrId ? users.find(u => u.id === mgrId) || null : null;
}

// Status for newly marked leave: approved when a manager/admin marks it
// for someone they can approve, or when the person holds a global role
// (nobody above them); otherwise it waits for approval.
export function initialLeaveStatus(creatorId, ownerId, users = []) {
  if (canApproveLeave(creatorId, ownerId, users)) return LEAVE_STATUS.approved;
  if (creatorId === ownerId && APPROVER_GLOBAL_ROLES.has(roleOf(users.find(u => u.id === ownerId)))) return LEAVE_STATUS.approved;
  return LEAVE_STATUS.pending;
}

export const leaveRequestIdOf = (e) => (String(e?.id || "").match(/^lv_([A-Za-z0-9]+)_/) || [])[1] || String(e?.id || "");

// Leave events → requests [{id, owner, type, state, dates[], days, reason, events[]}]
// newest first. Days of one request normally share a state; if an approver
// acted on them separately the request takes the most common state.
export function groupLeaveRequests(events = []) {
  const groups = new Map();
  for (const e of events) {
    if (!isLeaveType(e) || e.isDeleted || !e.date) continue;
    const key = `${e.owner}|${leaveRequestIdOf(e)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  return [...groups.values()].map(evs => {
    evs.sort((a, b) => a.date.localeCompare(b.date));
    const tally = {};
    evs.forEach(e => { const s = leaveState(e); tally[s] = (tally[s] || 0) + 1; });
    const state = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
    return {
      id: leaveRequestIdOf(evs[0]), owner: evs[0].owner, type: evs[0].type, state,
      dates: evs.map(e => e.date), from: evs[0].date, to: evs[evs.length - 1].date,
      days: evs.reduce((n, e) => n + LEAVE_TYPES[e.type], 0),
      reason: String(evs[0].notes || "").split("\n")[0], events: evs,
    };
  }).sort((a, b) => b.from.localeCompare(a.from));
}

// Pending requests this user can act on.
export function pendingLeaveFor(approverId, events = [], users = []) {
  return groupLeaveRequests(events).filter(r => r.state === "pending" && canApproveLeave(approverId, r.owner, users));
}

// events → Map(owner → Map(date → share of the day on leave, max 1)).
// Approved leave by default; { includePending: true } also counts pending
// requests (used to stop the same day being requested twice).
export function leaveByUser(events = [], { includePending = false } = {}) {
  const m = new Map();
  for (const e of events) {
    const st = leaveState(e);
    if (!(st === "approved" || (includePending && st === "pending")) || !e.date) continue;
    if (!m.has(e.owner)) m.set(e.owner, new Map());
    const days = m.get(e.owner);
    days.set(e.date, Math.min(1, (days.get(e.date) || 0) + LEAVE_TYPES[e.type]));
  }
  return m;
}

// Leave days in [from, to] that would otherwise be working days.
export function leaveDaysIn(from, to, leave = new Map(), offDays = new Map()) {
  return eachDate(from, to).reduce((n, iso) => isWorkDay(iso, offDays) ? n + Math.min(1, leave.get(iso) || 0) : n, 0);
}

// Dates a new leave request should create entries for: working days in
// [from, to] (weekends, holidays and days already on leave skipped).
export function leaveDatesToCreate(from, to, offDays = new Map(), existing = new Map()) {
  return eachDate(from, to).filter(iso => isWorkDay(iso, offDays) && !existing.has(iso));
}

// 22.5 → "22.5", 20 → "20"
export const fmtDays = (n) => Number.isInteger(n) ? String(n) : n.toFixed(1);

// The one rule for a call report's state, shared by the Team view and the
// Calendar header / list so they can never disagree again. A call with an
// outcome (Completed, No Answer, Voicemail, Left Message) HAPPENED — it's
// "made", whatever the outcome. Only a Rescheduled report, or anything
// future-dated, is still a plan: pending while due, overdue once past.
export function callReportState(outcome, date, today) {
  if (outcome === "Rescheduled") return date >= today ? "pending" : "overdue";
  return date <= today ? "made" : "pending";
}

const blank = () => ({ callsMade: 0, connected: 0, meetings: 0, otherDone: 0, pending: 0, overdue: 0 });

// Classify one normalised item into the counters it bumps.
function classify(item, today) {
  const c = blank();
  if (item.kind === "call") {
    const st = callReportState(item.outcome, item.date, today);
    if (st === "made") { c.callsMade = 1; if (item.outcome === "Completed") c.connected = 1; }
    else if (st === "pending") c.pending = 1;
    else c.overdue = 1;
    return c;
  }
  const done = item.status === "Completed";
  const open = !done && item.status !== "Cancelled";
  if (done) {
    if (item.kind === "activity" && item.type === "Call") { c.callsMade = 1; c.connected = 1; }
    else if (item.kind === "event" || MEETING_TYPES.has(item.type)) c.meetings = 1;
    else c.otherDone = 1;
  } else if (open) {
    if (item.date >= today) c.pending = 1; else c.overdue = 1;
  }
  return c;
}

const add = (a, b) => { for (const k of Object.keys(a)) a[k] += b[k]; };

/**
 * @param {object}   p
 * @param {Array}    p.activities   CRM activities ({owner,date,type,status,isDeleted})
 * @param {Array}    p.callReports  ({marketingPerson,callDate,outcome,isDeleted})
 * @param {Array}    p.events       calendar events ({owner,date,status,isDeleted})
 * @param {Array}    p.users        [{id,name,initials,role}] — rows to show, in scope
 * @param {Array}    p.columns      [{key,label,from,to}] ISO-date buckets
 * @param {string}   p.today        "YYYY-MM-DD"
 * @param {Array}    p.holidays     masters.holidays [{date,name,type}]
 * @returns {{rows, totals, columnTotals}}
 */
export function buildTeamSummary({ activities = [], callReports = [], events = [], users = [], columns = [], today, holidays = [] }) {
  const offDays = offDayMap(holidays);
  const leave = leaveByUser(events);
  const pendingLeave = leaveByUser(events.filter(e => leaveState(e) === "pending"), { includePending: true });
  const from = columns.length ? columns[0].from : "";
  const to = columns.length ? columns[columns.length - 1].to : "";
  const userIds = new Set(users.map(u => u.id));

  const items = [
    ...activities.filter(a => !a.isDeleted && a.date)
      .map(a => ({ kind: "activity", owner: a.owner, date: a.date, type: a.type, status: a.status })),
    ...callReports.filter(r => !r.isDeleted && r.callDate)
      .map(r => ({ kind: "call", owner: r.marketingPerson, date: r.callDate, outcome: r.outcome })),
    ...events.filter(e => !e.isDeleted && e.date && !Object.prototype.hasOwnProperty.call(LEAVE_TYPES, e.type))
      .map(e => ({ kind: "event", owner: e.owner, date: e.date, type: e.type, status: e.status === "Completed" ? "Completed" : e.status === "Cancelled" ? "Cancelled" : "Planned" })),
  ].filter(i => userIds.has(i.owner) && i.date >= from && i.date <= to);

  const byUser = new Map(users.map(u => [u.id, {
    user: u,
    cells: Object.fromEntries(columns.map(col => [col.key, blank()])),
    total: blank(),
  }]));
  const columnTotals = Object.fromEntries(columns.map(col => [col.key, blank()]));
  const totals = blank();

  for (const it of items) {
    const col = columns.find(c => it.date >= c.from && it.date <= c.to);
    if (!col) continue;
    const c = classify(it, today);
    const row = byUser.get(it.owner);
    add(row.cells[col.key], c);
    add(row.total, c);
    add(columnTotals[col.key], c);
    add(totals, c);
  }

  const done = (x) => x.callsMade + x.meetings + x.otherDone;
  const pctOf = (made, target) => target > 0 ? Math.round(made / target * 100) : null;
  let teamTarget = 0, teamTargetCalls = 0, eligible = 0, onTarget = 0, teamLeaveDays = 0;
  const rows = [...byUser.values()].map(r => {
    const targeted = hasCallTarget(r.user.role);
    const myLeave = leave.get(r.user.id) || new Map();
    const cellTargets = Object.fromEntries(columns.map(col =>
      [col.key, targeted ? CALL_TARGET.perDay * workingDaysElapsed(col.from, col.to, today, offDays, myLeave) : 0]));
    // Leave per column counts the whole bucket (planned leave shows too).
    const cellLeave = Object.fromEntries(columns.map(col => [col.key, leaveDaysIn(col.from, col.to, myLeave, offDays)]));
    const leaveDays = Object.values(cellLeave).reduce((a, b) => a + b, 0);
    // Requested but not yet approved — shown, not deducted.
    const myPending = pendingLeave.get(r.user.id) || new Map();
    const cellPendingLeave = Object.fromEntries(columns.map(col => [col.key, leaveDaysIn(col.from, col.to, myPending, offDays)]));
    const pendingLeaveDays = Object.values(cellPendingLeave).reduce((a, b) => a + b, 0);
    const callTarget = Object.values(cellTargets).reduce((a, b) => a + b, 0);
    const callCompliancePct = targeted ? pctOf(r.total.callsMade, callTarget) : null;
    if (targeted) teamLeaveDays += leaveDays;
    if (targeted && callTarget > 0) {
      eligible++;
      teamTarget += callTarget;
      teamTargetCalls += r.total.callsMade;
      if (r.total.callsMade >= callTarget) onTarget++;
    }
    return { ...r, targeted, cellTargets, cellLeave, leaveDays, cellPendingLeave, pendingLeaveDays, callTarget, callCompliancePct };
  }).map(r => ({
    ...r,
    done: done(r.total),
    // Completion = done ÷ (done + still-open planned work that fell due).
    completionPct: (done(r.total) + r.total.overdue) > 0
      ? Math.round(done(r.total) / (done(r.total) + r.total.overdue) * 100) : null,
  })).sort((a, b) => b.done - a.done || b.total.connected - a.total.connected || (a.user.name || "").localeCompare(b.user.name || ""));

  return {
    rows, totals, totalsDone: done(totals), columnTotals, doneOf: done,
    // Weekday holidays / admin days per column, for headers and the KPI.
    columnOffDays: Object.fromEntries(columns.map(col => [col.key, offDaysIn(col.from, col.to, offDays)])),
    offDays: offDaysIn(from, to, offDays),
    compliance: {
      target: teamTarget, calls: teamTargetCalls, eligible, onTarget,
      pct: pctOf(teamTargetCalls, teamTarget),
      leaveDays: teamLeaveDays,
    },
  };
}

// Period buckets for the Team view. "week" → 7 day columns (Mon–Sun);
// "month" → Monday-start week columns clipped to the calendar month.
export function teamColumns(mode, anchorISO) {
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const [y, m, d] = anchorISO.split("-").map(Number);
  const anchor = new Date(y, m - 1, d);
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  if (mode === "week") {
    const start = new Date(anchor);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to Monday
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(start); dt.setDate(start.getDate() + i);
      return { key: iso(dt), label: `${DOW[dt.getDay()]} ${dt.getDate()}`, from: iso(dt), to: iso(dt) };
    });
  }

  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const cols = [];
  let cur = new Date(first);
  let n = 1;
  while (cur <= last) {
    const end = new Date(cur);
    end.setDate(end.getDate() + (6 - ((cur.getDay() + 6) % 7))); // to Sunday
    const clipped = end > last ? last : end;
    cols.push({ key: `W${n}`, label: `W${n} · ${cur.getDate()}–${clipped.getDate()}`, from: iso(cur), to: iso(clipped) });
    cur = new Date(clipped); cur.setDate(cur.getDate() + 1);
    n++;
  }
  return cols;
}
