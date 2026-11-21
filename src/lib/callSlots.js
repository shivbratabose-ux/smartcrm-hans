// ─────────────────────────────────────────────────────────────────────
// Call slots: a user can have at most MAX_CALLS_PER_SLOT calls in one
// time slot (one clock hour on the calendar: 09:00–09:59, 10:00–10:59…).
//
// "A call" is either
//   • an activity of type Call that isn't Cancelled  (owner = activity.owner)
//   • a call report                                    (owner = marketingPerson)
// and it only sits in a slot when it has a time. Calls saved without a
// time (follow-up reminders, older records) aren't booked into any slot.
//
// The rule applies going forward only: it checks a call when it is added,
// or when its date, time, owner or status changes. Calls already saved
// are never flagged, changed or removed, even if their slot is over the
// limit; they still count toward the limit for new calls in that slot.
// ─────────────────────────────────────────────────────────────────────

export const MAX_CALLS_PER_SLOT = 2;

/** "14:35" → "14"; "9:05" → "09"; anything else → "" (no slot). */
export function slotHour(time) {
  const m = /^\s*(\d{1,2}):(\d{2})/.exec(String(time || ""));
  if (!m) return "";
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? String(h).padStart(2, "0") : "";
}

/** "14" → "14:00–14:59" */
export const slotLabel = (hour) => `${hour}:00–${hour}:59`;

const isActCall = (a) => !!a && !a.isDeleted && a.type === "Call" && a.status !== "Cancelled";

/** One activity as a slotted call, or null when it isn't one. */
export function callFromActivity(a) {
  if (!isActCall(a)) return null;
  const hour = slotHour(a.time);
  if (!a.date || !hour) return null;
  return { key: `act:${a.id}`, owner: a.owner || "", date: a.date, hour };
}

/** One call report as a slotted call, or null when it isn't one. */
export function callFromReport(r) {
  if (!r || r.isDeleted) return null;
  const hour = slotHour(r.callTime);
  if (!r.callDate || !hour) return null;
  return { key: `cr:${r.id}`, owner: r.marketingPerson || "", date: r.callDate, hour };
}

/** Every slotted call across both lists. */
export function allCalls({ activities = [], callReports = [] } = {}) {
  const out = [];
  for (const a of activities || []) { const c = callFromActivity(a); if (c) out.push(c); }
  for (const r of callReports || []) { const c = callFromReport(r); if (c) out.push(c); }
  return out;
}

/** Calls in the same slot as `call` (same owner, date and hour), excluding itself. */
export function slotMates(call, data) {
  if (!call || !call.owner) return [];
  return allCalls(data).filter(c =>
    c.key !== call.key && c.owner === call.owner && c.date === call.date && c.hour === call.hour);
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
/** "2026-11-26" → "26 Nov 2026" */
export function dayLabel(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ""));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] || m[2]} ${m[1]}` : String(date || "");
}

export function slotMessage(call, max = MAX_CALLS_PER_SLOT, userName = "") {
  const who = userName ? `${userName} already has` : "You already have";
  return `${who} ${max} calls on ${dayLabel(call.date)} between ${slotLabel(call.hour)}. `
    + `Only ${max} calls are allowed in one time slot: pick another time.`;
}

/**
 * Check one call a form is about to save.
 *   kind: "activity" | "callReport"; record: the record as it will be saved.
 * An edit that leaves the call in the slot it was already saved in is
 * always fine (saved calls are never re-checked).
 * Returns "" when it's fine, or the message to show.
 */
export function callSlotProblem(kind, record, data, { max = MAX_CALLS_PER_SLOT, userName = "" } = {}) {
  const list = (kind === "activity" ? data?.activities : data?.callReports) || [];
  const saved = record?.id ? list.find(r => r?.id === record.id) : null;
  const call = changedCall(kind, saved, record);
  if (!call || !call.owner) return "";
  return slotMates(call, data).length >= max ? slotMessage(call, max, userName) : "";
}

// Did this record just become (or move to) a slotted call? Unchanged
// records — everything already saved — are never re-checked.
function changedCall(kind, before, after) {
  const toCall = kind === "activity" ? callFromActivity : callFromReport;
  const nowC = toCall(after);
  if (!nowC) return null;
  const wasC = before ? toCall(before) : null;
  if (wasC && wasC.owner === nowC.owner && wasC.date === nowC.date && wasC.hour === nowC.hour) return null;
  return nowC;
}

/**
 * Guard a whole-list update (what a setActivities / setCallReports does).
 * Records added or moved into a full slot are kept out: a new record is
 * dropped, an edited one goes back to how it was. Everything else in the
 * update goes through untouched.
 *   kind:  "activity" | "callReport"   — which list `prev`/`next` are
 *   other: the other list (call reports when kind is "activity", and so on)
 * Returns { next, blocked: [{ id, owner, date, hour, message }] }.
 */
export function guardCallSlots(kind, prev = [], next = [], other = [], { max = MAX_CALLS_PER_SLOT, nameOf } = {}) {
  if (prev === next || !Array.isArray(next)) return { next, blocked: [] };
  const before = new Map((prev || []).map(r => [r?.id, r]));
  const changes = next.map(rec => {
    const old = before.get(rec?.id);
    return { rec, old, call: rec ? changedCall(kind, old, rec) : null };
  });
  if (!changes.some(x => x.call && x.call.owner)) return { next, blocked: [] };

  // Start from everything that isn't a new/moved call, then admit the
  // changes one by one, so two new calls in one update can't both take
  // the last free place.
  const mine = changes.filter(x => !(x.call && x.call.owner)).map(x => x.rec);
  const dataOf = () => (kind === "activity"
    ? { activities: mine, callReports: other }
    : { activities: other, callReports: mine });
  const blocked = [];
  const blockedIds = new Set();
  for (const x of changes) {
    if (!(x.call && x.call.owner)) continue;
    if (slotMates(x.call, dataOf()).length >= max) {
      blocked.push({ id: x.rec.id, owner: x.call.owner, date: x.call.date, hour: x.call.hour,
        message: slotMessage(x.call, max, nameOf ? nameOf(x.call.owner) : "") });
      blockedIds.add(x.rec.id);
      if (x.old) mine.push(x.old);        // an edit keeps its saved version
    } else {
      mine.push(x.rec);
    }
  }
  if (!blocked.length) return { next, blocked };
  const out = [];
  for (const x of changes) {
    if (x.rec && blockedIds.has(x.rec.id)) { if (x.old) out.push(x.old); }   // new one: left out
    else out.push(x.rec);
  }
  return { next: out, blocked };
}
