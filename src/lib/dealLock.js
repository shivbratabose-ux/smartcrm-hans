// A closed deal's close date is locked one month after it (decision 21 Nov
// 2026): from then on only an Admin can change the close date of a Won or
// Lost deal, or reopen it to an open stage (reopening would make the date
// editable again). Before the month is out, the deal's editors can still
// correct it. Pure — tested in scripts/test-deal-lock.mjs.

export const CLOSE_LOCK_MONTHS = 1;

const iso = (d) => String(d || "").slice(0, 10);

/** The day a close date locks: the same day one calendar month later (31 Jan → 28/29 Feb). */
export function closeLockDate(closeDate, months = CLOSE_LOCK_MONTHS) {
  const s = iso(closeDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y, m, d] = s.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** Only an Admin may change a locked closed deal. */
export const canOverrideClosedDeal = (role) => role === "admin";

/**
 * Is this deal's close date locked for this user?
 * ctx: { today, closedStages: [wonName, lostName], role }
 * Returns { locked, lockedOn, reason } — locked is false for an Admin.
 */
export function closedDealLock(opp, { today = "", closedStages = ["Won", "Lost"], role = "" } = {}) {
  const closed = !!opp && closedStages.includes(opp.stage);
  const lockedOn = closed ? closeLockDate(opp.closeDate) : "";
  const past = !!lockedOn && iso(today) >= lockedOn;
  const locked = past && !canOverrideClosedDeal(role);
  return {
    locked, lockedOn, past,
    reason: past ? `Closed ${opp.stage} on ${iso(opp.closeDate)}: the close date locked on ${lockedOn}. Only an Admin can change it or reopen the deal.` : "",
  };
}

/**
 * Keep a locked deal's close date and closed stage when someone other than an
 * Admin saves it. Returns { next, blocked: ["closeDate" | "stage"] }.
 */
export function guardClosedDeal(prev, next, ctx = {}) {
  const lock = closedDealLock(prev, ctx);
  if (!lock.locked || !next) return { next, blocked: [] };
  const blocked = [];
  let out = next;
  if (iso(next.closeDate) !== iso(prev.closeDate)) { out = { ...out, closeDate: prev.closeDate }; blocked.push("closeDate"); }
  if (next.stage !== prev.stage) { out = { ...out, stage: prev.stage, probability: prev.probability }; blocked.push("stage"); }
  return { next: out, blocked };
}
