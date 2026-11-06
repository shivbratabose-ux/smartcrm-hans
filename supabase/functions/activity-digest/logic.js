// Pure logic for the activity-digest edge function: which period a report
// covers, who receives what, the numbers, and the e-mail HTML.
//
// No Deno or Supabase APIs, so the same module is imported by the edge
// function (index.ts) and by scripts/test-activity-digest.mjs. Call counts,
// targets, leave and holidays come from src/utils/teamSummary.js — the exact
// code behind the Calendar's Team view — so the e-mail and the screen can
// never disagree.
//
// One e-mail per person per run, with sections chosen by who they are:
//   personal  everyone with a call target, or anything logged / planned
//   team      anyone with active direct reports (users.reports_to)
//   company   MD / Director / VP Sales, plus explicitly listed users
import {
  buildTeamSummary, hasCallTarget, offDayMap, leaveByUser, leaveDaysIn, fmtDays,
} from "../../../src/utils/teamSummary.js";

// ── Dates (calendar days, ISO "YYYY-MM-DD", no time zones involved) ─────
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const addDays = (iso, n) => { const d = fromISO(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); };
const dow = (iso) => fromISO(iso).getUTCDay(); // 0 Sun … 6 Sat
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (iso) => { const d = fromISO(iso); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
export const fmtRange = (from, to) => {
  if (from === to) return fmtDay(from);
  const a = fromISO(from), b = fromISO(to);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${MON[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${MON[a.getUTCMonth()]} – ${b.getUTCDate()} ${MON[b.getUTCMonth()]}`;
};

// Reports go out Monday to Saturday, never on a holiday (Masters →
// Holidays & Admin Days, the same list that removes call targets).
export function isSendDay(iso, holidays = []) {
  return dow(iso) !== 0 && !offDayMap(holidays).has(iso);
}

// The daily report covers everything since the last report: from the most
// recent send day before today, through yesterday. Tuesday covers Monday;
// Monday covers Saturday and Sunday; the day after a holiday includes it.
export function dailyPeriod(todayISO, holidays = []) {
  const to = addDays(todayISO, -1);
  let from = to;
  for (let i = 0; i < 14 && !isSendDay(from, holidays); i++) from = addDays(from, -1);
  return { from, to };
}

// The weekly report covers the previous Monday–Sunday.
export function weeklyPeriod(todayISO) {
  const back = (dow(todayISO) + 6) % 7;            // days since this Monday
  const thisMonday = addDays(todayISO, -back);
  return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) };
}

// ── Numbers ─────────────────────────────────────────────────────────────
const inRange = (d, p) => !!d && d >= p.from && d <= p.to;
const live = (r) => !r.isDeleted;
const CLOSED_LEAD_STAGES = new Set(["Converted", "NA"]);

// Pipeline wins are identified by the stage's KIND (Masters → Pipeline
// Stages), so a renamed won stage still counts.
export function wonStageNames(stages = []) {
  const names = new Set((stages || []).filter(s => s.kind === "won").map(s => s.name));
  if (!names.size) names.add("Won");
  return names;
}

// What the Team view doesn't cover: leads, quotes, deals.
export function extraMetrics(userId, data, p, won) {
  const opps = (data.opps || []).filter(o => live(o) && o.owner === userId);
  return {
    newLeads: (data.leads || []).filter(l => live(l) && l.owner === userId && inRange(l.createdDate, p)).length,
    quotesSent: (data.quotes || []).filter(q => live(q) && q.owner === userId && inRange(q.sentDate, p)).length,
    dealsWon: opps.filter(o => won.has(o.stage) && inRange(o.closeDate, p)).length,
    wonValue: opps.filter(o => won.has(o.stage) && inRange(o.closeDate, p)).reduce((s, o) => s + (Number(o.value) || 0), 0),
    pipelineAdded: opps.filter(o => inRange(o.createdDate, p)).reduce((s, o) => s + (Number(o.value) || 0), 0),
  };
}

// The rest of today, for the personal section of the daily report.
export function todayPlan(userId, data, today, p) {
  const acts = (data.activities || []).filter(a => live(a) && a.owner === userId);
  return {
    planned: acts.filter(a => a.date === today && a.status !== "Completed" && a.status !== "Cancelled")
      .sort((a, b) => String(a.time || "99").localeCompare(String(b.time || "99"))),
    overdue: acts.filter(a => a.date && a.date < today && a.status === "Planned").length,
    followUps: (data.leads || []).filter(l => live(l) && l.owner === userId && l.nextCall && l.nextCall <= today
      && !CLOSED_LEAD_STAGES.has(l.stage)).sort((a, b) => a.nextCall.localeCompare(b.nextCall)),
    newWebsiteLeads: (data.leads || []).filter(l => live(l) && l.owner === userId && l.source === "Website" && inRange(l.createdDate, p)),
  };
}

const summarize = (users, data, p, today, holidays) => buildTeamSummary({
  activities: data.activities || [], callReports: data.callReports || [], events: data.events || [],
  users, columns: [{ key: "p", label: fmtRange(p.from, p.to), from: p.from, to: p.to }], today, holidays,
});

// ── Recipients ──────────────────────────────────────────────────────────
export const ROLLUP_ROLES = new Set(["md", "director", "vp_sales_mkt"]);
const activeUsers = (users) => (users || []).filter(u => u.active !== false && u.email);

export function directReports(managerId, users) {
  return activeUsers(users).filter(u => u.reportsTo === managerId && u.id !== managerId);
}

// ── Plan every message for one run ──────────────────────────────────────
// kind: "daily" | "weekly". Returns [{ recipient, subject, html, sections }].
export function planDigests({ kind, today, data, holidays = [], stages = [], rollupUserIds = [], appUrl = "" }) {
  const p = kind === "weekly" ? weeklyPeriod(today) : dailyPeriod(today, holidays);
  const prev = kind === "weekly" ? { from: addDays(p.from, -7), to: addDays(p.to, -7) } : null;
  const won = wonStageNames(stages);
  const users = activeUsers(data.users);
  const all = summarize(users, data, p, today, holidays);
  const rowOf = new Map(all.rows.map(r => [r.user.id, r]));
  const prevRowOf = prev ? new Map(summarize(users, data, prev, today, holidays).rows.map(r => [r.user.id, r])) : null;
  const leave = leaveByUser(data.events || []);
  const offDays = offDayMap(holidays);

  const person = (u) => {
    const r = rowOf.get(u.id);
    const x = extraMetrics(u.id, data, p, won);
    const prevRow = prevRowOf?.get(u.id);
    return {
      user: u, row: r, x,
      leaveDays: leaveDaysIn(p.from, p.to, leave.get(u.id) || new Map(), offDays),
      prevDone: prevRow ? prevRow.done : null, prevCalls: prevRow ? prevRow.total.callsMade : null,
      quiet: r.done === 0 && x.newLeads === 0 && x.quotesSent === 0,
    };
  };

  const rollupIds = new Set(rollupUserIds);
  const messages = [];
  for (const u of users) {
    const sections = [];
    const me = person(u);
    const plan = kind === "daily" ? todayPlan(u.id, data, today, p) : null;
    const hasOwn = me.row.targeted || !me.quiet || (plan && (plan.planned.length || plan.followUps.length || plan.overdue));
    if (hasOwn) sections.push({ type: "personal", me, plan });

    const reports = directReports(u.id, users);
    if (reports.length) sections.push({ type: "team", people: reports.map(person) });

    if (ROLLUP_ROLES.has(u.role) || rollupIds.has(u.id)) {
      // Group everyone by their direct manager; people with no manager
      // in the active list form their own "No manager" group.
      const groups = new Map();
      for (const v of users) {
        const pv = person(v);
        if (!pv.row.targeted && pv.quiet) continue;      // nothing to report
        const mgr = users.find(m => m.id === v.reportsTo);
        const key = mgr ? mgr.id : "_none";
        if (!groups.has(key)) groups.set(key, { manager: mgr || null, people: [] });
        groups.get(key).people.push(pv);
      }
      sections.push({ type: "company", groups: [...groups.values()] });
    }

    if (!sections.length) continue;
    messages.push({
      recipient: u, sections,
      subject: subjectFor(kind, p, sections),
      html: renderEmail({ kind, period: p, today, sections, appUrl }),
    });
  }
  return { period: p, messages };
}

export function subjectFor(kind, p, sections) {
  const mine = sections.find(s => s.type === "personal");
  const tail = mine
    ? ` — ${mine.me.row.total.callsMade} call${mine.me.row.total.callsMade === 1 ? "" : "s"}, ${mine.me.row.total.meetings} meeting${mine.me.row.total.meetings === 1 ? "" : "s"}`
    : "";
  return kind === "weekly"
    ? `SmartCRM weekly · ${fmtRange(p.from, p.to)}${tail}`
    : `SmartCRM daily · ${fmtRange(p.from, p.to)}${tail}`;
}

// ── HTML (e-mail safe: tables + inline styles, everything escaped) ──────
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const BRAND = "#1B6B5A";
const lakh = (v) => `₹${(Math.round((Number(v) || 0) * 10) / 10).toLocaleString("en-IN")} L`;
const callsCell = (r) => r.targeted && r.callTarget > 0
  ? `${r.total.callsMade} / ${r.callTarget}`
  : String(r.total.callsMade);
const pctCell = (r) => r.callCompliancePct == null ? "—" : `${r.callCompliancePct}%`;
const pctColor = (pct) => pct == null ? "#64748B" : pct >= 100 ? "#15803D" : pct >= 60 ? "#B45309" : "#B91C1C";
const delta = (now, before) => {
  if (before == null) return "";
  const d = now - before;
  if (d === 0) return ` <span style="color:#64748B;font-size:11px">(same as last week)</span>`;
  return ` <span style="color:${d > 0 ? "#15803D" : "#B91C1C"};font-size:11px">(${d > 0 ? "+" : ""}${d} vs last week)</span>`;
};

const th = (t, align = "left") => `<th style="text-align:${align};padding:7px 8px;font-size:11px;color:#64748B;font-weight:600;border-bottom:2px solid #E2E8F0;text-transform:uppercase;letter-spacing:.04em">${t}</th>`;
const td = (t, align = "left", extra = "") => `<td style="text-align:${align};padding:7px 8px;font-size:13px;border-bottom:1px solid #F1F5F9;${extra}">${t}</td>`;

// Tiles are inline-blocks so they wrap: four per row on a desktop client,
// two per row on a phone. Tables can't wrap, and most people read this on
// their phone at 08:30.
function tile(label, value, sub = "") {
  return `<div style="display:inline-block;vertical-align:top;width:136px;margin:0 4px 8px 0;padding:9px 10px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;box-sizing:border-box">
    <div style="font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:.04em">${esc(label)}</div>
    <div style="font-size:20px;font-weight:700;color:#0F172A;margin-top:2px">${value}</div>
    ${sub ? `<div style="font-size:11px;color:#64748B;margin-top:2px">${sub}</div>` : ""}</div>`;
}

function personalHtml({ me, plan }, kind) {
  const r = me.row;
  const targetSub = r.targeted && r.callTarget > 0
    ? `<span style="color:${pctColor(r.callCompliancePct)};font-weight:600">${pctCell(r)} of target (${r.callTarget})</span>`
    : (r.targeted ? "no target this period" : "");
  const tiles = `<div>
    ${tile("Calls made", `${r.total.callsMade}${kind === "weekly" ? delta(r.total.callsMade, me.prevCalls) : ""}`, targetSub)}
    ${tile("Connected", r.total.connected)}
    ${tile("Meetings / demos", r.total.meetings)}
    ${tile("Other work done", r.total.otherDone)}
    ${tile("New leads", me.x.newLeads)}
    ${tile("Quotes sent", me.x.quotesSent)}
    ${tile("Deals won", me.x.dealsWon, me.x.dealsWon ? lakh(me.x.wonValue) : "")}
    ${tile("Pipeline added", lakh(me.x.pipelineAdded))}
  </div>`;
  const leaveNote = me.leaveDays > 0 ? `<p style="margin:6px 0 0;font-size:12px;color:#64748B">Includes ${fmtDays(me.leaveDays)} day(s) of approved leave / admin time — removed from your target.</p>` : "";

  let today = "";
  if (plan) {
    const li = (t) => `<li style="margin:3px 0;font-size:13px">${t}</li>`;
    const planned = plan.planned.slice(0, 8).map(a => li(`${a.time ? `<b>${esc(a.time)}</b> · ` : ""}${esc(a.type)}: ${esc(a.title)}`)).join("");
    const follow = plan.followUps.slice(0, 8).map(l => li(`${esc(l.company)}${l.nextCall < plan.todayISO ? ` <span style="color:#B91C1C">(due ${esc(fmtDay(l.nextCall))})</span>` : ""}`)).join("");
    const web = plan.newWebsiteLeads.slice(0, 8).map(l => li(`${esc(l.company)}${l.contact ? ` — ${esc(l.contact)}` : ""}${l.product ? ` · ${esc(l.product)}` : ""}`)).join("");
    today = `<h3 style="margin:18px 0 6px;font-size:14px;color:#0F172A">Today</h3>
      ${plan.planned.length ? `<div style="font-size:12px;color:#64748B">Planned (${plan.planned.length})</div><ul style="margin:4px 0 10px;padding-left:18px">${planned}</ul>` : `<p style="font-size:13px;color:#64748B;margin:4px 0">Nothing planned yet.</p>`}
      ${plan.followUps.length ? `<div style="font-size:12px;color:#64748B">Lead follow-ups due (${plan.followUps.length})</div><ul style="margin:4px 0 10px;padding-left:18px">${follow}</ul>` : ""}
      ${plan.newWebsiteLeads.length ? `<div style="font-size:12px;color:#64748B">New website leads assigned to you (${plan.newWebsiteLeads.length})</div><ul style="margin:4px 0 10px;padding-left:18px">${web}</ul>` : ""}
      ${plan.overdue ? `<p style="font-size:13px;margin:6px 0;color:#B91C1C"><b>${plan.overdue}</b> planned activit${plan.overdue === 1 ? "y is" : "ies are"} overdue — complete or reschedule them in SmartCRM.</p>` : ""}`;
  }
  return `<h2 style="margin:0 0 8px;font-size:16px;color:${BRAND}">Your activity</h2>${tiles}${leaveNote}${today}`;
}

function personRows(people, kind) {
  return people.slice().sort((a, b) => b.row.done - a.row.done || (a.user.name || "").localeCompare(b.user.name || "")).map(pv => {
    const r = pv.row;
    const note = pv.leaveDays > 0 ? `On leave ${fmtDays(pv.leaveDays)}d` : pv.quiet ? `<span style="color:#B91C1C">Nothing logged</span>` : "";
    return `<tr>${td(esc(pv.user.name))}${td(callsCell(r), "right")}${td(`<span style="color:${pctColor(r.callCompliancePct)};font-weight:600">${pctCell(r)}</span>`, "right")}${td(r.total.connected, "right")}${td(r.total.meetings, "right")}${td(`${r.done}${kind === "weekly" ? delta(r.done, pv.prevDone) : ""}`, "right")}${td(r.total.overdue || "—", "right", r.total.overdue ? "color:#B91C1C;font-weight:600" : "")}${td(pv.x.newLeads, "right")}${td(pv.x.quotesSent, "right")}${td(note)}</tr>`;
  }).join("");
}
const peopleHead = `<tr>${th("Person")}${th("Calls / target", "right")}${th("%", "right")}${th("Connected", "right")}${th("Meetings", "right")}${th("Done", "right")}${th("Overdue", "right")}${th("New leads", "right")}${th("Quotes", "right")}${th("")}</tr>`;

function teamHtml({ people }, kind) {
  return `<h2 style="margin:22px 0 8px;font-size:16px;color:${BRAND}">Your team</h2>
    <div style="overflow-x:auto"><table role="presentation" width="100%" cellspacing="0" style="border-collapse:collapse;min-width:620px">${peopleHead}${personRows(people, kind)}</table></div>`;
}

function companyHtml({ groups }, kind) {
  const sum = (ps, f) => ps.reduce((s, pv) => s + f(pv), 0);
  const rows = groups.sort((a, b) => (a.manager?.name || "~").localeCompare(b.manager?.name || "~")).map(g => {
    const ps = g.people;
    const target = sum(ps, pv => pv.row.targeted ? pv.row.callTarget : 0);
    const calls = sum(ps, pv => pv.row.targeted ? pv.row.total.callsMade : 0);
    const pct = target > 0 ? Math.round(calls / target * 100) : null;
    const quiet = ps.filter(pv => pv.quiet && pv.leaveDays === 0).length;
    return `<tr>${td(`<b>${esc(g.manager ? `${g.manager.name}'s team` : "No manager set")}</b>`)}${td(ps.length, "right")}${td(target ? `${calls} / ${target}` : calls, "right")}${td(`<span style="color:${pctColor(pct)};font-weight:600">${pct == null ? "—" : pct + "%"}</span>`, "right")}${td(sum(ps, pv => pv.row.total.meetings), "right")}${td(sum(ps, pv => pv.row.done), "right")}${td(sum(ps, pv => pv.x.newLeads), "right")}${td(sum(ps, pv => pv.x.quotesSent), "right")}${td(sum(ps, pv => pv.x.dealsWon) ? `${sum(ps, pv => pv.x.dealsWon)} · ${lakh(sum(ps, pv => pv.x.wonValue))}` : "—", "right")}${td(quiet ? `<span style="color:#B91C1C">${quiet} with nothing logged</span>` : "")}</tr>`;
  }).join("");
  const everyone = groups.flatMap(g => g.people);
  const T = sum(everyone, pv => pv.row.targeted ? pv.row.callTarget : 0);
  const C = sum(everyone, pv => pv.row.targeted ? pv.row.total.callsMade : 0);
  const P = T > 0 ? Math.round(C / T * 100) : null;
  const total = `<tr style="background:#F8FAFC">${td("<b>Company</b>")}${td(everyone.length, "right")}${td(T ? `<b>${C} / ${T}</b>` : C, "right")}${td(`<b style="color:${pctColor(P)}">${P == null ? "—" : P + "%"}</b>`, "right")}${td(`<b>${sum(everyone, pv => pv.row.total.meetings)}</b>`, "right")}${td(`<b>${sum(everyone, pv => pv.row.done)}</b>`, "right")}${td(`<b>${sum(everyone, pv => pv.x.newLeads)}</b>`, "right")}${td(`<b>${sum(everyone, pv => pv.x.quotesSent)}</b>`, "right")}${td(`<b>${sum(everyone, pv => pv.x.dealsWon) || "—"}</b>`, "right")}${td("")}</tr>`;
  return `<h2 style="margin:22px 0 8px;font-size:16px;color:${BRAND}">Company</h2>
    <div style="overflow-x:auto"><table role="presentation" width="100%" cellspacing="0" style="border-collapse:collapse;min-width:620px"><tr>${th("Team")}${th("People", "right")}${th("Calls / target", "right")}${th("%", "right")}${th("Meetings", "right")}${th("Done", "right")}${th("New leads", "right")}${th("Quotes", "right")}${th("Won", "right")}${th("")}</tr>${rows}${total}</table></div>`;
}

export function renderEmail({ kind, period, today, sections, appUrl = "" }) {
  const title = kind === "weekly" ? `Weekly report · ${fmtRange(period.from, period.to)}` : `Daily report · ${fmtRange(period.from, period.to)}`;
  const body = sections.map(s => {
    if (s.type === "personal") return personalHtml({ me: s.me, plan: s.plan && { ...s.plan, todayISO: today } }, kind);
    if (s.type === "team") return teamHtml(s, kind);
    return companyHtml(s, kind);
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#F1F5F9;font-family:Segoe UI,Arial,sans-serif;color:#0F172A">
  <table role="presentation" width="100%" cellspacing="0" style="background:#F1F5F9;table-layout:fixed"><tr><td align="center" style="padding:16px 6px">
  <table role="presentation" width="100%" cellspacing="0" style="max-width:720px;table-layout:fixed;background:#fff;border-radius:12px;border:1px solid #E2E8F0">
    <tr><td style="background:${BRAND};color:#fff;padding:16px 22px;border-radius:12px 12px 0 0">
      <div style="font-size:12px;opacity:.8;letter-spacing:.08em">SMARTCRM · HANS INFOMATIC</div>
      <div style="font-size:18px;font-weight:700;margin-top:2px">${esc(title)}</div>
    </td></tr>
    <tr><td style="padding:16px 14px">${body}
      <p style="margin:22px 0 0;font-size:11px;color:#94A3B8;line-height:1.5">Calls count every call report and completed call activity, including your part in shared demos. Targets are 5 calls per working day for sales roles, less holidays, approved leave and admin time — the same numbers as the Team view in SmartCRM.${appUrl ? ` <a href="${esc(appUrl)}" style="color:${BRAND}">Open SmartCRM</a>` : ""}</p>
    </td></tr>
  </table></td></tr></table></body></html>`;
}
