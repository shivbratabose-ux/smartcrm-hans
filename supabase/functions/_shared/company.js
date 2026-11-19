// Seller details printed on quotes, packs and bills — Quotation Rules →
// "Company & bank details" (quoteConfig.company). Defaults are the wording on
// Hans Infomatic's own quotations; registration numbers and bank details are
// left blank here and entered once by an admin (they print only when set).
// Pure (no React) so the edge functions can share it.

export const COMPANY_DEFAULTS = {
  name: "Hans Infomatic Pvt. Ltd.",
  regdOffice: "A-1023, Surya Bhawan, Street No. 6, Vill. Mahipalpur, New Delhi-110037 · Ph.: 011-26784215",
  headOffice: "D-105, Sector-63, Noida-201301, India · Phone: +91-120-4514308-322",
  otherOffices: "Mumbai Office: Tel. 91-22-22655610, 91-22-9323736618",
  email: "hansinfo@hansinfomatic.com",
  website: "www.hansinfomatic.com",
  certifications: "A CMMI Level-3 & ISO 9001:2015, 27001:2013 Company",
  signatoryName: "Parvinder Singh",
  signatoryTitle: "",
  coverLetter: "We thank you for providing us the opportunity to display and explain our software solutions for Freight and Cargo Industry. Subsequent to our discussions, we are pleased to offer you the following rates as annexed to this letter. We hope these rates will match your expectations and you will give us the privilege of serving you.",
  // Entered by an admin (shown only when filled in):
  cin: "", gstin: "", pan: "", msme: "",
  sac: "997331",
  bankAccountName: "", bankName: "", bankAccount: "", bankIfsc: "", bankMicr: "", bankBranch: "",
  billNote: "Terms and conditions as per quotation, Licence Agreement and as specified with the invoice. All disputes are subject to Delhi jurisdiction.",
};

const clean = (s) => String(s == null ? "" : s).trim();
export function companyOf(config = {}) {
  const c = config && typeof config.company === "object" && config.company ? config.company : {};
  const out = { ...COMPANY_DEFAULTS };
  Object.keys(COMPANY_DEFAULTS).forEach((k) => { if (clean(c[k])) out[k] = clean(c[k]); });
  return out;
}

/** Registration line, e.g. "CIN U74… · GSTIN 07… · PAN AA…" — only the parts that are set. */
export function registrationLine(c) {
  return [c.cin && `CIN: ${c.cin}`, c.gstin && `GSTIN: ${c.gstin}`, c.pan && `PAN: ${c.pan}`].filter(Boolean).join(" · ");
}

/** Bank details for paying a bill; null until the account is entered. */
export function paymentDetails(c) {
  if (!clean(c.bankAccount)) return null;
  return {
    accountName: c.bankAccountName || c.name, bankName: c.bankName, account: c.bankAccount,
    ifsc: c.bankIfsc, micr: c.bankMicr, branch: c.bankBranch, msme: c.msme, sac: c.sac,
  };
}

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

/** Letterhead block (HTML) for printed quotes. */
export function letterheadHtml(c, { compact = false } = {}) {
  const reg = registrationLine(c);
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;line-height:1.35">
    <div style="font-size:${compact ? 12 : 16}pt;font-weight:800;letter-spacing:.3px;color:#0f172a">${esc(String(c.name).toUpperCase())}</div>
    ${compact ? "" : `<div style="font-size:8pt;color:#475569"><b>Regd. office:</b> ${esc(c.regdOffice)}</div>
    <div style="font-size:8pt;color:#475569"><b>Head Office:</b> ${esc(c.headOffice)}</div>
    ${c.otherOffices ? `<div style="font-size:8pt;color:#475569">${esc(c.otherOffices)}</div>` : ""}`}
    <div style="font-size:8pt;color:#475569">${[c.email && `Email: ${esc(c.email)}`, c.website && `Website: ${esc(c.website)}`].filter(Boolean).join(" · ")}</div>
    ${reg ? `<div style="font-size:8pt;color:#475569">${esc(reg)}</div>` : ""}
    ${c.certifications && !compact ? `<div style="font-size:8pt;font-weight:700;color:#1e293b;margin-top:1px">${esc(c.certifications)}</div>` : ""}
  </div>`;
}

/** Bank / tax block (HTML) for bills. */
export function paymentBlockHtml(c) {
  const p = paymentDetails(c);
  const rows = [
    p && ["Bank A/c name", p.accountName], p && ["Bank A/c no.", p.account], p && ["Bank", p.bankName],
    p && ["RTGS / NEFT / IFSC", p.ifsc], p && ["MICR", p.micr], p && ["Bank address", p.branch],
    c.sac && ["SAC code", c.sac], c.msme && ["MSME Reg. no.", c.msme],
  ].filter((r) => r && clean(r[1]));
  if (!rows.length) return "";
  return `<table style="border-collapse:collapse;font-size:12px">${rows.map(([k, v]) => `<tr><td style="padding:3px 10px 3px 0;color:#64748b;white-space:nowrap">${esc(k)}</td><td style="padding:3px 0">${esc(v)}</td></tr>`).join("")}</table>`;
}
