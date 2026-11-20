// Billing masters: merge what an admin saved (masters.billing) over the seed,
// and the checks the Billing tab runs. Pure; tested in scripts/test-billing-masters.mjs.
import { BILLING_MASTERS_SEED, BILLING_FREQUENCIES } from "../../data/billingMasters.js";

const LIST_KEYS = ["models", "units", "dimensions", "rateStructures", "feeTypes", "payerTypes", "taxes", "legalEntities", "profiles"];
const DECIMAL = /^\d+(\.\d{1,6})?$/;

/**
 * The billing masters in force: saved items first (in their saved order), then
 * seed items not saved yet. An item is never deleted, only retired, so a seed
 * item never comes back after an admin changed it.
 */
export function resolveBillingMasters(masters) {
  const saved = masters?.billing || {};
  const out = {};
  for (const k of LIST_KEYS) {
    const mine = Array.isArray(saved[k]) ? saved[k].filter((x) => x && x.id) : [];
    const ids = new Set(mine.map((x) => x.id));
    out[k] = [...mine, ...BILLING_MASTERS_SEED[k].filter((x) => !ids.has(x.id))];
  }
  out.currencies = Array.isArray(saved.currencies) && saved.currencies.length ? saved.currencies : BILLING_MASTERS_SEED.currencies;
  out.fxRates = Array.isArray(saved.fxRates) ? saved.fxRates : [];
  out.rounding = saved.rounding || BILLING_MASTERS_SEED.rounding;
  return out;
}

/** masters with one billing list (or value) replaced — the shape setMasters saves. */
export function withBilling(masters, key, value) {
  const current = resolveBillingMasters(masters);
  return { ...(masters || {}), billing: { ...(masters?.billing || {}), ...pickSaved(current), [key]: value } };
}
// Everything resolved is saved once an admin edits, so later seed changes only add new ids.
const pickSaved = (m) => Object.fromEntries([...LIST_KEYS, "currencies", "fxRates", "rounding"].map((k) => [k, m[k]]));

export const active = (list) => (list || []).filter((x) => !x.retired);
export const byId = (list, id) => (list || []).find((x) => x.id === id) || null;

/** A new id from a name, unique in the list. */
export function newId(name, list) {
  const base = String(name || "item").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "item";
  const taken = new Set((list || []).map((x) => x.id));
  let id = base, n = 1;
  while (taken.has(id)) id = `${base}_${++n}`;
  return id;
}

// ── Financial year and invoice numbers ───────────────────────────────
/** Indian financial year (April–March) code for a date: 2026-11-20 → "2627". */
export function fyCode(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  const y = Number(m[1]), start = Number(m[2]) >= 4 ? y : y - 1;
  return `${String(start).slice(-2)}${String(start + 1).slice(-2)}`;
}
/** The invoice number an entity's series gives: HI/2627/000123. */
export const invoiceNoPreview = (prefix, iso, seq = 1) => `${String(prefix || "").toUpperCase()}/${fyCode(iso)}/${String(seq).padStart(6, "0")}`;
/** GST invoice numbers: at most 16 characters, unique per financial year. */
export const INVOICE_NO_MAX = 16;

// ── Legal entities ───────────────────────────────────────────────────
const ENTITY_FIELDS = ["name", "legalName", "gstin", "pan", "address", "state", "bankName", "bankAccount", "bankIfsc"];

/** The details Finance verifies. Hans Infomatic's come from Quotation Rules → Company. */
export function entityDetails(entity, company = {}) {
  if (entity?.source === "company") {
    return { name: entity.name, legalName: company.name || entity.name, gstin: company.gstin || "", pan: company.pan || "", address: company.regdOffice || company.headOffice || "",
      state: company.state || "", bankName: company.bankName || "", bankAccount: company.bankAccount || "", bankIfsc: company.bankIfsc || "", invoicePrefix: entity.invoicePrefix };
  }
  return { ...Object.fromEntries(ENTITY_FIELDS.map((k) => [k, String(entity?.[k] || "").trim()])), invoicePrefix: entity?.invoicePrefix || "" };
}
/** A fingerprint of the details: a verification lapses when any of them changes. */
export const entityFingerprint = (entity, company) => JSON.stringify(entityDetails(entity, company));

/** Verified only when Finance's latest check matches the current details. */
export function entityStatus(entity, checks = [], company = {}) {
  const mine = (checks || []).filter((c) => c.entityId === entity?.id).sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  const last = mine[0];
  if (!last) return { verified: false, label: "Not verified", check: null };
  if (last.fingerprint !== entityFingerprint(entity, company)) return { verified: false, label: "Details changed since verification", check: last };
  return { verified: true, label: "Verified", check: last };
}

export function entityProblems(entity, all = [], company = {}) {
  const out = [];
  const d = entityDetails(entity, company);
  if (!String(entity?.name || "").trim()) out.push("Name is required.");
  const prefix = String(entity?.invoicePrefix || "").trim();
  if (!/^[A-Z0-9]{1,4}$/.test(prefix)) out.push("Invoice prefix: 1 to 4 capital letters or digits.");
  else if ((all || []).some((e) => e.id !== entity.id && !e.retired && String(e.invoicePrefix || "").trim() === prefix)) out.push(`Invoice prefix ${prefix} is used by another entity.`);
  if (invoiceNoPreview(prefix, "2026-04-01").length > INVOICE_NO_MAX) out.push(`Invoice numbers would exceed ${INVOICE_NO_MAX} characters.`);
  if (!d.gstin) out.push(entity?.source === "company" ? "GSTIN missing in Quotation Rules → Company." : "GSTIN is required.");
  else if (!/^[0-9]{2}[A-Z0-9]{13}$/.test(d.gstin)) out.push("GSTIN must be 15 characters: 2 digits then 13 letters or digits.");
  if (!d.address) out.push(entity?.source === "company" ? "Address missing in Quotation Rules → Company." : "Registered address is required.");
  return out;
}

// ── Product billing profiles ─────────────────────────────────────────
export function profileProblems(profile, m, catalog = []) {
  const out = [];
  if (!String(profile?.name || "").trim()) out.push("Name is required.");
  if (profile?.productId !== "_services" && !(catalog || []).some((c) => c.id === profile?.productId)) out.push("Pick a product from the Product Catalogue.");
  const models = new Set(active(m.models).map((x) => x.id));
  if (!profile?.defaultModelId) out.push("Pick a default billing model.");
  else if (!(profile.allowedModelIds || []).includes(profile.defaultModelId)) out.push("The default model must be one of the allowed models.");
  (profile?.allowedModelIds || []).filter((id) => !models.has(id)).forEach((id) => out.push(`Model "${id}" is not in the billing models master.`));
  const units = new Set(active(m.units).map((x) => x.id));
  if (!(profile?.primaryUnitIds || []).length) out.push("Pick at least one primary billing unit.");
  [...(profile?.primaryUnitIds || []), ...(profile?.allowedUnitIds || [])].filter((id) => !units.has(id)).forEach((id) => out.push(`Unit "${id}" is not in the units master.`));
  if (!(m.currencies || []).includes(profile?.currency)) out.push("Pick a currency from the currencies master.");
  if (!BILLING_FREQUENCIES.includes(profile?.frequency)) out.push("Pick a billing frequency.");
  if (profile?.creditDays != null && profile.creditDays !== "" && !(Number.isInteger(Number(profile.creditDays)) && Number(profile.creditDays) >= 0)) out.push("Credit days must be a whole number of days.");
  const fees = new Set(active(m.feeTypes).map((x) => x.id));
  [...(profile?.oneTimeFeeIds || []), ...(profile?.recurringFeeIds || []), ...(profile?.requiredFees || []).map((r) => r.feeTypeId)].filter((id) => !fees.has(id)).forEach((id) => out.push(`Fee type "${id}" is not in the fee types master.`));
  if (profile?.legalEntityId && !byId(m.legalEntities, profile.legalEntityId)) out.push("The legal entity no longer exists.");
  return [...new Set(out)];
}
/** Advice, not errors: shown on the profile. */
export function profileWarnings(profile) {
  const out = [];
  if (!profile?.legalEntityId) out.push("No legal entity: pick the entity this product bills under before it is used on a plan.");
  if (profile?.creditDays == null || profile.creditDays === "") out.push("Default credit days not set.");
  return out;
}

/** A copy to edit: new id, PROPOSED, not retired. */
export function cloneProfile(profile, list) {
  const name = `${profile.name} (copy)`;
  return { ...JSON.parse(JSON.stringify(profile)), id: newId(name, list), name, status: "PROPOSED", retired: false };
}
/** A blank PROPOSED profile for a catalogue product. */
export function blankProfile(product, list) {
  return { id: newId(product?.name || "profile", list), name: product?.name || "", productId: product?.id || "", status: "PROPOSED", legalEntityId: "hans", currency: "INR", frequency: "Monthly",
    creditDays: null, taxIds: ["gst"], defaultModelId: "saas_infra", allowedModelIds: ["saas_infra"], primaryUnitIds: [], allowedUnitIds: [], primaryBasis: "", variables: [], modules: [],
    oneTimeFeeIds: [], recurringFeeIds: [], requiredFees: [], customerTypes: [], flags: {}, notes: "", retired: false };
}
/** Catalogue products with no active profile. */
export const productsWithoutProfile = (catalog = [], profiles = []) => {
  const covered = new Set(active(profiles).map((p) => p.productId));
  return (catalog || []).filter((c) => c?.id && !covered.has(c.id));
};
/** Fee lines a model needs on this product (e.g. WiseHandling SaaS/PaaS → setup). */
export const requiredFeesFor = (profile, modelId) => (profile?.requiredFees || []).filter((r) => (r.modelIds || []).includes(modelId)).map((r) => r.feeTypeId);

// ── Exchange rates ───────────────────────────────────────────────────
/** Rates are decimal strings (never floating point), e.g. "83.5". */
export function fxProblems(row, currencies = []) {
  const out = [];
  if (!currencies.includes(row?.currency) || row.currency === "INR") out.push("Pick a foreign currency.");
  if (!DECIMAL.test(String(row?.rateToInr || ""))) out.push("Rate: a positive decimal, up to 6 places.");
  else if (!(Number(row.rateToInr) > 0)) out.push("Rate must be above zero.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row?.from || ""))) out.push("Effective date is required.");
  return out;
}
/** The rate in force for a currency on a date (latest effective date not after it), or null. */
export function fxRateOn(fxRates = [], currency, iso) {
  if (currency === "INR") return "1";
  const hit = (fxRates || []).filter((r) => r.currency === currency && String(r.from) <= String(iso)).sort((a, b) => String(b.from).localeCompare(String(a.from)))[0];
  return hit ? String(hit.rateToInr) : null;
}

// ── Rounding (invoice totals, applied by the rating engine) ──────────
/** Round an amount held in paise (integer) per the rounding master. */
export function roundPaise(paise, mode = "paise") {
  const v = Math.round(Number(paise) || 0);
  if (mode === "nearest") return Math.round(v / 100) * 100;
  if (mode === "up") return Math.ceil(v / 100) * 100;
  return v;
}
