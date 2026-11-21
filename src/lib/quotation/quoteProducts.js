// Product-led quote building: the rep picks the products being quoted, and
// the builder shows only those products' items, split by how they bill
// (fixed recurring / variable on actual use / one-time).
// Pure — tested in scripts/test-quote-products.mjs. No pricing here: the
// engine prices the lines exactly as before.
import { groupRates, groupOf, SERVICES_GROUP } from "./productGroups.js";
import { billingClassOf, productCommercialModel, BILLING_CLASSES } from "./commercial.js";

export const OTHER_GROUP = "_other";
const SERVICES_SHORT = "Services & add-ons";

/** Products a quote can be built from: catalogue products with active price rows, then services, then unplaced rows. */
export function quoteProductOptions(rows = [], catalog = []) {
  return groupRates((rows || []).filter((r) => r && r.active !== false), catalog)
    .filter((g) => g.rows.length)
    .map((g) => ({
      id: g.id || OTHER_GROUP,
      name: g.id === SERVICES_GROUP ? SERVICES_SHORT : g.id === "" ? "Other products" : g.name,
      rows: g.rows,
      model: productCommercialModel(g.rows),
    }));
}

/** The product a price row belongs to, as a quote-product id. */
export const productIdOfRow = (row, catalog = []) => (row ? groupOf(row, catalog) || OTHER_GROUP : "");

/** A product's rows split by how they bill, in a fixed order; empty groups left out. */
export function rowSections(rows = []) {
  return BILLING_CLASSES
    .map((c) => ({ key: c.key, label: c.label, rows: rows.filter((r) => billingClassOf(r) === c.key) }))
    .filter((s) => s.rows.length);
}

/** Products named on the opportunity that can be quoted, in the opportunity's order. */
export function productsFromOpp(opp, options = []) {
  const have = new Set(options.map((o) => o.id));
  const ids = [
    ...(Array.isArray(opp?.productSelection) ? opp.productSelection.map((s) => s?.productId) : []),
    ...(Array.isArray(opp?.products) ? opp.products : []),
    opp?.product,
  ].filter(Boolean);
  return [...new Set(ids)].filter((id) => have.has(id));
}

/** Products of the lines already on a quote, in line order. */
export function productsFromLines(lines = [], rowOf = () => null, catalog = []) {
  const out = [];
  for (const l of lines || []) {
    const row = rowOf(l?.productCode);
    const id = productIdOfRow(row, catalog);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** A new quote line for a price row: at its minimum users; a usage line has no quantity (billed on actual use). */
export function lineForRow(row) {
  const usage = billingClassOf(row || {}) === "transaction";
  // A row with its own contract term (e.g. WiseCCS: 84 or 60 months) starts at that term.
  return { productCode: row.code, qty: usage ? 0 : Math.max(1, Number(row.minQty) || 0), months: Number(row.termMonths) > 0 ? Number(row.termMonths) : 12, discountPct: 0 };
}

/** The item's name without its product's name in front ("Orbis One Enterprise" → "Enterprise"). */
export function chipLabel(row, productName = "") {
  const name = String(row?.name || row?.code || "");
  const p = String(productName || "").trim();
  if (!p) return name;
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const short = name.replace(new RegExp(`^${esc}\\s*(?:[—–:-]\\s*)?`, "i"), "").trim();
  return short && short !== name ? short.charAt(0).toUpperCase() + short.slice(1) : name;
}

/** A short price for the item's button: "₹4,199/User/mo", "₹30/HAWB", "₹50,000", "slab rates", or "" when priced elsewhere. */
export function rowPriceHint(row) {
  if (!row) return "";
  if (row.rateSource === "Slab") return "slab rates";
  if (row.matrixId || row.listPrice == null || row.listPrice === "") return "";
  const v = Number(row.listPrice);
  if (!Number.isFinite(v)) return "";
  const amt = `₹${(Math.round(v * 100) / 100).toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(Math.round(v * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 })}`;
  const unit = String(row.unit || "").trim();
  const cls = billingClassOf(row);
  if (cls === "one_time") return unit && !/^(fixed|lot|one[- ]?time|job|project|each)$/i.test(unit) ? `${amt}/${unit}` : amt;
  if (cls === "transaction") return unit ? `${amt}/${unit}` : amt;
  return unit ? `${amt}/${unit}/mo` : `${amt}/mo`;
}
