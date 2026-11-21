// How software is sold (Quotation Rules → "How software is sold", 21 Nov 2026):
//   • as a subscription billed Monthly, Quarterly, Half-yearly or Yearly, each
//     with its own discount % (0 unless set);
//   • or as a one-time licence = the monthly base rate × N months (default 42,
//     i.e. 3.5 years) less a discount (default 20%), with AMC billed every year
//     at the AMC rules' % (default 20% of the licence).
// Every figure is a setting; an item may refuse a one-time sale or override
// the months, discount or AMC %. Pure; tested in scripts/test-sale-terms.mjs.
import { billingClassOf } from "./commercial.js";
import { LICENCE_MODEL } from "./amc.js";

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const has = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
const r2 = (v) => Math.round(n(v) * 100) / 100;

export const SALE_FREQUENCIES = [
  { id: "Monthly", label: "Monthly", months: 1 },
  { id: "Quarterly", label: "Quarterly", months: 3 },
  { id: "Half-Yearly", label: "Half-yearly", months: 6 },
  { id: "Annual", label: "Yearly", months: 12 },
];
export const DEFAULT_SALE_TERMS = {
  frequencies: SALE_FREQUENCIES.map((f) => ({ id: f.id, enabled: true, discountPct: 0 })),
  oneTime: { enabled: true, months: 42, discountPct: 20 },
};

/** The sale terms in force: saved settings over the defaults, numbers made safe. */
export function saleTerms(config = {}) {
  const saved = config?.saleTerms || {};
  const byId = new Map((Array.isArray(saved.frequencies) ? saved.frequencies : []).map((f) => [f.id, f]));
  const frequencies = SALE_FREQUENCIES.map((f) => {
    const s = byId.get(f.id) || {};
    return { ...f, enabled: s.enabled !== false, discountPct: Math.min(100, Math.max(0, n(s.discountPct))) };
  });
  const o = saved.oneTime || {};
  return {
    frequencies,
    oneTime: {
      enabled: o.enabled !== false,
      months: has(o.months) && n(o.months) > 0 ? n(o.months) : DEFAULT_SALE_TERMS.oneTime.months,
      discountPct: has(o.discountPct) ? Math.min(100, Math.max(0, n(o.discountPct))) : DEFAULT_SALE_TERMS.oneTime.discountPct,
    },
  };
}

/** Problems with settings an admin is editing. */
export function saleTermsProblems(raw = {}) {
  const out = [];
  (raw.frequencies || []).forEach((f) => { if (has(f.discountPct) && (n(f.discountPct) < 0 || n(f.discountPct) > 100)) out.push(`${f.id}: discount must be 0 to 100%.`); });
  if (!(raw.frequencies || []).some((f) => f.enabled !== false)) out.push("Allow at least one billing frequency.");
  const o = raw.oneTime || {};
  if (has(o.months) && !(Number.isInteger(n(o.months)) && n(o.months) >= 1 && n(o.months) <= 240)) out.push("One-time: months must be a whole number from 1 to 240.");
  if (has(o.discountPct) && (n(o.discountPct) < 0 || n(o.discountPct) > 100)) out.push("One-time: discount must be 0 to 100%.");
  return out;
}

export const frequencyOf = (terms, id) => terms.frequencies.find((f) => f.id === id) || null;

/** Can this price row be sold as a one-time licence? Subscriptions only, unless the item says no. */
export const oneTimeAllowed = (row) => !!row && billingClassOf(row) === "subscription" && row.oneTimeAllowed !== false;

/** The one-time terms for a row: its own months / discount if set, else the company's. */
export function oneTimeTermsFor(row, terms) {
  return {
    months: has(row?.otMonths) && n(row.otMonths) > 0 ? n(row.otMonths) : terms.oneTime.months,
    discountPct: has(row?.otDiscountPct) ? Math.min(100, Math.max(0, n(row.otDiscountPct))) : terms.oneTime.discountPct,
  };
}

/** One-time unit price from a monthly unit rate: rate × months × (1 − discount). To the paisa. */
export const oneTimeUnitPrice = (monthlyRate, { months, discountPct }) => r2(n(monthlyRate) * n(months) * (1 - n(discountPct) / 100));

/**
 * A subscription line re-priced as a one-time licence (for the pricing engine
 * and AMC). The monthly rate it came from is kept in soldAs, so the quote
 * document and a later edit can show and reverse it.
 */
export function asOneTimeLine(line, row, terms) {
  if (!oneTimeAllowed(row)) return line;
  const t = oneTimeTermsFor(row, terms);
  return {
    ...line,
    pricingModel: LICENCE_MODEL, billingClass: "one_time", isOneTimeSale: true,
    unitPriceResolved: oneTimeUnitPrice(line.unitPriceResolved, t), months: 1, effectiveMonths: 1,
    soldAs: { mode: "one_time", months: t.months, discountPct: t.discountPct, monthlyRate: r2(line.unitPriceResolved) },
  };
}

/** A sentence for the quote and the builder: "42 months of the monthly rate, less 20%, plus AMC 20% a year". */
export function oneTimeText({ months, discountPct }, amcPct) {
  const yrs = months % 12 === 0 ? `${months / 12} years` : months % 6 === 0 ? `${months / 12} years` : `${months} months`;
  return `One-time licence: ${yrs} (${months} months) of the monthly rate${discountPct ? `, less ${discountPct}%` : ""}${has(amcPct) ? `; AMC ${amcPct}% of the licence a year` : ""}`;
}

/**
 * The AMC as agreement lines, one per contract year of the schedule, so the
 * Billing Engine invoices it yearly in advance. start: the agreement start.
 */
export function amcAgreementLines(amc, start) {
  if (!amc?.applies || !Array.isArray(amc.schedule) || !start) return [];
  const addMonths = (iso, k) => { const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + k); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10); };
  const dayBefore = (iso) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
  return amc.schedule.map((y) => {
    const from = addMonths(start, (n(y.contractYear) - 1) * 12);
    return {
      code: `AMC-Y${y.contractYear}`, name: `Annual maintenance (AMC), contract year ${y.contractYear}`, billingClass: "subscription", pricingModel: "AMC",
      unit: "Year", qty: 1, months: 12, listRate: r2(n(y.amount) / 12), discountPct: 0, netRate: r2(n(y.amount) / 12), monthlyMinimum: 0, escalationPct: 0,
      pricing: null, effectiveFrom: from, effectiveTo: dayBefore(addMonths(start, n(y.contractYear) * 12)), isAmc: true, amcYear: y.amcYear,
      amcAmount: r2(y.amount), // billed once a year, exactly

    };
  });
}
