// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════
export const PRODUCTS = [
  { id:"iCAFFE",       name:"iCAFFE",       desc:"e-Sanchit / EDI / CHA Platform",   color:"#2563EB", bg:"#EFF6FF", text:"#1D4ED8" },
  { id:"WiseHandling", name:"WiseHandling", desc:"Ground Handling Ops Management",    color:"#16A34A", bg:"#F0FDF4", text:"#15803D" },
  { id:"WiseCargo",    name:"WiseCargo",    desc:"Air Cargo Management System",       color:"#7C3AED", bg:"#F5F3FF", text:"#6D28D9" },
  { id:"WiseCCS",      name:"WiseCCS",      desc:"Cargo Community System",            color:"#D97706", bg:"#FFFBEB", text:"#B45309" },
  { id:"WiseDox",      name:"WiseDox",      desc:"Document & Compliance Management", color:"#0D9488", bg:"#F0FDFA", text:"#0F766E" },
  { id:"WiseTrax",     name:"WiseTrax",     desc:"Air Cargo Type-B Messaging Hub",   color:"#DC2626", bg:"#FEF2F2", text:"#B91C1C" },
];
export const PROD_MAP = Object.fromEntries(PRODUCTS.map(p=>[p.id,p]));

export const CUST_TYPES   = ["Airline","Airport","Government","Ground Handler","Customs Broker","Freight Forwarder","Exporter/Importer"];
export const STAGES       = ["Prospect","Qualified","Demo","Proposal","Negotiation","Won","Lost"];
export const STAGE_PROB   = {Prospect:10,Qualified:25,Demo:45,Proposal:60,Negotiation:80,Won:100,Lost:0};
export const STAGE_COL    = {Prospect:"#94A3B8",Qualified:"#3B82F6",Demo:"#8B5CF6",Proposal:"#F59E0B",Negotiation:"#F97316",Won:"#22C55E",Lost:"#EF4444"};
export const ACT_TYPES    = ["Call","Email","Meeting","Demo","WhatsApp","LinkedIn","Site Visit","Presentation","Conference"];
export const ACT_STATUS   = ["Planned","Completed","Cancelled"];
export const TICKET_TYPES    = ["Bug / Glitch","New Development","Enhancement","Customer Requirement","Integration Issue","Performance Issue"];
export const TICKET_STATUSES = ["Open","In Progress","Pending QA","Pending Customer","Resolved","Closed"];
export const COUNTRIES    = ["India","South Africa","UAE","Morocco","Kenya","Ethiopia","Nigeria","Egypt","Singapore","UK","USA"];
export const PRIORITIES   = ["Critical","High","Medium","Low"];
export const FILE_TYPES   = ["PDF","Excel","Word","PPT","Image","CSV","Zip","Other"];
export const REGIONS      = ["South Asia","Africa","Middle East","Southeast Asia","Europe","Americas"];

export const TEAM = [
  {id:"u1",name:"Shivbrata Bose",  role:"BD Lead",      lob:"All",          country:"India",        initials:"SB", email:"shivbrata@hansinfomatic.com"},
  {id:"u2",name:"Rahul Sharma",    role:"Sales Exec",   lob:"iCAFFE",       country:"India",        initials:"RS", email:"rahul@hansinfomatic.com"},
  {id:"u3",name:"Priya Nair",      role:"Sales Exec",   lob:"WiseHandling", country:"India",        initials:"PN", email:"priya@hansinfomatic.com"},
  {id:"u4",name:"Charles Isabirye",role:"Country Mgr",  lob:"All",          country:"South Africa", initials:"CI", email:"charles@hansinfomatic.com"},
  {id:"u5",name:"Vikram Mehta",    role:"Line Mgr",     lob:"WiseCargo",    country:"India",        initials:"VM", email:"vikram@hansinfomatic.com"},
  {id:"u6",name:"Aisha Patel",     role:"Sales Exec",   lob:"WiseDox",      country:"India",        initials:"AP", email:"aisha@hansinfomatic.com"},
  {id:"u7",name:"Tanbir Ansari",   role:"Tech Lead",    lob:"All",          country:"India",        initials:"TA", email:"tanbir@hansinfomatic.com"},
  {id:"u8",name:"Suresh Kumar",    role:"Support Engr", lob:"All",          country:"India",        initials:"SK", email:"suresh@hansinfomatic.com"},
];
export const TEAM_MAP = Object.fromEntries(TEAM.map(u=>[u.id,u]));

// ── Role Hierarchy ──
export const ROLES_HIERARCHY = [
  {id:"admin",       name:"Admin",            level:1, color:"#DC2626", desc:"Full system access, user management"},
  {id:"md",          name:"Managing Director", level:2, color:"#7C3AED", desc:"All data visibility, strategy-level access"},
  {id:"director",    name:"Director",          level:3, color:"#2563EB", desc:"Full read/write on all modules"},
  {id:"line_mgr",    name:"Line Manager",      level:4, color:"#D97706", desc:"Team oversight, reports, deals management"},
  {id:"country_mgr", name:"Country Manager",   level:5, color:"#16A34A", desc:"Country-scoped accounts, pipeline, activities"},
  {id:"bd_lead",     name:"BD Lead",           level:5, color:"#0D9488", desc:"Cross-LOB BD, full sales access"},
  {id:"sales_exec",  name:"Sales Executive",   level:6, color:"#64748B", desc:"Own accounts, contacts, pipeline, activities"},
  {id:"tech_lead",   name:"Tech Lead",         level:6, color:"#8B5CF6", desc:"Technical modules, tickets, integrations"},
  {id:"support",     name:"Support Engineer",  level:7, color:"#94A3B8", desc:"Tickets and account read access"},
  {id:"viewer",      name:"Viewer",            level:8, color:"#CBD5E1", desc:"Read-only across all modules"},
];
export const ROLE_MAP = Object.fromEntries(ROLES_HIERARCHY.map(r=>[r.id,r]));

export const PERMISSIONS = {
  admin:       {accounts:"rw",contacts:"rw",pipeline:"rw",activities:"rw",tickets:"rw",reports:true,masters:"rw",org:"rw",team:"rw"},
  md:          {accounts:"rw",contacts:"rw",pipeline:"rw",activities:"rw",tickets:"rw",reports:true,masters:"r", org:"rw",team:"rw"},
  director:    {accounts:"rw",contacts:"rw",pipeline:"rw",activities:"rw",tickets:"rw",reports:true,masters:"r", org:"r", team:"r"},
  line_mgr:    {accounts:"rw",contacts:"rw",pipeline:"rw",activities:"rw",tickets:"rw",reports:true,masters:"r", org:"r", team:"r"},
  country_mgr: {accounts:"rw",contacts:"rw",pipeline:"rw",activities:"rw",tickets:"rw",reports:true,masters:false,org:"r", team:"r"},
  bd_lead:     {accounts:"rw",contacts:"rw",pipeline:"rw",activities:"rw",tickets:"rw",reports:true,masters:false,org:"r", team:"r"},
  sales_exec:  {accounts:"rw",contacts:"rw",pipeline:"rw",activities:"rw",tickets:"r", reports:false,masters:false,org:false,team:false},
  tech_lead:   {accounts:"r", contacts:"r", pipeline:"r", activities:"r", tickets:"rw",reports:true,masters:false,org:"r", team:"r"},
  support:     {accounts:"r", contacts:"r", pipeline:false,activities:"r", tickets:"rw",reports:false,masters:false,org:false,team:false},
  viewer:      {accounts:"r", contacts:"r", pipeline:"r", activities:"r", tickets:"r", reports:false,masters:false,org:false,team:false},
};

// ── Extended Users with roles, branch, dept ──
// Seed users cleared for production — all users load from Supabase
export const INIT_USERS = [];
export const USERS_MAP = {};

// ── Verticals (Industry Segments) ──
export const VERTICALS = ["CHA","Forwarder","Airline","CTO","Ocean","School","Shipper/Consignee","Bonded Trucking","Cross Border Ecomm","GSSA","Airport","Government"];

// ── Lead Sources ──
export const LEAD_SOURCES = ["Inside Sales","Support","Social Media","Development","Direct Sales","Collection","Events","Referrals"];

// ── Lead Qualification (Sales Questionnaire) ──
export const LEAD_TEMPERATURES = ["Hot","Warm","Cool","Cold","Dead"];
export const BUSINESS_TYPES = ["Customs Broker","Freight Forwarder","Both","NVOCC / 3PL","Other"];
export const STAFF_SIZES = ["1–10","11–25","26–50","51–100","100+"];
export const CURRENT_SOFTWARE = ["Excel/Manual","LogiSys","CUSTCARE","CargoWise","In-house","Other ERP/TMS","None"];
export const SW_AGE = ["< 1 yr","1–3 yrs","3–5 yrs","5+ yrs"];
export const PAIN_POINTS = ["Manual data entry / re-keying","No real-time visibility","Delayed invoicing / billing","Poor MIS / reporting","Errors in customs documents","Document retrieval issues","Multiple disconnected systems","Client communication gaps"];
export const BUDGET_RANGES = ["< ₹50K","₹50K–1L","₹1L–3L","₹3L–5L","> ₹5L","ROI-based discussion"];
export const DECISION_MAKERS = ["Owner/MD","CEO/Dir.","Ops Head","IT / Finance"];
export const DECISION_TIMELINES = ["< 3 months","3–6 months","6+ months"];
export const EVALUATION_STATUS = ["Yes, actively","Had demos","Just exploring","Not evaluating"];
export const NEXT_STEPS = ["Send Brochure","Schedule Demo","Send Pricing","Follow-up Call"];

// ── Lead Stages ──
export const LEAD_STAGES = [
  {id:"MQL", name:"MQL – Marketing Qualified", stage:1, color:"#3B82F6"},
  {id:"SQL", name:"SQL – Sales Qualified",     stage:2, color:"#8B5CF6"},
  {id:"SAL", name:"SAL – Sales Accepted",      stage:3, color:"#22C55E"},
  {id:"Converted", name:"Converted to Opportunity", stage:4, color:"#16A34A"},
  {id:"NA",  name:"Not Applicable",            stage:0, color:"#94A3B8"},
];
export const LEAD_STAGE_MAP = Object.fromEntries(LEAD_STAGES.map(s=>[s.id,s]));

// ── Opportunity Phases & Stages ──
export const OPP_PHASES = ["Research","Evaluation","Development","Decision-Making","Implementation & Support","Suspended"];
export const OPP_STAGES = [
  {id:"lead_identified",   name:"Lead Identified",         phase:"Research",         probability:10,  color:"#94A3B8"},
  {id:"contacted",         name:"Contacted",               phase:"Research",         probability:25,  color:"#60A5FA"},
  {id:"qualification",     name:"Qualification (BFA)",     phase:"Evaluation",       probability:30,  color:"#818CF8"},
  {id:"demo_scheduled",    name:"Demo Scheduled",          phase:"Evaluation",       probability:40,  color:"#A78BFA"},
  {id:"solution_dev",      name:"Solution Development",    phase:"Development",      probability:60,  color:"#F59E0B"},
  {id:"solution_present",  name:"Solution Presentation",   phase:"Development",      probability:60,  color:"#FBBF24"},
  {id:"proposal",          name:"Proposal Submission",     phase:"Development",      probability:60,  color:"#F97316"},
  {id:"negotiation",       name:"Pricing & Negotiation",   phase:"Decision-Making",  probability:75,  color:"#FB923C"},
  {id:"decision_pending",  name:"Decision Pending",        phase:"Decision-Making",  probability:90,  color:"#EF4444"},
  {id:"closed_won",        name:"Closed Won",              phase:"Decision-Making",  probability:100, color:"#22C55E"},
  {id:"implementation",    name:"Implementation & Support", phase:"Implementation & Support", probability:100, color:"#16A34A"},
  {id:"closed_lost",       name:"Closed Lost",             phase:"Decision-Making",  probability:0,   color:"#DC2626"},
  {id:"suspended_short",   name:"Suspended (2-3 Months)",  phase:"Suspended",        probability:0,   color:"#CBD5E1"},
  {id:"suspended_mid",     name:"Suspended (3-6 Months)",  phase:"Suspended",        probability:0,   color:"#CBD5E1"},
  {id:"suspended_long",    name:"Suspended (6+ Months)",   phase:"Suspended",        probability:0,   color:"#CBD5E1"},
  {id:"suspended_nurture", name:"Suspended (Nurturing)",   phase:"Suspended",        probability:0,   color:"#CBD5E1"},
];
export const OPP_STAGE_MAP = Object.fromEntries(OPP_STAGES.map(s=>[s.id,s]));

// ── Forecast Categories ──
export const FORECAST_CATS = ["Best-Case","Likely-Case","Worst-Case","Not Applicable"];

// ── Opportunity Size ──
export const OPP_SIZES = ["Small","Medium","Large Enterprise"];

// ── Bill Terms & Types ──
export const BILL_TERMS = ["Monthly","Quarterly","Half-Yearly","Yearly","One-Time","Revenue Sharing"];
export const BILL_TYPES = ["Renewals","Installation","Deployment","Development","Per Transactions"];

// ── Win/Loss/Suspend Reasons ──
export const WIN_REASONS = ["Strong Product Fit","Competitive Pricing","Relationship & Trust","Fast & Effective Follow-up","Customer References","Payment Flexibility"];
export const LOSS_REASONS = ["Price Sensitivity","Competitor Win","Lack of Urgency","Feature Gaps","Budget Issues"];
export const SUSPEND_REASONS = ["Budget Constraint","Internal Priority Shift","Change in Decision Maker","Evaluating Competition","Not Ready but Interested"];

// ── Contact Roles & Dispositions ──
export const CONTACT_ROLES = ["Decision Maker/CXO","Decision Maker/HOD","Influencer","End User","External Consultant","Legal","Technical"];
export const CONTACT_DISPOSITIONS = ["Favourable","Neutral","Unfavourable"];

// ── Call Types & Objectives ──
export const CALL_TYPES = ["Telephone Call","Visit","Web Call","WhatsApp/Text","Email","LinkedIn"];
export const CALL_OBJECTIVES = ["Maintenance/QBR","Maintenance/MBR","Issue Resolution","Renewal Followup","Payment Followup","Cross-Sales/New Offer","Cross-Sales/New Info","Training/Feature Adoption","Request Referrals","VOC/Testimonials","Competition Info","General Followup"];
export const CALL_OUTCOMES = ["Completed","No Answer","Rescheduled","Voicemail","Left Message"];

// ── Customer Types (for Account Management) ──
export const CUSTOMER_TYPES = ["New","Existing","High-Value","At-Risk","Churned"];

// ── SLA Definitions (hours) ──
export const SLA_HOURS = {Critical:4, High:8, Medium:24, Low:48};
export const ESCALATION_LEVELS = ["L1 – Support Engineer","L2 – Team Lead","L3 – Product Head"];

// ── Collection Ageing Buckets ──
export const AGEING_BUCKETS = ["0-30","30-60","60-90","90-120","120-180","180+"];
export const COLLECTION_STATUSES = ["Current","Overdue","Escalated","Written Off"];
export const PAYMENT_MODES = ["NEFT","Cheque","UPI","Cash","Wire Transfer"];

// ── Contract Statuses ──
export const CONTRACT_STATUSES = ["Draft","Pending Approval","Active","Expired","Terminated"];
export const APPROVAL_CHAIN = ["Vertical Head","HOD","Finance","Special Approval"];
export const CONTRACT_DOC_TYPES = ["Contract","EULA","Payment Terms","PAN","GST Certificate","Partnership Agreement","COI","PO","Other"];

// ── Support Categories & Sub-Categories ──
export const SUPPORT_CATEGORIES = [
  {id:"sc1",name:"Technical Issue",subs:["Login / Access","Performance / Speed","Data Sync Error","Integration Failure","API Error","Server Downtime","Browser Compatibility"]},
  {id:"sc2",name:"Product Bug",subs:["UI Bug","Calculation Error","Report Mismatch","Workflow Error","Notification Failure","Data Loss","Print/Export Issue"]},
  {id:"sc3",name:"New Development",subs:["New Feature Request","Module Enhancement","Custom Report","Workflow Customization","API Development","Dashboard Change"]},
  {id:"sc4",name:"Training & Adoption",subs:["User Training","Admin Training","Feature Walkthrough","Documentation Request","Video Tutorial Request"]},
  {id:"sc5",name:"Billing & Account",subs:["Invoice Query","Payment Issue","License Renewal","Subscription Change","Refund Request","Account Deactivation"]},
  {id:"sc6",name:"Installation & Setup",subs:["New Installation","Environment Setup","Migration","Data Import","Configuration Change","SSL / Security Setup"]},
  {id:"sc7",name:"General Inquiry",subs:["Product Information","Pricing Query","Partnership Inquiry","Feedback","Complaint","Other"]},
];
export const SUPPORT_CAT_MAP = Object.fromEntries(SUPPORT_CATEGORIES.map(c=>[c.id,c]));

// ── Quotation Constants ──
export const QUOTE_STATUSES = ["Draft","Sent","Under Review","Accepted","Rejected","Expired","Revised"];
export const TAX_TYPES = ["GST 18%","GST 12%","GST 5%","No Tax","Custom"];
export const TAX_RATES = {"GST 18%":18,"GST 12%":12,"GST 5%":5,"No Tax":0,"Custom":0};
export const QUOTE_VALIDITY = ["7 Days","15 Days","30 Days","45 Days","60 Days","90 Days"];
export const STANDARD_TERMS = [
  "Payment due within 30 days of invoice date.",
  "Annual license fee payable in advance.",
  "Implementation timeline: 8-12 weeks from PO receipt.",
  "Training included: 3 sessions (8 hours each).",
  "Support: 24/7 for Critical, Business hours for others.",
  "Data migration: Up to 3 years historical data included.",
  "SLA: 99.5% uptime guarantee.",
  "Warranty: 90 days post go-live bug fixes at no cost.",
  "Renewal: Auto-renewal with 60-day prior notice for termination.",
  "Price escalation: Max 10% on annual renewal.",
];

// ── Communication Types ──
export const COMM_TYPES = ["Email Sent","Email Received","WhatsApp Sent","WhatsApp Received","SMS Sent","SMS Received","Letter Sent"];
export const COMM_STATUSES = ["Sent","Delivered","Read","Replied","Bounced","Failed"];

// ── Calendar Event Types ──
export const EVENT_TYPES = ["Call","Meeting","Demo","Follow-up","Site Visit","Presentation","Training","Review"];
export const EVENT_STATUSES = ["Scheduled","Completed","Cancelled","Rescheduled","No Show"];

// ── Bulk Upload Types ──
export const UPLOAD_TYPES = ["Leads","Customers","Contacts","Collections","Support Tickets","Contracts","Invoices"];

// ── Customer Hierarchy Levels ──
export const HIERARCHY_LEVELS = ["Parent Company","Subsidiary","Branch","Department","Office","Country Entity"];

// ── Contact Departments ──
export const CONTACT_DEPARTMENTS = ["Finance","Procurement","IT","Operations","Legal","Management","HR","Sales","Marketing","Technical","Compliance","Logistics"];

// ── Opportunity Sources ──
export const OPP_SOURCES = ["New Lead","Existing Customer – Upsell","Existing Customer – Cross-sell","Referral","Partner"];

// ── Permissions update for new modules ──
export const PERMISSIONS_EXT = {
  admin:       {leads:"rw",callReports:"rw",contracts:"rw",collections:"rw",targets:"rw"},
  md:          {leads:"rw",callReports:"rw",contracts:"rw",collections:"rw",targets:"rw"},
  director:    {leads:"rw",callReports:"rw",contracts:"rw",collections:"rw",targets:"r"},
  line_mgr:    {leads:"rw",callReports:"rw",contracts:"rw",collections:"rw",targets:"r"},
  country_mgr: {leads:"rw",callReports:"rw",contracts:"r", collections:"r", targets:"r"},
  bd_lead:     {leads:"rw",callReports:"rw",contracts:"rw",collections:"r", targets:"r"},
  sales_exec:  {leads:"rw",callReports:"rw",contracts:"r", collections:"r", targets:false},
  tech_lead:   {leads:"r", callReports:"r", contracts:"r", collections:false,targets:false},
  support:     {leads:false,callReports:"r",contracts:false,collections:false,targets:false},
  viewer:      {leads:"r", callReports:"r", contracts:"r", collections:"r", targets:false},
};

// ── Stage Gate Requirements for Lead Progression ──
export const STAGE_GATES = {
  MQL: {
    label: "Marketing Qualified",
    checks: [
      { key: "company", label: "Company name provided", test: l => !!l.company },
      { key: "contact", label: "Contact person identified", test: l => !!(l.contactIds?.length || l.contact) },
      { key: "product", label: "Product interest identified", test: l => !!l.product },
      { key: "source", label: "Lead source captured", test: l => !!l.source },
    ]
  },
  SQL: {
    label: "Sales Qualified",
    checks: [
      { key: "contactInfo", label: "Email or phone available", test: l => !!(l.email || l.phone) },
      { key: "painPoints", label: "Pain points identified", test: l => !!(l.painPoints?.length) },
      { key: "vertical", label: "Industry/vertical known", test: l => !!l.vertical },
      { key: "score", label: "Lead score ≥ 40", test: l => (l.score||0) >= 40 },
    ]
  },
  SAL: {
    label: "Sales Accepted",
    checks: [
      { key: "budget", label: "Budget range known", test: l => !!l.budgetRange },
      { key: "decisionMaker", label: "Decision maker identified", test: l => !!l.decisionMaker },
      { key: "timeline", label: "Decision timeline set", test: l => !!l.decisionTimeline },
      { key: "temperature", label: "Not Cold/Dead", test: l => l.temperature !== "Cold" && l.temperature !== "Dead" },
    ]
  },
  Converted: {
    label: "Convert to Opportunity",
    checks: [
      { key: "accountId", label: "Linked to account", test: l => !!l.accountId },
      { key: "contacts", label: "At least one contact linked", test: l => !!(l.contactIds?.length || l.contact) },
      { key: "score", label: "Lead score ≥ 60", test: l => (l.score||0) >= 60 },
    ]
  },
};

// ── Opportunity Contact Roles ──
export const OPP_CONTACT_ROLES = ["Decision Maker","Technical Evaluator","Influencer","End User","Procurement","Legal/Compliance","Executive Sponsor","Champion"];

// ── Lead Contact Roles ──
export const LEAD_CONTACT_ROLES = ["Decision Maker/HOD","Technical/IT","End User","Finance/Accounts","Presales/Demo","Management","Operations","Other"];

// ── Internal Updates & Notifications ──
export const UPDATE_CATEGORIES = [
  "Policy","Announcement","Product Release","Sales Alert",
  "HR","Operations","Finance","Technical","General"
];
export const UPDATE_RECIPIENT_MODES = ["org","team","specific"];
export const UPDATE_ATTACHMENT_TYPES = ["PDF","Excel","Word","PPT","Image","Link","Other"];
export const PERMISSIONS_UPDATES = {
  canPost:      ["admin","md","director","line_mgr","country_mgr","bd_lead","tech_lead"],
  canManageAll: ["admin","md","director"],
};
