// Billing masters: the option names the Billing module works with (Phase 1 of
// docs/billing-module-plan.md). Names only. No rates, tax percentages or
// prices live here: an admin enters them in Masters → Billing, and those saved
// values (masters.billing in app_settings) always win over this seed.

// ── Billing models ───────────────────────────────────────────────────
// `classes`: the kinds of charge the model produces (subscription = fixed
// recurring, transaction = variable on actual use, one_time), so later phases
// can offer the right fee lines and rate structures.
export const BILLING_MODELS = [
  { id: "cots_amc", name: "COTS perpetual licence + AMC", classes: ["one_time", "subscription"] },
  { id: "term_licence", name: "Term licence", classes: ["subscription"] },
  { id: "saas_infra", name: "SaaS with infrastructure", classes: ["subscription"] },
  { id: "saas_no_infra", name: "SaaS without infrastructure", classes: ["subscription"] },
  { id: "paas", name: "PaaS", classes: ["subscription"] },
  { id: "paas_per_unit", name: "Per-unit PaaS", classes: ["transaction"] },
  { id: "per_txn", name: "Pay per transaction", classes: ["transaction"] },
  { id: "revenue_share", name: "Revenue share", classes: ["transaction"] },
  { id: "managed_service", name: "Managed service", classes: ["subscription", "transaction"] },
  { id: "hybrid", name: "Hybrid (fixed base + usage)", classes: ["subscription", "transaction"] },
  { id: "freemium", name: "Freemium", classes: ["subscription", "transaction"] },
  { id: "outcome", name: "Outcome-based", classes: ["transaction"] },
  { id: "bot_boot", name: "BOT / BOOT", classes: ["one_time", "subscription", "transaction"] },
  { id: "oem", name: "White-label / OEM", classes: ["subscription", "transaction"] },
  { id: "reseller", name: "Reseller / partner", classes: ["subscription", "transaction"] },
  { id: "poc_free", name: "Pilot / POC: free", classes: [] },
  { id: "poc_paid", name: "Pilot / POC: paid", classes: ["one_time", "subscription"] },
  { id: "poc_credited", name: "Pilot / POC: credited against the contract", classes: ["one_time", "subscription"] },
];

// ── Billing units, by dimension ──────────────────────────────────────
export const UNIT_DIMENSIONS = [
  { id: "location", name: "Location" },
  { id: "flight", name: "Flight" },
  { id: "shipment", name: "Shipment" },
  { id: "weight", name: "Weight / volume" },
  { id: "document", name: "Document" },
  { id: "people", name: "People" },
  { id: "asset", name: "Asset" },
  { id: "technology", name: "Technology" },
  { id: "time", name: "Time" },
  { id: "value", name: "Value" },
];
const u = (dimension, list) => list.map(([id, name]) => ({ id, name, dimension }));
export const BILLING_UNITS = [
  ...u("location", [["port", "Port"], ["airport", "Airport"], ["terminal", "Terminal"], ["station", "Station"], ["warehouse", "Warehouse"], ["branch", "Branch"], ["gate", "Gate"], ["lane", "Lane"]]),
  ...u("flight", [["flight", "Flight"], ["turnaround", "Turnaround"], ["aircraft_category", "Aircraft category"]]),
  ...u("shipment", [["awb", "AWB"], ["mawb", "MAWB"], ["hawb", "HAWB"], ["consignment", "Consignment"], ["piece", "Piece"], ["uld", "ULD"], ["container", "Container"], ["bl", "Bill of lading"]]),
  ...u("weight", [["kg", "kg"], ["tonne", "Tonne"], ["chargeable_weight", "Chargeable weight"], ["cbm", "CBM"]]),
  ...u("document", [["filing", "Filing"], ["message", "Message"], ["shipping_bill", "Shipping bill"], ["bill_of_entry", "Bill of entry"], ["igm_egm", "IGM / EGM"], ["einvoice", "E-invoice"], ["page", "Page scanned"], ["record", "Record"], ["box", "Archive box"]]),
  ...u("people", [["named_user", "Named user"], ["concurrent_user", "Concurrent user"], ["employee", "Employee"], ["company", "Company"], ["airline_principal", "Airline principal"]]),
  ...u("asset", [["vehicle", "Vehicle"], ["trip", "Trip"], ["km", "km"], ["pallet_position", "Pallet position"], ["sq_ft", "Sq ft"], ["device", "Device"]]),
  ...u("technology", [["api_call", "API call"], ["integration", "Integration"], ["gb_stored", "GB stored"], ["ai_document", "AI document"], ["alert", "SMS / WhatsApp alert"], ["module", "Module"]]),
  ...u("time", [["month", "Month"], ["quarter", "Quarter"], ["year", "Year"], ["shift", "Shift"], ["man_day", "Man-day"], ["man_month", "Man-month"]]),
  ...u("value", [["pct_revenue", "% of revenue"], ["pct_txn_value", "% of transaction value"], ["pct_collected", "% of charges collected"]]),
];

// ── Rate structures ──────────────────────────────────────────────────
// `engine`: already calculated by the Billing Engine today (Phase 3 adds the rest).
export const RATE_STRUCTURES = [
  { id: "flat", name: "Flat rate", engine: true },
  { id: "tiered", name: "Tiered slabs (each slab at its own rate)", engine: true },
  { id: "band", name: "Volume bands (one rate for all units)", engine: true },
  { id: "base_overage", name: "Fixed base + overage", engine: true },
  { id: "min_guarantee", name: "Minimum monthly guarantee", engine: true },
  { id: "cap", name: "Monthly cap", engine: false },
  { id: "wallet", name: "Prepaid credits / wallet", engine: false },
  { id: "bundle", name: "Bundle price", engine: false },
  { id: "module_wise", name: "Module-wise price", engine: true },
  { id: "peak", name: "Peak / after-hours rate", engine: false },
  { id: "cargo_type", name: "Rate by cargo type", engine: false },
];
export const CARGO_TYPES = ["Import", "Export", "Transhipment", "Domestic", "Courier", "Special"];

// ── Fee types ────────────────────────────────────────────────────────
const f = (kind, list) => list.map(([id, name]) => ({ id, name, kind }));
export const FEE_TYPES = [
  ...f("one_time", [["licence", "Licence"], ["setup", "Setup"], ["implementation", "Implementation"], ["configuration", "Configuration"], ["customisation", "Customisation"], ["data_migration", "Data migration"], ["integration", "Integration (per interface)"], ["training", "Training"], ["hardware", "Hardware"], ["golive_support", "Go-live support"], ["conformance_testing", "Conformance testing"], ["travel", "Travel"], ["exit_handover", "Exit / handover"]]),
  ...f("recurring", [["subscription", "Subscription"], ["amc", "AMC"], ["hosting", "Hosting"], ["support", "Support"], ["managed_ops", "Managed operations"], ["pass_through", "Third-party pass-through"], ["licence_renewal", "Licence renewal"], ["upgrade", "Upgrade"]]),
];

// ── Payer types ──────────────────────────────────────────────────────
export const PAYER_TYPES = [
  { id: "operator", name: "Operator / custodian" },
  { id: "trade_user", name: "Trade user" },
  { id: "airline", name: "Airline" },
  { id: "airport_authority", name: "Airport / authority" },
  { id: "split", name: "Split between parties" },
  { id: "hans_collects", name: "Collected by Hans and shared" },
  { id: "operator_remits", name: "Collected by operator and remitted" },
];

// ── Taxes (percentages blank: entered by an admin) ───────────────────
export const TAX_TYPES = [
  { id: "gst", name: "GST", kind: "gst", ratePct: null },
  { id: "vat", name: "VAT", kind: "vat", ratePct: null },
  { id: "wht", name: "Withholding tax", kind: "withholding", ratePct: null },
  { id: "grossup", name: "Gross-up for withholding tax", kind: "grossup", ratePct: null },
];

export const BILLING_FREQUENCIES = ["Per transaction", "Monthly", "Quarterly", "Half-yearly", "Annual", "Milestone"];
export const BILLING_CURRENCIES = ["INR", "USD", "EUR"];

// Invoice totals (applied by the rating engine, Phase 3).
export const ROUNDING_MODES = [
  { id: "paise", name: "To the paisa (no rounding)" },
  { id: "nearest", name: "To the nearest rupee" },
  { id: "up", name: "Up to the next rupee" },
];

// ── Legal entities ───────────────────────────────────────────────────
// Hans Infomatic's details (GSTIN, PAN, address, bank) already live in
// Quotation Rules → Company; this entity points there instead of copying them.
// Other entities (e.g. Carico System for WiseCCS at Delhi) are added by an admin and
// verified by Finance before they can be billed under.
export const LEGAL_ENTITIES = [
  { id: "hans", name: "Hans Infomatic Pvt. Ltd.", invoicePrefix: "HI", source: "company" },
];

// ── Product billing profiles ─────────────────────────────────────────
// Defaults that pre-fill a customer's billing plan (Phase 2); each can be
// overridden per contract. Status CONFIRMED / PROPOSED: Finance reviews the
// PROPOSED ones. `productId` links the Product Catalogue ("_services" = the
// shared services group).
const p = (o) => ({
  status: "PROPOSED", legalEntityId: "hans", currency: "INR", frequency: "Monthly", creditDays: null,
  taxIds: ["gst"], allowedModelIds: [o.defaultModelId], primaryUnitIds: [], allowedUnitIds: [], primaryBasis: "",
  variables: [], modules: [], oneTimeFeeIds: [], recurringFeeIds: [], requiredFees: [], customerTypes: [],
  flags: {}, notes: "", retired: false, ...o,
  allowedUnitIds: [...new Set([...(o.primaryUnitIds || []), ...(o.allowedUnitIds || [])])],
  allowedModelIds: [...new Set([o.defaultModelId, ...(o.allowedModelIds || [])])],
});
const STD_ONE_TIME = ["setup", "data_migration", "integration", "training"];
export const BILLING_PROFILES = [
  // A. Cargo terminal and community systems
  p({ id: "wisecargo", name: "WiseCargo", productId: "WiseCargo", status: "CONFIRMED", defaultModelId: "saas_infra", allowedModelIds: ["cots_amc", "paas", "hybrid"],
    primaryBasis: "per port per month", primaryUnitIds: ["port", "month"], allowedUnitIds: ["terminal", "tonne", "device"],
    variables: ["Number of terminals", "Annual tonnage slab", "Cargo type (import, export, transhipment, domestic, courier)", "Customs regimes enabled (ICEGATE/SCMTR, CBP ACE, ICS2, ASYCUDA)", "Handheld devices"],
    modules: ["Import", "Export", "Transhipment", "ULD management", "Detention", "Disposal and auction", "Warehouse control", "Message agents", "Audit agent"],
    oneTimeFeeIds: STD_ONE_TIME, recurringFeeIds: ["subscription"] }),
  // WiseCCS, three models (AISATS quote, Nov 2025). ACMES, the Delhi community
  // system, is WiseCCS (decision 21 Nov 2026): no separate profile.
  //   1 TRS: billed to the trade per AWB / SB / BOE, revenue share to the operator by slab (statement)
  //   2 Hybrid: fixed monthly fee + per-consignment charge, share of the difference
  //   3 SaaS without infrastructure: fixed monthly fee per terminal category
  p({ id: "wiseccs", name: "WiseCCS", productId: "WiseCCS", status: "CONFIRMED", defaultModelId: "revenue_share", allowedModelIds: ["hybrid", "saas_no_infra", "per_txn"],
    primaryBasis: "per AWB / shipping bill / bill of entry", primaryUnitIds: ["awb", "shipping_bill", "bill_of_entry"], allowedUnitIds: ["terminal", "month", "mawb", "hawb", "pct_collected"],
    variables: ["Model (TRS, hybrid, SaaS without infrastructure)", "Transaction type (domestic AWB, export SB, import BOE)", "Payer (trade user or operator)", "Revenue-share slabs and how they apply (graduated or whole month)", "Fixed monthly fee and share of the difference (hybrid)", "Terminal categories (SaaS)", "Contract term (84 months TRS, 60 months hybrid / SaaS)", "Hosting (Hans or operator)"],
    modules: ["Agent documentation", "Amendments", "Online payments", "Communication", "Community portal"],
    flags: { revenueShareStatement: true, separateCollectionAccount: true },
    notes: "A contract may bill under another legal entity (e.g. Carico System for the Delhi community system, formerly ACMES): add that entity and select it on the plan." }),
  p({ id: "aai_icms", name: "AAI ICMS", productId: "AAIICMS", defaultModelId: "oem",
    primaryBasis: "per airport per month", primaryUnitIds: ["airport", "month"], allowedUnitIds: ["tonne"],
    variables: ["Number of airports", "Tonnage slab", "Support tier"], notes: "White-label cargo system for an airport authority." }),
  // B. Ground handling and airline
  p({ id: "wisehandling", name: "WiseHandling", productId: "WiseHandling", status: "CONFIRMED", defaultModelId: "paas_per_unit", allowedModelIds: ["cots_amc", "saas_infra", "saas_no_infra", "paas"],
    primaryBasis: "per flight per airport per month", primaryUnitIds: ["flight", "airport", "month"], allowedUnitIds: ["station", "aircraft_category", "named_user"],
    variables: ["Modules selected", "Number of stations", "Aircraft category", "Flight volume slab", "RMS headcount"],
    modules: ["Turnaround", "Ramp", "Resource management (RMS)", "Billing to airlines", "Contract and SLA management"],
    oneTimeFeeIds: ["setup"], requiredFees: [{ modelIds: ["saas_infra", "saas_no_infra", "paas", "paas_per_unit"], feeTypeId: "setup" }],
    notes: "SaaS and PaaS always carry a one-time setup fee line." }),
  p({ id: "wisetrax", name: "WiseTrax", productId: "WiseTrax", defaultModelId: "per_txn",
    primaryBasis: "per message or per AWB", primaryUnitIds: ["message", "awb"],
    variables: ["Message type (FWB, FHL, FSU, other)", "Volume slab", "Number of airlines connected", "Minimum monthly charge"] }),
  p({ id: "wisegsa", name: "WiseGSA", productId: "WiseGSA", defaultModelId: "saas_infra",
    primaryBasis: "per airline principal per month", primaryUnitIds: ["airline_principal", "month"], allowedUnitIds: ["station", "named_user", "awb"],
    variables: ["Stations", "Users", "AWB volume"] }),
  // C. Forwarder and customs
  p({ id: "icaffe", name: "iCAFFE", productId: "iCAFFE", status: "CONFIRMED", defaultModelId: "saas_infra",
    primaryBasis: "per module per month", primaryUnitIds: ["module", "month"], allowedUnitIds: ["named_user", "branch"],
    variables: ["Users", "Branches", "Job volume"], modules: ["Customs clearance", "Forwarding", "Accounting"], notes: "Priced by module." }),
  p({ id: "orbisone", name: "Orbis One", productId: "OrbisOne", defaultModelId: "saas_infra",
    primaryBasis: "per user per month, or per company per month", primaryUnitIds: ["named_user", "company", "month"], allowedUnitIds: ["ai_document", "api_call"],
    variables: ["Modules", "AI documents processed", "Customer portal and mobile app", "Third-party API usage (booking, tracking)"], customerTypes: ["Freight forwarder", "Customs broker"] }),
  p({ id: "ams_ocean", name: "AMS: Ocean Consol", productId: "AMSOcean", defaultModelId: "per_txn", primaryBasis: "per filing", primaryUnitIds: ["filing"], allowedUnitIds: ["bl"], variables: ["Mode: sea", "Filing type (consol)", "Volume slab"], oneTimeFeeIds: ["setup"] }),
  p({ id: "ams_air", name: "AMS: Air Consol", productId: "AMSAir", defaultModelId: "per_txn", primaryBasis: "per filing", primaryUnitIds: ["filing"], allowedUnitIds: ["hawb"], variables: ["Mode: air", "Filing type (consol)", "Volume slab"], oneTimeFeeIds: ["setup"] }),
  p({ id: "ams_igm", name: "AMS: IGM-EGM Filing", productId: "AMSIGM", defaultModelId: "per_txn", primaryBasis: "per filing", primaryUnitIds: ["filing"], allowedUnitIds: ["igm_egm", "message"], variables: ["Mode (air, sea)", "Filing type (IGM, EGM)", "Volume slab"] }),
  p({ id: "eawb", name: "eAWB solutions", productId: "EAWBSolutions", defaultModelId: "per_txn", primaryBasis: "per AWB", primaryUnitIds: ["awb"], variables: ["Volume slab", "Airlines connected"] }),
  p({ id: "scmtr_desk", name: "SCMTR filing desk", productId: "SCMTRDesk", defaultModelId: "managed_service", primaryBasis: "per filing", primaryUnitIds: ["filing"], variables: ["Volume slab", "Turnaround SLA", "After-hours rate"], notes: "Managed filing desk." }),
  // D. Warehousing, transport and enterprise tools
  p({ id: "wisestox", name: "WiseStox", productId: "WiseStox", defaultModelId: "saas_infra", primaryBasis: "per warehouse per month", primaryUnitIds: ["warehouse", "month"], allowedUnitIds: ["sq_ft", "pallet_position", "named_user"], variables: ["Area", "Pallet positions", "Transactions", "Users"] }),
  p({ id: "wisefleet", name: "WiseFleet", productId: "WiseFleet", defaultModelId: "saas_infra", primaryBasis: "per vehicle per month, or per trip", primaryUnitIds: ["vehicle", "trip", "month"], allowedUnitIds: ["named_user"], variables: ["Users", "Routes", "GPS integration"] }),
  p({ id: "wisedox", name: "WiseDox", productId: "WiseDox", defaultModelId: "saas_infra", allowedModelIds: ["managed_service"], primaryBasis: "per user per month; per page scanned", primaryUnitIds: ["named_user", "month", "page"], allowedUnitIds: ["gb_stored"], variables: ["Storage in GB", "Retention period"], notes: "Scanning is billed as a service." }),
  p({ id: "hr_expert", name: "HR Expert (HRMS)", productId: "WiseHRMS", defaultModelId: "saas_infra", primaryBasis: "per user per month", primaryUnitIds: ["named_user", "month"], allowedUnitIds: ["employee"], variables: ["Modules"], notes: "Billed per user; slabs to be shared." }),
  p({ id: "gate_mgmt", name: "Gate Management", productId: "GateMgmt", defaultModelId: "saas_infra", primaryBasis: "per gate per month, or per vehicle transaction", primaryUnitIds: ["gate", "month", "vehicle"], allowedUnitIds: ["lane"], variables: ["Lanes", "Hardware integration"] }),
  // E. Services
  p({ id: "svc_scanning", name: "Scanning and digitisation", productId: "_services", defaultModelId: "managed_service", primaryBasis: "per page or per record", primaryUnitIds: ["page", "record"] }),
  p({ id: "svc_archival", name: "Records archival", productId: "_services", defaultModelId: "managed_service", primaryBasis: "per box or per GB per month", primaryUnitIds: ["box", "gb_stored", "month"] }),
  p({ id: "svc_development", name: "Custom development and change requests", productId: "_services", defaultModelId: "managed_service", primaryBasis: "per man-day or fixed-price milestone", primaryUnitIds: ["man_day"], frequency: "Milestone", oneTimeFeeIds: ["customisation"] }),
  p({ id: "svc_it", name: "IT services and airport services", productId: "_services", defaultModelId: "managed_service", primaryBasis: "per man-month or fixed monthly fee", primaryUnitIds: ["man_month", "month"], recurringFeeIds: ["managed_ops"] }),
];

/** Everything the Billing tab edits, as first seeded. */
export const BILLING_MASTERS_SEED = {
  models: BILLING_MODELS, units: BILLING_UNITS, dimensions: UNIT_DIMENSIONS, rateStructures: RATE_STRUCTURES,
  feeTypes: FEE_TYPES, payerTypes: PAYER_TYPES, taxes: TAX_TYPES, legalEntities: LEGAL_ENTITIES, profiles: BILLING_PROFILES,
  currencies: BILLING_CURRENCIES, fxRates: [], rounding: "paise",
};
