// Billing Engine (specification of 20 Nov 2026, Phase C).
//
// Invoices are worked out from the customer's AGREEMENT (the accepted quote's
// frozen lines, lib/quotation/agreements.js), never from a quote total:
//   • Fixed recurring lines: billed in advance, per the agreement's billing
//     frequency, prorated for a part month, with any yearly escalation.
//   • Variable lines: billed in arrears on APPROVED actual usage, each month
//     priced on the agreed rate or slabs and never below the agreed minimum.
//   • One-time lines: billed by payment milestone.
// The same functions price a quote and an invoice (monthlyCharge → usagePrice),
// so the two cannot disagree. A line-month is never billed twice.
// Pure — tested in scripts/test-billing.mjs.
import { monthlyCharge, agreedUnitPrice } from "../quotation/agreements.js";
import { slabIndex, slabLabel } from "../quotation/slabs.js";
import { computeGst } from "../quotation/pricingEngine.js";

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round(n(v) * 100) / 100;
const iso = (d) => String(d || "").slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ── Periods ("YYYY-MM") ──────────────────────────────────────────────
export const periodOf = (date) => iso(date).slice(0, 7);
export const isPeriod = (p) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(p || ""));
export function addMonths(period, k) {
  const [y, m] = String(period).split("-").map(Number);
  const t = y * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export function monthsBetween(a, b) {
  const [ya, ma] = String(a).split("-").map(Number), [yb, mb] = String(b).split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
export const daysInPeriod = (p) => { const [y, m] = String(p).split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const periodStart = (p) => `${p}-01`;
export const periodEnd = (p) => `${p}-${String(daysInPeriod(p)).padStart(2, "0")}`;
export const periodLabel = (p) => { const [y, m] = String(p).split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };
const rangeLabel = (a, b) => (a === b ? periodLabel(a) : `${periodLabel(a)} – ${periodLabel(b)}`);

export const FREQUENCY_MONTHS = { Monthly: 1, Quarterly: 3, "Half-Yearly": 6, Annual: 12 };
const freqMonths = (f) => FREQUENCY_MONTHS[f] || 1;

/**
 * How an agreement is billed. Defaults: subscriptions at the quote's billing
 * frequency (in advance), usage monthly (in arrears), one invoice per period,
 * part months prorated. agreement.billing overrides any of these.
 */
export function billingSettings(agreement) {
  const b = agreement?.billing || {};
  return {
    subscriptionFrequency: FREQUENCY_MONTHS[b.subscriptionFrequency] ? b.subscriptionFrequency : (FREQUENCY_MONTHS[agreement?.billingFrequency] ? agreement.billingFrequency : "Monthly"),
    usageFrequency: FREQUENCY_MONTHS[b.usageFrequency] ? b.usageFrequency : "Monthly",
    separateUsageInvoice: !!b.separateUsageInvoice,
    prorate: b.prorate !== false,
  };
}

/** A line's term, clipped when a later accepted revision takes over. */
export function lineTerm(line, supersededFrom = "") {
  const from = iso(line.effectiveFrom);
  let to = iso(line.effectiveTo);
  if (supersededFrom) {
    const d = new Date(`${iso(supersededFrom)}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1);
    const cut = d.toISOString().slice(0, 10);
    if (!to || cut < to) to = cut;
  }
  return { from, to };
}

/** Share of a calendar month a term covers (1 = the whole month, 0 = none). */
export function activeFraction(term, period, prorate = true) {
  const s = periodStart(period), e = periodEnd(period);
  if (!term.from || term.from > e || (term.to && term.to < s)) return 0;
  if (!prorate) return 1;
  const from = term.from > s ? term.from : s;
  const to = term.to && term.to < e ? term.to : e;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 + 1;
  return Math.max(0, Math.min(1, days / daysInPeriod(period)));
}

/** Escalation factor for a month: +x% from each anniversary of the line's start. */
export function escalationFactor(line, period) {
  const pct = n(line.escalationPct);
  if (!pct) return 1;
  // A plan amendment keeps the contract's anniversary (escalationFrom); otherwise the line's own start.
  const years = Math.floor(Math.max(0, monthsBetween(periodOf(line.escalationFrom || line.effectiveFrom), period)) / 12);
  return Math.pow(1 + pct / 100, years);
}

/** When the agreement of `quote` is superseded: the start of the earliest later accepted revision. */
export function supersededFrom(quote, quotes = []) {
  const later = (quotes || []).filter((q) => q && q.id !== quote.id && !q.isDeleted && q.status === "Accepted" && q.agreement
    && q.quoteNo && q.quoteNo === quote.quoteNo && n(q.version) > n(quote.version)).map((q) => iso(q.agreement.startDate)).filter(Boolean).sort();
  return later[0] || "";
}

/** Quotes whose agreement can bill in a period: [{ quote, agreement, cut }]. */
export function billableAgreements(quotes = [], period) {
  return (quotes || []).filter((q) => q && !q.isDeleted && q.status === "Accepted" && q.agreement && Array.isArray(q.agreement.lines) && q.agreement.status !== "Cancelled")
    .map((q) => ({ quote: q, agreement: q.agreement, cut: supersededFrom(q, quotes) }))
    .filter(({ agreement, cut }) => agreement.lines.some((l) => l.billingClass !== "one_time" && activeFraction(lineTerm(l, cut), period, false) > 0
      || l.billingClass === "transaction" && usageBlock(l, period, agreement, cut)));
}

// ── Usage records ────────────────────────────────────────────────────
// { id, quoteId, lineCode, period, quantity, externalRef, source, status:
//   "draft" | "approved" | "void", correctsId, note, enteredBy, enteredAt }

/** Variable lines that need usage for a month: [{ quote, agreement, line }]. */
export function expectedUsage(quotes = [], period) {
  const out = [];
  for (const { quote, agreement, cut } of (quotes || []).filter((q) => q && !q.isDeleted && q.status === "Accepted" && q.agreement).map((q) => ({ quote: q, agreement: q.agreement, cut: supersededFrom(q, quotes) }))) {
    for (const line of agreement.lines || []) {
      if (line.billingClass === "transaction" && activeFraction(lineTerm(line, cut), period, false) > 0) out.push({ quote, agreement, line });
    }
  }
  return out;
}

/**
 * Check usage before billing. `expected` = [{ quoteId, lineCode, period }].
 * Returns { totals: { "quoteId|code|period": qty }, issues: [{ level, type, … }], ready }.
 *   blocking: missing usage, records not yet approved, the same reference twice
 *   warning:  possible duplicate (same quantity, no reference), unknown component
 *   info:     corrected records (the original is void and not counted)
 */
export function reconcileUsage(records = [], expected = []) {
  const key = (r) => `${r.quoteId}|${r.lineCode}|${r.period}`;
  const live = (records || []).filter((r) => r && r.status !== "void");
  const issues = [];
  const totals = {};
  const want = new Set(expected.map(key));
  for (const r of live.filter((x) => x.status === "approved")) totals[key(r)] = r2((totals[key(r)] || 0) + n(r.quantity));
  for (const e of expected) if (!(key(e) in totals)) issues.push({ level: "blocking", type: "missing", ...e, message: `No approved usage for ${e.lineCode} in ${periodLabel(e.period)}. Enter the quantity (0 if there was none).` });
  for (const r of live.filter((x) => x.status === "draft" && want.has(key(x)))) issues.push({ level: "blocking", type: "unapproved", quoteId: r.quoteId, lineCode: r.lineCode, period: r.period, recordId: r.id, message: `${r.lineCode} ${periodLabel(r.period)}: ${n(r.quantity)} entered but not approved.` });
  const byRef = {}, byQty = {};
  for (const r of live) {
    if (!want.has(key(r))) { if (expected.length && expected.some((e) => e.quoteId === r.quoteId && e.period === r.period)) issues.push({ level: "warning", type: "unknown_line", quoteId: r.quoteId, lineCode: r.lineCode, period: r.period, recordId: r.id, message: `${r.lineCode}: usage recorded for a component that is not billable in ${periodLabel(r.period)}.` }); continue; }
    const ref = String(r.externalRef || "").trim();
    if (ref) (byRef[`${key(r)}|${ref}`] ||= []).push(r);
    else (byQty[`${key(r)}|${n(r.quantity)}`] ||= []).push(r);
  }
  for (const [k, rs] of Object.entries(byRef)) if (rs.length > 1) issues.push({ level: "blocking", type: "duplicate", quoteId: rs[0].quoteId, lineCode: rs[0].lineCode, period: rs[0].period, recordIds: rs.map((r) => r.id), message: `${rs[0].lineCode} ${periodLabel(rs[0].period)}: reference "${k.split("|").pop()}" is recorded ${rs.length} times. Void the extra.` });
  for (const rs of Object.values(byQty)) if (rs.length > 1) issues.push({ level: "warning", type: "possible_duplicate", quoteId: rs[0].quoteId, lineCode: rs[0].lineCode, period: rs[0].period, recordIds: rs.map((r) => r.id), message: `${rs[0].lineCode} ${periodLabel(rs[0].period)}: ${rs.length} entries of ${n(rs[0].quantity)} with no reference. Check they are not the same usage entered twice.` });
  for (const r of (records || []).filter((x) => x && x.correctsId && x.status !== "void")) issues.push({ level: "info", type: "corrected", quoteId: r.quoteId, lineCode: r.lineCode, period: r.period, recordId: r.id, message: `${r.lineCode} ${periodLabel(r.period)}: corrected to ${n(r.quantity)}; the earlier entry is kept as void.` });
  return { totals, issues, ready: !issues.some((i) => i.level === "blocking") };
}

/** A correction: a new approved-pending record, and the original marked void. Returns { voided, correction }. */
export function correctUsage(original, quantity, { by = "", at = "", note = "", id = "" } = {}) {
  return {
    voided: { ...original, status: "void", voidedBy: by, voidedAt: at },
    correction: { ...original, id: id || `${original.id}-c${Date.now().toString(36)}`, quantity: n(quantity), status: "draft", correctsId: original.id, note, source: "correction", enteredBy: by, enteredAt: at, approvedBy: "", approvedAt: "" },
  };
}

/** One pasted row into fields: tab-separated (from a spreadsheet) or comma-separated, where a quoted field may hold commas ("25,000"). */
function splitRow(line) {
  if (line.includes("	")) return line.split("	").map((x) => x.trim());
  const out = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Parse pasted usage: "agreement, component, period, quantity, reference" per line (comma or tab; a header row is skipped). */
export function parseUsageRows(text) {
  const rows = [], errors = [];
  String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((l, i) => {
    const c = splitRow(l);
    if (i === 0 && /agreement|component|period|quantity/i.test(l) && !/^\d/.test(c[3] || "")) return;
    const [agreementNo, lineCode, period, quantity, externalRef = ""] = c;
    const qty = Number(String(quantity || "").replace(/[, ]/g, ""));
    if (!agreementNo || !lineCode) errors.push(`Line ${i + 1}: agreement and component are required.`);
    else if (!isPeriod(period)) errors.push(`Line ${i + 1}: period "${period || ""}" must look like 2026-12.`);
    else if (!Number.isFinite(qty) || qty < 0 || String(quantity || "").trim() === "") errors.push(`Line ${i + 1}: quantity "${quantity || ""}" is not a number.`);
    else rows.push({ agreementNo, lineCode, period, quantity: qty, externalRef, lineNo: i + 1 });
  });
  return { rows, errors };
}

/** Turn parsed rows into usage records, rejecting unknown agreements / components and references already recorded. */
export function matchUsageRows(rows = [], quotes = [], existing = [], { by = "", at = "", idOf = (r, i) => `u_${Date.now().toString(36)}_${i}` } = {}) {
  const records = [], rejects = [];
  const seen = new Set((existing || []).filter((r) => r.status !== "void" && String(r.externalRef || "").trim()).map((r) => `${r.quoteId}|${r.lineCode}|${r.period}|${String(r.externalRef).trim()}`));
  rows.forEach((row, i) => {
    const q = (quotes || []).find((x) => x.agreement && (x.agreement.agreementNo === row.agreementNo || x.quoteNo === row.agreementNo) && x.status === "Accepted" && !x.isDeleted && !supersededFrom(x, quotes))
      || (quotes || []).find((x) => x.agreement && (x.agreement.agreementNo === row.agreementNo || x.quoteNo === row.agreementNo));
    if (!q) return rejects.push({ ...row, reason: `Agreement ${row.agreementNo} not found.` });
    const line = q.agreement.lines.find((l) => l.code === row.lineCode && l.billingClass === "transaction");
    if (!line) return rejects.push({ ...row, reason: `${row.lineCode} is not a usage-billed component of ${row.agreementNo}.` });
    const k = `${q.id}|${row.lineCode}|${row.period}|${String(row.externalRef).trim()}`;
    if (row.externalRef && seen.has(k)) return rejects.push({ ...row, reason: `Reference ${row.externalRef} is already recorded for ${row.lineCode} ${row.period} (duplicate).` });
    if (row.externalRef) seen.add(k);
    records.push({ id: idOf(row, i), quoteId: q.id, accountId: q.agreement.accountId || q.accountId || "", lineCode: row.lineCode, period: row.period, quantity: row.quantity, externalRef: row.externalRef || "", source: "upload", status: "draft", correctsId: "", note: "", enteredBy: by, enteredAt: at, approvedBy: "", approvedAt: "" });
  });
  return { records, rejects };
}

// ── What is due ──────────────────────────────────────────────────────

/** Months of a subscription block that starts in `period` (billed in advance), or null if nothing starts then. */
function subscriptionBlock(line, period, agreement, cut) {
  const term = lineTerm(line, cut);
  if (!term.from) return null;
  const k = freqMonths(billingSettings(agreement).subscriptionFrequency);
  const start = periodOf(term.from);
  const idx = monthsBetween(start, period);
  if (idx < 0 || idx % k !== 0) return null;
  const months = Array.from({ length: k }, (_, i) => addMonths(period, i)).filter((m) => activeFraction(term, m, false) > 0);
  return months.length ? months : null;
}

/** Months of a usage block that ends in `period` (billed in arrears), or null. */
function usageBlock(line, period, agreement, cut) {
  const term = lineTerm(line, cut);
  if (!term.from) return null;
  const k = freqMonths(billingSettings(agreement).usageFrequency);
  const start = periodOf(term.from);
  const idx = monthsBetween(start, period);
  if (idx < 0) return null;
  const blockStart = addMonths(start, Math.floor(idx / k) * k);
  const blockEnd = addMonths(blockStart, k - 1);
  const lastActive = term.to ? periodOf(term.to) : "";
  const due = lastActive && lastActive < blockEnd ? lastActive : blockEnd;   // a term that ends mid-block bills then
  if (period !== due) return null;
  const months = Array.from({ length: monthsBetween(blockStart, due) + 1 }, (_, i) => addMonths(blockStart, i)).filter((m) => activeFraction(term, m, false) > 0);
  return months.length ? months : null;
}

const billedKey = (quoteId, code, month) => `${quoteId}|${code}|${month}`;
/** Line-months already on a final invoice (credit notes and cancelled invoices do not count). */
export function billedLineMonths(invoices = []) {
  const s = new Set();
  for (const inv of invoices || []) {
    if (!inv || inv.status !== "final" || inv.type === "credit") continue;
    for (const l of inv.lines || []) for (const m of l.calc?.months || []) s.add(billedKey(inv.quoteId, l.code, m.period));
  }
  return s;
}

/**
 * Invoice lines due for one agreement in a billing period.
 * usageTotals = reconcileUsage(...).totals. Returns { fixed: [], usage: [], needs: [{ quoteId, lineCode, period }] }.
 */
export function dueLines(quote, period, usageTotals = {}, { quotes = [], invoices = [] } = {}) {
  const agreement = quote.agreement;
  const cut = supersededFrom(quote, quotes);
  const s = billingSettings(agreement);
  const billed = billedLineMonths(invoices);
  const fixed = [], usage = [], needs = [];
  for (const line of agreement.lines || []) {
    const term = lineTerm(line, cut);
    // AMC of a one-time licence (decision 21 Nov 2026): billed monthly, a
    // twelfth of the contract year's AMC each month, whatever the subscription
    // frequency; a part month at the anniversary is prorated.
    if (line.isAmc) {
      const fraction = activeFraction(term, period, s.prorate);
      if (!(fraction > 0) || billed.has(billedKey(quote.id, line.code, period))) continue;
      const monthly = (n(line.amcAmount) || n(line.netRate) * 12) / 12;
      const amount = r2(monthly * fraction);
      fixed.push({
        code: line.code, name: line.name, billingClass: "subscription", unit: "Month", qty: 1, rate: r2(monthly),
        description: `${line.name}: ${periodLabel(period)}${fraction < 1 ? " (part month prorated)" : ""}`,
        amount, calc: { basis: "Annual maintenance, billed monthly", monthly: r2(monthly), months: [{ period, fraction: r2(fraction * 10000) / 10000, factor: 1, amount }] },
      });
      continue;
    }
    if (line.billingClass === "subscription") {
      const months = (subscriptionBlock(line, period, agreement, cut) || []).filter((m) => !billed.has(billedKey(quote.id, line.code, m)));
      if (!months.length) continue;
      const base = monthlyCharge(line).amount;
      const detail = months.map((m) => { const fraction = activeFraction(term, m, s.prorate), factor = escalationFactor(line, m); return { period: m, fraction: r2(fraction * 10000) / 10000, factor: r2(factor * 10000) / 10000, amount: r2(base * fraction * factor) }; });
      const amount = r2(detail.reduce((t, d) => t + d.amount, 0));
      fixed.push({
        code: line.code, name: line.name, billingClass: "subscription", unit: line.unit, qty: n(line.qty), rate: agreedUnitPrice(line, line.qty),
        description: `${line.name}: ${rangeLabel(months[0], months[months.length - 1])}${detail.some((d) => d.fraction < 1) ? " (part month prorated)" : ""}`,
        amount, calc: { basis: "Fixed recurring, in advance", monthly: r2(base), months: detail },
      });
    } else if (line.billingClass === "transaction") {
      const months = (usageBlock(line, period, agreement, cut) || []).filter((m) => !billed.has(billedKey(quote.id, line.code, m)));
      if (!months.length) continue;
      const detail = months.map((m) => {
        const k = billedKey(quote.id, line.code, m);
        const has = k in usageTotals;
        if (!has) needs.push({ quoteId: quote.id, lineCode: line.code, period: m });
        const qty = has ? n(usageTotals[k]) : 0;
        const c = monthlyCharge(line, qty);
        const factor = escalationFactor(line, m);
        const slab = line.pricing?.rateSource === "Slab" ? slabLabel(line.pricing.slabs, slabIndex(qty * (line.pricing.slabPeriod === "year" ? 12 : 1), line.pricing.slabs), line.unit) : "";
        return { period: m, qty, usage: r2(c.usage * factor), minimum: c.minimum, minimumApplied: !!c.minimumApplied, slab, factor: r2(factor * 10000) / 10000, amount: r2(Math.max(c.usage * factor, c.minimum)), missing: !has };
      });
      const qty = detail.reduce((t, d) => t + d.qty, 0), amount = r2(detail.reduce((t, d) => t + d.amount, 0));
      usage.push({
        code: line.code, name: line.name, billingClass: "transaction", unit: line.unit, qty, rate: qty > 0 ? r2(amount / qty) : agreedUnitPrice(line, 0),
        description: `${line.name}: actual usage ${rangeLabel(months[0], months[months.length - 1])}${detail.some((d) => d.minimumApplied) ? " (minimum billing applied)" : ""}`,
        amount, calc: { basis: "Actual consumption, in arrears", months: detail },
      });
    }
  }
  return { fixed, usage, needs };
}

/** Payment milestones of an agreement's one-time charges: [{ index, name, pct, amount, invoiced }]. */
export function milestoneItems(quote, invoices = []) {
  const a = quote.agreement;
  const total = r2((a?.lines || []).filter((l) => l.billingClass === "one_time").reduce((s, l) => s + n(l.netRate) * Math.max(1, n(l.qty)), 0));
  const ms = Array.isArray(a?.milestones) && a.milestones.length ? a.milestones : (total ? [{ name: "One-time charges", pct: 100 }] : []);
  if (!total) return [];
  return ms.map((m, index) => ({ index, name: m.name || `Milestone ${index + 1}`, pct: n(m.pct), amount: r2(total * n(m.pct) / 100),
    invoiced: (invoices || []).some((i) => i.quoteId === quote.id && i.status === "final" && i.type !== "credit" && i.cycle === `milestone-${index}`) }));
}

// ── Invoices ─────────────────────────────────────────────────────────
const CYCLE_SUFFIX = { period: "", subscription: "-S", usage: "-U" };
export const invoiceNoFor = (agreementNo, period, cycle) => `BI/${agreementNo}/${String(period).replace("-", "")}${cycle.startsWith("milestone-") ? `-M${Number(cycle.split("-")[1]) + 1}` : (CYCLE_SUFFIX[cycle] ?? `-${cycle}`)}`;

function assemble(quote, period, cycle, lines, { config = {}, issues = [] } = {}) {
  const a = quote.agreement;
  const taxable = r2(lines.reduce((s, l) => s + l.amount, 0));
  const gst = computeGst(taxable, quote.hans?.party?.state || "", { gstRatePct: n(config.gstRatePct) || 18, homeState: config.homeState || "Delhi" });
  return {
    id: `inv_${quote.id}_${period}_${cycle}`, invoiceNo: invoiceNoFor(a.agreementNo, period, cycle), type: "invoice", status: "preview",
    quoteId: quote.id, agreementNo: a.agreementNo, accountId: a.accountId || quote.accountId || "", customer: a.customer || "",
    period, cycle, currency: a.currency || "INR",
    lines: lines.map((l, i) => ({ lineNo: i + 1, ...l })),
    taxable, gstPct: n(config.gstRatePct) || 18, cgst: r2(gst.cgst), sgst: r2(gst.sgst), igst: r2(gst.igst), gst: r2(gst.gstTotal), total: r2(taxable + gst.gstTotal),
    issues,
  };
}

/**
 * Invoice previews for one agreement and period: one invoice, or separate
 * subscription and usage invoices when the agreement is set that way.
 */
export function previewInvoices(quote, period, usageTotals = {}, opts = {}) {
  const { fixed, usage, needs } = dueLines(quote, period, usageTotals, opts);
  const s = billingSettings(quote.agreement);
  const missing = needs.map((x) => ({ level: "blocking", type: "missing", ...x, message: `No approved usage for ${x.lineCode} in ${periodLabel(x.period)}.` }));
  const out = [];
  if (s.separateUsageInvoice) {
    if (fixed.length) out.push(assemble(quote, period, "subscription", fixed, opts));
    if (usage.length) out.push(assemble(quote, period, "usage", usage, { ...opts, issues: missing }));
  } else if (fixed.length || usage.length) {
    out.push(assemble(quote, period, "period", [...fixed, ...usage], { ...opts, issues: missing }));
  }
  return out;
}

/** The invoice for one payment milestone. */
export function milestoneInvoice(quote, index, period, opts = {}) {
  const m = milestoneItems(quote, opts.invoices || []).find((x) => x.index === index);
  if (!m) return null;
  return assemble(quote, period, `milestone-${index}`, [{ code: "ONE-TIME", name: "One-time charges", billingClass: "one_time", unit: "", qty: 1, rate: m.amount,
    description: `One-time charges: ${m.pct}% ${String(m.name).replace(/^./, (c) => c.toLowerCase())}`, amount: m.amount, calc: { basis: "Milestone", pct: m.pct, months: [] } }], opts);
}

/** Can a preview be finalised? Blocking issues stop it; so does an invoice already final for the same agreement, period and cycle. */
export function finaliseProblems(preview, invoices = [], usageIssues = []) {
  const out = [];
  if (!preview || !preview.lines?.length) out.push("Nothing to invoice.");
  if ((invoices || []).some((i) => i.id === preview?.id && i.status === "final")) out.push(`${preview.invoiceNo} is already final.`);
  for (const i of [...(preview?.issues || []), ...usageIssues.filter((x) => x.quoteId === preview?.quoteId)]) if (i.level === "blocking") out.push(i.message);
  return [...new Set(out)];
}

export const finalise = (preview, { by = "", at = "" } = {}) => ({ ...preview, status: "final", issues: [], finalisedBy: by, finalisedAt: at });

/** A credit note against a final invoice: the whole of it, or a taxable amount. */
export function creditNote(invoice, { amount = null, reason = "", by = "", at = "", seq = 1 } = {}) {
  const share = amount == null ? 1 : Math.min(1, Math.max(0, n(amount) / (n(invoice.taxable) || 1)));
  const neg = (v) => -r2(n(v) * share);
  return {
    ...invoice, id: `${invoice.id}_cn${seq}`, invoiceNo: `CN/${invoice.invoiceNo}${seq > 1 ? `-${seq}` : ""}`, type: "credit", status: "final", creditOf: invoice.id, reason,
    lines: [{ lineNo: 1, code: "CREDIT", name: "Credit note", billingClass: "", unit: "", qty: 1, rate: neg(invoice.taxable), description: `Credit against ${invoice.invoiceNo}: ${reason}`, amount: neg(invoice.taxable), calc: { basis: "Credit note", months: [] } }],
    taxable: neg(invoice.taxable), cgst: neg(invoice.cgst), sgst: neg(invoice.sgst), igst: neg(invoice.igst), gst: neg(invoice.gst), total: neg(invoice.total),
    issues: [], finalisedBy: by, finalisedAt: at,
  };
}

/** Net of an invoice after its credit notes. */
export const netOfCredits = (invoice, invoices = []) => r2(n(invoice.total) + (invoices || []).filter((i) => i.type === "credit" && i.creditOf === invoice.id && i.status === "final").reduce((s, i) => s + n(i.total), 0));

/** The Collections record for a final invoice (Collections keeps amounts in ₹ lakh). */
export function collectionFromInvoice(invoice, { today = "", by = "", creditDays = 30, contractId = "", legalName = "", gstin = "" } = {}) {
  const lakh = (v) => Math.round(n(v)) / 1e5;
  const due = new Date(`${iso(today)}T00:00:00Z`); due.setUTCDate(due.getUTCDate() + (n(creditDays) > 0 ? n(creditDays) : 30));
  const months = invoice.lines.flatMap((l) => (l.calc?.months || []).map((m) => m.period)).sort();
  return {
    id: `col_${invoice.id}`, invoiceNo: invoice.invoiceNo, invoiceType: "Proforma Invoice",
    accountId: invoice.accountId, contractId, invoiceDate: iso(today), dueDate: due.toISOString().slice(0, 10),
    billPeriodFrom: months.length ? periodStart(months[0]) : periodStart(invoice.period), billPeriodTo: months.length ? periodEnd(months[months.length - 1]) : periodEnd(invoice.period),
    billedAmount: lakh(invoice.taxable), gstAmount: lakh(invoice.gst), tdsAmount: 0, netPayable: lakh(invoice.total), collectedAmount: 0, pendingAmount: lakh(invoice.taxable),
    currency: invoice.currency || "INR", product: "", status: "Current", paymentMode: "NEFT", paymentDate: "", agingBucket: "", followUpDate: "", chequeRef: "", approvedBy: by, owner: by,
    remarks: [`Billing Engine invoice for agreement ${invoice.agreementNo}, ${periodLabel(invoice.period)}.`, legalName ? `Bill to: ${legalName}${gstin ? ` · GSTIN ${gstin}` : ""}.` : "",
      `Lines: ${invoice.lines.map((l) => `${l.description} ₹${Math.round(l.amount).toLocaleString("en-IN")}`).join("; ")}.`].filter(Boolean).join(" "),
  };
}

/**
 * The whole run for a period: every billable agreement with its usage check,
 * invoice previews and milestones. Nothing is saved here.
 */
export function billingRun({ quotes = [], period, usageRecords = [], invoices = [], config = {} }) {
  return billableAgreements(quotes, period).map(({ quote, agreement }) => {
    const months = new Set();
    for (const line of agreement.lines) if (line.billingClass === "transaction") (usageBlock(line, period, agreement, supersededFrom(quote, quotes)) || []).forEach((m) => months.add(`${line.code}|${m}`));
    const expected = [...months].map((k) => ({ quoteId: quote.id, lineCode: k.split("|")[0], period: k.split("|")[1] }));
    const rec = reconcileUsage(usageRecords.filter((r) => r.quoteId === quote.id), expected);
    const previews = previewInvoices(quote, period, rec.totals, { quotes, invoices, config })
      .map((p) => ({ ...p, issues: p.cycle === "subscription" ? [] : rec.issues.filter((i) => i.level !== "info" || true) }));
    const done = (invoices || []).filter((i) => i.quoteId === quote.id && i.period === period && i.status === "final");
    return { quote, agreement, usage: rec, previews, finalInvoices: done, milestones: milestoneItems(quote, invoices) };
  });
}
