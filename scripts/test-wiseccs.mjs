// WiseCCS: the three models of the AISATS Noida quote (v2.0, 6 Nov 2025), and
// ACMES folded into WiseCCS. Run: node scripts/test-wiseccs.mjs
//   Model 1 TRS: billed to the trade, revenue share to the operator by slab (statement)
//   Model 2 hybrid: payable = fixed fee + 40% × (variable − fixed fee)
//   Model 3 SaaS without infrastructure: fixed monthly per terminal category
import { HANS_CATALOGUE } from "../src/data/quotationMasters.js";
import { BILLING_PROFILES } from "../src/data/billingMasters.js";
import { INIT_PRODUCT_CATALOG } from "../src/data/seed.js";
import { computeLine, computeQuote, validateCcsRule } from "../src/lib/quotation/pricingEngine.js";
import { buildAgreement, pricingSnapshot, monthlyCharge } from "../src/lib/quotation/agreements.js";
import { usageRuleText, hasUsageRules } from "../src/lib/quotation/slabs.js";
import { shareMonth, shareBands, revenueShareProblems, revenueShareText, statementCsv, isTradeBilled } from "../src/lib/billing/revenueShare.js";
import { billingRun, revenueShareStatements, dueLines } from "../src/lib/billing/engine.js";
import { quoteDocumentHtml } from "../src/lib/quotation/quoteDocument.js";
import { lineForRow } from "../src/lib/quotation/quoteProducts.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};
const row = (code) => HANS_CATALOGUE.find((r) => r.code === code);
const TRS = row("CC05").revenueShare;

console.log("\nPrice rows");
check("Model 1 TRS rates: ₹75 per AWB, ₹165 per SB, ₹165 per BOE, billed to the trade, 84 months",
  ["CC05", "CC06", "CC07"].map((c) => [row(c).listPrice, row(c).billingClass, row(c).billTo, row(c).termMonths]), [[75, "transaction", "trade", 84], [165, "transaction", "trade", 84], [165, "transaction", "trade", 84]]);
check("Annexure A.1 slabs on the combined count: Hans 100 / 60 / 50 / 40%", TRS.slabs, [{ from: 0, hansPct: 100 }, { from: 4001, hansPct: 60 }, { from: 8001, hansPct: 50 }, { from: 12001, hansPct: 40 }]);
check("the three TRS rows are counted together", new Set(["CC05", "CC06", "CC07"].map((c) => row(c).revenueShare.group)).size, 1);
check("Model 2 hybrid: ₹6,50,000 + ₹45 domestic, ₹15,50,000 + ₹100 international, 40% of the difference, 60 months",
  ["CC08", "CC09"].map((c) => [row(c).monthlyMinimum, row(c).listPrice, row(c).minimumMode, row(c).differentialSharePct, row(c).termMonths]), [[650000, 45, "differential", 40, 60], [1550000, 100, "differential", 40, 60]]);
check("Model 3 SaaS without infrastructure: ₹5,50,000 and ₹10,50,000 a month per terminal, 60 months",
  ["CC10", "CC11"].map((c) => [row(c).listPrice, row(c).billingClass, row(c).unit, row(c).termMonths]), [[550000, "subscription", "Terminal", 60], [1050000, "subscription", "Terminal", 60]]);
check("all WiseCCS rows belong to WiseCCS and are not sold as a one-time licence", ["CC05", "CC06", "CC07", "CC08", "CC09", "CC10", "CC11"].every((c) => row(c).productId === "WiseCCS" && row(c).oneTimeAllowed === false), true);
check("the unpriced placeholders and ACMES are switched off for new quotes", ["P04", "P05", "CC01", "CC02", "CC03", "CC04"].map((c) => row(c).active), [false, false, false, false, false, false]);
check("the CC03 > CC04 rule stays quiet while they are unpriced", validateCcsRule(HANS_CATALOGUE).ok, true);
check("no revenue-share problems in the seed", revenueShareProblems(TRS), []);
check("a new quote line starts at the row's contract term", [lineForRow(row("CC05")).months, lineForRow(row("CC08")).months, lineForRow(row("CC10")).months, lineForRow(row("P01")).months], [84, 60, 60, 12]);

console.log("\nACMES is WiseCCS");
check("no ACMES product, no ACMES billing profile", [INIT_PRODUCT_CATALOG.some((p) => p.id === "ACMES"), BILLING_PROFILES.some((p) => p.id === "acmes")], [false, false]);
const prof = BILLING_PROFILES.find((p) => p.id === "wiseccs");
check("the WiseCCS profile: revenue share by default; hybrid and SaaS without infrastructure allowed", [prof.defaultModelId, prof.allowedModelIds.includes("hybrid"), prof.allowedModelIds.includes("saas_no_infra")], ["revenue_share", true, true]);

console.log("\nRevenue share (Annexure A.1)");
const mix = [{ code: "CC05", name: "Domestic", qty: 6000, rate: 75 }, { code: "CC06", name: "Export", qty: 2000, rate: 165 }, { code: "CC07", name: "Import", qty: 2000, rate: 165 }];
const g = shareMonth(mix, TRS, "graduated");
check("10,000 transactions = ₹11,10,000 gross (6,000 × ₹75 + 4,000 × ₹165)", [g.count, g.gross], [10000, 1110000]);
check("graduated: 4,000 at 100%, 4,000 at 60%, 2,000 at 50% → Hans 74% overall", [g.bands.map((b) => [b.count, b.hansPct]), g.hansPct], [[[4000, 100], [4000, 60], [2000, 50]], 74]);
check("graduated: Hans ₹8,21,400, AISATS ₹2,88,600", [g.hans, g.operator], [821400, 288600]);
const v = shareMonth(mix, TRS, "volume");
check("whole month: 10,000 is in the 8,001–12,000 slab → 50 / 50, ₹5,55,000 each", [v.bands.length, v.hansPct, v.hans, v.operator], [1, 50, 555000, 555000]);
check("slab edges: 4,000 is all 100%; 4,001 whole-month is 60%", [shareBands(4000, TRS, "graduated").hansPct, shareBands(4001, TRS, "volume").hansPct, shareBands(4001, TRS, "graduated").hansPct], [100, 60, 99.99]);
check("above 12,000: graduated 15,000 → (4,000×100 + 4,000×60 + 4,000×50 + 3,000×40) = 64%", shareBands(15000, TRS, "graduated").hansPct, 64);
check("labels", g.bands.map((b) => b.label), ["Up to 4,000", "4,001–8,000", "8,001–12,000"]);
check("an empty month shares nothing", [shareMonth([], TRS).gross, shareMonth([], TRS).hans, shareMonth([], TRS).operator], [0, 0, 0]);
const odd = shareMonth([{ code: "A", qty: 4003, rate: 75 }, { code: "B", qty: 1, rate: 165 }], TRS, "graduated");
check("bands always add up to the gross; Hans + operator = gross", [Math.round(odd.bands.reduce((t, b) => t + b.gross, 0) * 100) / 100 === odd.gross, Math.round((odd.hans + odd.operator) * 100) / 100 === odd.gross], [true, true]);
check("the quotation's slab lines", revenueShareText(TRS, { operator: "AISATS" })[1], "4,001–8,000 transactions a month: Hans Infomatic 60%, AISATS 40%");
check("bad slabs are caught", revenueShareProblems({ slabs: [{ from: 0, hansPct: 120 }, { from: 10, hansPct: null }] }).length, 2);

console.log("\nHybrid (Annexure A.2)");
const hyb = (code) => ({ code, billingClass: "transaction", qty: 0, netRate: row(code).listPrice, discountPct: 0, monthlyMinimum: row(code).monthlyMinimum, pricing: pricingSnapshot(row(code)) });
check("the agreement keeps the hybrid rule", [pricingSnapshot(row("CC08")).minimumMode, pricingSnapshot(row("CC08")).differentialSharePct], ["differential", 40]);
check("domestic above the fixed fee: 20,000 AWB × ₹45 = ₹9,00,000 → ₹6,50,000 + 40% × ₹2,50,000 = ₹7,50,000", monthlyCharge(hyb("CC08"), 20000).amount, 750000);
check("domestic below: 10,000 AWB × ₹45 = ₹4,50,000 → ₹6,50,000 − 40% × ₹2,00,000 = ₹5,70,000 (AISATS keeps 60% of the saving)", monthlyCharge(hyb("CC08"), 10000).amount, 570000);
check("international: 20,000 SB/BOE × ₹100 = ₹20,00,000 → ₹15,50,000 + 40% × ₹4,50,000 = ₹17,30,000", monthlyCharge(hyb("CC09"), 20000).amount, 1730000);
check("at the fixed fee exactly the fee is payable", monthlyCharge(hyb("CC08"), 650000 / 45).amount, 650000);
check("no transactions: 60% of the fixed fee", monthlyCharge(hyb("CC08"), 0).amount, 390000);
check("an ordinary minimum is still a floor", monthlyCharge({ ...hyb("CC08"), pricing: { rateSource: "Flat", listPrice: 45 } }, 10000).amount, 650000);
check("the formula is printed on the quote", usageRuleText(row("CC08"), { unit: "AWB" })[0].includes("payable = fixed fee + 40% × (variable − fixed fee)"), true);

console.log("\nQuote");
const qline = (code, qty, months) => { const r = row(code); return { productCode: code, pricingModel: r.pricingModel, billingClass: r.billingClass, unitPriceResolved: r.listPrice, qty, months, discountPct: 0, monthlyMinimum: r.monthlyMinimum || 0, minimumMode: r.minimumMode, differentialSharePct: r.differentialSharePct, billTo: r.billTo }; };
const m1 = computeQuote([qline("CC05", 6000, 84), qline("CC06", 2000, 84), qline("CC07", 2000, 84)], { customerState: "Uttar Pradesh" }, { gstRatePct: 18, homeState: "Delhi" });
check("Model 1: nothing is billed to the operator; the trade pays about ₹11,10,000 a month (estimate)", [m1.grandTotal, m1.variableLineCount, m1.tradeLineCount, m1.tradeGrossMonthly], [0, 0, 3, 1110000]);
const m2 = computeQuote([qline("CC08", 20000, 60), qline("CC09", 20000, 60)], {}, { gstRatePct: 18, homeState: "Delhi" });
check("Model 2: fixed fees committed for 60 months (₹22,00,000 a month); estimate ₹7,50,000 + ₹17,30,000", [m2.recurringSubtotal, Math.round(m2.variableEstimateMonthly)], [132000000, 2480000]);
const m3 = computeQuote([qline("CC10", 1, 60), qline("CC11", 1, 60)], {}, { gstRatePct: 18, homeState: "Delhi" });
check("Model 3: ₹16,00,000 a month, ₹9,60,00,000 over 60 months", m3.recurringSubtotal, 96000000);
check("a trade line commits nothing", computeLine(qline("CC05", 6000, 84)).lineTotal, 0);

console.log("\nBilling");
const quote = (items, over = {}) => {
  const q = { id: "qccs", quoteNo: "DEL/SQ/0101/2526", version: 1, status: "Accepted", acceptedDate: "2025-12-01", accountId: "aisats", currency: "INR", billingFrequency: "Monthly",
    items: items.map((it) => ({ ...it, name: row(it.productCode).name, unit: row(it.productCode).unit, pricing: pricingSnapshot(row(it.productCode)) })), hans: { party: { name: "AISATS Noida Cargo Terminal", state: "Uttar Pradesh" } }, ...over };
  return { ...q, agreement: buildAgreement(q, { priceRows: HANS_CATALOGUE, now: "2025-12-01T00:00:00Z" }) };
};
const trs = quote([qline("CC05", 6000, 84), qline("CC06", 2000, 84), qline("CC07", 2000, 84)]);
check("the agreement lines are trade-billed and keep the slabs", [trs.agreement.lines.every(isTradeBilled), trs.agreement.lines[0].pricing.revenueShare.slabs.length, trs.agreement.lines[0].effectiveTo], [true, 4, "2032-11-30"]);
const usage = [["CC05", 6000], ["CC06", 2000], ["CC07", 2000]].map(([c, qty]) => ({ id: `u_${c}`, quoteId: "qccs", lineCode: c, period: "2026-01", quantity: qty, externalRef: `CCS-${c}`, status: "approved", source: "manual" }));
const run = billingRun({ quotes: [trs], period: "2026-01", usageRecords: usage, invoices: [], config: { gstRatePct: 18, homeState: "Delhi" } });
check("no invoice to the operator for trade-billed lines", [run.length, run[0].previews.length, dueLines(trs, "2026-01", {}).usage.length], [1, 0, 0]);
const st = run[0].statements[0];
check("one statement for the month: RS/<agreement>/202601", [run[0].statements.length, st.statementNo], [1, "RS/DEL/SQ/0101/2526/202601"]);
check("statement: 10,000 transactions, ₹11,10,000 gross, Hans ₹8,21,400, AISATS ₹2,88,600, paid within 15 days", [st.count, st.gross, st.hans, st.operator, st.paymentDays, st.mode, st.issues.length], [10000, 1110000, 821400, 288600, 15, "graduated", 0]);
const whole = { ...trs, agreement: { ...trs.agreement, billing: { revenueShareMode: "volume" } } };
const st2 = revenueShareStatements(whole, "2026-01", { "qccs|CC05|2026-01": 6000, "qccs|CC06|2026-01": 2000, "qccs|CC07|2026-01": 2000 })[0];
check("the agreement can switch to whole-month slabs: 50 / 50", [st2.mode, st2.modeOverridden, st2.hans, st2.operator], ["volume", true, 555000, 555000]);
const missing = billingRun({ quotes: [trs], period: "2026-01", usageRecords: usage.slice(0, 1), invoices: [] })[0].statements[0];
check("a missing count blocks the statement", missing.issues.filter((i) => i.level === "blocking").map((i) => i.lineCode), ["CC06", "CC07"]);
check("the statement for Excel", statementCsv(st).split("\r\n").filter((l) => /^(CC05|Total|Payable)/.test(l)), ["CC05,\"WiseCCS TRS — domestic, per AWB (billed to the trade)\",6000,75,450000", "Total,10000,1110000,74,821400,288600", "Payable to AISATS Noida Cargo Terminal on its invoice,288600"]);
check("statements start with the month (Dec 2025 start, nothing before)", revenueShareStatements(trs, "2025-11", {}).length, 0);

const hy = quote([qline("CC08", 20000, 60), qline("CC09", 20000, 60)]);
const hu = [["CC08", 20000], ["CC09", 20000]].map(([c, qty]) => ({ id: `h_${c}`, quoteId: "qccs", lineCode: c, period: "2026-01", quantity: qty, externalRef: `H-${c}`, status: "approved", source: "manual" }));
const inv = billingRun({ quotes: [hy], period: "2026-01", usageRecords: hu, invoices: [], config: { gstRatePct: 18, homeState: "Delhi" } })[0].previews[0];
check("hybrid invoice: ₹7,50,000 + ₹17,30,000 = ₹24,80,000 taxable, IGST 18% (Uttar Pradesh)", [inv.lines.map((l) => l.amount), inv.taxable, inv.igst], [[750000, 1730000], 2480000, 446400]);
check("hybrid working shown per month", inv.lines[0].calc.months[0].differential, { fixed: 650000, variable: 900000, sharePct: 40, adjustment: 100000 });

console.log("\nQuotation document");
const doc = quoteDocumentHtml({ ...trs, items: trs.items, createdDate: "2025-11-06", hans: { ...trs.hans } }, { priceRows: HANS_CATALOGUE, catalog: INIT_PRODUCT_CATALOG, config: { gstRatePct: 18 } });
check("TRS: a separate section, paid by the trade, with the share slabs and the statement terms", [
  doc.includes("Charges billed by Hans Infomatic to the trade (not invoiced to you)"), doc.includes("Paid by the trade"),
  doc.includes("Up to 4,000 transactions a month: Hans Infomatic 100%, AISATS Noida Cargo Terminal 0%"), doc.includes("within 15 days of receipt of your invoice"),
  doc.includes("GST on variable charges")], [true, true, true, true, false]);
const doc2 = quoteDocumentHtml({ ...hy, createdDate: "2025-11-06" }, { priceRows: HANS_CATALOGUE, catalog: INIT_PRODUCT_CATALOG, config: { gstRatePct: 18 } });
check("hybrid: the fixed monthly fees and the formula", [doc2.includes("Fixed monthly fee: WiseCCS hybrid — domestic"), doc2.includes("40% × (variable − fixed fee)")], [true, true]);
check("rows with these rules count as usage pricing", [hasUsageRules(row("CC05")), hasUsageRules(row("CC08")), hasUsageRules(row("CC10"))], [true, true, false]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
