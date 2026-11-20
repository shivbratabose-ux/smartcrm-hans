// Commercial reports (specification of 20 Nov 2026, §15, Phase D).
// Fifteen reports over quotes, agreements, usage, invoices and price history.
// Committed recurring revenue, variable (consumption) revenue and one-time
// revenue are always kept apart.
//
// Every report is a pure function of one context:
//   ctx = { quotes, usage, invoices, history, priceRows, catalog, accounts,
//           users, from, to, today }      (from / to are months "YYYY-MM")
// and returns { columns: [{ key, label, type }], rows: [{…}], totals, note }.
// type: text | num | inr | pct | date.  Tested in scripts/test-reports.mjs.
import { billingClassOf, maxEffectiveDiscount } from "../quotation/commercial.js";
import { listAgreements, fixedMonthly, agreedUnitPrice } from "../quotation/agreements.js";
import { groupOf, SERVICES_GROUP } from "../quotation/productGroups.js";
import { slabIndex, slabLabel } from "../quotation/slabs.js";
import { periodOf, periodLabel, addMonths, monthsBetween, expectedUsage, reconcileUsage, milestoneItems } from "./engine.js";

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round(n(v) * 100) / 100;
const iso = (d) => String(d || "").slice(0, 10);
const sum = (arr, f) => arr.reduce((s, x) => s + n(f(x)), 0);
const by = (arr, keyOf) => { const m = new Map(); for (const x of arr) { const k = keyOf(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
const col = (key, label, type = "text") => ({ key, label, type });

// ── shared helpers ───────────────────────────────────────────────────
const inRange = (ctx, period) => (!ctx.from || period >= ctx.from) && (!ctx.to || period <= ctx.to);
const liveQuotes = (ctx) => (ctx.quotes || []).filter((q) => q && !q.isDeleted);
const quotesInRange = (ctx) => liveQuotes(ctx).filter((q) => inRange(ctx, periodOf(q.createdDate)));
export const customerOf = (ctx, q) => (ctx.accounts || []).find((a) => a.id === q.accountId)?.name || q.hans?.party?.name || q.legalName || q.agreement?.customer || "—";
const userOf = (ctx, id) => (ctx.users || []).find((u) => u.id === id)?.name || id || "—";
const overallOf = (q) => Math.min(100, Math.max(0, n(q.hans?.overallDiscountPct)));
/** Committed value of a quote, before GST (₹). Variable lines are not in it. */
export function quoteCommitted(q) {
  if (q.hans && q.hans.taxableBase != null) return n(q.hans.taxableBase);
  return r2((n(q.total) - n(q.taxAmount)) * 1e5);          // older quotes keep ₹ lakh
}
const quoteEstimate = (q) => n(q.hans?.variableEstimate);
/** Product name of a price-row code. */
export function productOf(ctx, code) {
  const row = (ctx.priceRows || []).find((r) => r.code === code);
  if (!row) return "Other";
  const gid = groupOf(row, ctx.catalog || []);
  if (gid === SERVICES_GROUP) return "Services & add-ons";
  return (ctx.catalog || []).find((p) => p.id === gid)?.name || "Other";
}
/** A quote's lines as { product, class, committed, estimate } (overall discount applied). */
function quoteParts(ctx, q) {
  if (!q.hans) return [{ product: q.product || "Other (custom quote)", cls: "custom", committed: quoteCommitted(q), estimate: 0, name: q.title || "" }];
  const o = 1 - overallOf(q) / 100;
  return (q.items || []).map((l) => ({ product: productOf(ctx, l.productCode), cls: billingClassOf(l), committed: n(l.lineTotal) * o, estimate: n(l.lineEstimate) * o, name: l.name, code: l.productCode }));
}
const agreementsOf = (ctx) => listAgreements(liveQuotes(ctx), ctx.today);
const finalInvoices = (ctx) => (ctx.invoices || []).filter((i) => i && i.status === "final");
const invoiceLines = (ctx) => finalInvoices(ctx).filter((i) => i.type !== "credit" && inRange(ctx, i.period)).flatMap((i) => (i.lines || []).map((l) => ({ ...l, invoice: i })));
const approvedUsage = (ctx) => (ctx.usage || []).filter((r) => r && r.status === "approved" && inRange(ctx, r.period));
const quoteById = (ctx, id) => liveQuotes(ctx).find((q) => q.id === id);
const lineOf = (ctx, quoteId, code) => quoteById(ctx, quoteId)?.agreement?.lines?.find((l) => l.code === code) || null;
const monthsIn = (ctx) => { if (!ctx.from || !ctx.to) return []; const k = monthsBetween(ctx.from, ctx.to); return k < 0 || k > 60 ? [] : Array.from({ length: k + 1 }, (_, i) => addMonths(ctx.from, i)); };

// ── 1. Quotations generated ──────────────────────────────────────────
function quotesGenerated(ctx) {
  const qs = quotesInRange(ctx);
  const rows = [];
  const add = (group, name, list, committed, estimate) => rows.push({ group, name, quotes: list, committed: r2(committed), estimate: r2(estimate) });
  for (const [k, list] of by(qs, (q) => customerOf(ctx, q))) add("Customer", k, list.length, sum(list, quoteCommitted), sum(list, quoteEstimate));
  const parts = qs.flatMap((q) => quoteParts(ctx, q).map((p) => ({ ...p, q })));
  for (const [k, list] of by(parts, (p) => p.product)) add("Product", k, new Set(list.map((p) => p.q.id)).size, sum(list, (p) => p.committed), sum(list, (p) => p.estimate));
  for (const [k, list] of by(qs, (q) => userOf(ctx, q.owner))) add("Sales owner", k, list.length, sum(list, quoteCommitted), sum(list, quoteEstimate));
  const order = { Customer: 0, Product: 1, "Sales owner": 2 };
  rows.sort((a, b) => order[a.group] - order[b.group] || b.committed - a.committed);
  return {
    columns: [col("group", "By"), col("name", "Name"), col("quotes", "Quotes", "num"), col("committed", "Committed value", "inr"), col("estimate", "Variable (estimate)", "inr")],
    rows, totals: { name: `${qs.length} quotations`, committed: r2(sum(qs, quoteCommitted)), estimate: r2(sum(qs, quoteEstimate)) },
    note: "Committed value is before GST and excludes usage. The variable column is the internal estimate from expected volumes, not a commitment.",
  };
}

// ── 2. Pending approval ──────────────────────────────────────────────
function pendingApproval(ctx) {
  const rows = liveQuotes(ctx).filter((q) => q.approvalStatus === "Pending").map((q) => ({
    quoteNo: q.quoteNo || q.id, customer: customerOf(ctx, q), owner: userOf(ctx, q.owner), level: q.hans?.approvalLevel?.label || "Approver",
    discount: q.hans ? maxEffectiveDiscount(q.items, overallOf(q)) : n(q.discountPct), committed: r2(quoteCommitted(q)),
    since: iso(q.approvalRequestedAt || q.createdDate), days: Math.max(0, Math.round((Date.parse(`${iso(ctx.today)}T00:00:00Z`) - Date.parse(`${iso(q.approvalRequestedAt || q.createdDate)}T00:00:00Z`)) / 86400000)) || 0,
    reason: (q.hans?.approvalReasons || []).join("; "),
  })).sort((a, b) => b.days - a.days);
  return { columns: [col("quoteNo", "Quotation"), col("customer", "Customer"), col("owner", "Sales owner"), col("level", "Needs"), col("discount", "Largest discount", "pct"), col("committed", "Committed value", "inr"), col("since", "Waiting since", "date"), col("days", "Days", "num"), col("reason", "Why")],
    rows, totals: { quoteNo: `${rows.length} waiting`, committed: r2(sum(rows, (r) => r.committed)) }, note: "All quotations awaiting approval now (not limited to the date range)." };
}

// ── 3. Won, lost, expired ────────────────────────────────────────────
function wonLostExpired(ctx) {
  const qs = quotesInRange(ctx);
  const label = { Accepted: "Won (accepted)", Rejected: "Lost (rejected)", Expired: "Expired" };
  const rows = ["Accepted", "Rejected", "Expired"].map((s) => { const list = qs.filter((q) => q.status === s); return { outcome: label[s], quotes: list.length, committed: r2(sum(list, quoteCommitted)), estimate: r2(sum(list, quoteEstimate)) }; });
  const open = qs.filter((q) => !label[q.status] && q.status !== "Revised");
  rows.push({ outcome: "Still open (draft, sent, under review)", quotes: open.length, committed: r2(sum(open, quoteCommitted)), estimate: r2(sum(open, quoteEstimate)) });
  const decided = rows[0].quotes + rows[1].quotes + rows[2].quotes;
  return { columns: [col("outcome", "Outcome"), col("quotes", "Quotes", "num"), col("committed", "Committed value", "inr"), col("estimate", "Variable (estimate)", "inr")], rows,
    totals: { outcome: `Win rate ${decided ? Math.round((rows[0].quotes / decided) * 100) : 0}% of ${decided} decided`, quotes: qs.filter((q) => q.status !== "Revised").length },
    note: "By the date the quotation was created. Superseded (revised) versions are not counted." };
}

// ── 4. Product-wise quoted value ─────────────────────────────────────
function productQuotedValue(ctx) {
  const parts = quotesInRange(ctx).filter((q) => q.status !== "Revised").flatMap((q) => quoteParts(ctx, q).map((p) => ({ ...p, q })));
  const rows = [...by(parts, (p) => p.product)].map(([product, list]) => ({
    product, quotes: new Set(list.map((p) => p.q.id)).size,
    recurring: r2(sum(list.filter((p) => p.cls === "subscription" || p.cls === "transaction"), (p) => p.committed)),
    oneTime: r2(sum(list.filter((p) => p.cls === "one_time"), (p) => p.committed)),
    custom: r2(sum(list.filter((p) => p.cls === "custom"), (p) => p.committed)),
    variable: r2(sum(list, (p) => p.estimate)),
  })).sort((a, b) => (b.recurring + b.oneTime + b.custom) - (a.recurring + a.oneTime + a.custom));
  return { columns: [col("product", "Product"), col("quotes", "Quotes", "num"), col("recurring", "Fixed recurring (committed)", "inr"), col("oneTime", "One-time", "inr"), col("custom", "Custom quotes", "inr"), col("variable", "Variable (estimate)", "inr")], rows,
    totals: { product: "All products", recurring: r2(sum(rows, (r) => r.recurring)), oneTime: r2(sum(rows, (r) => r.oneTime)), custom: r2(sum(rows, (r) => r.custom)), variable: r2(sum(rows, (r) => r.variable)) },
    note: "Fixed recurring covers the quoted term, including contractual minimums on usage lines." };
}

// ── 5. Fixed recurring revenue ───────────────────────────────────────
function fixedRecurring(ctx) {
  const lines = invoiceLines(ctx).filter((l) => l.billingClass === "subscription");
  const minimums = invoiceLines(ctx).filter((l) => l.billingClass === "transaction").flatMap((l) => (l.calc?.months || []).filter((m) => m.minimumApplied).map((m) => ({ quoteId: l.invoice.quoteId, amount: m.minimum })));
  const rows = agreementsOf(ctx).filter((x) => x.status === "Active").map(({ quote, agreement: a }) => ({
    customer: customerOf(ctx, quote), agreement: a.agreementNo, from: a.startDate, to: a.endDate, monthly: fixedMonthly(a), yearly: r2(fixedMonthly(a) * 12),
    invoiced: r2(sum(lines.filter((l) => l.invoice.quoteId === quote.id), (l) => l.amount) + sum(minimums.filter((m) => m.quoteId === quote.id), (m) => m.amount)),
  })).filter((r) => r.monthly > 0 || r.invoiced > 0).sort((a, b) => b.monthly - a.monthly);
  return { columns: [col("customer", "Customer"), col("agreement", "Agreement"), col("from", "From", "date"), col("to", "To", "date"), col("monthly", "Committed per month", "inr"), col("yearly", "Per year", "inr"), col("invoiced", "Fixed invoiced in range", "inr")], rows,
    totals: { customer: `${rows.length} active agreements`, monthly: r2(sum(rows, (r) => r.monthly)), yearly: r2(sum(rows, (r) => r.yearly)), invoiced: r2(sum(rows, (r) => r.invoiced)) },
    note: "Committed recurring revenue: subscriptions plus contractual minimums under agreements in force today. Usage above a minimum is in the transaction report." };
}

// ── 6. Actual transaction-based revenue ──────────────────────────────
function transactionRevenue(ctx) {
  const lines = invoiceLines(ctx).filter((l) => l.billingClass === "transaction");
  const rows = [...by(lines, (l) => `${l.invoice.quoteId}|${l.code}`)].map(([, list]) => {
    const q = quoteById(ctx, list[0].invoice.quoteId);
    const months = list.flatMap((l) => l.calc?.months || []);
    return { customer: q ? customerOf(ctx, q) : list[0].invoice.customer || "—", product: productOf(ctx, list[0].code), component: list[0].name, unit: list[0].unit,
      qty: r2(sum(months, (m) => m.qty)), amount: r2(sum(list, (l) => l.amount)), minimums: months.filter((m) => m.minimumApplied).length, months: months.length };
  }).sort((a, b) => b.amount - a.amount);
  return { columns: [col("customer", "Customer"), col("product", "Product"), col("component", "Component"), col("unit", "Unit"), col("qty", "Actual volume", "num"), col("amount", "Invoiced", "inr"), col("months", "Months billed", "num"), col("minimums", "Months at minimum", "num")], rows,
    totals: { customer: "All", qty: r2(sum(rows, (r) => r.qty)), amount: r2(sum(rows, (r) => r.amount)) }, note: "From final invoices in the range: actual consumption at the agreed rates. This revenue is not committed in advance." };
}

// ── 7. One-time project revenue ──────────────────────────────────────
function oneTimeRevenue(ctx) {
  const inv = finalInvoices(ctx).filter((i) => i.type !== "credit" && String(i.cycle).startsWith("milestone-"));
  const rows = agreementsOf(ctx).filter((x) => x.status !== "Cancelled").map(({ quote, agreement: a }) => {
    const ms = milestoneItems(quote, ctx.invoices || []);
    const total = r2(sum(ms, (m) => m.amount));
    const invoiced = r2(sum(inv.filter((i) => i.quoteId === quote.id), (i) => i.taxable));
    return { customer: customerOf(ctx, quote), agreement: a.agreementNo, total, invoiced, inRange: r2(sum(inv.filter((i) => i.quoteId === quote.id && inRange(ctx, i.period)), (i) => i.taxable)), remaining: r2(total - invoiced),
      milestones: ms.map((m) => `${m.pct}% ${m.invoiced ? "invoiced" : "open"}`).join(", ") };
  }).filter((r) => r.total > 0).sort((a, b) => b.remaining - a.remaining);
  return { columns: [col("customer", "Customer"), col("agreement", "Agreement"), col("total", "One-time agreed", "inr"), col("invoiced", "Invoiced to date", "inr"), col("inRange", "Invoiced in range", "inr"), col("remaining", "Still to invoice", "inr"), col("milestones", "Milestones")], rows,
    totals: { customer: "All", total: r2(sum(rows, (r) => r.total)), invoiced: r2(sum(rows, (r) => r.invoiced)), inRange: r2(sum(rows, (r) => r.inRange)), remaining: r2(sum(rows, (r) => r.remaining)) }, note: "Implementation, licences and other one-time charges of accepted quotations, billed by milestone." };
}

// ── 8 and 9. Consumption by customer / by product, month by month ────
function consumption(ctx, keyOf, firstCols) {
  const months = monthsIn(ctx);
  const recs = approvedUsage(ctx);
  const rows = [...by(recs, keyOf)].map(([, list]) => {
    const q = quoteById(ctx, list[0].quoteId), line = lineOf(ctx, list[0].quoteId, list[0].lineCode);
    const row = { customer: q ? customerOf(ctx, q) : "—", product: productOf(ctx, list[0].lineCode), component: line?.name || list[0].lineCode, unit: line?.unit || "", total: r2(sum(list, (r) => r.quantity)) };
    months.forEach((m) => { row[m] = r2(sum(list.filter((r) => r.period === m), (r) => r.quantity)); });
    return row;
  }).sort((a, b) => b.total - a.total);
  const totals = { [firstCols[0].key]: "All", total: r2(sum(rows, (r) => r.total)) };
  months.forEach((m) => { totals[m] = r2(sum(rows, (r) => r[m])); });
  return { columns: [...firstCols, col("unit", "Unit"), ...months.map((m) => col(m, periodLabel(m), "num")), col("total", "Total", "num")], rows, totals, note: "Approved usage only. Totals across different units are for reference." };
}
const customerConsumption = (ctx) => consumption(ctx, (r) => `${r.quoteId}|${r.lineCode}`, [col("customer", "Customer"), col("component", "Component")]);
const productVolumes = (ctx) => consumption(ctx, (r) => r.lineCode, [col("product", "Product"), col("component", "Component")]);

// ── 10. Average transaction rate ─────────────────────────────────────
function averageRate(ctx) {
  const lines = invoiceLines(ctx).filter((l) => l.billingClass === "transaction");
  const agreed = agreementsOf(ctx).filter((x) => x.status === "Active").flatMap((x) => x.agreement.lines.filter((l) => l.billingClass === "transaction"));
  const codes = [...new Set([...lines.map((l) => l.code), ...agreed.map((l) => l.code)])];
  const rows = codes.map((code) => {
    const mine = lines.filter((l) => l.code === code), ag = agreed.filter((l) => l.code === code);
    const qty = sum(mine.flatMap((l) => l.calc?.months || []), (m) => m.qty), amount = sum(mine, (l) => l.amount);
    const rates = ag.map((l) => agreedUnitPrice(l, l.qty)).filter((v) => v > 0);
    const row = (ctx.priceRows || []).find((r) => r.code === code);
    return { product: productOf(ctx, code), component: mine[0]?.name || ag[0]?.name || code, unit: mine[0]?.unit || ag[0]?.unit || "", customers: ag.length,
      list: row && row.rateSource !== "Slab" && row.listPrice != null ? n(row.listPrice) : null, agreedLow: rates.length ? Math.min(...rates) : null, agreedHigh: rates.length ? Math.max(...rates) : null,
      qty: r2(qty), amount: r2(amount), average: qty > 0 ? r2(amount / qty) : null };
  }).sort((a, b) => b.amount - a.amount);
  return { columns: [col("product", "Product"), col("component", "Component"), col("unit", "Unit"), col("customers", "Agreements", "num"), col("list", "List rate", "inr2"), col("agreedLow", "Lowest agreed", "inr2"), col("agreedHigh", "Highest agreed", "inr2"), col("qty", "Volume billed", "num"), col("amount", "Invoiced", "inr"), col("average", "Average realised rate", "inr2")], rows, totals: null,
    note: "Average realised rate = invoiced amount ÷ actual volume, so it includes minimum billing and slab effects." };
}

// ── 11. Slab-wise customer distribution ──────────────────────────────
function slabDistribution(ctx) {
  const month = ctx.to || periodOf(ctx.today);
  const out = new Map();
  for (const { quote, agreement: a, status } of agreementsOf(ctx)) {
    if (status !== "Active") continue;
    for (const l of a.lines) {
      if (l.pricing?.rateSource !== "Slab") continue;
      const recs = (ctx.usage || []).filter((r) => r.status === "approved" && r.quoteId === quote.id && r.lineCode === l.code && r.period === month);
      const qty = recs.length ? sum(recs, (r) => r.quantity) : null;
      const basis = qty == null ? n(l.qty) : qty;
      const i = slabIndex(basis * (l.pricing.slabPeriod === "year" ? 12 : 1), l.pricing.slabs);
      const k = `${l.code}|${i}`;
      if (!out.has(k)) out.set(k, { product: productOf(ctx, l.code), component: l.name, slab: slabLabel(l.pricing.slabs, i, l.unit), rate: n(l.pricing.slabs.slice().sort((x, y) => n(x.from) - n(y.from))[i]?.rate), order: i, customers: 0, names: [], volume: 0, estimated: 0 });
      const o = out.get(k); o.customers++; o.names.push(customerOf(ctx, quote)); o.volume = r2(o.volume + basis); if (qty == null) o.estimated++;
    }
  }
  const rows = [...out.values()].sort((a, b) => a.component.localeCompare(b.component) || a.order - b.order).map((o) => ({ ...o, names: o.names.join(", ") }));
  return { columns: [col("product", "Product"), col("component", "Component"), col("slab", "Slab"), col("rate", "Slab rate", "inr2"), col("customers", "Customers", "num"), col("volume", "Volume", "num"), col("estimated", "On expected volume", "num"), col("names", "Who")], rows, totals: { product: `${sum(rows, (r) => r.customers)} customer lines` },
    note: `Slab each customer falls in for ${periodLabel(month)}, on approved usage. Where a month has no usage yet, the expected volume from the agreement is used and counted in the "on expected volume" column.` };
}

// ── 12. Discounts and exceptions ─────────────────────────────────────
function discountsExceptions(ctx) {
  const rows = quotesInRange(ctx).map((q) => ({ q, discount: q.hans ? maxEffectiveDiscount(q.items, overallOf(q)) : n(q.discountPct) }))
    .filter(({ q, discount }) => discount > 0 || (q.hans?.approvalReasons || []).length || ["Pending", "Approved", "Rejected"].includes(q.approvalStatus))
    .map(({ q, discount }) => ({ quoteNo: q.quoteNo || q.id, customer: customerOf(ctx, q), owner: userOf(ctx, q.owner), discount, committed: r2(quoteCommitted(q)), level: q.hans?.approvalLevel?.label || "",
      status: q.approvalStatus || "Not Required", approver: q.approvedBy ? userOf(ctx, q.approvedBy) : "", decided: iso(q.approvedAt), reason: q.approvalStatus === "Rejected" ? q.rejectedReason || "" : q.approvalNotes || "", exception: (q.hans?.approvalReasons || []).join("; ") }))
    .sort((a, b) => b.discount - a.discount);
  return { columns: [col("quoteNo", "Quotation"), col("customer", "Customer"), col("owner", "Sales owner"), col("discount", "Largest discount", "pct"), col("committed", "Committed value", "inr"), col("level", "Level"), col("status", "Approval"), col("approver", "Decided by"), col("decided", "On", "date"), col("reason", "Approver's reason"), col("exception", "Exception")], rows,
    totals: { quoteNo: `${rows.length} quotations`, committed: r2(sum(rows, (r) => r.committed)) }, note: "Largest discount = line discount and overall discount combined, once." };
}

// ── 13. Quoted versus invoiced ───────────────────────────────────────
function quotedVsInvoiced(ctx) {
  const inv = finalInvoices(ctx);
  const rows = agreementsOf(ctx).filter((x) => x.status !== "Cancelled").map(({ quote, agreement: a, status }) => {
    const mine = inv.filter((i) => i.quoteId === quote.id);
    const lines = mine.filter((i) => i.type !== "credit").flatMap((i) => i.lines || []);
    const credits = r2(sum(mine.filter((i) => i.type === "credit"), (i) => i.taxable));
    const usageMonths = lines.filter((l) => l.billingClass === "transaction").flatMap((l) => l.calc?.months || []).length;
    const variableLines = a.lines.filter((l) => l.billingClass === "transaction");
    const estMonthly = variableLines.length ? n(quote.hans?.variableEstimateMonthly) : 0;
    const variable = r2(sum(lines.filter((l) => l.billingClass === "transaction"), (l) => l.amount));
    const estBilled = r2(estMonthly * (variableLines.length ? usageMonths / variableLines.length : 0));
    return { customer: customerOf(ctx, quote), agreement: a.agreementNo, status, committed: r2(quoteCommitted(quote)),
      fixed: r2(sum(lines.filter((l) => l.billingClass === "subscription"), (l) => l.amount)), oneTime: r2(sum(lines.filter((l) => l.billingClass === "one_time"), (l) => l.amount)),
      variable, estimate: estBilled, variance: r2(variable - estBilled), credits, invoiced: r2(sum(lines, (l) => l.amount) + credits) };
  }).sort((a, b) => b.invoiced - a.invoiced);
  const t = (k) => r2(sum(rows, (r) => r[k]));
  return { columns: [col("customer", "Customer"), col("agreement", "Agreement"), col("status", "Status"), col("committed", "Quoted (committed)", "inr"), col("fixed", "Fixed invoiced", "inr"), col("oneTime", "One-time invoiced", "inr"), col("variable", "Usage invoiced", "inr"), col("estimate", "Usage expected for those months", "inr"), col("variance", "Usage vs expected", "inr"), col("credits", "Credit notes", "inr"), col("invoiced", "Net invoiced", "inr")], rows,
    totals: { customer: "All", committed: t("committed"), fixed: t("fixed"), oneTime: t("oneTime"), variable: t("variable"), estimate: t("estimate"), variance: t("variance"), credits: t("credits"), invoiced: t("invoiced") },
    note: "Invoiced to date, before GST. Usage is compared with the expected volume recorded on the quotation, for the months billed so far." };
}

// ── 14. Usage versus billing reconciliation ──────────────────────────
function usageVsBilling(ctx) {
  const months = monthsIn(ctx);
  const billed = new Map();
  for (const i of finalInvoices(ctx).filter((x) => x.type !== "credit")) for (const l of i.lines || []) for (const m of l.calc?.months || []) if (l.billingClass === "transaction") billed.set(`${i.quoteId}|${l.code}|${m.period}`, { qty: n(m.qty), amount: n(m.amount), invoiceNo: i.invoiceNo });
  const rows = [];
  for (const month of months) {
    for (const { quote, agreement: a, line } of expectedUsage(liveQuotes(ctx), month)) {
      const recs = (ctx.usage || []).filter((r) => r.quoteId === quote.id && r.lineCode === line.code && r.period === month);
      const rec = reconcileUsage(recs, [{ quoteId: quote.id, lineCode: line.code, period: month }]);
      const k = `${quote.id}|${line.code}|${month}`;
      const usage = rec.totals[k], b = billed.get(k);
      const state = b ? (usage != null && Math.abs(usage - b.qty) > 0.0001 ? "Mismatch: usage changed after invoicing" : "Billed") : usage == null ? (recs.some((r) => r.status === "draft") ? "Awaiting approval" : "Usage missing") : rec.ready ? "Ready to bill" : "Blocked";
      rows.push({ month: periodLabel(month), customer: customerOf(ctx, quote), agreement: a.agreementNo, component: line.name, unit: line.unit, usage: usage ?? null, billedQty: b ? b.qty : null, difference: b && usage != null ? r2(usage - b.qty) : null,
        amount: b ? r2(b.amount) : null, invoice: b?.invoiceNo || "", state, issues: rec.issues.filter((i) => i.level !== "info").map((i) => i.type.replace("_", " ")).join(", "), entries: recs.filter((r) => r.status !== "void").length, voided: recs.filter((r) => r.status === "void").length });
    }
  }
  const count = (s) => rows.filter((r) => r.state.startsWith(s)).length;
  return { columns: [col("month", "Month"), col("customer", "Customer"), col("agreement", "Agreement"), col("component", "Component"), col("unit", "Unit"), col("usage", "Approved usage", "num"), col("billedQty", "Billed quantity", "num"), col("difference", "Difference", "num"), col("amount", "Billed amount", "inr"), col("invoice", "Invoice"), col("state", "State"), col("issues", "Issues"), col("entries", "Entries", "num"), col("voided", "Voided", "num")], rows,
    totals: { month: `${rows.length} line-months`, state: `${count("Billed")} billed · ${count("Ready")} ready · ${count("Usage missing") + count("Awaiting")} waiting for usage · ${count("Mismatch")} mismatch` },
    note: "Every usage-billed component for every month in the range: what was used, what was billed, and whether they agree." };
}

// ── 15. Renewals and pricing revisions ───────────────────────────────
function renewalsRevisions(ctx) {
  const today = iso(ctx.today);
  const horizon = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 90); return d.toISOString().slice(0, 10); })();
  const rows = [];
  const all = agreementsOf(ctx);
  for (const { quote, agreement: a, status } of all) {
    if (status === "Active" && a.endDate && a.endDate <= horizon) rows.push({ type: a.endDate < today ? "Renewal overdue" : "Renewal due", date: a.endDate, customer: customerOf(ctx, quote), ref: a.agreementNo, detail: `Term ends ${a.endDate}; ${Math.round((Date.parse(`${a.endDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)} days`, monthly: fixedMonthly(a), by: userOf(ctx, quote.owner) });
    if (a.amends && inRange(ctx, periodOf(a.startDate))) {
      const prev = all.find((x) => x.quote.id === a.amends);
      rows.push({ type: "Amendment", date: a.startDate, customer: customerOf(ctx, quote), ref: a.agreementNo, detail: prev ? `Replaces ${prev.agreement.agreementNo}: fixed per month ₹${Math.round(fixedMonthly(prev.agreement)).toLocaleString("en-IN")} → ₹${Math.round(fixedMonthly(a)).toLocaleString("en-IN")}` : "Revised terms accepted", monthly: fixedMonthly(a), by: userOf(ctx, quote.owner) });
    }
  }
  for (const q of liveQuotes(ctx)) for (const c of q.changeLog || []) if (c.field === "pricing" && inRange(ctx, periodOf(c.at))) rows.push({ type: "Quotation re-priced", date: iso(c.at), customer: customerOf(ctx, q), ref: q.quoteNo || q.id, detail: c.note || "Re-priced from the price list", monthly: null, by: userOf(ctx, c.by) });
  for (const h of ctx.history || []) {
    if (h.section !== "price" || !inRange(ctx, periodOf(h.changed_at))) continue;
    const b = h.before || {}, a = h.after || {};
    const what = h.change === "added" ? `Added${a.listPrice != null ? ` at ₹${n(a.listPrice).toLocaleString("en-IN")}` : ""}` : h.change === "removed" ? "Removed"
      : JSON.stringify(b.listPrice) !== JSON.stringify(a.listPrice) ? `List price ₹${b.listPrice ?? "—"} → ₹${a.listPrice ?? "—"}` : JSON.stringify(b.slabs) !== JSON.stringify(a.slabs) ? "Slabs changed" : "Settings changed";
    rows.push({ type: "Price list revision", date: iso(h.changed_at), customer: "", ref: h.item_code || "", detail: `${h.item_name || ""}: ${what}`, monthly: null, by: userOf(ctx, h.changed_by) });
  }
  const order = { "Renewal overdue": 0, "Renewal due": 1, Amendment: 2, "Quotation re-priced": 3, "Price list revision": 4 };
  rows.sort((x, y) => order[x.type] - order[y.type] || String(x.date).localeCompare(String(y.date)));
  return { columns: [col("type", "What"), col("date", "Date", "date"), col("customer", "Customer"), col("ref", "Reference"), col("detail", "Detail"), col("monthly", "Fixed per month", "inr"), col("by", "By / owner")], rows,
    totals: { type: `${rows.filter((r) => r.type.startsWith("Renewal")).length} renewals in 90 days · ${rows.filter((r) => r.type === "Amendment").length} amendments · ${rows.filter((r) => r.type === "Price list revision").length} price revisions` },
    note: "Renewals: agreements in force whose term ends within 90 days of today (or already ended). Amendments, re-pricing and price-list revisions: within the date range." };
}

export const REPORTS = [
  { id: "quotes-generated", group: "Quotations", title: "Quotations by customer, product and sales owner", run: quotesGenerated },
  { id: "pending-approval", group: "Quotations", title: "Quotations pending approval", run: pendingApproval },
  { id: "won-lost-expired", group: "Quotations", title: "Quotations won, lost and expired", run: wonLostExpired },
  { id: "product-quoted", group: "Quotations", title: "Product-wise quoted value", run: productQuotedValue },
  { id: "discounts", group: "Quotations", title: "Discounts and exceptions", run: discountsExceptions },
  { id: "fixed-recurring", group: "Revenue", title: "Fixed recurring revenue", run: fixedRecurring },
  { id: "transaction-revenue", group: "Revenue", title: "Actual transaction-based revenue", run: transactionRevenue },
  { id: "one-time", group: "Revenue", title: "One-time project revenue", run: oneTimeRevenue },
  { id: "quoted-vs-invoiced", group: "Revenue", title: "Quoted versus actual invoiced revenue", run: quotedVsInvoiced },
  { id: "customer-consumption", group: "Usage", title: "Customer-wise monthly consumption", run: customerConsumption },
  { id: "product-volumes", group: "Usage", title: "Product-wise transaction volumes", run: productVolumes },
  { id: "average-rate", group: "Usage", title: "Average transaction rate", run: averageRate },
  { id: "slab-distribution", group: "Usage", title: "Slab-wise customer distribution", run: slabDistribution },
  { id: "usage-vs-billing", group: "Usage", title: "Usage versus billing reconciliation", run: usageVsBilling },
  { id: "renewals", group: "Agreements", title: "Contract renewals and pricing revisions", run: renewalsRevisions },
];

export const runReport = (id, ctx) => { const r = REPORTS.find((x) => x.id === id); return r ? { ...r, ...r.run(ctx) } : null; };

/** Cell as text, for the screen and for CSV. */
export function formatCell(value, type, { csv = false } = {}) {
  if (value === null || value === undefined || value === "") return "";
  if (type === "inr") return csv ? String(Math.round(n(value))) : `${n(value) < 0 ? "− " : ""}₹${Math.abs(Math.round(n(value))).toLocaleString("en-IN")}`;
  if (type === "inr2") return csv ? String(r2(value)) : `₹${n(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  if (type === "pct") return `${r2(value)}%`;
  if (type === "num") return csv ? String(r2(value)) : n(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (type === "date") { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value)); return m && !csv ? `${m[3]} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m[2] - 1]} ${m[1]}` : String(value); }
  return String(value);
}

/** The report as CSV text (with a totals row when there is one). */
export function reportCsv(report) {
  const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = report.columns.map((c) => esc(c.label)).join(",");
  const line = (row) => report.columns.map((c) => esc(formatCell(row[c.key], c.type, { csv: true }))).join(",");
  return [head, ...report.rows.map(line), ...(report.totals ? [line(report.totals)] : [])].join("\n");
}
