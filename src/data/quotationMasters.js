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
  // Products always hosted by Hans: a quote for them never asks "Hans or client hosting".
  hansHostedProductIds: ["AMSOcean", "AMSAir", "AMSIGM"],
  alrPctOfLicence: 20,           // legacy name; AMC uses amcDefaultPct (falls back to this)
  // AMC on one-time licences (lib/quotation/amc.js)
  amcDefaultPct: 20,             // % of the licence fee per year (a product can set its own)
  amcStartYear: 2,               // contract year AMC starts (year 1 = warranty)
  amcFixedYears: 2,              // AMC years before the first increase
  amcEscalationPct: 10,          // increase per step
  amcEscalationEvery: 2,         // years between increases
  amcScheduleYears: 5,           // AMC years shown on the quote
  amcBase: "net",                // "net" = after discount · "list" = listed fee before discount (invoice wording)
  // Quote numbers as on Hans' quotations: DEL/SQ/0005/2627 (office/SQ/no./FY).
  quoteNumberFormat: "office",   // "office" | "classic" (SQ/M000013/26-27)
  quoteDefaultOffice: "DEL",     // when the rep's branch has no office code
  quoteOfficeCodes: {},          // branchId → office code (defaults in docNumbers.js)
  quoteOfficeStart: {},          // "DEL:26-27" → continue numbering from
  company: {},                   // letterhead / registration / bank (lib/quotation/company.js)
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
  "Page", "Container", "AWB", "GB", "HBL/MBL", "Man-Day", "Branch", "MB", "HAWB", "HBL", "EGM", "Message", "Filing", "Amendment",
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
  { code: "P10", name: "WiseFleet", module: "Fleet / Transport-TMS", description: "Fleet & transport management (transport-TMS)", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Band", minMonthFloor: null, notes: "Per-user/month from pricing bands", active: true },
  { code: "P11", name: "VMS", module: "Vehicle Management System", description: "Vehicle / parking / gate management", pricingModel: "SaaS Subscription", unit: "Site", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Enter list price", active: true },
  { code: "P12", name: "Business Insights", module: "BI & Analytics", description: "Business intelligence & operational analytics", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Band", minMonthFloor: null, notes: "Per-user/month from pricing bands", active: true },
  { code: "P13", name: "Business Insights+", module: "Advanced BI & Analytics", description: "Advanced analytics with extended data sources", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Band", minMonthFloor: null, notes: "Per-user/month from pricing bands", active: true },
  { code: "P14", name: "SmartCRM", module: "CRM", description: "Sales & customer relationship management", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Band", minMonthFloor: null, notes: "Per-user/month from pricing bands", active: true },
  { code: "P15", name: "HansHub", module: "Project / Partner / GTM Mgmt", description: "Project, partner & go-to-market management", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Band", minMonthFloor: null, notes: "Per-user/month from pricing bands", active: true },
  { code: "P16", name: "WiseTrax", module: "Track & Trace", description: "Shipment / asset track-and-trace, SaaS", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Band", minMonthFloor: null, notes: "Per-user/month from pricing bands", active: true },
  { code: "P17", name: "HRMS", module: "Human Resource Management", description: "HR management system (employees, payroll, leave, attendance), SaaS", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Band", minMonthFloor: null, notes: "Per-user/month from pricing bands", active: true },
  // Billed per filing, matching how the lead form sizes the deal (monthly
  // Bills of Entry + monthly Shipping Bills). Flat rate — one price at any
  // volume; if this ever needs to tier by monthly filing count it becomes a
  // rate card (matrixId) like iCAFFE, not a listPrice change.
  // Advanced Manifest System (web-based) — Cargomar AMS pricing sheet. Ocean
  // consol bills per HBL at the slab of the month's volume (rateSource "Slab").
  { code: "AMS01", name: "Advanced Manifest System — One-time Registration", module: "AMS - Ocean Consol", description: "One-time registration for the web-based Advanced Manifest System", pricingModel: "Implementation", unit: "Fixed", listPrice: 5000, rateSource: "Flat", minMonthFloor: null, productId: "AMSOcean", notes: "Once per customer (covers Air and Ocean consol)", active: true },
  { code: "AMS02", name: "Ocean Consol Filing (SCMTR)", module: "AMS - Ocean Consol", description: "Ocean consol manifest filing to SCMTR, per HBL. Rate by the month's HBL volume", pricingModel: "Per-transaction", unit: "HBL", listPrice: null, rateSource: "Slab", slabs: [{ from: 0, rate: 800 }, { from: 201, rate: 700 }, { from: 501, rate: 500 }, { from: 700, rate: 400 }], minMonthFloor: null, productId: "AMSOcean", notes: "Slab on monthly HBL count: up to 200 ₹800 · 201–500 ₹700 · 501–699 ₹500 · 700+ ₹400", active: true },
  { code: "AMS03", name: "Advanced Manifest System — One-time Registration", module: "AMS - Air Consol", description: "One-time registration for the web-based Advanced Manifest System", pricingModel: "Implementation", unit: "Fixed", listPrice: 5000, rateSource: "Flat", minMonthFloor: null, productId: "AMSAir", notes: "Once per customer (covers Air and Ocean consol)", active: true },
  { code: "AMS04", name: "Air Consol Filing", module: "AMS - Air Consol", description: "Air consol manifest filing, per HAWB", pricingModel: "Per-transaction", unit: "HAWB", listPrice: 30, rateSource: "Flat", minMonthFloor: null, productId: "AMSAir", notes: "Per HAWB", active: true },
  // AMS® Version 2.0 web-based IGM / EGM, FWB & FHL, CTM & TP filing — from the
  // GMR Airport quotation (SQ/00149AMS/2526). Billed monthly on actual use.
  { code: "AMS05", name: "Web IGM Filing", module: "AMS - IGM-EGM Filing", description: "AMS® web-based IGM filing to ICEGATE, per flight", pricingModel: "Per-transaction", unit: "Flight", listPrice: 185, rateSource: "Flat", minMonthFloor: null, productId: "AMSIGM", notes: "Per flight", active: true },
  { code: "AMS06", name: "Web EGM Filing", module: "AMS - IGM-EGM Filing", description: "AMS® web-based EGM filing to ICEGATE, per flight", pricingModel: "Per-transaction", unit: "Flight", listPrice: 185, rateSource: "Flat", minMonthFloor: null, productId: "AMSIGM", notes: "Per flight", active: true },
  { code: "AMS07", name: "EGM Generation", module: "AMS - IGM-EGM Filing", description: "EGM generation charges, per EGM", pricingModel: "Per-transaction", unit: "EGM", listPrice: 100, rateSource: "Flat", minMonthFloor: null, productId: "AMSIGM", notes: "Per EGM", active: true },
  { code: "AMS08", name: "Physical Amendment", module: "AMS - IGM-EGM Filing", description: "Physical amendment per IGM / EGM / MAWB / SB (Delhi)", pricingModel: "Per-transaction", unit: "Amendment", listPrice: 150, rateSource: "Flat", minMonthFloor: null, productId: "AMSIGM", notes: "Per IGM / EGM / MAWB / SB, DEL; levies and penalties on the airline's account", active: true },
  { code: "AMS09", name: "FWB & FHL Filing", module: "AMS - IGM-EGM Filing", description: "AMS® FWB and FHL message filing, per message", pricingModel: "Per-transaction", unit: "Message", listPrice: 10, rateSource: "Flat", minMonthFloor: null, productId: "AMSIGM", notes: "Each FWB / FHL", active: true },
  { code: "AMS10", name: "CTM Filing", module: "AMS - IGM-EGM Filing", description: "e-filing of the Cargo Transfer Manifest (CTM), per filing", pricingModel: "Per-transaction", unit: "Filing", listPrice: 150, rateSource: "Flat", minMonthFloor: null, productId: "AMSIGM", notes: "Per CTM", active: true },
  { code: "AMS11", name: "TP Filing", module: "AMS - IGM-EGM Filing", description: "e-filing of the Transshipment Permit (TP), per filing", pricingModel: "Per-transaction", unit: "Filing", listPrice: 150, rateSource: "Flat", minMonthFloor: null, productId: "AMSIGM", notes: "Per TP", active: true },
  { code: "P18", name: "E-Annex Ultra", module: "ICEGATE Customs Filing", description: "E-Annex Ultra licence per location / branch, up to 1+4 users — Export & Import documentation", pricingModel: "One-time Licence", unit: "Branch", listPrice: 55000, rateSource: "Flat", minMonthFloor: null, amcFixed: 10000, productId: "EANNEX", notes: "Multi-location 100% extra · ALR ₹10,000 per branch per year after 365 days", active: true },
  { code: "EA02", name: "E-Annex Ultra — CHA Licence Change", module: "ICEGATE Customs Filing", description: "Change of CHA licence on an existing E-Annex Ultra installation", pricingModel: "Implementation", unit: "Fixed", listPrice: 20000, rateSource: "Flat", minMonthFloor: null, productId: "EANNEX", notes: "One-time (as quoted DEL/SQ/0005/2627)", active: true },

  // Orbis One — freight forwarding & customs clearance (OB01–OB18).
  // Source: Orbis One Sales Pricing and Feature Guide, 27 Oct 2026. Plans are
  // per user / month with a MINIMUM USER COMMITMENT (minQty): the engine bills
  // max(qty, minQty), so Essential can never quote below ₹14,995 / month.
  // Installation is ₹8,000 per committed user, one row per plan so its minimum
  // matches the plan. maxDiscountPct 0: any price below list needs management
  // approval (guide §1). Pay-per-use add-ons keep the company discount policy.
  // Separate EDI commercial pricing and WhatsApp overage are still to be
  // finalised by the product team (guide §3, §4).
  { code: "OB01", name: "Orbis One Essential", module: "Orbis One (Freight Forwarding & Customs)", description: "Shipment & job management, AWB, BL, CAN, DO, freight certificate, manual status update & sending; normal EDI (Bill of Entry / Shipping Bill) with standard checklist & reports; billing, invoicing & basic accounting; quotations; standard reports & basic dashboard. Includes 2 GB document storage and 20 WhatsApp messages / month (shared across the company).", pricingModel: "SaaS Subscription", unit: "User", listPrice: 2999, rateSource: "Flat", minMonthFloor: null, minQty: 5, maxDiscountPct: 0, productId: "OrbisOne", notes: "Per user / month · minimum 5 users (₹14,995/month) · below list needs management approval", active: true },
  { code: "OB02", name: "Orbis One Professional", module: "Orbis One (Freight Forwarding & Customs)", description: "Everything in Essential, plus advanced accounting. Includes 3 GB document storage and 30 WhatsApp messages / month (shared across the company).", pricingModel: "SaaS Subscription", unit: "User", listPrice: 3299, rateSource: "Flat", minMonthFloor: null, minQty: 5, maxDiscountPct: 0, productId: "OrbisOne", notes: "Per user / month · minimum 5 users (₹16,495/month) · below list needs management approval", active: true },
  { code: "OB03", name: "Orbis One Business", module: "Orbis One (Freight Forwarding & Customs)", description: "Everything in Professional, plus shipment planning, Quick Entry, Auto eSANCHIT, CB Saathi (OCR), Report Designer, Auto Status Update, Duty Calculator, Single Excel for Complete Job, CRM, customer service, event-based automatic shipment updates and User Performance. Includes 5 GB document storage and 70 WhatsApp messages / month (shared across the company).", pricingModel: "SaaS Subscription", unit: "User", listPrice: 3799, rateSource: "Flat", minMonthFloor: null, minQty: 10, maxDiscountPct: 0, productId: "OrbisOne", notes: "Per user / month · minimum 10 users (₹37,990/month) · below list needs management approval", active: true },
  { code: "OB04", name: "Orbis One Enterprise", module: "Orbis One (Freight Forwarding & Customs)", description: "Everything in Business, plus CCR, Customs Status Update, PGA Auto Compliance, AI Assistance for Compliance & Duty Check, CENTCOM, Orbis360 dashboard, WMS and Transport. Includes 6 GB document storage and 100 WhatsApp messages / month (shared across the company).", pricingModel: "SaaS Subscription", unit: "User", listPrice: 4199, rateSource: "Flat", minMonthFloor: null, minQty: 20, maxDiscountPct: 0, productId: "OrbisOne", notes: "Per user / month · minimum 20 users (₹83,980/month) · below list needs management approval", active: true },
  { code: "OB05", name: "Orbis One Installation & Training — Essential", module: "Orbis One (Freight Forwarding & Customs)", description: "One-time installation and training, ₹8,000 per committed user (minimum 5 users)", pricingModel: "Implementation", unit: "User", listPrice: 8000, rateSource: "Flat", minMonthFloor: null, minQty: 5, maxDiscountPct: 0, productId: "OrbisOne", notes: "One-time lump sum on committed users · minimum ₹40,000", active: true },
  { code: "OB06", name: "Orbis One Installation & Training — Professional", module: "Orbis One (Freight Forwarding & Customs)", description: "One-time installation and training, ₹8,000 per committed user (minimum 5 users)", pricingModel: "Implementation", unit: "User", listPrice: 8000, rateSource: "Flat", minMonthFloor: null, minQty: 5, maxDiscountPct: 0, productId: "OrbisOne", notes: "One-time lump sum on committed users · minimum ₹40,000", active: true },
  { code: "OB07", name: "Orbis One Installation & Training — Business", module: "Orbis One (Freight Forwarding & Customs)", description: "One-time installation and training, ₹8,000 per committed user (minimum 10 users)", pricingModel: "Implementation", unit: "User", listPrice: 8000, rateSource: "Flat", minMonthFloor: null, minQty: 10, maxDiscountPct: 0, productId: "OrbisOne", notes: "One-time lump sum on committed users · minimum ₹80,000", active: true },
  { code: "OB08", name: "Orbis One Installation & Training — Enterprise", module: "Orbis One (Freight Forwarding & Customs)", description: "One-time installation and training, ₹8,000 per committed user (minimum 20 users)", pricingModel: "Implementation", unit: "User", listPrice: 8000, rateSource: "Flat", minMonthFloor: null, minQty: 20, maxDiscountPct: 0, productId: "OrbisOne", notes: "One-time lump sum on committed users · minimum ₹160,000", active: true },
  { code: "OB11", name: "Orbis One — CB Saathi AI Document Reading", module: "Orbis One (Freight Forwarding & Customs)", description: "AI document reading (CB Saathi), per page", pricingModel: "Per-transaction", unit: "Page", listPrice: 10, rateSource: "Flat", minMonthFloor: null, productId: "OrbisOne", notes: "Pay-per-use, activated on request", active: true },
  { code: "OB12", name: "Orbis One — Additional Cloud Storage", module: "Orbis One (Freight Forwarding & Customs)", description: "Additional cloud data storage above the plan allowance, per GB / month", pricingModel: "Per-transaction", unit: "GB", listPrice: 500, rateSource: "Flat", minMonthFloor: null, productId: "OrbisOne", notes: "Per GB / month above allowance", active: true },
  { code: "OB13", name: "Orbis One — e-Invoice Transmission", module: "Orbis One (Freight Forwarding & Customs)", description: "e-Invoice transmission to the GST portal, per transmission", pricingModel: "Per-transaction", unit: "Transaction", listPrice: 4, rateSource: "Flat", minMonthFloor: null, productId: "OrbisOne", notes: "Pay-per-use, activated on request", active: true },
  { code: "OB14", name: "Orbis One — Ocean Container Tracking", module: "Orbis One (Freight Forwarding & Customs)", description: "Ocean container tracking, per container", pricingModel: "Per-transaction", unit: "Container", listPrice: 85, rateSource: "Flat", minMonthFloor: null, productId: "OrbisOne", notes: "Pay-per-use, activated on request", active: true },
  { code: "OB15", name: "Orbis One — eAWB Transmission", module: "Orbis One (Freight Forwarding & Customs)", description: "eAWB transmission to the airline, per AWB", pricingModel: "Per-transaction", unit: "AWB", listPrice: 80, rateSource: "Flat", minMonthFloor: null, productId: "OrbisOne", notes: "Pay-per-use, activated on request", active: true },
  { code: "OB16", name: "Orbis One — Air Import Consol Filing", module: "Orbis One (Freight Forwarding & Customs)", description: "Air import consol filing, per transmission", pricingModel: "Per-transaction", unit: "Transaction", listPrice: 35, rateSource: "Flat", minMonthFloor: null, productId: "OrbisOne", notes: "Pay-per-use, activated on request", active: true },
  { code: "OB17", name: "Orbis One — Sea Import Consol Filing (SCMTR)", module: "Orbis One (Freight Forwarding & Customs)", description: "Sea import consol filing (SCMTR), per transmission", pricingModel: "Per-transaction", unit: "Transaction", listPrice: 800, rateSource: "Flat", minMonthFloor: null, productId: "OrbisOne", notes: "Pay-per-use, activated on request", active: true },
  { code: "OB18", name: "Orbis One — SEZ Filing Services", module: "Orbis One (Freight Forwarding & Customs)", description: "SEZ filing services, per user", pricingModel: "Per-transaction", billingClass: "subscription", unit: "User", listPrice: 500, rateSource: "Flat", minMonthFloor: null, productId: "OrbisOne", notes: "Per user — confirm billing period (monthly / one-time) with management", active: true },

  // Orbis EDI — customs clearance EDI (OE01–OE17).
  // Source: Orbis EDI Pricing and Feature Guide, 27 Oct 2026. Two plans per
  // user / month with a 5-user minimum (minQty). Installation is ₹7,000 per
  // committed user, minimum ₹35,000 — one row, as both plans share the minimum.
  // The EDI guide sets no below-list approval rule, so plans follow the
  // company discount policy (no maxDiscountPct), unlike Orbis One.
  // To confirm (guide §5): filing allowance / transaction charges, IGM & EGM,
  // SEZ scope, users added after installation, iCAFFE migration pricing.
  { code: "OE01", name: "Orbis EDI Essential", module: "Orbis EDI (Customs Clearance)", description: "Import: Bill of Entry job creation, invoice & item entry, party details, BoE checklist (invoice-wise & item-wise), filing & acknowledgement. Export: Shipping Bill job creation, invoice & item entry, party details, SB checklist, filing & acknowledgement. Customs job search, standard EDI reports, manual job status update, standard documents & print formats. Includes 2 GB document storage and 10 WhatsApp messages / month (shared across the company).", pricingModel: "SaaS Subscription", unit: "User", listPrice: 2499, rateSource: "Flat", minMonthFloor: null, minQty: 5, productId: "OrbisEDI", notes: "Per user / month · minimum 5 users (₹12,495/month)", active: true },
  { code: "OE02", name: "Orbis EDI Intelligent", module: "Orbis EDI (Customs Clearance)", description: "Everything in EDI Essential, plus Report Designer, Customs Status Update, Quick Entry, Single Excel for Complete Job, Auto eSANCHIT, automatic IRN / DRN attachment, Auto Status Update, Duty Calculator, CCR, PGA Auto Compliance and AI assistance for compliance & duty check. Includes 5 GB document storage and 100 WhatsApp messages / month (shared across the company).", pricingModel: "SaaS Subscription", unit: "User", listPrice: 2999, rateSource: "Flat", minMonthFloor: null, minQty: 5, productId: "OrbisEDI", notes: "Per user / month · minimum 5 users (₹14,995/month)", active: true },
  { code: "OE05", name: "Orbis EDI Installation & Training", module: "Orbis EDI (Customs Clearance)", description: "One-time installation and training, ₹7,000 per committed user (minimum 5 users)", pricingModel: "Implementation", unit: "User", listPrice: 7000, rateSource: "Flat", minMonthFloor: null, minQty: 5, productId: "OrbisEDI", notes: "One-time lump sum on committed users · minimum ₹35,000", active: true },
  { code: "OE10", name: "Orbis EDI — SEZ Add-on (EDI Intelligent)", module: "Orbis EDI (Customs Clearance)", description: "SEZ filing add-on for the EDI Intelligent plan, per user / month", pricingModel: "SaaS Subscription", unit: "User", listPrice: 500, rateSource: "Flat", minMonthFloor: null, productId: "OrbisEDI", notes: "Per user / month · EDI Intelligent only", active: true },
  { code: "OE11", name: "Orbis EDI — CB Saathi AI Document Reading", module: "Orbis EDI (Customs Clearance)", description: "AI document reading (CB Saathi), per page — not free on either plan", pricingModel: "Per-transaction", unit: "Page", listPrice: 10, rateSource: "Flat", minMonthFloor: null, productId: "OrbisEDI", notes: "Pay-per-use, activated on request", active: true },
  { code: "OE12", name: "Orbis EDI — Additional Cloud Storage", module: "Orbis EDI (Customs Clearance)", description: "Additional cloud data storage above the plan allowance, per GB / month", pricingModel: "Per-transaction", unit: "GB", listPrice: 500, rateSource: "Flat", minMonthFloor: null, productId: "OrbisEDI", notes: "Per GB / month above allowance", active: true },
  { code: "OE13", name: "Orbis EDI — e-Invoice Transmission", module: "Orbis EDI (Customs Clearance)", description: "e-Invoice transmission to the GST portal, per transmission", pricingModel: "Per-transaction", unit: "Transaction", listPrice: 4, rateSource: "Flat", minMonthFloor: null, productId: "OrbisEDI", notes: "Pay-per-use, activated on request", active: true },
  { code: "OE14", name: "Orbis EDI — Ocean Container Tracking", module: "Orbis EDI (Customs Clearance)", description: "Ocean container tracking, per container", pricingModel: "Per-transaction", unit: "Container", listPrice: 85, rateSource: "Flat", minMonthFloor: null, productId: "OrbisEDI", notes: "Pay-per-use, activated on request", active: true },
  { code: "OE15", name: "Orbis EDI — eAWB Transmission", module: "Orbis EDI (Customs Clearance)", description: "eAWB transmission to the airline, per AWB", pricingModel: "Per-transaction", unit: "AWB", listPrice: 80, rateSource: "Flat", minMonthFloor: null, productId: "OrbisEDI", notes: "Pay-per-use, activated on request", active: true },
  { code: "OE16", name: "Orbis EDI — Air Import Consol Filing", module: "Orbis EDI (Customs Clearance)", description: "Air import consol filing, per transmission", pricingModel: "Per-transaction", unit: "Transaction", listPrice: 35, rateSource: "Flat", minMonthFloor: null, productId: "OrbisEDI", notes: "Pay-per-use, activated on request", active: true },
  { code: "OE17", name: "Orbis EDI — Sea Import Consol Filing (SCMTR)", module: "Orbis EDI (Customs Clearance)", description: "Sea import consol filing (SCMTR), per transmission", pricingModel: "Per-transaction", unit: "Transaction", listPrice: 800, rateSource: "Flat", minMonthFloor: null, productId: "OrbisEDI", notes: "Pay-per-use, activated on request", active: true },

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
  // WiseHandling Enterprise, all modules (software only; GSE trackers, installation,
  // SIM plans and field engineers are quoted separately by hand). From the AIASL
  // GHOMS budgetary quotes (19–20 Nov 2026): two ways to sell —
  //   SaaS:    ₹350 per flight, all modules incl. hosting, support, map licence and
  //            security audits; billed monthly in arrears on flights handled, with a
  //            minimum monthly charge agreed per contract (WH13).
  //   Licence: perpetual enterprise licence (WH14) + AMC 20% a year from year 2, with
  //            hosting, map licence and security audit charged separately (WH19–WH21).
  //   Either:  implementation ₹1,75,000 and training ₹70,000 per station; integration
  //            ₹25,00,000 per standard interface; configuration, maps / geofence set-up
  //            as quoted; change requests ₹16,800 per man-day (WH11).
  //   One-time charges: 50% with the purchase order, 50% on go-live.
  // Lump sums are the AIASL amounts (85 stations, about 2 lakh flights a year): adjust per deal.
  { code: "WH13", name: "WiseHandling Enterprise SaaS — all modules, per flight", module: "WiseHandling (Ground Handling)", description: "Flight operations and tasks, GSE and vehicles, manpower planning and tracking, safety and quality, MIS, dashboards, alerts, audit trail and mobile app; hosting on a MeitY-empanelled cloud (DC + DR), 24x7 L1/L2 support, upgrades and statutory changes, map licence and yearly security audits. Unlimited users and stations.", pricingModel: "PaaS Per-Flight", billingClass: "transaction", unit: "Flight", listPrice: 350, rateSource: "Flat", minMonthFloor: null, productId: "WiseHandling", itemType: "Plan", notes: "Billed monthly in arrears on flights handled; minimum monthly charge agreed per contract; no licence fee or AMC", active: true },
  { code: "WH14", name: "WiseHandling Perpetual Enterprise Licence — all modules", module: "WiseHandling (Ground Handling)", description: "One-time, perpetual, non-exclusive, non-transferable enterprise licence for the customer's own operations: flight operations and tasks, GSE and vehicles, manpower planning and tracking, safety and quality, MIS, dashboards and mobile app. No limit on users, stations or flights. Year 1 under warranty; AMC 20% of the licence a year from year 2.", pricingModel: "One-time Licence", unit: "Licence", listPrice: 226800000, rateSource: "Flat", minMonthFloor: null, amcPct: 20, productId: "WiseHandling", itemType: "Licence", notes: "AIASL budgetary price (85 stations); set per deal", active: true },
  { code: "WH15", name: "Implementation, deployment, testing and commissioning", module: "WiseHandling (Ground Handling)", description: "Per station, phased roll-out (pilot, metros, then remaining stations)", pricingModel: "Implementation", unit: "Station", listPrice: 175000, rateSource: "Flat", minMonthFloor: null, productId: "WiseHandling", itemType: "Implementation", notes: "₹1,75,000 per station", active: true },
  { code: "WH16", name: "Training, documentation and change management", module: "WiseHandling (Ground Handling)", description: "Per station; train-the-trainer, manuals and e-learning", pricingModel: "Implementation", unit: "Station", listPrice: 70000, rateSource: "Flat", minMonthFloor: null, productId: "WiseHandling", itemType: "Implementation", notes: "₹70,000 per station", active: true },
  { code: "WH17", name: "Configuration and customisation (gap build)", module: "WiseHandling (Ground Handling)", description: "Gap build on WiseHandling to the customer's requirements (e.g. GPS / geofence engine, reconciliation, safety and CAPA)", pricingModel: "Implementation", unit: "Lump sum", listPrice: 17500000, rateSource: "Flat", minMonthFloor: null, productId: "WiseHandling", itemType: "Service", notes: "AIASL scope; set per deal", active: true },
  { code: "WH18", name: "Integration — per standard interface", module: "WiseHandling (Ground Handling)", description: "Standard documented APIs, e.g. GPS / telematics, HRMS and biometric attendance; further interfaces as per actuals", pricingModel: "Implementation", unit: "Interface", listPrice: 2500000, rateSource: "Flat", minMonthFloor: null, productId: "WiseHandling", itemType: "Integration", notes: "₹25,00,000 per interface", active: true },
  { code: "WH19", name: "Airside maps and geofence set-up", module: "WiseHandling (Ground Handling)", description: "One-time digitisation of airside maps and geofences for the customer's stations", pricingModel: "Implementation", unit: "Lump sum", listPrice: 3500000, rateSource: "Flat", minMonthFloor: null, productId: "WiseHandling", itemType: "Service", notes: "AIASL: 85 stations; set per deal", active: true },
  { code: "WH20", name: "Hosting on MeitY-empanelled cloud (DC + DR) — licence model", module: "WiseHandling (Ground Handling)", description: "Hosting with disaster recovery for the licence model (included in the SaaS fee). Set-up ₹12,00,000 is quoted as WH21.", pricingModel: "SaaS Subscription", unit: "Month", listPrice: 625000, rateSource: "Flat", minMonthFloor: null, productId: "WiseHandling", itemType: "Service", oneTimeAllowed: false, notes: "₹75,00,000 a year (AIASL scale)", active: true },
  { code: "WH21", name: "Hosting set-up, map licence and security audit — licence model", module: "WiseHandling (Ground Handling)", description: "Hosting set-up ₹12,00,000 and CERT-In security audit at go-live ₹12,00,000 (one time). The yearly map licence (₹10,00,000) and security audit (₹10,00,000) are quoted as WH22.", pricingModel: "Implementation", unit: "Lump sum", listPrice: 2400000, rateSource: "Flat", minMonthFloor: null, productId: "WiseHandling", itemType: "Service", notes: "Licence model only; included in the SaaS fee", active: true },
  { code: "WH22", name: "Map licence and yearly security audit — licence model", module: "WiseHandling (Ground Handling)", description: "Annual airside map licence (₹10,00,000) and yearly CERT-In security audit (₹10,00,000)", pricingModel: "SaaS Subscription", unit: "Month", listPrice: 166666.67, rateSource: "Flat", minMonthFloor: null, productId: "WiseHandling", itemType: "Service", oneTimeAllowed: false, notes: "₹20,00,000 a year; licence model only", active: true },

  // WiseCCS (CC01–CC04)
  { code: "CC01", name: "WiseCCS — Community Fee (per AWB)", module: "WiseCCS (Cargo Community System)", description: "Per-AWB community / messaging transaction fee", pricingModel: "PaaS Per-Transaction", unit: "AWB", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Model 1: per-AWB; monthly minimum floor", active: true },
  { code: "CC02", name: "WiseCCS — Stakeholder Subscription", module: "WiseCCS (Cargo Community System)", description: "Per-stakeholder / user monthly subscription (agents, airlines, GHAs)", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "Band", minMonthFloor: null, notes: "Model 2: per-stakeholder/month from pricing bands", active: true },
  { code: "CC03", name: "WiseCCS — SaaS (with Infrastructure)", module: "WiseCCS (Cargo Community System)", description: "Hosted SaaS — Hans-managed infrastructure / hosting included", pricingModel: "SaaS Subscription", unit: "Site", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Model 3a: hosted SaaS, infra included (recurring). Must be > CC04.", active: true },
  { code: "CC04", name: "WiseCCS — SaaS (without Infrastructure)", module: "WiseCCS (Cargo Community System)", description: "SaaS software subscription — client provides / hosts the infrastructure", pricingModel: "SaaS Subscription", unit: "Site", listPrice: null, rateSource: "Flat", minMonthFloor: null, notes: "Model 3b: SaaS software only, client-hosted (recurring)", active: true },

  // iCAFFE editions (IC01–IC07) — matrix-driven; product.name === rate-card edition
  { code: "IC01", name: "FULL Stack iCAFFE", module: "iCAFFE Edition", description: "Customs + Freight Forwarding + Accounts (full stack)", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "iCAFFE", minMonthFloor: null, notes: "Per-user/month from iCAFFE rate card (edition × band)", active: true },
  { code: "IC02", name: "EDI + Account", module: "iCAFFE Edition", description: "EDI/ICEGATE + Accounts", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "iCAFFE", minMonthFloor: null, notes: "Per-user/month from iCAFFE rate card (edition × band)", active: true },
  { code: "IC03", name: "EDI + Freight Forwarding", module: "iCAFFE Edition", description: "EDI/ICEGATE + Freight Forwarding", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "iCAFFE", minMonthFloor: null, notes: "Per-user/month from iCAFFE rate card (edition × band)", active: true },
  { code: "IC04", name: "EDI + Billing", module: "iCAFFE Edition", description: "EDI/ICEGATE + Billing", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "iCAFFE", minMonthFloor: null, notes: "Per-user/month from iCAFFE rate card (edition × band)", active: true },
  { code: "IC05", name: "EDI", module: "iCAFFE Edition", description: "EDI/ICEGATE customs filing", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "iCAFFE", minMonthFloor: null, notes: "Per-user/month from iCAFFE rate card (edition × band)", active: true },
  { code: "IC06", name: "EDI - Export Only", module: "iCAFFE Edition", description: "EDI export only", pricingModel: "SaaS Subscription", unit: "User", listPrice: null, rateSource: "iCAFFE", minMonthFloor: null, notes: "Per-user/month from iCAFFE rate card (edition × band)", active: true },
  { code: "IC08", name: "iCAFFE One-time Registration (per branch)", module: "iCAFFE Edition", description: "One-time registration charges per branch — SaaS", pricingModel: "Implementation", unit: "Branch", listPrice: 25000, rateSource: "Flat", minMonthFloor: null, productId: "iCAFFE", notes: "Non-refundable", active: true },
  { code: "IC09", name: "iCAFFE EDI One-time Set-up", module: "iCAFFE Edition", description: "One-time set-up for the iCAFFE EDI (custom clearance) SaaS module", pricingModel: "Implementation", unit: "Branch", listPrice: 40000, rateSource: "Flat", minMonthFloor: null, productId: "iCAFFE", notes: "As quoted DEL/SQ/0077/2526", active: true },
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

// Customer segments for segment-based price lists (roadmap Phase 2b).
// "Commercial" is the default (the base list price); others can carry a
// per-product override in product.segmentPrices.
export const QUOTE_SEGMENTS = ["Commercial", "Government / PSU", "SME", "Enterprise"];

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
