// Customer commercial agreements (specification of 20 Nov 2026, Phase B).
//
// When a customer accepts a quotation, its commercial terms become that
// customer's AGREEMENT: every component with its billing class, unit, agreed
// rate (or slabs), minimum, discount and dates, frozen. It is stored on the
// accepted quote's own record (quotations.agreement), so it inherits the
// quote's sync, permissions and history.
//
//   • The Pricing Master can change afterwards: the agreement does not.
//   • A later accepted revision of the same quote supersedes it (amendment).
//   • A new quote for the same customer starts from the agreed rates.
//   • The Billing Engine (Phase C) will price actual usage from these lines.
// Pure — tested in scripts/test-agreements.mjs.
import { usagePrice, hasUsageRules, differentialShare, differentialCharge } from "./slabs.js";
import { billingClassOf, commercialModelOf } from "./commercial.js";
import { amcAgreementLines } from "./saleTerms.js";

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round(n(v) * 100) / 100;
const iso = (d) => String(d || "").slice(0, 10);

/** The usage-pricing settings of a price row, kept with the agreement so later master changes cannot reach it. */
export function pricingSnapshot(row) {
  if (!row || !hasUsageRules(row)) return null;
  const s = { rateSource: row.rateSource || "Flat", listPrice: row.listPrice ?? null, unit: row.unit || "" };
  if (row.rateSource === "Slab") { s.slabs = (row.slabs || []).map((x) => ({ from: n(x.from), rate: x.rate == null ? null : n(x.rate) })); s.slabMode = row.slabMode || "volume"; s.slabPeriod = row.slabPeriod || "month"; }
  for (const k of ["packQty", "packPrice", "monthlyMinimum", "escalationPct"]) if (n(row[k]) > 0) s[k] = n(row[k]);
  if (String(row.pool || "").trim()) s.pool = String(row.pool).trim();
  // Hybrid fixed core + variable (WiseCCS Model 2): the fixed fee is the anchor, not a floor.
  if (row.minimumMode === "differential") { s.minimumMode = "differential"; s.differentialSharePct = differentialShare(row); }
  // Billed to the trade with a revenue share to the customer (WiseCCS Model 1, TRS).
  if (row.billTo === "trade") {
    s.billTo = "trade";
    if (row.revenueShare && Array.isArray(row.revenueShare.slabs)) {
      const rs = row.revenueShare;
      s.revenueShare = { group: String(rs.group || "").trim(), mode: rs.mode === "volume" ? "volume" : "graduated",
        slabs: rs.slabs.map((x) => ({ from: n(x.from), hansPct: n(x.hansPct) })), paymentDays: n(rs.paymentDays) || 15 };
    }
  }
  return s;
}

/** Last day of a term that starts on `start` and runs `months` months. */
export function termEnd(start, months) {
  const d = new Date(`${iso(start)}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || !(n(months) > 0)) return "";
  // Same day N months on, clamped to the month's length (31 Jan + 1 month = 28 Feb), less one day.
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + Math.round(n(months)));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Fingerprint of a quote's commercial terms: a change means the agreement must be rebuilt. */
export function agreementHash(quote) {
  const h = quote?.hans || {};
  const lines = (quote?.items || []).map((l) => [l.productCode, n(l.qty), n(l.months), r2(l.unitPriceResolved), n(l.discountPct), l.billingClass || "", r2(l.monthlyMinimum)].join(":"));
  return [quote?.quoteNo || "", n(quote?.version) || 1, n(h.overallDiscountPct), ...lines].join("|");
}

/** Does this quote need its agreement created or refreshed? Only pricing-engine quotes the customer accepted. */
export function needsAgreement(quote) {
  if (!quote || quote.isDeleted || quote.status !== "Accepted" || !quote.hans || !(quote.items || []).length) return false;
  return !quote.agreement || quote.agreement.sourceHash !== agreementHash(quote);
}

/**
 * The agreement for an accepted quote.
 * opts: { priceRows, today, acceptedOn } — acceptedOn defaults to the quote's
 * accepted date, else today. An existing agreement keeps its start date.
 */
export function buildAgreement(quote, opts = {}) {
  const h = quote.hans || {};
  const rowOf = (code) => (opts.priceRows || []).find((r) => r.code === code) || null;
  const overall = Math.min(100, Math.max(0, n(h.overallDiscountPct)));
  const start = iso(quote.agreement?.startDate || opts.acceptedOn || quote.acceptedAt || quote.acceptedDate || opts.today);
  const lines = (quote.items || []).filter((l) => l && (l.productCode || l.name)).map((l, i) => {
    const row = rowOf(l.productCode);
    const billingClass = billingClassOf({ pricingModel: l.pricingModel, billingClass: l.billingClass || row?.billingClass });
    const disc = Math.min(100, Math.max(0, n(l.discountPct)));
    const effective = r2((1 - (1 - disc / 100) * (1 - overall / 100)) * 100);
    // A variable line can be open-ended (months 0): billed monthly until cancelled.
    const months = billingClass === "one_time" ? 0 : billingClass === "transaction" ? Math.max(0, n(l.months)) : Math.max(1, n(l.months) || 1);
    return {
      lineNo: i + 1, code: l.productCode || "", name: l.name || row?.name || l.productCode || "",
      billingClass, pricingModel: l.pricingModel || "", unit: l.unit || row?.unit || "",
      // Committed quantity for a subscription; expected (internal) volume for a variable line.
      qty: n(l.qty), months,
      listRate: r2(l.unitPriceResolved), discountPct: effective,
      netRate: r2(n(l.unitPriceResolved) * (1 - effective / 100)),
      monthlyMinimum: r2(l.monthlyMinimum), escalationPct: n(l.escalationPct),
      pricing: l.pricing || pricingSnapshot(row),
      effectiveFrom: start, effectiveTo: months ? termEnd(start, months) : "",
      ...(l.soldAs ? { soldAs: l.soldAs } : {}),
    };
  });
  // A one-time licence's AMC is billed every year: one line per contract year of the AMC schedule.
  amcAgreementLines(h.amc, start).forEach((l) => lines.push({ ...l, lineNo: lines.length + 1 }));
  const recurringMonths = lines.filter((l) => !l.isAmc).reduce((m, l) => Math.max(m, l.months), 0);
  const lastAmc = lines.filter((l) => l.isAmc).map((l) => l.effectiveTo).sort().pop() || "";
  const termTo = recurringMonths ? termEnd(start, recurringMonths) : "";
  return {
    agreementNo: `${quote.quoteNo || quote.id}${n(quote.version) > 1 ? `-v${quote.version}` : ""}`,
    quoteId: quote.id, accountId: quote.accountId || "", customer: h.party?.name || quote.legalName || "",
    status: "Active", startDate: start, endDate: [termTo, lastAmc].filter(Boolean).sort().pop() || "",
    currency: quote.currency || h.currency || "INR", paymentTerms: quote.paymentTerms || "",
    billingFrequency: quote.billingFrequency || h.billingFrequency || "",
    commercialModel: commercialModelOf(lines.map((l) => l.billingClass)),
    overallDiscountPct: overall, milestones: Array.isArray(h.milestones) ? h.milestones : [],
    amends: quote.supersedesQuoteId || "",
    // How it is billed (frequencies, separate usage invoice, proration): set on the Billing screen, kept across refreshes.
    ...(quote.agreement?.billing ? { billing: quote.agreement.billing } : {}),
    lines, createdAt: quote.agreement?.createdAt || opts.now || new Date().toISOString(),
    sourceHash: agreementHash(quote),
  };
}

/**
 * Where an agreement stands on a date: Active, Superseded (a later accepted
 * revision of the same quotation exists), Ended (past its end date) or
 * Cancelled. Worked out, not stored, so no other record needs rewriting.
 */
export function agreementStatus(quote, quotes = [], date = "") {
  const a = quote?.agreement;
  if (!a) return "";
  if (a.status === "Cancelled") return "Cancelled";
  if (quote.status !== "Accepted" || quote.isDeleted) return "Cancelled";
  const later = (quotes || []).some((q) => q && q.id !== quote.id && !q.isDeleted && q.status === "Accepted" && q.agreement
    && q.quoteNo && q.quoteNo === quote.quoteNo && n(q.version) > n(quote.version));
  if (later) return "Superseded";
  if (date && a.endDate && iso(date) > a.endDate) return "Ended";
  return "Active";
}

/** Every agreement, newest first: [{ quote, agreement, status }]. */
export function listAgreements(quotes = [], date = "") {
  return (quotes || []).filter((q) => q && !q.isDeleted && q.agreement && Array.isArray(q.agreement.lines))
    .map((q) => ({ quote: q, agreement: q.agreement, status: agreementStatus(q, quotes, date) }))
    .sort((a, b) => String(b.agreement.startDate).localeCompare(String(a.agreement.startDate)));
}

/**
 * The rates in force for a customer on a date: { code → { line, agreement } }.
 * Per component, the line from the most recently started active agreement wins.
 */
export function activeAgreementLines(quotes = [], accountId = "", date = "") {
  const out = {};
  if (!accountId) return out;
  const d = iso(date);
  const live = listAgreements(quotes, d).filter((x) => x.agreement.accountId === accountId && x.status === "Active" && (!d || x.agreement.startDate <= d));
  for (const x of live.sort((a, b) => String(a.agreement.startDate).localeCompare(String(b.agreement.startDate)))) {
    for (const line of x.agreement.lines) {
      if (!line.code) continue;
      if (d && line.effectiveTo && d > line.effectiveTo) continue;   // that component's term has ended
      out[line.code] = { line, agreement: x.agreement };
    }
  }
  return out;
}

/** The agreed unit price for a quantity (slabs / packs come from the agreement's own snapshot). */
export function agreedUnitPrice(line, qty, opts = {}) {
  if (line?.pricing && (line.pricing.rateSource === "Slab" || n(line.pricing.packQty) > 0)) {
    const up = usagePrice({ ...line.pricing, monthlyMinimum: 0 }, qty, opts);
    return r2(up.unitPrice * (1 - n(line.discountPct) / 100));
  }
  return n(line?.netRate);
}

/**
 * Charge for one billing month under an agreement line.
 * Subscription: agreed rate × committed quantity. Variable: actual quantity at
 * the agreed rate or slabs, never below the agreed minimum. One-time: 0 here
 * (billed by milestone). The Billing Engine uses this.
 */
export function monthlyCharge(line, actualQty, opts = {}) {
  if (!line || line.billingClass === "one_time") return { amount: 0, basis: "milestones" };
  if (line.billingClass === "subscription") return { amount: r2(agreedUnitPrice(line, line.qty) * n(line.qty)), basis: "fixed", qty: n(line.qty) };
  const q = Math.max(0, n(actualQty));
  // opts.factor: the year's escalation, applied to the usage before the minimum.
  const factor = opts.factor == null ? 1 : n(opts.factor);
  const usage = (line.pricing
    ? usagePrice({ ...line.pricing, monthlyMinimum: 0 }, q, opts).amount * (1 - n(line.discountPct) / 100)
    : q * n(line.netRate)) * factor;
  const minimum = Math.max(n(line.monthlyMinimum), n(line.pricing?.packPrice));
  // Hybrid: payable = fixed fee + share × (variable − fixed fee); it can fall below the fee.
  if (line.pricing?.minimumMode === "differential" && minimum > 0) {
    const d = differentialCharge(minimum, usage, differentialShare(line.pricing));
    return { amount: r2(d.amount), usage: r2(usage), minimum, minimumApplied: false, basis: "actual", qty: q,
      differential: { fixed: r2(d.fixed), variable: r2(d.variable), sharePct: d.sharePct, adjustment: r2(d.adjustment) } };
  }
  return { amount: r2(Math.max(usage, minimum)), usage: r2(usage), minimum, minimumApplied: minimum > usage, basis: "actual", qty: q };
}

/** Fixed monthly commitment of an agreement: subscriptions plus contractual minimums. */
export function fixedMonthly(agreement) {
  return r2((agreement?.lines || []).reduce((s, l) => s + (l.billingClass === "subscription" ? agreedUnitPrice(l, l.qty) * n(l.qty) : l.billingClass === "transaction" ? Math.max(n(l.monthlyMinimum), n(l.pricing?.packPrice)) : 0), 0));
}
