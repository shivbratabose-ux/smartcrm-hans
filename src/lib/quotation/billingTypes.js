// Billing types of a product (21 Nov 2026): which ways a product is sold,
// chosen on its card in Products & Pricing. They structure the product's
// items and limit what the quote builder offers for it.
//   subscription — fixed recurring, at the frequencies the product allows
//   licence      — one-time licence + Annual Maintenance Charges (AMC)
//   usage        — pay per use, billed monthly on actual usage (with any minimum)
//   one_time     — one-time charges: registration, setup, implementation
// Until an admin sets them, a product's types are what its items already are.
// Pure; tested in scripts/test-billing-types.mjs.
import { billingClassOf } from "./commercial.js";
import { groupOf } from "./productGroups.js";
import { SALE_FREQUENCIES } from "./saleTerms.js";

export const BILLING_TYPES = [
  { id: "subscription", label: "Subscription", hint: "Fixed recurring, billed at the frequencies ticked", billingClass: "subscription" },
  { id: "licence", label: "One-time licence + AMC", hint: "Licence price once, then Annual Maintenance Charges billed monthly", billingClass: null },
  { id: "usage", label: "Pay per use", hint: "Billed monthly on actual usage at the agreed rate, with any minimum", billingClass: "transaction" },
  { id: "one_time", label: "One-time charges", hint: "Registration, setup, implementation, training", billingClass: "one_time" },
];
const ALL_FREQ = SALE_FREQUENCIES.map((f) => f.id);

/** The billing type an item belongs to (a licence price row counts as a licence). */
export function typeOfRow(row) {
  const cls = billingClassOf(row || {});
  if (cls === "transaction") return "usage";
  if (cls === "one_time") return row?.pricingModel === "One-time Licence" ? "licence" : "one_time";
  return "subscription";
}

/**
 * A product's billing types: { types: [...ids], frequencies: [...ids], set: bool }.
 * Saved on the product (product.billing); otherwise worked out from its items:
 * the types they are, every frequency, and a licence when a subscription item may be sold one-time.
 */
export function productBilling(product, rows = [], catalog = []) {
  const saved = product?.billing;
  if (saved && Array.isArray(saved.types)) {
    return { types: BILLING_TYPES.map((t) => t.id).filter((id) => saved.types.includes(id)), frequencies: ALL_FREQ.filter((f) => (saved.frequencies || ALL_FREQ).includes(f)), set: true };
  }
  const mine = (rows || []).filter((r) => r && r.active !== false && groupOf(r, catalog) === product?.id);
  const types = new Set(mine.map(typeOfRow));
  if (mine.some((r) => typeOfRow(r) === "subscription" && r.oneTimeAllowed !== false)) types.add("licence");
  return { types: BILLING_TYPES.map((t) => t.id).filter((id) => types.has(id)), frequencies: [...ALL_FREQ], set: false };
}

/** What to save on the product when an admin ticks or unticks. */
export function withType(current, id, on) {
  const types = new Set(current.types);
  if (on) types.add(id); else types.delete(id);
  return { types: BILLING_TYPES.map((t) => t.id).filter((x) => types.has(x)), frequencies: current.frequencies.length ? current.frequencies : [...ALL_FREQ] };
}
export function withFrequency(current, f, on) {
  const fr = new Set(current.frequencies);
  if (on) fr.add(f); else fr.delete(f);
  return { types: current.types, frequencies: ALL_FREQ.filter((x) => fr.has(x)) };
}

/** Warnings for the card: items of a type the product no longer allows, or a subscription with no frequency. */
export function billingWarnings(pb, items = []) {
  const out = [];
  for (const t of BILLING_TYPES) {
    const n = items.filter((it) => it.row && it.row.active !== false && typeOfRow(it.row) === t.id).length;
    if (n && !pb.types.includes(t.id)) out.push(`${n} active item${n === 1 ? " is" : "s are"} ${t.label.toLowerCase()}, which this product is not set to use: they are not offered on quotes.`);
  }
  if (pb.types.includes("subscription") && !pb.frequencies.length) out.push("Subscription is ticked but no billing frequency is.");
  return out;
}

/** The items under each billing type, in the card's order; unpriced modules under "Not priced yet". */
export function sectionsOf(items = [], pb) {
  const out = BILLING_TYPES.filter((t) => pb.types.includes(t.id) || items.some((it) => it.row && typeOfRow(it.row) === t.id))
    .map((t) => ({ ...t, allowed: pb.types.includes(t.id), items: items.filter((it) => it.row && typeOfRow(it.row) === t.id) }));
  const unpriced = items.filter((it) => !it.row);
  if (unpriced.length) out.push({ id: "unpriced", label: "Not priced yet", hint: "Modules with no price: price them to offer them", allowed: true, items: unpriced });
  return out;
}

// ── Quote builder ────────────────────────────────────────────────────
/** May this price row be offered on a quote, given its product's billing types? */
export function rowOffered(row, catalog = [], rows = []) {
  const product = (catalog || []).find((p) => p.id === groupOf(row, catalog));
  if (!product) return true;   // services and unlinked rows follow their own settings
  return productBilling(product, rows, catalog).types.includes(typeOfRow(row));
}
/** May this subscription row be sold as a one-time licence on a quote? */
export function licenceOffered(row, catalog = [], rows = []) {
  const product = (catalog || []).find((p) => p.id === groupOf(row, catalog));
  return !product || productBilling(product, rows, catalog).types.includes("licence");
}
/** Frequencies every product with a subscription line on the quote allows (intersection), in order. */
export function quoteFrequencies(lineRows = [], catalog = [], rows = []) {
  let allowed = new Set(ALL_FREQ);
  for (const r of lineRows) {
    if (!r || billingClassOf(r) !== "subscription") continue;
    const product = (catalog || []).find((p) => p.id === groupOf(r, catalog));
    if (!product) continue;
    const pf = new Set(productBilling(product, rows, catalog).frequencies);
    allowed = new Set([...allowed].filter((f) => pf.has(f)));
  }
  return ALL_FREQ.filter((f) => allowed.has(f));
}
