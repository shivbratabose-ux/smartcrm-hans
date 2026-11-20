// Commercial reports (Phase D). Run: node scripts/test-reports.mjs
import { buildAgreement } from "../src/lib/quotation/agreements.js";
import { previewInvoices, finalise, milestoneInvoice, creditNote, reconcileUsage } from "../src/lib/billing/engine.js";
import { REPORTS, runReport, reportCsv, formatCell, quoteCommitted, productOf } from "../src/lib/billing/reports.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`}`);
};

// ── A small, known business ──
const SLABS = [{ from: 0, rate: 800 }, { from: 201, rate: 700 }, { from: 501, rate: 500 }, { from: 700, rate: 400 }];
const priceRows = [
  { code: "ERP", name: "ERP", pricingModel: "SaaS Subscription", unit: "User", rateSource: "Flat", listPrice: 2500, productId: "Orbis" },
  { code: "DOX", name: "WiseDox", pricingModel: "Per-transaction", unit: "Document", rateSource: "Flat", listPrice: 2, monthlyMinimum: 15000, productId: "WiseDox" },
  { code: "HBL", name: "Ocean filing", pricingModel: "Per-transaction", unit: "HBL", rateSource: "Slab", slabs: SLABS, productId: "AMS" },
  { code: "IMP", name: "Implementation", pricingModel: "Implementation", unit: "Fixed", rateSource: "Flat", listPrice: 100000, productId: "Orbis" },
];
const catalog = [{ id: "Orbis", name: "Orbis One" }, { id: "WiseDox", name: "WiseDox" }, { id: "AMS", name: "AMS" }];
const accounts = [{ id: "accA", name: "Alpha Logistics" }, { id: "accB", name: "Beta Freight" }];
const users = [{ id: "u1", name: "Asha" }, { id: "u2", name: "Ravi" }, { id: "boss", name: "Meera" }];
const L = {
  erp: (qty, disc = 0) => ({ productCode: "ERP", name: "ERP", pricingModel: "SaaS Subscription", billingClass: "subscription", unit: "User", qty, months: 12, unitPriceResolved: 2500, discountPct: disc, lineTotal: 2500 * qty * 12 * (1 - disc / 100), lineEstimate: 0 }),
  dox: (qty) => ({ productCode: "DOX", name: "WiseDox", pricingModel: "Per-transaction", billingClass: "transaction", unit: "Document", qty, months: 12, unitPriceResolved: 2, discountPct: 0, monthlyMinimum: 15000, lineTotal: 180000, lineEstimate: Math.max(qty * 2, 15000) * 12 }),
  hbl: (qty) => ({ productCode: "HBL", name: "Ocean filing", pricingModel: "Per-transaction", billingClass: "transaction", unit: "HBL", qty, months: 12, unitPriceResolved: 700, discountPct: 0, lineTotal: 0, lineEstimate: qty * 700 * 12 }),
  imp: () => ({ productCode: "IMP", name: "Implementation", pricingModel: "Implementation", billingClass: "one_time", unit: "Fixed", qty: 1, months: 1, unitPriceResolved: 100000, discountPct: 0, lineTotal: 100000, lineEstimate: 0 }),
};
const quote = (id, accountId, owner, status, items, over = {}) => {
  const committed = items.reduce((s, l) => s + l.lineTotal, 0), est = items.reduce((s, l) => s + l.lineEstimate, 0);
  const q = { id, quoteNo: `Q/${id}`, version: 1, accountId, owner, status, createdDate: "2026-11-15", currency: "INR", billingFrequency: "Monthly", items,
    hans: { party: { name: accountId, state: "Delhi" }, overallDiscountPct: 0, taxableBase: committed, variableEstimate: est, variableEstimateMonthly: est / 12, milestones: [{ name: "With the order", pct: 40 }, { name: "On go-live", pct: 60 }] }, ...over };
  return q.status === "Accepted" ? { ...q, agreement: buildAgreement({ ...q, acceptedDate: q.acceptedDate || "2026-12-01" }, { priceRows, now: "2026-12-01T00:00:00Z" }) } : q;
};
const qA = quote("a", "accA", "u1", "Accepted", [L.erp(10, 10), L.dox(25000), L.hbl(300), L.imp()], { acceptedDate: "2026-12-01" });
const qB = quote("b", "accB", "u2", "Accepted", [L.erp(20), L.hbl(900)], { acceptedDate: "2026-12-01" });
const qPending = quote("p", "accB", "u2", "Draft", [L.erp(5, 25)], { approvalStatus: "Pending", approvalRequestedAt: "2026-12-10T00:00:00Z", hans: { party: { name: "accB" }, overallDiscountPct: 0, taxableBase: 112500, variableEstimate: 0, approvalLevel: { label: "Management" }, approvalReasons: ["Line discount 25% exceeds policy 10%"] } });
const qLost = quote("l", "accA", "u1", "Rejected", [L.erp(8)]);
const qExpired = quote("e", "accA", "u2", "Expired", [L.erp(4)]);
const qOld = { id: "old", quoteNo: "Q/old", accountId: "accB", owner: "u1", status: "Sent", createdDate: "2026-11-20", product: "iCAFFE", total: 5.9, taxAmount: 0.9, discountPct: 5, approvalStatus: "Approved", approvedBy: "boss", approvedAt: "2026-11-21T00:00:00Z", approvalNotes: "Strategic account" };
const quotes = [qA, qB, qPending, qLost, qExpired, qOld];

const U = (quoteId, lineCode, period, quantity, extra = {}) => ({ id: `${quoteId}-${lineCode}-${period}-${quantity}`, quoteId, lineCode, period, quantity, externalRef: "", status: "approved", ...extra });
const usage = [U("a", "DOX", "2026-12", 25000), U("a", "HBL", "2026-12", 300), U("a", "DOX", "2027-01", 5000), U("a", "HBL", "2027-01", 150), U("b", "HBL", "2026-12", 900), U("b", "HBL", "2027-01", 600, { status: "draft" })];
const cfg = { gstRatePct: 18, homeState: "Delhi" };
const totalsFor = (q, period) => reconcileUsage(usage.filter((r) => r.quoteId === q.id), q.agreement.lines.filter((l) => l.billingClass === "transaction").map((l) => ({ quoteId: q.id, lineCode: l.code, period }))).totals;
const invoices = [];
for (const [q, p] of [[qA, "2026-12"], [qB, "2026-12"], [qA, "2027-01"]]) invoices.push(finalise(previewInvoices(q, p, totalsFor(q, p), { quotes, invoices, config: cfg })[0], { by: "boss", at: `${p}-28T00:00:00Z` }));
invoices.push(finalise(milestoneInvoice(qA, 0, "2026-12", { config: cfg }), { by: "boss", at: "2026-12-05T00:00:00Z" }));
invoices.push(creditNote(invoices[0], { amount: 10000, reason: "Goodwill", by: "boss", at: "2027-01-10T00:00:00Z" }));
const history = [{ section: "price", item_code: "ERP", item_name: "ERP", change: "changed", changed_at: "2026-12-20T00:00:00Z", changed_by: "boss", before: { listPrice: 2500 }, after: { listPrice: 2700 } }];
const ctx = { quotes, usage, invoices, history, priceRows, catalog, accounts, users, from: "2026-11", to: "2027-01", today: "2027-01-20" };
const R = (id) => runReport(id, ctx);
const pick = (rows, keys) => rows.map((r) => keys.map((k) => r[k]));

console.log("\nBasics");
check("fifteen reports", REPORTS.length, 15);
check("every report runs and has columns and rows", REPORTS.map((r) => { const x = R(r.id); return Array.isArray(x.columns) && x.columns.length > 0 && Array.isArray(x.rows); }).every(Boolean), true);
check("committed value: engine quote and older ₹ lakh quote", [quoteCommitted(qA), quoteCommitted(qOld)], [270000 + 180000 + 0 + 100000, 500000]);
check("product of a component", [productOf(ctx, "HBL"), productOf(ctx, "NOPE")], ["AMS", "Other"]);

console.log("\nQuotations");
const g = R("quotes-generated");
check("1. by customer", pick(g.rows.filter((r) => r.group === "Customer"), ["name", "quotes", "committed"]), [["Beta Freight", 3, 600000 + 112500 + 500000], ["Alpha Logistics", 3, 550000 + 240000 + 120000]].sort((a, b) => b[2] - a[2]));
check("1. by product: usage is an estimate, never committed", pick(g.rows.filter((r) => r.group === "Product" && r.name === "AMS"), ["quotes", "committed", "estimate"]), [[2, 0, 300 * 700 * 12 + 900 * 700 * 12]]);
check("1. by sales owner", pick(g.rows.filter((r) => r.group === "Sales owner"), ["name", "quotes"]).sort(), [["Asha", 3], ["Ravi", 3]]);
check("2. pending approval", pick(R("pending-approval").rows, ["quoteNo", "level", "discount", "days", "reason"]), [["Q/p", "Management", 25, 41, "Line discount 25% exceeds policy 10%"]]);
const w = R("won-lost-expired");
check("3. won / lost / expired / open and win rate", [pick(w.rows, ["outcome", "quotes"]).map((r) => r[1]), w.totals.outcome], [[2, 1, 1, 2], "Win rate 50% of 4 decided"]);
check("4. product-wise quoted value keeps the classes apart", pick(R("product-quoted").rows.filter((r) => r.product === "Orbis One"), ["quotes", "recurring", "oneTime"]), [[5, 270000 + 600000 + 112500 + 240000 + 120000, 100000]]);
const d = R("discounts");
check("12. discounts and exceptions, largest first", pick(d.rows, ["quoteNo", "discount", "status", "approver", "reason"]), [["Q/p", 25, "Pending", "", ""], ["Q/a", 10, "Not Required", "", ""], ["Q/old", 5, "Approved", "Meera", "Strategic account"]]);

console.log("\nRevenue, three kinds kept apart");
const f = R("fixed-recurring");
check("5. fixed recurring: committed per month and invoiced", [pick(f.rows, ["customer", "monthly", "yearly"]), f.totals.monthly], [[["Beta Freight", 50000, 600000], ["Alpha Logistics", 22500 + 15000, (22500 + 15000) * 12]], 87500]);
check("5. fixed invoiced in range includes minimums that applied", f.rows.find((r) => r.customer === "Alpha Logistics").invoiced, 22500 * 2 + 15000);
const t = R("transaction-revenue");
check("6. actual transaction revenue by customer and component", pick(t.rows, ["customer", "component", "qty", "amount", "months", "minimums"]),
  [["Beta Freight", "Ocean filing", 900, 360000, 1, 0], ["Alpha Logistics", "Ocean filing", 450, 210000 + 120000, 2, 0], ["Alpha Logistics", "WiseDox", 30000, 50000 + 15000, 2, 1]]);
check("7. one-time: agreed, invoiced by milestone, still open", pick(R("one-time").rows, ["customer", "total", "invoiced", "remaining", "milestones"]), [["Alpha Logistics", 100000, 40000, 60000, "40% invoiced, 60% open"]]);
const qi = R("quoted-vs-invoiced").rows.find((r) => r.customer === "Alpha Logistics");
check("13. quoted vs invoiced", [qi.committed, qi.fixed, qi.oneTime, qi.variable, qi.credits, qi.invoiced], [550000, 45000, 40000, 395000, -10000, 45000 + 40000 + 395000 - 10000]);
check("13. usage against what was expected for the months billed", [qi.estimate, qi.variance], [(50000 + 210000) * 2, 395000 - 520000]);

console.log("\nUsage");
const cc = R("customer-consumption");
check("8. customer-wise monthly consumption (approved only)", pick(cc.rows, ["customer", "component", "2026-12", "2027-01", "total"]), [["Alpha Logistics", "WiseDox", 25000, 5000, 30000], ["Beta Freight", "Ocean filing", 900, 0, 900], ["Alpha Logistics", "Ocean filing", 300, 150, 450]]);
check("8. month columns follow the range", cc.columns.map((c) => c.label).slice(3), ["Nov 2026", "Dec 2026", "Jan 2027", "Total"]);
check("9. product-wise volumes add customers together", pick(R("product-volumes").rows, ["product", "2026-12", "total"]), [["WiseDox", 25000, 30000], ["AMS", 1200, 1350]]);
const ar = R("average-rate").rows;
check("10. average realised rate vs list and agreed", pick(ar, ["component", "list", "agreedLow", "agreedHigh", "qty", "average"]), [["Ocean filing", null, 400, 700, 1350, Math.round((690000 / 1350) * 100) / 100], ["WiseDox", 2, 2, 2, 30000, Math.round((65000 / 30000) * 100) / 100]]);
check("11. slab distribution for the last month (approved usage, else expected volume)", pick(R("slab-distribution").rows, ["slab", "rate", "customers", "volume", "estimated", "names"]), [["Up to 200 HBL", 800, 1, 150, 0, "Alpha Logistics"], ["700 and above HBL", 400, 1, 900, 1, "Beta Freight"]]);
const ub = R("usage-vs-billing");
check("14. usage vs billing: state of every line-month", pick(ub.rows.filter((r) => r.month !== "Nov 2026"), ["month", "customer", "component", "usage", "billedQty", "state"]), [
  ["Dec 2026", "Alpha Logistics", "WiseDox", 25000, 25000, "Billed"], ["Dec 2026", "Alpha Logistics", "Ocean filing", 300, 300, "Billed"], ["Dec 2026", "Beta Freight", "Ocean filing", 900, 900, "Billed"],
  ["Jan 2027", "Alpha Logistics", "WiseDox", 5000, 5000, "Billed"], ["Jan 2027", "Alpha Logistics", "Ocean filing", 150, 150, "Billed"], ["Jan 2027", "Beta Freight", "Ocean filing", null, null, "Awaiting approval"]]);
check("14. usage changed after invoicing is a mismatch", runReport("usage-vs-billing", { ...ctx, usage: [...usage, U("a", "HBL", "2026-12", 20, { id: "late" })] }).rows.find((r) => r.month === "Dec 2026" && r.component === "Ocean filing" && r.customer === "Alpha Logistics"), { ...ub.rows.find((r) => r.month === "Dec 2026" && r.component === "Ocean filing" && r.customer === "Alpha Logistics"), usage: 320, difference: 20, state: "Mismatch: usage changed after invoicing", issues: "possible duplicate".slice(0, 0), entries: 2 });

console.log("\nAgreements");
const rn = runReport("renewals", { ...ctx, today: "2027-10-15", from: "2026-11", to: "2027-10" });
check("15. renewals due within 90 days, and price-list revisions", pick(rn.rows, ["type", "customer", "ref"]), [["Renewal due", "Alpha Logistics", "Q/a"], ["Renewal due", "Beta Freight", "Q/b"], ["Price list revision", "", "ERP"]]);
check("15. the revision in words", rn.rows[2].detail, "ERP: List price ₹2500 → ₹2700");
check("15. nothing due when terms are far off", R("renewals").rows.filter((r) => r.type.startsWith("Renewal")).length, 0);

console.log("\nOutput");
check("money, number, percent", [formatCell(1234567.4, "inr"), formatCell(-500, "inr"), formatCell(2.5, "inr2"), formatCell(25, "pct"), formatCell(30000, "num"), formatCell(null, "inr"), formatCell(1234567.4, "inr", { csv: true })], ["₹12,34,567", "− ₹500", "₹2.5", "25%", "30,000", "", "1234567"]);
const csv = reportCsv(R("transaction-revenue")).split("\n");
check("CSV: header, rows, totals; plain numbers", [csv[0], csv[1], csv.length], ["Customer,Product,Component,Unit,Actual volume,Invoiced,Months billed,Months at minimum", "Beta Freight,AMS,Ocean filing,HBL,900,360000,1,0", 5]);
check("dates: readable on screen, ISO in CSV", [formatCell("2026-10-01", "date"), formatCell("2026-10-01", "date", { csv: true }), formatCell("", "date")], ["01 Oct 2026", "2026-10-01", ""]);
check("CSV quotes text with commas", reportCsv({ columns: [{ key: "a", label: "A" }], rows: [{ a: 'x, "y"' }], totals: null }), 'A\n"x, ""y"""');
check("an empty business gives empty reports, not errors", REPORTS.map((r) => runReport(r.id, { quotes: [], usage: [], invoices: [], history: [], priceRows: [], catalog: [], accounts: [], users: [], from: "2026-11", to: "2027-01", today: "2027-01-20" }).rows.length), Array(15).fill(0).map((_, i) => (REPORTS[i].id === "won-lost-expired" ? 4 : 0)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
