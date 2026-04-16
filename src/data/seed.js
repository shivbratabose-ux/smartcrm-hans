import { ACT_TYPES, CUST_TYPES, COUNTRIES, REGIONS, PRIORITIES, STAGES, STAGE_PROB, TICKET_TYPES, CALL_TYPES, CALL_OBJECTIVES } from './constants.js';

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
export const INIT_MASTERS = {
  activityTypes: ACT_TYPES.map((t,i)=>({id:`at${i+1}`,name:t})),
  customerTypes: CUST_TYPES.map((t,i)=>({id:`ct${i+1}`,name:t})),
  countries:     COUNTRIES.map((c,i)=>({id:`co${i+1}`,name:c,region:REGIONS[i%REGIONS.length]})),
  priorities:    PRIORITIES.map((p,i)=>({id:`pr${i+1}`,name:p})),
  stages:        STAGES.map(s=>({id:`st${s}`,name:s,probability:STAGE_PROB[s]||0})),
  ticketTypes:   TICKET_TYPES.map((t,i)=>({id:`tt${i+1}`,name:t})),
  callTypes:     CALL_TYPES.map((t,i)=>({id:`clt${i+1}`,name:t})),
  callSubjects:  CALL_OBJECTIVES.map((t,i)=>({id:`cls${i+1}`,name:t})),
};

// ── Blank form templates ──
export const BLANK_ACC={name:"",type:"Airline",country:"India",city:"",website:"",segment:"Enterprise",status:"Prospect",products:[],owner:"u1",arrRevenue:0,potential:0,parentId:"",hierarchyLevel:"Parent Company",hierarchyPath:"",address:"",accountNo:"",state:"",pincode:"",legalName:"",pan:"",gstin:"",cin:"",taxTreatment:"Domestic",tdsApplicable:"No",poMandatory:"No",billingAddress:"",billingCity:"",billingState:"",billingPincode:"",billingCountry:"",primaryContact:"",primaryEmail:"",primaryPhone:"",billingContactName:"",billingContactEmail:"",financeContactEmail:"",paymentTerms:"Net 30",creditDays:30,currency:"INR",billingFrequency:"Annual",entityType:"Head Office",groupCode:"",territory:""};
export const BLANK_CON={name:"",role:"",email:"",phone:"",accountId:"",primary:false,contactId:"",designation:"",department:"",departments:[],products:[],branches:[],countries:[],linkedOpps:[],city:"",state:"",country:"",pincode:"",alternateEmail:"",alternatePhone:"",linkedInUrl:"",decisionLevel:"",influence:"Medium",category:"",preferredContactMode:"Email",doNotContact:"No",lastContactDate:"",source:""};
export const BLANK_OPP={title:"",accountId:"",products:[],stage:"Prospect",value:0,probability:10,owner:"u1",closeDate:"",country:"India",notes:"",source:"New Lead",primaryContactId:"",secondaryContactIds:[],hierarchyLevel:"Parent Company",leadId:"",contactRoles:[],sourceLeadIds:[],lob:""};
export const BLANK_ACT={title:"",type:"Call",status:"Planned",date:"",time:"",duration:30,accountId:"",contactId:"",oppId:"",owner:"u1",notes:"",outcome:"",files:[]};
export const BLANK_TKT={ticketNo:"",title:"",accountId:"",product:"iCAFFE",type:"Bug / Glitch",priority:"Medium",status:"Open",assigned:"u7",description:"",sla:"",escalation:"L1 – Support Engineer",resolution:"",csat:0,category:"Technical",subCategory:"",reportedBy:"",reportedDate:"",resolvedDate:"",affectedModule:"",severity:"Medium",environment:"Production",workaround:"No",internalNotes:"",revisitDate:"",tags:""};
export const BLANK_LEAD={company:"",contact:"",email:"",phone:"",product:"iCAFFE",vertical:"CHA",region:"South Asia",source:"Inside Sales",stage:"MQL",assignedTo:"u1",notes:"",nextCall:"",score:50,createdDate:"",leadId:"",accountId:"",temperature:"Warm",designation:"",noOfUsers:0,businessType:"Customs Broker",staffSize:"",branches:0,monthlyVolume:{airExp:"",airImp:"",seaTEU:"",customsEntries:""},currentSoftware:"",swAge:"",swSatisfaction:0,painPoints:[],budgetRange:"",decisionMaker:"",decisionTimeline:"",evaluatingOthers:"",nextStep:"",objections:"",contactIds:[],contactRoles:{},additionalProducts:[],estimatedValue:0,stageHistory:[],convertedOppIds:[],branch:"",location:"",department:"",addresses:[],salesTeam:[],country:"",state:"",city:"",companyWebsite:"",alternatePhone:"",alternateEmail:"",linkedInUrl:"",annualRevenue:0,campaignName:"",referredBy:"",expectedCloseDate:"",proposalSent:"No",demoScheduled:"No",competitorName:"",lastContactDate:""};
export const BLANK_CALL_REPORT={leadName:"",company:"",marketingPerson:"u1",leadStage:"MQL",callType:"Telephone Call",product:"iCAFFE",callDate:"",notes:"",nextCallDate:"",objective:"General Followup",outcome:"Completed",contactId:"",accountId:"",oppId:"",duration:15};
export const BLANK_CONTRACT={contractNo:"",title:"",accountId:"",oppId:"",product:"iCAFFE",status:"Draft",startDate:"",endDate:"",value:0,billTerm:"Yearly",billType:"Renewals",approvalStage:"",terms:"",docType:"Contract",owner:"u1",poNumber:"",renewalDate:"",renewalType:"Manual",paymentTerms:"Net 30",currency:"INR",billingFrequency:"Annual",invoiceGenBasis:"Advance",griApplicable:"No",griPercentage:0,noOfUsers:0,noOfBranches:0,serviceStartDate:"",commercialModel:"Annual SaaS",autoRenewal:"No",warrantyMonths:0,goLiveDate:"",territory:""};
export const BLANK_COLLECTION={invoiceNo:"",accountId:"",contractId:"",invoiceDate:"",dueDate:"",billedAmount:0,collectedAmount:0,pendingAmount:0,status:"Current",paymentMode:"NEFT",paymentDate:"",remarks:"",owner:"u1",invoiceType:"Tax Invoice",product:"",currency:"INR",gstAmount:0,tdsAmount:0,netPayable:0,billPeriodFrom:"",billPeriodTo:"",agingBucket:"",followUpDate:"",chequeRef:"",approvedBy:""};
export const BLANK_TARGET={userId:"u1",period:"",product:"All",targetValue:0,achievedValue:0,targetDeals:0,achievedDeals:0,targetCalls:0,achievedCalls:0};

export const INIT_LEADS = [];
export const INIT_CALL_REPORTS = [];
export const INIT_CONTRACTS = [];
export const INIT_COLLECTIONS = [];
export const INIT_TARGETS = [];

export const BLANK_QUOTE={title:"",accountId:"",oppId:"",contactId:"",product:"iCAFFE",items:[],subtotal:0,taxType:"GST 18%",taxAmount:0,discount:0,total:0,status:"Draft",validity:"30 Days",version:1,terms:"",owner:"u1",notes:"",createdDate:"",sentDate:"",expiryDate:""};
export const BLANK_QUOTE_ITEM={description:"",qty:1,unitPrice:0,amount:0};
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
