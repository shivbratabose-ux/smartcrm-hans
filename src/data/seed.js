import {
  ACT_TYPES, ACT_STATUS, CUST_TYPES, COUNTRIES, REGIONS, PRIORITIES,
  STAGES, STAGE_PROB, STAGE_COL, TICKET_TYPES, TICKET_STATUSES, CALL_TYPES, CALL_OBJECTIVES,
  CALL_OUTCOMES, VERTICALS, LEAD_SOURCES, LEAD_TEMPERATURES, BUSINESS_TYPES,
  STAFF_SIZES, CURRENT_SOFTWARE, PAIN_POINTS, BUDGET_RANGES, DECISION_MAKERS,
  DECISION_TIMELINES, OPP_PHASES, OPP_STAGES, FORECAST_CATS, OPP_SIZES,
  OPP_SOURCES, OPP_CONTACT_ROLES, LEAD_CONTACT_ROLES, LEAD_STAGES,
  BILL_TERMS, BILL_TYPES, WIN_REASONS, LOSS_REASONS, SUSPEND_REASONS,
  CONTACT_ROLES, CONTACT_DISPOSITIONS, CONTACT_DEPARTMENTS, CUSTOMER_TYPES,
  ESCALATION_LEVELS, AGEING_BUCKETS, COLLECTION_STATUSES, PAYMENT_MODES,
  CONTRACT_STATUSES, APPROVAL_CHAIN, CONTRACT_DOC_TYPES, QUOTE_STATUSES,
  TAX_TYPES, QUOTE_VALIDITY, COMM_TYPES, COMM_STATUSES, EVENT_TYPES,
  EVENT_STATUSES, HIERARCHY_LEVELS, UPDATE_CATEGORIES,
  SW_AGE, EVALUATION_STATUS, NEXT_STEPS, UPDATE_ATTACHMENT_TYPES,
  FILE_TYPES, STANDARD_TERMS, SLA_HOURS, UPLOAD_TYPES
} from './constants.js';

// Helper: convert a plain string list into master-item objects with ids
const mk = (prefix, arr) => (arr||[]).map((t,i)=>({id:`${prefix}${i+1}`,name:typeof t==="string"?t:t.name,...(typeof t==="object"?t:{})}));

// ═══════════════════════════════════════════════════════════════════
// SEED DATA — All transactional data cleared for production use.
// Only structural/config data (product catalog, org hierarchy,
// teams, masters) and blank form templates are retained.
// ═══════════════════════════════════════════════════════════════════
export const INIT_ACCOUNTS = [];
export const INIT_CONTACTS = [];
export const INIT_OPPS = [];
export const INIT_ACTIVITIES = [];
export const INIT_TICKETS = [];
export const INIT_NOTES = [];
export const INIT_FILES = [];

// ── Product Catalog with Sub-Products / Modules (structural — keep) ──
export const INIT_PRODUCT_CATALOG = [
  { id:"iCAFFE",       name:"iCAFFE",       color:"#2563EB", bg:"#EFF6FF", desc:"e-Sanchit / EDI / CHA Platform",
    modules:[
      {id:"m_ic1",name:"eSanchit Filing",   type:"Core",        desc:"ICEGATE eSanchit gateway for BE/TP filing"},
      {id:"m_ic2",name:"OCR Engine",        type:"Add-on",      desc:"AI-based document OCR extraction for invoices"},
      {id:"m_ic3",name:"Bulk Upload",       type:"Core",        desc:"Batch BE / transport permit bulk submission"},
      {id:"m_ic4",name:"Mobile App",        type:"Add-on",      desc:"Field agent mobile companion app (iOS & Android)"},
      {id:"m_ic5",name:"Ocean Tracking",    type:"Add-on",      desc:"Sea cargo real-time status and container tracking"},
      {id:"m_ic6",name:"EDI Integration",   type:"Integration", desc:"ICES 1.5 EDI direct connectivity"},
      {id:"m_ic7",name:"CHA Portal",        type:"Core",        desc:"Customs House Agent client-facing portal"},
    ]},
  { id:"WiseHandling", name:"WiseHandling", color:"#16A34A", bg:"#F0FDF4", desc:"Ground Handling Ops Management",
    modules:[
      {id:"m_wh1",name:"Flight Movement",   type:"Core",        desc:"AODB integration, flight schedule management"},
      {id:"m_wh2",name:"Passenger Ops",     type:"Core",        desc:"Check-in, boarding, PRM, IROP handling"},
      {id:"m_wh3",name:"Ramp & GSE",        type:"Core",        desc:"Ground support equipment scheduling and tracking"},
      {id:"m_wh4",name:"Staff Roster",      type:"Add-on",      desc:"Shift planning, duty rosters, attendance"},
      {id:"m_wh5",name:"Airline Billing",   type:"Core",        desc:"SGHA Annex B SLA tracking and billing"},
      {id:"m_wh6",name:"ACSA Integration",  type:"Integration", desc:"ACSA AODB and ISAGO compliance layer"},
      {id:"m_wh7",name:"Mobile Ramp App",   type:"Add-on",      desc:"Ramp agent mobile for real-time updates"},
    ]},
  { id:"WiseCargo",    name:"WiseCargo",    color:"#7C3AED", bg:"#F5F3FF", desc:"Air Cargo Management System",
    modules:[
      {id:"m_wc1",name:"AWB Management",    type:"Core",        desc:"Airway bill creation, amendment, tracking"},
      {id:"m_wc2",name:"DG Handling",       type:"Add-on",      desc:"Dangerous goods declaration and NOTOC"},
      {id:"m_wc3",name:"Cargo Terminal Ops",type:"Core",        desc:"Acceptance, build-up, breakdown workflows"},
      {id:"m_wc4",name:"Revenue Management",type:"Add-on",      desc:"Yield management and dynamic pricing"},
      {id:"m_wc5",name:"Claims Module",     type:"Add-on",      desc:"Cargo claims processing and settlement"},
      {id:"m_wc6",name:"Analytics Dashboard",type:"Analytics",  desc:"Cargo volume, revenue, and SLA dashboards"},
    ]},
  { id:"WiseCCS",      name:"WiseCCS",      color:"#D97706", bg:"#FFFBEB", desc:"Cargo Community System",
    modules:[
      {id:"m_cs1",name:"Community Hub",     type:"Core",        desc:"Multi-party cargo data exchange platform"},
      {id:"m_cs2",name:"Manifest Reconciliation",type:"Core",   desc:"Daily carrier vs CCS manifest reconciliation"},
      {id:"m_cs3",name:"Customs Interface", type:"Integration", desc:"Customs EDI submission and status tracking"},
      {id:"m_cs4",name:"Shipper Portal",    type:"Add-on",      desc:"Self-service shipper booking and tracking portal"},
    ]},
  { id:"WiseDox",      name:"WiseDox",      color:"#0D9488", bg:"#F0FDFA", desc:"Document & Compliance Management",
    modules:[
      {id:"m_wd1",name:"e-AWB Signing",     type:"Core",        desc:"Digital e-AWB with DocuSign integration"},
      {id:"m_wd2",name:"Doc Repository",    type:"Core",        desc:"Centralised document storage with versioning"},
      {id:"m_wd3",name:"Compliance Checks", type:"Core",        desc:"Automated regulatory compliance validation"},
      {id:"m_wd4",name:"Audit Trail",       type:"Add-on",      desc:"Full activity log for regulatory audits"},
    ]},
  { id:"WiseTrax",     name:"WiseTrax",     color:"#DC2626", bg:"#FEF2F2", desc:"Air Cargo Type-B Messaging Hub",
    modules:[
      {id:"m_wt1",name:"Type-B Gateway",    type:"Core",        desc:"SITA / ARINC Type-B message processing"},
      {id:"m_wt2",name:"IATA Messaging",    type:"Core",        desc:"FSU, FFM, FWB, AWR message handling"},
      {id:"m_wt3",name:"Routing Engine",    type:"Core",        desc:"Admin-configurable message routing rules"},
      {id:"m_wt4",name:"Monitoring Console",type:"Add-on",      desc:"Real-time message queue monitoring"},
      {id:"m_wt5",name:"API Connector",     type:"Integration", desc:"REST API bridge for modern system integration"},
    ]},
];

// ── Org Hierarchy: Market -> Company -> Division -> Country -> Branch -> Department (structural — keep) ──
export const INIT_ORG = {
  markets:[
    {id:"mk1",name:"South Asia",   region:"Asia",        head:"", notes:"India domestic + SAARC"},
    {id:"mk2",name:"Africa",       region:"Africa",      head:"", notes:"East & Southern Africa + North Africa"},
    {id:"mk3",name:"Middle East",  region:"MEA",         head:"", notes:"UAE, Qatar, Saudi Arabia"},
    {id:"mk4",name:"Rest of World",region:"Global",      head:"", notes:"Europe, Americas, Southeast Asia"},
  ],
  companies:[
    {id:"co1",name:"Hans Infomatic Pvt. Ltd.",marketId:"mk1",type:"Internal HQ",country:"India",   regNo:"U72900MH2018PTC308XXX"},
    {id:"co2",name:"MPC Marketing (Pty) Ltd.", marketId:"mk2",type:"Partner",    country:"South Africa",regNo:"MPC-ZA-2024"},
    {id:"co3",name:"Hans Infomatic DMCC",      marketId:"mk3",type:"Subsidiary", country:"UAE",    regNo:"DMCC-HANS-2025"},
  ],
  divisions:[
    {id:"dv1",name:"Aviation Products",  companyId:"co1",head:"",products:["WiseHandling","WiseCargo","WiseCCS","WiseTrax"]},
    {id:"dv2",name:"CHA & Logistics",    companyId:"co1",head:"",products:["iCAFFE","WiseDox"]},
    {id:"dv3",name:"Africa Business",    companyId:"co1",head:"",products:["WiseHandling","WiseCargo"]},
    {id:"dv4",name:"MPC Reseller Ops",   companyId:"co2",head:"",products:["WiseHandling"]},
    {id:"dv5",name:"Middle East Ops",    companyId:"co3",head:"",products:["WiseTrax","WiseCargo"]},
  ],
  branches:[
    {id:"br1",name:"Mumbai HQ",        divisionId:"dv1",city:"Mumbai",      country:"India",       type:"HQ",     address:"Andheri East, Mumbai 400069"},
    {id:"br2",name:"Delhi NCR Office", divisionId:"dv2",city:"New Delhi",   country:"India",       type:"Office", address:"Connaught Place, New Delhi 110001"},
    {id:"br3",name:"Cape Town Desk",   divisionId:"dv3",city:"Cape Town",   country:"South Africa",type:"Remote", address:"c/o MPC, 5 Sugarbird Lane, Tokai 7495"},
    {id:"br4",name:"Bangalore Office", divisionId:"dv2",city:"Bengaluru",   country:"India",       type:"Office", address:"Whitefield, Bengaluru 560066"},
    {id:"br5",name:"Dubai DMCC Office",divisionId:"dv5",city:"Dubai",       country:"UAE",         type:"Office", address:"DMCC Free Zone, Dubai"},
    {id:"br6",name:"Kolkata Office",   divisionId:"dv2",city:"Kolkata",     country:"India",       type:"Office", address:"Salt Lake, Kolkata 700091"},
  ],
  departments:[
    {id:"dep1",name:"Business Development", branchId:"br1",head:"",headcount:4},
    {id:"dep2",name:"Technology & Products",branchId:"br1",head:"",headcount:3},
    {id:"dep3",name:"Customer Support",     branchId:"br1",head:"",headcount:2},
    {id:"dep4",name:"Africa Sales",         branchId:"br3",head:"",headcount:1},
    {id:"dep5",name:"CHA Sales – North",    branchId:"br2",head:"",headcount:2},
    {id:"dep6",name:"CHA Sales – East",     branchId:"br6",head:"",headcount:1},
    {id:"dep7",name:"MEA Business",         branchId:"br5",head:"",headcount:1},
  ],
};

// Teams cleared for production — created by admin in the app
export const INIT_TEAMS = [];

// Masters – editable reference data (structural — keep)
// Grouped into Sales / Customer / Contact / Activity / Support / Finance / Org
// for a compact, tabbed Masters UI.
export const INIT_MASTERS = {
  // ── Sales ─────────────────────────────────────────────
  verticals:        mk("vert", VERTICALS),
  leadSources:      mk("lsrc", LEAD_SOURCES),
  leadTemperatures: mk("ltmp", LEAD_TEMPERATURES),
  leadStages:       (LEAD_STAGES||[]).map(s=>({id:`lst_${s.id}`, name:s.name, stage:s.stage, color:s.color})),
  oppPhases:        mk("oph", OPP_PHASES),
  oppStages:        (OPP_STAGES||[]).map(s=>({id:`ost_${s.id}`, name:s.name, phase:s.phase, probability:s.probability, color:s.color})),
  oppSources:       mk("osrc", OPP_SOURCES),
  oppSizes:         mk("osz", OPP_SIZES),
  forecastCats:     mk("fct", FORECAST_CATS),
  oppContactRoles:  mk("ocr", OPP_CONTACT_ROLES),
  leadContactRoles: mk("lcr", LEAD_CONTACT_ROLES),
  winReasons:       mk("wr", WIN_REASONS),
  lossReasons:      mk("lr", LOSS_REASONS),
  suspendReasons:   mk("sr", SUSPEND_REASONS),
  // Pipeline stages — editable via Masters → Sales → Pipeline Stages.
  // `kind` is the semantic role of the stage so downstream forecast / win-rate
  // logic can identify the closing stages even after a rename. Two kinds are
  // reserved as system stages: "won" and "lost". They can't be deleted (UI
  // prevents it) but can be renamed (e.g. "Won" → "Closed Won").
  stages: STAGES.map(s => ({
    id: `st${s}`,
    name: s,
    probability: STAGE_PROB[s] || 0,
    color: STAGE_COL[s] || "#94A3B8",
    kind: s === "Won" ? "won" : s === "Lost" ? "lost" : "open",
  })),
  evaluationStatus: mk("evs2", EVALUATION_STATUS),
  nextSteps:        mk("ns", NEXT_STEPS),

  // ── Customer / Account ────────────────────────────────
  customerTypes:    mk("ct", CUST_TYPES),
  customerLifecycle:mk("clc", CUSTOMER_TYPES),
  businessTypes:    mk("bt", BUSINESS_TYPES),
  staffSizes:       mk("ss", STAFF_SIZES),
  currentSoftware:  mk("csw", CURRENT_SOFTWARE),
  painPoints:       mk("pp", PAIN_POINTS),
  budgetRanges:     mk("br", BUDGET_RANGES),
  decisionMakers:   mk("dm", DECISION_MAKERS),
  decisionTimelines:mk("dtl", DECISION_TIMELINES),
  hierarchyLevels:  mk("hl", HIERARCHY_LEVELS),
  countries:        COUNTRIES.map((c,i)=>({id:`co${i+1}`,name:c,region:REGIONS[i%REGIONS.length]})),
  regions:          mk("rg", REGIONS),
  swAge:            mk("swa", SW_AGE),

  // ── Contact ───────────────────────────────────────────
  contactRoles:       mk("cr", CONTACT_ROLES),
  contactDispositions:mk("cd", CONTACT_DISPOSITIONS),
  contactDepartments: mk("cdep", CONTACT_DEPARTMENTS),

  // ── Activity / Calendar / Communication ──────────────
  activityTypes:    mk("at", ACT_TYPES),
  activityStatuses: mk("ast", ACT_STATUS),
  callTypes:        mk("clt", CALL_TYPES),
  callSubjects:     mk("cls", CALL_OBJECTIVES),
  callOutcomes:     mk("clo", CALL_OUTCOMES),
  eventTypes:       mk("evt", EVENT_TYPES),
  eventStatuses:    mk("evs", EVENT_STATUSES),
  commTypes:        mk("cm", COMM_TYPES),
  commStatuses:     mk("cms", COMM_STATUSES),
  updateCategories: mk("uc", UPDATE_CATEGORIES),
  updateAttachmentTypes: mk("uat", UPDATE_ATTACHMENT_TYPES),
  fileTypes:        mk("ft", FILE_TYPES),

  // ── Support ───────────────────────────────────────────
  ticketTypes:      mk("tt", TICKET_TYPES),
  ticketStatuses:   mk("ts", TICKET_STATUSES),
  priorities:       mk("pr", PRIORITIES),
  escalationLevels: mk("el", ESCALATION_LEVELS),
  // SLA hours are paired with priority names; "hours" is the resolution target
  slaHours:         Object.entries(SLA_HOURS).map(([name,hours],i)=>({id:`sla${i+1}`,name,hours})),

  // ── Finance / Contracts / Quotes ─────────────────────
  billTerms:        mk("blt", BILL_TERMS),
  billTypes:        mk("btp", BILL_TYPES),
  paymentModes:     mk("pm", PAYMENT_MODES),
  collectionStatuses:mk("cs", COLLECTION_STATUSES),
  ageingBuckets:    mk("ab", AGEING_BUCKETS),
  taxTypes:         mk("tx", TAX_TYPES),
  contractStatuses: mk("cst", CONTRACT_STATUSES),
  contractDocTypes: mk("cdt", CONTRACT_DOC_TYPES),
  approvalChain:    mk("ac", APPROVAL_CHAIN),
  quoteStatuses:    mk("qs", QUOTE_STATUSES),
  quoteValidity:    mk("qv", QUOTE_VALIDITY),
  standardTerms:    mk("stt", STANDARD_TERMS),

  // ── System / Bulk Upload ─────────────────────────────
  uploadTypes:      mk("upt", UPLOAD_TYPES),
};

// ── Blank form templates ──
export const BLANK_ACC={name:"",type:"Airline",country:"India",city:"",website:"",segment:"Enterprise",status:"Prospect",products:[],productSelection:[],owner:"u1",arrRevenue:0,potential:0,parentId:"",hierarchyLevel:"Parent Company",hierarchyPath:"",address:"",accountNo:"",state:"",pincode:"",legalName:"",pan:"",gstin:"",cin:"",taxTreatment:"Domestic",tdsApplicable:"No",poMandatory:"No",billingAddress:"",billingCity:"",billingState:"",billingPincode:"",billingCountry:"",primaryContact:"",primaryEmail:"",primaryPhone:"",billingContactName:"",billingContactEmail:"",financeContactEmail:"",paymentTerms:"Net 30",creditDays:30,currency:"INR",billingFrequency:"Annual",entityType:"Head Office",groupCode:"",territory:"",addresses:[]};
export const BLANK_ADDRESS={id:"",label:"Head Office",line1:"",city:"",state:"",country:"India",pincode:"",isPrimary:true,isBilling:true};
export const BLANK_CON={name:"",role:"",email:"",phone:"",accountId:"",addressId:"",primary:false,contactId:"",designation:"",department:"",departments:[],products:[],branches:[],countries:[],linkedOpps:[],city:"",state:"",country:"",pincode:"",alternateEmail:"",alternatePhone:"",linkedInUrl:"",decisionLevel:"",influence:"Medium",category:"",preferredContactMode:"Email",doNotContact:"No",lastContactDate:"",source:""};
export const BLANK_OPP={oppNo:"",title:"",accountId:"",products:[],productSelection:[],stage:"Prospect",value:0,probability:10,owner:"u1",closeDate:"",country:"India",notes:"",source:"New Lead",primaryContactId:"",secondaryContactIds:[],hierarchyLevel:"Parent Company",leadId:"",contactRoles:[],sourceLeadIds:[],lob:"",dealSize:"Medium",forecastCat:"Pipeline",currency:"INR",competitors:"",lossReason:"",lossReasonSecondary:"",lostToCompetitor:"",lossImpactAreas:[],lossMgmtFeedback:"",lossImprovementNotes:"",lossClosedAt:"",upsellFlag:false,crossSellNotes:"",nextStep:"",decisionDate:"",budget:"",territory:"",campaignSource:"",createdDate:""};
export const BLANK_ACT={title:"",type:"Call",status:"Planned",date:"",time:"",duration:30,accountId:"",contactId:"",oppId:"",owner:"u1",notes:"",outcome:"",files:[]};
export const BLANK_TKT={ticketNo:"",title:"",accountId:"",product:"iCAFFE",productSelection:[],type:"Bug / Glitch",priority:"Medium",status:"Open",assigned:"u7",description:"",sla:"",escalation:"L1 – Support Engineer",resolution:"",csat:0,category:"Technical",subCategory:"",reportedBy:"",reportedDate:"",resolvedDate:"",affectedModule:"",severity:"Medium",environment:"Production",workaround:"No",internalNotes:"",revisitDate:"",tags:""};
export const BLANK_LEAD={company:"",contact:"",email:"",phone:"",product:"iCAFFE",productSelection:[],vertical:"CHA",region:"South Asia",source:"Inside Sales",stage:"MQL",assignedTo:"u1",notes:"",nextCall:"",score:50,createdDate:"",leadId:"",accountId:"",temperature:"Warm",designation:"",noOfUsers:0,businessType:"Customs Broker",staffSize:"",branches:0,monthlyVolume:{airExp:"",airImp:"",seaTEU:"",customsEntries:""},currentSoftware:"",swAge:"",swSatisfaction:0,painPoints:[],budgetRange:"",decisionMaker:"",decisionTimeline:"",evaluatingOthers:"",nextStep:"",objections:"",contactIds:[],contactRoles:{},additionalProducts:[],estimatedValue:0,stageHistory:[],convertedOppIds:[],branch:"",location:"",department:"",addresses:[],salesTeam:[],country:"",state:"",city:"",companyWebsite:"",alternatePhone:"",alternateEmail:"",linkedInUrl:"",annualRevenue:0,campaignName:"",referredBy:"",expectedCloseDate:"",proposalSent:"No",demoScheduled:"No",competitorName:"",lastContactDate:""};
export const BLANK_CALL_REPORT={leadName:"",company:"",marketingPerson:"u1",leadStage:"MQL",callType:"Telephone Call",product:"iCAFFE",productSelection:[],callDate:"",notes:"",nextCallDate:"",objective:"General Followup",outcome:"Completed",contactId:"",accountId:"",oppId:"",duration:15};
export const BLANK_CONTRACT={contractNo:"",title:"",accountId:"",oppId:"",product:"iCAFFE",productSelection:[],status:"Draft",startDate:"",endDate:"",value:0,billTerm:"Yearly",billType:"Renewals",approvalStage:"",terms:"",docType:"Contract",owner:"u1",poNumber:"",renewalDate:"",renewalType:"Manual",paymentTerms:"Net 30",currency:"INR",billingFrequency:"Annual",invoiceGenBasis:"Advance",griApplicable:"No",griPercentage:0,noOfUsers:0,noOfBranches:0,serviceStartDate:"",commercialModel:"Annual SaaS",autoRenewal:"No",warrantyMonths:0,goLiveDate:"",territory:"",signedDocUrl:"",eulaUrl:"",onboardingNotes:"",renewalNotifiedAt:""};
export const BLANK_COLLECTION={invoiceNo:"",accountId:"",contractId:"",invoiceDate:"",dueDate:"",billedAmount:0,collectedAmount:0,pendingAmount:0,status:"Current",paymentMode:"NEFT",paymentDate:"",remarks:"",owner:"u1",invoiceType:"Tax Invoice",product:"",currency:"INR",gstAmount:0,tdsAmount:0,netPayable:0,billPeriodFrom:"",billPeriodTo:"",agingBucket:"",followUpDate:"",chequeRef:"",approvedBy:""};
export const BLANK_TARGET={userId:"u1",period:"",product:"All",targetValue:0,achievedValue:0,targetDeals:0,achievedDeals:0,targetCalls:0,achievedCalls:0};

export const INIT_LEADS = [];
export const INIT_CALL_REPORTS = [];
export const INIT_CONTRACTS = [];
export const INIT_COLLECTIONS = [];
export const INIT_TARGETS = [];

export const BLANK_QUOTE={title:"",accountId:"",oppId:"",contactId:"",product:"iCAFFE",productSelection:[],items:[],subtotal:0,taxType:"GST 18%",taxAmount:0,discount:0,total:0,status:"Draft",validity:"30 Days",version:1,isFinal:false,quoteFileUrl:"",approvalNotes:"",supersedesQuoteId:"",contractId:"",terms:"",owner:"u1",notes:"",createdDate:"",sentDate:"",expiryDate:"",approvalStatus:"Not Required",approvalRequestedAt:"",approvedBy:"",approvedAt:"",rejectedReason:"",acceptedDate:"",signedQuoteUrl:"",emailLog:[],lastReminderAt:"",changeLog:[],attachments:[],
  // ── Customer billing snapshot (taken at quote creation; editable on quote) ──
  currency:"INR",exchangeRate:1,legalName:"",billingAddressSnapshot:"",shippingAddressSnapshot:"",gstin:"",pan:"",taxTreatment:"",poMandatory:"",poNumber:"",paymentTerms:"",creditDays:0,billingContactName:"",billingContactEmail:"",financeContactEmail:"",
  // ── Place of Supply (drives intra-state CGST+SGST vs inter-state IGST split per line) ──
  // Empty = "use customer billing state" at line-recompute time. Setting it
  // explicitly here lets the rep override (e.g. ship-to differs from bill-to).
  placeOfSupply:"",
  // ── Sales / deal context (from Opportunity) ──
  territory:"",lob:"",dealSize:"",secondaryContactIds:[],contactRoles:[],sourceLeadId:"",
  // ── Sales narrative ──
  scope:"",assumptions:"",exclusions:"",deliverables:"",preparedBy:"",salesEngineer:"",coverLetter:""
};

// Change-log entry: pushed onto quote.changeLog[] whenever the quote is mutated.
// field=null is reserved for status / lifecycle transitions.
export const BLANK_CHANGE_ENTRY={id:"",at:"",by:"",field:"",from:"",to:"",note:""};
// Attachment entry: file metadata + URL. Storage is out of scope (link from Drive/SharePoint).
export const BLANK_ATTACHMENT={id:"",name:"",url:"",kind:"document",addedBy:"",addedAt:""};

// Approval thresholds: a quote needs manager approval before Send if either
// the discount % exceeds DISCOUNT_PCT_THRESHOLD or the total exceeds VALUE_THRESHOLD.
// Both numbers are intentionally generous defaults; tune per business.
export const QUOTE_APPROVAL_THRESHOLDS={discountPct:20,totalValue:500}; // total in same units as quote.total (Lakh / Cr / etc.)

// Email send-log entry: pushed onto quote.emailLog[] every time the quote is mailed.
// kind = "initial" | "reminder" | "manual" — used to drive the reminder cadence.
export const BLANK_EMAIL_LOG={id:"",sentAt:"",sentBy:"",to:"",cc:"",subject:"",kind:"initial"};

// Reminder cadence after a quote is Sent (and not yet Accepted / Rejected / Expired):
// fire follow-up nudges at these day offsets relative to sentDate.
export const QUOTE_REMINDER_OFFSETS=[7,14];
// Quote line item.
//   - mrp / unit / currency: snapshot from catalogue at time of "Add from Catalogue".
//     Stored on the line so a later master-rate edit doesn't silently rewrite
//     historical quote PDFs.
//   - discountType ("pct" | "abs"): whether discountValue is a % off MRP or an
//     absolute amount (in same currency as MRP).
//   - unitPrice: derived = mrp - discount (per unit). Stays editable so a sales
//     rep can override even after picking from the catalogue.
//   - amount: unitPrice * qty (taxable value before GST).
//   - productId / moduleId: cross-reference back to the catalogue master so the
//     PDF and approval flow can group lines by product.
//   - chargeName: SKU-style short code printed on the invoice (separate from
//     the long human description). Optional.
//   - exRate: line-level FX (foreign currency → INR). Defaults to 1.
//   - igstRate / cgstRate / sgstRate: per-line rates. Computed by the form
//     based on quote.placeOfSupply vs seller home state, but stored explicitly
//     on the line so the historic invoice survives later POS / rate changes.
//   - igstAmount / cgstAmount / sgstAmount / totalWithTax: derived; carried on
//     the line for stable PDF rendering.
export const BLANK_QUOTE_ITEM={
  description:"", qty:1, unitPrice:0, amount:0, unitCost:0,
  productId:"", moduleId:"", chargeName:"",
  mrp:0, unit:"", currency:"INR", exRate:1,
  discountType:"pct", discountValue:0,
  igstRate:0, igstAmount:0,
  cgstRate:0, cgstAmount:0,
  sgstRate:0, sgstAmount:0,
  totalWithTax:0,
  // ── Pricing-logic snapshot from Masters / Product Catalogue ──
  // These are NOT used for tax math today (POS still drives the GST split,
  // and quote-level taxType still picks the rate). They are carried on the
  // line so the PDF / contract generator / invoice scheduler can read the
  // module's intended commercial behaviour even if the catalog is later
  // edited. All fields are optional ("" / 0) when the module has no value
  // set — downstream code falls back to quote/contract defaults.
  licenseType:"",        // commercial framing — one of:
                         //   "SaaS Subscription"
                         //   "SaaS — Per User / Month" | "SaaS — Per User / Quarterly" | "SaaS — Per User / Yearly"
                         //   "Term License" | "Perpetual (OTD)" | "Perpetual + AMC"
  billingFrequency:"",   // "One-time" | "Monthly" | "Quarterly" | "Half-Yearly" | "Annual" | "Per-Transaction" | "Usage-based"
  pricingModel:"",       // "Flat" | "Per-Unit" | "Per-User" | "Per-Transaction" | "Tiered" | "Volume"
  hsnSac:"",             // HSN/SAC code for compliance on invoice/PDF
  setupFee:0,            // One-time onboarding fee (in module currency)
  griApplicable:"",      // "Yes" | "No"
  griPercentage:0,       // % YoY escalation when griApplicable="Yes"
  defaultTermMonths:0,   // Default contract term (12 / 24 / 36)
  minCommitment:0,       // Minimum revenue floor per period (in module currency)
};
export const BLANK_COMM_LOG={type:"Email Sent",subject:"",body:"",from:"",to:"",accountId:"",contactId:"",oppId:"",date:"",status:"Sent",owner:"u1"};
export const BLANK_EVENT={title:"",type:"Call",status:"Scheduled",date:"",time:"09:00",endTime:"09:30",accountId:"",contactId:"",oppId:"",owner:"u1",attendees:[],location:"",notes:"",reminderMin:15};

export const INIT_QUOTES = [];
export const INIT_COMM_LOGS = [];
export const INIT_EVENTS = [];

// ── Blank template for Internal Updates ──
export const BLANK_UPDATE = {
  id:"", updateId:"", title:"", description:"", category:"Announcement", priority:"Medium",
  tags:[], createdBy:"", createdAt:"", updatedAt:"",
  recipientMode:"org", recipientTeamIds:[], recipientUserIds:[],
  taggedUserIds:[], attachments:[], readStatus:{}, editHistory:[], archived:false,
};

export const INIT_UPDATES = [];

export const BLANK_INVOICE={
  invoiceNo:"", accountId:"", accountNo:"", contractNo:"",
  invoiceType:"Tax Invoice",
  billPeriodFrom:"", billPeriodTo:"",
  invoiceDate:"", dueDate:"",
  product:"iCAFFE", description:"",
  billedAmount:0, gstRate:18, gstAmount:0,
  tdsRate:0, tdsAmount:0, netPayable:0,
  currency:"INR",
  paymentTerms:"Net 30",
  status:"Draft",
  paymentDate:"", paymentRef:"",
  paymentMode:"NEFT",
  collectedAmount:0, pendingAmount:0,
  agingBucket:"",
  remarks:"", owner:"u1"
};
export const INIT_INVOICES = [];
