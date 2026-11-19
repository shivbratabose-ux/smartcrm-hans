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
import { resolveTermSets, termSetFor, eulaLinkOf, fillTerms, tcLines } from "./termSets.js";
import { slabTable } from "./slabs.js";
import { getQuoteTemplate } from "../../data/quoteTemplates.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const inr = (n) => "₹" + Math.round(num(n)).toLocaleString("en-IN");
const USAGE_MODELS = ["Per-transaction", "PaaS Per-Flight", "PaaS Per-Transaction"];
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
export function featuresOf(row, product) {
  const pc = row && PLAN_CONTENT[row.code];
  if (pc?.features?.length) return pc.features;
  const desc = String(row?.description || "").replace(/Includes [^.]*\./i, "").trim();
  const parts = desc.split(/;\s+|,\s+(?=[A-Z0-9])|\.\s+/).map((s) => s.replace(/\.$/, "").trim()).filter((s) => s.length > 2);
  if (parts.length >= 3) return parts.slice(0, 28);
  // Product modules as features — not price items (Plan / Add-on / Pricing entries, or ones carrying a ₹ price).
  const mods = (product?.modules || []).filter((m) => !/add-on|plan|pricing/i.test(m.type || "") && !/₹/.test(m.desc || "")).map((m) => m.name).filter(Boolean);
  return mods.slice(0, 28);
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
    const oneTime = isOneTimeModel(l.pricingModel);
    const usage = USAGE_MODELS.includes(l.pricingModel);
    const months = oneTime ? 1 : Math.max(1, num(l.months) || 1);
    const qty = Math.max(num(l.qty), num(row?.minQty));
    const afterLine = num(l.lineTotal) / months;                     // per month for recurring
    const net = afterLine * (1 - overallPct / 100);                  // after overall discount too
    const unit = String(l.unit || row?.unit || "").trim();
    const u = /^[A-Z/]{2,}$/.test(unit) ? unit : unit.toLowerCase();   // HBL, HAWB stay upper case
    const basis = oneTime ? "One time" : usage ? `Per ${u || "use"}` : `Per ${u || "unit"} per month`;
    return {
      code: l.productCode, name: l.name || row?.name || l.productCode, oneTime, usage, basis, qty, unit,
      slabs: row?.rateSource === "Slab" ? slabTable(row.slabs, `${unit || "units"} per month`) : null,
      listRate: num(l.unitPriceResolved), discountPct: num(l.discountPct),
      // What the customer sees: list rate + discount when shown; otherwise the net rate.
      rate: showDiscount ? num(l.unitPriceResolved) : (qty ? net / qty : net),
      amount: showDiscount ? afterLine : net,
      net,
    };
  });
  const oneTime = lines.filter((l) => l.oneTime);
  const subs = lines.filter((l) => !l.oneTime && !l.usage);
  const usage = lines.filter((l) => l.usage);
  const sum = (arr, k) => arr.reduce((s, l) => s + l[k], 0);

  // The line the quotation is "for": a subscription, else a licence, else a
  // pay-per-use service (e.g. AMS filing), else whatever is there.
  const main = subs[0] || oneTime.find((l) => /licen/i.test(String((quote.items || []).find((it) => it.productCode === l.code)?.pricingModel || ""))) || usage[0] || oneTime[0] || lines[0] || null;
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
    if (quote.hosting) plan.push(["Hosting", HOSTING_LABEL[quote.hosting] || quote.hosting]);
  }

  const template = product ? getQuoteTemplate(product.id) : null;
  const about = pContent.about || (template?.overview?.description ? [template.overview.description] : []);
  const ctx = { product: brand, customer, validUntil: longDate(validUntil), hosted, billing: h.billingFrequency, company: company.name, city: opts.city || "", paymentTerms: quote.paymentTerms || "", hasSubscription: subs.length > 0, hasOneTime: oneTime.length > 0 };
  const notes = String(h.termsText || quote.terms || "").split(/\n+/).map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);

  const netOneTime = sum(oneTime, "net"), netSubs = sum(subs, "net");
  const termSet = termSetFor(product?.id || mainRow?.productId || "", opts.termSets || resolveTermSets(null));
  const fillCtx = { product: brand, company: company.name, customer, validUntil: longDate(validUntil) };
  return {
    company, quote, customer, brand, planName, product, hosted, showDiscount, overallPct, gstPct, mainIsUsage: !!main && usage.includes(main),
    pending: awaitingApproval(quote),
    validUntil,
    to: { contact: h.billing?.billingContactName || quote.billingContactName || "", company: customer, address: String(h.party?.address || quote.billingAddressSnapshot || "").split(/\n|,\s*/).map((s) => s.trim()).filter(Boolean) },
    about, plan,
    features: main ? featuresOf(mainRow, product) : [],
    featureNote: (main && PLAN_CONTENT[main.code]?.featureNote) || "",
    oneTime, subs, usage,
    totals: {
      oneTimeShown: sum(oneTime, "amount"), subsShown: sum(subs, "amount"),
      overallOneTime: sum(oneTime, "amount") - netOneTime, overallSubs: sum(subs, "amount") - netSubs,
      netOneTime, netSubs,
      prepaymentDisc: num(h.prepaymentDisc), prepaymentPct: num(h.prepaymentDiscountPct),
      gstOneTime: netOneTime * gstPct / 100, gstSubs: netSubs * gstPct / 100,
    },
    amc: h.amc && h.amc.applies ? h.amc : null,
    notes,
    implementation: (pContent.sections?.implementation || STANDARD_SECTIONS.implementation)(ctx),
    payment: (pContent.sections?.payment || STANDARD_SECTIONS.payment)(ctx),
    requirements: (pContent.sections?.requirements || STANDARD_SECTIONS.requirements)(ctx),
    terms: tcLines(termSet, fillCtx),
    termSetId: termSet?.id || "",
    governing: { label: termSet?.eulaTitle || "terms of use", url: eulaLinkOf(termSet, opts.siteUrl), text: fillTerms(termSet?.governing || "", fillCtx) },
    confidential: CONFIDENTIAL_NOTE({ company: company.name, customer }),
    preparedBy: { name: opts.preparedBy?.name || quote.preparedBy || "", title: opts.preparedBy?.title || "", phone: opts.preparedBy?.phone || "", email: opts.preparedBy?.email || "" },
  };
}

const CSS = (m) => `
  @page { size: A4; margin: 13mm 14mm 16mm;
    @bottom-left { content: "${String(m.company.name).replace(/"/g, "")}${m.company.cin ? ` · CIN ${String(m.company.cin).replace(/"/g, "")}` : ""} · Confidential"; font: 7pt 'Segoe UI', Arial, sans-serif; color: #475569; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7pt 'Segoe UI', Arial, sans-serif; color: #475569; } }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; font-size: 9.6pt; line-height: 1.38; margin: 0; padding: 18px 22px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
  .feat { columns: 1; margin: 4px 0 0; padding: 0; list-style: none; } .feat li { padding: 1.5px 0 1.5px 22px; position: relative; break-inside: avoid; }
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
  const priceRow = (n, l) => `<tr><td>${n}</td><td>${esc(l.name)}</td><td>${esc(l.basis)}</td><td class="r">${inr(l.rate)}</td>${D ? `<td class="r">${l.discountPct ? `${l.discountPct}%` : "—"}</td>` : ""}<td class="r">${l.qty || ""}</td><td class="r">${inr(l.amount)}</td></tr>`;
  const noteRow = (n, text) => `<tr><td>${n}</td><td>${esc(text)}</td><td>One time</td><td></td>${D ? "<td></td>" : ""}<td></td><td></td></tr>`;
  const totRow = (label, value, cls = "tot") => `<tr class="${cls}"><td></td><td colspan="${cols - 1}">${esc(label)}</td><td class="r">${value}</td></tr>`;
  let n = 0;
  const hasCode = (code) => (quote.items || []).some((l) => l.productCode === code);

  const hansHosted = m.hosted && quote.hosting === "Hans";
  const hasMain = m.oneTime.length > 0 || m.subs.length > 0 || !!m.amc;
  const prices = `
    ${hasMain ? `<table class="pr"><thead><tr><th style="width:26px"></th><th>Description</th><th>Basis</th><th class="r">Rate (₹)</th>${D ? '<th class="r">Discount</th>' : ""}<th class="r">Users / qty</th><th class="r">Amount (₹)</th></tr></thead><tbody>
      ${m.oneTime.length || hansHosted ? `<tr class="sec"><td>A</td><td colspan="${cols}">One-time charges</td></tr>` : ""}
      ${m.oneTime.map((l) => priceRow(++n, l)).join("")}
      ${hansHosted && !hasCode("AS01") ? noteRow(++n, "Server setup: not applicable, hosted by Hans Infomatic") : ""}
      ${hansHosted && !hasCode("AS02") ? noteRow(++n, "DSC server licence: not applicable, hosted by Hans Infomatic") : ""}
      ${m.oneTime.length ? totRow("Total one-time charges", inr(t.oneTimeShown)) : ""}
      ${D && t.overallOneTime > 0.5 ? totRow(`Less: discount ${m.overallPct}%`, "− " + inr(t.overallOneTime), "") + totRow("One-time charges after discount", inr(t.netOneTime)) : ""}
      ${m.subs.length ? `<tr class="sec"><td>B</td><td colspan="${cols}">Subscription</td></tr>` : ""}
      ${m.subs.map((l) => priceRow(++n, l)).join("")}
      ${m.subs.length > 1 ? totRow("Total subscription per month", inr(t.subsShown)) : ""}
      ${D && t.overallSubs > 0.5 ? totRow(`Less: discount ${m.overallPct}%`, "− " + inr(t.overallSubs), "") + totRow("Subscription per month after discount", inr(t.netSubs)) : ""}
      ${t.prepaymentDisc > 0.5 ? totRow(`Prepayment discount ${t.prepaymentPct}% when the subscription term is paid in advance`, "− " + inr(t.prepaymentDisc), "") : ""}
      ${m.amc ? `<tr class="sec"><td>${m.subs.length ? "C" : "B"}</td><td colspan="${cols}">Annual maintenance (AMC), billed annually in advance</td></tr>${m.amc.schedule.map((y) => `<tr><td>${++n}</td><td colspan="${cols - 1}">AMC, contract year ${y.contractYear}</td><td class="r">${inr(y.amount)}</td></tr>`).join("")}` : ""}
      <tr class="sec"><td></td><td colspan="${cols}">GST at ${m.gstPct}% (charged in addition, as applicable)</td></tr>
      ${m.oneTime.length ? `<tr><td>${++n}</td><td colspan="${cols - 1}">GST on one-time charges</td><td class="r">${inr(t.gstOneTime)}</td></tr>` : ""}
      ${m.subs.length ? `<tr><td>${++n}</td><td colspan="${cols - 1}">GST on the subscription, per month</td><td class="r">${inr(t.gstSubs)}</td></tr>` : ""}
    </tbody></table>` : ""}
    ${m.usage.length ? `<p style="font-weight:800;color:#1F2F6B;margin:12px 0 2px">${m.mainIsUsage ? "Usage charges (billed monthly on the actual volume)" : "Add-on services (pay per use, activated on request)"}</p>
    <table class="pr pr2"><thead><tr><th style="width:26px"></th><th>Service</th><th>Basis</th><th class="r">Rate (₹)</th></tr></thead><tbody>
      ${m.usage.map((l, i) => {
        const fx = (r) => (D ? r : r * (1 - l.discountPct / 100));
        if (l.slabs && l.slabs.length) {
          return `<tr><td>${i + 1}</td><td colspan="3"><b>${esc(l.name)}</b>, ${esc(l.basis.replace(/^Per /, "per "))}: rate by the month's volume (the whole month is billed at its slab's rate)${D && l.discountPct ? `, less ${l.discountPct}% discount` : ""}</td></tr>`
            + l.slabs.map((s) => `<tr><td></td><td style="padding-left:18px">${esc(s.label)}</td><td>${esc(l.basis)}</td><td class="r">${s.rate != null ? inr(fx(s.rate)) : "On request"}</td></tr>`).join("");
        }
        return `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td>${esc(l.basis)}</td><td class="r">${l.listRate ? inr(fx(l.listRate)) : "On request"}</td></tr>`;
      }).join("")}
    </tbody></table>${hasMain ? "" : `<div class="note" style="font-style:normal">GST at ${m.gstPct}% is charged in addition, as applicable.</div>`}` : ""}`;

  const who = m.preparedBy;
  const contactLine = [who.phone, who.email].filter(Boolean).join(" · ");
  const qr = opts.acceptUrl && !m.pending ? `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(opts.acceptUrl)}` : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(quote.quoteNo || "Quotation")}</title><style>${CSS(m)}</style></head><body>
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
    ${m.features.length ? H("Features included") + `<ul class="feat">${m.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>${m.featureNote ? `<div class="note">${esc(m.featureNote)}</div>` : ""}` : ""}
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
