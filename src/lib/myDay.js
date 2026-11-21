// ─────────────────────────────────────────────────────────────────────
// My day — what the home page (My Performance) shows above the numbers:
//   • due today        planned activities, lead calls and rescheduled calls dated today
//   • overdue          the same, dated before today
//   • scheduled calls  calls booked for today and the next 6 days
//   • last 7 days      what was actually done: calls, demos, meetings,
//                      completed activities, deals won, leads added
// Pure: takes the lists the app already holds, so it's testable in node
// and agrees with Calendar / Activities / Call Reports on what's what.
// ─────────────────────────────────────────────────────────────────────
import { callReportState, isCallPerson, isDemoCall } from "../utils/teamSummary.js";

const MEETING_TYPES = new Set(["Meeting", "Demo", "Site Visit", "Presentation", "Conference"]);

/** "2026-11-21" + n days → "2026-11-28" (calendar days, no timezone drift). */
export function addDays(date, n) {
  const [y, m, d] = String(date).split("-").map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, d || 1) + n * 864e5);
  return t.toISOString().slice(0, 10);
}

const byWhen = (a, b) => (a.date || "").localeCompare(b.date || "") || (a.time || "99").localeCompare(b.time || "99");

/**
 * @param {object} p
 *   activities, callReports, leads, opps: the user's visible lists
 *   me:        user id the page is viewing
 *   today:     "YYYY-MM-DD"
 *   isWon:     (opp) => boolean
 *   accountName: (id) => string   (optional, for titles)
 */
export function myDay({ activities = [], callReports = [], leads = [], opps = [], me, today, isWon = () => false, accountName = () => "" }) {
  const live = (r) => r && !r.isDeleted;

  // ── Open work items (one shape for every source) ──
  const items = [];
  for (const a of activities) {
    if (!live(a) || a.owner !== me || a.status !== "Planned" || !a.date) continue;
    items.push({ key: `act:${a.id}`, kind: a.type || "Task", isCall: a.type === "Call", title: a.title || `${a.type || "Activity"}${a.accountId ? ` – ${accountName(a.accountId)}` : ""}`, date: a.date, time: a.time || "", page: "activities" });
  }
  for (const l of leads) {
    if (!live(l) || l.assignedTo !== me || l.stage === "Converted" || !l.nextCall) continue;
    items.push({ key: `lead:${l.id}`, kind: "Lead call", isCall: true, title: l.company || l.contact || l.leadId || "Lead", date: l.nextCall, time: "", page: "leads" });
  }
  for (const r of callReports) {
    if (!live(r) || !r.callDate || !isCallPerson(r, me)) continue;
    const st = callReportState(r.outcome, r.callDate, today);
    if (st === "made") continue;                       // happened: not open work
    items.push({ key: `cr:${r.id}`, kind: isDemoCall(r) ? "Demo" : "Call", isCall: true, title: r.leadName || r.company || accountName(r.accountId) || "Call", date: r.callDate, time: r.callTime || "", page: "calendar" });
  }

  const dueToday = items.filter(i => i.date === today).sort(byWhen);
  const overdue = items.filter(i => i.date < today).sort(byWhen);
  const weekEnd = addDays(today, 6);
  const scheduledCalls = items.filter(i => i.isCall && i.date >= today && i.date <= weekEnd).sort(byWhen);

  // ── Last 7 days (today and the 6 days before) ──
  const from = addDays(today, -6);
  const inWeek = (d) => d && d >= from && d <= today;
  const made = callReports.filter(r => live(r) && inWeek(r.callDate) && isCallPerson(r, me)
    && callReportState(r.outcome, r.callDate, today) === "made");
  const doneActs = activities.filter(a => live(a) && a.owner === me && a.status === "Completed" && inWeek(a.date));
  const won = opps.filter(o => live(o) && o.owner === me && isWon(o) && inWeek(o.closeDate));
  const last7 = {
    from, to: today,
    calls: made.length,
    demos: made.filter(isDemoCall).length,
    meetings: doneActs.filter(a => MEETING_TYPES.has(a.type)).length,
    activitiesDone: doneActs.length,
    dealsWon: won.length,
    wonValue: +won.reduce((s, o) => s + (Number(o.value) || 0), 0).toFixed(2),
    leadsAdded: leads.filter(l => live(l) && l.assignedTo === me && inWeek(l.createdDate)).length,
  };

  return { dueToday, overdue, scheduledCalls, last7 };
}
