// Quote Assistant: what the chat may put into the pricing builder.
// Only real catalogue codes, an opportunity this user can see, and allowed
// values survive; everything else is dropped and reported. Pure (unit-tested
// in scripts/test-quote-assistant.mjs).
import { BILLING_FREQUENCIES, QUOTE_SEGMENTS } from "../../data/quotationMasters.js";

export const EMPTY_DRAFT = { oppId: "", segment: "Commercial", currency: "INR", hosting: "", billingFrequency: "Monthly", overallDiscountPct: 0, prepaymentApplicable: false, notes: "", lines: [] };
export const CLOSED = /^(won|lost|closed)/i;

/** Keep only what the CRM knows: real catalogue codes, a visible opportunity, allowed values. */
export function cleanDraft(d, { catalogue, opps, currencies }) {
  const byCode = new Map(catalogue.map((p) => [String(p.code).toUpperCase(), p]));
  const dropped = [];
  const lines = (Array.isArray(d?.lines) ? d.lines : []).map((l) => {
    const p = byCode.get(String(l?.productCode || "").toUpperCase());
    if (!p) { if (l?.productCode) dropped.push(l.productCode); return null; }
    const num = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
    return { productCode: p.code, qty: num(l.qty, 1, 100000, 1), months: num(l.months, 1, 120, 12), discountPct: num(l.discountPct, 0, 100, 0), why: String(l.why || "") };
  }).filter(Boolean);
  const oppOk = opps.some((o) => o.id === d?.oppId);
  return {
    draft: {
      oppId: oppOk ? d.oppId : "",
      segment: QUOTE_SEGMENTS.includes(d?.segment) ? d.segment : EMPTY_DRAFT.segment,
      currency: currencies.includes(d?.currency) ? d.currency : "INR",
      hosting: ["Hans", "Client"].includes(d?.hosting) ? d.hosting : "",
      billingFrequency: BILLING_FREQUENCIES.includes(d?.billingFrequency) ? d.billingFrequency : "Monthly",
      overallDiscountPct: Math.min(100, Math.max(0, Number(d?.overallDiscountPct) || 0)),
      prepaymentApplicable: !!d?.prepaymentApplicable,
      notes: String(d?.notes || "").slice(0, 2000),
      lines,
    },
    dropped,
    badOpp: !!d?.oppId && !oppOk,
  };
}

