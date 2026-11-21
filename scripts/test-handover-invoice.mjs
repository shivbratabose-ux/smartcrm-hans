// Raise bill at handover = the agreement's FIRST invoice through Billing, so
// Billing never bills it again (decision 21 Nov 2026).
// Run: node scripts/test-handover-invoice.mjs
import { buildAgreement } from "../src/lib/quotation/agreements.js";
import { handoverInvoice, finalise, previewInvoices, milestoneItems, dueLines } from "../src/lib/billing/engine.js";
import { handoverStage } from "../src/lib/quotation/handover.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};
const cfg = { gstRatePct: 18, homeState: "Delhi" };
const SUB = { productCode: "ERP", name: "ERP", pricingModel: "SaaS Subscription", billingClass: "subscription", unit: "User", qty: 10, months: 12, unitPriceResolved: 2500, discountPct: 0 };
const ONE = { productCode: "IMP", name: "Implementation", pricingModel: "Implementation", billingClass: "one_time", unit: "Fixed", qty: 1, months: 1, unitPriceResolved: 100000, discountPct: 0 };
const USE = { productCode: "DOX", name: "WiseDox", pricingModel: "Per-transaction", billingClass: "transaction", unit: "Document", qty: 25000, months: 12, unitPriceResolved: 2, discountPct: 0 };
const mk = (items, milestones = [{ name: "With the order", pct: 50 }, { name: "On go-live", pct: 50 }]) => {
  const q = { id: "q1", quoteNo: "DEL/SQ/0001/2627", version: 1, status: "Accepted", acceptedDate: "2026-12-01", accountId: "a1", currency: "INR", billingFrequency: "Monthly", items, hans: { party: { name: "Customer", state: "Delhi" }, milestones } };
  return { ...q, agreement: buildAgreement(q, { priceRows: [], now: "2026-12-01T00:00:00Z" }) };
};

console.log("\nOne-time charges: the first milestone");
const q1 = mk([SUB, ONE]);
const r1 = handoverInvoice(q1, { invoices: [], config: cfg, today: "2026-12-03" });
check("the bill is the 50% milestone of the one-time charges, not the quote total", [r1.kind, r1.label, r1.preview.taxable, r1.preview.cycle], ["milestone", "50% With the order", 50000, "milestone-0"]);
const f1 = finalise(r1.preview, { by: "u1", at: "2026-12-03T10:00:00Z" });
check("Billing then shows that milestone as invoiced and offers only the next one", milestoneItems(q1, [f1]).map((m) => m.invoiced), [true, false]);
check("raising again would take the go-live milestone, never the same one", handoverInvoice(q1, { invoices: [f1], config: cfg, today: "2026-12-03" }).label, "50% On go-live");
check("the subscription is still billed monthly by Billing (untouched by the handover bill)", previewInvoices(q1, "2026-12", {}, { invoices: [f1], config: cfg })[0].lines.map((l) => l.code), ["ERP"]);

console.log("\nSubscriptions only: the first subscription invoice");
const q2 = mk([SUB], []);
const r2 = handoverInvoice(q2, { invoices: [], config: cfg, today: "2026-12-03" });
check("the bill is the first month's subscription, in advance", [r2.kind, r2.preview.period, r2.preview.taxable, r2.preview.invoiceNo], ["subscription", "2026-12", 25000, "BI/DEL/SQ/0001/2627/202612-S"]);
const f2 = finalise(r2.preview, { by: "u1", at: "2026-12-03T10:00:00Z" });
check("Billing's December run then has nothing left for that subscription", dueLines(q2, "2026-12", {}, { invoices: [f2] }).fixed.length, 0);
check("January bills normally", dueLines(q2, "2027-01", {}, { invoices: [f2] }).fixed.map((l) => l.amount), [25000]);

console.log("\nUsage only: nothing upfront");
const r3 = handoverInvoice(mk([USE], []), { invoices: [], config: cfg, today: "2026-12-03" });
check("no upfront bill; usage is invoiced monthly from Billing", [r3.kind, r3.preview, r3.label], ["none", null, "Billed monthly on actual usage"]);
check("no agreement: nothing", handoverInvoice({ id: "x" }, {}).kind, "none");

console.log("\nHandover stages");
check("a no-upfront-bill step counts as done, so the customer's confirmation can be recorded", handoverStage({ status: "Accepted", isFinal: true, handover: { finalAt: "x", noUpfrontBill: true } }).billed, true);
check("a small deal delivered from the deal completes step 5", handoverStage({ status: "Accepted", handover: { confirmedAt: "x", noProject: true } }).project, true);
check("an ordinary bill still counts", handoverStage({ handover: { billId: "col_1" } }).billed, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
