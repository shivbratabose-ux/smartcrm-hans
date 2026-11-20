// QA DEF-05: pricing-engine quote lines in the quotation register's table.
import { engineLineView, engineGst, engineProductIds } from "../src/lib/quotation/engineLineView.js";
import { groupOf } from "../src/lib/quotation/productGroups.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};

const sub = engineLineView({ productCode: "OB04", name: "Orbis One Enterprise", pricingModel: "SaaS Subscription", billingClass: "subscription", unit: "User", unitPriceResolved: 4199, qty: 20, months: 12, discountPct: 5, lineTotal: 957372 });
check("subscription: name, users × months, list, discount, agreed rate, total",
  [sub.charge, sub.name, sub.qtyText, sub.mrp, sub.discountPct, sub.price, sub.priceText, sub.taxable, sub.total],
  ["OB04", "Orbis One Enterprise", "20 × 12 mo", 4199, 5, 3989.05, "per User / month", 957372, 957372]);

const txn = engineLineView({ productCode: "AMS04", name: "Air Consol Filing", pricingModel: "Transaction", billingClass: "transaction", unit: "HAWB", unitPriceResolved: 30, qty: 0, months: 0, discountPct: 8.3333, monthlyMinimum: 0, lineTotal: 0 });
check("transaction: on use, agreed rate to paise, nothing committed",
  [txn.qtyText, txn.mrp, txn.price, txn.priceText, txn.total, txn.note], ["On use", 30, 27.5, "per HAWB", 0, "Billed monthly on actual use"]);

const txnMin = engineLineView({ productCode: "X", billingClass: "transaction", unitPriceResolved: 10, monthlyMinimum: 5000, lineTotal: 60000, months: 12 });
check("transaction with a minimum: committed total and the minimum named", [txnMin.total, txnMin.note], [60000, "Billed monthly on actual use; minimum ₹5,000 per month"]);

// One-time is decided by the pricing model (ONE_TIME_PRICING_MODELS), as everywhere else.
const one = engineLineView({ productCode: "AS03", name: "Data Migration", pricingModel: "Implementation", billingClass: "one_time", unitPriceResolved: 450000, qty: 1, months: 1, lineTotal: 450000 });
check("one-time: qty, amount, no per-month text", [one.qtyText, one.price, one.priceText, one.total, one.note], ["1", 450000, "", 450000, "One time"]);

check("missing fields never give NaN / undefined", JSON.stringify(engineLineView({})).match(/NaN|undefined/), null);
check("class from the pricing model when billingClass is absent", engineLineView({ pricingModel: "Implementation", lineTotal: 5 }).billingClass, "one_time");

check("GST from the stored breakdown", engineGst({ hans: { cgst: 131198.4, sgst: 131198.4, igst: 0 } }), { igst: 0, cgst: 131198.4, sgst: 131198.4 });
check("GST of a quote without a breakdown is zero", engineGst({}), { igst: 0, cgst: 0, sgst: 0 });

const catalog = [{ id: "OrbisOne", name: "Orbis One" }, { id: "AMSAir", name: "AMS - Air Consol" }];
const priceRows = [{ code: "OB04", productId: "OrbisOne", name: "Orbis One Enterprise" }, { code: "AMS04", productId: "AMSAir", name: "Air Consol Filing" }, { code: "AS03", productId: "_services", name: "Data Migration" }];
check("products panel: catalogue products in line order, services left out, no repeats",
  engineProductIds({ items: [{ productCode: "OB04" }, { productCode: "AMS04" }, { productCode: "AS03" }, { productCode: "OB04" }] }, priceRows, catalog, groupOf), ["OrbisOne", "AMSAir"]);
check("products panel: unknown codes are skipped", engineProductIds({ items: [{ productCode: "ZZ" }] }, priceRows, catalog, groupOf), []);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
