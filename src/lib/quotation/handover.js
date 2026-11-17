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
// scripts/test-quote-handover.mjs.

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
    billed: !!h.billId,
    confirmed: !!h.confirmedAt,
    project: !!h.projectId,
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
export function billFromQuote(q, { today, by, productId = "" }) {
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
