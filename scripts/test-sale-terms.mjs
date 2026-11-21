// How software is sold: subscription frequencies, one-time licence + yearly AMC.
import { saleTerms, saleTermsProblems, frequencyOf, oneTimeAllowed, oneTimeTermsFor, oneTimeUnitPrice, asOneTimeLine, oneTimeText, amcAgreementLines, DEFAULT_SALE_TERMS } from "../src/lib/quotation/saleTerms.js";
import { computeQuote } from "../src/lib/quotation/pricingEngine.js";
import { computeAmc, LICENCE_MODEL } from "../src/lib/quotation/amc.js";
import { buildAgreement } from "../src/lib/quotation/agreements.js";
import { previewInvoices } from "../src/lib/billing/engine.js";
import { quoteDocModel } from "../src/lib/quotation/quoteDocument.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};

// ── Settings ─────────────────────────────────────────────────────────
const t = saleTerms({});
check("defaults: every frequency allowed at 0%; one-time = 42 months less 20%", [t.frequencies.map((f) => [f.id, f.enabled, f.discountPct]), t.oneTime],
  [[["Monthly", true, 0], ["Quarterly", true, 0], ["Half-Yearly", true, 0], ["Annual", true, 0]], { enabled: true, months: 42, discountPct: 20 }]);
const t2 = saleTerms({ saleTerms: { frequencies: [{ id: "Annual", discountPct: 10 }, { id: "Monthly", enabled: false }, { id: "Quarterly", discountPct: 150 }], oneTime: { months: 36, discountPct: 25 } } });
check("saved settings win; percentages held to 0–100", [frequencyOf(t2, "Annual").discountPct, frequencyOf(t2, "Monthly").enabled, frequencyOf(t2, "Quarterly").discountPct, t2.oneTime], [10, false, 100, { enabled: true, months: 36, discountPct: 25 }]);
check("a cleared months value falls back to the default", saleTerms({ saleTerms: { oneTime: { months: "", discountPct: "" } } }).oneTime, DEFAULT_SALE_TERMS.oneTime);
check("settings are checked", saleTermsProblems({ frequencies: [{ id: "Monthly", enabled: false }], oneTime: { months: 2.5, discountPct: 120 } }),
  ["Allow at least one billing frequency.", "One-time: months must be a whole number from 1 to 240.", "One-time: discount must be 0 to 100%."]);

// ── Items ────────────────────────────────────────────────────────────
const plan = { code: "OB04", name: "Orbis One Enterprise", pricingModel: "SaaS Subscription", unit: "User", listPrice: 4199, minQty: 20 };
check("one-time is offered for subscriptions only, unless the item says no",
  [oneTimeAllowed(plan), oneTimeAllowed({ ...plan, oneTimeAllowed: false }), oneTimeAllowed({ pricingModel: "Per-transaction" }), oneTimeAllowed({ pricingModel: "Implementation" })], [true, false, false, false]);
check("an item's own one-time months / discount override the company's", [oneTimeTermsFor(plan, t), oneTimeTermsFor({ ...plan, otMonths: 60, otDiscountPct: 30 }, t), oneTimeTermsFor({ ...plan, otMonths: "", otDiscountPct: 0 }, t)],
  [{ months: 42, discountPct: 20 }, { months: 60, discountPct: 30 }, { months: 42, discountPct: 0 }]);
check("one-time price: ₹4,199 × 42 months less 20% = ₹1,41,086.40 per user", oneTimeUnitPrice(4199, { months: 42, discountPct: 20 }), 141086.4);
check("the sentence", oneTimeText({ months: 42, discountPct: 20 }, 20), "One-time licence: 3.5 years (42 months) of the monthly rate, less 20%; AMC 20% of the licence a year");
const conv = asOneTimeLine({ productCode: "OB04", qty: 20, months: 12, unitPriceResolved: 4199, discountPct: 0 }, plan, t);
check("a converted line: licence model, one month, the monthly rate kept", [conv.pricingModel, conv.billingClass, conv.months, conv.unitPriceResolved, conv.soldAs], [LICENCE_MODEL, "one_time", 1, 141086.4, { mode: "one_time", months: 42, discountPct: 20, monthlyRate: 4199 }]);
check("a usage line is never converted", asOneTimeLine({ unitPriceResolved: 30 }, { pricingModel: "Per-transaction" }, t).unitPriceResolved, 30);

// ── Pricing, AMC, agreement, billing ─────────────────────────────────
const q = computeQuote([conv], { customerState: "Delhi" }, { gstRatePct: 18, homeState: "Delhi" });
check("the quote: one-time licence for 20 users, nothing recurring", [q.oneTimeSubtotal, q.recurringSubtotal], [2821728, 0]);
const amc = computeAmc(q.lines, { config: {}, catalogue: [plan] });
check("AMC 20% of the licence a year from year 2, +10% every 2 years after 2 fixed years", [amc.annual, amc.schedule.map((y) => [y.contractYear, y.amount])],
  [564345.6, [[2, 564345.6], [3, 564345.6], [4, 620780.16], [5, 620780.16], [6, 682858.18]]]);
const amcLines = amcAgreementLines(amc, "2026-11-20");
check("AMC agreement lines: one per contract year, yearly periods", amcLines.map((l) => [l.code, l.effectiveFrom, l.effectiveTo, l.netRate]),
  [["AMC-Y2", "2027-11-20", "2028-11-19", 47028.8], ["AMC-Y3", "2028-11-20", "2029-11-19", 47028.8], ["AMC-Y4", "2029-11-20", "2030-11-19", 51731.68], ["AMC-Y5", "2030-11-20", "2031-11-19", 51731.68], ["AMC-Y6", "2031-11-20", "2032-11-19", 56904.85]]);
check("no AMC → no lines", amcAgreementLines({ applies: false }, "2026-11-20"), []);

const quote = { id: "q9", quoteNo: "DEL/SQ/0009/2627", version: 1, status: "Accepted", acceptedDate: "2026-11-20", accountId: "a1", currency: "INR", billingFrequency: "Annual",
  items: [{ productCode: "OB04", name: "Orbis One Enterprise", pricingModel: LICENCE_MODEL, billingClass: "one_time", unit: "User", qty: 20, months: 1, unitPriceResolved: 141086.4, discountPct: 0, lineTotal: 2821728, soldAs: conv.soldAs, baseRate: 4199 }],
  hans: { party: { name: "Buyer", state: "Delhi" }, amc, saleMode: { mode: "one_time", frequency: "Annual" }, milestones: [{ name: "With the order", pct: 100 }] } };
quote.agreement = buildAgreement(quote, { priceRows: [plan], now: "2026-11-20T00:00:00Z" });
check("agreement: the licence once, then five yearly AMC lines; ends with the last AMC year", [quote.agreement.lines.map((l) => [l.code, l.billingClass]), quote.agreement.endDate, quote.agreement.lines[0].soldAs.months],
  [[["OB04", "one_time"], ["AMC-Y2", "subscription"], ["AMC-Y3", "subscription"], ["AMC-Y4", "subscription"], ["AMC-Y5", "subscription"], ["AMC-Y6", "subscription"]], "2032-11-19", 42]);
const cfg = { gstRatePct: 18, homeState: "Delhi" };
const amcBill = (period) => (previewInvoices(quote, period, {}, { quotes: [quote], config: cfg })[0]?.lines || []).map((l) => [l.code, l.amount]);
check("nothing recurring is billed in year 1", amcBill("2027-05"), []);
check("AMC is billed monthly: a twelfth of the year, the anniversary month prorated", [amcBill("2027-11"), amcBill("2027-12"), amcBill("2028-11")], [[["AMC-Y2", 17243.89]], [["AMC-Y2", 47028.8]], [["AMC-Y2", 29784.91], ["AMC-Y3", 17243.89]]]);

// ── The quotation ────────────────────────────────────────────────────
const m = quoteDocModel({ ...quote, quoteNo: "X", createdDate: "2026-11-20" }, { priceRows: [plan], catalog: [] });
check("the quotation explains the licence price", m.oneTime[0].basis, "One-time licence: 42 months of ₹4,199 per user a month, less 20%");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
