// Slab (volume-tier) pricing for a price row: rateSource "Slab" with
// slabs = [{ from, rate }] (e.g. AMS Ocean Consol per HBL, Cargomar sheet):
//   Up to 200 HBL / month  ₹800 · 201–500 ₹700 · 501–699 ₹500 · 700 and above ₹400
// The month's whole volume bills at the rate of the slab it falls in (not
// graduated). On a quote the line's qty is the expected monthly volume.
// Pure — tested in scripts/test-slabs.mjs.

const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

/** Clean, ascending by `from`; the lowest slab always starts at 0. */
export function normalizeSlabs(slabs) {
  const rows = (Array.isArray(slabs) ? slabs : [])
    .map((s) => ({ from: Math.max(0, Math.floor(num(s?.from) ?? 0)), rate: num(s?.rate) }))
    .sort((a, b) => a.from - b.from)
    .filter((s, i, arr) => i === 0 || s.from !== arr[i - 1].from);
  if (rows.length) rows[0].from = 0;
  return rows;
}

/** Index of the slab a monthly volume falls in. */
export function slabIndex(qty, slabs) {
  const rows = normalizeSlabs(slabs);
  const q = Math.max(0, num(qty) ?? 0);
  let idx = rows.length ? 0 : -1;
  rows.forEach((s, i) => { if (q >= s.from) idx = i; });
  return idx;
}

/** { rate, index, missing } for a volume. */
export function slabRate(qty, slabs) {
  const rows = normalizeSlabs(slabs);
  const i = slabIndex(qty, rows);
  const rate = i >= 0 ? rows[i].rate : null;
  return { rate, index: i, missing: rate == null };
}

/** "Up to 200", "201–500", "700 and above" (+ unit). */
export function slabLabel(slabs, i, unit = "") {
  const rows = normalizeSlabs(slabs);
  const s = rows[i];
  if (!s) return "";
  const next = rows[i + 1];
  const u = unit ? ` ${unit}` : "";
  if (!next) return i === 0 ? `Any volume${u}` : `${s.from} and above${u}`;
  if (i === 0) return `Up to ${next.from - 1}${u}`;
  return next.from - 1 === s.from ? `${s.from}${u}` : `${s.from}–${next.from - 1}${u}`;
}

/** Rows to print: [{ label, rate }]. */
export function slabTable(slabs, unit = "") {
  return normalizeSlabs(slabs).map((s, i, rows) => ({ label: slabLabel(rows, i, unit), rate: s.rate }));
}

/** Problems an admin should fix before quoting. */
export function slabProblems(slabs) {
  const rows = normalizeSlabs(slabs);
  const out = [];
  if (!rows.length) out.push("Add at least one slab.");
  if (rows.some((s) => s.rate == null)) out.push("Every slab needs a rate.");
  return out;
}

// ════════════════════════════════════════════════════════════════════
// Usage pricing (data processing as a service). A price row may carry:
//   slabs + slabMode   "volume" (whole volume at its slab's rate, default)
//                      | "graduated" (each band at its own rate)
//   slabPeriod         "month" (default) | "year": the slab is picked on
//                      the year's volume (monthly qty × 12)
//   packQty, packPrice prepaid pack: packQty units a month for packPrice,
//                      beyond that the row's rate (slab or list price)
//   monthlyMinimum     ₹ minimum per month
//   pool               rows with the same pool name count their volume
//                      together to pick the slab (e.g. IGM + EGM)
//   escalationPct      yearly increase, applied from year 2 of the term
// usagePrice() is the single place these rules are worked out; the engine,
// the builder and the quotation all use it.
// ════════════════════════════════════════════════════════════════════
const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Does this row use any usage-pricing setting beyond a plain rate? */
export function hasUsageRules(row) {
  return !!row && (row.rateSource === "Slab" || n0(row.packQty) > 0 || n0(row.monthlyMinimum) > 0 || !!String(row.pool || "").trim() || n0(row.escalationPct) > 0
    || row.billTo === "trade" || row.minimumMode === "differential");
}

/**
 * Hybrid "fixed core + variable" minimum (minimumMode "differential", WiseCCS
 * Model 2): payable = fixed fee + share% × (variable − fixed fee). Above the
 * fixed fee the customer pays the fee plus the share of the overage; below it,
 * the fee less the share of the saving. The share defaults to 40%.
 */
export const differentialShare = (row) => Math.min(100, Math.max(0, row?.differentialSharePct == null || row.differentialSharePct === "" ? 40 : n0(row.differentialSharePct)));
export function differentialCharge(fixed, variable, sharePct) {
  const f = Math.max(0, n0(fixed)), v = Math.max(0, n0(variable)), s = Math.min(100, Math.max(0, n0(sharePct))) / 100;
  return { fixed: f, variable: v, sharePct: s * 100, adjustment: s * (v - f), amount: Math.max(0, f + s * (v - f)) };
}

/** Graduated cost of a volume: each band at its own rate. */
export function graduatedCost(volume, slabs) {
  const rows = normalizeSlabs(slabs);
  const v = Math.max(0, n0(volume));
  let cost = 0;
  // Units are counted 1, 2, 3…: a slab starting at `from` covers units
  // max(from, 1) … next.from − 1 (same as its label "Up to 200", "201–500").
  rows.forEach((s, i) => {
    const first = Math.max(s.from, 1);
    const last = rows[i + 1] ? rows[i + 1].from - 1 : Infinity;
    const units = Math.max(0, Math.min(v, last) - first + 1);
    cost += units * n0(s.rate);
  });
  return cost;
}

/**
 * Price of `qty` units a month for a row.
 * opts.poolQty = the pool's total monthly volume (defaults to qty).
 * Returns { amount (per month, before discount and minimum), unitPrice (average),
 *           rate (marginal rate), slabIndex, floor (₹ minimum per month), missing }.
 */
export function usagePrice(row, qty, opts = {}) {
  const q = Math.max(0, n0(qty));
  const pool = Math.max(q, n0(opts.poolQty ?? q));
  const yearly = row?.slabPeriod === "year";
  const slabVolume = pool * (yearly ? 12 : 1);
  let rate = null, slabIdx = -1, avg = null;
  if (row?.rateSource === "Slab") {
    const pick = slabRate(slabVolume, row.slabs);
    slabIdx = pick.index; rate = pick.rate;
    if (row.slabMode === "graduated" && rate != null) {
      avg = slabVolume > 0 ? graduatedCost(slabVolume, row.slabs) / slabVolume : normalizeSlabs(row.slabs)[0]?.rate ?? null;
    } else avg = rate;
  } else {
    rate = row?.listPrice == null || row.listPrice === "" ? null : n0(row.listPrice);
    avg = rate;
  }
  const missing = avg == null;
  const packQty = n0(row?.packQty), packPrice = n0(row?.packPrice);
  let amount;
  if (packQty > 0) amount = packPrice + Math.max(0, q - packQty) * n0(avg);
  else amount = q * n0(avg);
  const floor = Math.max(n0(row?.monthlyMinimum), packQty > 0 ? packPrice : 0);
  return { amount, unitPrice: q > 0 ? amount / q : n0(avg), rate, slabIndex: slabIdx, floor, missing, slabVolume };
}

/** Rates for years 1..n with a yearly escalation. */
export function escalatedRates(rate, pct, years = 3) {
  const r = n0(rate), p = n0(pct) / 100;
  return Array.from({ length: years }, (_, y) => Math.round(r * Math.pow(1 + p, y) * 100) / 100);
}

/** Month-weighted escalation factor over a term: Σ months in year y × (1+p)^(y-1). */
export function escalationMonths(months, pct) {
  const m = Math.max(0, n0(months)), p = n0(pct) / 100;
  if (!p) return m;
  let total = 0;
  for (let y = 0; y * 12 < m; y++) total += Math.min(12, m - y * 12) * Math.pow(1 + p, y);
  return total;
}

/** Total monthly volume per pool on a quote: { poolName: qty }. */
export function poolVolumes(lines, rowOf) {
  const out = {};
  for (const l of lines || []) {
    const pool = String(rowOf(l.productCode)?.pool || "").trim();
    if (pool) out[pool] = (out[pool] || 0) + Math.max(0, n0(l.qty));
  }
  return out;
}

/** Plain-English description of a row's usage rules, for the quotation. */
export function usageRuleText(row, { unit = "", poolMates = [] } = {}) {
  if (!row) return [];
  const u = unit || row.unit || "unit";
  const out = [];
  if (row.rateSource === "Slab") {
    out.push(row.slabMode === "graduated"
      ? `Graduated slabs: each band of the ${row.slabPeriod === "year" ? "year's" : "month's"} volume is billed at its own rate.`
      : `Volume slabs: the ${row.slabPeriod === "year" ? "year's" : "month's"} whole volume is billed at the rate of the slab it falls in.`);
    if (row.slabPeriod === "year") out.push("The slab is set on the yearly volume (monthly volume × 12).");
  }
  if (n0(row.packQty) > 0) out.push(`Prepaid pack: ${n0(row.packQty).toLocaleString("en-IN")} ${u} a month for ₹${Math.round(n0(row.packPrice)).toLocaleString("en-IN")}; beyond that, the rate per ${u}.`);
  if (n0(row.monthlyMinimum) > 0 && row.minimumMode === "differential") {
    const share = differentialShare(row);
    out.push(`Fixed monthly fee ₹${Math.round(n0(row.monthlyMinimum)).toLocaleString("en-IN")}. Each month the variable charge (${u} count × rate) is compared with the fixed fee and ${share}% of the difference is added (when higher) or deducted (when lower): payable = fixed fee + ${share}% × (variable − fixed fee).`);
  } else if (n0(row.monthlyMinimum) > 0) out.push(`Minimum billing: ₹${Math.round(n0(row.monthlyMinimum)).toLocaleString("en-IN")} a month.`);
  if (row.billTo === "trade") out.push(`Billed by Hans Infomatic to the trade (each user, from its pre-deposit account), not to the customer; the customer's revenue share is paid on a monthly statement.`);
  if (poolMates.length) out.push(`Volume counted together with: ${poolMates.join(", ")}.`);
  if (n0(row.escalationPct) > 0) out.push(`Rates increase by ${n0(row.escalationPct)}% each year from year 2.`);
  return out;
}
