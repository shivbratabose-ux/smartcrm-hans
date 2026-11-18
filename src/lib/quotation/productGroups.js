// One product master: every price row belongs to a product in the Product
// Catalogue, or to the shared "Services & add-ons" group. Rows say where they
// belong with `productId` (saved with the row's rates); older rows without it
// are placed by name, the way the quote builder already matched them.
// Pure — unit-tested in scripts/test-product-groups.mjs.

export const SERVICES_GROUP = "_services";
export const SERVICES_LABEL = "Services & add-ons — all products";
const SERVICE_MODULE = /additional service|professional services|^support$|^licence$/i;

// "+" is part of a name ("Business Insights+" is not "Business Insights").
const norm = (s) => String(s || "").toLowerCase().replace(/\+/g, " plus ").replace(/[^a-z0-9]+/g, " ").trim();

/** Which group a price row belongs to: a catalogue product id, SERVICES_GROUP, or "" (not placed). */
export function groupOf(row, catalog = []) {
  if (row?.productId === SERVICES_GROUP) return SERVICES_GROUP;
  if (row?.productId && catalog.some((p) => p.id === row.productId)) return row.productId;
  if (SERVICE_MODULE.test(String(row?.module || "").trim())) return SERVICES_GROUP;
  const hay = ` ${norm(`${row?.name} ${row?.module}`)} `;
  // Longest product name first, so "Business Insights+" never lands on "Business Insights".
  const byLength = [...catalog].sort((a, b) => norm(b.name).length - norm(a.name).length);
  const hit = byLength.find((p) => (norm(p.name) && hay.includes(` ${norm(p.name)} `)) || (norm(p.id) && hay.includes(` ${norm(p.id)} `)));
  return hit ? hit.id : "";
}

/** Price rows grouped in catalogue order, then services, then anything not placed. */
export function groupRates(rows = [], catalog = []) {
  const groups = new Map(catalog.map((p) => [p.id, { id: p.id, name: p.name || p.id, rows: [] }]));
  groups.set(SERVICES_GROUP, { id: SERVICES_GROUP, name: SERVICES_LABEL, rows: [] });
  groups.set("", { id: "", name: "Not linked to a product", rows: [] });
  rows.forEach((r) => groups.get(groupOf(r, catalog)).rows.push(r));
  return [...groups.values()];
}

/** The id the Product Catalogue gives a new product (same rule as its Add Product form). */
export function newProductId(name, taken) {
  const base = String(name || "").replace(/\+/g, "Plus").replace(/[^A-Za-z0-9]/g, "") || "Product";
  let id = base, n = 1;
  while (taken.has(id)) id = `${base}${++n}`;
  return id;
}

/**
 * Priced items that are products in their own right but missing from the
 * Product Catalogue (they can't be used on leads or deals). Returns the
 * catalogue entries to add, and which price row each one takes over.
 */
export function productsToAdd(rows = [], catalog = []) {
  const taken = new Set(catalog.map((p) => p.id));
  const out = [];
  rows.filter((r) => r && r.active !== false && groupOf(r, catalog) === "").forEach((r) => {
    const id = newProductId(r.name, taken);
    taken.add(id);
    out.push({ product: { id, name: r.name, desc: r.module || "", color: "#2563EB", bg: "#EFF6FF", lineManagerId: "", modules: [] }, code: r.code });
  });
  return out;
}

export function countsByProduct(rows = [], catalog = []) {
  const out = {};
  rows.forEach((r) => {
    const g = groupOf(r, catalog);
    const priced = r.listPrice != null || r.rateSource !== "Flat" || !!r.matrixId;
    out[g] = out[g] || { rows: 0, priced: 0 };
    out[g].rows++; if (priced) out[g].priced++;
  });
  return out;
}
