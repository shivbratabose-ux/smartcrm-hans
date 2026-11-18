// AMC (annual maintenance) on one-time licences — company rules (Nov 2026):
//
//   • Applies to every line whose pricing model is "One-time Licence".
//   • Base = the licence fee only, after its line discount and the overall
//     discount (implementation, training, migration, customization excluded).
//   • Rate = the product's own AMC % (Products & Pricing), else the default
//     in Quotation Rules.
//   • Starts in contract year 2 (year 1 is covered by warranty).
//   • Fixed for the first 2 AMC years, then +10% every 2 years.
//
// A rep may change the start year, the escalation or a line's rate on a
// quote; any change from the rules sends the quote for approval.
// Pure — unit-tested in scripts/test-amc.mjs.

export const LICENCE_MODEL = "One-time Licence";

export const AMC_DEFAULTS = {
  amcDefaultPct: 20,       // % of the licence fee per year
  amcStartYear: 2,         // contract year AMC is first billed (1 = from go-live)
  amcFixedYears: 2,        // AMC years before the first increase
  amcEscalationPct: 10,    // increase per step
  amcEscalationEvery: 2,   // years between increases
  amcScheduleYears: 5,     // AMC years shown on the quote
};

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const has = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));

/** The company AMC rules, from Quotation Rules config (with the old ALR % as fallback). */
export function amcRules(config = {}) {
  return {
    defaultPct: has(config.amcDefaultPct) ? n(config.amcDefaultPct) : has(config.alrPctOfLicence) ? n(config.alrPctOfLicence) : AMC_DEFAULTS.amcDefaultPct,
    startYear: has(config.amcStartYear) ? n(config.amcStartYear) : AMC_DEFAULTS.amcStartYear,
    fixedYears: has(config.amcFixedYears) ? n(config.amcFixedYears) : AMC_DEFAULTS.amcFixedYears,
    escalationPct: has(config.amcEscalationPct) ? n(config.amcEscalationPct) : AMC_DEFAULTS.amcEscalationPct,
    escalationEvery: Math.max(1, has(config.amcEscalationEvery) ? n(config.amcEscalationEvery) : AMC_DEFAULTS.amcEscalationEvery),
    scheduleYears: Math.min(15, Math.max(1, has(config.amcScheduleYears) ? n(config.amcScheduleYears) : AMC_DEFAULTS.amcScheduleYears)),
  };
}

/** Multiplier for AMC year k (1 = first AMC year): fixed, then stepped up. */
export function escalationFactor(k, { fixedYears, escalationPct, escalationEvery }) {
  if (k <= fixedYears) return 1;
  const steps = Math.floor((k - fixedYears - 1) / Math.max(1, escalationEvery)) + 1;
  return Math.pow(1 + escalationPct / 100, steps);
}

/**
 * AMC for a quote.
 * @param lines   priced lines (pricingModel, lineTotal, productCode, name)
 * @param opts    { config, catalogue (price rows with amcPct), overallDiscountPct,
 *                  overrides: { startYear?, fixedYears?, escalationPct?, escalationEvery?, linePct?: {code: pct} } }
 * @returns { applies, base, annual, lines, terms, schedule[{contractYear, amcYear, amount}], scheduleTotal, deviations[] }
 */
export function computeAmc(lines = [], { config = {}, catalogue = [], overallDiscountPct = 0, overrides = {} } = {}) {
  const rules = amcRules(config);
  const rowPct = (code) => {
    const r = catalogue.find((p) => p.code === code);
    return r && has(r.amcPct) ? n(r.amcPct) : rules.defaultPct;
  };
  const overall = Math.min(100, Math.max(0, n(overallDiscountPct)));
  const ov = overrides || {};
  const deviations = [];

  const amcLines = lines.filter((l) => l && !l._empty && l.pricingModel === LICENCE_MODEL && n(l.lineTotal) > 0).map((l) => {
    const rulePct = rowPct(l.productCode);
    const custom = ov.linePct && has(ov.linePct[l.productCode]) ? n(ov.linePct[l.productCode]) : null;
    const pct = custom ?? rulePct;
    if (custom !== null && custom !== rulePct) deviations.push(`AMC on ${l.name || l.productCode}: ${custom}% instead of ${rulePct}%`);
    const base = n(l.lineTotal) * (1 - overall / 100);
    return { productCode: l.productCode, name: l.name || l.productCode, base, pct, rulePct, annual: base * pct / 100 };
  });

  const terms = {
    startYear: has(ov.startYear) ? Math.max(1, Math.round(n(ov.startYear))) : rules.startYear,
    fixedYears: has(ov.fixedYears) ? Math.max(0, Math.round(n(ov.fixedYears))) : rules.fixedYears,
    escalationPct: has(ov.escalationPct) ? Math.max(0, n(ov.escalationPct)) : rules.escalationPct,
    escalationEvery: has(ov.escalationEvery) ? Math.max(1, Math.round(n(ov.escalationEvery))) : rules.escalationEvery,
  };
  if (amcLines.length) {
    if (terms.startYear !== rules.startYear) deviations.push(`AMC starts in year ${terms.startYear} instead of year ${rules.startYear}`);
    if (terms.fixedYears !== rules.fixedYears || terms.escalationPct !== rules.escalationPct || terms.escalationEvery !== rules.escalationEvery) {
      deviations.push(`AMC increase: ${describeEscalation(terms)} instead of ${describeEscalation(rules)}`);
    }
  }

  const annual = amcLines.reduce((s, l) => s + l.annual, 0);
  const schedule = amcLines.length ? Array.from({ length: rules.scheduleYears }, (_, i) => {
    const amcYear = i + 1;
    return { contractYear: terms.startYear + i, amcYear, amount: +(annual * escalationFactor(amcYear, terms)).toFixed(2) };
  }) : [];

  return {
    applies: amcLines.length > 0,
    base: +amcLines.reduce((s, l) => s + l.base, 0).toFixed(2),
    annual: +annual.toFixed(2),
    lines: amcLines.map((l) => ({ ...l, base: +l.base.toFixed(2), annual: +l.annual.toFixed(2) })),
    terms,
    schedule,
    scheduleTotal: +schedule.reduce((s, y) => s + y.amount, 0).toFixed(2),
    deviations,
    breached: deviations.length > 0,
  };
}

export function describeEscalation({ fixedYears, escalationPct, escalationEvery }) {
  if (!escalationPct) return "no increase";
  return `fixed ${fixedYears} yr${fixedYears === 1 ? "" : "s"}, then +${escalationPct}% every ${escalationEvery === 1 ? "year" : `${escalationEvery} yrs`}`;
}

/** One line for the quote's terms, e.g. "AMC 20% of the licence fee p.a. from year 2; fixed 2 yrs, then +10% every 2 yrs." */
export function amcTermText(amc) {
  if (!amc?.applies) return "";
  const pcts = [...new Set(amc.lines.map((l) => l.pct))];
  return `AMC: ${pcts.join("% / ")}% of the licence fee per year, from contract year ${amc.terms.startYear} (year 1 under warranty${amc.terms.startYear === 1 ? " — AMC billed from go-live" : ""}); ${describeEscalation(amc.terms)}. Billed annually in advance.`;
}
