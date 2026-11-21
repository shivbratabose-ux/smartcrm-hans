// Quote → Accounts → Implementation handover (flow approved 14 Nov 2026).
//
//   Sales: quote (hosting, discount) → approval if needed → PDF with a KYC
//   last page → customer accepts + returns KYC → Sales marks the quote FINAL
//   → Accounts raises the bill from the quote's own numbers → customer
//   confirms → implementation project is created and the team is told.
//
// "Nothing verbal between Sales and Accounts": every value the bill and the
// project need is read from the quote here, never retyped.
//
// Pure functions only (no React, no Supabase) so the rules are unit-tested:
// scripts/test-quote-handover.mjs. Shared by the CRM (src/lib/quotation/handover.js)
// and the edge functions — keep it free of browser- and Deno-only APIs.

export const HOSTING_OPTIONS = ["Hans", "Client"];
export const HOSTING_LABEL = { Hans: "Hans-hosted (cloud)", Client: "Client-hosted (on customer's servers)" };

// ── KYC: legal name, PAN, GSTIN, registered address ──────────────────────
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
// A customer with no GST registration is recorded explicitly, never as blank.
export const GST_UNREGISTERED = "UNREGISTERED";

const clean = (s) => String(s == null ? "" : s).trim();
export const normaliseKyc = (k = {}) => ({
  legalName: clean(k.legalName).replace(/\s+/g, " "),
  pan: clean(k.pan).toUpperCase().replace(/\s+/g, ""),
  gstin: clean(k.gstin).toUpperCase().replace(/\s+/g, ""),
  address: clean(k.address),
});

/** The KYC a quote currently holds (same fields the quote forms already use). */
export const kycOf = (q = {}) => normaliseKyc({
  legalName: q.legalName, pan: q.pan, gstin: q.gstin, address: q.billingAddressSnapshot,
});

/** What is still wrong with a KYC set. Empty array = complete. */
export function kycProblems(k) {
  const { legalName, pan, gstin, address } = normaliseKyc(k);
  const out = [];
  if (legalName.length < 3) out.push("Legal name is missing");
  if (!pan) out.push("PAN is missing");
  else if (!PAN_RE.test(pan)) out.push("PAN should look like ABCDE1234F");
  if (!gstin) out.push("GSTIN is missing (or mark the customer as not GST-registered)");
  else if (gstin !== GST_UNREGISTERED) {
    if (!GSTIN_RE.test(gstin)) out.push("GSTIN should be 15 characters, like 27ABCDE1234F1Z5");
    // Characters 3–12 of a GSTIN are the holder's PAN.
    else if (PAN_RE.test(pan) && gstin.slice(2, 12) !== pan) out.push("GSTIN does not match the PAN");
  }
  if (address.length < 10) out.push("Registered address is missing");
  return out;
}
export const kycComplete = (q) => kycProblems(kycOf(q)).length === 0;

// ── Who approves, who is Accounts ────────────────────────────────────────
const liveUser = (u) => u && u.active !== false && !u.isDeleted && String(u.status || "Active").toLowerCase() !== "inactive";

/**
 * People who may approve quotes. Masters → Quotation → Config holds the list;
 * until someone is picked there, every top-level role approves (the old rule).
 */
export function approverIds(quoteConfig, orgUsers = [], globalRoles = []) {
  const live = orgUsers.filter(liveUser);
  const picked = (quoteConfig?.approverIds || []).filter((id) => live.some((u) => u.id === id));
  if (picked.length) return picked;
  return live.filter((u) => globalRoles.includes(u.role)).map((u) => u.id);
}

/** Accounts team: the picked list, else everyone with the Finance role. */
export function accountsIds(quoteConfig, orgUsers = []) {
  const live = orgUsers.filter(liveUser);
  const picked = (quoteConfig?.accountsUserIds || []).filter((id) => live.some((u) => u.id === id));
  if (picked.length) return picked;
  return live.filter((u) => u.role === "finance").map((u) => u.id);
}

/**
 * Does this quote still owe its approvers a notification? True when it is
 * Pending and no notice has been logged since it was (re)requested or last
 * decided — so an edit that needs approval again pings them again, once.
 */
export function approvalNoticeDue(q) {
  if (!q || q.approvalStatus !== "Pending") return false;
  const since = [q.approvalRequestedAt, q.approvedAt].filter(Boolean).sort().pop() || "";
  return !(q.changeLog || []).some((e) => e.field === "approvalNotice" && (e.at || "") >= since);
}

// ── FINAL ────────────────────────────────────────────────────────────────
/**
 * Why a quote cannot be marked FINAL yet. `sendBlocked` is the approval gate's
 * verdict (sendBlockedReason). Empty array = ready.
 */
export function finalBlockers(q, sendBlocked = "") {
  const out = [];
  if (q.status !== "Accepted") out.push("The customer has not accepted the quote yet");
  if (sendBlocked) out.push(`Approval: ${sendBlocked}`);
  if (!HOSTING_OPTIONS.includes(q.hosting)) out.push("Hosting (Hans / Client) is not set");
  kycProblems(kycOf(q)).forEach((p) => out.push(`KYC: ${p}`));
  return out;
}

export const handoverOf = (q) => (q && q.handover && typeof q.handover === "object" ? q.handover : {});

/** Where a quote is in the handover. */
export function handoverStage(q) {
  const h = handoverOf(q);
  return {
    accepted: q.status === "Accepted",
    final: !!q.isFinal && !!h.finalAt,
    billed: !!h.billId || !!h.noUpfrontBill,   // nothing to bill upfront: usage is billed monthly from Billing
    confirmed: !!h.confirmedAt,
    project: !!h.projectId || !!h.noProject,   // under ₹50 lakh and not ticked: implemented from the deal
  };
}

// ── Money ────────────────────────────────────────────────────────────────
const r2 = (n) => +(Number(n) || 0).toFixed(2);
/**
 * Bill figures in ₹ lakh (the unit Collections uses). Engine quotes carry
 * exact rupee figures in q.hans; older quotes only have the register totals.
 */
export function quoteAmounts(q) {
  const h = q.hans;
  if (h && Number(h.grandTotal) > 0) {
    return { taxable: r2(h.taxableBase / 1e5), gst: r2(h.gstTotal / 1e5), total: r2(h.grandTotal / 1e5) };
  }
  const total = r2(q.total), gst = r2(q.taxAmount);
  return { taxable: r2(total - gst), gst, total };
}

/** One line per quoted item: what Accounts bills and Implementation activates. */
export function scopeLines(q) {
  return (q.items || []).filter((it) => it && (it.name || it.description)).map((it) => {
    const qty = Number(it.qty ?? it.quantity) || 0;
    const unit = clean(it.unit);
    const mod = clean(it.module);
    const months = Number(it.months) || 0;
    return `${clean(it.name || it.description)}${mod && mod !== clean(it.name) ? ` [${mod}]` : ""}`
      + (qty ? ` × ${qty}${unit ? ` ${unit}` : ""}` : "")
      + (months ? ` · ${months} mo` : "");
  });
}

const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const rand = () => Math.random().toString(36).slice(2, 10);

/**
 * The bill Accounts raises — every value from the quote. The number is the
 * quote's own (PI-<quote no>), so the same quote can never be billed twice
 * under two numbers; Accounts replaces it with the tax-invoice number.
 */
export function billFromQuote(q, { today, by, productId = "", sac = "" }) {
  const a = quoteAmounts(q);
  const ref = q.quoteNo || q.id;
  const lines = scopeLines(q);
  return {
    id: `col_${rand()}`,
    invoiceNo: `PI-${ref}${(q.version || 1) > 1 ? `-v${q.version}` : ""}`,
    invoiceType: "Proforma Invoice",
    accountId: q.accountId || "",
    contractId: q.contractId || "",
    invoiceDate: today,
    dueDate: addDays(today, Number(q.creditDays) > 0 ? Number(q.creditDays) : 30),
    billPeriodFrom: today, billPeriodTo: "",
    billedAmount: a.taxable, gstAmount: a.gst, tdsAmount: 0, netPayable: a.total,
    collectedAmount: 0, pendingAmount: a.taxable,
    currency: q.currency || "INR",
    product: productId || q.product || "",
    status: "Current", paymentMode: "NEFT", paymentDate: "", agingBucket: "", followUpDate: "", chequeRef: "", approvedBy: "",
    owner: by,
    remarks: [
      `Raised from FINAL quote ${ref} (v${q.version || 1}).`,
      sac ? `SAC ${sac}.` : "",
      `Bill to: ${clean(q.legalName)} · PAN ${clean(q.pan)} · GSTIN ${clean(q.gstin)}.`,
      `Hosting: ${q.hosting || "—"}.`,
      lines.length ? `Lines: ${lines.join("; ")}.` : "",
      q.paymentTerms ? `Payment terms: ${q.paymentTerms}.` : "",
      q.poNumber ? `PO: ${q.poNumber}.` : "",
    ].filter(Boolean).join(" "),
  };
}

export function nextProjectNo(projects = [], year) {
  const seq = projects.reduce((m, p) => { const x = String(p.projectNo || "").match(/PRJ-\d{4}-(\d+)/); return x ? Math.max(m, +x[1]) : m; }, 0) + 1;
  return `PRJ-${year}-${String(seq).padStart(3, "0")}`;
}

/** The implementation project, scoped to exactly what was quoted. */
export function projectFromQuote(q, { today, projectNo, leadUserId, products = [], accountName = "" }) {
  const ref = q.quoteNo || q.id;
  const lines = scopeLines(q);
  const a = quoteAmounts(q);
  return {
    id: `prj_${rand()}`,
    projectNo,
    name: q.title || `${accountName || clean(q.legalName) || "Customer"} – implementation`,
    accountId: q.accountId || "", oppId: q.oppId || "", contractId: q.contractId || "",
    owner: leadUserId || q.owner || "",
    products,
    status: "Requirement Gathering", progress: 0,
    startDate: today, goLiveTarget: "", goLiveActual: "",
    value: a.total,
    scope: [`Per FINAL quote ${ref} (v${q.version || 1}).`, `Hosting: ${HOSTING_LABEL[q.hosting] || q.hosting || "—"}.`,
      lines.length ? `Modules / items to activate:\n- ${lines.join("\n- ")}` : ""].filter(Boolean).join("\n"),
    deliverables: lines.join("\n"), risks: "",
    notes: `Auto-created when the customer confirmed the bill for quote ${ref}. Activate only what the quote lists.`,
    milestones: [],
    team: [...new Set([leadUserId, q.owner].filter(Boolean))].map((userId, i) => ({ userId, role: i === 0 && leadUserId ? "Delivery Lead" : "Sales Owner" })),
    createdDate: today,
  };
}

// ── Customer-facing links ────────────────────────────────────────────────
// Customers only ever see the Smart CRM address — also when the quote is made
// on the internal Hans CRM host (rule from the 14 Nov meeting).
export const SMART_CRM_URL = "https://smartcrm-hans.vercel.app";
export function customerBaseUrl(envUrl, loc) {
  const fromEnv = clean(envUrl).replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const host = loc?.hostname || "";
  // A developer's own machine keeps its own address so links can be tested.
  if (host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost")) return clean(loc.origin);
  return SMART_CRM_URL;
}
export const acceptLink = (base, token) => `${base}/#/quote-accept/${token}`;

// ── KYC page: the last page of every quote PDF ───────────────────────────
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function kycPageHtml(q, { acceptUrl = "", seller = "Hans Infomatic Pvt. Ltd." } = {}) {
  const k = kycOf(q);
  const line = (label, value, hint = "") => `
    <tr><td class="kyc-l">${esc(label)}${hint ? `<div class="kyc-h">${esc(hint)}</div>` : ""}</td>
        <td class="kyc-v">${value ? esc(value) : "&nbsp;"}</td></tr>`;
  const gst = k.gstin === GST_UNREGISTERED ? "Not registered under GST" : k.gstin;
  return `
  <div class="kyc-page" style="page-break-before:always;break-before:page;padding-top:8px;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
    <style>
      .kyc-page h2{font-size:15px;margin:0 0 2px;letter-spacing:.3px}
      .kyc-page .kyc-sub{font-size:10.5px;color:#475569;margin-bottom:12px}
      .kyc-page table.kyc{width:100%;border-collapse:collapse;margin-bottom:12px}
      .kyc-page .kyc-l{width:34%;border:1px solid #94a3b8;background:#f1f5f9;padding:9px 10px;font-size:11px;font-weight:700;vertical-align:top}
      .kyc-page .kyc-h{font-weight:400;color:#64748b;font-size:9px;margin-top:2px}
      .kyc-page .kyc-v{border:1px solid #94a3b8;padding:9px 10px;font-size:12px;height:34px;vertical-align:top}
      .kyc-page .kyc-tall .kyc-v{height:74px}
      .kyc-page .kyc-sign{display:flex;gap:16px;margin-top:8px}
      .kyc-page .kyc-box{flex:1;border:1px solid #94a3b8;height:92px;padding:6px 8px;font-size:9.5px;color:#64748b}
      .kyc-page .kyc-note{font-size:10px;color:#334155;line-height:1.5;margin-top:10px}
    </style>
    <h2>CUSTOMER KYC &amp; BILLING DETAILS</h2>
    <div class="kyc-sub">Quotation ${esc(q.quoteNo || q.id || "")} · Please complete and return this page with your confirmation.
      ${esc(seller)} raises the invoice, licence (ULA) and agreement exactly as written here.</div>
    <table class="kyc">
      ${line("Legal name of the company", k.legalName, "As on PAN / GST certificate")}
      ${line("PAN", k.pan, "10 characters, e.g. ABCDE1234F")}
      ${line("GSTIN", gst, "15 characters — or write \"Not registered\"")}
      <tbody class="kyc-tall">${line("Registered / billing address", k.address, "With state and PIN code")}</tbody>
      ${line("Hosting", HOSTING_LABEL[q.hosting] || "", "As quoted")}
      ${line("Authorised signatory — name & designation", "")}
      ${line("E-mail & mobile for invoices", clean(q.billingContactEmail || q.financeContactEmail))}
    </table>
    <div class="kyc-sign">
      <div class="kyc-box">Signature of authorised signatory</div>
      <div class="kyc-box">Company stamp</div>
      <div class="kyc-box">Date</div>
    </div>
    <div class="kyc-note">
      ${acceptUrl ? `<b>Faster:</b> accept the quotation and enter these details online at <span style="word-break:break-all">${esc(acceptUrl)}</span><br>` : ""}
      By returning this page (or accepting online) you confirm the quotation above and that the details given are correct.
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════════════════
// Phase 2 — Accounts pack, customer bill pack, online confirmation, delivery
// ════════════════════════════════════════════════════════════════════════

// ── ULA + Agreement templates (Masters → Quotation Pricing → Documents) ──
// Stored in masters.quotation.documents = { ula: {title, body}, agreement: {…} }.
// The body is plain text with {{placeholders}}; the CRM fills them from the
// quote and its KYC, so the documents always match the bill.
export const DOC_KINDS = [
  { key: "ula", title: "Software Licence Agreement (ULA)" },
  { key: "agreement", title: "Agreement" },
];
export const DOC_PLACEHOLDERS = [
  ["customer.legalName", "Customer legal name"],
  ["customer.pan", "Customer PAN"],
  ["customer.gstin", "Customer GSTIN"],
  ["customer.address", "Registered address"],
  ["quote.no", "Quote number"],
  ["quote.date", "Quote date"],
  ["quote.version", "Quote version"],
  ["quote.taxable", "Taxable value (₹)"],
  ["quote.gst", "GST (₹)"],
  ["quote.total", "Total incl. GST (₹)"],
  ["hosting", "Hosting (Hans / Client)"],
  ["modules", "Modules / items quoted (list)"],
  ["users", "Number of users"],
  ["paymentTerms", "Payment terms"],
  ["bill.no", "Bill number"],
  ["today", "Date of the document"],
  ["seller.name", "Hans Infomatic Pvt. Ltd."],
];

export function resolveDocuments(masters) {
  const d = masters?.quotation?.documents || {};
  return DOC_KINDS.map((k) => ({
    key: k.key,
    title: clean(d[k.key]?.title) || k.title,
    body: String(d[k.key]?.body || ""),
  }));
}
export const documentsReady = (docs) => docs.length > 0 && docs.every((d) => d.body.trim().length >= 40);

const rupees = (lakh) => "₹" + Math.round((Number(lakh) || 0) * 1e5).toLocaleString("en-IN");
const longDate = (iso) => {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

/** Values for the placeholders, all read from the quote (nothing typed). */
export function docContext(q, { today, sellerName = "Hans Infomatic Pvt. Ltd." } = {}) {
  const k = kycOf(q);
  const a = quoteAmounts(q);
  const users = (q.items || []).filter((it) => /user/i.test(String(it.unit || ""))).reduce((n, it) => n + (Number(it.qty ?? it.quantity) || 0), 0);
  const h = handoverOf(q);
  return {
    "customer.legalName": k.legalName,
    "customer.pan": k.pan,
    "customer.gstin": k.gstin === GST_UNREGISTERED ? "Not registered under GST" : k.gstin,
    "customer.address": k.address,
    "quote.no": q.quoteNo || q.id || "",
    "quote.date": longDate(q.createdDate),
    "quote.version": String(q.version || 1),
    "quote.taxable": rupees(a.taxable),
    "quote.gst": rupees(a.gst),
    "quote.total": rupees(a.total),
    hosting: HOSTING_LABEL[q.hosting] || q.hosting || "",
    modules: scopeLines(q).join("\n"),
    users: users ? String(users) : "",
    paymentTerms: clean(q.paymentTerms),
    "bill.no": h.billNo || "",
    today: longDate(today),
    "seller.name": sellerName,
  };
}

/**
 * Fill a template. Returns safe HTML plus the placeholders that had no value
 * (shown highlighted so nobody signs a document with a gap in it).
 */
export function fillTemplate(text, ctx) {
  const missing = new Set();
  const out = esc(String(text || "")).replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (_, key) => {
    const v = ctx[key];
    if (v == null || String(v).trim() === "") { missing.add(key); return `<mark style="background:#FEF3C7">[${key}]</mark>`; }
    if (key === "modules") return String(v).split("\n").map((l) => `• ${esc(l)}`).join("<br>");
    return esc(v);
  });
  const html = out.split(/\n{2,}/).map((p) => `<p style="margin:0 0 9px;line-height:1.55">${p.replace(/\n/g, "<br>")}</p>`).join("");
  return { html, missing: [...missing] };
}

/** ULA + Agreement as print pages (each on a new page). */
export function documentPagesHtml(q, docs, opts = {}) {
  const ctx = docContext(q, opts);
  return docs.filter((d) => d.body.trim()).map((d) => `
  <div style="page-break-before:always;break-before:page;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;font-size:11.5px">
    <h2 style="font-size:15px;margin:0 0 4px">${esc(d.title)}</h2>
    <div style="font-size:10px;color:#64748b;margin-bottom:12px">Quotation ${esc(ctx["quote.no"])} · ${esc(ctx["customer.legalName"])}</div>
    ${fillTemplate(d.body, ctx).html}
  </div>`).join("");
}

// ── Customer bill confirmation (the "deemed signed" step) ──
export const billConfirmLink = (base, token) => `${base}/#/bill-confirm/${token}`;
export const isToken = (t) => /^[a-f0-9]{32,80}$/i.test(String(t || ""));

/** Where the customer bill pack goes: billing contact, else finance contact, else the quote contact. */
export function customerBillEmail(q, contactEmail = "") {
  const ok = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(e));
  return [q.billingContactEmail, q.financeContactEmail, contactEmail].map(clean).find(ok) || "";
}

// ── E-mails (sent by the quote-handover function once mail is set up) ──
const mrow = (k, v) => `<tr><td style="padding:5px 10px;color:#64748b;font-size:12px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:5px 10px;font-size:13px">${v}</td></tr>`;
const mshell = (title, inner) => `<div style="font-family:'Segoe UI',Arial,sans-serif;color:#0f172a;max-width:640px">
  <div style="background:#1B6B5A;color:#fff;padding:12px 16px;border-radius:8px 8px 0 0;font-weight:700">${esc(title)}</div>
  <div style="border:1px solid #E2E9EF;border-top:0;border-radius:0 0 8px 8px;padding:14px 16px">${inner}</div></div>`;

/** To each Accounts person when Sales marks a quote FINAL. */
export function accountsPackEmail(q, { crmUrl, finalByName = "", accountName = "", docs = [] } = {}) {
  const k = kycOf(q), a = quoteAmounts(q), lines = scopeLines(q);
  const ready = documentsReady(docs);
  const subject = `FINAL quote ${q.quoteNo || q.id} — raise the bill (${k.legalName || accountName})`;
  const html = mshell("Quote marked FINAL — please raise the bill", `
    <p style="margin:0 0 10px;font-size:13px">${esc(finalByName || "Sales")} marked this quote FINAL. Everything below comes from the quote in Smart CRM — nothing to retype.</p>
    <table style="border-collapse:collapse;width:100%;margin-bottom:10px">
      ${mrow("Quote", `<b>${esc(q.quoteNo || q.id)}</b> v${esc(q.version || 1)} · ${esc(q.title || "")}`)}
      ${mrow("Bill to", `<b>${esc(k.legalName)}</b>`)}
      ${mrow("PAN / GSTIN", `${esc(k.pan)} · ${esc(k.gstin === GST_UNREGISTERED ? "Not registered under GST" : k.gstin)}`)}
      ${mrow("Address", esc(k.address).replace(/\n/g, "<br>"))}
      ${mrow("Hosting", esc(HOSTING_LABEL[q.hosting] || q.hosting || "—"))}
      ${mrow("Amount", `Taxable ${rupees(a.taxable)} + GST ${rupees(a.gst)} = <b>${rupees(a.total)}</b>`)}
      ${mrow("Payment terms", esc(q.paymentTerms || "—"))}
      ${q.poNumber ? mrow("PO", esc(q.poNumber)) : ""}
      ${mrow("Lines", lines.map(esc).join("<br>") || "—")}
    </table>
    <p style="margin:0 0 8px;font-size:12.5px"><b>Pack:</b> final quote with the KYC page${ready ? ", ULA and Agreement" : " (the ULA and Agreement templates are not set up in Masters yet)"}. Open the quote and click <b>Accounts pack</b> to print it or save it as PDF.</p>
    <p style="margin:0"><a href="${esc(crmUrl)}" style="background:#1B6B5A;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px">Open Quotations in Smart CRM</a></p>`);
  return { subject, html };
}

/** To the customer when Accounts sends the bill. */
export function customerBillPackEmail(q, { link, bill = null, docs = [], sellerName = "Hans Infomatic Pvt. Ltd.", contactName = "", paymentHtml = "", billNote = "" } = {}) {
  const a = quoteAmounts(q);
  const h = handoverOf(q);
  const billNo = bill?.invoiceNo || h.billNo || "";
  const names = docs.filter((d) => d.body.trim()).map((d) => d.title);
  const subject = `${sellerName}: bill ${billNo} for quotation ${q.quoteNo || q.id}`;
  const html = mshell(`Bill ${billNo} — please review and confirm`, `
    <p style="margin:0 0 10px;font-size:13px">Dear ${esc(contactName || kycOf(q).legalName || "Customer")},</p>
    <p style="margin:0 0 10px;font-size:13px">Thank you for accepting quotation <b>${esc(q.quoteNo || q.id)}</b>. The bill${names.length ? ` and the ${names.map(esc).join(" and ")}` : ""} are at the link below.</p>
    <table style="border-collapse:collapse;margin-bottom:12px">
      ${mrow("Bill", `<b>${esc(billNo)}</b>`)}
      ${mrow("Amount", `<b>${rupees(bill?.netPayable ?? a.total)}</b> incl. GST`)}
      ${bill?.dueDate ? mrow("Due by", esc(longDate(bill.dueDate))) : ""}
    </table>
    <p style="margin:0 0 14px"><a href="${esc(link)}" style="background:#1B6B5A;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px">Review &amp; confirm</a></p>
    ${paymentHtml ? `<div style="margin:0 0 12px"><div style="font-size:12px;font-weight:700;margin-bottom:4px">Payment details</div>${paymentHtml}</div>` : ""}
    ${billNote ? `<p style="margin:0 0 8px;font-size:11.5px;color:#64748b">${esc(billNote)}</p>` : ""}
    <p style="margin:0;font-size:11.5px;color:#64748b">Confirming online is treated as signing the documents, and our implementation team starts as soon as you confirm. If anything is wrong, reply to this e-mail before confirming.</p>`);
  return { subject, html };
}

// ── Delivery complete ──
export const DELIVERED_STATUSES = ["Go-Live", "Hypercare", "Closed"];
export const becameDelivered = (prev, next) => DELIVERED_STATUSES.includes(next?.status) && !DELIVERED_STATUSES.includes(prev?.status);
