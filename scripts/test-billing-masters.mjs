// Billing module Phase 1: masters, product profiles, legal entities, FX, rounding.
import { BILLING_MASTERS_SEED, BILLING_PROFILES, BILLING_MODELS, BILLING_UNITS, TAX_TYPES, RATE_STRUCTURES } from "../src/data/billingMasters.js";
import { resolveBillingMasters, withBilling, active, newId, fyCode, invoiceNoPreview, INVOICE_NO_MAX, entityStatus, entityFingerprint, entityProblems, profileProblems, profileWarnings,
  cloneProfile, blankProfile, productsWithoutProfile, requiredFeesFor, fxProblems, fxRateOn, roundPaise } from "../src/lib/billing/masters.js";
import { INIT_PRODUCT_CATALOG, mergeCatalogSeed } from "../src/data/seed.js";
import { HANS_CATALOGUE } from "../src/data/quotationMasters.js";
import { groupOf } from "../src/lib/quotation/productGroups.js";

let pass = 0, fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `\n    got  ${JSON.stringify(got)}\n    want ${JSON.stringify(want)}`}`);
};
const m = resolveBillingMasters(null);
const catalog = INIT_PRODUCT_CATALOG;

// ── Seed ─────────────────────────────────────────────────────────────
check("18 billing models (16 named, POC split free / paid / credited)", BILLING_MODELS.length, 18);
check("units in all 10 dimensions", new Set(BILLING_UNITS.map((u) => u.dimension)).size, 10);
check("no rates or percentages in the seed", [TAX_TYPES.every((t) => t.ratePct == null), JSON.stringify(BILLING_MASTERS_SEED).match(/"(rate|price|listPrice|ratePct|amount)":\s*[0-9]/), BILLING_MASTERS_SEED.fxRates.length], [true, null, 0]);
check("ids unique in every list", ["models", "units", "rateStructures", "feeTypes", "payerTypes", "taxes", "legalEntities", "profiles"].every((k) => new Set(BILLING_MASTERS_SEED[k].map((x) => x.id)).size === BILLING_MASTERS_SEED[k].length), true);
check("rate structures the engine does not calculate yet are flagged", RATE_STRUCTURES.filter((r) => !r.engine).map((r) => r.id), ["cap", "wallet", "bundle", "peak", "cargo_type"]);
check("23 profiles: 17 products with AMS as three (19), plus 4 services", BILLING_PROFILES.length, 23);
check("every seeded profile is valid against the masters and the catalogue", BILLING_PROFILES.map((p) => [p.id, profileProblems(p, m, catalog)]).filter(([, e]) => e.length), []);
check("statuses as specified", BILLING_PROFILES.filter((p) => p.status === "CONFIRMED").map((p) => p.id), ["wisecargo", "wiseccs", "acmes", "wisehandling", "icaffe"]);
check("three AMS profiles", BILLING_PROFILES.filter((p) => /^AMS/.test(p.productId)).map((p) => p.productId), ["AMSOcean", "AMSAir", "AMSIGM"]);
check("HR Expert is the existing HRMS, billed per user", [BILLING_PROFILES.find((p) => p.id === "hr_expert").productId, BILLING_PROFILES.find((p) => p.id === "hr_expert").primaryUnitIds[0]], ["WiseHRMS", "named_user"]);
check("ACMES has no entity until Carico System is added (warning, not an error)", [BILLING_PROFILES.find((p) => p.id === "acmes").legalEntityId, profileWarnings(BILLING_PROFILES.find((p) => p.id === "acmes"))[0].slice(0, 15)], ["", "No legal entity"]);
check("WiseHandling SaaS / PaaS require a setup fee; COTS does not", [requiredFeesFor(BILLING_PROFILES.find((p) => p.id === "wisehandling"), "paas"), requiredFeesFor(BILLING_PROFILES.find((p) => p.id === "wisehandling"), "cots_amc")], [["setup"], []]);
check("the default model is always among the allowed ones", BILLING_PROFILES.every((p) => p.allowedModelIds.includes(p.defaultModelId)), true);
check("WiseCCS carries the revenue-share statement and separate collection account flags", BILLING_PROFILES.find((p) => p.id === "wiseccs").flags, { revenueShareStatement: true, separateCollectionAccount: true });

// ── Catalogue additions ──────────────────────────────────────────────
const added = ["ACMES", "AAIICMS", "EAWBSolutions", "SCMTRDesk", "GateMgmt"];
check("the new products are in the catalogue seed", added.every((id) => catalog.some((c) => c.id === id)), true);
const oldCatalog = catalog.filter((c) => !added.includes(c.id));
check("only the unlinked ACMES row moves, to the ACMES product", HANS_CATALOGUE.filter((r) => groupOf(r, catalog) !== groupOf(r, oldCatalog)).map((r) => [r.code, groupOf(r, oldCatalog), groupOf(r, catalog)]), [["P05", "", "ACMES"]]);
const live = mergeCatalogSeed([...oldCatalog, { id: "ACMES", name: "ACMES", modules: [] }]);
check("a live catalogue gains the missing products once, without duplicating ACMES", [live.filter((c) => c.id === "ACMES").length, added.every((id) => live.some((c) => c.id === id))], [1, true]);

// ── Saved masters win; nothing is lost ───────────────────────────────
const saved = { billing: { models: [{ id: "per_txn", name: "Pay per transaction (renamed)", classes: ["transaction"] }, { id: "custom_x", name: "Custom" }], rounding: "up" } };
const r = resolveBillingMasters(saved);
check("an admin's rename wins; new items kept; seed items still present", [r.models[0].name, r.models.some((x) => x.id === "custom_x"), r.models.length], ["Pay per transaction (renamed)", true, 19]);
check("rounding saved", r.rounding, "up");
const next = withBilling(saved, "taxes", [{ ...TAX_TYPES[0], ratePct: "18" }]);
check("saving one list keeps the others (and the admin's rename)", [next.billing.taxes[0].ratePct, next.billing.models[0].name, next.billing.profiles.length], ["18", "Pay per transaction (renamed)", 23]);
check("retired items drop out of pick lists", active([{ id: "a" }, { id: "b", retired: true }]).map((x) => x.id), ["a"]);
check("new ids are unique", newId("Per txn", [{ id: "per_txn" }]), "per_txn_2");

// ── Invoice numbers ──────────────────────────────────────────────────
check("financial year April to March", [fyCode("2026-11-20"), fyCode("2027-03-31"), fyCode("2027-04-01")], ["2627", "2627", "2728"]);
check("series format and the 16-character limit", [invoiceNoPreview("HI", "2026-11-20", 123), invoiceNoPreview("CARI", "2026-11-20", 999999).length <= INVOICE_NO_MAX], ["HI/2627/000123", true]);

// ── Legal entities ───────────────────────────────────────────────────
const company = { name: "Hans Infomatic Pvt. Ltd.", gstin: "07AAACH0000A1Z5", regdOffice: "New Delhi", bankAccount: "" };
const hans = m.legalEntities[0];
check("Hans Infomatic's details come from Quotation Rules → Company", entityProblems(hans, m.legalEntities, company), []);
check("missing company details are named", entityProblems(hans, m.legalEntities, {}), ["GSTIN missing in Quotation Rules → Company.", "Address missing in Quotation Rules → Company."]);
const carico = { id: "carico", name: "Carico System", invoicePrefix: "HI", gstin: "123", address: "" };
check("a new entity: prefix clash, bad GSTIN, missing address",
  entityProblems(carico, [...m.legalEntities, carico]), ["Invoice prefix HI is used by another entity.", "GSTIN must be 15 characters: 2 digits then 13 letters or digits.", "Registered address is required."]);
check("prefix of 1 to 4 capitals or digits", entityProblems({ ...carico, invoicePrefix: "carico" }, [])[0], "Invoice prefix: 1 to 4 capital letters or digits.");
const ok = { id: "carico", name: "Carico System", invoicePrefix: "CS", gstin: "07ABCDE1234F1Z5", address: "Delhi" };
const checks = [{ entityId: "carico", fingerprint: entityFingerprint(ok), by: "fin1", at: "2026-11-20T10:00:00Z" }];
check("verified by Finance", entityStatus(ok, checks).verified, true);
check("a change after verification lapses it", entityStatus({ ...ok, bankAccount: "999" }, checks).label, "Details changed since verification");
check("never checked", entityStatus(ok, []).label, "Not verified");
check("the latest check counts", entityStatus(ok, [...checks, { entityId: "carico", fingerprint: "old", at: "2026-11-21T10:00:00Z" }]).verified, false);

// ── Profiles ─────────────────────────────────────────────────────────
const bad = { ...BILLING_PROFILES[0], name: "", productId: "Nope", defaultModelId: "per_txn", primaryUnitIds: [], currency: "JPY", frequency: "Weekly", creditDays: "2.5" };
check("profile validation names each problem", profileProblems(bad, m, catalog),
  ["Name is required.", "Pick a product from the Product Catalogue.", "The default model must be one of the allowed models.", "Pick at least one primary billing unit.", "Pick a currency from the currencies master.", "Pick a billing frequency.", "Credit days must be a whole number of days."]);
const copy = cloneProfile(BILLING_PROFILES[0], BILLING_PROFILES);
check("clone: new id, PROPOSED, same defaults", [copy.id, copy.status, copy.defaultModelId, copy.modules.length], ["wisecargo_copy", "PROPOSED", "saas_infra", 9]);
check("clone does not share arrays with the original", (copy.modules.push("x"), BILLING_PROFILES[0].modules.length), 9);
check("products without a profile get one to start from", productsWithoutProfile(catalog, BILLING_PROFILES).map((c) => c.id), ["EANNEX", "WiseDo", "BagTrack", "CRMExpert", "VMS", "OrbisEDI"]);
check("a blank profile for a product is PROPOSED and needs units", [blankProfile(catalog.find((c) => c.id === "VMS"), BILLING_PROFILES).status, profileProblems(blankProfile(catalog.find((c) => c.id === "VMS"), BILLING_PROFILES), m, catalog)], ["PROPOSED", ["Pick at least one primary billing unit."]]);

// ── Exchange rates and rounding ──────────────────────────────────────
check("FX rows: decimal strings, foreign currency, date", [fxProblems({ currency: "USD", rateToInr: "83.5", from: "2026-11-01" }, m.currencies), fxProblems({ currency: "INR", rateToInr: "1e3", from: "" }, m.currencies)],
  [[], ["Pick a foreign currency.", "Rate: a positive decimal, up to 6 places.", "Effective date is required."]]);
const fx = [{ currency: "USD", rateToInr: "83.5", from: "2026-10-01" }, { currency: "USD", rateToInr: "84.1", from: "2026-11-15" }];
check("the rate in force on a date", [fxRateOn(fx, "USD", "2026-11-10"), fxRateOn(fx, "USD", "2026-11-20"), fxRateOn(fx, "USD", "2026-09-01"), fxRateOn(fx, "INR", "2026-09-01")], ["83.5", "84.1", null, "1"]);
check("rounding in paise: none, nearest rupee, up to the next rupee", [roundPaise(4022935, "paise"), roundPaise(4022935, "nearest"), roundPaise(4022935, "up"), roundPaise(4022900, "up"), roundPaise(4022949, "nearest")], [4022935, 4022900, 4023000, 4022900, 4022900]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
