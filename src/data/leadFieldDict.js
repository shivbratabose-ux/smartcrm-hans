// ─────────────────────────────────────────────────────────────────────────────
// LOB LEAD-CAPTURE FIELD DICTIONARY
// ─────────────────────────────────────────────────────────────────────────────
// Source: Hans_LOB_LeadCapture_Fields.xlsx (Hans Infomatic LOB Field Dictionary).
//
// The common fields (Sections A–F) are already on the live Lead form and apply
// to every lead. THIS dictionary holds only the EXTRA, product-specific
// qualifying fields. When a lead's selected product(s) match an entry here, the
// matching fields render dynamically on the form and their answers are stored
// in lead.productFields[<productKey>][<fieldKey>] — a single JSONB blob, so no
// new columns per field and no data loss.
//
// Field types: text | longtext | number | dropdown | multiselect | date | rating
//   options: array of picklist values (dropdown / multiselect)
//   required: mandatory at capture
//   sizing:   feeds the lead Score (0–100)
//
// This object is the DEFAULT. It is registered into Masters (app_settings) so an
// admin can override it per-org without a code change — see registerLeadFields.
// ─────────────────────────────────────────────────────────────────────────────

export const LEAD_FIELD_TYPES = ["text", "longtext", "number", "dropdown", "multiselect", "date", "rating"];

// Default dictionary keyed by product name (matched case-insensitively, ignoring
// spaces/dashes/dots — see normProductKey). `aliases` adds extra match strings.
export const LEAD_PRODUCT_FIELDS_DEFAULT = {
  "iCAFFE": {
    label: "iCAFFE",
    fields: [
      { key: "forwarderModality", label: "Forwarder Modality", type: "multiselect", options: ["Air", "Ocean", "Multimodal", "Project Cargo", "Courier/Express"] },
      { key: "tradeDirection", label: "Trade Direction", type: "multiselect", options: ["Import", "Export", "Cross-trade / Triangular"] },
      { key: "keyTradeLanes", label: "Key Trade Lanes", type: "text" },
      { key: "erpToIntegrate", label: "Accounting / ERP to Integrate", type: "dropdown", options: ["Tally", "SAP", "Busy", "Zoho", "Other"] },
      { key: "integrationsRequired", label: "Integrations Required", type: "multiselect", options: ["ICEGATE", "Carrier/Airline EDI", "Accounting", "Banking", "Co-loader/Agent", "Track & Trace"] },
    ],
  },
  "E-Annex Ultra": {
    label: "E-Annex Ultra", aliases: ["eannex", "eannexultra", "e-annex"],
    fields: [
      { key: "icegateRegistered", label: "ICEGATE Registered", type: "dropdown", options: ["Yes", "No", "In progress"], required: true },
      { key: "monthlyBoeImport", label: "Monthly Bills of Entry (Import)", type: "number", sizing: true },
      { key: "monthlySbExport", label: "Monthly Shipping Bills (Export)", type: "number", sizing: true },
      { key: "customsLocations", label: "Customs Locations / Ports", type: "text" },
      { key: "specialSchemes", label: "Special Schemes Used", type: "multiselect", options: ["AEO", "SEZ", "EOU", "MOOWR", "Drawback", "RoDTEP", "None"] },
    ],
  },
  "AMS - Ocean Consol": {
    label: "AMS — Ocean Consol", aliases: ["amsocean", "amsoceanconsol", "oceanconsol"],
    fields: [
      { key: "role", label: "Role", type: "dropdown", options: ["NVOCC", "Ocean Consolidator", "Co-loader", "Forwarder", "Agent"], required: true },
      { key: "monthlyOceanConsolVol", label: "Monthly Ocean Consol Volume (Boxes/TEU)", type: "number", sizing: true },
      { key: "monthlyHbl", label: "Monthly HBL Count", type: "number", sizing: true },
      { key: "monthlyMbl", label: "Monthly MBL Count", type: "number", sizing: true },
      { key: "manifestDestinations", label: "Manifest / Customs Destinations", type: "multiselect", options: ["India IGM/EGM", "US AMS", "Canada ACI", "EU ENS", "Other"], required: true },
      { key: "originStations", label: "Number of Origin Stations", type: "number", sizing: true },
    ],
  },
  "AMS - Air Consol": {
    label: "AMS — Air Consol", aliases: ["amsair", "amsairconsol", "airconsol"],
    fields: [
      { key: "role", label: "Role", type: "dropdown", options: ["Airline", "GSA", "Air Consolidator", "Forwarder", "Agent"], required: true },
      { key: "monthlyAirTonnage", label: "Monthly Air Tonnage", type: "number", sizing: true },
      { key: "monthlyMawb", label: "Monthly MAWB Count", type: "number", sizing: true },
      { key: "monthlyHawb", label: "Monthly HAWB Count", type: "number", sizing: true },
      { key: "consolsPerMonth", label: "Consolidations per Month", type: "number", sizing: true },
      { key: "airlinesHandled", label: "Airlines Handled / Carried", type: "text" },
    ],
  },
  "AMS - IGM-EGM Filing": {
    label: "AMS — IGM/EGM Filing", aliases: ["amsigm", "amsigmegm", "igmegmfiling", "igmegm"],
    fields: [
      { key: "entityType", label: "Entity Type", type: "dropdown", options: ["Airline", "GHA / Custodian", "Shipping Line", "Forwarder", "Agent"], required: true },
      { key: "mode", label: "Mode", type: "dropdown", options: ["Air", "Ocean", "Both"], required: true },
      { key: "inboundPerWeek", label: "Inbound Flights / Voyages per Week", type: "number", sizing: true },
      { key: "outboundPerWeek", label: "Outbound Flights / Voyages per Week", type: "number", sizing: true },
      { key: "monthlyIgm", label: "Monthly IGM Filings", type: "number", sizing: true },
      { key: "monthlyEgm", label: "Monthly EGM Filings", type: "number", sizing: true },
      { key: "portsOfOperation", label: "Airports / Ports of Operation", type: "text", required: true },
      { key: "customsLocationIcegate", label: "Customs Location (ICEGATE)", type: "text" },
    ],
  },
  "WiseDox": {
    label: "WiseDOX", aliases: ["wisedox"],
    fields: [
      { key: "buyerType", label: "Buyer Type", type: "dropdown", options: ["Government", "PSU", "Enterprise", "Institution"], required: true },
      { key: "engagementDriver", label: "Engagement Driver", type: "dropdown", options: ["Tender / RFP", "Direct", "Renewal", "GeM"], required: true },
      { key: "tenderRefNo", label: "Tender Reference No.", type: "text" },
      { key: "tenderAuthority", label: "Tender Issuing Authority", type: "text" },
      { key: "tenderValue", label: "Tender / Project Value", type: "dropdown", options: ["Not disclosed", "<₹25L", "₹25L–1Cr", "₹1–5Cr", ">₹5Cr"], sizing: true },
      { key: "tenderDeadline", label: "Tender Submission Deadline", type: "date", required: true },
      { key: "documentVolume", label: "Document Volume (pages / files)", type: "number", sizing: true },
      { key: "scopeRequired", label: "Scope Required", type: "multiselect", options: ["Scanning/Digitization", "DMS storage", "OCR", "AI IDP", "Workflow/Approval", "Records retention"], required: true },
      { key: "compliance", label: "Compliance / Standards", type: "text" },
      { key: "emdRequired", label: "EMD / Bid Security Required", type: "dropdown", options: ["Yes", "No", "Not known"] },
    ],
  },
  "WiseTrax": {
    label: "WiseTrax", aliases: ["wisetrax"],
    fields: [
      { key: "entityType", label: "Entity Type", type: "dropdown", options: ["Airline", "GHA", "Forwarder", "CCS / Community", "GSA"], required: true },
      { key: "currentMessagingProvider", label: "Current Messaging Provider", type: "dropdown", options: ["SITA", "ARINC/Rockwell", "CHAMP Traxon", "In-house", "None"] },
      { key: "messageTypes", label: "Message Types Needed", type: "multiselect", options: ["FWB", "FHL", "FFM", "FSU", "FNA", "FMA", "XFWB/XFHL", "CAMIR / Customs"], required: true },
      { key: "monthlyMessageVolume", label: "Monthly Message Volume", type: "number", sizing: true },
      { key: "stations", label: "Number of Stations / Connections", type: "number", sizing: true },
      { key: "airlineLinks", label: "Number of Airline / Partner Links", type: "number", sizing: true },
      { key: "connectivityMode", label: "Connectivity Mode", type: "multiselect", options: ["Type B", "XML/EDI", "API"] },
    ],
  },
  "WiseCargo": {
    label: "WiseCargo", aliases: ["wisecargo"],
    fields: [
      { key: "entityType", label: "Entity Type", type: "dropdown", options: ["Airport Operator", "Ground Handler (GHA)", "Cargo Terminal Operator", "Custodian", "Airline (self-handling)"], required: true },
      { key: "terminalScope", label: "Terminal Scope", type: "multiselect", options: ["Import", "Export", "Domestic", "International"], required: true },
      { key: "greenOrBrownfield", label: "Greenfield or Brownfield", type: "dropdown", options: ["Greenfield (new build)", "Brownfield (existing ops)"], required: true },
      { key: "annualThroughputMt", label: "Annual Cargo Throughput (MT)", type: "number", sizing: true },
      { key: "terminals", label: "Number of Terminals / Sheds", type: "number", sizing: true },
      { key: "uldTracking", label: "ULD Tracking Required", type: "dropdown", options: ["Yes", "No", "Phase 2"] },
      { key: "customsIntegration", label: "Customs / Community Integration", type: "multiselect", options: ["ICEGATE", "CCS", "Airline EDI", "Custodian system"] },
      { key: "goLiveTarget", label: "Go-Live Target", type: "date" },
    ],
  },
  "WiseHandling": {
    label: "WiseHandling", aliases: ["wisehandling"],
    fields: [
      { key: "entityType", label: "Entity Type", type: "dropdown", options: ["Ground Handler (GHA)", "Airline", "Airport Operator"], required: true },
      { key: "servicesHandled", label: "Services Handled", type: "multiselect", options: ["Ramp", "Passenger (pax)", "Cargo", "Baggage", "Turnaround Mgmt", "Load Control"], required: true },
      { key: "airports", label: "Number of Airports / Stations", type: "number", sizing: true },
      { key: "monthlyFlightMovements", label: "Monthly Flight Movements Handled", type: "number", sizing: true },
      { key: "airlinesServed", label: "Number of Airlines Served", type: "number", sizing: true },
      { key: "tamNeeded", label: "Turnaround Manager (TAM) Needed", type: "dropdown", options: ["Yes", "No", "Phase 2"] },
      { key: "pasNeeded", label: "Passenger Assistance System Needed", type: "dropdown", options: ["Yes", "No", "Phase 2"] },
      { key: "goLiveTarget", label: "Go-Live Target", type: "date" },
    ],
  },
  "WiseCCS": {
    label: "WiseCCS", aliases: ["wiseccs"],
    fields: [
      { key: "entityType", label: "Entity Type", type: "dropdown", options: ["Airport Operator", "Community Operator", "Custodian", "GHA", "Land Port Authority"], required: true },
      { key: "siteType", label: "Site Type", type: "dropdown", options: ["Air cargo", "Land port / ICP", "Sea port", "ICD"], required: true },
      { key: "engagementDriver", label: "Engagement Driver", type: "dropdown", options: ["Tender / RFP", "Direct", "Concession / PPP"], required: true },
      { key: "sites", label: "Number of Sites", type: "number", sizing: true },
      { key: "communitySize", label: "Community Size (members / stakeholders)", type: "number", sizing: true },
      { key: "dailyTransactions", label: "Estimated Daily Transactions", type: "number", sizing: true },
      { key: "stakeholderTypes", label: "Stakeholder Types", type: "multiselect", options: ["Airlines", "Forwarders", "Customs", "GHAs", "Custodians", "Transporters"] },
      { key: "messagingNeeds", label: "Messaging Needs", type: "multiselect", options: ["Type B", "XML", "Customs EDI"] },
    ],
  },
  "WiseGSA": {
    label: "WiseGSA", aliases: ["wisegsa"],
    fields: [
      { key: "entityType", label: "Entity Type", type: "dropdown", options: ["GSA", "GSSA", "Airline cargo sales", "Cargo sales agent"], required: true },
      { key: "airlinesRepresented", label: "Airlines Represented", type: "number", sizing: true },
      { key: "stations", label: "Number of Stations / Offices", type: "number", sizing: true },
      { key: "monthlyTonnageSold", label: "Monthly Tonnage Sold", type: "number", sizing: true },
      { key: "functionsNeeded", label: "Functions Needed", type: "multiselect", options: ["Capacity/Allotment", "Rate Mgmt", "Booking", "Billing / CASS", "Reporting"] },
      { key: "cassRequired", label: "CASS Settlement Required", type: "dropdown", options: ["Yes", "No", "Not known"] },
    ],
  },
  "WiseStox": {
    label: "WiseStox", aliases: ["wisestox", "wisestock"],
    fields: [
      { key: "warehouseBusinessType", label: "Warehouse Business Type", type: "dropdown", options: ["3PL / Logistics", "Distributor", "Manufacturer", "Retailer", "Bonded warehouse"], required: true },
      { key: "warehouses", label: "Number of Warehouses / Sites", type: "number", sizing: true },
      { key: "storageArea", label: "Total Storage Area (sq ft)", type: "number", sizing: true },
      { key: "skus", label: "Number of SKUs", type: "number", sizing: true },
      { key: "monthlyOrderLines", label: "Monthly Order Lines (In + Out)", type: "number", sizing: true },
      { key: "bondedWarehouse", label: "Bonded / Customs Warehouse", type: "dropdown", options: ["Yes", "No"] },
      { key: "capabilitiesNeeded", label: "Capabilities Needed", type: "multiselect", options: ["Inventory", "Putaway/Picking", "Barcode/RFID", "Batch/Expiry", "Billing"] },
      { key: "integrationsRequired", label: "Integrations Required", type: "multiselect", options: ["ERP", "E-commerce", "Transport", "Customs"] },
    ],
  },
  "WiseFleet": {
    label: "WiseFleet", aliases: ["wisefleet"],
    fields: [
      { key: "fleetBusinessType", label: "Fleet Business Type", type: "dropdown", options: ["Transporter", "Fleet owner", "3PL", "Distribution", "Own-fleet enterprise"], required: true },
      { key: "vehicles", label: "Number of Vehicles", type: "number", sizing: true },
      { key: "vehicleTypes", label: "Vehicle Types", type: "multiselect", options: ["Trucks", "Trailers", "LCV", "Containers", "Reefer"] },
      { key: "monthlyTrips", label: "Monthly Trips / Consignments", type: "number", sizing: true },
      { key: "routes", label: "Number of Routes / Lanes", type: "number", sizing: true },
      { key: "capabilitiesNeeded", label: "Capabilities Needed", type: "multiselect", options: ["Route Optimisation", "Trip Mgmt", "Fuel", "Maintenance", "GPS/Telematics", "Freight Billing"] },
      { key: "telematicsInUse", label: "GPS / Telematics in Use", type: "text" },
    ],
  },
  "WiseDo": {
    label: "WiseDo", aliases: ["wisedo", "edeliveryorder"],
    fields: [
      { key: "entityType", label: "Entity Type", type: "dropdown", options: ["Shipping Line", "NVOCC", "Forwarder", "CFS / ICD", "Agent"], required: true },
      { key: "mode", label: "Mode", type: "dropdown", options: ["Ocean", "Air", "Both"], required: true },
      { key: "monthlyDo", label: "Monthly Delivery Orders (DO) Issued", type: "number", sizing: true },
      { key: "portsLocations", label: "Number of Ports / Locations", type: "number", sizing: true },
      { key: "functionsNeeded", label: "Functions Needed", type: "multiselect", options: ["eDO Issuance", "Payment Collection", "Customs Messaging", "Invoice / Charges"] },
      { key: "onlinePayment", label: "Online Payment Integration", type: "dropdown", options: ["Yes", "No", "Phase 2"] },
    ],
  },
  "BagTrack": {
    label: "BagTrack", aliases: ["bagtrack"],
    fields: [
      { key: "entityType", label: "Entity Type", type: "dropdown", options: ["Airport Operator", "Airline", "Ground Handler"], required: true },
      { key: "airports", label: "Number of Airports / Stations", type: "number", sizing: true },
      { key: "annualPax", label: "Annual Passenger Throughput (pax)", type: "number", sizing: true },
      { key: "monthlyBags", label: "Monthly Bags Handled", type: "number", sizing: true },
      { key: "trackingTech", label: "Tracking Technology", type: "dropdown", options: ["RFID", "Barcode", "Both"], required: true },
      { key: "readPoints", label: "Number of Read Points / Scanners", type: "number", sizing: true },
      { key: "reconciliationScope", label: "Reconciliation Scope", type: "multiselect", options: ["Load Reconciliation", "Mishandled Bags", "IATA Res 753 Compliance"] },
    ],
  },
  "WiseHRMS": {
    label: "WiseHRMS", aliases: ["wisehrms", "hrms"],
    fields: [
      { key: "employees", label: "Number of Employees", type: "number", required: true, sizing: true },
      { key: "locations", label: "Number of Locations", type: "number", sizing: true },
      { key: "modulesNeeded", label: "Modules Needed", type: "multiselect", options: ["Payroll", "Attendance", "Leave", "Recruitment", "Performance", "Self-service"], required: true },
      { key: "statutoryCompliance", label: "Statutory Compliance", type: "multiselect", options: ["PF", "ESI", "PT", "TDS", "Gratuity"] },
      { key: "payrollCycle", label: "Payroll Run Cycle", type: "dropdown", options: ["Monthly", "Bi-weekly", "Weekly"] },
    ],
  },
  "CRM Expert": {
    label: "CRM Expert", aliases: ["crmexpert", "crm"],
    fields: [
      { key: "salesSeats", label: "Number of Sales Seats", type: "number", required: true, sizing: true },
      { key: "teamStructure", label: "Team Structure", type: "dropdown", options: ["Single team", "Multi-team", "Multi-branch"], sizing: true },
      { key: "monthlyLeadVolume", label: "Monthly Lead Volume", type: "number", sizing: true },
      { key: "modulesNeeded", label: "Modules Needed", type: "multiselect", options: ["Lead Mgmt", "Pipeline", "Quotation", "Activity", "Reporting", "Marketing"], required: true },
      { key: "integrationsRequired", label: "Integrations Required", type: "multiselect", options: ["Email", "Telephony", "ERP", "Website"] },
    ],
  },
  "VMS": {
    label: "VMS", aliases: ["vms", "visitormanagement"],
    fields: [
      { key: "facilityType", label: "Facility Type", type: "dropdown", options: ["Corporate office", "Industrial / Plant", "Government", "Warehouse", "Airport / Port", "Gated community"], required: true },
      { key: "sitesGates", label: "Number of Sites / Gates", type: "number", sizing: true },
      { key: "dailyVisitors", label: "Average Daily Visitors", type: "number", sizing: true },
      { key: "entryExitPoints", label: "Number of Entry / Exit Points", type: "number", sizing: true },
      { key: "featuresNeeded", label: "Features Needed", type: "multiselect", options: ["Pre-registration", "ID / OCR Capture", "Badge Printing", "Access Control Integration", "Watchlist"], required: true },
      { key: "accessControlInUse", label: "Access Control in Use", type: "text" },
    ],
  },
};

// Normalise a product id/name for matching (lowercase, drop non-alphanumerics).
export const normProductKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Build a normalised lookup map once: normKey/alias → dictionary entry (with its
// canonical key attached). Allows matching whatever id/name the catalog uses.
function buildIndex(dict) {
  const idx = {};
  for (const [key, entry] of Object.entries(dict || {})) {
    idx[normProductKey(key)] = { key, ...entry };
    if (entry.label) idx[normProductKey(entry.label)] = { key, ...entry };
    (entry.aliases || []).forEach(a => { idx[normProductKey(a)] = { key, ...entry }; });
  }
  return idx;
}

/**
 * Given the dictionary and a list of product ids/names the lead selected,
 * return the matching dictionary entries (deduped, in order). PROD_MAP can be
 * passed to also resolve a product id → its display name for matching.
 */
export function fieldsForProducts(dict, productKeys, prodMap = {}) {
  const idx = buildIndex(dict);
  const seen = new Set();
  const out = [];
  for (const p of (productKeys || [])) {
    if (!p) continue;
    const candidates = [p, prodMap?.[p]?.name].filter(Boolean);
    for (const c of candidates) {
      const hit = idx[normProductKey(c)];
      if (hit && !seen.has(hit.key)) { seen.add(hit.key); out.push(hit); break; }
    }
  }
  return out;
}
