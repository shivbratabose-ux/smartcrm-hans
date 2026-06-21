// ═══════════════════════════════════════════════════════════════════
// pricingEngine — pure quotation pricing module (no UI / state coupling)
// ═══════════════════════════════════════════════════════════════════
// Ports the validated Excel model (Hans_Quotation_Module_3.xlsx, sheets
// Quotation / Product_Catalogue / Pricing_Bands / iCAFFE_RateCard /
// Config). Every export is a pure function so the §11 acceptance vectors
// run headless (see scripts/test-pricing-engine.mjs).
//
// CONVENTIONS
//   • All money is in INR base units (₹), full precision. Round only for
//     display (totals: 0 dp; unit prices: 2 dp) — never inside the engine.
//   • Discounts are PERCENT numbers (e.g. 10 = 10%), per the brief's test
//     vectors. (The workbook stored fractions; we convert at the edge.)
//   • Currency: resolved unit prices are divided by Config.fx (default 1)
//     so multi-currency can be layered on later without reworking formulas.
//
// FORMULA BASIS (resolved per user decision — "workbook wins"):
//   • TCV = Grand Total incl GST                (workbook L44 = L43)
//   • Prepayment discount applies to (subtotal − overall discount), i.e.
//     one-time + recurring                       (workbook L36)
//   • An overall-discount line feeds the taxable base (workbook L34/L37)
//   • One-time lines force effectiveMonths = 1   (brief §5; safer than the
//     workbook's reliance on the user typing Months = 1)
// ═══════════════════════════════════════════════════════════════════

import {
  QUOTE_CONFIG, ONE_TIME_MODELS, FLOOR_MODELS,
  PRICING_BANDS, ICAFFE_BAND_FROM, ICAFFE_EDITIONS,
} from "../../data/quotationMasters.js";

// ── Small helpers ────────────────────────────────────────────────────
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** True when a pricing model is billed one-time (else recurring). */
export function isOneTimeModel(pricingModel) {
  return ONE_TIME_MODELS.includes(pricingModel);
}
/** "One-time" | "Recurring" bucket for a line (mirrors Quotation!F15). */
export function bucketOf(pricingModel) {
  return isOneTimeModel(pricingModel) ? "One-time" : "Recurring";
}
/** Whether a model honours a per-month minimum floor (greater-of). */
export function hasFloor(pricingModel) {
  return FLOOR_MODELS.includes(pricingModel);
}

/**
 * iCAFFE band index for a user count: the highest band whose threshold
 * ≤ qty (Excel MATCH(qty, ic_bandfrom, 1)). qty below the first threshold
 * maps to band 0 ("5 (Min)").
 */
export function icaffeBandIndex(qty, bandFrom = ICAFFE_BAND_FROM) {
  const q = num(qty);
  let idx = 0;
  for (let i = 0; i < bandFrom.length; i++) {
    if (q >= bandFrom[i]) idx = i; else break;
  }
  return idx;
}

/**
 * Resolve a per-unit price for a catalogue product at a given quantity.
 * Returns { unitPrice, missingRate }. `missingRate` is true when a priced
 * model resolves to a blank/0 rate, so the UI can flag "enter rate in
 * master" rather than silently producing 0 (brief §9).
 *
 * @param {object} product  catalogue row (rateSource, listPrice, name…)
 * @param {object} opts     { qty, bands, editions, bandFrom, fx, config }
 */
export function resolveUnitPrice(product, opts = {}) {
  if (!product) return { unitPrice: 0, missingRate: true };
  const qty = num(opts.qty);
  const config = opts.config || QUOTE_CONFIG;
  const fx = num(opts.fx ?? config.fx) || 1;
  const bands = opts.bands || PRICING_BANDS;
  const editions = opts.editions || ICAFFE_EDITIONS;
  const bandFrom = opts.bandFrom || ICAFFE_BAND_FROM;

  let raw = null; // pre-FX resolved rate
  switch (product.rateSource) {
    case "Band": {
      const band = bands.find((b) => qty >= num(b.fromUsers) && qty <= num(b.toUsers));
      raw = band && band.ratePerUserMonth != null ? num(band.ratePerUserMonth) : null;
      break;
    }
    case "iCAFFE": {
      const ed = editions.find((e) => e.name === product.name);
      if (ed) {
        const val = ed.rates[icaffeBandIndex(qty, bandFrom)];
        raw = val != null ? num(val) : null;
      }
      break;
    }
    case "Flat":
    default:
      raw = product.listPrice != null ? num(product.listPrice) : null;
      break;
  }

  // An explicitly-zero list price (e.g. WiseHandling Inclusive / "at
  // actuals" modules) is a deliberate 0, not a missing rate.
  const explicitZero = product.rateSource !== "iCAFFE" && product.rateSource !== "Band" && product.listPrice === 0;
  if (raw == null && !explicitZero) {
    return { unitPrice: 0, missingRate: true };
  }
  return { unitPrice: num(raw) / fx, missingRate: false };
}

/**
 * Compute a single line's totals.
 *
 * @param {object} line  {
 *   pricingModel, unitPriceResolved, qty, months, discountPct, minMonthFloor
 * }
 * @returns { isOneTime, effectiveMonths, grossPerPeriod, lineTotal,
 *            lineOneTime, lineRecurring }
 */
export function computeLine(line) {
  const pricingModel = line.pricingModel;
  const oneTime = isOneTimeModel(pricingModel);
  const months = num(line.months);
  const effectiveMonths = oneTime ? 1 : months;
  const floor = hasFloor(pricingModel) ? num(line.minMonthFloor) : 0;
  const qty = num(line.qty);
  const unitPrice = num(line.unitPriceResolved);
  const discountPct = num(line.discountPct);

  const grossPerPeriod = Math.max(qty * unitPrice, floor);
  const lineTotal = grossPerPeriod * effectiveMonths * (1 - discountPct / 100);

  return {
    isOneTime: oneTime,
    effectiveMonths,
    grossPerPeriod,
    lineTotal,
    lineOneTime: oneTime ? lineTotal : 0,
    lineRecurring: oneTime ? 0 : lineTotal,
  };
}

/**
 * GST split on a taxable base. Intra-state (CGST+SGST) when the customer
 * state matches Config.homeState, else inter-state (IGST).
 */
export function computeGst(taxableBase, customerState, config = QUOTE_CONFIG) {
  const base = num(taxableBase);
  const rate = num(config.gstRatePct);
  const intra = (customerState || "") === config.homeState;
  const cgst = intra ? (base * (rate / 2)) / 100 : 0;
  const sgst = intra ? (base * (rate / 2)) / 100 : 0;
  const igst = intra ? 0 : (base * rate) / 100;
  return { cgst, sgst, igst, gstTotal: cgst + sgst + igst, intraState: intra };
}

/**
 * Full quote rollup from priced lines.
 *
 * @param {Array}  lines   each with { pricingModel, unitPriceResolved,
 *                          qty, months, discountPct, minMonthFloor }
 * @param {object} header  { customerState, overallDiscountPct,
 *                           prepaymentApplicable, prepaymentDiscountPct }
 * @param {object} config  defaults to QUOTE_CONFIG
 */
export function computeQuote(lines = [], header = {}, config = QUOTE_CONFIG) {
  const computed = lines.map((l) => ({ ...l, ...computeLine(l) }));

  const oneTimeSubtotal = computed.reduce((s, l) => s + l.lineOneTime, 0);
  const recurringSubtotal = computed.reduce((s, l) => s + l.lineRecurring, 0);
  const subtotal = oneTimeSubtotal + recurringSubtotal;            // L33

  const overallDiscountPct = num(header.overallDiscountPct);
  const overallDiscount = subtotal * (overallDiscountPct / 100);   // L34

  const prepaymentDiscountPct = header.prepaymentApplicable
    ? num(header.prepaymentDiscountPct ?? config.prepaymentDiscountPctDefault)
    : 0;
  // Workbook L36: prepay % of (subtotal − overall discount).
  const prepaymentDisc = (subtotal - overallDiscount) * (prepaymentDiscountPct / 100);

  const taxableBase = subtotal - overallDiscount - prepaymentDisc; // L37
  const { cgst, sgst, igst, gstTotal, intraState } = computeGst(taxableBase, header.customerState, config);
  const grandTotal = taxableBase + gstTotal;                       // L43 (upfront; excludes ALR)

  // Licence + ALR (annual support uplift), shown separately, NOT in grandTotal.
  const licenceBase = computed
    .filter((l) => l.pricingModel === "One-time Licence")
    .reduce((s, l) => s + l.lineTotal, 0);
  const alrAnnual = licenceBase * (num(config.alrPctOfLicence) / 100);

  // TCV — workbook basis: Grand Total incl GST (L44 = L43).
  const tcv = grandTotal;

  return {
    lines: computed,
    oneTimeSubtotal, recurringSubtotal, subtotal,
    overallDiscountPct, overallDiscount,
    prepaymentDiscountPct, prepaymentDisc,
    taxableBase,
    cgst, sgst, igst, gstTotal, intraState,
    grandTotal,
    licenceBase, alrAnnual,
    tcv,
  };
}

// ── Guardrails (brief §9) ────────────────────────────────────────────

/**
 * Discount-policy check. Returns { breached, reasons[] } when any line
 * discount or the overall discount exceeds Config.maxUserDiscountPct.
 */
export function evaluateDiscountGuardrail(lines = [], header = {}, config = QUOTE_CONFIG) {
  const cap = num(config.maxUserDiscountPct);
  const reasons = [];
  const maxLine = lines.reduce((m, l) => Math.max(m, num(l.discountPct)), 0);
  if (maxLine > cap) reasons.push(`Line discount ${maxLine}% exceeds policy ${cap}%`);
  const overall = num(header.overallDiscountPct);
  if (overall > cap) reasons.push(`Overall discount ${overall}% exceeds policy ${cap}%`);
  return { breached: reasons.length > 0, reasons };
}

/**
 * Gross margin % for a line, after its line discount, given a per-unit cost.
 * Returns null when no cost is set (can't assess) or the price is non-positive.
 */
export function lineMargin(unitPrice, costPerUnit, discountPct = 0) {
  const up = num(unitPrice) * (1 - num(discountPct) / 100);
  const c = num(costPerUnit);
  if (!(up > 0) || !(c > 0)) return null;
  return ((up - c) / up) * 100;
}

/**
 * Margin-floor guardrail (roadmap Phase 3a). Flags any line whose post-
 * discount gross margin falls below Config.minMarginPct. Off (never
 * breaches) when minMarginPct is 0/unset or a line has no cost — so it's
 * additive and changes nothing until costs + a floor are configured.
 *
 * @param {Array} lines  each may carry { productCode, unitPriceResolved,
 *                        costPerUnit, discountPct }
 */
export function evaluateMarginGuardrail(lines = [], config = QUOTE_CONFIG) {
  const min = num(config.minMarginPct);
  if (!(min > 0)) return { breached: false, min: 0, reasons: [], lines: [] };
  const flagged = [];
  for (const l of lines) {
    const m = lineMargin(l.unitPriceResolved, l.costPerUnit, l.discountPct);
    if (m != null && m < min) flagged.push({ code: l.productCode, margin: +m.toFixed(1) });
  }
  return {
    breached: flagged.length > 0,
    min,
    lines: flagged,
    reasons: flagged.map((f) => `${f.code || "line"} margin ${f.margin}% < floor ${min}%`),
  };
}

/**
 * CC03 unit price must be strictly greater than CC04 (brief §9). Returns
 * { ok, error } — hard-block in admin save, warn on a quote using both.
 */
export function validateCcsRule(catalogue = []) {
  const cc03 = catalogue.find((p) => p.code === "CC03");
  const cc04 = catalogue.find((p) => p.code === "CC04");
  if (!cc03 || !cc04) return { ok: true };
  const p3 = cc03.listPrice, p4 = cc04.listPrice;
  if (p3 == null || p4 == null) return { ok: true }; // not yet priced
  if (num(p3) <= num(p4)) {
    return { ok: false, error: `CC03 (₹${num(p3)}) must be priced higher than CC04 (₹${num(p4)}).` };
  }
  return { ok: true };
}

/**
 * WiseHandling needs ≥ 3 chargeable functional modules (brief §9).
 * `lines` should carry productCode. MIS/Mobile (inclusive, rate 0) and
 * the one-time setup/training/integration lines don't count as functional.
 */
const WH_NON_FUNCTIONAL = new Set(["WH06", "WH07", "WH09", "WH10", "WH11", "WH12"]);
export function validateWiseHandlingModules(lines = []) {
  const whFunctional = lines.filter(
    (l) => typeof l.productCode === "string" && l.productCode.startsWith("WH") && !WH_NON_FUNCTIONAL.has(l.productCode)
  );
  if (whFunctional.length === 0) return { ok: true, count: 0 };
  return {
    ok: whFunctional.length >= 3,
    count: whFunctional.length,
    warning: whFunctional.length < 3
      ? `WiseHandling requires at least 3 functional modules (${whFunctional.length} selected).`
      : undefined,
  };
}

// ── Quote numbering (brief §10) ──────────────────────────────────────

/** Indian fiscal year (Apr–Mar) suffix "YY-YY" for a date. */
export function fiscalYearSuffix(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? y : y - 1; // Apr (month 3) starts FY
  const yy = (n) => String(n % 100).padStart(2, "0");
  return `${yy(startYear)}-${yy(startYear + 1)}`;
}

/** Format a quote number: SQ/M + zero-padded seq + /YY-YY. */
export function formatQuoteNumber(seq, date = new Date(), config = QUOTE_CONFIG) {
  const padded = String(num(seq)).padStart(config.quoteNumberSeqWidth, "0");
  return `${config.quoteNumberPrefix}${padded}/${fiscalYearSuffix(date)}`;
}
