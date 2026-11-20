// Commercial classification and approval levels (specification of 20 Nov 2026,
// Phase A — docs/commercial-engine-assessment.md).
//
// Every price component (price row / quote line) has a BILLING CLASS:
//   subscription  fixed recurring charge (committed)
//   transaction   variable, billed on ACTUAL consumption: the quote agrees a
//                 rate (and any contractual minimum), never volume × rate
//   one_time      one-time / project charge
// The class is derived from the pricing model and can be overridden on the
// price row (billingClass) between subscription and transaction.
// A product or a quote that mixes classes is HYBRID.
// Pure — tested in scripts/test-commercial.mjs.

export const ONE_TIME_PRICING_MODELS = ["One-time Licence", "Implementation"];
export const USAGE_PRICING_MODELS = ["Per-transaction", "PaaS Per-Flight", "PaaS Per-Transaction"];

export const BILLING_CLASSES = [
  { key: "subscription", label: "Fixed recurring", long: "Fixed recurring charges" },
  { key: "transaction", label: "Variable (on actual use)", long: "Variable charges, billed on actual consumption" },
  { key: "one_time", label: "One-time", long: "One-time charges" },
];
export const billingClassLabel = (key) => BILLING_CLASSES.find((c) => c.key === key)?.label || key;

/** Billing class of a price row or quote line. */
export function billingClassOf(x) {
  const model = String(x?.pricingModel || "");
  if (ONE_TIME_PRICING_MODELS.includes(model)) return "one_time";
  if (x?.billingClass === "subscription" || x?.billingClass === "transaction") return x.billingClass;
  return USAGE_PRICING_MODELS.includes(model) ? "transaction" : "subscription";
}

/** Commercial model of a set of classes: SaaS, Transaction-Based, One-Time or Hybrid. */
export function commercialModelOf(classes) {
  const set = new Set((classes || []).filter(Boolean));
  if (!set.size) return { key: "", label: "Not classified" };
  if (set.size > 1) return { key: "hybrid", label: "Hybrid" };
  const only = [...set][0];
  return only === "subscription" ? { key: "saas", label: "SaaS / Subscription" }
    : only === "transaction" ? { key: "transaction", label: "Transaction-Based" }
    : { key: "one_time", label: "One-Time / Project" };
}

/** Commercial model of a product, from its active price rows. */
export const productCommercialModel = (rows) => commercialModelOf((rows || []).filter((r) => r && r.active !== false).map(billingClassOf));

/** What stops a price row from being quoted as final (besides a missing rate, which the engine flags). */
export function rowConfigIssues(row) {
  const out = [];
  if (!row) return ["Not in the price list"];
  if (!String(row.pricingModel || "").trim()) out.push("no pricing model");
  if (!String(row.unit || "").trim()) out.push("no unit of measurement");
  return out;
}

// ── Approval levels ──────────────────────────────────────────────────
// Config: maxUserDiscountPct = what a rep may give alone; then
// approvalLevels = [{ key, label, maxDiscountPct, userIds[] }] ascending.
export const DEFAULT_APPROVAL_LEVELS = [
  { key: "sales_head", label: "Sales Head", maxDiscountPct: 20, userIds: [] },
  { key: "management", label: "Management", maxDiscountPct: 100, userIds: [] },
];
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function approvalLevels(config) {
  const saved = Array.isArray(config?.approvalLevels) && config.approvalLevels.length ? config.approvalLevels : DEFAULT_APPROVAL_LEVELS;
  return saved.map((l, i) => ({ key: String(l.key || `level${i + 1}`), label: String(l.label || `Level ${i + 1}`), maxDiscountPct: n(l.maxDiscountPct), userIds: Array.isArray(l.userIds) ? l.userIds : [] }))
    .sort((a, b) => a.maxDiscountPct - b.maxDiscountPct);
}

/** Largest effective discount on a quote: line discount and overall discount combined, once. */
export function maxEffectiveDiscount(lines = [], overallDiscountPct = 0) {
  const o = Math.min(100, Math.max(0, n(overallDiscountPct)));
  const worst = (lines || []).reduce((m, l) => Math.max(m, Math.min(100, Math.max(0, n(l.discountPct)))), 0);
  return Math.round((1 - (1 - worst / 100) * (1 - o / 100)) * 10000) / 100;
}

/**
 * Which level must approve. `needsApproval` is the engine's verdict (discount
 * cap, margin, AMC, missing configuration). Margin breaches and "management
 * only" products go to the top level; otherwise the level whose discount
 * ceiling covers the quote's largest effective discount.
 * Returns null when no approval is needed, else { index, key, label, maxDiscountPct, discountPct }.
 */
export function requiredApprovalLevel({ needsApproval, lines, overallDiscountPct, topLevel = false }, config) {
  if (!needsApproval) return null;
  const levels = approvalLevels(config);
  const d = maxEffectiveDiscount(lines, overallDiscountPct);
  let index = levels.findIndex((l) => d <= l.maxDiscountPct);
  if (index < 0 || topLevel) index = levels.length - 1;
  return { index, key: levels[index].key, label: levels[index].label, maxDiscountPct: levels[index].maxDiscountPct, discountPct: d };
}

/**
 * User ids who may approve at a level. Picked users win; otherwise the top
 * level falls to the top roles and lower levels to the general approver list.
 * Anyone on a higher level may approve a lower one.
 */
export function levelApproverIds(index, config, { liveUserIds = [], generalApproverIds = [], topRoleUserIds = [] } = {}) {
  const levels = approvalLevels(config);
  const live = new Set(liveUserIds);
  const own = (i) => {
    const picked = levels[i].userIds.filter((id) => live.has(id));
    if (picked.length) return picked;
    return i === levels.length - 1 ? topRoleUserIds : generalApproverIds;
  };
  const out = new Set();
  for (let i = Math.max(0, index); i < levels.length; i++) own(i).forEach((id) => out.add(id));
  return [...out];
}
