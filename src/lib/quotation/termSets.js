// Terms sets: which EULA and which Terms & Conditions go on a quotation, per
// product (Masters → Quotation Rules → Terms & EULA).
//
// A set = { id, name, productIds[], isDefault, eulaTitle, eulaMode: "link" |
// "text", eulaUrl, eulaBody, governing, tc, updatedAt }.
//   • The quotation never prints the EULA in full: it links to it. In "link"
//     mode the link is eulaUrl; in "text" mode the EULA is written in the CRM
//     and published at <CRM>/#/terms/<id> (served by the quote-terms function).
//   • `tc` is the Terms and conditions section, one condition per line.
//   • `governing` is the first condition ("Governing terms. …" + the link).
//   • {{product}} {{company}} {{customer}} {{validUntil}} fill from the quote.
//   • byBilling: an optional link per billing structure (decision 21 Nov
//     2026: the company supplies the documents, the CRM only links them), e.g.
//     { licence: "https://…/licence-terms.pdf" }. A quote links to the one for
//     its billing structure, else to the set's EULA link.
// Saved in masters.quotation.termSets (array); the two built-in sets below
// apply until edited, and can be reset.
import { STANDARD_SECTIONS } from "../../data/quoteContent.js";

export const SMART_CRM_SITE = "https://smartcrm-hans.vercel.app";
export const TERMS_PLACEHOLDERS = [
  ["product", "Product name (e.g. OrbisOne, iCAFFE)"],
  ["company", "Hans Infomatic Pvt. Ltd."],
  ["customer", "Customer name"],
  ["validUntil", "Valid-until date of the quote"],
];

/** The standard Terms and conditions, one per line, with placeholders. */
export const DEFAULT_TC = STANDARD_SECTIONS.terms({ product: "{{product}}", company: "{{company}}", validUntil: "{{validUntil}}" })
  .map(([k, v]) => `${k}. ${v}`).join("\n");

/** Terms for the AMS filing services (from the GMR Airport AMS quotation, Jul 2025). */
export const AMS_TC = [
  "Billing. Usage charges are billed on the 1st day of each month, on the actual volume filed in the previous month.",
  "Escalation. Rates escalate by 10% every year.",
  "Taxes. GST and government levies are charged extra; any statutory change, new duty or tax is billed additionally. Other than TDS, no other deductions are allowed.",
  "Customs charges. Customs receipted charges, bank challans, penalties and levies are on the customer's account.",
  "Payment. Invoices are payable as per the Master MSA, or else within 7 days of the invoice date. Delayed payments attract interest on the outstanding amount as per MSME guidelines.",
  "DSC. The customer provides the DSC of its authorised person registered at ICEGATE; it is used only for the customer's filings.",
  "ICEGATE. Filing, acknowledgement and approval of IGM, EGM, amendments, CTM and TP are subject to ICEGATE.",
  "Liability. {{company}} is not liable for indirect, incidental or consequential loss, including loss of profit, business or data. Liability, if any, is limited to the total value of the quoted services, except for gross negligence or wilful misconduct.",
  "Data retention. Transactional records are kept as per the standard policy or the master agreement; extended retention can be agreed in the final agreement.",
  "Validity. This quotation is valid until {{validUntil}}; after that the rates may be renegotiated. Once accepted, the rates are firm for the contract period under normal business conditions, subject to the yearly escalation.",
].join("\n");

export const BUILTIN_TERM_SETS = [
  {
    id: "orbis", name: "OrbisOne products", productIds: ["OrbisOne", "OrbisEDI"], isDefault: false,
    eulaTitle: "OrbisOne terms of use", eulaMode: "link", eulaUrl: "https://orbisone.in/terms.html", eulaBody: "",
    governing: "Use of {{product}} is governed by the OrbisOne terms of use and the subscription agreement and data processing addendum signed on order. The accepted quotation serves as the order.",
    tc: DEFAULT_TC,
  },
  {
    id: "ams", name: "AMS filing services", productIds: ["AMSOcean", "AMSAir", "AMSIGM"], isDefault: false,
    eulaTitle: "Hans Infomatic Master Services Agreement & EULA", eulaMode: "link", eulaUrl: `${SMART_CRM_SITE}/legal/msa-eula-icaffe.html`, eulaBody: "",
    governing: "The {{product}} services are provided under the Hans Infomatic Master Services Agreement (MSA). The accepted quotation serves as the Order Form under it.",
    tc: AMS_TC,
  },
  {
    id: "hans", name: "Hans products (iCAFFE and others)", productIds: ["iCAFFE"], isDefault: true,
    eulaTitle: "Hans Infomatic Master Services Agreement & EULA", eulaMode: "link", eulaUrl: `${SMART_CRM_SITE}/legal/msa-eula-icaffe.html`, eulaBody: "",
    governing: "Use of {{product}} is governed by the Hans Infomatic Master Services Agreement and End-User Licence Agreement (MSA & EULA). The accepted quotation serves as the Order Form under it.",
    tc: DEFAULT_TC,
  },
];
export const isBuiltinSet = (id) => BUILTIN_TERM_SETS.some((s) => s.id === id);

/** How a quote is billed, for choosing its governing-terms link. */
export const BILLING_STRUCTURES = [
  { id: "subscription", label: "Subscription" },
  { id: "licence", label: "One-time licence + AMC" },
  { id: "usage", label: "Pay per use" },
  { id: "revenue_share", label: "Revenue share (billed to the trade)" },
  { id: "hybrid", label: "Hybrid: fixed fee + usage" },
];

/**
 * A quote's billing structure from what it sells. With several, the one that
 * shapes the contract most wins: a licence, then revenue share, hybrid,
 * subscription, pay per use. flags: { licence, revenueShare, hybrid, subscription, usage }.
 */
export function pickBillingStructure(flags = {}) {
  if (flags.licence) return "licence";
  if (flags.revenueShare) return "revenue_share";
  if (flags.hybrid) return "hybrid";
  if (flags.subscription) return "subscription";
  if (flags.usage) return "usage";
  return "";
}

const str = (v) => String(v == null ? "" : v);
const norm = (s) => ({
  ...s,
  id: str(s.id), name: str(s.name) || "Terms set",
  productIds: Array.isArray(s.productIds) ? s.productIds.map(str).filter(Boolean) : [],
  isDefault: !!s.isDefault,
  eulaTitle: str(s.eulaTitle), eulaMode: s.eulaMode === "text" ? "text" : "link",
  eulaUrl: str(s.eulaUrl).trim(), eulaBody: str(s.eulaBody),
  governing: str(s.governing), tc: str(s.tc),
  byBilling: Object.fromEntries(BILLING_STRUCTURES.map((b) => [b.id, str(s.byBilling?.[b.id]).trim()]).filter(([, v]) => v)),
});

/** Built-ins overlaid with what is saved, then the custom sets. Exactly one default. */
export function resolveTermSets(masters) {
  const saved = Array.isArray(masters?.quotation?.termSets) ? masters.quotation.termSets.filter((s) => s && s.id) : [];
  const byId = new Map(saved.map((s) => [s.id, s]));
  const sets = [
    ...BUILTIN_TERM_SETS.map((b) => norm({ ...b, ...(byId.get(b.id) || {}) })),
    ...saved.filter((s) => !isBuiltinSet(s.id)).map(norm),
  ];
  // A product belongs to one set only: the first set that lists it keeps it.
  const seen = new Set();
  for (const s of sets) { s.productIds = s.productIds.filter((p) => !seen.has(p) && seen.add(p)); }
  const def = sets.findIndex((s) => s.isDefault);
  sets.forEach((s, i) => { s.isDefault = def < 0 ? s.id === "hans" : i === def; });
  return sets;
}

/** The set for a Product Catalogue id: the one that lists it, else the default. */
export function termSetFor(productId, sets = resolveTermSets(null)) {
  return sets.find((s) => productId && s.productIds.includes(productId)) || sets.find((s) => s.isDefault) || sets[0];
}

/** Where the quotation links for the EULA: the billing structure's own link if set, else the set's. */
export function eulaLinkOf(set, site = SMART_CRM_SITE, billing = "") {
  if (!set) return "";
  if (billing && set.byBilling?.[billing]) return set.byBilling[billing];
  if (set.eulaMode === "text" && set.eulaBody.trim()) return `${site.replace(/\/+$/, "")}/#/terms/${encodeURIComponent(set.id)}`;
  return set.eulaUrl;
}

export function fillTerms(text, ctx = {}) {
  return str(text).replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (all, k) => (ctx[k] != null && str(ctx[k]).trim() ? str(ctx[k]) : all));
}

/** Terms and conditions lines for a quote (numbering stripped; the page numbers them). */
export function tcLines(set, ctx = {}) {
  return str(set?.tc).split(/\n+/).map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean).map((l) => fillTerms(l, ctx));
}

/** Placeholders a set uses that don't exist (shown to the admin). */
export function unknownPlaceholders(set) {
  const all = [set?.governing, set?.tc].map(str).join("\n");
  return [...new Set([...all.matchAll(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g)].map((m) => m[1]))].filter((k) => !TERMS_PLACEHOLDERS.some(([p]) => p === k));
}

/** Saved array after changing one set (stores the whole set, stamped). */
export function upsertTermSet(saved, set, at = new Date().toISOString()) {
  const arr = Array.isArray(saved) ? saved.filter((s) => s && s.id !== set.id) : [];
  return [...arr, { ...norm(set), updatedAt: at }];
}

/** Move products into one set (taking them out of any other). Returns the saved array. */
export function assignProducts(sets, setId, productIds, at) {
  let saved = [];
  for (const s of sets) {
    const next = s.id === setId ? { ...s, productIds: [...new Set(productIds)] } : { ...s, productIds: s.productIds.filter((p) => !productIds.includes(p)) };
    saved = upsertTermSet(saved, next, at);
  }
  return saved;
}

/** Make one set the default for unlisted products. */
export function makeDefault(sets, setId, at) {
  return sets.reduce((saved, s) => upsertTermSet(saved, { ...s, isDefault: s.id === setId }, at), []);
}

/** EULA text → paragraphs and headings, for the public page. */
export function eulaBlocks(body, ctx = {}) {
  return str(body).split(/\n\s*\n/).map((b) => fillTerms(b.trim(), ctx)).filter(Boolean).map((b) => {
    const heading = /^(\d+\.\s+)?[^\n]{2,90}$/.test(b) && !/[.;:]$/.test(b) && (/^\d+\.\s+/.test(b) || b.length < 60);
    return { kind: heading ? "h" : "p", text: b };
  });
}
