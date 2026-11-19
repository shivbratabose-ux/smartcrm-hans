// Wording for the customer quotation (format approved Nov 2026, from the
// Orbis EDI Intelligent quotation DEL/SQ/0035/2627). Product- and plan-specific
// text lives here; anything not listed is derived from the price list and the
// Product Catalogue (lib/quotation/quoteDocument.js), never invented.

const SAATHI = "Saathi, OrbisOne's AI agents, work alongside your team: they read documents, check filings, watch cut-offs and keep receivables up to date. Your people approve every step, and every action is kept in the audit trail. OrbisOne is delivered as a web-based SaaS service hosted by Hans Infomatic: there is no hardware to buy, and your team works from any modern browser.";

// Keyed by Product Catalogue id.
export const PRODUCT_CONTENT = {
  OrbisEDI: {
    brand: "OrbisOne",
    about: [
      "Orbis EDI is the customs clearance edition of OrbisOne, the AI-native freight management ERP from Hans Infomatic. Shipping bills, and bills of entry from March 2027, are prepared, checked and filed with ICEGATE from the job, with documents, status and history kept on one record.",
      SAATHI,
    ],
  },
  OrbisOne: {
    brand: "OrbisOne",
    about: [
      "OrbisOne is the AI-native freight management ERP from Hans Infomatic. Shipments, customs filing, billing and accounts run on one record, with documents, status and history kept together.",
      SAATHI,
    ],
  },
};

// Keyed by price-row code. `features` replaces the list derived from the row's description.
export const PLAN_CONTENT = {
  OE02: {
    purpose: "Faster customs filing with automation and AI checks",
    extra: [["Saathi included", "Reader, Checker, Watcher, Messenger and Approval Saathi"]],
    features: [
      "Manual shipment and job status update", "Shipping Bill job, checklist and ICEGATE 2.0 filing", "Bill of Entry job and ICEGATE filing (by March 2027)",
      "Standard EDI checklist, reports and print formats", "Quick Entry", "Single-Excel upload for a complete job", "Automatic e-Sanchit",
      "Automatic IRN / DRN attachment", "Auto Status Update", "Customs Status Update", "Report Designer", "Duty Calculator",
      "Automatic compliance checks before filing", "Partner agency (PGA) compliance checks", "AI assistance for compliance and duty check",
      "Reader Saathi AI document reading (pay per page)",
    ],
    featureNote: "Items marked by March 2027 arrive in the next release, by 31 March 2027. Items marked Roadmap are planned for a later release. Exact scope is confirmed in the order.",
  },
};

// Which terms govern the product quoted (linked from the quotation, not printed in full).
// Orbis products → the OrbisOne terms; everything else → the Hans MSA & EULA.
// Links can be changed in Quotation Rules config: termsUrlOrbis / termsUrlEula.
export const SMART_CRM_SITE = "https://smartcrm-hans.vercel.app";
export const GOVERNING_TERMS = {
  orbis: { key: "orbis", label: "OrbisOne terms of use", url: "https://orbisone.in/terms.html",
    text: (p) => `Use of ${p.product} is governed by the OrbisOne terms of use and the subscription agreement and data processing addendum signed on order. The accepted quotation serves as the order.` },
  eula: { key: "eula", label: "Hans Infomatic Master Services Agreement & EULA", url: `${SMART_CRM_SITE}/legal/msa-eula-icaffe.html`,
    text: (p) => `Use of ${p.product} is governed by the Hans Infomatic Master Services Agreement and End-User Licence Agreement (MSA & EULA). The accepted quotation serves as the Order Form under it.` },
};
const ORBIS_PRODUCTS = ["OrbisOne", "OrbisEDI"];
/** Governing terms for a Product Catalogue id, with links overridable from config. */
export function governingTermsFor(productId, config = {}) {
  const t = ORBIS_PRODUCTS.includes(productId) ? GOVERNING_TERMS.orbis : GOVERNING_TERMS.eula;
  const url = String((t.key === "orbis" ? config.termsUrlOrbis : config.termsUrlEula) || "").trim() || t.url;
  return { ...t, url };
}

/** Footnote on every quotation. `p` = { company, customer }. */
export const CONFIDENTIAL_NOTE = (p) => `Confidential. This quotation, including its prices, rates, discounts, product scope, plan details and terms, is confidential and proprietary information of ${p.company}, shared only with ${p.customer || "the addressee"} to evaluate this proposal. Please do not disclose, copy, publish or forward it, in whole or in part, to any third party (including other vendors, consultants or competitors) without our prior written consent, except to your own employees and advisers who need to know it for this evaluation and are bound by confidentiality obligations no less strict than these. If you have received it in error, please let us know and delete it. These obligations continue whether or not an order is placed, in line with the confidentiality clause of the governing terms.`;

/** Standard sections, used unless a product overrides them. `p` = { product, customer, validUntil, hosted, billing, company, city }. */
export const STANDARD_SECTIONS = {
  implementation: (p) => [
    ["Installation and go-live", "Within 15 working days: set-up, help with migrating master data, configuration and user acceptance sign-off by our onboarding team."],
    ["User training", `10 days of structured training, 2 hours a day, at your premises${p.city ? ` in ${p.city}` : ""}, covering your users, with training material.`],
    ["Other locations", "Training at other branches can be arranged; travel and stay are charged at actuals by mutual agreement."],
    ["Support", "Helpdesk from 9:30 am to 6:30 pm, Monday to Saturday, except public holidays. Priority support with a named representative is available as an option."],
  ],
  payment: (p) => [
    ["One-time charges", p.paymentTerms || "50% with the purchase order; set-up starts on receipt. 50% on go-live and user acceptance sign-off."],
    p.hasSubscription && ["Subscription", `Billed ${String(p.billing || "quarterly").toLowerCase()} in advance, starting from go-live.`],
    ["How to pay", `Account-payee cheque, RTGS or NEFT in favour of ${p.company}, payable at New Delhi. Fees once received are not refundable.`],
  ].filter(Boolean),
  requirements: (p) => [
    ["Users", "Windows 10 or 11, or a recent macOS; Chrome (recommended), Edge or Firefox; at least 8 GB RAM and an Intel Core i3 or equivalent; screen 1366 x 768 or higher; a stable broadband connection (5 Mbps leased line recommended for offices)."],
    ["Server", p.hosted
      ? `Not needed: ${p.product} is hosted by Hans Infomatic.`
      : "Hosted on your own servers: Windows Server 2019 or later (licensed), IIS 10 or later with .NET Framework 4.5+, Microsoft SQL Server 2019 or later, and a leased line of at least 10 Mbps. Hardware and licensed software are not included in this quotation."],
  ],
  terms: (p) => [
    ["Intellectual property", `${p.product}, including any customisation, remains the property of ${p.company} You receive a non-exclusive, non-transferable right to use it as set out in this quotation.`],
    ["Master data", "Master data such as airlines, airports, countries, cities and customs codes is maintained with care, but please cross-check it against authorised published sources. Hans Infomatic is not liable for loss caused by errors in such data."],
    ["Confidentiality", "The contents of this quotation are confidential and may not be shared with third parties without written consent. A separate NDA will be signed."],
    ["Your data", "Your data stays yours. On request, or when the contract ends, we hand it over in database and PDF format, and then delete it securely. Keeping data after the contract ends is charged at 500 rupees per GB per month."],
    ["Continuity", "If fees remain unpaid, the service is suspended. Hans Infomatic is not liable for business loss arising from the suspension."],
    ["Assumptions", "You provide a stable internet connection, compatible devices and any licensed software needed, give access to master data for migration, and own any third-party integration not quoted here. On-site training is confirmed at least four weeks in advance."],
    ["Validity", `This quotation is valid until ${p.validUntil}. Disputes are subject to the jurisdiction of the courts of Delhi, India.`],
  ],
};
