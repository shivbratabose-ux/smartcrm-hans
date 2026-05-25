// ═══════════════════════════════════════════════════════════════════
// QUOTE TEMPLATES
// ═══════════════════════════════════════════════════════════════════
// Product-specific marketing content used by printQuote() in Quotations.jsx
// to generate the professional multi-section HTML quotation document
// that mirrors the iCAFFE_Quotation DOCX format.
//
// Structure per product:
//   productName     — full display name with version/trademark
//   subtitle        — subject-line suffix
//   tagline         — acronym expansion / one-liner
//   color           — accent color for headers (matches PROD_MAP)
//   opening         — personalized cover-letter paragraph
//   overview        — description + 3 feature pillars (icon, title, bullets)
//   featureSections — array of {title, features:[{title,body}]}
//   pricingNote     — string shown above pricing table
//   extraNotes      — array of {no, text} for the Notes table
//   implementation  — object with install / training / support details
//   systemReqs      — { server: [[label, value], ...], workstation: [[label,value],...] }
//   paymentMilestones — array of {no, milestone, amount}
//   termsExtra      — additional T&C clauses beyond the standard set
// ═══════════════════════════════════════════════════════════════════

export const STANDARD_TERMS_SECTIONS = [
  {
    id: "ip", title: "7.1 Intellectual Property",
    body: `The proposed solution, including any customisations, will be considered a proprietary product of Hans Infomatic Pvt. Ltd. The client will be granted the right to utilise the software as specified in this proposal. Ownership of the solution, including all intellectual property rights, remains exclusively with Hans Infomatic Pvt. Ltd. The client's right to use the software is non-transferable. Any disputes arising from this proposal shall be subject to the jurisdiction of the Courts of Delhi, India.`,
  },
  {
    id: "data", title: "7.2 Data & Compliance Disclaimer",
    body: `Although every care is taken in data entry for master data (airlines, airports, countries, cities, Indian Customs, etc.), some human error cannot be ruled out. You are advised to cross-check information with authorised published sources before use. Hans Infomatic Pvt. Ltd. shall not be liable for any loss or damage suffered on account of errors in data.`,
  },
  {
    id: "nda", title: "7.3 Non-Disclosure",
    body: `The contents of this document, along with all technical and commercial information, are confidential. Both parties agree this information will not be disclosed to any third party without prior written consent of Hans Infomatic Pvt. Ltd. A separate NDA will be signed to ensure protection of proprietary information.`,
  },
  {
    id: "retention", title: "7.4 Data Retention / Deletion Policy",
    body: `Retention Period: Client data will be retained for the duration of the contract. After termination, additional charges of Rs. 500/- per MB per month apply for retaining DB, Folders & Files data beyond the contract period. Data Deletion: Upon request or after the retention period, data will be handed over in DB and PDF format, after which client data will be securely deleted from our systems.`,
  },
  {
    id: "duration", title: "7.5 Contract Duration",
    body: `Minimum contract duration is 36 months. Early termination may result in a termination fee equivalent to three months of subscription fees.`,
  },
  {
    id: "continuity", title: "7.6 Software Continuity",
    body: `Failure to clear outstanding Software Licence or Annual Licence Renewal fees will result in automatic deactivation of the software. Hans Infomatic Pvt. Ltd. shall not be liable for any direct or consequential business loss arising therefrom.`,
  },
  {
    id: "assumptions", title: "7.7 Assumptions",
    body: `The client has a stable internet connection and compatible devices. The cost does not include hardware or original licensed software required by the client. The client will provide necessary access and information for master data migration. Any third-party services or integrations will be the client's responsibility unless explicitly included. On-site training will be scheduled and confirmed at least four weeks in advance.`,
  },
  {
    id: "taxes", title: "7.8 Government Levies",
    body: `All applicable government taxes, levies, and GST are payable by the client over and above the quoted rates, unless explicitly stated otherwise.`,
  },
  {
    id: "validity", title: "7.9 Validity",
    body: `This quotation is valid for one (1) week from the date of issue. Post validity, pricing may be subject to revision.`,
  },
];

export const STANDARD_PAYMENT_MILESTONES = [
  { no: 1, milestone: "On Purchase Order Acceptance — Setup & onboarding commences on receipt of this payment.", amount: "50% of Order Value" },
  { no: 2, milestone: "Post Go-Live Acceptance — On successful implementation and user acceptance testing (UAT) sign-off.", amount: "50% of Order Value" },
  { no: 3, milestone: "Annual Licence Renewal (ALR) — Payable annually in advance at the beginning of each renewal year. (Not applicable in SaaS model)", amount: "As per ALR Rate" },
];

export const STANDARD_SYSTEM_REQS = {
  server: [
    ["Operating System", "Windows Server 2019 and above (Original Licensed Versions)"],
    ["IIS & .NET Framework", "IIS 10.0 and above & .NET Framework 4.5 or higher with AJAX support"],
    ["Database", "Microsoft SQL Server 2019 and above (Standard or Web Edition)"],
    ["RAM / Processor", "Minimum 64 GB RAM, any Quad-Core Xeon processor"],
    ["IP", "Two Static IPs required with standard open ports"],
    ["Internet Connectivity", "Recommended leased line of 20 Mbps"],
  ],
  workstation: [
    ["Operating System", "Windows 10 / 11 (Original Licensed Versions) or latest macOS"],
    ["Web Browser", "Google Chrome (recommended), Microsoft Edge, or Firefox (latest versions)"],
    ["Network", "Minimum 10 Mbps broadband; 25 Mbps+ LAN using Microsoft Network and TCP/IP recommended for multi-user concurrent access"],
    ["RAM / Processor", "Minimum 8 GB RAM, Intel Core i3 or equivalent (i5/i7 recommended)"],
    ["Display", "1366 × 768 or higher resolution; 64-bit colour"],
    ["Internet Connectivity", "Stable broadband connection; leased line of 5 Mbps+ recommended for office use"],
  ],
};

export const STANDARD_EXTRA_NOTES = [
  { no: 1, text: "Government levies, taxes (including GST), and statutory charges are applicable over and above the quoted rates." },
  { no: 2, text: "Software is offered on a non-exclusive basis. All data is hosted on Client's servers. Standard Terms & Conditions apply. SLA: 98.5% uptime guarantee if hosted on Hans Server." },
  { no: 3, text: "No deductions other than applicable TDS (Tax Deducted at Source) as per the Income Tax Act are permitted on payments." },
  { no: 4, text: "Customisation charges are billed separately at Rs. 16,000/- per Man-Day, based on a mutually agreed Scope of Work. Change Management SOP will be signed with agreed CR (Change Request)." },
  { no: 5, text: "One-Time Server Setup Charges: Rs. 50,000/- — Applicable only if client opts for self-hosted deployment." },
  { no: 6, text: "Per-User Subscription pricing shall remain fixed for 2 (two) years from date of go-live. Thereafter, a revision of up to 10% per annum shall apply, once every two years." },
  { no: 7, text: "One-Time Digital Signature Certificate (DSC) Server Licence Setup Charges: Rs. 2,00,000/- — Applicable only if client opts for self-hosted deployment." },
  { no: 8, text: "Additional Users can be added at any time and will be billed at the per-user rate. Users can be added only in bundles of 5." },
];

// ─────────────────────────────────────────────────────────────────
// PRODUCT TEMPLATES
// ─────────────────────────────────────────────────────────────────

export const QUOTE_TEMPLATES = {

  // ── iCAFFE ──────────────────────────────────────────────────────
  iCAFFE: {
    productName: "iCAFFE® v1.5 (Web-based SaaS)",
    subtitle: "Customs Clearance, Freight Forwarding & Accounts Solution",
    tagline: "Integrated Customs And Freight Forwarding Enterprise",
    color: "#1B4F8A",
    opening: `We thank you for the opportunity to demonstrate our software solutions designed exclusively for the Freight & Cargo industry. Pursuant to our discussions, we are pleased to present this formal quotation for iCAFFE®, our flagship enterprise platform for Customs House Agents (CHAs) and Freight Forwarders. We are confident that iCAFFE® will significantly streamline your operations and ensure full compliance with ICEGATE and CBIC regulations.`,
    overview: {
      description: `iCAFFE® (Integrated Customs And Freight Forwarding Enterprise) is a comprehensive, 100% web-based ERP platform built on Microsoft .NET and SQL Server, purpose-engineered for the logistics and trade-compliance sector in India. Delivered as a SaaS solution hosted on Hans Infomatic's secure servers, it eliminates upfront hardware investment and provides anywhere, anytime access through any modern web browser.`,
      pillars: [
        {
          icon: "⚓", title: "Customs Clearance", bullets: [
            "ICEGATE EDI filing (BE/SB)",
            "eSanchit document annexure",
            "IGCR & Bond management",
            "Duty drawback & MEIS/RoSCTL",
            "AEO compliance support",
            "Shipping Bill auto-generation",
          ],
        },
        {
          icon: "🚢", title: "Freight Forwarding", bullets: [
            "Sea & Air import/export jobs",
            "Ocean container tracking",
            "eAWB transmission to airlines",
            "Air/Sea import consol filing",
            "MBL / HBL management",
            "Cargo tracking & alerts",
          ],
        },
        {
          icon: "📒", title: "Complete Accounts", bullets: [
            "Full double-entry accounting",
            "Multi-currency ledger",
            "GST / e-Invoice integration",
            "Automated debtors & creditors",
            "Bank reconciliation",
            "MIS & financial reporting",
          ],
        },
      ],
    },
    featureSections: [
      {
        title: "2.1 Customs Clearance Module",
        features: [
          { title: "Real-Time ICEGATE EDI Integration", body: "Seamless electronic filing of Bills of Entry (BE) and Shipping Bills (SB) directly to ICEGATE with real-time status tracking and error alerts." },
          { title: "eSanchit & ALR Compliance", body: "Automated document annexure (eSanchit) with bulk upload support; keeps pace with every CBIC notification update." },
          { title: "Duty & Drawback Automation", body: "Auto-calculates customs duty, IGST, and CESS using live tariff rates; tracks duty drawback, DEEC, DEPB, and MEIS/RoSCTL entitlements." },
          { title: "Bond & IGCR Management", body: "Complete lifecycle management of bonds, guarantees, and re-warehousing entries under IGCR." },
          { title: "IEC & CHA Licence Tracking", body: "Centralised repository for all importer/exporter IEC codes and CHA licence data with expiry notifications." },
          { title: "Examination & OOC Tracking", body: "Monitors examination orders, Out-of-Charge (OOC) status, and final clearance milestones in real time." },
          { title: "AI OCR", body: "AI OCR scans any format of client invoice and fetches information to generate BE/SB jobs; multiple line-item jobs can be generated faster and accurately without error." },
        ],
      },
      {
        title: "2.2 Freight Forwarding Module",
        features: [
          { title: "End-to-End Job Management", body: "Unified workspace for Sea LCL/FCL and Air import/export jobs — from quotation to final delivery — with status dashboards." },
          { title: "MBL / HBL & Consol Filing", body: "Supports Air Import Consol (e-filing) and Sea Import Consol filing directly to carriers; manages MBL, HBL, and HAWB documents digitally." },
          { title: "eAWB Transmission", body: "Direct electronic Air Waybill transmission to airlines via IATA-compliant messaging, eliminating paper AWB processes." },
          { title: "Ocean Container Tracking", body: "Live container status from shipping lines; automated alerts for ETA changes, port holds, and demurrage triggers." },
          { title: "Freight Cost Management", body: "Tracks freight payables and receivables, CFS/transport charges, port disbursements, and agent commissions within each job." },
          { title: "Pre-Alerts & Document Dispatch", body: "Auto-generates arrival/departure pre-alerts and dispatches documents to customers via email from within the platform." },
          { title: "Mobile Application", body: "Provides real-time updates and reports on fingertips; users can update completed work stages with photos of cargo / purchase invoice for reference." },
          { title: "Business Insights", body: "Complete Business Insights dashboards for Revenue / Expenses / Profits, Top Clients / Sector / Port / Country, complete Shipment Status — Volume and Tonnage wise — in a single window." },
          { title: "AI Dynamic BI Analytics", body: "With the help of AI, users can get any kind of data with a simple prompt." },
        ],
      },
      {
        title: "2.3 Complete Accounts Module",
        features: [
          { title: "Integrated Double-Entry Accounting", body: "Full GL, accounts payable/receivable, and journal modules tightly integrated with customs and freight jobs — no data re-entry." },
          { title: "Multi-Currency Ledger", body: "Handles USD, EUR, GBP, JPY, and other currencies with configurable exchange-rate management and forex gain/loss reporting." },
          { title: "GST & e-Invoice Compliance", body: "Built-in GST computation for all service invoices with direct e-Invoice generation and IRN upload to GSTN." },
          { title: "Automated Debtors & Creditors", body: "Generates outstanding statements, ageing reports, and payment reminders automatically; tracks TDS and advances." },
          { title: "Bank Reconciliation", body: "Import bank statements and reconcile entries with ledger in a few clicks; supports NEFT/RTGS/IMPS payment workflows." },
          { title: "MIS & Financial Dashboards", body: "Configurable dashboards with P&L, balance sheet, job-wise profitability, and branch-consolidated reports exportable to Excel/PDF." },
          { title: "AI OCR Auto Purchase Booking", body: "With the help of AI OCR, scans any purchase invoice and books provisional cost for approval with multiple charge-line detail." },
        ],
      },
    ],
    pricingNote: "All rates are under a SaaS model. Quarterly billing in advance.",
    implementation: {
      installDays: 15, trainingDays: 10,
      rows: [
        { label: "Installation & Go-Live", value: "15 working days for complete installation, data migration assistance, configuration, and UAT sign-off by our dedicated onboarding team." },
        { label: "User Training", value: "10 days of structured training (2 hours/day) at your premises. Includes hands-on sessions for Customs, Freight, and Accounts users. Training materials provided." },
        { label: "Additional Locations", value: "Travel to additional branches covered at actuals (TA/DA applicable) upon mutual agreement." },
        { label: "Annual Licence Renewal (ALR)", value: "Post-warranty, ALR provides continued helpdesk access, all platform upgrades, and regulatory update patches. Billed annually in advance." },
        { label: "Price Stability", value: "Per-user and ALR pricing will remain fixed for 2 years post-warranty. Thereafter, an increment of up to 10% per annum applies every two years." },
        { label: "Support Hours", value: "Business hours 9:30 AM to 6:30 PM, Monday to Saturday except public holidays." },
      ],
    },
    systemReqs: STANDARD_SYSTEM_REQS,
  },

  // ── WiseHandling ─────────────────────────────────────────────────
  WiseHandling: {
    productName: "WiseHandling® v2.0 (Web-based SaaS)",
    subtitle: "Ground Handling Operations Management System",
    tagline: "End-to-End Ground Handling & Airport Operations Platform",
    color: "#166534",
    opening: `We thank you for the opportunity to present our software solutions designed exclusively for the Aviation Ground Handling industry. Pursuant to our discussions, we are pleased to present this formal quotation for WiseHandling®, our comprehensive ground handling operations platform. We are confident that WiseHandling® will significantly streamline your ramp, passenger, and cargo operations while ensuring full compliance with DGCA and IATA standards.`,
    overview: {
      description: `WiseHandling® is a 100% web-based Ground Handling Operations Management System built on Microsoft .NET and SQL Server, purpose-engineered for Ground Handling Agents (GHAs), Airlines, and Airport Operators in India and globally. Delivered as a SaaS solution, it provides a unified workspace for ramp, passenger, and cargo operations with real-time visibility.`,
      pillars: [
        {
          icon: "✈️", title: "Ramp Operations", bullets: [
            "Flight handling management",
            "Aircraft turnaround control",
            "Load sheet & weight balance",
            "Fuelling & ground services",
            "Equipment dispatch & tracking",
            "Real-time status dashboards",
          ],
        },
        {
          icon: "🧳", title: "Passenger Handling", bullets: [
            "Check-in & boarding management",
            "Baggage handling & tracing",
            "VIP & special services",
            "DCS integration (Departure Control)",
            "Mishandled baggage (WorldTracer)",
            "Passenger assistance logs",
          ],
        },
        {
          icon: "📦", title: "Cargo & Warehouse", bullets: [
            "Import & export cargo handling",
            "ULD management & tracking",
            "Dangerous goods (DG) compliance",
            "Warehouse management (WMS)",
            "Cargo billing & revenue",
            "MIS & performance dashboards",
          ],
        },
      ],
    },
    featureSections: [
      {
        title: "2.1 Ramp Operations Module",
        features: [
          { title: "Flight Handling Management", body: "End-to-end flight handling from arrival to departure with real-time status updates, task assignment, and SLA monitoring for each turnaround activity." },
          { title: "Load Sheet & Weight Balance", body: "Automated load sheet generation with weight and balance calculations compliant with IATA UM 28 and airline-specific requirements." },
          { title: "Ground Support Equipment (GSE) Dispatch", body: "Automated GSE dispatch and tracking with maintenance scheduling, utilisation reports, and fault logging." },
          { title: "Fuelling Management", body: "Integrated fuelling request, delivery confirmation, and reconciliation with airline invoicing." },
          { title: "AODB Integration", body: "Connects with Airport Operational Database (AODB) for live flight schedule synchronisation and slot management." },
        ],
      },
      {
        title: "2.2 Passenger Handling Module",
        features: [
          { title: "Check-In & Boarding", body: "Web-based check-in and boarding management with DCS integration (Amadeus, SITA, airline proprietary systems), including group check-in and irregular operations handling." },
          { title: "Baggage Handling & Tracing", body: "Full baggage handling workflow — acceptance, tagging, loading, offloading — with lost/damaged baggage tracing integrated with IATA WorldTracer." },
          { title: "Special Services Management", body: "VIP lounges, wheelchair assistance, unaccompanied minors, and other special service requests tracked end-to-end." },
          { title: "Passenger Assistance Logs", body: "Complete audit trail of passenger interactions, delays, and special handling for compliance and quality reviews." },
        ],
      },
      {
        title: "2.3 Cargo & Warehouse Module",
        features: [
          { title: "Import & Export Cargo Handling", body: "Full cargo handling from acceptance through delivery with HAWB/MAWB tracking, customs status, and pre-alert management." },
          { title: "ULD Management", body: "Unit Load Device lifecycle tracking — build-up, breakdown, transfer, repair, and aircraft loading — with airline ULD control reconciliation." },
          { title: "DG Compliance", body: "Dangerous Goods acceptance checklist, NOTOC generation, and IATA DGR compliance reports." },
          { title: "Cargo Billing & Revenue", body: "Automated cargo handling charge invoicing with airline tariff management, interline billing, and debtor statements." },
          { title: "MIS & Performance Dashboards", body: "Configurable dashboards for flight completion, SLA compliance, cargo throughput, and revenue analytics exportable to Excel/PDF." },
        ],
      },
    ],
    pricingNote: "All rates are under a SaaS model. Quarterly billing in advance.",
    implementation: {
      rows: [
        { label: "Installation & Go-Live", value: "20 working days for complete installation, AODB/DCS integration, configuration, and UAT sign-off." },
        { label: "User Training", value: "10 days of structured training (2 hours/day) covering Ramp, Passenger, and Cargo modules. Training materials provided." },
        { label: "Additional Locations", value: "Travel to additional stations covered at actuals (TA/DA) upon mutual agreement." },
        { label: "Annual Licence Renewal (ALR)", value: "Provides continued helpdesk access, platform upgrades, and regulatory patches. Billed annually in advance." },
        { label: "Support Hours", value: "Business hours 9:30 AM to 6:30 PM, Monday to Saturday except public holidays. 24×7 support available as optional add-on." },
      ],
    },
    systemReqs: STANDARD_SYSTEM_REQS,
  },

  // ── WiseCargo ────────────────────────────────────────────────────
  WiseCargo: {
    productName: "WiseCargo® v2.0 (Web-based SaaS)",
    subtitle: "Air Cargo Management & Revenue Accounting System",
    tagline: "Comprehensive Air Cargo Operations & Commercial Platform",
    color: "#5B21B6",
    opening: `We thank you for the opportunity to present our software solutions designed exclusively for the Air Cargo industry. Pursuant to our discussions, we are pleased to present this formal quotation for WiseCargo®, our comprehensive air cargo management and revenue accounting platform. We are confident that WiseCargo® will streamline your cargo acceptance, AWB lifecycle, and revenue accounting operations end-to-end.`,
    overview: {
      description: `WiseCargo® is a 100% web-based Air Cargo Management System built on Microsoft .NET and SQL Server, purpose-engineered for Airlines, Cargo Terminal Operators (CTOs), and Freight Stations. It provides a unified workspace from cargo booking through delivery, with integrated revenue accounting and IATA-compliant messaging.`,
      pillars: [
        {
          icon: "📋", title: "Cargo Acceptance", bullets: [
            "Online booking & pre-alerting",
            "AWB issuance & management",
            "DG acceptance & NOTOC",
            "Warehouse receipt & screening",
            "ULD build-up & load planning",
            "Dangerous goods compliance",
          ],
        },
        {
          icon: "✈️", title: "Operations", bullets: [
            "Flight manifest & load sheet",
            "Import consol & breakdown",
            "Delivery order management",
            "Container tracking & alerts",
            "Interline & codeshare billing",
            "Type-B message processing",
          ],
        },
        {
          icon: "💰", title: "Revenue Accounting", bullets: [
            "AWB revenue accounting",
            "Pro-ration & revenue split",
            "Interline billing & settlement",
            "CASS / IATA billing",
            "Agent commission management",
            "MIS & financial dashboards",
          ],
        },
      ],
    },
    featureSections: [
      {
        title: "2.1 Cargo Acceptance & Operations",
        features: [
          { title: "AWB Lifecycle Management", body: "Complete Air Waybill lifecycle from booking and issuance through delivery with real-time status updates and e-AWB capability." },
          { title: "DG Acceptance & NOTOC", body: "IATA DGR-compliant dangerous goods acceptance screening with automated NOTOC generation for flight crew." },
          { title: "ULD Management", body: "Unit Load Device build-up, loading, offloading, and reconciliation with automated airline ULD control reports." },
          { title: "Import Consol & Breakdown", body: "Full house-to-house and house-to-airport consol breakdown with HAWB delivery order generation." },
          { title: "Warehouse Management", body: "Cargo receipt, storage location assignment, retrieval, and delivery with live inventory visibility." },
        ],
      },
      {
        title: "2.2 Revenue Accounting Module",
        features: [
          { title: "AWB Revenue Accounting", body: "Automated AWB charge calculation with airline tariff management (General Rates, Specific Commodity Rates, Class Rates) and revenue posting." },
          { title: "Interline Billing & CASS", body: "Interline prorate calculation, billing, and IATA CASS settlement with statement reconciliation." },
          { title: "Agent Commission Management", body: "GSA and agent commission calculation, statement generation, and payment tracking." },
          { title: "MIS & Financial Reporting", body: "Configurable P&L, revenue-by-route, load-factor, and agent performance dashboards exportable to Excel/PDF." },
        ],
      },
    ],
    pricingNote: "All rates are under a SaaS model. Quarterly billing in advance.",
    implementation: {
      rows: [
        { label: "Installation & Go-Live", value: "20 working days for complete installation, airline tariff upload, and UAT sign-off." },
        { label: "User Training", value: "10 days covering Acceptance, Operations, and Revenue Accounting modules. Training materials provided." },
        { label: "Support Hours", value: "Business hours 9:30 AM to 6:30 PM, Monday to Saturday except public holidays." },
      ],
    },
    systemReqs: STANDARD_SYSTEM_REQS,
  },

  // ── WiseCCS ──────────────────────────────────────────────────────
  WiseCCS: {
    productName: "WiseCCS® v1.5 (Web-based SaaS)",
    subtitle: "Cargo Community System — Airport Data Exchange Hub",
    tagline: "Connecting Airlines, Ground Handlers, Customs & Freight Forwarders",
    color: "#92400E",
    opening: `We thank you for the opportunity to present our software solutions for airport cargo community systems. Pursuant to our discussions, we are pleased to present this formal quotation for WiseCCS®, our Cargo Community System that connects all stakeholders at your airport — airlines, ground handlers, customs, and freight forwarders — through a single data exchange platform.`,
    overview: {
      description: `WiseCCS® is a 100% web-based Cargo Community System built on Microsoft .NET and SQL Server. It acts as a neutral, trusted data exchange hub at the airport, enabling seamless information sharing among all cargo stakeholders, reducing manual intervention, and accelerating cargo release.`,
      pillars: [
        {
          icon: "🔗", title: "Community Integration", bullets: [
            "Airline system connectivity",
            "CHA / forwarder portal",
            "Customs (ICEGATE) integration",
            "Ground handler interfaces",
            "Bank guarantee management",
            "Multi-party messaging hub",
          ],
        },
        {
          icon: "📡", title: "Data Exchange", bullets: [
            "Type-B & XML messaging",
            "e-AWB & Cargo-IMP",
            "Pre-arrival data submission",
            "Customs pre-clearance",
            "Shipment status broadcasts",
            "Document digitisation",
          ],
        },
        {
          icon: "📊", title: "Analytics & Compliance", bullets: [
            "Dwell time analytics",
            "Cargo release dashboards",
            "Customs compliance reports",
            "SLA monitoring & alerts",
            "Community-wide MIS",
            "Regulatory audit trails",
          ],
        },
      ],
    },
    featureSections: [
      {
        title: "2.1 Community Integration Module",
        features: [
          { title: "Multi-Party Connectivity", body: "Connects airlines, ground handlers, CHAs, freight forwarders, and customs authorities through a single neutral platform with role-based access." },
          { title: "ICEGATE Integration", body: "Direct integration with ICEGATE for pre-arrival data submission, IGM filing, and customs out-of-charge notifications." },
          { title: "e-AWB & Cargo-IMP Messaging", body: "Full IATA e-AWB and Cargo-IMP message processing with conversion between formats for all community members." },
        ],
      },
      {
        title: "2.2 Analytics & Reporting",
        features: [
          { title: "Dwell Time Analytics", body: "Real-time and historical dwell time analysis by airline, forwarder, commodity, and route to identify bottlenecks." },
          { title: "SLA Monitoring", body: "Configurable SLA alerts for cargo acceptance, customs release, and ground handling milestones." },
          { title: "Community MIS", body: "Community-wide performance dashboards exportable to Excel/PDF for management reporting." },
        ],
      },
    ],
    pricingNote: "All rates are under a SaaS model. Quarterly billing in advance.",
    implementation: {
      rows: [
        { label: "Installation & Go-Live", value: "25 working days for community onboarding, integration testing with all stakeholders, and UAT sign-off." },
        { label: "User Training", value: "8 days covering community portal, data exchange, and analytics modules for all stakeholder groups." },
        { label: "Support Hours", value: "Business hours 9:30 AM to 6:30 PM, Monday to Saturday except public holidays." },
      ],
    },
    systemReqs: STANDARD_SYSTEM_REQS,
  },

  // ── WiseDox ──────────────────────────────────────────────────────
  WiseDox: {
    productName: "WiseDox® v1.0 (Web-based SaaS)",
    subtitle: "Document & Compliance Management System",
    tagline: "Intelligent Document Digitisation & Workflow Automation for Logistics",
    color: "#0F766E",
    opening: `We thank you for the opportunity to present our software solutions for document management and compliance. Pursuant to our discussions, we are pleased to present this formal quotation for WiseDox®, our intelligent document digitisation and compliance management platform designed for logistics, customs, and freight companies.`,
    overview: {
      description: `WiseDox® is a 100% web-based Document & Compliance Management System built on Microsoft .NET and SQL Server. It digitises, organises, and automates document workflows across your logistics and customs operations, reducing paper dependency and ensuring audit-ready compliance.`,
      pillars: [
        {
          icon: "📄", title: "Document Management", bullets: [
            "AI OCR document extraction",
            "Centralised document repository",
            "Version control & audit trail",
            "Bulk document upload",
            "eSanchit integration",
            "Cross-linked document search",
          ],
        },
        {
          icon: "✅", title: "Compliance", bullets: [
            "Regulatory document tracking",
            "Licence & certificate management",
            "Expiry alerts & notifications",
            "CBIC circular updates",
            "AEO documentation support",
            "Compliance dashboards",
          ],
        },
        {
          icon: "⚙️", title: "Workflow Automation", bullets: [
            "Approval workflow engine",
            "Digital signature integration",
            "Automated email dispatch",
            "Task assignment & tracking",
            "SLA-based escalation",
            "Cross-department collaboration",
          ],
        },
      ],
    },
    featureSections: [
      {
        title: "2.1 Document Management Module",
        features: [
          { title: "AI OCR Document Extraction", body: "AI-powered OCR extracts data from any document format (PDF, image, scanned) and auto-populates CRM/ERP fields, eliminating manual keying." },
          { title: "Centralised Repository", body: "Single source of truth for all documents — customs, freight, accounts, contracts — with role-based access and search." },
          { title: "Version Control & Audit Trail", body: "Complete version history with user, timestamp, and change log for every document — fully audit-ready." },
        ],
      },
      {
        title: "2.2 Compliance & Workflow Module",
        features: [
          { title: "Licence & Certificate Management", body: "Centralised repository for IEC, CHA licence, IATA certifications, and other trade documents with expiry alerts." },
          { title: "Approval Workflow Engine", body: "Configurable multi-level approval workflows for purchase invoices, credit notes, and compliance documents." },
          { title: "Digital Signature Integration", body: "Integrated DSC-based digital signing for customs and compliance documents." },
        ],
      },
    ],
    pricingNote: "All rates are under a SaaS model. Quarterly billing in advance.",
    implementation: {
      rows: [
        { label: "Installation & Go-Live", value: "10 working days for complete installation, OCR configuration, and UAT sign-off." },
        { label: "User Training", value: "5 days covering document management, compliance tracking, and workflow automation." },
        { label: "Support Hours", value: "Business hours 9:30 AM to 6:30 PM, Monday to Saturday except public holidays." },
      ],
    },
    systemReqs: STANDARD_SYSTEM_REQS,
  },

  // ── WiseTrax ─────────────────────────────────────────────────────
  WiseTrax: {
    productName: "WiseTrax® v1.5 (Web-based SaaS)",
    subtitle: "Air Cargo Type-B Messaging Hub",
    tagline: "IATA Type-B & XML Message Processing, Conversion & Monitoring Platform",
    color: "#991B1B",
    opening: `We thank you for the opportunity to present our software solutions for air cargo messaging. Pursuant to our discussions, we are pleased to present this formal quotation for WiseTrax®, our IATA Type-B messaging hub designed for airlines, ground handlers, and freight stations that require reliable, high-throughput cargo message processing and format conversion.`,
    overview: {
      description: `WiseTrax® is a 100% web-based Air Cargo Type-B Messaging Hub built on Microsoft .NET and SQL Server. It receives, processes, converts, and dispatches IATA Type-B, XML, and JSON cargo messages with full monitoring, alerting, and audit trail — replacing legacy SITA/AFTN messaging infrastructure.`,
      pillars: [
        {
          icon: "📡", title: "Message Processing", bullets: [
            "IATA Type-B message parsing",
            "High-throughput processing",
            "Message queuing & routing",
            "Duplicate detection",
            "Error handling & alerts",
            "Full message archive",
          ],
        },
        {
          icon: "🔄", title: "Format Conversion", bullets: [
            "Type-B ↔ XML conversion",
            "Cargo-IMP to JSON",
            "Custom format mapping",
            "e-AWB IATA ONE Record",
            "FTP / SFTP / API delivery",
            "Real-time transformation",
          ],
        },
        {
          icon: "📊", title: "Monitoring & Analytics", bullets: [
            "Real-time message dashboard",
            "SLA breach alerts",
            "Message throughput analytics",
            "Partner connectivity status",
            "Audit trail & compliance",
            "Performance reports",
          ],
        },
      ],
    },
    featureSections: [
      {
        title: "2.1 Message Processing Module",
        features: [
          { title: "IATA Type-B Message Processing", body: "High-throughput parsing and routing of all IATA Cargo-IMP message types (FFM, FWB, FHL, AWR, FSU, etc.) with sub-second processing latency." },
          { title: "Message Queuing & Routing", body: "Intelligent routing rules engine with priority queuing, partner-specific routing, and guaranteed delivery with retry logic." },
          { title: "Error Handling & Alerting", body: "Real-time error detection with configurable alerts (email/SMS) for malformed messages, routing failures, and SLA breaches." },
        ],
      },
      {
        title: "2.2 Format Conversion & Integration",
        features: [
          { title: "Type-B / XML / JSON Conversion", body: "Bi-directional conversion between IATA Type-B (Cargo-IMP), XML, and JSON formats with custom field mapping for proprietary systems." },
          { title: "Multi-Protocol Delivery", body: "Message delivery via FTP, SFTP, SMTP, REST API, and SITA/AFTN with configurable retry and acknowledgement." },
          { title: "IATA ONE Record Support", body: "Ready for IATA ONE Record JSON-LD standard for next-generation air cargo data sharing." },
        ],
      },
    ],
    pricingNote: "All rates are under a SaaS model. Monthly billing in advance.",
    implementation: {
      rows: [
        { label: "Installation & Go-Live", value: "10 working days for hub setup, partner connectivity testing, and UAT sign-off." },
        { label: "User Training", value: "3 days covering message monitoring dashboard, routing configuration, and alert management." },
        { label: "Support Hours", value: "Business hours 9:30 AM to 6:30 PM, Monday to Saturday. 24×7 monitoring available as optional add-on." },
      ],
    },
    systemReqs: STANDARD_SYSTEM_REQS,
  },
};

// Fallback for unknown products — uses a generic structure
export const GENERIC_TEMPLATE = {
  productName: "Hans Infomatic Software Solution",
  subtitle: "Enterprise Software Quotation",
  tagline: "Technology Solutions for India's Logistics & Customs Industry",
  color: "#1B4F8A",
  opening: `We thank you for the opportunity to present our software solutions. Pursuant to our discussions, we are pleased to present this formal quotation. We are confident that our platform will significantly streamline your operations.`,
  overview: {
    description: `Hans Infomatic provides enterprise-grade, 100% web-based software solutions built on Microsoft .NET and SQL Server, purpose-engineered for the logistics and trade-compliance sector. Delivered as a SaaS solution, our platform eliminates upfront hardware investment and provides anywhere, anytime access.`,
    pillars: [],
  },
  featureSections: [],
  pricingNote: "All rates are under a SaaS model. Quarterly billing in advance.",
  implementation: {
    rows: [
      { label: "Installation & Go-Live", value: "As per agreed project plan." },
      { label: "User Training", value: "Training schedule to be mutually agreed." },
      { label: "Support Hours", value: "Business hours 9:30 AM to 6:30 PM, Monday to Saturday except public holidays." },
    ],
  },
  systemReqs: STANDARD_SYSTEM_REQS,
};

export function getQuoteTemplate(productId) {
  return QUOTE_TEMPLATES[productId] || { ...GENERIC_TEMPLATE, productName: productId };
}
