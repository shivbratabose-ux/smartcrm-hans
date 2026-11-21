// One product master (21 Nov 2026): a product's catalogue modules and its
// price rows are shown and created as one list of items. An item is a price
// row (what quotes use) with its module (what deals and leads pick), linked by
// row.moduleId / module.priceCode. Older data is linked by name; a module with
// no price is an "unpriced" item, a price row with no module is still an item.
// Pure; tested in scripts/test-product-items.mjs.
import { groupOf } from "./productGroups.js";
import { billingClassOf } from "./commercial.js";

export const ITEM_TYPES = ["Plan", "Core", "Add-on", "Subscription add-on", "Integration", "Service", "Implementation", "Licence"];
/** Pricing model for each way an item is billed. */
export const MODEL_FOR_CLASS = { subscription: "SaaS Subscription", transaction: "Per-transaction", one_time: "Implementation" };

const norm = (s) => String(s || "").toLowerCase().replace(/\+/g, " plus ").replace(/[^a-z0-9]+/g, " ").trim();
const stripProduct = (name, product) => {
  const n = norm(name), p = norm(product?.name);
  return p && n.startsWith(`${p} `) ? n.slice(p.length + 1) : n;
};

/** Does this module describe this price row? Explicit links first, then the same name (product prefix ignored). */
export function linked(module, row, product) {
  if (!module || !row) return false;
  if (row.moduleId) return row.moduleId === module.id;
  if (module.priceCode) return module.priceCode === row.code;
  const m = norm(module.name);
  return !!m && (stripProduct(row.name, product) === m || norm(row.name) === m);
}

/**
 * A product's items, in a stable order: price rows (each with its module if
 * one matches), then modules that have no price yet.
 * Returns [{ key, row, module, priced }].
 */
export function itemsOf(product, rows = [], catalog = []) {
  const mine = (rows || []).filter((r) => groupOf(r, catalog) === product.id);
  const mods = Array.isArray(product.modules) ? product.modules : [];
  const used = new Set();
  const out = mine.map((row) => {
    const module = mods.find((m) => !used.has(m.id) && linked(m, row, product)) || null;
    if (module) used.add(module.id);
    return { key: `r:${row.code}`, row, module, priced: row.listPrice != null || row.rateSource !== "Flat" || !!row.matrixId };
  });
  mods.filter((m) => !used.has(m.id)).forEach((m) => out.push({ key: `m:${m.id}`, row: null, module: m, priced: false }));
  return out;
}

/** A new, unique price-row code for a product: its existing prefix (OB, IC…) and the next number. */
export function newItemCode(product, rows = [], catalog = []) {
  const mine = (rows || []).filter((r) => groupOf(r, catalog) === product.id).map((r) => String(r.code || ""));
  const counts = {};
  mine.forEach((c) => { const m = /^([A-Z]+)\d+$/.exec(c); if (m) counts[m[1]] = (counts[m[1]] || 0) + 1; });
  const prefix = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
    || String(product.id || product.name || "IT").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "IT";
  const taken = new Set((rows || []).map((r) => String(r.code)));
  let n = Math.max(0, ...mine.filter((c) => c.startsWith(prefix)).map((c) => Number(c.slice(prefix.length)) || 0)) + 1;
  let code = `${prefix}${String(n).padStart(2, "0")}`;
  while (taken.has(code)) code = `${prefix}${String(++n).padStart(2, "0")}`;
  return code;
}

/** What the item editor shows for an item (row fields, module type and description). */
export function itemForm(item, product) {
  const r = item?.row || {};
  const m = item?.module || {};
  const cls = item?.row ? billingClassOf(r) : "subscription";
  return {
    name: r.name || m.name || "", type: r.itemType || m.type || (cls === "transaction" ? "Add-on" : cls === "one_time" ? "Implementation" : "Core"),
    description: r.description || m.desc || "", billingClass: cls, pricingModel: r.pricingModel || MODEL_FOR_CLASS[cls],
    unit: r.unit || (cls === "transaction" ? "Transaction" : cls === "one_time" ? "Fixed" : "User"),
    listPrice: r.listPrice ?? "", costPrice: r.costPrice ?? "", minQty: r.minQty ?? "", maxDiscountPct: r.maxDiscountPct ?? "", amcPct: r.amcPct ?? "",
    oneTimeAllowed: r.oneTimeAllowed !== false, otMonths: r.otMonths ?? "", otDiscountPct: r.otDiscountPct ?? "",
    active: r.active !== false, rateSource: r.rateSource || "Flat", productName: product?.name || "",
  };
}

const numOrNull = (v) => (v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));

/** Problems with an item form before saving. */
export function itemProblems(f) {
  const out = [];
  if (!String(f.name || "").trim()) out.push("Name is required.");
  if (!String(f.unit || "").trim()) out.push("Pick the unit it is priced per.");
  for (const [k, label, max] of [["listPrice", "List price"], ["costPrice", "Cost"], ["minQty", "Minimum quantity"], ["maxDiscountPct", "Max discount", 100], ["amcPct", "AMC %", 100], ["otMonths", "One-time months", 240], ["otDiscountPct", "One-time discount", 100]]) {
    const v = f[k];
    if (v === "" || v === null || v === undefined) continue;
    if (!Number.isFinite(Number(v)) || Number(v) < 0 || (max && Number(v) > max)) out.push(`${label}: ${max ? `0 to ${max}` : "a number of 0 or more"}.`);
  }
  return out;
}

/**
 * Save an item: the price row and its module, linked both ways.
 * Returns { row, module } to write; the caller puts them in masters / catalog.
 */
export function saveItem(f, { item, product, rows = [], catalog = [], uid }) {
  const code = item?.row?.code || newItemCode(product, rows, catalog);
  const moduleId = item?.module?.id || `m_${uid()}`;
  const cls = f.billingClass;
  const row = {
    ...(item?.row || {}), code, productId: product.id, name: f.name.trim(), module: item?.row?.module || product.name,
    description: f.description || "", itemType: f.type, billingClass: cls, pricingModel: f.pricingModel || MODEL_FOR_CLASS[cls],
    unit: f.unit, rateSource: item?.row?.rateSource || "Flat",
    listPrice: (item?.row && item.row.rateSource && item.row.rateSource !== "Flat") ? item.row.listPrice : numOrNull(f.listPrice),
    costPrice: numOrNull(f.costPrice), minQty: numOrNull(f.minQty), maxDiscountPct: numOrNull(f.maxDiscountPct), amcPct: numOrNull(f.amcPct),
    oneTimeAllowed: cls === "subscription" ? f.oneTimeAllowed !== false : false,
    otMonths: cls === "subscription" ? numOrNull(f.otMonths) : null, otDiscountPct: cls === "subscription" ? numOrNull(f.otDiscountPct) : null,
    active: f.active !== false, moduleId,
  };
  const module = { ...(item?.module || {}), id: moduleId, name: f.name.trim(), type: f.type, desc: f.description || "", priceCode: code };
  return { row, module };
}
