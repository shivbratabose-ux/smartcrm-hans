// Billing Engine (Phase C). Run: node scripts/test-billing.mjs
import { buildAgreement } from "../src/lib/quotation/agreements.js";
import {
  periodOf, addMonths, monthsBetween, daysInPeriod, periodLabel, billingSettings, activeFraction, lineTerm, escalationFactor,
  expectedUsage, reconcileUsage, correctUsage, parseUsageRows, matchUsageRows, dueLines, previewInvoices, milestoneItems, milestoneInvoice,
  finaliseProblems, finalise, creditNote, netOfCredits, collectionFromInvoice, billingRun, billedLineMonths, supersededFrom, invoiceNoFor,
} from "../src/lib/billing/engine.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`}`);
};

const SLABS = [{ from: 0, rate: 800 }, { from: 201, rate: 700 }, { from: 501, rate: 500 }, { from: 700, rate: 400 }];
const priceRows = [
  { code: "DOX", pricingModel: "Per-transaction", unit: "Document", rateSource: "Flat", listPrice: 2, monthlyMinimum: 15000 },
  { code: "HBL", pricingModel: "Per-transaction", unit: "HBL", rateSource: "Slab", slabs: SLABS },
];
const mk = (over = {}, agr = {}) => {
  const q = {
    id: "q1", quoteNo: "DEL/SQ/0050/2627", version: 1, status: "Accepted", acceptedDate: "2026-12-01", accountId: "accA", currency: "INR", billingFrequency: "Monthly",
    items: [
      { productCode: "ERP", name: "ERP", pricingModel: "SaaS Subscription", billingClass: "subscription", unit: "User", qty: 10, months: 12, unitPriceResolved: 2500, discountPct: 10 },
      { productCode: "DOX", name: "WiseDox", pricingModel: "Per-transaction", billingClass: "transaction", unit: "Document", qty: 25000, months: 12, unitPriceResolved: 2, discountPct: 0, monthlyMinimum: 15000 },
      { productCode: "HBL", name: "Ocean filing", pricingModel: "Per-transaction", billingClass: "transaction", unit: "HBL", qty: 300, months: 12, unitPriceResolved: 700, discountPct: 0 },
      { productCode: "IMP", name: "Implementation", pricingModel: "Implementation", billingClass: "one_time", unit: "Fixed", qty: 1, months: 1, unitPriceResolved: 100000, discountPct: 0 },
    ],
    hans: { party: { name: "Customer A", state: "Delhi" }, milestones: [{ name: "With the order", pct: 40 }, { name: "On go-live", pct: 60 }] },
    ...over,
  };
  const a = buildAgreement(q, { priceRows, now: "2026-12-01T00:00:00Z" });
  return { ...q, agreement: { ...a, ...agr } };
};
const use = (lineCode, period, quantity, extra = {}) => ({ id: `u_${lineCode}_${period}_${quantity}_${extra.externalRef || ""}`, quoteId: "q1", lineCode, period, quantity, externalRef: "", status: "approved", source: "manual", ...extra });
const cfg = { gstRatePct: 18, homeState: "Delhi" };

console.log("\nPeriods");
check("month arithmetic", [periodOf("2026-12-17"), addMonths("2026-12", 1), addMonths("2026-12", 14), monthsBetween("2026-12", "2027-03"), daysInPeriod("2027-02"), periodLabel("2027-02")], ["2026-12", "2027-01", "2028-02", 3, 28, "Feb 2027"]);
check("default settings", billingSettings(mk().agreement), { subscriptionFrequency: "Monthly", usageFrequency: "Monthly", separateUsageInvoice: false, prorate: true });
check("part month", [activeFraction({ from: "2026-12-10", to: "2027-12-09" }, "2026-12"), activeFraction({ from: "2026-12-10", to: "" }, "2027-01"), activeFraction({ from: "2026-12-10", to: "" }, "2026-11"), activeFraction({ from: "2026-12-10", to: "" }, "2026-12", false)].map((v) => Math.round(v * 1000) / 1000), [0.71, 1, 0, 1]);

console.log("\nTEST 4 and 9: billing on actual usage, with a minimum");
const q = mk();
const dec = reconcileUsage([use("DOX", "2026-12", 25000), use("HBL", "2026-12", 300)], expectedUsage([q], "2026-12").map((e) => ({ quoteId: e.quote.id, lineCode: e.line.code, period: "2026-12" })));
const inv = previewInvoices(q, "2026-12", dec.totals, { quotes: [q], config: cfg })[0];
check("variable lines that need usage", expectedUsage([q], "2026-12").map((e) => e.line.code), ["DOX", "HBL"]);
check("one invoice: subscription in advance + actual usage", inv.lines.map((l) => [l.code, l.billingClass, l.qty, l.amount]), [["ERP", "subscription", 10, 22500], ["DOX", "transaction", 25000, 50000], ["HBL", "transaction", 300, 210000]]);
check("TEST 4: 25,000 documents × agreed ₹2 = ₹50,000", inv.lines[1].calc.months[0], { period: "2026-12", qty: 25000, usage: 50000, minimum: 15000, minimumApplied: false, slab: "", factor: 1, amount: 50000, missing: false });
check("invoice shows the applicable slab", inv.lines[2].calc.months[0].slab, "201–500 HBL");
check("totals and GST (intra-state: CGST + SGST)", [inv.taxable, inv.cgst, inv.sgst, inv.igst, inv.total], [282500, 25425, 25425, 0, 333350]);
check("inter-state customer → IGST", (() => { const x = previewInvoices(mk({ hans: { party: { state: "Maharashtra" } } }), "2026-12", dec.totals, { config: cfg })[0]; return [x.cgst, x.igst]; })(), [0, 50850]);
check("invoice number and period", [inv.invoiceNo, inv.period, inv.status, inv.agreementNo], ["BI/DEL/SQ/0050/2627/202612", "2026-12", "preview", "DEL/SQ/0050/2627"]);
const low = previewInvoices(q, "2026-12", { "q1|DOX|2026-12": 5000, "q1|HBL|2026-12": 150 }, { config: cfg })[0];
check("TEST 9: 5,000 documents (₹10,000) bills the ₹15,000 minimum", [low.lines[1].amount, low.lines[1].calc.months[0].minimumApplied, low.lines[1].description.includes("minimum billing applied")], [15000, true, true]);
check("slab follows the ACTUAL volume, not the quoted one", [low.lines[2].amount, low.lines[2].calc.months[0].slab], [150 * 800, "Up to 200 HBL"]);
check("zero usage still bills the minimum; a line without a minimum bills nothing", (() => { const z = previewInvoices(q, "2026-12", { "q1|DOX|2026-12": 0, "q1|HBL|2026-12": 0 }, { config: cfg })[0]; return [z.lines[1].amount, z.lines[2].amount]; })(), [15000, 0]);

console.log("\nTEST 12: usage reconciliation");
const exp = [{ quoteId: "q1", lineCode: "DOX", period: "2026-12" }, { quoteId: "q1", lineCode: "HBL", period: "2026-12" }];
const types = (r) => r.issues.map((i) => `${i.level}:${i.type}:${i.lineCode}`);
check("missing usage blocks the invoice", [types(reconcileUsage([use("DOX", "2026-12", 100)], exp)), reconcileUsage([use("DOX", "2026-12", 100)], exp).ready], [["blocking:missing:HBL"], false]);
check("the same reference twice is a duplicate", types(reconcileUsage([use("DOX", "2026-12", 100, { externalRef: "BATCH-7" }), use("DOX", "2026-12", 100, { externalRef: "BATCH-7", id: "dup" }), use("HBL", "2026-12", 5)], exp)), ["blocking:duplicate:DOX"]);
check("same quantity with no reference is flagged, not blocked", (() => { const r = reconcileUsage([use("DOX", "2026-12", 100), use("DOX", "2026-12", 100, { id: "again" }), use("HBL", "2026-12", 5)], exp); return [types(r), r.ready, r.totals["q1|DOX|2026-12"]]; })(), [["warning:possible_duplicate:DOX"], true, 200]);
check("an entry that is not approved blocks", types(reconcileUsage([use("DOX", "2026-12", 100, { status: "draft" }), use("HBL", "2026-12", 5)], exp)), ["blocking:missing:DOX", "blocking:unapproved:DOX"]);
const orig = use("DOX", "2026-12", 100);
const { voided, correction } = correctUsage(orig, 120, { by: "fin", at: "2027-01-03", note: "recount", id: "corr1" });
check("a correction voids the original and waits for approval", [voided.status, correction.status, correction.correctsId, correction.quantity], ["void", "draft", orig.id, 120]);
const afterCorr = reconcileUsage([voided, { ...correction, status: "approved" }, use("HBL", "2026-12", 5)], exp);
check("only the corrected quantity counts; the correction is reported", [afterCorr.totals["q1|DOX|2026-12"], types(afterCorr), afterCorr.ready], [120, ["info:corrected:DOX"], true]);
check("several approved entries add up", reconcileUsage([use("DOX", "2026-12", 100, { externalRef: "A" }), use("DOX", "2026-12", 50, { externalRef: "B" }), use("HBL", "2026-12", 5)], exp).totals["q1|DOX|2026-12"], 150);
check("a preview with missing usage cannot be finalised", finaliseProblems(previewInvoices(q, "2026-12", { "q1|DOX|2026-12": 10 }, { config: cfg })[0]), ["No approved usage for HBL in Dec 2026."]);
const parsed = parseUsageRows("agreement,component,period,quantity,reference\nDEL/SQ/0050/2627,DOX,2026-12,\"25,000\",B1\nDEL/SQ/0050/2627\tHBL\t2026-12\t300\tB2\nDEL/SQ/0050/2627,DOX,Dec,10\nNOPE,DOX,2026-12,5");
check("pasted usage: header skipped, bad rows reported", [parsed.rows.length, parsed.errors.length], [3, 1]);
const m = matchUsageRows([{ agreementNo: "DEL/SQ/0050/2627", lineCode: "DOX", period: "2026-12", quantity: 25000, externalRef: "B1" }, { agreementNo: "DEL/SQ/0050/2627", lineCode: "ERP", period: "2026-12", quantity: 1, externalRef: "" }, { agreementNo: "NOPE", lineCode: "DOX", period: "2026-12", quantity: 5, externalRef: "" }, { agreementNo: "DEL/SQ/0050/2627", lineCode: "DOX", period: "2026-12", quantity: 25000, externalRef: "B1" }], [q], [], { idOf: (_, i) => `n${i}` });
check("upload: unknown agreement, non-usage component and repeated reference are rejected", [m.records.map((r) => [r.quoteId, r.lineCode, r.status]), m.rejects.map((r) => r.reason.slice(0, 22))], [[["q1", "DOX", "draft"]], ["ERP is not a usage-bil", "Agreement NOPE not fou", "Reference B1 is alread"]]);
check("upload: a reference already in the system is a duplicate", matchUsageRows([{ agreementNo: "DEL/SQ/0050/2627", lineCode: "DOX", period: "2026-12", quantity: 1, externalRef: "B1" }], [q], [use("DOX", "2026-12", 25000, { externalRef: "B1" })]).rejects.length, 1);

console.log("\nTEST 14: mixed billing frequency");
const mixed = mk({ billingFrequency: "Monthly" }, { billing: { usageFrequency: "Quarterly", separateUsageInvoice: true } });
const u3 = { "q1|DOX|2026-12": 25000, "q1|DOX|2027-01": 5000, "q1|DOX|2027-02": 9000, "q1|HBL|2026-12": 300, "q1|HBL|2027-01": 150, "q1|HBL|2027-02": 800 };
const cyc = (p) => previewInvoices(mixed, p, u3, { config: cfg }).map((i) => [i.cycle, i.invoiceNo.slice(-9), i.taxable]);
check("December: the monthly SaaS invoice only", cyc("2026-12"), [["subscription", "/202612-S", 22500]]);
check("January: again SaaS only", cyc("2027-01"), [["subscription", "/202701-S", 22500]]);
check("February: SaaS, plus the quarter's usage on its own invoice", cyc("2027-02"), [["subscription", "/202702-S", 22500], ["usage", "/202702-U", 50000 + 15000 + 18000 + 210000 + 120000 + 320000]]);
check("each month of the quarter is priced on its own volume and minimum", previewInvoices(mixed, "2027-02", u3, { config: cfg })[1].lines[0].calc.months.map((x) => [x.period, x.qty, x.amount, x.minimumApplied]), [["2026-12", 25000, 50000, false], ["2027-01", 5000, 15000, true], ["2027-02", 9000, 18000, false]]);
const quarterly = mk({ billingFrequency: "Quarterly" });
check("quarterly subscription: three months in advance, then nothing until the next quarter", ["2026-12", "2027-01", "2027-03"].map((p) => dueLines(quarterly, p, u3).fixed.map((l) => [l.amount, l.calc.months.length])), [[[67500, 3]], [], [[67500, 3]]]);

console.log("\nProration, escalation, term end");
const midMonth = mk({ acceptedDate: "2026-12-10" });
check("first part month prorated (22 of 31 days)", dueLines(midMonth, "2026-12", {}).fixed[0], { ...dueLines(midMonth, "2026-12", {}).fixed[0], amount: Math.round(22500 * 22 / 31 * 100) / 100, description: "ERP: Dec 2026 (part month prorated)" });
check("last part month prorated (9 of 31 days); nothing after the term", [dueLines(midMonth, "2027-12", {}).fixed[0]?.amount, dueLines(midMonth, "2028-01", {}).fixed.length], [Math.round(22500 * 9 / 31 * 100) / 100, 0]);
check("no proration when switched off", dueLines({ ...midMonth, agreement: { ...midMonth.agreement, billing: { prorate: false } } }, "2026-12", {}).fixed[0].amount, 22500);
const esc = mk({ items: [{ productCode: "ERP", name: "ERP", pricingModel: "SaaS Subscription", billingClass: "subscription", unit: "User", qty: 10, months: 36, unitPriceResolved: 1000, discountPct: 0, escalationPct: 10 }] });
check("+10% from each anniversary", [escalationFactor(esc.agreement.lines[0], "2027-11"), escalationFactor(esc.agreement.lines[0], "2027-12"), dueLines(esc, "2027-12", {}).fixed[0].amount, dueLines(esc, "2028-12", {}).fixed[0].amount], [1, 1.1, 11000, 12100]);

console.log("\nNever billed twice; amendments");
const finalDec = finalise(inv, { by: "fin", at: "2027-01-02T00:00:00Z" });
check("finalised", [finalDec.status, finalDec.finalisedBy], ["final", "fin"]);
check("line-months on a final invoice", [...billedLineMonths([finalDec])].sort(), ["q1|DOX|2026-12", "q1|ERP|2026-12", "q1|HBL|2026-12"]);
check("the same period previews nothing more", previewInvoices(q, "2026-12", dec.totals, { invoices: [finalDec], config: cfg }), []);
check("switching to separate invoices later still does not re-bill", previewInvoices({ ...q, agreement: { ...q.agreement, billing: { separateUsageInvoice: true } } }, "2026-12", dec.totals, { invoices: [finalDec], config: cfg }), []);
check("an identical invoice cannot be finalised again", finaliseProblems(inv, [finalDec]), ["BI/DEL/SQ/0050/2627/202612 is already final."]);
const rev = mk({ id: "q1r", version: 2, supersedesQuoteId: "q1", acceptedDate: "2027-03-01", items: [{ productCode: "ERP", name: "ERP", pricingModel: "SaaS Subscription", billingClass: "subscription", unit: "User", qty: 25, months: 12, unitPriceResolved: 2500, discountPct: 20 }] });
check("a revision takes over from its start date", [supersededFrom(q, [q, rev]), lineTerm(q.agreement.lines[0], "2027-03-01").to], ["2027-03-01", "2027-02-28"]);
const who = (p) => billingRun({ quotes: [q, rev], period: p, usageRecords: [], config: cfg }).map((r) => [r.agreement.agreementNo, r.previews[0]?.lines[0]?.amount]);
check("February bills the old terms, March the new ones", [who("2027-02"), who("2027-03")], [[["DEL/SQ/0050/2627", 22500]], [["DEL/SQ/0050/2627-v2", 50000]]]);

console.log("\nMilestones, credit notes, Collections");
check("milestones of the one-time charges", milestoneItems(q).map((x) => [x.name, x.pct, x.amount, x.invoiced]), [["With the order", 40, 40000, false], ["On go-live", 60, 60000, false]]);
const m1 = milestoneInvoice(q, 0, "2026-12", { config: cfg });
check("milestone invoice", [m1.invoiceNo, m1.cycle, m1.taxable, m1.total, m1.lines[0].description], ["BI/DEL/SQ/0050/2627/202612-M1", "milestone-0", 40000, 47200, "One-time charges: 40% with the order"]);
check("a raised milestone is marked invoiced", milestoneItems(q, [finalise(m1)]).map((x) => x.invoiced), [true, false]);
const cn = creditNote(finalDec, { amount: 28250, reason: "Agreed goodwill credit", by: "fin", at: "2027-01-10", seq: 1 });
check("credit note for 10% of the taxable value", [cn.invoiceNo, cn.type, cn.taxable, cn.gst, cn.total, cn.creditOf, cn.reason], ["CN/BI/DEL/SQ/0050/2627/202612", "credit", -28250, -5085, -33335, finalDec.id, "Agreed goodwill credit"]);
check("net after the credit; a credit does not free the months for re-billing", [netOfCredits(finalDec, [finalDec, cn]), previewInvoices(q, "2026-12", dec.totals, { invoices: [finalDec, cn], config: cfg }).length], [300015, 0]);
check("full credit", creditNote(finalDec, { reason: "Raised in error" }).total, -333350);
const col = collectionFromInvoice(finalDec, { today: "2027-01-02", by: "fin", creditDays: 15, legalName: "Customer A Pvt Ltd" });
check("Collections record (₹ lakh)", [col.invoiceNo, col.invoiceType, col.billedAmount, col.gstAmount, col.netPayable, col.dueDate, col.billPeriodFrom, col.billPeriodTo, col.accountId], ["BI/DEL/SQ/0050/2627/202612", "Proforma Invoice", 2.825, 0.5085, 3.3335, "2027-01-17", "2026-12-01", "2026-12-31", "accA"]);
check("small invoices keep their rupees", collectionFromInvoice({ ...finalDec, taxable: 185, gst: 33.3, total: 218.3 }, { today: "2027-01-02" }).billedAmount, 0.00185);
check("invoice numbers by cycle", [invoiceNoFor("A", "2027-02", "period"), invoiceNoFor("A", "2027-02", "usage"), invoiceNoFor("A", "2027-02", "milestone-1")], ["BI/A/202702", "BI/A/202702-U", "BI/A/202702-M2"]);

console.log("\nThe run");
const run = billingRun({ quotes: [q], period: "2026-12", usageRecords: [use("DOX", "2026-12", 25000, { externalRef: "B1" })], invoices: [], config: cfg });
check("one row per agreement with its usage check and preview", [run.length, run[0].usage.ready, run[0].previews[0].taxable, run[0].previews[0].issues.map((i) => i.type), run[0].milestones.length], [1, false, 22500 + 50000, ["missing"], 2]);
check("an agreement that has not started is not in the run", billingRun({ quotes: [q], period: "2026-11", config: cfg }).length, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
