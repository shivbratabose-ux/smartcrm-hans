// Revenue share on charges billed to the trade (WiseCCS Model 1, TRS).
//
// Under TRS Hans Infomatic bills each forwarder per transaction (AWB, shipping
// bill, bill of entry) from its pre-deposit account. Nothing is invoiced to the
// terminal operator. Each month Hans sends the operator a REVENUE SHARE
// STATEMENT: the month's count and gross by type, Hans's share by slab of the
// combined count, and the operator's share. The operator invoices its share,
// which Hans pays within the agreed days of that invoice.
//
// A price row (and the agreement line's pricing snapshot) carries:
//   billTo: "trade"
//   revenueShare: { group, mode, slabs: [{ from, hansPct }], paymentDays }
// Slabs follow the price slabs' convention: a slab starting at `from` covers
// counts max(from, 1) … next.from − 1, so 0 / 4001 / 8001 / 12001 reads
// "up to 4,000", "4,001–8,000", "8,001–12,000", "12,001 and above".
//
// Two ways to apply the slabs (decision 21 Nov 2026: offer both):
//   graduated  each band of the month's combined count at its own share
//              (the first 4,000 at 100%, the next 4,000 at 60% …)
//   volume     the month's combined count picks one slab, whose share applies
//              to the whole month
// Transactions differ in value (₹75 domestic, ₹165 international), so a band's
// gross is its share of the count × the month's average value per transaction.
// Pure — tested in scripts/test-wiseccs.mjs.
import { normalizeSlabs, slabIndex } from "../quotation/slabs.js";

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round(n(v) * 100) / 100;
const pct = (v) => Math.min(100, Math.max(0, n(v)));
const fmt = (v) => n(v).toLocaleString("en-IN");
/** "Up to 4,000", "4,001–8,000", "12,001 and above". */
function bandLabel(slabs, i, unit = "") {
  const s = slabs[i], next = slabs[i + 1], u = unit ? ` ${unit}` : "";
  if (!s) return "";
  if (!next) return i === 0 ? `Any count${u}` : `${fmt(s.from)} and above${u}`;
  if (i === 0) return `Up to ${fmt(next.from - 1)}${u}`;
  return next.from - 1 === s.from ? `${fmt(s.from)}${u}` : `${fmt(s.from)}–${fmt(next.from - 1)}${u}`;
}

export const SHARE_MODES = {
  graduated: "Graduated: each band of the month's combined count at its own share",
  volume: "Whole month: the month's combined count sets one share for every transaction",
};
export const DEFAULT_PAYMENT_DAYS = 15;

/** Is this price row / agreement line billed to the trade (not to the customer)? */
export const isTradeBilled = (x) => (x?.billTo || x?.pricing?.billTo) === "trade";

/** The revenue-share settings of a row or agreement line, or null. */
export function revenueShareOf(x) {
  const rs = x?.revenueShare || x?.pricing?.revenueShare;
  return rs && Array.isArray(rs.slabs) && rs.slabs.length ? rs : null;
}

/** The share slabs as price-style slabs ({ from, rate } with rate = Hans %), sorted, first from 0. */
export const shareSlabs = (rs) => normalizeSlabs((rs?.slabs || []).map((s) => ({ from: n(s.from), rate: s.hansPct == null ? null : pct(s.hansPct) })));

/** "graduated" or "volume"; an agreement's own setting wins over the row's. */
export const shareMode = (rs, override = "") => (SHARE_MODES[override] ? override : SHARE_MODES[rs?.mode] ? rs.mode : "graduated");

/** Problems with revenue-share settings (Pricing Master). */
export function revenueShareProblems(rs) {
  if (!rs) return [];
  const out = [];
  const s = shareSlabs(rs);
  if (!s.length) out.push("Add at least one revenue-share slab.");
  if (s.some((x) => x.rate == null)) out.push("Every revenue-share slab needs Hans's share %.");
  if ((rs.slabs || []).some((x) => n(x.hansPct) < 0 || n(x.hansPct) > 100)) out.push("A share must be between 0% and 100%.");
  const froms = (rs.slabs || []).map((x) => n(x.from));
  if (new Set(froms).size !== froms.length) out.push("Two revenue-share slabs start at the same count.");
  return out;
}

/**
 * Split a month's combined count into share bands.
 * Returns { mode, bands: [{ label, from, to, count, hansPct }], hansPct (blended, 2 dp), slabIndex }.
 */
export function shareBands(count, rs, modeOverride = "") {
  const mode = shareMode(rs, modeOverride);
  const slabs = shareSlabs(rs);
  const c = Math.max(0, Math.floor(n(count)));
  const label = (i) => bandLabel(slabs, i);
  const idx = slabIndex(c, slabs);
  let bands;
  if (mode === "volume") {
    const s = slabs[idx];
    bands = s ? [{ label: label(idx), from: Math.max(1, s.from), to: slabs[idx + 1] ? slabs[idx + 1].from - 1 : null, count: c, hansPct: n(s.rate) }] : [];
  } else {
    bands = slabs.map((s, i) => {
      const first = Math.max(1, s.from), last = slabs[i + 1] ? slabs[i + 1].from - 1 : Infinity;
      return { label: label(i), from: first, to: Number.isFinite(last) ? last : null, count: Math.max(0, Math.min(c, last) - first + 1), hansPct: n(s.rate) };
    }).filter((b) => b.count > 0);
  }
  const weighted = bands.reduce((t, b) => t + b.count * b.hansPct, 0);
  const blended = c > 0 ? weighted / c : n(slabs[idx]?.rate ?? slabs[0]?.rate);
  return { mode, bands, hansPct: Math.round(blended * 100) / 100, slabIndex: idx };
}

/**
 * A month's revenue share from the trade lines' counts.
 * lines: [{ code, name, unit, qty, rate, missing? }] (rate = per transaction, as agreed).
 * Returns { mode, count, gross, average, bands: [{ …, gross, hans, operator }], hans, operator, hansPct }.
 * Hans and the operator always add up to the gross.
 */
export function shareMonth(lines = [], rs, modeOverride = "") {
  const rows = (lines || []).map((l) => ({ ...l, qty: Math.max(0, n(l.qty)), rate: n(l.rate), gross: r2(Math.max(0, n(l.qty)) * n(l.rate)) }));
  const count = rows.reduce((t, l) => t + l.qty, 0);
  const gross = r2(rows.reduce((t, l) => t + l.gross, 0));
  const average = count > 0 ? gross / count : 0;
  const split = shareBands(count, rs, modeOverride);
  const bands = split.bands.map((b) => {
    const g = r2(b.count * average);
    const hans = r2(g * b.hansPct / 100);
    return { ...b, gross: g, hans, operator: r2(g - hans) };
  });
  // Rounding: the last band takes any paisa left so the bands add up to the gross.
  const drift = r2(gross - bands.reduce((t, b) => t + b.gross, 0));
  if (bands.length && drift) { const b = bands[bands.length - 1]; b.gross = r2(b.gross + drift); b.hans = r2(b.gross * b.hansPct / 100); b.operator = r2(b.gross - b.hans); }
  const hans = r2(bands.reduce((t, b) => t + b.hans, 0));
  return { mode: split.mode, count, gross, average: r2(average), lines: rows, bands, hans, operator: r2(gross - hans), hansPct: split.hansPct };
}

/** One line per slab for the quotation and the Pricing Master: "Up to 4,000: Hans 100%, operator 0%". */
export function revenueShareText(rs, { operator = "the operator" } = {}) {
  const s = shareSlabs(rs);
  return s.map((x, i) => `${bandLabel(s, i, "transactions a month")}: Hans Infomatic ${n(x.rate)}%, ${operator} ${r2(100 - n(x.rate))}%`);
}

const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** A statement as CSV (opens in Excel). */
export function statementCsv(st) {
  const rows = [
    ["Revenue share statement", st.statementNo],
    ["Customer", st.customer], ["Agreement", st.agreementNo], ["Month", st.periodLabel],
    ["Slabs applied", SHARE_MODES[st.mode] || st.mode],
    [],
    ["Code", "Transaction", "Count", "Rate (INR)", "Gross (INR)"],
    ...st.lines.map((l) => [l.code, l.name, l.qty, l.rate, l.gross]),
    ["", "Total", st.count, "", st.gross],
    [],
    ["Slab (combined count)", "Count", "Gross (INR)", "Hans share %", "Hans (INR)", `${st.operatorName || "Operator"} (INR)`],
    ...st.bands.map((b) => [b.label, b.count, b.gross, b.hansPct, b.hans, b.operator]),
    ["Total", st.count, st.gross, st.hansPct, st.hans, st.operator],
    [],
    [`Payable to ${st.operatorName || "the operator"} on its invoice`, st.operator],
    ["Payment", `Within ${st.paymentDays} days of receipt of the operator's invoice`],
  ];
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
