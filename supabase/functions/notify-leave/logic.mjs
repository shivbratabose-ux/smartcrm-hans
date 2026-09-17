// Pure logic for the notify-leave edge function — who gets the email and
// what it says. No Deno / network imports, so scripts/test-leave-notify.mjs
// runs the exact code the function deploys.
//
// Kinds:
//   "requested"  the person asked for leave → email their line manager
//                (users.reports_to). No line manager → active admins.
//   "decided"    an approver approved / rejected → email the person.
//
// Recipients are always resolved here from the users table, never taken
// from the client payload, so the function can't be used to email anyone
// other than the right manager / requester.

export const GLOBAL_ROLES = new Set(["admin", "md", "director", "vp_sales_mkt"]);
const roleOf = (u) => String(u?.role || "").trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const reachable = (u) => !!u && u.active !== false && EMAIL_RE.test(String(u.email || "").trim());

// Same rule as canApproveLeave in src/utils/teamSummary.js: line manager,
// anyone above on the solid reporting line, or a global role; never self.
export function canApprove(approverId, ownerId, users) {
  if (!approverId || !ownerId || approverId === ownerId) return false;
  const byId = new Map(users.map(u => [u.id, u]));
  if (GLOBAL_ROLES.has(roleOf(byId.get(approverId)))) return true;
  const seen = new Set([ownerId]);
  for (let m = byId.get(ownerId)?.reports_to; m && !seen.has(m); m = byId.get(m)?.reports_to) {
    if (m === approverId) return true;
    seen.add(m);
  }
  return false;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Same types as LEAVE_TYPES in src/utils/teamSummary.js.
export const TYPE_LABEL = { "Leave": "Full day leave", "Half-day leave": "Half day leave", "Admin day": "Admin day" };
const noun = (type) => type === "Admin day" ? "an admin day" : "leave";

export function validatePayload(p) {
  if (!p || typeof p !== "object") return "body must be a JSON object";
  if (!["requested", "decided"].includes(p.kind)) return "kind must be requested | decided";
  if (!p.ownerId || typeof p.ownerId !== "string") return "ownerId is required";
  if (!TYPE_LABEL[p.type]) return "type must be Leave | Half-day leave | Admin day";
  if (!Array.isArray(p.dates) || p.dates.length === 0 || p.dates.length > 60 || !p.dates.every(d => DATE_RE.test(d))) return "dates must be 1–60 YYYY-MM-DD strings";
  if (p.kind === "decided" && !["Approved", "Rejected"].includes(p.decision)) return "decision must be Approved | Rejected";
  return null;
}

/**
 * @returns {{ok:true, to:Array<{id,name,email}>, fallback?:string} | {ok:false, status:number, error:string}}
 */
export function resolveRecipients({ kind, callerId, ownerId, users }) {
  const owner = users.find(u => u.id === ownerId);
  if (!owner) return { ok: false, status: 404, error: "Unknown person" };

  if (kind === "requested") {
    if (callerId !== ownerId) return { ok: false, status: 403, error: "Only the person requesting leave can send this" };
    const mgr = users.find(u => u.id === owner.reports_to);
    if (reachable(mgr)) return { ok: true, to: [pick(mgr)] };
    const admins = users.filter(u => roleOf(u) === "admin" && u.id !== ownerId && reachable(u));
    if (admins.length) return { ok: true, to: admins.map(pick), fallback: mgr ? "line manager has no email — sent to admins" : "no line manager set — sent to admins" };
    return { ok: false, status: 422, error: "No line manager or admin with an email address" };
  }

  if (!canApprove(callerId, ownerId, users)) return { ok: false, status: 403, error: "You can't approve leave for this person" };
  if (!reachable(owner)) return { ok: false, status: 422, error: "This person has no email address" };
  return { ok: true, to: [pick(owner)] };
}
const pick = (u) => ({ id: u.id, name: u.name || u.email, email: String(u.email).trim() });

export const escapeHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`;
}

// "Mon 21 Sep 2026" or "Mon 21 Sep 2026 – Tue 22 Sep 2026 (2 working days)"
export function describeDates(dates, type) {
  const sorted = [...dates].sort();
  const per = type === "Half-day leave" ? 0.5 : 1;
  const days = sorted.length * per;
  const n = `${days} working day${days === 1 ? "" : "s"}`;
  const span = sorted.length === 1 ? fmtDate(sorted[0]) : `${fmtDate(sorted[0])} – ${fmtDate(sorted[sorted.length - 1])}`;
  return { span, days, text: `${span} (${n}${type === "Half-day leave" ? ", half days" : ""})` };
}

/**
 * @returns {{subject:string, html:string}}
 */
export function buildEmail({ kind, owner, actor, recipient, type, dates, reason, decision, note, appUrl }) {
  const d = describeDates(dates, type);
  const link = `${String(appUrl || "").replace(/\/+$/, "")}/`;
  const esc = escapeHtml;
  const row = (k, v) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:4px 0;color:#0f172a">${v}</td></tr>`;
  const wrap = (heading, intro, rows, cta) => `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Segoe UI,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:22px 24px">
    <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1B6B5A;margin-bottom:6px">SmartCRM · Leave</div>
    <h1 style="font-size:18px;margin:0 0 10px;color:#0f172a">${heading}</h1>
    <p style="font-size:14px;line-height:1.5;color:#334155;margin:0 0 14px">${intro}</p>
    <table style="font-size:14px;border-collapse:collapse;margin-bottom:18px">${rows}</table>
    ${cta ? `<a href="${esc(link)}" style="display:inline-block;background:#1B6B5A;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 16px;border-radius:8px">${cta}</a>` : ""}
  </div>
  <p style="font-size:11.5px;color:#94a3b8;margin:12px 4px 0">Automatic message from SmartCRM. Only approved leave and admin days come off the 5-calls-a-day target.</p>
</div></body></html>`;

  const what = type === "Admin day" ? "Admin day" : "Leave";
  if (kind === "requested") {
    return {
      subject: `${what} request: ${owner.name} · ${d.span}`,
      html: wrap(
        `${esc(owner.name)} has requested ${noun(type)}`,
        `Hi ${esc(String(recipient?.name || "").split(" ")[0] || "there")}, ${esc(owner.name)} is waiting for your approval.`,
        row("Dates", esc(d.text)) + row("Type", esc(TYPE_LABEL[type])) + (reason ? row("Reason", esc(reason)) : ""),
        "Review in SmartCRM → Calendar → Leave",
      ),
    };
  }
  const ok = decision === "Approved";
  return {
    subject: `${what} ${ok ? "approved" : "rejected"}: ${d.span}`,
    html: wrap(
      `Your ${what === "Leave" ? "leave was" : "admin day was"} ${ok ? "approved" : "rejected"}`,
      `${esc(actor?.name || "Your manager")} ${ok ? "approved" : "rejected"} your ${what === "Leave" ? "leave" : "admin day"} request.${ok ? " These days now carry no call target." : ""}`,
      row("Dates", esc(d.text)) + row("Type", esc(TYPE_LABEL[type])) + (note ? row(ok ? "Note" : "Reason", esc(note)) : ""),
      "Open SmartCRM",
    ),
  };
}
