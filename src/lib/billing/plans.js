// Billing plans (Billing module, Phase 2): the customer's agreement as a
// versioned plan. Version 1 is the accepted quote's agreement. A change after
// activation is a new version with an effective date and an approver; older
// versions stay read-only. Billing reads all versions merged into one timeline
// (mergedAgreement), so the Billing Engine and reports need no other change.
// Pure; tested in scripts/test-billing-plans.mjs.
import { approvalLevels, requiredApprovalLevel, billingClassOf } from "../quotation/commercial.js";
import { groupOf } from "../quotation/productGroups.js";
import { active, byId, entityStatus, requiredFeesFor } from "./masters.js";
import { BILLING_FREQUENCIES } from "../../data/billingMasters.js";

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const iso = (d) => String(d || "").slice(0, 10);
const DECIMAL = /^\d+(\.\d{1,4})?$/;
const clone = (x) => JSON.parse(JSON.stringify(x));
export const toPaise = (v) => Math.round(n(v) * 100);
const dayBefore = (d) => { const x = new Date(`${iso(d)}T00:00:00Z`); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };

export const PLAN_STATUS = {
  draft: "Draft", pending_approval: "Waiting for approval", active: "Active", superseded: "Superseded", retired: "Retired", rejected: "Sent back",
};
export const DISCOUNT_TYPES = [
  { id: "volume", name: "Volume" }, { id: "multi_site", name: "Multi-site" }, { id: "multi_product", name: "Multi-product / bundle" },
  { id: "multi_year", name: "Multi-year" }, { id: "early_payment", name: "Early payment" },
];
export const ESCALATION_TYPES = [
  { id: "none", name: "None" }, { id: "fixed", name: "Fixed % a year" }, { id: "index", name: "Index-linked" }, { id: "step", name: "Step-up" },
];

// ── Version 1 from the accepted quote ────────────────────────────────
/** The products on an agreement, with each one's profile defaults. */
export function productsOfLines(lines = [], { priceRows = [], catalog = [], profiles = [] } = {}) {
  const out = [];
  for (const l of lines) {
    const row = priceRows.find((r) => r.code === l.code) || { name: l.name };
    const productId = groupOf(row, catalog) || "";
    // Services lines stay plain lines: several service profiles exist, none can be assumed.
    if (!productId || productId === "_services" || out.some((p) => p.productId === productId)) continue;
    const profile = active(profiles).find((p) => p.productId === productId) || null;
    out.push({ productId, profileId: profile?.id || "", modelId: profile?.defaultModelId || "", unitIds: profile ? [...profile.primaryUnitIds] : [], modules: [], sites: [] });
  }
  return out;
}

/** The stored row for version 1 of an accepted quote's agreement. */
export function planFromAgreement(quote, ctx = {}) {
  const a = quote.agreement;
  const products = productsOfLines(a.lines, ctx);
  const profile = active(ctx.profiles || []).find((p) => p.id === products[0]?.profileId);
  return {
    id: `bp_${quote.id}_v1`, planNo: a.agreementNo, version: 1, status: "active",
    accountId: quote.accountId || a.accountId || "", contractId: quote.contractId || "", quoteId: quote.id, supersedesId: "",
    legalEntity: profile?.legalEntityId || "hans", currency: a.currency || "INR",
    effectiveFrom: iso(a.startDate), effectiveTo: "",
    terms: {
      ...clone(a), products,
      fees: [], discounts: [], revenueShare: null, sla: [], lateInterestPct: "", termination: "",
      term: { lockInMonths: "", renewal: { type: "manual", noticeDays: "" }, escalation: { type: "none", pct: "", index: "", steps: [] } },
      billingTerms: { frequency: a.billingFrequency || profile?.frequency || "Monthly", timing: "advance", creditDays: profile?.creditDays ?? "", taxIds: profile?.taxIds || ["gst"] },
    },
    reason: "Accepted quotation", createdBy: quote.owner || "", createdAt: quote.acceptedAt || a.createdAt || "",
    approvedBy: quote.approvedBy || quote.owner || "", approvedAt: quote.acceptedAt || quote.acceptedDate || "",
  };
}

// ── Versions ─────────────────────────────────────────────────────────
export const versionsOf = (plans = [], planNo) => (plans || []).filter((p) => p.planNo === planNo).sort((a, b) => a.version - b.version);
export const activeVersion = (plans, planNo) => versionsOf(plans, planNo).filter((p) => p.status === "active").pop() || null;
/** The version being worked on (draft, waiting for approval or sent back), if any. */
export const openVersion = (plans, planNo) => versionsOf(plans, planNo).filter((p) => ["draft", "pending_approval", "rejected"].includes(p.status)).pop() || null;
/** The first of the month after a date: when an amendment can take effect at the earliest. */
export const nextMonthStart = (d) => { const x = new Date(`${iso(d)}T00:00:00Z`); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1)).toISOString().slice(0, 10); };

/** A new draft version copied from the active one. */
export function newVersion(base, all, { by = "", at = "", effectiveFrom = "" } = {}) {
  const version = Math.max(0, ...versionsOf(all, base.planNo).map((p) => p.version)) + 1;
  return {
    ...clone(base), id: `bp_${String(base.quoteId || base.planNo).replace(/[^A-Za-z0-9]/g, "")}_v${version}`, version, status: "draft", supersedesId: base.id,
    // Default: the 1st of the month after both today and the start of the version it replaces.
    effectiveFrom: effectiveFrom || [nextMonthStart(at || new Date().toISOString()), nextMonthStart(base.effectiveFrom)].sort().pop(), effectiveTo: "", reason: "",
    createdBy: by, createdAt: at, submittedBy: "", submittedAt: "", approvedBy: "", approvedAt: "",
  };
}

/** Rows to write when a version is approved: the previous active one ends the day before. */
export function activation(plans, id, { by = "", at = "" } = {}) {
  const p = (plans || []).find((x) => x.id === id);
  if (!p || p.status !== "pending_approval") return [];
  const prev = activeVersion(plans, p.planNo);
  return [
    ...(prev ? [{ ...prev, status: "superseded", effectiveTo: dayBefore(p.effectiveFrom) }] : []),
    { ...p, status: "active", approvedBy: by, approvedAt: at },
  ];
}

// ── Discounts and approval ───────────────────────────────────────────
/** The plan's largest effective discount: the deepest line discount combined with every plan-level discount. */
export function planDiscountPct(plan) {
  const t = plan?.terms || {};
  const worst = (t.lines || []).reduce((m, l) => Math.max(m, Math.min(100, Math.max(0, n(l.discountPct)))), 0);
  const keep = (t.discounts || []).reduce((k, d) => k * (1 - Math.min(100, Math.max(0, n(d.pct))) / 100), 1 - worst / 100);
  return Math.round((1 - keep) * 10000) / 100;
}

/**
 * Who approves a version (decision 20 Nov 2026): within the rep's discount
 * authority the account owner; above it the quote approval levels (Line
 * Manager, then Management Committee).
 */
export function approvalRoute(plan, { config = {}, accountOwnerId = "" } = {}) {
  const d = planDiscountPct(plan);
  const repLimit = n(config.maxUserDiscountPct ?? 10);
  if (d <= repLimit) return { route: "owner", label: "Account owner", discountPct: d, userIds: accountOwnerId ? [accountOwnerId] : [] };
  const level = requiredApprovalLevel({ needsApproval: true, lines: [{ discountPct: d }], overallDiscountPct: 0 }, config);
  return { route: "level", label: level.label, index: level.index, discountPct: d, levels: approvalLevels(config).length };
}

// ── Checks ───────────────────────────────────────────────────────────
/**
 * What stops a version from going for approval. ctx: { m (billing masters),
 * catalog, checks (entity verifications), company, plans }.
 */
export function planProblems(plan, ctx = {}) {
  const out = [];
  const m = ctx.m || {};
  const t = plan?.terms || {};
  const prev = plan?.supersedesId ? (ctx.plans || []).find((p) => p.id === plan.supersedesId) : null;
  // Dates: an amendment takes effect on the 1st of a month, after the version it replaces started.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso(plan?.effectiveFrom))) out.push("Effective date is required.");
  else if (plan.version > 1 && !iso(plan.effectiveFrom).endsWith("-01")) out.push("A new version takes effect on the 1st of a month.");
  else if (prev && iso(plan.effectiveFrom) <= iso(prev.effectiveFrom)) out.push(`The effective date must be after ${iso(prev.effectiveFrom)}, when version ${prev.version} started.`);
  // Entity and currency.
  const ent = byId(m.legalEntities, plan?.legalEntity);
  if (!ent || ent.retired) out.push("Pick the legal entity this plan bills under.");
  else if (!entityStatus(ent, ctx.checks || [], ctx.company || {}).verified) out.push(`${ent.name} is not verified by Finance yet.`);
  if (m.currencies && !m.currencies.includes(plan?.currency)) out.push("Pick a currency from the currencies master.");
  // Billing terms.
  const b = t.billingTerms || {};
  if (!BILLING_FREQUENCIES.includes(b.frequency)) out.push("Pick a billing frequency.");
  if (!["advance", "arrears"].includes(b.timing)) out.push("Pick advance or arrears billing.");
  if (b.creditDays !== "" && b.creditDays != null && !(Number.isInteger(Number(b.creditDays)) && Number(b.creditDays) >= 0)) out.push("Credit days must be a whole number.");
  const term = t.term || {};
  if (term.lockInMonths !== "" && term.lockInMonths != null && !(Number.isInteger(Number(term.lockInMonths)) && Number(term.lockInMonths) >= 0)) out.push("Lock-in must be a whole number of months.");
  const esc = term.escalation || { type: "none" };
  if (esc.type === "fixed" && !(DECIMAL.test(String(esc.pct)) && n(esc.pct) > 0 && n(esc.pct) <= 100)) out.push("Escalation: enter the yearly %.");
  if (esc.type === "index" && !String(esc.index || "").trim()) out.push("Escalation: name the index (e.g. CPI).");
  if (esc.type === "step" && !(esc.steps || []).length) out.push("Escalation: add at least one step.");
  (esc.steps || []).forEach((s, i) => { if (!(n(s.fromMonth) >= 1 && DECIMAL.test(String(s.pct)))) out.push(`Escalation step ${i + 1}: month and % are required.`); });
  if (t.lateInterestPct !== "" && t.lateInterestPct != null && !(DECIMAL.test(String(t.lateInterestPct)) && n(t.lateInterestPct) <= 100)) out.push("Late-payment interest: a % up to 100.");
  // Lines.
  (t.lines || []).forEach((l) => {
    if (n(l.netRate) < 0 || n(l.listRate) < 0) out.push(`${l.name}: a rate cannot be negative.`);
    if (n(l.discountPct) < 0 || n(l.discountPct) > 100) out.push(`${l.name}: discount must be 0 to 100%.`);
    if (n(l.qty) < 0) out.push(`${l.name}: quantity cannot be negative.`);
  });
  // Plan discounts.
  (t.discounts || []).forEach((d, i) => {
    if (!DISCOUNT_TYPES.some((x) => x.id === d.type)) out.push(`Discount ${i + 1}: pick its type.`);
    if (!(DECIMAL.test(String(d.pct)) && n(d.pct) > 0 && n(d.pct) <= 100)) out.push(`Discount ${i + 1}: a % from above 0 to 100.`);
  });
  // Fees.
  const fees = active(m.feeTypes || []);
  (t.fees || []).forEach((f, i) => {
    if (!fees.some((x) => x.id === f.feeTypeId)) out.push(`Fee ${i + 1}: pick a fee type.`);
    if (!(DECIMAL.test(String(f.amount)) && n(f.amount) > 0)) out.push(`Fee ${i + 1}: enter the amount.`);
  });
  // Products: only what the product's profile allows; required fee lines present.
  (t.products || []).forEach((p) => {
    const prof = byId(m.profiles, p.profileId);
    if (!prof) return;
    if (p.modelId && !prof.allowedModelIds.includes(p.modelId)) out.push(`${prof.name}: the model is not allowed by its billing profile.`);
    (p.unitIds || []).filter((u) => !prof.allowedUnitIds.includes(u)).forEach((u) => out.push(`${prof.name}: unit "${u}" is not allowed by its billing profile.`));
    if (prof.modules?.length) (p.modules || []).filter((x) => !prof.modules.includes(x)).forEach((x) => out.push(`${prof.name}: module "${x}" is not in its billing profile.`));
    for (const feeId of requiredFeesFor(prof, p.modelId)) {
      const viaFee = (t.fees || []).some((f) => f.feeTypeId === feeId && f.productId === p.productId);
      const viaLine = (t.lines || []).some((l) => l.billingClass === "one_time" && (l.productId === p.productId || productOfLine(l, ctx) === p.productId));
      if (!viaFee && !viaLine) out.push(`${prof.name}: ${byId(m.feeTypes, feeId)?.name || feeId} fee is required with this model.`);
    }
  });
  // Revenue share.
  if ((t.products || []).some((p) => p.modelId === "revenue_share")) {
    const rs = t.revenueShare || {};
    if (!(DECIMAL.test(String(rs.sharePct ?? "")) && n(rs.sharePct) > 0 && n(rs.sharePct) <= 100)) out.push("Revenue share: enter the share %.");
    if (rs.floorAmount !== "" && rs.floorAmount != null && !DECIMAL.test(String(rs.floorAmount))) out.push("Revenue share: the floor is an amount.");
    if (!rs.collector) out.push("Revenue share: who collects?");
    if (!rs.settlementCycle) out.push("Revenue share: pick the settlement cycle.");
  }
  return [...new Set(out)];
}
const productOfLine = (l, ctx) => groupOf((ctx.priceRows || []).find((r) => r.code === l.code) || { name: l.name }, ctx.catalog || []);

// ── Live monthly estimate (paise inside, rupees out) ─────────────────
export function monthlyEstimate(plan) {
  const t = plan?.terms || {};
  const lines = t.lines || [];
  const planKeep = (t.discounts || []).reduce((k, d) => k * (1 - Math.min(100, n(d.pct)) / 100), 1);
  let fixed = 0, minimums = 0, usage = 0, oneTime = 0, fees = 0, oneTimeFees = 0;
  for (const l of lines) {
    const cls = l.billingClass || billingClassOf(l);
    if (cls === "subscription") fixed += toPaise(n(l.netRate) * n(l.qty));
    else if (cls === "transaction") { minimums += toPaise(n(l.monthlyMinimum)); usage += toPaise(n(l.netRate) * n(l.qty)); }
    else oneTime += toPaise(n(l.netRate) * Math.max(1, n(l.qty)));
  }
  for (const f of t.fees || []) {
    if (f.kind === "recurring") fees += f.per === "year" ? Math.round(toPaise(f.amount) / 12) : toPaise(f.amount);
    else oneTimeFees += toPaise(f.amount);
  }
  const committed = Math.round((fixed + minimums + fees) * planKeep);
  const rs = (t.products || []).some((p) => p.modelId === "revenue_share") ? t.revenueShare || null : null;
  return {
    fixed: fixed / 100, minimums: minimums / 100, recurringFees: fees / 100, planDiscount: Math.round((1 - planKeep) * 10000) / 100,
    committedMonthly: committed / 100, expectedUsage: Math.round(usage * planKeep) / 100,
    oneTime: (oneTime + oneTimeFees) / 100, revenueShareFloor: rs && rs.floorAmount ? n(rs.floorAmount) : 0,
  };
}

// ── What changed between two versions (for the approver) ─────────────
export function versionChanges(prev, next) {
  if (!prev) return [];
  const out = [];
  const a = prev.terms || {}, b = next.terms || {};
  const byCode = (ls) => Object.fromEntries((ls || []).map((l) => [l.code, l]));
  const A = byCode(a.lines), B = byCode(b.lines);
  for (const code of new Set([...Object.keys(A), ...Object.keys(B)])) {
    const x = A[code], y = B[code];
    if (!x) out.push(`Added ${y.name}`);
    else if (!y) out.push(`Removed ${x.name}`);
    else {
      if (n(x.netRate) !== n(y.netRate)) out.push(`${y.name}: rate ${n(x.netRate)} → ${n(y.netRate)}`);
      if (n(x.qty) !== n(y.qty) && y.billingClass === "subscription") out.push(`${y.name}: quantity ${n(x.qty)} → ${n(y.qty)}`);
      if (n(x.monthlyMinimum) !== n(y.monthlyMinimum)) out.push(`${y.name}: minimum ${n(x.monthlyMinimum)} → ${n(y.monthlyMinimum)}`);
    }
  }
  const j = (v) => JSON.stringify(v ?? null);
  if (j(a.fees) !== j(b.fees)) out.push("Fees changed");
  if (j(a.discounts) !== j(b.discounts)) out.push("Plan discounts changed");
  if (j(a.term) !== j(b.term)) out.push("Term, renewal or escalation changed");
  if (j(a.billingTerms) !== j(b.billingTerms) || prev.currency !== next.currency || prev.legalEntity !== next.legalEntity) out.push("Billing terms changed");
  if (j(a.revenueShare) !== j(b.revenueShare)) out.push("Revenue share changed");
  if (j(a.sla) !== j(b.sla) || j(a.lateInterestPct) !== j(b.lateInterestPct) || j(a.termination) !== j(b.termination)) out.push("SLA, interest or termination terms changed");
  return out;
}

// ── What billing reads ───────────────────────────────────────────────
/**
 * One agreement covering every approved version: each version's recurring and
 * usage lines bill from its effective date until the next version starts; the
 * one-time lines and milestones stay those of version 1 (one-time fees added
 * by an amendment are invoiced separately, Phase 4).
 */
export function mergedAgreement(versions = []) {
  const live = versions.filter((v) => ["active", "superseded"].includes(v.status)).sort((a, b) => a.version - b.version);
  if (!live.length) return null;
  const first = live[0], last = live[live.length - 1];
  const start = iso(first.terms.startDate || first.effectiveFrom);
  const lines = [];
  live.forEach((v, i) => {
    const from = i === 0 ? null : iso(v.effectiveFrom);
    const until = i < live.length - 1 ? dayBefore(live[i + 1].effectiveFrom) : null;
    const esc = v.terms?.term?.escalation;
    for (const l of v.terms.lines || []) {
      if (l.billingClass === "one_time") { if (i === 0) lines.push(l); continue; }
      const ef = from && (!l.effectiveFrom || from > l.effectiveFrom) ? from : l.effectiveFrom;
      const et = until && (!l.effectiveTo || until < l.effectiveTo) ? until : l.effectiveTo;
      if (et && ef && et < ef) continue;   // this version's line never runs
      lines.push({ ...l, effectiveFrom: ef, effectiveTo: et || "", escalationFrom: start,
        ...(esc?.type === "fixed" ? { escalationPct: n(esc.pct) } : {}), planVersion: v.version });
    }
  });
  return { ...clone(first.terms), ...pickHeader(last), lines, milestones: first.terms.milestones || [], planVersion: last.version };
}
const pickHeader = (v) => ({
  currency: v.currency, billingFrequency: v.terms.billingTerms?.frequency || v.terms.billingFrequency,
  ...(v.terms.billing ? { billing: v.terms.billing } : {}),
  endDate: v.terms.endDate,
});

/**
 * Quotes as billing should see them: where a plan has an approved amendment,
 * the quote's agreement is replaced by the merged timeline. Quotes without
 * stored plan versions are returned unchanged.
 */
export function withPlans(quotes = [], plans = []) {
  if (!(plans || []).length) return quotes;
  return (quotes || []).map((q) => {
    if (!q?.agreement) return q;
    const vs = versionsOf(plans, q.agreement.agreementNo);
    if (!vs.some((v) => v.version > 1 && ["active", "superseded"].includes(v.status))) return q;
    const merged = mergedAgreement(vs);
    return merged ? { ...q, agreement: { ...q.agreement, ...merged, agreementNo: q.agreement.agreementNo, sourceHash: q.agreement.sourceHash } } : q;
  });
}

/** May this user see this plan (sales: only their own accounts' plans)? Mirrors the database rule. */
export function canSeePlan(plan, { userId, account, quote, billingDesk = false, downline = [] } = {}) {
  if (billingDesk) return true;
  const owner = account?.owner || "";
  return plan.createdBy === userId || quote?.owner === userId || owner === userId || (owner && downline.includes(owner));
}
