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
