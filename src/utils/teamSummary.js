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
 * @returns {{rows, totals, columnTotals}}
 */
export function buildTeamSummary({ activities = [], callReports = [], events = [], users = [], columns = [], today }) {
  const from = columns.length ? columns[0].from : "";
  const to = columns.length ? columns[columns.length - 1].to : "";
  const userIds = new Set(users.map(u => u.id));

  const items = [
    ...activities.filter(a => !a.isDeleted && a.date)
      .map(a => ({ kind: "activity", owner: a.owner, date: a.date, type: a.type, status: a.status })),
    ...callReports.filter(r => !r.isDeleted && r.callDate)
      .map(r => ({ kind: "call", owner: r.marketingPerson, date: r.callDate, outcome: r.outcome })),
    ...events.filter(e => !e.isDeleted && e.date)
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
  const rows = [...byUser.values()].map(r => ({
    ...r,
    done: done(r.total),
    // Completion = done ÷ (done + still-open planned work that fell due).
    completionPct: (done(r.total) + r.total.overdue) > 0
      ? Math.round(done(r.total) / (done(r.total) + r.total.overdue) * 100) : null,
  })).sort((a, b) => b.done - a.done || b.total.connected - a.total.connected || (a.user.name || "").localeCompare(b.user.name || ""));

  return { rows, totals, totalsDone: done(totals), columnTotals, doneOf: done };
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
