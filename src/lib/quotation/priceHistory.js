// Plain-English summaries of pricing_master_history rows, and the pricing
// permission rule. Pure — tested in scripts/test-agreements.mjs.

export const SECTION_LABEL = {
  price: "Price row", quoteConfig: "Quotation rules (config)", bands: "Pricing bands", editions: "iCAFFE rate card",
  rateCards: "Rate cards", termSets: "Terms & EULA", terms: "Commercial notes", documents: "Documents (ULA / Agreement)",
};

const FIELD_LABEL = {
  listPrice: "List price", costPrice: "Cost", name: "Name", pricingModel: "Model", unit: "Unit", rateSource: "Rate source",
  minQty: "Minimum quantity", maxDiscountPct: "Max discount %", minMonthFloor: "Floor per month", monthlyMinimum: "Minimum billing",
  billingClass: "Billed as", active: "Active", slabs: "Slabs", slabMode: "Slab type", slabPeriod: "Slab period", packQty: "Pack quantity",
  packPrice: "Pack price", pool: "Pool", escalationPct: "Yearly escalation %", amcPct: "AMC %", amcFixed: "AMC fixed", productId: "Product",
  rateSchedule: "Scheduled rates", segmentPrices: "Segment prices", currencyPrices: "Currency prices", module: "Module", description: "Description", notes: "Notes",
};
const show = (k, v) => {
  if (v === undefined || v === null || v === "") return "—";
  if (k === "slabs" && Array.isArray(v)) return v.map((s) => `${s.from}+ ₹${s.rate ?? "?"}`).join(", ");
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
  if (typeof v === "number" && /price|cost|floor|minimum|fixed/i.test(k)) return `₹${v.toLocaleString("en-IN")}`;
  return String(v);
};

/** Lines describing one history row: ["List price: ₹2,999 → ₹3,299", …]. */
export function priceChangeSummary(r) {
  if (!r) return [];
  if (r.section !== "price") {
    if (r.change === "added") return ["Set for the first time"];
    if (r.change === "removed") return ["Removed"];
    const b = r.before, a = r.after;
    if (b && a && typeof b === "object" && typeof a === "object" && !Array.isArray(b) && !Array.isArray(a)) {
      const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
      if (keys.length && keys.length <= 8) return keys.map((k) => `${k}: ${show(k, b[k])} → ${show(k, a[k])}`);
      return [`${keys.length} settings changed`];
    }
    return ["Changed"];
  }
  if (r.change === "added") return [`Added${r.after?.listPrice != null ? ` at ₹${Number(r.after.listPrice).toLocaleString("en-IN")}` : ""}`];
  if (r.change === "removed") return ["Removed"];
  const b = r.before || {}, a = r.after || {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !k.startsWith("_") && JSON.stringify(b[k]) !== JSON.stringify(a[k]));
  return keys.length ? keys.map((k) => `${FIELD_LABEL[k] || k}: ${show(k, b[k])} → ${show(k, a[k])}`) : ["No visible change"];
}

/**
 * May this user change prices and quotation rules? With no pricing owners
 * named, anyone who can edit Masters may (as before). With owners named:
 * only they, plus Admin and MD. The database enforces the same rule.
 */
export function canEditPricing(config, user) {
  const owners = Array.isArray(config?.pricingOwnerIds) ? config.pricingOwnerIds : [];
  if (!owners.length) return true;
  return !!user && (owners.includes(user.id) || ["admin", "md"].includes(user.role));
}
