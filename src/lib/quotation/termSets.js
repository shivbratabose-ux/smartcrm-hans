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

export const BUILTIN_TERM_SETS = [
  {
    id: "orbis", name: "OrbisOne products", productIds: ["OrbisOne", "OrbisEDI"], isDefault: false,
    eulaTitle: "OrbisOne terms of use", eulaMode: "link", eulaUrl: "https://orbisone.in/terms.html", eulaBody: "",
    governing: "Use of {{product}} is governed by the OrbisOne terms of use and the subscription agreement and data processing addendum signed on order. The accepted quotation serves as the order.",
    tc: DEFAULT_TC,
  },
  {
    id: "hans", name: "Hans products (iCAFFE and others)", productIds: ["iCAFFE"], isDefault: true,
    eulaTitle: "Hans Infomatic Master Services Agreement & EULA", eulaMode: "link", eulaUrl: `${SMART_CRM_SITE}/legal/msa-eula-icaffe.html`, eulaBody: "",
    governing: "Use of {{product}} is governed by the Hans Infomatic Master Services Agreement and End-User Licence Agreement (MSA & EULA). The accepted quotation serves as the Order Form under it.",
    tc: DEFAULT_TC,
  },
];
export const isBuiltinSet = (id) => BUILTIN_TERM_SETS.some((s) => s.id === id);

const str = (v) => String(v == null ? "" : v);
const norm = (s) => ({
  ...s,
  id: str(s.id), name: str(s.name) || "Terms set",
  productIds: Array.isArray(s.productIds) ? s.productIds.map(str).filter(Boolean) : [],
  isDefault: !!s.isDefault,
  eulaTitle: str(s.eulaTitle), eulaMode: s.eulaMode === "text" ? "text" : "link",
  eulaUrl: str(s.eulaUrl).trim(), eulaBody: str(s.eulaBody),
  governing: str(s.governing), tc: str(s.tc),
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

/** Where the quotation links for the EULA. */
export function eulaLinkOf(set, site = SMART_CRM_SITE) {
  if (!set) return "";
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
