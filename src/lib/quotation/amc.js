// AMC (annual maintenance) on one-time licences — company rules (Nov 2026):
//
//   • Applies to every line whose pricing model is "One-time Licence".
//   • Base = the licence fee only (implementation, training, migration,
//     customization excluded) — either the LIST fee before any discount (as
//     Hans' invoice terms word ALR) or the fee after discount; a setting.
//   • Rate = the product's own AMC: a fixed ₹ per unit per year (e.g. E-Annex
//     ₹10,000 per branch) or its own %, else the default % in Quotation Rules.
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
  amcBase: "net",          // "net" = after discount, "list" = list fee before discount
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
    base: config.amcBase === "list" ? "list" : "net",
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
  const rowOf = (code) => catalogue.find((p) => p.code === code);
  const rowPct = (code) => { const r = rowOf(code); return r && has(r.amcPct) ? n(r.amcPct) : rules.defaultPct; };
  const rowFixed = (code) => { const r = rowOf(code); return r && has(r.amcFixed) && n(r.amcFixed) > 0 ? n(r.amcFixed) : null; };
  const overall = Math.min(100, Math.max(0, n(overallDiscountPct)));
  const ov = overrides || {};
  const deviations = [];

  const amcLines = lines.filter((l) => l && !l._empty && l.pricingModel === LICENCE_MODEL && n(l.lineTotal) > 0).map((l) => {
    const rulePct = rowPct(l.productCode);
    const fixed = rowFixed(l.productCode);
    const custom = ov.linePct && has(ov.linePct[l.productCode]) ? n(ov.linePct[l.productCode]) : null;
    // List fee = units × list price before any discount; net = after line + overall discount.
    const listFee = has(l.grossPerPeriod) ? n(l.grossPerPeriod) : n(l.lineTotal) / Math.max(0.0001, 1 - n(l.discountPct) / 100);
    const base = rules.base === "list" ? listFee : n(l.lineTotal) * (1 - overall / 100);
    const units = Math.max(n(l.billedQty) || n(l.qty) || 1, 1);
    // A product priced with a fixed AMC (₹ per unit per year) keeps it, unless the rep sets a %.
    if (fixed !== null && custom === null) {
      const annual = fixed * units;
      return { productCode: l.productCode, name: l.name || l.productCode, base, pct: base > 0 ? +(annual / base * 100).toFixed(2) : 0, rulePct: null, fixed, annual };
    }
    const pct = custom ?? rulePct;
    if (custom !== null && custom !== (fixed !== null ? null : rulePct)) deviations.push(`AMC on ${l.name || l.productCode}: ${custom}% instead of ${fixed !== null ? `₹${fixed.toLocaleString("en-IN")} per unit` : `${rulePct}%`}`);
    return { productCode: l.productCode, name: l.name || l.productCode, base, pct, rulePct, fixed: null, annual: base * pct / 100 };
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
export function amcTermText(amc, config = {}) {
  if (!amc?.applies) return "";
  const listBase = amcRules(config).base === "list";
  const parts = [...new Set(amc.lines.map((l) => l.fixed !== null && l.fixed !== undefined ? `₹${Number(l.fixed).toLocaleString("en-IN")} per unit` : `${l.pct}%`))];
  const ofWhat = listBase ? "of the listed licence fee (before any discount)" : "of the licence fee";
  const rate = parts.every((p) => p.endsWith("%")) ? `${parts.join(" / ")} ${ofWhat}` : parts.join(" / ");
  return `AMC: ${rate} per year, from contract year ${amc.terms.startYear} (year 1 under warranty${amc.terms.startYear === 1 ? " — AMC billed from go-live" : ""}); ${describeEscalation(amc.terms)}. Billed annually in advance.`;
}
