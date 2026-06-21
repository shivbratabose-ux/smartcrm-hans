// ═══════════════════════════════════════════════════════════════════
// Quotation master data — ported from Hans_Quotation_Module_3.xlsx
// ═══════════════════════════════════════════════════════════════════
// SOURCE OF TRUTH: the workbook. Every value here mirrors a workbook
// cell (sheets: Product_Catalogue, Pricing_Bands, iCAFFE_RateCard,
// Config, Terms_Library). These are *defaults* — once wired into the
// app they are editable via the Master-Data admin and persist in
// `app_settings` (db.saveSettings), so DO NOT hard-code rates anywhere
// else (brief §13).
//
// Discrepancies vs the build brief, resolved in favour of the workbook
// per the brief's "if any value differs, the workbook wins" rule:
//   • AS06 Cloud Data Storage = 150/GB  (brief VAS §6 said 50)
//   • AS08 eAWB Transmission  = 60/AWB   (brief VAS §6 said 65)
//   • iCAFFE VAS section keeps its own list (eAWB 65, storage 50) —
//     that list is informational; the chargeable catalogue items are
//     AS04–AS10 above.
// ═══════════════════════════════════════════════════════════════════

// ── Config singleton (brief §2; Config sheet) ────────────────────────
export const QUOTE_CONFIG = {
  homeState: "Delhi",            // intra- vs inter-state GST pivot
  gstRatePct: 18,
  maxUserDiscountPct: 10,        // above → approval required
  alrPctOfLicence: 20,
  prepaymentDiscountPctDefault: 5,
  fx: 1,                         // INR base; divisor on resolved unit price
  // Multi-currency stub (Config sheet) — FX only, no live feeds.
  currencies: [
    { code: "INR", fxToInr: 1 },
    { code: "USD", fxToInr: 83.5 },
    { code: "EUR", fxToInr: 90 },
  ],
  gstRateOptions: [0, 5, 12, 18, 28],
  validityDays: 30,
  // Margin-floor guardrail (roadmap Phase 3a). 0 = off; set e.g. 20 to flag
  // any line whose post-discount gross margin (vs the product's cost) drops
  // below it. Only acts when products also have a cost set.
  minMarginPct: 0,
  quoteNumberPrefix: "SQ/M",
  quoteNumberSeqWidth: 6,
};

// ── Pricing models & units (Config sheet enums) ──────────────────────
export const PRICING_MODELS = [
  "SaaS Subscription", "One-time Licence", "Implementation", "AMC",
  "Per-transaction", "PaaS Per-Flight", "PaaS Per-Transaction",
];
export const QUOTE_UNITS = [
  "User", "Site", "Transaction", "Month", "Year", "Fixed", "Flight",
  "Page", "Container", "AWB", "GB", "HBL/MBL", "Man-Day", "Branch", "MB",
];

// Which pricing models are billed as one-time (everything else recurring).
// Mirrors the workbook Quotation!F15 charge-type formula.
export const ONE_TIME_MODELS = ["One-time Licence", "Implementation"];
// Models that honour a per-month minimum floor (greater-of). Workbook
// applies MAX(qty*price, min) on every line, but only these carry a min.
export const FLOOR_MODELS = ["PaaS Per-Flight", "PaaS Per-Transaction"];

// ── Product Catalogue (Product_Catalogue sheet) ──────────────────────
// rateSource: "Flat" (Tiered=No) | "Band" (Tiered=Yes) | "iCAFFE".
// listPrice null = "enter rate in master" (flag on quote, never silent 0).
export const HANS_CATALOGUE = [
  // Core SaaS products (P01–P15)
  { code: "P01", name: "iCAFFE", module: "Freight Forwarding Suite", description: "Freight forwarding & freight management (freight-TMS), SaaS", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Band", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "P02", name: "iCAFFE FMS", module: "Freight Management System", description: "Next-generation freight management system", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Band", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "P03", name: "iCAFFE AI DataMorph", module: "AI Document Automation", description: "AI-led document & data extraction / automation", pricingModel: "SaaS Subscription", unit: "Transaction", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "P04", name: "WiseCCS", module: "Cargo Community System", description: "Airport cargo community system for multi-stakeholder messaging", pricingModel: "SaaS Subscription", unit: "Site", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "P05", name: "ACMES", module: "Airport Cargo Community System", description: "ACS platform (deployed via Carico at DEL)", pricingModel: "SaaS Subscription", unit: "Site", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "P06", name: "WiseCargo", module: "Cargo Management System", description: "Terminal/airport cargo management solution", pricingModel: "SaaS Subscription", unit: "Site", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "P07", name: "WiseHandling (TAM)", module: "Ground Handling / Terminal & Apron Mgmt", description: "Ground handling, turnaround, workforce & GSE management", pricingModel: "SaaS Subscription", unit: "Site", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "P08", name: "BagTrack", module: "Baggage Tracking", description: "Baggage tracking & reconciliation", pricingModel: "SaaS Subscription", unit: "Site", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "P09", name: "TSM-Air", module: "Truck Slot Management", description: "Truck slot / dock appointment management", pricingModel: "SaaS Subscription", unit: "Site", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "P10", name: "WiseFleet", module: "Fleet / Transport-TMS", description: "Fleet & transport management (transport-TMS)", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "P11", name: "VMS", module: "Vehicle Management System", description: "Vehicle / parking / gate management", pricingModel: "SaaS Subscription", unit: "Site", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "P12", name: "Business Insights", module: "BI & Analytics", description: "Business intelligence & operational analytics", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "P13", name: "Business Insights+", module: "Advanced BI & Analytics", description: "Advanced analytics with extended data sources", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "P14", name: "SmartCRM", module: "CRM", description: "Sales & customer relationship management", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "P15", name: "HansHub", module: "Project / Partner / GTM Mgmt", description: "Project, partner & go-to-market management", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },

  // Services (S01–S04)
  { code: "S01", name: "Implementation & Onboarding", module: "Professional Services", description: "One-time implementation, configuration & onboarding", pricingModel: "Implementation", unit: "Fixed", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "S02", name: "Annual Maintenance (AMC)", module: "Support", description: "Annual maintenance & support contract", pricingModel: "AMC", unit: "Year", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "S03", name: "Perpetual Licence", module: "Licence", description: "One-time perpetual software licence", pricingModel: "One-time Licence", unit: "Site", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "S04", name: "Customization", module: "Professional Services", description: "Custom development / change requests", pricingModel: "Per-transaction", unit: "Transaction", listPrice: 14000, rateSource: "Flat", minMonthFloor: null, notes: "Per man-day, agreed SOW", active: true },

  // Optional Additional Services (AS01–AS11)
  { code: "AS01", name: "Server Setup, Implementation & Training", module: "Optional Additional Service", description: "One-time server setup, implementation & user training", pricingModel: "Implementation", unit: "Fixed", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "One-time (NA in V2 — often waived)", active: true },
  { code: "AS02", name: "DSC Server Licence Setup", module: "Optional Additional Service", description: "One-time DSC server licence setup (self-hosted)", pricingModel: "Implementation", unit: "Fixed", listPrice: 170000, rateSource: "Flat", minMonthFloor: null, notes: "One-time (if self-hosted)", active: true },
  { code: "AS03", name: "Data Migration", module: "Optional Additional Service", description: "Data migration from client's current system", pricingModel: "Implementation", unit: "Fixed", listPrice: 450000, rateSource: "Flat", minMonthFloor: null, notes: "One-time", active: true },
  { code: "AS04", name: "AI OCR Document Reading", module: "Optional Additional Service", description: "AI OCR scan per page (pay-per-use)", pricingModel: "Per-transaction", unit: "Page", listPrice: 10, rateSource: "Flat", minMonthFloor: null, notes: "Pay-per-use", active: true },
  { code: "AS05", name: "Ocean Container Tracking", module: "Optional Additional Service", description: "Container tracking (monthly billing)", pricingModel: "Per-transaction", unit: "Container", listPrice: 85, rateSource: "Flat", minMonthFloor: null, notes: "Monthly billing", active: true },
  { code: "AS06", name: "Cloud Data Storage", module: "Optional Additional Service", description: "Data storage per GB per month", pricingModel: "Per-transaction", unit: "GB", listPrice: 150, rateSource: "Flat", minMonthFloor: null, notes: "Monthly billing", active: true },
  { code: "AS07", name: "e-Invoice Transmission", module: "Optional Additional Service", description: "e-Invoice transmission to GST portal", pricingModel: "Per-transaction", unit: "Transaction", listPrice: 4, rateSource: "Flat", minMonthFloor: null, notes: "Monthly billing", active: true },
  { code: "AS08", name: "eAWB Transmission", module: "Optional Additional Service", description: "eAWB per MAWB/HAWB (monthly billing)", pricingModel: "Per-transaction", unit: "AWB", listPrice: 60, rateSource: "Flat", minMonthFloor: null, notes: "Monthly billing", active: true },
  { code: "AS09", name: "Import Air Consol Filing", module: "Optional Additional Service", description: "Air import consol filing per HAWB/MAWB", pricingModel: "Per-transaction", unit: "AWB", listPrice: 50, rateSource: "Flat", minMonthFloor: null, notes: "Monthly billing", active: true },
  { code: "AS10", name: "Import Sea Consol Filing", module: "Optional Additional Service", description: "Sea import consol filing per HBL/MBL", pricingModel: "Per-transaction", unit: "HBL/MBL", listPrice: 500, rateSource: "Flat", minMonthFloor: null, notes: "Monthly billing", active: true },
  { code: "AS11", name: "Infrastructure / Hosting", module: "Optional Additional Service", description: "Managed cloud infrastructure / hosting (recurring monthly)", pricingModel: "SaaS Subscription", unit: "Month", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Recurring monthly hosting (pair with CC04 / self-hosted)", active: true },

  // WiseHandling — PaaS Per-Flight (WH01–WH12), per-flight rate + monthly floor
  { code: "WH01", name: "Manpower & Roster Management", module: "WiseHandling (Ground Handling)", description: "Employee details, shifts, roster groups, attendance, BA test", pricingModel: "PaaS Per-Flight", unit: "Flight", listPrice: 50, rateSource: "Flat", minMonthFloor: 100000, notes: "Per-flight; monthly minimum floor", active: true },
  { code: "WH02", name: "Equipment Management", module: "WiseHandling (Ground Handling)", description: "GSE inventory, status checklist, maintenance, tracking, allocation", pricingModel: "PaaS Per-Flight", unit: "Flight", listPrice: 50, rateSource: "Flat", minMonthFloor: 100000, notes: "Per-flight; monthly minimum floor", active: true },
  { code: "WH03", name: "Training Management", module: "WiseHandling (Ground Handling)", description: "Training master, allocation, notifications, status & tracking", pricingModel: "PaaS Per-Flight", unit: "Flight", listPrice: 50, rateSource: "Flat", minMonthFloor: 100000, notes: "Per-flight; monthly minimum floor", active: true },
  { code: "WH04", name: "Contract Management & Billing", module: "WiseHandling (Ground Handling)", description: "Contracts, SLAs, service rates, billing, invoicing, reconciliation", pricingModel: "PaaS Per-Flight", unit: "Flight", listPrice: 75, rateSource: "Flat", minMonthFloor: 150000, notes: "Per-flight; monthly minimum floor", active: true },
  { code: "WH05", name: "Flight Allocation & Operations", module: "WiseHandling (Ground Handling)", description: "Flight schedule, planning, allocation, ops recording, monitor, close", pricingModel: "PaaS Per-Flight", unit: "Flight", listPrice: 75, rateSource: "Flat", minMonthFloor: 150000, notes: "Per-flight; monthly minimum floor", active: true },
  { code: "WH06", name: "MIS & Dashboard", module: "WiseHandling (Ground Handling)", description: "Real-time operational metrics & dashboards", pricingModel: "PaaS Per-Flight", unit: "Flight", listPrice: 0, rateSource: "Flat", minMonthFloor: null, notes: "Inclusive", active: true, inclusive: true },
  { code: "WH07", name: "Mobile Application", module: "WiseHandling (Ground Handling)", description: "Ground-staff mobile app", pricingModel: "PaaS Per-Flight", unit: "Flight", listPrice: 0, rateSource: "Flat", minMonthFloor: null, notes: "Inclusive", active: true, inclusive: true },
  { code: "WH08", name: "Onboarding / Technical Support", module: "WiseHandling (Ground Handling)", description: "Onboarding cost variable / 24x7 technical support", pricingModel: "PaaS Per-Flight", unit: "Flight", listPrice: 300, rateSource: "Flat", minMonthFloor: 600000, notes: "Per-flight; monthly minimum floor", active: true },
  { code: "WH09", name: "One-Time Setup Cost", module: "WiseHandling (Ground Handling)", description: "One-time setup", pricingModel: "Implementation", unit: "Fixed", listPrice: 600000, rateSource: "Flat", minMonthFloor: null, notes: "One-time", active: true },
  { code: "WH10", name: "Training & Handholding", module: "WiseHandling (Ground Handling)", description: "One-time training & handholding", pricingModel: "Implementation", unit: "Fixed", listPrice: 500000, rateSource: "Flat", minMonthFloor: null, notes: "One-time", active: true },
  { code: "WH11", name: "Customization (after 90 days)", module: "WiseHandling (Ground Handling)", description: "Per man-day; first 90 days free", pricingModel: "Per-transaction", unit: "Man-Day", listPrice: 16800, rateSource: "Flat", minMonthFloor: null, notes: "Per man-day; 90 days free", active: true },
  { code: "WH12", name: "Integration (As Per Actual)", module: "WiseHandling (Ground Handling)", description: "Airline/financial/tax/3rd-party/WhatsApp/SMS/BI — quoted at actuals", pricingModel: "Implementation", unit: "Fixed", listPrice: 0, rateSource: "Flat", minMonthFloor: null, notes: "As per actual", active: true },

  // WiseCCS (CC01–CC04)
  { code: "CC01", name: "WiseCCS — Community Fee (per AWB)", module: "WiseCCS (Cargo Community System)", description: "Per-AWB community / messaging transaction fee", pricingModel: "PaaS Per-Transaction", unit: "AWB", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Model 1: per-AWB; monthly minimum floor", active: true },
  { code: "CC02", name: "WiseCCS — Stakeholder Subscription", module: "WiseCCS (Cargo Community System)", description: "Per-stakeholder / user monthly subscription (agents, airlines, GHAs)", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Model 2: per-stakeholder/month; set rateSource=Band for tiers", active: true },
  { code: "CC03", name: "WiseCCS — SaaS (with Infrastructure)", module: "WiseCCS (Cargo Community System)", description: "Hosted SaaS — Hans-managed infrastructure / hosting included", pricingModel: "SaaS Subscription", unit: "Site", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Model 3a: hosted SaaS, infra included (recurring). Must be > CC04.", active: true },
  { code: "CC04", name: "WiseCCS — SaaS (without Infrastructure)", module: "WiseCCS (Cargo Community System)", description: "SaaS software subscription — client provides / hosts the infrastructure", pricingModel: "SaaS Subscription", unit: "Site", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Model 3b: SaaS software only, client-hosted (recurring)", active: true },

  // iCAFFE editions (IC01–IC07) — matrix-driven; product.name === rate-card edition
  { code: "IC01", name: "FULL Stack iCAFFE", module: "iCAFFE Edition", description: "Customs + Freight Forwarding + Accounts (full stack)", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "iCAFFE", minMonthFloor: null, notes: "Per-user/month from iCAFFE rate card (edition × band)", active: true },
  { code: "IC02", name: "EDI + Account", module: "iCAFFE Edition", description: "EDI/ICEGATE + Accounts", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "iCAFFE", minMonthFloor: null, notes: "Per-user/month from iCAFFE rate card (edition × band)", active: true },
  { code: "IC03", name: "EDI + Freight Forwarding", module: "iCAFFE Edition", description: "EDI/ICEGATE + Freight Forwarding", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "iCAFFE", minMonthFloor: null, notes: "Per-user/month from iCAFFE rate card (edition × band)", active: true },
  { code: "IC04", name: "EDI + Billing", module: "iCAFFE Edition", description: "EDI/ICEGATE + Billing", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "iCAFFE", minMonthFloor: null, notes: "Per-user/month from iCAFFE rate card (edition × band)", active: true },
  { code: "IC05", name: "EDI", module: "iCAFFE Edition", description: "EDI/ICEGATE customs filing", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "iCAFFE", minMonthFloor: null, notes: "Per-user/month from iCAFFE rate card (edition × band)", active: true },
  { code: "IC06", name: "EDI - Export Only", module: "iCAFFE Edition", description: "EDI export only", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "iCAFFE", minMonthFloor: null, notes: "Per-user/month from iCAFFE rate card (edition × band)", active: true },
  { code: "IC07", name: "EDI - Import Only", module: "iCAFFE Edition", description: "EDI import only", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "iCAFFE", minMonthFloor: null, notes: "Per-user/month from iCAFFE rate card (edition × band). Independent of Export-Only by design.", active: true },
];

// ── Pricing Bands (Pricing_Bands sheet) — rates intentionally blank ──
export const PRICING_BANDS = [
  { band: "0 – 150",  fromUsers: 0,   toUsers: 150,    ratePerUserMonth: null },
  { band: "151 – 250", fromUsers: 151, toUsers: 250,    ratePerUserMonth: null },
  { band: "251 – 350", fromUsers: 251, toUsers: 350,    ratePerUserMonth: null },
  { band: "350 +",    fromUsers: 351, toUsers: 999999, ratePerUserMonth: null },
];

// ── iCAFFE rate card (iCAFFE_RateCard sheet) ─────────────────────────
// Band thresholds (ascending) → band index 0…9; bandIndex = highest band
// whose bandFrom ≤ qty (qty < 5 maps to band 0, the "5 (Min)" band).
export const ICAFFE_BAND_FROM = [0, 6, 11, 16, 26, 36, 46, 61, 81, 111];
export const ICAFFE_BAND_LABELS = ["5 (Min)", "6-10", "11-15", "16-25", "26-35", "36-45", "46-60", "61-80", "81-110", "111+"];

// Section A — per-user/month matrix (rows = editions; cols align to ICAFFE_BAND_FROM).
export const ICAFFE_EDITIONS = [
  { name: "FULL Stack iCAFFE",       setupPerBranch: 25000, migration: 450000, rates: [3500, 3400, 3300, 3100, 3050, 3000, 2900, 2800, 2700, 2500] },
  { name: "EDI + Account",           setupPerBranch: 25000, migration: null,   rates: [3100, 3050, 3000, 2900, 2800, 2700, 2600, 2500, 2400, 2300] },
  { name: "EDI + Freight Forwarding", setupPerBranch: 25000, migration: null,  rates: [2800, 2750, 2700, 2600, 2500, 2400, 2300, 2200, 2100, 2000] },
  { name: "EDI + Billing",           setupPerBranch: 25000, migration: null,   rates: [2600, 2550, 2500, 2400, 2300, 2200, 2100, 2000, 1900, 1800] },
  { name: "EDI",                     setupPerBranch: 20000, migration: null,   rates: [2400, 2350, 2300, 2200, 2100, 2000, 1900, 1800, 1700, 1600] },
  { name: "EDI - Export Only",       setupPerBranch: 20000, migration: null,   rates: [2200, 2000, 1950, 1900, 1850, 1800, 1750, 1700, 1650, 1500] },
  { name: "EDI - Import Only",       setupPerBranch: 20000, migration: null,   rates: [2200, 2000, 1950, 1900, 1850, 1800, 1750, 1700, 1650, 1500] },
];

// Section B — plan presets (set Months + discountPct/prepayment on the quote).
export const ICAFFE_PLANS = {
  // Month-to-month subscription — no prepayment discount; billed monthly or
  // quarterly (cadence is invoicing only, it doesn't change the total).
  saasMonthly: { label: "SaaS Monthly", months: 12, prepaymentDiscountPct: 0, billingFrequency: "Monthly" },
  saasAdvance: { label: "SaaS Advance", months: 12, prepaymentDiscountPct: 10, billingFrequency: "Annual" },
  // OTP factor 0.55 ≈ 45% discount applied as discountPct on the 42-month value.
  otpArr: { label: "OTP + ARR (42-mo adv)", months: 42, otpFactor: 0.55, discountPct: 45, prebillingDiscPct: 10, arrPct: 25, griPct: 10, billingFrequency: "Annual" },
};

// Billing cadence options for recurring SaaS (invoicing schedule only).
export const BILLING_FREQUENCIES = ["Monthly", "Quarterly", "Half-Yearly", "Annual"];

// Section C — VAS price list (informational; chargeable equivalents are AS04–AS10).
export const ICAFFE_VAS = [
  { service: "eAWB Charges", rate: 65, unit: "Per MAWB/HAWB" },
  { service: "OCR", rate: 10, unit: "Per Page" },
  { service: "Ocean Tracking", rate: 85, unit: "Per Container" },
  { service: "DMS", rate: 0.65, unit: "Per Page" },
  { service: "Data Storage", rate: 50, unit: "Per GB/Month" },
  { service: "Customisation", rate: 14000, unit: "Per Man-Day" },
];

// Section D — lump-sum / one-time setup tiers by branch count.
export const ICAFFE_LUMPSUM = {
  hansServer:   { lt3: 50000,  b3to8: 125000, gt8: 200000 },
  clientServer: { lt3: 100000, b3to8: 175000, gt8: 300000 },
  extraPerUser: 5500,
  migrationLogisys: 450000,
};

// ── Terms library (Terms_Library sheet) ──────────────────────────────
export const QUOTE_TERMS = [
  { key: "Validity", text: "This quotation is valid for 30 days from the date of issue." },
  { key: "Taxes", text: "GST as applicable (default 18%); any statutory variation will be charged at actuals." },
  { key: "Payment", text: "Recurring fees billed in advance; one-time charges as per agreed milestones." },
  { key: "Prepayment", text: "5% discount on annual prepayment, where opted." },
  { key: "Implementation", text: "Implementation timelines, scope and SLAs as per the signed agreement." },
  { key: "Support / AMC", text: "AMC commences post warranty/go-live as per agreement." },
  { key: "Confidentiality", text: "All information shared is confidential to Hans Infomatic Pvt. Ltd." },
  { key: "Exclusions", text: "Third-party licences, hardware, travel and infrastructure are excluded unless stated." },
];
