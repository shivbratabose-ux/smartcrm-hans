// The customer quotation document (format approved Nov 2026, after the Orbis
// EDI Intelligent quotation DEL/SQ/0035/2627):
//
//   letterhead + Hans logo · QUOTATION · To / reference table · subject + letter
//   1 About · 2 Your plan · 3 Features included · 4 Prices (A one-time,
//   B subscription, GST) + add-on services · 5 Commercial notes ·
//   6 Implementation, training and support · 7 Payment terms · 8 What you need ·
//   9 Terms and conditions · sign-off · [ULA / Agreement] · KYC page
//
// Rules:
//   • The logo is always the Hans logo.
//   • No "minimum monthly billing", "quarterly invoice" or "first-year value"
//     rows (struck out on the approved sample).
//   • Discounts are shown to the customer only when the quote says so
//     (hans.showDiscount); otherwise rates are printed net.
//   • A quote that still needs approval prints on the same letterhead (no
//     watermark), marked "Draft, subject to approval *" in the reference
//     table with a footnote for the customer (PENDING_NOTE), and cannot be
//     accepted from it (no accept link).
//
// Pure: builds an HTML string; no DOM. Tested in scripts/test-quote-document.mjs.
import { isOneTimeModel } from "./pricingEngine.js";
import { companyOf } from "./company.js";
import { groupOf, SERVICES_GROUP } from "./productGroups.js";
import { HOSTING_LABEL } from "./handover.js";
import { PRODUCT_CONTENT, PLAN_CONTENT, STANDARD_SECTIONS, CONFIDENTIAL_NOTE } from "../../data/quoteContent.js";
import { resolveTermSets, termSetFor, eulaLinkOf, fillTerms, tcLines, pickBillingStructure } from "./termSets.js";
import { slabTable, usageRuleText, poolVolumes, escalatedRates, hasUsageRules } from "./slabs.js";
import { revenueShareOf, revenueShareText, shareMode } from "../billing/revenueShare.js";
import { billingClassOf } from "./commercial.js";
import { getQuoteTemplate } from "../../data/quoteTemplates.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const inr = (n) => "₹" + Math.round(num(n)).toLocaleString("en-IN");
// A unit rate keeps its paise (₹27.50, ₹2.50); whole rupees print without decimals.
// Half a paisa rounds up even when floating point stores it a hair below (3590.145 → 3,590.15).
const inrRate = (n) => { const v = Math.round(num(n) * 100 + 1e-6) / 100; return "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }); };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${m[3]}-${MONTHS[+m[2] - 1]}-${m[1]}` : String(iso || ""); };
const longDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${+m[3]} ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][+m[2] - 1]} ${m[1]}` : String(iso || ""); };
const addDays = (iso, n) => { const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`); if (Number.isNaN(d.getTime())) return ""; d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Footnote on a quote that is still awaiting approval (customer-facing wording). */
export const PENDING_NOTE = "Draft quotation: the prices and terms are awaiting internal approval at Hans Infomatic. Once approved, we will send you the final quotation, which you can then accept.";

/** Does the quote still need approval before it can go to the customer as final? */
export const awaitingApproval = (q) => {
  if (q?.approvalStatus === "Approved") return false;                 // approved wins over a stale status
  return ["Pending", "Rejected"].includes(q?.approvalStatus) || /approval required/i.test(String(q?.status || ""));
};

/** Feature list for a plan: written content, else the price row's own description, else the product's modules. */
// ── Features of a plan ───────────────────────────────────────────────
// A plan's description lists what it adds ("Everything in Business, plus CCR,
// Customs Status Update, …"). The quotation shows the COMPLETE list: the
// features of the plan it builds on (and of the plan that one builds on), then
// its own. The "Includes 5 GB storage and 100 WhatsApp messages" sentence is
// plan data (shown under Your plan), not a feature.

/** Split on a separator, but never inside brackets: "normal EDI (BoE, SB), reports" stays two items. */
function splitOutsideBrackets(text, isSeparator) {
  const out = []; let cur = "", depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    const len = depth === 0 ? isSeparator(text, i) : 0;
    if (len) { out.push(cur); cur = ""; i += len - 1; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** A description sentence into features. */
export function splitFeatures(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = splitOutsideBrackets(clean, (t, i) => (t[i] === "." && (t[i + 1] === " " || i === t.length - 1) ? (t[i + 1] === " " ? 2 : 1) : 0));
  const out = [];
  for (const raw of sentences) {
    const sentence = raw.trim().replace(/\.$/, "");
    if (!sentence) continue;
    // "Import: Bill of Entry job creation, invoice entry, …" is one feature, kept whole.
    if (/^[A-Z][A-Za-z ]{1,24}:\s/.test(sentence)) { out.push(sentence); continue; }
    for (const part of splitOutsideBrackets(sentence, (t, i) => (t[i] === ";" ? 1 : 0))) {
      // Commas, and a closing "and" before a capitalised name ("PGA Auto Compliance and AI assistance").
      const items = splitOutsideBrackets(part, (t, i) => (t[i] === "," && t[i + 1] === " " ? 2 : t.startsWith(" and ", i) && /[A-Z0-9]/.test(t[i + 5] || "") ? 5 : 0));
      // A run of short codes ("AWB, BL, CAN, DO") reads better as one feature than as four ticks.
      const isCode = (x) => /^[A-Z0-9]{2,5}$/.test(x);
      const cleaned = items.map((it) => it.trim().replace(/^and\s+/i, "")).filter((f) => f.length > 1);
      for (let i = 0; i < cleaned.length; i++) {
        if (isCode(cleaned[i]) && isCode(cleaned[i + 1] || "")) {
          const run = [cleaned[i]];
          while (isCode(cleaned[i + 1] || "")) run.push(cleaned[++i]);
          out.push(run.join(", "));
        } else out.push(cleaned[i]);
      }
    }
  }
  return out.map((f) => f.charAt(0).toUpperCase() + f.slice(1));
}

/** The plan a description says it builds on ("Everything in Business, plus …"), or null. */
function basePlanOf(row, priceRows = []) {
  const m = /^\s*Everything in (?:the )?(.+?)(?: plan)?,? plus\b/i.exec(String(row?.description || ""));
  if (!m) return null;
  const want = m[1].trim().toLowerCase();
  const siblings = (priceRows || []).filter((r) => r && r.code !== row.code && (row.productId ? r.productId === row.productId : r.module === row.module));
  return siblings.find((r) => String(r.name || "").toLowerCase() === want)
    || siblings.find((r) => String(r.name || "").toLowerCase().endsWith(` ${want}`))
    || siblings.find((r) => String(r.name || "").toLowerCase().includes(want)) || null;
}

/** Feature list for a plan: written content, else the complete list from its description (with the plans it builds on), else the product's modules. */
export function featuresOf(row, product, priceRows = [], seen = new Set()) {
  const pc = row && PLAN_CONTENT[row.code];
  if (pc?.features?.length) return pc.features;
  const own = splitFeatures(String(row?.description || "").replace(/Includes [^.]*\.?/gi, "").replace(/^\s*Everything in (?:the )?.+?(?: plan)?,? plus\s+/i, ""));
  const base = row && !seen.has(row.code) ? basePlanOf(row, priceRows) : null;
  if (base) {
    seen.add(row.code);
    const inherited = featuresOf(base, product, priceRows, seen);
    const have = new Set(inherited.map((f) => f.toLowerCase()));
    return [...inherited, ...own.filter((f) => !have.has(f.toLowerCase()))].slice(0, 60);
  }
  if (own.length >= 3) return own.slice(0, 60);
  // Product modules as features — not price items (Plan / Add-on / Pricing entries, or ones carrying a ₹ price).
  const mods = (product?.modules || []).filter((m) => !/add-on|plan|pricing/i.test(m.type || "") && !/₹/.test(m.desc || "")).map((m) => m.name).filter(Boolean);
  return mods.slice(0, 60);
}

/** Everything the page needs, worked out from the quote (also what the tests check). */
export function quoteDocModel(quote, opts = {}) {
  const h = quote.hans || {};
  const cfg = opts.config || {};
  const company = companyOf(cfg);
  const priceRows = opts.priceRows || [];
  const catalog = opts.catalog || [];
  const rowOf = (code) => priceRows.find((r) => r.code === code) || null;
  const showDiscount = !!h.showDiscount;
  const overallPct = Math.min(100, Math.max(0, num(h.overallDiscountPct)));
  const gstPct = num(cfg.gstRatePct) || 18;

  const lines = (quote.items || []).filter((l) => l && (l.productCode || l.name)).map((l) => {
    const row = rowOf(l.productCode);
    const cls = billingClassOf({ pricingModel: l.pricingModel, billingClass: l.billingClass || row?.billingClass });
    const oneTime = cls === "one_time";
    const usage = cls === "transaction";   // variable: billed on actual consumption, rate only
    const months = oneTime ? 1 : Math.max(1, num(l.months) || 1);
    const qty = Math.max(num(l.qty), num(row?.minQty));
    const afterLine = num(l.lineTotal) / months;                     // per month for recurring
    const net = afterLine * (1 - overallPct / 100);                  // after overall discount too
    const unit = String(l.unit || row?.unit || "").trim();
    const u = /^[A-Z/]{2,}$/.test(unit) ? unit : unit.toLowerCase();   // HBL, HAWB stay upper case
    // Policy discounts folded into the price (one-time licence, billing frequency):
    // shown only when the quote shows discounts, as a list price and a total %.
    const sold = l.soldAs?.mode === "one_time" ? l.soldAs : null;
    const policyPct = sold ? num(sold.discountPct) : num(l.freqDiscountPct);
    const shownList = sold ? Math.round(num(sold.monthlyRate) * num(sold.months) * 100) / 100 : policyPct ? num(l.baseRate) : num(l.unitPriceResolved);
    const shownDisc = policyPct ? Math.round((1 - (1 - policyPct / 100) * (1 - num(l.discountPct) / 100)) * 10000) / 100 : num(l.discountPct);
    // The customer sees prices, never how they were worked out (no months × rate):
    // decision 21 Nov 2026.
    const basis = l.soldAs?.mode === "one_time" ? "One-time licence" : oneTime ? "One time" : usage ? `Per ${u || "use"}` : `Per ${u || "unit"} per month`;
    // Billed to the trade (WiseCCS TRS) and hybrid fixed fee: from the price row, else as quoted.
    const rules = row || l.pricing || {};
    const trade = usage && (rules.billTo || l.billTo || l.pricing?.billTo) === "trade";
    return {
      code: l.productCode, name: l.name || row?.name || l.productCode, oneTime, usage, billingClass: cls, basis, qty, unit,
      trade, revenueShare: trade ? revenueShareOf(rules) || revenueShareOf(l) : null,
      fixedFee: usage && (rules.minimumMode || l.pricing?.minimumMode) === "differential",
      // Contractual minimum per month (committed): the usage minimum / pack, or a platform floor.
      minimum: usage ? Math.max(num(l.monthlyMinimum), /^PaaS/.test(String(l.pricingModel || "")) ? num(l.minMonthFloor) : 0) : 0,
      included: usage && num(l.unitPriceResolved) === 0 && row && row.rateSource !== "Slab" && num(row.listPrice) === 0 && row.listPrice != null,
      slabs: row?.rateSource === "Slab" ? slabTable(row.slabs, `${unit || "units"} per ${row.slabPeriod === "year" ? "year" : "month"}`) : null,
      row,
      listRate: num(l.unitPriceResolved), discountPct: shownDisc,
      // What the customer sees: list rate + discount when shown; otherwise the net rate.
      // A one-time licence's list price is the undiscounted licence; its one-time
      // discount (and a billing-frequency discount) joins the line discount.
      rate: showDiscount ? shownList : (qty ? net / qty : net),
      amount: showDiscount ? afterLine : net,
      net,
    };
  });
  const oneTime = lines.filter((l) => l.oneTime);
  const subs = lines.filter((l) => !l.oneTime && !l.usage);
  const usage = lines.filter((l) => l.usage && !l.trade);
  const trade = lines.filter((l) => l.trade);
  const sum = (arr, k) => arr.reduce((s, l) => s + l[k], 0);

  // The line the quotation is "for": a subscription, else a licence, else a
  // pay-per-use service (e.g. AMS filing), else whatever is there.
  const main = subs[0] || oneTime.find((l) => /licen/i.test(String((quote.items || []).find((it) => it.productCode === l.code)?.pricingModel || ""))) || usage[0] || trade[0] || oneTime[0] || lines[0] || null;
  const mainIsPlan = !!main && (subs.includes(main) || (!usage.includes(main) && /licen/i.test(String((quote.items || []).find((it) => it.productCode === main.code)?.pricingModel || ""))));
  const mainRow = main ? rowOf(main.code) : null;
  const gid = mainRow ? groupOf(mainRow, catalog) : "";
  const product = gid && gid !== SERVICES_GROUP ? catalog.find((p) => p.id === gid) || null : null;
  const pContent = (product && PRODUCT_CONTENT[product.id]) || {};
  const brand = pContent.brand || product?.name || main?.name || "the software";
  const planName = (mainIsPlan ? main?.name : "") || product?.name || main?.name || "Software";
  const hosted = quote.hosting !== "Client";
  const validUntil = quote.expiryDate || addDays(quote.createdDate, num(cfg.quoteValidityDays) || 7);
  const customer = h.party?.name || quote.legalName || "";

  const plan = [];
  if (main) {
    const pc = PLAN_CONTENT[main.code] || {};
    plan.push(["Plan", planName]);
    if (pc.purpose) plan.push(["What it is for", pc.purpose]);
    (pc.extra || []).forEach((r) => plan.push(r));
    if (num(mainRow?.minQty) > 0) plan.push(["Minimum users", `${mainRow.minQty} users`]);
    const d = String(mainRow?.description || "");
    const gb = /(\d+)\s*GB document storage/i.exec(d); if (gb) plan.push(["Included storage", `${gb[1]} GB, shared by all users of your company`]);
    const wa = /(\d+)\s*WhatsApp messages/i.exec(d); if (wa) plan.push(["WhatsApp messages included", `${wa[1]} messages a month, shared by all users of your company`]);
    if (quote.hosting && h.hostingAsked !== false) plan.push(["Hosting", HOSTING_LABEL[quote.hosting] || quote.hosting]);
  }

  const template = product ? getQuoteTemplate(product.id) : null;
  const about = pContent.about || (template?.overview?.description ? [template.overview.description] : []);
  const ctx = { product: brand, customer, validUntil: longDate(validUntil), hosted, billing: h.billingFrequency, company: company.name, city: opts.city || "", paymentTerms: quote.paymentTerms || "", hasSubscription: subs.length > 0, hasOneTime: oneTime.length > 0,
    // Structured milestones (name + % of the one-time total), with amounts.
    milestoneText: Array.isArray(h.milestones) && h.milestones.length && oneTime.length
      ? h.milestones.map((ms) => `${num(ms.pct)}% (${inr(sum(oneTime, "net") * num(ms.pct) / 100)}) ${String(ms.name || "").replace(/^./, (c) => c.toLowerCase())}`).join("; ") + "."
      : "" };
  const notes = String(h.termsText || quote.terms || "").split(/\n+/).map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);

  const netOneTime = sum(oneTime, "net"), netSubs = sum(subs, "net");
  const termSet = termSetFor(product?.id || mainRow?.productId || "", opts.termSets || resolveTermSets(null));
  // The governing-terms link follows the product (its terms set) and how the
  // quote is billed (the set's link for that billing structure, if given).
  const itemOf = (code) => (quote.items || []).find((it) => it.productCode === code) || {};
  const billingStructure = pickBillingStructure({
    licence: oneTime.some((l) => itemOf(l.code).soldAs?.mode === "one_time" || /licen/i.test(String(itemOf(l.code).pricingModel || ""))),
    revenueShare: trade.length > 0, hybrid: usage.some((l) => l.fixedFee), subscription: subs.length > 0, usage: usage.length > 0,
  });
  const fillCtx = { product: brand, company: company.name, customer, validUntil: longDate(validUntil) };
  return {
    company, quote, customer, brand, planName, product, hosted, showDiscount, overallPct, gstPct, mainIsUsage: !!main && usage.includes(main),
    pending: awaitingApproval(quote),
    validUntil,
    to: { contact: h.billing?.billingContactName || quote.billingContactName || "", company: customer, address: String(h.party?.address || quote.billingAddressSnapshot || "").split(/\n|,\s*/).map((s) => s.trim()).filter(Boolean) },
    about, plan,
    features: main ? featuresOf(mainRow, product, priceRows) : [],
    featureNote: (main && PLAN_CONTENT[main.code]?.featureNote) || "",
    oneTime, subs, usage, trade, pools: poolVolumes(quote.items || [], rowOf),
    totals: {
      oneTimeShown: sum(oneTime, "amount"), subsShown: sum(subs, "amount"),
      overallOneTime: sum(oneTime, "amount") - netOneTime, overallSubs: sum(subs, "amount") - netSubs,
      netOneTime, netSubs,
      prepaymentDisc: num(h.prepaymentDisc), prepaymentPct: num(h.prepaymentDiscountPct),
      minimums: sum(usage, "minimum"),
      gstOneTime: netOneTime * gstPct / 100, gstSubs: (netSubs + sum(usage, "minimum")) * gstPct / 100,
    },
    amc: h.amc && h.amc.applies ? h.amc : null,
    notes,
    implementation: (pContent.sections?.implementation || STANDARD_SECTIONS.implementation)(ctx),
    payment: (pContent.sections?.payment || STANDARD_SECTIONS.payment)(ctx),
    requirements: (pContent.sections?.requirements || STANDARD_SECTIONS.requirements)(ctx),
    terms: tcLines(termSet, fillCtx),
    termSetId: termSet?.id || "", billingStructure,
    governing: { label: termSet?.eulaTitle || "terms of use", url: eulaLinkOf(termSet, opts.siteUrl, billingStructure), text: fillTerms(termSet?.governing || "", fillCtx) },
    confidential: CONFIDENTIAL_NOTE({ company: company.name, customer }),
    preparedBy: { name: opts.preparedBy?.name || quote.preparedBy || "", title: opts.preparedBy?.title || "", phone: opts.preparedBy?.phone || "", email: opts.preparedBy?.email || "" },
  };
}

const CSS = (m) => `
  @page { size: A4; margin: 13mm 14mm 16mm;
    @bottom-left { content: "${String(m.company.name).replace(/"/g, "")}${m.company.cin ? ` · CIN ${String(m.company.cin).replace(/"/g, "")}` : ""} · Confidential"; font: 7pt 'Segoe UI', Arial, sans-serif; color: #475569; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7pt 'Segoe UI', Arial, sans-serif; color: #475569; } }
  * { box-sizing: border-box; }
  :root { color-scheme: light; }
  html { background: #fff; }
  body { background: #fff; font-family: 'Segoe UI', Arial, sans-serif; color: #111827; font-size: 9.6pt; line-height: 1.38; margin: 0; padding: 18px 22px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print { body { padding: 0; } .noprint { display: none !important; } }
  .lh { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1F2F6B; padding-bottom: 6px; }
  .lh .co { font-size: 12.5pt; font-weight: 800; color: #1F2F6B; letter-spacing: .2px; }
  .lh .sm { font-size: 7.6pt; color: #64748B; line-height: 1.5; }
  .title { font-size: 15pt; font-weight: 800; color: #1F2F6B; margin: 4px 0 8px; }
  .top { display: grid; grid-template-columns: 1fr 1.25fr; gap: 18px; }
  .meta td { padding: 1px 0; font-size: 9.4pt; } .meta td:first-child { color: #64748B; width: 118px; } .meta td:last-child { font-weight: 700; }
  h2 { font-size: 11pt; color: #1F2F6B; margin: 16px 0 0; padding-bottom: 1px; border-bottom: 2.5px solid #3DAE49; break-after: avoid; }
  p { margin: 5px 0; }
  table { border-collapse: collapse; width: 100%; }
  .kv td { border-bottom: 1px solid #CBD5E1; padding: 3px 4px; vertical-align: top; } .kv td:first-child { width: 46%; font-weight: 700; color: #1F2F6B; }
  .feat { columns: 1; margin: 4px 0 0; padding: 0; list-style: none; } .feat.two { columns: 2; column-gap: 28px; } .feat li { padding: 1.5px 0 1.5px 22px; position: relative; break-inside: avoid; }
  .feat li::before { content: "✓"; color: #3DAE49; font-weight: 800; position: absolute; left: 6px; }
  .pr th { background: #1F2F6B; color: #fff; font-size: 9pt; text-align: left; padding: 4px 6px; } .pr th.r, .pr td.r { text-align: right; }
  .pr td { border-bottom: 1px solid #CBD5E1; padding: 4px 6px; vertical-align: top; }
  .pr tr.sec td { background: #EEF2F8; font-weight: 800; } .pr tr.tot td { font-weight: 800; }
  .pr2 th { background: #5B6B80; }
  ol.n { margin: 4px 0 0; padding-left: 26px; } ol.n li { padding: 1px 0; }
  .note { font-size: 8pt; color: #64748B; font-style: italic; margin-top: 6px; }
  .meta td.pend { color: #B45309; }
  .footnotes { margin-top: 22px; padding-top: 5px; border-top: 1px solid #CBD5E1; font-size: 7.8pt; color: #64748B; break-inside: avoid; }
  .footnotes p { margin: 3px 0; } .footnotes a, ol.n a { color: #1F2F6B; }
  .sign { margin-top: 14px; break-inside: avoid; }
`;

const kv = (rows) => `<table class="kv"><tbody>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</tbody></table>`;

/** The quotation as a complete HTML page. */
export function quoteDocumentHtml(quote, opts = {}) {
  const m = quoteDocModel(quote, opts);
  const c = m.company, t = m.totals;
  let sec = 0; const H = (title) => `<h2>${++sec}. ${esc(title)}</h2>`;
  const D = m.showDiscount;
  const cols = D ? 6 : 5;
  const priceRow = (n, l) => `<tr><td>${n}</td><td>${esc(l.name)}</td><td>${esc(l.basis)}</td><td class="r">${inrRate(l.rate)}</td>${D ? `<td class="r">${l.discountPct ? `${l.discountPct}%` : "—"}</td>` : ""}<td class="r">${l.qty || ""}</td><td class="r">${inr(l.amount)}</td></tr>`;
  const noteRow = (n, text) => `<tr><td>${n}</td><td>${esc(text)}</td><td>One time</td><td></td>${D ? "<td></td>" : ""}<td></td><td></td></tr>`;
  const totRow = (label, value, cls = "tot") => `<tr class="${cls}"><td></td><td colspan="${cols - 1}">${esc(label)}</td><td class="r">${value}</td></tr>`;
  let n = 0;
  const hasCode = (code) => (quote.items || []).some((l) => l.productCode === code);

  // "Server setup: not applicable" rows only where hosting was a real choice.
  const hansHosted = m.hosted && quote.hosting === "Hans" && quote.hans?.hostingAsked !== false;
  const minimums = m.usage.filter((l) => l.minimum > 0);
  const hasFixed = m.subs.length > 0 || minimums.length > 0;
  const hasOneTimeSec = m.oneTime.length > 0 || hansHosted;
  let letter = 0; const L = () => String.fromCharCode(65 + letter++);
  const secRow = (title) => `<tr class="sec"><td>${L()}</td><td colspan="${cols}">${esc(title)}</td></tr>`;
  const dCell = (l) => (D ? `<td class="r">${l.discountPct ? `${+Number(l.discountPct).toFixed(2)}%` : "—"}</td>` : "");
  const onUse = '<td class="r" colspan="2" style="color:#475569">On actual use</td>';

  // B. Variable charges: the agreed rate and unit only. Never volume × rate.
  const variableRows = m.usage.map((l) => {
    const fx = (r) => (D ? r : r * (1 - l.discountPct / 100));
    const row = l.row;
    const mates = row?.pool ? m.usage.filter((o) => o !== l && String(o.row?.pool || "").trim() === String(row.pool).trim()).map((o) => o.name) : [];
    const rules = hasUsageRules(row) ? usageRuleText(row, { unit: l.unit, poolMates: mates }).filter((x) => !/^Volume slabs: the month's/.test(x) || row.slabMode === "graduated" || row.slabPeriod === "year") : [];
    const esc3 = row && Number(row.escalationPct) > 0 && !(l.slabs && l.slabs.length) && l.listRate ? escalatedRates(fx(Number(row.listPrice ?? l.listRate)), row.escalationPct, 3) : null;
    const extra = [...rules, esc3 ? `Year 1 ₹${esc3[0].toLocaleString("en-IN")} · Year 2 ₹${esc3[1].toLocaleString("en-IN")} · Year 3 ₹${esc3[2].toLocaleString("en-IN")} per ${l.unit || "unit"}.` : ""].filter(Boolean);
    const notes = extra.length ? `<tr><td></td><td colspan="${cols}" style="font-size:8.4pt;color:#475569;padding-top:0">${extra.map(esc).join("<br>")}</td></tr>` : "";
    const shownRate = row && Number(row.packQty) > 0 ? Number(row.listPrice ?? l.listRate) : l.listRate;
    if (l.slabs && l.slabs.length) {
      return `<tr><td>${++n}</td><td colspan="${cols}"><b>${esc(l.name)}</b>, ${esc(l.basis.replace(/^Per /, "per "))}: rate by the ${row?.slabPeriod === "year" ? "year's" : "month's"} volume${row?.slabMode === "graduated" ? " (each band at its own rate)" : " (the whole month is billed at its slab's rate)"}${D && l.discountPct ? `, less ${+Number(l.discountPct).toFixed(2)}% discount` : ""}</td></tr>`
        + l.slabs.map((sl) => `<tr><td></td><td style="padding-left:18px">${esc(sl.label)}</td><td>${esc(l.basis)}</td><td class="r">${sl.rate != null ? inrRate(fx(sl.rate)) : "On request"}</td>${D ? "<td></td>" : ""}${onUse}</tr>`).join("") + notes;
    }
    return `<tr><td>${++n}</td><td>${esc(l.name)}</td><td>${esc(l.basis)}${row && Number(row.packQty) > 0 ? " beyond the pack" : ""}</td><td class="r">${l.included ? "Included" : shownRate ? inrRate(fx(shownRate)) : "On request"}</td>${dCell(l)}${l.included ? '<td colspan="2"></td>' : onUse}</tr>${notes}`;
  });

  const fixedRows = hasFixed ? [
    secRow("Fixed recurring charges"),
    ...m.subs.map((l) => priceRow(++n, l)),
    ...minimums.map((l) => `<tr><td>${++n}</td><td>${l.fixedFee ? "Fixed monthly fee" : "Minimum billing"}: ${esc(l.name)}</td><td>Per month</td><td></td>${D ? "<td></td>" : ""}<td></td><td class="r">${inr(l.minimum)}</td></tr>`),
    m.subs.length + minimums.length > 1 ? totRow("Total fixed recurring charges per month", inr(t.subsShown + t.minimums)) : "",
    D && t.overallSubs > 0.5 ? totRow(`Less: discount ${m.overallPct}%`, "− " + inr(t.overallSubs), "") + totRow("Fixed recurring charges per month after discount", inr(t.netSubs + t.minimums)) : "",
    t.prepaymentDisc > 0.5 ? totRow(`Prepayment discount ${t.prepaymentPct}% when the subscription term is paid in advance`, "− " + inr(t.prepaymentDisc), "") : "",
  ].join("") : "";
  const variableSec = m.usage.length ? secRow("Variable charges, billed on actual consumption") + variableRows.join("") : "";
  // Billed by Hans to the trade (WiseCCS TRS): the customer pays nothing and receives a revenue share.
  const shares = [...new Map(m.trade.filter((l) => l.revenueShare).map((l) => [JSON.stringify(l.revenueShare.slabs), l.revenueShare])).values()];
  const paidByTrade = '<td class="r" colspan="2" style="color:#475569">Paid by the trade</td>';
  const tradeSec = m.trade.length ? [
    secRow("Charges billed by Hans Infomatic to the trade (not invoiced to you)"),
    ...m.trade.map((l) => `<tr><td>${++n}</td><td>${esc(l.name)}</td><td>${esc(l.basis)}</td><td class="r">${l.listRate ? inrRate(l.listRate) : "On request"}</td>${D ? "<td></td>" : ""}${paidByTrade}</tr>`),
    ...shares.map((rs) => `<tr><td></td><td colspan="${cols}"><b>Revenue share</b> on the month's combined count of the transactions above (${shareMode(rs) === "volume" ? "the month's count sets one share for the whole month" : "each band of the month's count at its own share"}):</td></tr>`
      + revenueShareText(rs, { operator: m.customer || "you" }).map((t) => `<tr><td></td><td colspan="${cols}" style="padding-left:18px">${esc(t)}</td></tr>`).join("")),
  ].join("") : "";
  const oneTimeSec = hasOneTimeSec ? [
    secRow("One-time charges"),
    ...m.oneTime.map((l) => priceRow(++n, l)),
    hansHosted && !hasCode("AS01") ? noteRow(++n, "Server setup: not applicable, hosted by Hans Infomatic") : "",
    hansHosted && !hasCode("AS02") ? noteRow(++n, "DSC server licence: not applicable, hosted by Hans Infomatic") : "",
    m.oneTime.length ? totRow("Total one-time charges", inr(t.oneTimeShown)) : "",
    D && t.overallOneTime > 0.5 ? totRow(`Less: discount ${m.overallPct}%`, "− " + inr(t.overallOneTime), "") + totRow("One-time charges after discount", inr(t.netOneTime)) : "",
  ].join("") : "";
  const amcSec = m.amc ? secRow("Annual maintenance (AMC), billed annually in advance") + m.amc.schedule.map((y) => `<tr><td>${++n}</td><td colspan="${cols - 1}">AMC, contract year ${y.contractYear}</td><td class="r">${inr(y.amount)}</td></tr>`).join("") : "";

  const prices = `
    <table class="pr"><thead><tr><th style="width:26px"></th><th>Description</th><th>Basis</th><th class="r">Rate (₹)</th>${D ? '<th class="r">Discount</th>' : ""}<th class="r">Users / qty</th><th class="r">Amount (₹)</th></tr></thead><tbody>
      ${fixedRows}${variableSec}${tradeSec}${oneTimeSec}${amcSec}
      <tr class="sec"><td></td><td colspan="${cols}">GST at ${m.gstPct}% (charged in addition, as applicable)</td></tr>
      ${hasFixed ? `<tr><td>${++n}</td><td colspan="${cols - 1}">GST on fixed recurring charges, per month</td><td class="r">${inr(t.gstSubs)}</td></tr>` : ""}
      ${m.usage.length ? `<tr><td>${++n}</td><td colspan="${cols - 1}">GST on variable charges</td><td class="r" style="color:#475569">On each invoice</td></tr>` : ""}
      ${m.oneTime.length ? `<tr><td>${++n}</td><td colspan="${cols - 1}">GST on one-time charges</td><td class="r">${inr(t.gstOneTime)}</td></tr>` : ""}
    </tbody></table>
    ${m.usage.length ? `<div class="note" style="font-style:normal">Variable charges are invoiced on the actual ${m.usage.length > 1 ? "volumes" : "volume"} used in each billing period at the rates above. No volume is committed${minimums.length ? (minimums.every((l) => l.fixedFee) ? "; each month the share of the difference to the fixed fee shown is added or deducted" : " beyond the minimum billing shown") : ""}.</div>` : ""}
    ${m.trade.length ? `<div class="note" style="font-style:normal">Charges billed to the trade are collected by Hans Infomatic from each user's pre-deposit account. At the end of each month Hans Infomatic sends you a revenue share statement of the transactions processed; you invoice your share, which is paid within ${shares.length ? Math.max(...shares.map((rs) => Number(rs.paymentDays) || 15)) : 15} days of receipt of your invoice.</div>` : ""}`;

  const who = m.preparedBy;
  const contactLine = [who.phone, who.email].filter(Boolean).join(" · ");
  const qr = opts.acceptUrl && !m.pending ? `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(opts.acceptUrl)}` : "";

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><title>${esc(quote.quoteNo || "Quotation")}</title><style>${CSS(m)}</style></head><body>
    <div class="lh">
      <div>
        <div class="co">${esc(String(c.name).toUpperCase())}</div>
        <div class="sm">${esc(c.headOffice)}<br>${[c.email, c.website].filter(Boolean).map(esc).join(" · ")}${c.otherOffices ? `<br>${esc(c.otherOffices)}` : ""}</div>
      </div>
      ${opts.logoUrl ? `<img src="${esc(opts.logoUrl)}" alt="Hans Infomatic" style="height:54px" onerror="this.style.display='none'">` : ""}
    </div>
    <div class="title">QUOTATION</div>
    <div class="top">
      <div>To,<br>${m.to.contact ? `<b>${esc(m.to.contact)}</b><br>` : ""}<b>${esc(m.to.company)}</b>${m.to.address.slice(0, 4).map((a) => `<br>${esc(a)}`).join("")}</div>
      <table class="meta"><tbody>
        <tr><td>Quotation no.</td><td>${esc(quote.quoteNo || "")}</td></tr>
        <tr><td>Date</td><td>${esc(fmtDate(quote.createdDate))}</td></tr>
        ${m.validUntil ? `<tr><td>Valid until</td><td>${esc(fmtDate(m.validUntil))}</td></tr>` : ""}
        <tr><td>Product</td><td>${esc(m.planName)}${m.hosted && m.subs.length ? " (web-based SaaS)" : ""}</td></tr>
        ${who.name ? `<tr><td>Prepared by</td><td>${esc(who.name)}</td></tr>` : ""}
        ${contactLine ? `<tr><td>Contact</td><td>${esc(contactLine)}</td></tr>` : ""}
        ${m.pending ? '<tr><td>Status</td><td class="pend">Draft, subject to approval <sup>*</sup></td></tr>' : ""}
      </tbody></table>
    </div>
    <p style="margin-top:16px"><b>Subject: Quotation for ${esc(m.planName)}</b></p>
    <p>Dear Sir / Madam,</p>
    <p>Thank you for the time you gave us to understand your operation. Following our discussion, we are pleased to share this quotation for ${esc(m.planName)}${m.customer ? ` for ${esc(m.customer)}` : ""}. It sets out the plan, the prices, the implementation and the terms.</p>

    ${m.about.length ? H(`About ${m.brand}`) + m.about.map((p) => `<p>${esc(p)}</p>`).join("") : ""}
    ${m.plan.length ? H("Your plan") + kv(m.plan) : ""}
    ${m.features.length ? H("Features included") + `<ul class="feat${m.features.length > 10 ? " two" : ""}">${m.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>${m.featureNote ? `<div class="note">${esc(m.featureNote)}</div>` : ""}` : ""}
    ${H("Prices")}${prices}
    ${m.notes.length ? H("Commercial notes") + `<ol class="n">${m.notes.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
    ${H("Implementation, training and support")}${kv(m.implementation)}
    ${H("Payment terms")}${kv(m.payment)}
    ${H("What you need")}${kv(m.requirements)}
    ${H("Terms and conditions")}<ol class="n">${m.governing.text || m.governing.url ? `<li>Governing terms. ${esc(m.governing.text)}${m.governing.url ? ` Read them at <a href="${esc(m.governing.url)}">${esc(m.governing.url)}</a>.` : ""}</li>` : ""}${m.terms.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>

    <div class="sign">
      <p>We look forward to working with ${esc(m.customer || "you")}. For any question, or a demonstration on your own shipments, please contact us.</p>
      <p>With warm regards,</p>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px">
        <div style="margin-top:26px">
          <b>${esc(who.name || c.signatoryName)}</b><br>
          ${esc([who.title, c.name].filter(Boolean).join(", "))}<br>
          ${contactLine ? `<span style="color:#64748B">${esc(contactLine)}</span><br>` : ""}
          <span style="color:#64748B;font-size:8.6pt">Authorised signatory, for ${esc(String(c.name).toUpperCase())}</span>
        </div>
        ${qr ? `<div style="text-align:center;font-size:7.6pt;color:#64748B"><img src="${qr}" width="92" height="92" alt="" onerror="this.style.display='none'"><br>Scan to accept this quotation online<br><span style="word-break:break-all">${esc(opts.acceptUrl)}</span></div>` : ""}
      </div>
    </div>
    <div class="footnotes">
      ${m.pending ? `<p><sup>*</sup> ${PENDING_NOTE}</p>` : ""}
      ${m.governing.url ? `<p><b>Terms:</b> this quotation is subject to the ${esc(m.governing.label)}: <a href="${esc(m.governing.url)}">${esc(m.governing.url)}</a></p>` : ""}
      <p>${esc(m.confidential)}</p>
    </div>
    ${opts.extraPagesHtml || ""}
    ${opts.autoPrint === false ? "" : "<script>window.onload=function(){window.print();}</script>"}
  </body></html>`;
}
