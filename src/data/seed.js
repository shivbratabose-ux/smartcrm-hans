import { ACT_TYPES, CUST_TYPES, COUNTRIES, REGIONS, PRIORITIES, STAGES, STAGE_PROB, TICKET_TYPES, CALL_TYPES, CALL_OBJECTIVES } from './constants.js';

// ═══════════════════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════════════════
export const INIT_ACCOUNTS = [
  {id:"a1", accountNo:"ACC-2026-001", name:"Air India",                type:"Airline",          country:"India",        products:["WiseCargo","WiseTrax"],       status:"Active",   owner:"u1", arrRevenue:18, potential:85,  city:"New Delhi",    website:"airindia.com",        segment:"Enterprise", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"Air India", address:"New Delhi, India"},
  {id:"a2", accountNo:"ACC-2026-002", name:"IndiGo Airlines",          type:"Airline",          country:"India",        products:["WiseTrax"],                   status:"Active",   owner:"u2", arrRevenue:12, potential:62,  city:"Gurugram",     website:"goindigo.in",         segment:"Enterprise", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"IndiGo Airlines", address:"Gurugram, India"},
  {id:"a3", accountNo:"ACC-2026-003", name:"DIAL (Delhi Airport)",     type:"Airport",          country:"India",        products:["WiseHandling","WiseCargo"],   status:"Active",   owner:"u3", arrRevenue:12, potential:40,  city:"New Delhi",    website:"newdelhiairport.in",  segment:"Enterprise", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"DIAL (Delhi Airport)", address:"New Delhi, India"},
  {id:"a4", accountNo:"ACC-2026-004", name:"CIAL (Kochi Airport)",     type:"Airport",          country:"India",        products:["WiseCCS"],                    status:"Active",   owner:"u5", arrRevenue:6,  potential:22,  city:"Kochi",        website:"cial.aero",           segment:"Mid-Market", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"CIAL (Kochi Airport)", address:"Kochi, India"},
  {id:"a5", accountNo:"ACC-2026-005", name:"MIAL (Mumbai Airport)",    type:"Airport",          country:"India",        products:["WiseHandling"],               status:"Active",   owner:"u1", arrRevenue:18, potential:55,  city:"Mumbai",       website:"csia.in",             segment:"Enterprise", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"MIAL (Mumbai Airport)", address:"Mumbai, India"},
  {id:"a6", accountNo:"ACC-2026-006", name:"Colossal Avia",            type:"Ground Handler",   country:"South Africa", products:["WiseHandling"],               status:"Prospect", owner:"u4", arrRevenue:0,  potential:120, city:"Cape Town",    website:"—",                   segment:"Enterprise", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"Colossal Avia", address:"Cape Town, South Africa"},
  {id:"a7", accountNo:"ACC-2026-007", name:"RAM Handling (RAMH)",      type:"Ground Handler",   country:"Morocco",      products:["WiseHandling"],               status:"Prospect", owner:"u4", arrRevenue:0,  potential:45,  city:"Casablanca",   website:"ramhandling.com",     segment:"Mid-Market", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"RAM Handling (RAMH)", address:"Casablanca, Morocco"},
  {id:"a8", accountNo:"ACC-2026-008", name:"Blue Dart Express",        type:"Freight Forwarder",country:"India",        products:["WiseCargo","WiseTrax"],       status:"Active",   owner:"u5", arrRevenue:8,  potential:30,  city:"Mumbai",       website:"bluedart.com",        segment:"Enterprise", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"Blue Dart Express", address:"Mumbai, India"},
  {id:"a9", accountNo:"ACC-2026-009", name:"DHL Express India",        type:"Freight Forwarder",country:"India",        products:["WiseCargo"],                  status:"Active",   owner:"u5", arrRevenue:5,  potential:28,  city:"Mumbai",       website:"dhl.com/in",          segment:"Enterprise", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"DHL Express India", address:"Mumbai, India"},
  {id:"a10",accountNo:"ACC-2026-010", name:"CBIC – Customs India",     type:"Government",       country:"India",        products:["iCAFFE","WiseDox"],           status:"Active",   owner:"u6", arrRevenue:25, potential:0,   city:"New Delhi",    website:"cbic.gov.in",         segment:"Government", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"CBIC – Customs India", address:"New Delhi, India"},
  {id:"a11",accountNo:"ACC-2026-011", name:"Air Arabia Cargo",         type:"Airline",          country:"UAE",          products:["WiseTrax","WiseCargo"],       status:"Prospect", owner:"u1", arrRevenue:0,  potential:55,  city:"Sharjah",      website:"airarabia.com",       segment:"Enterprise", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"Air Arabia Cargo", address:"Sharjah, UAE"},
  {id:"a12",accountNo:"ACC-2026-012", name:"Ethiopian Airlines Cargo", type:"Airline",          country:"Ethiopia",     products:["WiseCargo","WiseHandling"],   status:"Prospect", owner:"u4", arrRevenue:0,  potential:90,  city:"Addis Ababa",  website:"ethiopianairlines.com",segment:"Enterprise", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"Ethiopian Airlines Cargo", address:"Addis Ababa, Ethiopia"},
  {id:"a13",accountNo:"ACC-2026-013", name:"Safair Operations",        type:"Airline",          country:"South Africa", products:["WiseHandling"],               status:"Prospect", owner:"u4", arrRevenue:0,  potential:38,  city:"Johannesburg", website:"safair.co.za",        segment:"Mid-Market", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"Safair Operations", address:"Johannesburg, South Africa"},
  {id:"a14",accountNo:"ACC-2026-014", name:"Skylink Logistics",        type:"Exporter/Importer",country:"India",        products:["iCAFFE","WiseDox"],           status:"Active",   owner:"u2", arrRevenue:4,  potential:15,  city:"Chennai",      website:"—",                   segment:"SMB", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"Skylink Logistics", address:"Chennai, India"},
  {id:"a15",accountNo:"ACC-2026-015", name:"AIASL",                    type:"Ground Handler",   country:"India",        products:["WiseHandling"],               status:"Active",   owner:"u3", arrRevenue:32, potential:20,  city:"Mumbai",       website:"aiasl.in",            segment:"Enterprise", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"AIASL", address:"Mumbai, India"},
  {id:"a16",accountNo:"ACC-2026-016", name:"Allcargo Logistics",       type:"Freight Forwarder",country:"India",        products:["WiseCargo","WiseCCS"],        status:"Active",   owner:"u5", arrRevenue:7,  potential:25,  city:"Mumbai",       website:"allcargo.com",        segment:"Enterprise", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"Allcargo Logistics", address:"Mumbai, India"},
  {id:"a17",accountNo:"ACC-2026-017", name:"Kenya Airways Cargo",      type:"Airline",          country:"Kenya",        products:["WiseCargo"],                  status:"Prospect", owner:"u4", arrRevenue:0,  potential:60,  city:"Nairobi",      website:"kenya-airways.com",   segment:"Enterprise", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"Kenya Airways Cargo", address:"Nairobi, Kenya"},
  {id:"a18",accountNo:"ACC-2026-018", name:"CHA Association Mumbai",   type:"Customs Broker",   country:"India",        products:["iCAFFE"],                     status:"Active",   owner:"u2", arrRevenue:11, potential:8,   city:"Mumbai",       website:"—",                   segment:"Association", parentId:"", hierarchyLevel:"Parent Company", hierarchyPath:"CHA Association Mumbai", address:"Mumbai, India"},
];

export const INIT_CONTACTS = [
  {id:"c1", accountId:"a1", name:"Rajesh Kumar",    role:"VP Cargo",              email:"rajesh.k@airindia.in",        phone:"+91-98765-00001", primary:true, contactId:"CON-001", designation:"VP Cargo", department:"Operations", departments:["Operations","Management"], products:["WiseCargo","WiseTrax"], branches:[], countries:["India"], linkedOpps:["o5"]},
  {id:"c2", accountId:"a1", name:"Anita Singh",     role:"IT Head",               email:"anita.s@airindia.in",         phone:"+91-98765-00002", primary:false, contactId:"CON-002", designation:"IT Head", department:"IT", departments:["IT"], products:["WiseCargo","WiseTrax"], branches:[], countries:["India"], linkedOpps:["o5"]},
  {id:"c3", accountId:"a2", name:"Mohan Verma",     role:"CTO",                   email:"mohan.v@goindigo.in",         phone:"+91-98765-00003", primary:true, contactId:"CON-003", designation:"CTO", department:"IT", departments:["IT","Management"], products:["WiseTrax"], branches:[], countries:["India"], linkedOpps:["o6"]},
  {id:"c4", accountId:"a3", name:"Deepak Nanda",    role:"COO",                   email:"deepak.n@delhiairport.in",    phone:"+91-98765-00004", primary:true, contactId:"CON-004", designation:"COO", department:"Operations", departments:["Operations","Management"], products:["WiseHandling","WiseCargo"], branches:[], countries:["India"], linkedOpps:["o8"]},
  {id:"c5", accountId:"a5", name:"Sunil Patel",     role:"GM – Ground Handling",  email:"sunil.p@csia.in",             phone:"+91-98765-00005", primary:true, contactId:"CON-005", designation:"GM – Ground Handling", department:"Operations", departments:["Operations"], products:["WiseHandling"], branches:[], countries:["India"], linkedOpps:["o14"]},
  {id:"c6", accountId:"a6", name:"Nonku Dlamini",   role:"CEO",                   email:"nonku@colossalavia.co.za",    phone:"+27-82100-00001", primary:true, contactId:"CON-006", designation:"CEO", department:"Management", departments:["Management","Finance"], products:["WiseHandling"], branches:[], countries:["South Africa"], linkedOpps:["o1"]},
  {id:"c7", accountId:"a6", name:"Naomi Khumalo",   role:"Operations Director",   email:"naomi@colossalavia.co.za",    phone:"+27-82100-00002", primary:false, contactId:"CON-007", designation:"Operations Director", department:"Operations", departments:["Operations","IT"], products:["WiseHandling"], branches:[], countries:["South Africa"], linkedOpps:["o1"]},
  {id:"c8", accountId:"a7", name:"Ahmed Benali",    role:"IT Director",           email:"a.benali@ramhandling.com",    phone:"+212-6000-00001", primary:true, contactId:"CON-008", designation:"IT Director", department:"IT", departments:["IT","Procurement"], products:["WiseHandling"], branches:[], countries:["Morocco"], linkedOpps:["o2"]},
  {id:"c9", accountId:"a8", name:"Preet Jaiswal",   role:"Head – IT & Systems",   email:"preet.j@bluedart.com",        phone:"+91-98765-00006", primary:true, contactId:"CON-009", designation:"Head – IT & Systems", department:"IT", departments:["IT","Operations"], products:["WiseCargo","WiseTrax"], branches:[], countries:["India"], linkedOpps:["o13"]},
  {id:"c10",accountId:"a10",name:"Vandana Sharma",  role:"Dy Commissioner IT",    email:"vandana.s@cbic.gov.in",       phone:"+91-98765-00007", primary:true, contactId:"CON-010", designation:"Dy Commissioner IT", department:"IT", departments:["IT","Compliance"], products:["iCAFFE","WiseDox"], branches:[], countries:["India"], linkedOpps:["o11"]},
  {id:"c11",accountId:"a12",name:"Getachew Haile",  role:"VP – IT & Digitization",email:"g.haile@ethiopian.com",       phone:"+251-911000001",  primary:true, contactId:"CON-011", designation:"VP – IT & Digitization", department:"IT", departments:["IT","Management"], products:["WiseCargo","WiseHandling"], branches:[], countries:["Ethiopia"], linkedOpps:["o3"]},
  {id:"c12",accountId:"a15",name:"Capt. Roy Thomas",role:"MD",                    email:"roy.t@aiasl.in",              phone:"+91-98765-00008", primary:true, contactId:"CON-012", designation:"MD", department:"Management", departments:["Management","Operations"], products:["WiseHandling"], branches:[], countries:["India"], linkedOpps:["o14"]},
  {id:"c13",accountId:"a11",name:"Khalid Al Muqla", role:"Director Cargo",        email:"khalid.m@airarabia.ae",       phone:"+971-5000-00001", primary:true, contactId:"CON-013", designation:"Director Cargo", department:"Operations", departments:["Operations","Management"], products:["WiseCargo","WiseTrax"], branches:[], countries:["UAE"], linkedOpps:["o7"]},
  {id:"c14",accountId:"a17",name:"James Oduor",     role:"Head – Cargo IT",       email:"j.oduor@kenya-airways.com",   phone:"+254-700000001",  primary:true, contactId:"CON-014", designation:"Head – Cargo IT", department:"IT", departments:["IT"], products:["WiseCargo"], branches:[], countries:["Kenya"], linkedOpps:["o4"]},
  {id:"c15",accountId:"a4", name:"Latha Krishnan",  role:"IT Manager",            email:"latha.k@cial.aero",           phone:"+91-98765-00009", primary:true, contactId:"CON-015", designation:"IT Manager", department:"IT", departments:["IT"], products:["WiseCCS"], branches:[], countries:["India"], linkedOpps:[]},
  {id:"c16",accountId:"a16",name:"Rajan Shah",      role:"CIO",                   email:"rajan.s@allcargo.com",        phone:"+91-98765-00010", primary:true, contactId:"CON-016", designation:"CIO", department:"IT", departments:["IT","Management"], products:["WiseCargo","WiseCCS"], branches:[], countries:["India"], linkedOpps:["o10"]},
  {id:"c17",accountId:"a9", name:"Meena Pillai",    role:"Ops Director",          email:"meena.p@dhl.com",             phone:"+91-98765-00011", primary:true, contactId:"CON-017", designation:"Ops Director", department:"Operations", departments:["Operations"], products:["WiseCargo"], branches:[], countries:["India"], linkedOpps:[]},
  {id:"c18",accountId:"a13",name:"Pierre Fourie",   role:"Head of Operations",    email:"p.fourie@safair.co.za",       phone:"+27-82100-00003", primary:true, contactId:"CON-018", designation:"Head of Operations", department:"Operations", departments:["Operations"], products:["WiseHandling"], branches:[], countries:["South Africa"], linkedOpps:["o9"]},
];

export const INIT_OPPS = [
  {id:"o1", accountId:"a6", title:"WiseHandling – Colossal Avia Full Deploy",   products:["WiseHandling"],           stage:"Proposal",    value:120, owner:"u4", closeDate:"2026-06-30", country:"South Africa", probability:60,  notes:"Primary strategic target. MPC partnership. GTM week 31 Mar.", source:"New Lead", primaryContactId:"c6", secondaryContactIds:["c7"], hierarchyLevel:"Parent Company", leadId:""},
  {id:"o2", accountId:"a7", title:"WiseHandling – RAM Handling IRMS Tender",    products:["WiseHandling"],           stage:"Qualified",   value:45,  owner:"u4", closeDate:"2026-07-31", country:"Morocco",       probability:25,  notes:"RFI response submitted 12 Mar 2026. Evaluation ongoing.", source:"New Lead", primaryContactId:"c8", secondaryContactIds:[], hierarchyLevel:"Parent Company", leadId:""},
  {id:"o3", accountId:"a12",title:"WiseCargo + WiseHandling – Ethiopian Cargo", products:["WiseCargo","WiseHandling"],stage:"Prospect",   value:90,  owner:"u4", closeDate:"2026-09-30", country:"Ethiopia",      probability:10,  notes:"MPC facilitated intro Mar 2026.", source:"New Lead", primaryContactId:"c11", secondaryContactIds:[], hierarchyLevel:"Parent Company", leadId:""},
  {id:"o4", accountId:"a17",title:"WiseCargo – Kenya Airways Cargo",            products:["WiseCargo"],              stage:"Prospect",    value:60,  owner:"u4", closeDate:"2026-10-31", country:"Kenya",         probability:10,  notes:"Initial outreach via MPC.", source:"New Lead", primaryContactId:"c14", secondaryContactIds:[], hierarchyLevel:"Parent Company", leadId:""},
  {id:"o5", accountId:"a1", title:"WiseTrax Type-B – Air India",                products:["WiseTrax"],               stage:"Demo",        value:35,  owner:"u1", closeDate:"2026-05-31", country:"India",         probability:45,  notes:"Demo completed. Awaiting cargo IT feedback.", source:"Existing Customer – Upsell", primaryContactId:"c1", secondaryContactIds:["c2"], hierarchyLevel:"Parent Company", leadId:""},
  {id:"o6", accountId:"a2", title:"WiseTrax – IndiGo Integration",              products:["WiseTrax"],               stage:"Negotiation", value:28,  owner:"u2", closeDate:"2026-04-30", country:"India",         probability:80,  notes:"Contract review in progress. Close this month.", source:"Existing Customer – Upsell", primaryContactId:"c3", secondaryContactIds:[], hierarchyLevel:"Parent Company", leadId:""},
  {id:"o7", accountId:"a11",title:"WiseCargo + WiseTrax – Air Arabia",          products:["WiseCargo","WiseTrax"],   stage:"Demo",        value:55,  owner:"u1", closeDate:"2026-06-30", country:"UAE",           probability:45,  notes:"Pilot proposal being drafted.", source:"New Lead", primaryContactId:"c13", secondaryContactIds:[], hierarchyLevel:"Parent Company", leadId:""},
  {id:"o8", accountId:"a3", title:"WiseCargo Upgrade + Renewal – DIAL",         products:["WiseCargo"],              stage:"Negotiation", value:22,  owner:"u5", closeDate:"2026-04-15", country:"India",         probability:80,  notes:"Annual renewal + module upgrade.", source:"Existing Customer – Upsell", primaryContactId:"c4", secondaryContactIds:[], hierarchyLevel:"Parent Company", leadId:""},
  {id:"o9", accountId:"a13",title:"WiseHandling – Safair Ops",                  products:["WiseHandling"],           stage:"Qualified",   value:38,  owner:"u4", closeDate:"2026-08-31", country:"South Africa",  probability:25,  notes:"Intro through MPC network.", source:"New Lead", primaryContactId:"c18", secondaryContactIds:[], hierarchyLevel:"Parent Company", leadId:""},
  {id:"o10",accountId:"a16",title:"WiseCCS – Allcargo Community Hub",           products:["WiseCCS"],                stage:"Proposal",    value:18,  owner:"u5", closeDate:"2026-05-15", country:"India",         probability:60,  notes:"Proposal submitted. Follow-up due.", source:"Existing Customer – Cross-sell", primaryContactId:"c16", secondaryContactIds:[], hierarchyLevel:"Parent Company", leadId:""},
  {id:"o11",accountId:"a10",title:"WiseDox Expansion – CBIC Phase 2",           products:["WiseDox"],                stage:"Won",         value:15,  owner:"u6", closeDate:"2026-03-31", country:"India",         probability:100, notes:"PO received. Kickoff April 7.", source:"Existing Customer – Upsell", primaryContactId:"c10", secondaryContactIds:[], hierarchyLevel:"Parent Company", leadId:""},
  {id:"o12",accountId:"a14",title:"iCAFFE Pro – Skylink Logistics",             products:["iCAFFE"],                 stage:"Proposal",    value:8,   owner:"u2", closeDate:"2026-04-30", country:"India",         probability:60,  notes:"Proposal sent. Follow-up pending.", source:"Existing Customer – Cross-sell", primaryContactId:"", secondaryContactIds:[], hierarchyLevel:"Parent Company", leadId:""},
  {id:"o13",accountId:"a8", title:"WiseTrax Integration – Blue Dart",           products:["WiseTrax"],               stage:"Demo",        value:12,  owner:"u5", closeDate:"2026-05-31", country:"India",         probability:45,  notes:"Demo done. Awaiting IT evaluation.", source:"Existing Customer – Upsell", primaryContactId:"c9", secondaryContactIds:[], hierarchyLevel:"Parent Company", leadId:""},
  {id:"o14",accountId:"a5", title:"WiseHandling Phase 3 – MIAL",                products:["WiseHandling"],           stage:"Won",         value:28,  owner:"u3", closeDate:"2026-03-15", country:"India",         probability:100, notes:"Live. Phase 3 deployed.", source:"Existing Customer – Upsell", primaryContactId:"c5", secondaryContactIds:["c12"], hierarchyLevel:"Parent Company", leadId:""},
];

export const INIT_ACTIVITIES = [
  {id:"act1", type:"Call",    status:"Completed", date:"2026-03-19", time:"14:00", duration:30,  accountId:"a6",  contactId:"c6",  oppId:"o1",  owner:"u4", title:"Colossal – GTM Presentation prep call",       notes:"Confirmed week of 31 Mar. Nonku and Naomi attending.", outcome:"Positive"},
  {id:"act2", type:"Email",   status:"Completed", date:"2026-03-18", time:"10:30", duration:0,   accountId:"a7",  contactId:"c8",  oppId:"o2",  owner:"u4", title:"RAM Handling – RFI acknowledgement",           notes:"Ahmed confirmed receipt. Evaluation ongoing.",         outcome:"Neutral"},
  {id:"act3", type:"Meeting", status:"Completed", date:"2026-03-17", time:"11:00", duration:60,  accountId:"a1",  contactId:"c1",  oppId:"o5",  owner:"u1", title:"Air India – WiseTrax Technical Demo",          notes:"IT team impressed. Follow-up call scheduled.",         outcome:"Positive"},
  {id:"act4", type:"Call",    status:"Completed", date:"2026-03-15", time:"16:00", duration:30,  accountId:"a2",  contactId:"c3",  oppId:"o6",  owner:"u2", title:"IndiGo – Contract review discussion",          notes:"Legal reviewing NDA provisions. Close expected end Mar.",outcome:"Positive"},
  {id:"act5", type:"Email",   status:"Completed", date:"2026-03-14", time:"09:00", duration:0,   accountId:"a16", contactId:"c16", oppId:"o10", owner:"u5", title:"Allcargo – WiseCCS proposal follow-up",        notes:"Sent follow-up. No response yet.",                     outcome:"Neutral"},
  {id:"act6", type:"Meeting", status:"Completed", date:"2026-03-12", time:"15:00", duration:90,  accountId:"a12", contactId:"c11", oppId:"o3",  owner:"u4", title:"Ethiopian Airlines – Initial Discovery Call",  notes:"MPC facilitated. Getachew keen on cargo digitization.", outcome:"Positive"},
  {id:"act7", type:"Call",    status:"Completed", date:"2026-03-10", time:"11:30", duration:45,  accountId:"a10", contactId:"c10", oppId:"o11", owner:"u6", title:"CBIC – WiseDox expansion scope discussion",    notes:"PO confirmed. Implementation kickoff April 7.",         outcome:"Positive"},
  {id:"act8", type:"Email",   status:"Completed", date:"2026-03-08", time:"08:00", duration:0,   accountId:"a13", contactId:"c18", oppId:"o9",  owner:"u4", title:"Safair – Introductory email via MPC",          notes:"MPC sent intro. Awaiting response from ops team.",     outcome:"Neutral"},
  {id:"act9", type:"Meeting", status:"Completed", date:"2026-03-05", time:"14:00", duration:60,  accountId:"a11", contactId:"c13", oppId:"o7",  owner:"u1", title:"Air Arabia – Solution alignment meeting",      notes:"WiseCargo + WiseTrax bundle pricing discussed.",        outcome:"Positive"},
  {id:"act10",type:"Call",    status:"Completed", date:"2026-03-03", time:"10:00", duration:30,  accountId:"a8",  contactId:"c9",  oppId:"o13", owner:"u5", title:"Blue Dart – WiseTrax integration review call", notes:"Technical integration checklist shared.",              outcome:"Neutral"},
  {id:"act11",type:"Demo",    status:"Completed", date:"2026-02-28", time:"15:00", duration:120, accountId:"a7",  contactId:"c8",  oppId:"o2",  owner:"u4", title:"RAM Handling – WiseHandling Product Demo",     notes:"Full product walkthrough. Positive reception.",         outcome:"Positive"},
  {id:"act12",type:"Meeting", status:"Completed", date:"2026-02-25", time:"09:30", duration:45,  accountId:"a17", contactId:"c14", oppId:"o4",  owner:"u4", title:"Kenya Airways – LinkedIn outreach follow-up",  notes:"Connected with James Oduor. Meeting requested.",        outcome:"Neutral"},
  {id:"act13",type:"Call",    status:"Planned",   date:"2026-03-25", time:"10:00", duration:60,  accountId:"a6",  contactId:"c6",  oppId:"o1",  owner:"u4", title:"Colossal – Pre-GTM alignment call with Nonku", notes:"Confirm agenda, attendees, and data sovereignty discussion.", outcome:""},
  {id:"act14",type:"Presentation",status:"Planned",date:"2026-03-31",time:"15:00",duration:120,  accountId:"a6",  contactId:"c7",  oppId:"o1",  owner:"u1", title:"Colossal – GTM Presentation (WiseHandling)",  notes:"Main GTM event. Nonku + Naomi + MPC team attending.", outcome:""},
  {id:"act15",type:"Call",    status:"Planned",   date:"2026-03-22", time:"11:00", duration:30,  accountId:"a2",  contactId:"c3",  oppId:"o6",  owner:"u2", title:"IndiGo – Contract close follow-up call",       notes:"Confirm final NDA clause and countersign date.", outcome:""},
  {id:"act16",type:"Meeting", status:"Planned",   date:"2026-04-07", time:"10:00", duration:90,  accountId:"a10", contactId:"c10", oppId:"o11", owner:"u6", title:"CBIC – WiseDox Phase 2 Kickoff Meeting",       notes:"Project kickoff. Scope, team, milestones to be shared.", outcome:""},
  {id:"act17",type:"Demo",    status:"Planned",   date:"2026-04-10", time:"14:00", duration:120, accountId:"a12", contactId:"c11", oppId:"o3",  owner:"u4", title:"Ethiopian Airlines – WiseCargo Demo",          notes:"Full cargo module demo. MPC Charles coordinating.", outcome:""},
];

export const INIT_TICKETS = [
  {id:"TK-001",title:"iCAFFE – e-Sanchit sync failure on ICES 1.5 update",        accountId:"a10",product:"iCAFFE",       type:"Bug / Glitch",       priority:"Critical",status:"In Progress",     assigned:"u7",created:"2026-03-18",sla:"2026-03-20",description:"Post ICES 1.5 update, batch sync failing with error code 5023. Affects all BE filings."},
  {id:"TK-002",title:"WiseHandling – PRM workflow for unaccompanied minors",       accountId:"a5", product:"WiseHandling", type:"New Development",    priority:"High",    status:"Open",            assigned:"u8",created:"2026-03-17",sla:"2026-04-17",description:"MIAL requires UM handling workflow per IATA standards. Full UI + rules engine needed."},
  {id:"TK-003",title:"WiseCargo – Bulk AWB print times out above 200 records",     accountId:"a8", product:"WiseCargo",    type:"Performance Issue",  priority:"High",    status:"In Progress",     assigned:"u7",created:"2026-03-15",sla:"2026-03-22",description:"Bulk print job times out for batches >200 AWBs. Needs query optimization + async processing."},
  {id:"TK-004",title:"WiseTrax – SITA connection timeout during peak hours",       accountId:"a2", product:"WiseTrax",     type:"Bug / Glitch",       priority:"Critical",status:"Pending QA",      assigned:"u7",created:"2026-03-14",sla:"2026-03-21",description:"Type-B gateway losing SITA sessions with >50 concurrent messages. Session pooling issue."},
  {id:"TK-005",title:"iCAFFE – Add eSeal number field in BE filing form",          accountId:"a18",product:"iCAFFE",       type:"Enhancement",        priority:"Medium",  status:"Open",            assigned:"u8",created:"2026-03-12",sla:"2026-04-12",description:"Customs requirement for eSeal field in Bill of Entry form per latest CBIC circular."},
  {id:"TK-006",title:"WiseCCS – Cargo manifest reconciliation daily report",       accountId:"a4", product:"WiseCCS",      type:"Customer Requirement",priority:"Medium", status:"Open",            assigned:"u8",created:"2026-03-10",sla:"2026-04-10",description:"CIAL needs automated daily reconciliation report between CCS and airline carrier data."},
  {id:"TK-007",title:"WiseDox – DocuSign integration for e-AWB signing",           accountId:"a1", product:"WiseDox",      type:"Integration Issue",  priority:"High",    status:"In Progress",     assigned:"u7",created:"2026-03-08",sla:"2026-03-29",description:"e-AWB signature workflow needs DocuSign API v3 integration. OAuth setup pending."},
  {id:"TK-008",title:"WiseHandling – GSE maintenance calendar export to Excel",    accountId:"a3", product:"WiseHandling", type:"Enhancement",        priority:"Low",     status:"Open",            assigned:"u8",created:"2026-03-05",sla:"2026-04-05",description:"Operations team wants Excel export of GSE maintenance schedule with custom date range."},
  {id:"TK-009",title:"iCAFFE – Duplicate TP detection flag not triggering",        accountId:"a14",product:"iCAFFE",       type:"Bug / Glitch",       priority:"High",    status:"Pending Customer",assigned:"u7",created:"2026-03-03",sla:"2026-03-20",description:"Duplicate transport permits being filed without system warning flag. Awaiting test data from customer."},
  {id:"TK-010",title:"WiseCargo – Auto-generate NOTOC from DG declaration",        accountId:"a1", product:"WiseCargo",    type:"New Development",    priority:"High",    status:"Open",            assigned:"u8",created:"2026-02-28",sla:"2026-04-28",description:"Airline requests automated NOTOC generation triggered from dangerous goods declaration entry."},
  {id:"TK-011",title:"WiseTrax – Message routing rules admin UI",                  accountId:"a2", product:"WiseTrax",     type:"Enhancement",        priority:"Medium",  status:"Resolved",        assigned:"u7",created:"2026-02-25",sla:"2026-03-25",description:"Admin UI to manage Type-B routing rules without code changes. Delivered v1."},
  {id:"TK-012",title:"WiseHandling – ACSA AODB integration dropping intermittently",accountId:"a6",product:"WiseHandling",type:"Integration Issue",  priority:"High",    status:"Open",            assigned:"u7",created:"2026-02-22",sla:"2026-03-22",description:"AODB real-time flight data feed dropping for South Africa deployment test environment."},
];

export const INIT_NOTES = [
  {id:"n1", recordType:"account", recordId:"a6", author:"u1", date:"2026-03-19 16:30", text:"Spoke with Charles – Nonku prefers WhatsApp for quick updates. Naomi handles the technical side and wants to review integration architecture before the GTM presentation."},
  {id:"n2", recordType:"opp",     recordId:"o1", author:"u4", date:"2026-03-18 11:00", text:"Proposal sent to Colossal via email + WhatsApp. MPC reviewing pricing with Colossal's finance team. Expect response by end of week."},
  {id:"n3", recordType:"account", recordId:"a6", author:"u4", date:"2026-03-15 09:00", text:"Data sovereignty flagged as a risk. South African airports are National Key Points – may require in-country hosting. MTN data centres noted as a potential option via MPC."},
  {id:"n4", recordType:"opp",     recordId:"o6", author:"u2", date:"2026-03-16 14:00", text:"IndiGo legal team reviewing Clause 8 (data retention). Mohan says it should clear by 22 March. Contract can countersign digitally via DocuSign."},
  {id:"n5", recordType:"account", recordId:"a7", author:"u4", date:"2026-03-13 10:30", text:"RAM Handling confirmed that their procurement committee meets on first Monday of every month. Next meeting: April 7. Ensure follow-up before that date."},
  {id:"n6", recordType:"opp",     recordId:"o3", author:"u4", date:"2026-03-12 17:00", text:"Discovery call went well. Ethiopian Airlines operates 120+ weekly cargo flights and is actively seeking cargo digitization. Getachew personally championing this internally."},
  {id:"n7", recordType:"account", recordId:"a1", author:"u1", date:"2026-03-10 15:00", text:"Rajesh Kumar confirmed Air India Cargo is on budget freeze till April. WiseTrax deal likely to slip to Q2. Keep warm but do not push."},
  {id:"n8", recordType:"opp",     recordId:"o8", author:"u5", date:"2026-03-09 09:30", text:"DIAL renewal + upgrade confirmed. Legal already reviewed. Deepak to sign on behalf. Expect PO within 2 weeks."},
];

export const INIT_FILES = [
  {id:"fi1", name:"WiseHandling_Proposal_Colossal_v3.pdf",   size:"2.4 MB", type:"PDF",   uploadedBy:"u4", date:"2026-03-15", linkedTo:[{type:"account",id:"a6"},{type:"opp",id:"o1"}]},
  {id:"fi2", name:"RAM_Handling_RFI_Response_Matrix.xlsx",   size:"1.8 MB", type:"Excel", uploadedBy:"u4", date:"2026-03-12", linkedTo:[{type:"account",id:"a7"},{type:"opp",id:"o2"}]},
  {id:"fi3", name:"Hans_Infomatic_Company_Profile_2026.pdf", size:"3.1 MB", type:"PDF",   uploadedBy:"u1", date:"2026-03-10", linkedTo:[{type:"account",id:"a6"},{type:"account",id:"a7"},{type:"account",id:"a12"}]},
  {id:"fi4", name:"WiseHandling_GTM_Deck_Africa_v2.pptx",    size:"5.2 MB", type:"PPT",   uploadedBy:"u1", date:"2026-03-08", linkedTo:[{type:"account",id:"a6"},{type:"opp",id:"o1"}]},
  {id:"fi5", name:"IndiGo_WiseTrax_Contract_Draft.docx",     size:"420 KB", type:"Word",  uploadedBy:"u2", date:"2026-03-16", linkedTo:[{type:"account",id:"a2"},{type:"opp",id:"o6"}]},
  {id:"fi6", name:"CBIC_WiseDox_PO_Phase2.pdf",              size:"180 KB", type:"PDF",   uploadedBy:"u6", date:"2026-03-18", linkedTo:[{type:"account",id:"a10"},{type:"opp",id:"o11"}]},
  {id:"fi7", name:"Ethiopian_Discovery_Call_Notes.docx",     size:"95 KB",  type:"Word",  uploadedBy:"u4", date:"2026-03-12", linkedTo:[{type:"account",id:"a12"},{type:"opp",id:"o3"}]},
  {id:"fi8", name:"WiseTrax_Technical_Architecture_v4.pdf",  size:"4.8 MB", type:"PDF",   uploadedBy:"u7", date:"2026-03-05", linkedTo:[{type:"account",id:"a1"},{type:"account",id:"a2"}]},
];

// ── Product Catalog with Sub-Products / Modules ──
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

// ── Org Hierarchy: Market -> Company -> Division -> Country -> Branch -> Department ──
export const INIT_ORG = {
  markets:[
    {id:"mk1",name:"South Asia",   region:"Asia",        head:"u1", notes:"India domestic + SAARC"},
    {id:"mk2",name:"Africa",       region:"Africa",      head:"u4", notes:"East & Southern Africa + North Africa"},
    {id:"mk3",name:"Middle East",  region:"MEA",         head:"u1", notes:"UAE, Qatar, Saudi Arabia"},
    {id:"mk4",name:"Rest of World",region:"Global",      head:"u1", notes:"Europe, Americas, Southeast Asia"},
  ],
  companies:[
    {id:"co1",name:"Hans Infomatic Pvt. Ltd.",marketId:"mk1",type:"Internal HQ",country:"India",   regNo:"U72900MH2018PTC308XXX"},
    {id:"co2",name:"MPC Marketing (Pty) Ltd.", marketId:"mk2",type:"Partner",    country:"South Africa",regNo:"MPC-ZA-2024"},
    {id:"co3",name:"Hans Infomatic DMCC",      marketId:"mk3",type:"Subsidiary", country:"UAE",    regNo:"DMCC-HANS-2025"},
  ],
  divisions:[
    {id:"dv1",name:"Aviation Products",  companyId:"co1",head:"u1",products:["WiseHandling","WiseCargo","WiseCCS","WiseTrax"]},
    {id:"dv2",name:"CHA & Logistics",    companyId:"co1",head:"u2",products:["iCAFFE","WiseDox"]},
    {id:"dv3",name:"Africa Business",    companyId:"co1",head:"u4",products:["WiseHandling","WiseCargo"]},
    {id:"dv4",name:"MPC Reseller Ops",   companyId:"co2",head:"u4",products:["WiseHandling"]},
    {id:"dv5",name:"Middle East Ops",    companyId:"co3",head:"u1",products:["WiseTrax","WiseCargo"]},
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
    {id:"dep1",name:"Business Development", branchId:"br1",head:"u1",headcount:4},
    {id:"dep2",name:"Technology & Products",branchId:"br1",head:"u7",headcount:3},
    {id:"dep3",name:"Customer Support",     branchId:"br1",head:"u8",headcount:2},
    {id:"dep4",name:"Africa Sales",         branchId:"br3",head:"u4",headcount:1},
    {id:"dep5",name:"CHA Sales – North",    branchId:"br2",head:"u3",headcount:2},
    {id:"dep6",name:"CHA Sales – East",     branchId:"br6",head:"u6",headcount:1},
    {id:"dep7",name:"MEA Business",         branchId:"br5",head:"u1",headcount:1},
  ],
};

// ── Teams per product line ──
export const INIT_TEAMS = [
  {id:"t1",name:"iCAFFE Team",        productId:"iCAFFE",       lead:"u2",members:["u2","u6"],desc:"CHA and customs digitisation vertical"},
  {id:"t2",name:"WiseHandling Team",  productId:"WiseHandling", lead:"u3",members:["u3","u4"],desc:"Ground handling ops management"},
  {id:"t3",name:"WiseCargo Team",     productId:"WiseCargo",    lead:"u5",members:["u5","u4"],desc:"Air cargo management systems"},
  {id:"t4",name:"WiseDox Team",       productId:"WiseDox",      lead:"u6",members:["u6"],      desc:"Document and compliance management"},
  {id:"t5",name:"WiseTrax Team",      productId:"WiseTrax",     lead:"u1",members:["u1","u7"],desc:"Type-B messaging gateway"},
  {id:"t6",name:"Africa Team",        productId:null,           lead:"u4",members:["u4"],      desc:"MPC-led Africa market development"},
  {id:"t7",name:"Technology",         productId:null,           lead:"u7",members:["u7","u8"],desc:"Product engineering and support"},
];

// Masters – editable reference data
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
export const BLANK_ACC={name:"",type:"Airline",country:"India",city:"",website:"",segment:"Enterprise",status:"Prospect",products:[],owner:"u1",arrRevenue:0,potential:0,parentId:"",hierarchyLevel:"Parent Company",hierarchyPath:"",address:"",accountNo:""};
export const BLANK_CON={name:"",role:"",email:"",phone:"",accountId:"",primary:false,contactId:"",designation:"",department:"",departments:[],products:[],branches:[],countries:[],linkedOpps:[]};
export const BLANK_OPP={title:"",accountId:"",products:[],stage:"Prospect",value:0,probability:10,owner:"u1",closeDate:"",country:"India",notes:"",source:"New Lead",primaryContactId:"",secondaryContactIds:[],hierarchyLevel:"Parent Company",leadId:"",contactRoles:[],sourceLeadIds:[],lob:""};
export const BLANK_ACT={title:"",type:"Call",status:"Planned",date:"",time:"",duration:30,accountId:"",contactId:"",oppId:"",owner:"u1",notes:"",outcome:"",files:[]};
export const BLANK_TKT={title:"",accountId:"",product:"iCAFFE",type:"Bug / Glitch",priority:"Medium",status:"Open",assigned:"u7",description:"",sla:"",escalation:"L1 – Support Engineer",resolution:"",csat:0};
export const BLANK_LEAD={company:"",contact:"",email:"",phone:"",product:"iCAFFE",vertical:"CHA",region:"South Asia",source:"Inside Sales",stage:"MQL",assignedTo:"u1",notes:"",nextCall:"",score:50,createdDate:"",leadId:"",accountId:"",temperature:"Warm",designation:"",noOfUsers:0,businessType:"Customs Broker",staffSize:"",branches:0,monthlyVolume:{airExp:"",airImp:"",seaTEU:"",customsEntries:""},currentSoftware:"",swAge:"",swSatisfaction:0,painPoints:[],budgetRange:"",decisionMaker:"",decisionTimeline:"",evaluatingOthers:"",nextStep:"",objections:"",contactIds:[],contactRoles:{},additionalProducts:[],estimatedValue:0,stageHistory:[],convertedOppIds:[],branch:"",location:"",department:"",addresses:[],salesTeam:[]};
export const BLANK_CALL_REPORT={leadName:"",company:"",marketingPerson:"u1",leadStage:"MQL",callType:"Telephone Call",product:"iCAFFE",callDate:"",notes:"",nextCallDate:"",objective:"General Followup",outcome:"Completed",contactId:"",accountId:"",oppId:"",duration:15};
export const BLANK_CONTRACT={title:"",accountId:"",oppId:"",product:"iCAFFE",status:"Draft",startDate:"",endDate:"",value:0,billTerm:"Yearly",billType:"Renewals",approvalStage:"",terms:"",docType:"Contract",owner:"u1",poNumber:"",renewalDate:""};
export const BLANK_COLLECTION={invoiceNo:"",accountId:"",contractId:"",invoiceDate:"",dueDate:"",billedAmount:0,collectedAmount:0,pendingAmount:0,status:"Current",paymentMode:"NEFT",paymentDate:"",remarks:"",owner:"u1"};
export const BLANK_TARGET={userId:"u1",period:"",product:"All",targetValue:0,achievedValue:0,targetDeals:0,achievedDeals:0,targetCalls:0,achievedCalls:0};

// ── Seed: Leads ──
export const INIT_LEADS = [
  {id:"ld1",company:"Vistara Airlines",contact:"Amit Khanna",email:"amit.k@vistara.in",phone:"+91-98765-11001",product:"WiseCargo",vertical:"Airline",region:"South Asia",source:"Inside Sales",stage:"MQL",assignedTo:"u1",notes:"Initial interest in cargo management. Reached via LinkedIn.",nextCall:"2026-03-25",score:45,createdDate:"2026-03-10",leadId:"#FL-2026-001",accountId:"",temperature:"Warm",designation:"VP Operations"},
  {id:"ld2",company:"JKIA Airport",contact:"David Mwangi",email:"d.mwangi@jkia.co.ke",phone:"+254-700111222",product:"WiseHandling",vertical:"Airport",region:"Africa",source:"Events",stage:"SQL",assignedTo:"u4",notes:"Met at AfriCargo expo. Interested in ground handling ops platform.",nextCall:"2026-03-22",score:68,createdDate:"2026-03-05",leadId:"#FL-2026-002",accountId:"",temperature:"Warm",designation:"Airport Director"},
  {id:"ld3",company:"SpiceJet Cargo",contact:"Neha Gupta",email:"neha.g@spicejet.com",phone:"+91-98765-11003",product:"WiseTrax",vertical:"Airline",region:"South Asia",source:"Direct Sales",stage:"SAL",assignedTo:"u2",notes:"Budget approved. Ready for demo. Convert to opportunity.",nextCall:"2026-03-21",score:82,createdDate:"2026-02-20",leadId:"#FL-2026-003",accountId:"",temperature:"Hot",designation:"Cargo Head"},
  {id:"ld4",company:"Astral Aviation",contact:"James Kamau",email:"j.kamau@astral.co.ke",phone:"+254-700333444",product:"WiseCargo",vertical:"Airline",region:"Africa",source:"Referrals",stage:"MQL",assignedTo:"u4",notes:"Referral from Kenya Airways. Freight airline needs cargo system.",nextCall:"2026-03-28",score:35,createdDate:"2026-03-15",leadId:"#FL-2026-004",accountId:"",temperature:"Cool",designation:"Operations Manager"},
  {id:"ld5",company:"Maersk India",contact:"Rohan Desai",email:"rohan.d@maersk.com",phone:"+91-98765-11005",product:"WiseCCS",vertical:"Ocean",region:"South Asia",source:"Social Media",stage:"SQL",assignedTo:"u5",notes:"LinkedIn inquiry about community cargo system for ocean freight.",nextCall:"2026-03-24",score:55,createdDate:"2026-03-01",leadId:"#FL-2026-005",accountId:"",temperature:"Warm",designation:"Regional Director"},
  {id:"ld6",company:"Kuehne+Nagel SA",contact:"Pierre van der Berg",email:"p.vdberg@kn.co.za",phone:"+27-82100-55001",product:"iCAFFE",vertical:"Forwarder",region:"Africa",source:"Development",stage:"MQL",assignedTo:"u4",notes:"Partner MPC identified opportunity in SA customs filing.",nextCall:"2026-04-01",score:30,createdDate:"2026-03-18",leadId:"#FL-2026-006",accountId:"",temperature:"Cool",designation:"Country Manager"},
  {id:"ld7",company:"AB Enterprises",contact:"Bikram Sen",email:"bikram@abent.in",phone:"+91-98765-11007",product:"iCAFFE",vertical:"CHA",region:"South Asia",source:"Support",stage:"NA",assignedTo:"u6",notes:"Existing customer support inquiry turned into new product interest. Not qualified yet.",nextCall:"",score:15,createdDate:"2026-03-12",leadId:"#FL-2026-007",accountId:"",temperature:"Cold",designation:"Owner"},
  {id:"ld8",company:"Flynas Cargo",contact:"Ahmed Al-Rashid",email:"a.rashid@flynas.com",phone:"+966-500111222",product:"WiseTrax",vertical:"Airline",region:"Middle East",source:"Inside Sales",stage:"SQL",assignedTo:"u1",notes:"Saudi airline looking for Type-B messaging solution. Good budget.",nextCall:"2026-03-26",score:72,createdDate:"2026-02-28",leadId:"#FL-2026-008",accountId:"",temperature:"Hot",designation:"VP IT"},
];

// ── Seed: Call Reports ──
export const INIT_CALL_REPORTS = [
  {id:"cr1",leadName:"Colossal Avia",company:"Colossal Avia",marketingPerson:"u4",leadStage:"SAL",callType:"Visit",product:"WiseHandling",callDate:"2026-03-19",notes:"Pre-GTM alignment visit. Nonku confirmed week of 31 Mar presentation. Data sovereignty flagged as concern – need in-country hosting option.",nextCallDate:"2026-03-25",objective:"General Followup",outcome:"Completed",contactId:"c6",accountId:"a6",oppId:"o1",duration:60},
  {id:"cr2",leadName:"RAM Handling",company:"RAM Handling (RAMH)",marketingPerson:"u4",leadStage:"SQL",callType:"Email",product:"WiseHandling",callDate:"2026-03-18",notes:"RFI response acknowledgement from Ahmed. Evaluation ongoing. Their procurement committee meets first Monday of each month.",nextCallDate:"2026-03-28",objective:"General Followup",outcome:"Completed",contactId:"c8",accountId:"a7",oppId:"o2",duration:0},
  {id:"cr3",leadName:"Air India Cargo",company:"Air India",marketingPerson:"u1",leadStage:"SAL",callType:"Web Call",product:"WiseTrax",callDate:"2026-03-17",notes:"Technical demo completed with IT team. They were impressed with Type-B gateway performance. Rajesh to share internal evaluation by next week. Budget freeze until April.",nextCallDate:"2026-03-31",objective:"Cross-Sales/New Info",outcome:"Completed",contactId:"c1",accountId:"a1",oppId:"o5",duration:60},
  {id:"cr4",leadName:"IndiGo Contract",company:"IndiGo Airlines",marketingPerson:"u2",leadStage:"SAL",callType:"Telephone Call",product:"WiseTrax",callDate:"2026-03-15",notes:"Contract review discussion. Legal reviewing NDA Clause 8 on data retention. Mohan says it should clear by 22 March. Digital signing via DocuSign.",nextCallDate:"2026-03-22",objective:"Renewal Followup",outcome:"Completed",contactId:"c3",accountId:"a2",oppId:"o6",duration:30},
  {id:"cr5",leadName:"Ethiopian Airlines",company:"Ethiopian Airlines Cargo",marketingPerson:"u4",leadStage:"MQL",callType:"Web Call",product:"WiseCargo",callDate:"2026-03-12",notes:"MPC facilitated discovery call. Getachew keen on cargo digitisation. Ethiopian operates 120+ weekly cargo flights. He is personally championing internally.",nextCallDate:"2026-04-10",objective:"Cross-Sales/New Info",outcome:"Completed",contactId:"c11",accountId:"a12",oppId:"o3",duration:90},
  {id:"cr6",leadName:"Allcargo CCS",company:"Allcargo Logistics",marketingPerson:"u5",leadStage:"SQL",callType:"Email",product:"WiseCCS",callDate:"2026-03-14",notes:"Sent proposal follow-up email. No response yet. Need to escalate through CIO Rajan Shah directly.",nextCallDate:"2026-03-21",objective:"Payment Followup",outcome:"Left Message",contactId:"c16",accountId:"a16",oppId:"o10",duration:0},
  {id:"cr7",leadName:"Vistara Inquiry",company:"Vistara Airlines",marketingPerson:"u1",leadStage:"MQL",callType:"LinkedIn",product:"WiseCargo",callDate:"2026-03-10",notes:"Amit Khanna connected on LinkedIn and expressed interest in cargo management system. Sent product brochure. Follow-up scheduled.",nextCallDate:"2026-03-25",objective:"General Followup",outcome:"Completed",contactId:"",accountId:"",oppId:"",duration:15},
  {id:"cr8",leadName:"JKIA Ground Ops",company:"JKIA Airport",marketingPerson:"u4",leadStage:"SQL",callType:"Visit",product:"WiseHandling",callDate:"2026-03-05",notes:"Met David at AfriCargo expo in Nairobi. JKIA looking for comprehensive ground handling ops platform. Budget available Q2 2026.",nextCallDate:"2026-03-22",objective:"Competition Info",outcome:"Completed",contactId:"",accountId:"",oppId:"",duration:45},
  {id:"cr9",leadName:"DIAL Renewal",company:"DIAL (Delhi Airport)",marketingPerson:"u5",leadStage:"SAL",callType:"Telephone Call",product:"WiseCargo",callDate:"2026-03-11",notes:"Deepak confirmed renewal + module upgrade. Legal already reviewed. PO expected within 2 weeks. Annual value increase of 15%.",nextCallDate:"2026-03-20",objective:"Renewal Followup",outcome:"Completed",contactId:"c4",accountId:"a3",oppId:"o8",duration:25},
  {id:"cr10",leadName:"Flynas Intro",company:"Flynas Cargo",marketingPerson:"u1",leadStage:"SQL",callType:"WhatsApp/Text",product:"WiseTrax",callDate:"2026-03-08",notes:"Ahmed shared requirements doc via WhatsApp. Saudi airline looking for SITA/ARINC Type-B messaging. Good budget available.",nextCallDate:"2026-03-26",objective:"General Followup",outcome:"Completed",contactId:"",accountId:"",oppId:"",duration:10},
];

// ── Seed: Contracts ──
export const INIT_CONTRACTS = [
  {id:"con1",title:"WiseDox Phase 2 – CBIC",accountId:"a10",oppId:"o11",product:"WiseDox",status:"Active",startDate:"2026-04-01",endDate:"2027-03-31",value:15,billTerm:"Quarterly",billType:"Development",approvalStage:"Finance",terms:"Net 30 days payment. Government pricing. Milestone-based delivery.",docType:"PO",owner:"u6",poNumber:"PO-CBIC-2026-0042",renewalDate:"2027-01-15"},
  {id:"con2",title:"WiseHandling Phase 3 – MIAL",accountId:"a5",oppId:"o14",product:"WiseHandling",status:"Active",startDate:"2026-03-15",endDate:"2027-03-14",value:28,billTerm:"Monthly",billType:"Deployment",approvalStage:"HOD",terms:"Monthly SLA billing. 99.5% uptime guarantee. Penalty clause for breaches.",docType:"Contract",owner:"u3",poNumber:"PO-MIAL-2026-118",renewalDate:"2027-01-01"},
  {id:"con3",title:"WiseTrax – IndiGo (Pending)",accountId:"a2",oppId:"o6",product:"WiseTrax",status:"Pending Approval",startDate:"2026-05-01",endDate:"2027-04-30",value:28,billTerm:"Yearly",billType:"Installation",approvalStage:"Vertical Head",terms:"Annual licensing. DocuSign for digital countersign. NDA Clause 8 under legal review.",docType:"EULA",owner:"u2",poNumber:"",renewalDate:"2027-03-01"},
  {id:"con4",title:"WiseCargo + WiseTrax – Air India",accountId:"a1",oppId:"",product:"WiseCargo",status:"Draft",startDate:"",endDate:"",value:35,billTerm:"Yearly",billType:"Renewals",approvalStage:"",terms:"Draft stage. Awaiting budget unfreeze in April.",docType:"Contract",owner:"u1",poNumber:"",renewalDate:""},
  {id:"con5",title:"iCAFFE Annual Renewal – CHA Association",accountId:"a18",oppId:"",product:"iCAFFE",status:"Active",startDate:"2025-10-01",endDate:"2026-09-30",value:11,billTerm:"Yearly",billType:"Renewals",approvalStage:"HOD",terms:"Annual platform licensing. Auto-renewal with 60-day notice.",docType:"Contract",owner:"u2",poNumber:"PO-CHA-2025-017",renewalDate:"2026-07-01"},
  {id:"con6",title:"WiseCargo Renewal – DIAL",accountId:"a3",oppId:"o8",product:"WiseCargo",status:"Pending Approval",startDate:"2026-04-15",endDate:"2027-04-14",value:22,billTerm:"Half-Yearly",billType:"Renewals",approvalStage:"Finance",terms:"Renewal with 15% uplift. New WiseCargo modules included.",docType:"Contract",owner:"u5",poNumber:"",renewalDate:"2027-02-01"},
];

// ── Seed: Collections ──
export const INIT_COLLECTIONS = [
  {id:"col1",invoiceNo:"INV-2026-001",accountId:"a10",contractId:"con1",invoiceDate:"2026-04-01",dueDate:"2026-05-01",billedAmount:3.75,collectedAmount:3.75,pendingAmount:0,status:"Current",paymentMode:"NEFT",paymentDate:"2026-04-28",remarks:"Q1 FY27 payment received on time.",owner:"u6"},
  {id:"col2",invoiceNo:"INV-2026-002",accountId:"a5",contractId:"con2",invoiceDate:"2026-03-15",dueDate:"2026-04-15",billedAmount:2.33,collectedAmount:0,pendingAmount:2.33,status:"Current",paymentMode:"",paymentDate:"",remarks:"First monthly invoice. Due 15 Apr.",owner:"u3"},
  {id:"col3",invoiceNo:"INV-2026-003",accountId:"a18",contractId:"con5",invoiceDate:"2025-10-01",dueDate:"2025-11-01",billedAmount:11,collectedAmount:8,pendingAmount:3,status:"Overdue",paymentMode:"Cheque",paymentDate:"2025-11-15",remarks:"Partial payment received. Balance of ₹3L pending since Nov 2025. Escalated to finance.",owner:"u2"},
  {id:"col4",invoiceNo:"INV-2026-004",accountId:"a8",contractId:"",invoiceDate:"2026-01-15",dueDate:"2026-02-15",billedAmount:2,collectedAmount:2,pendingAmount:0,status:"Current",paymentMode:"NEFT",paymentDate:"2026-02-10",remarks:"Quarterly support billing. Paid early.",owner:"u5"},
  {id:"col5",invoiceNo:"INV-2026-005",accountId:"a15",contractId:"",invoiceDate:"2025-12-01",dueDate:"2026-01-01",billedAmount:8,collectedAmount:5,pendingAmount:3,status:"Overdue",paymentMode:"Wire Transfer",paymentDate:"2026-01-20",remarks:"AIASL partial payment. ₹3L balance in dispute over SLA breach claim.",owner:"u3"},
  {id:"col6",invoiceNo:"INV-2026-006",accountId:"a9",contractId:"",invoiceDate:"2026-02-01",dueDate:"2026-03-01",billedAmount:1.25,collectedAmount:0,pendingAmount:1.25,status:"Overdue",paymentMode:"",paymentDate:"",remarks:"DHL payment overdue 19 days. Finance team sending reminder.",owner:"u5"},
  {id:"col7",invoiceNo:"INV-2026-007",accountId:"a16",contractId:"",invoiceDate:"2026-03-01",dueDate:"2026-04-01",billedAmount:1.75,collectedAmount:0,pendingAmount:1.75,status:"Current",paymentMode:"",paymentDate:"",remarks:"Allcargo Q4 billing. Due next month.",owner:"u5"},
  {id:"col8",invoiceNo:"INV-2026-008",accountId:"a4",contractId:"",invoiceDate:"2026-01-01",dueDate:"2026-02-01",billedAmount:1.5,collectedAmount:1.5,pendingAmount:0,status:"Current",paymentMode:"UPI",paymentDate:"2026-01-30",remarks:"CIAL quarterly payment. Collected on time.",owner:"u5"},
];

// ── Seed: Targets ──
export const INIT_TARGETS = [
  {id:"tgt1",userId:"u1",period:"2026-Q1",product:"All",targetValue:40,achievedValue:15,targetDeals:6,achievedDeals:2,targetCalls:60,achievedCalls:45},
  {id:"tgt2",userId:"u2",period:"2026-Q1",product:"iCAFFE",targetValue:20,achievedValue:8,targetDeals:4,achievedDeals:1,targetCalls:50,achievedCalls:38},
  {id:"tgt3",userId:"u3",period:"2026-Q1",product:"WiseHandling",targetValue:35,achievedValue:28,targetDeals:3,achievedDeals:2,targetCalls:40,achievedCalls:30},
  {id:"tgt4",userId:"u4",period:"2026-Q1",product:"All",targetValue:60,achievedValue:0,targetDeals:5,achievedDeals:0,targetCalls:45,achievedCalls:32},
  {id:"tgt5",userId:"u5",period:"2026-Q1",product:"WiseCargo",targetValue:30,achievedValue:22,targetDeals:4,achievedDeals:2,targetCalls:55,achievedCalls:42},
  {id:"tgt6",userId:"u6",period:"2026-Q1",product:"WiseDox",targetValue:18,achievedValue:15,targetDeals:2,achievedDeals:1,targetCalls:35,achievedCalls:28},
  {id:"tgt7",userId:"u1",period:"2025-Q4",product:"All",targetValue:35,achievedValue:30,targetDeals:5,achievedDeals:4,targetCalls:55,achievedCalls:52},
  {id:"tgt8",userId:"u4",period:"2025-Q4",product:"All",targetValue:50,achievedValue:12,targetDeals:4,achievedDeals:1,targetCalls:40,achievedCalls:35},
];

// ── Blanks for new modules ──
export const BLANK_QUOTE={title:"",accountId:"",oppId:"",contactId:"",product:"iCAFFE",items:[],subtotal:0,taxType:"GST 18%",taxAmount:0,discount:0,total:0,status:"Draft",validity:"30 Days",version:1,terms:"",owner:"u1",notes:"",createdDate:"",sentDate:"",expiryDate:""};
export const BLANK_QUOTE_ITEM={description:"",qty:1,unitPrice:0,amount:0};
export const BLANK_COMM_LOG={type:"Email Sent",subject:"",body:"",from:"",to:"",accountId:"",contactId:"",oppId:"",date:"",status:"Sent",owner:"u1"};
export const BLANK_EVENT={title:"",type:"Call",status:"Scheduled",date:"",time:"09:00",endTime:"09:30",accountId:"",contactId:"",oppId:"",owner:"u1",attendees:[],location:"",notes:"",reminderMin:15};

// ── Seed: Quotations ──
export const INIT_QUOTES = [
  {id:"qt1",title:"WiseHandling Full Deploy – Colossal Avia",accountId:"a6",oppId:"o1",contactId:"c6",product:"WiseHandling",items:[{description:"WiseHandling Enterprise License (Annual)",qty:1,unitPrice:180,amount:180},{description:"Implementation & Deployment",qty:1,unitPrice:35,amount:35},{description:"Training (5 sessions x 8 hrs)",qty:5,unitPrice:3,amount:15},{description:"Data Migration & Integration",qty:1,unitPrice:20,amount:20}],subtotal:250,taxType:"No Tax",taxAmount:0,discount:12,total:238,status:"Sent",validity:"30 Days",version:2,terms:"Payment due within 30 days of invoice date.\nImplementation timeline: 8-12 weeks from PO receipt.\nTraining included: 5 sessions (8 hours each).\nSLA: 99.5% uptime guarantee.\nData sovereignty: In-country hosting included.",owner:"u4",notes:"V2 sent after adjusting for data sovereignty requirement. Nonku reviewing.",createdDate:"2026-03-10",sentDate:"2026-03-15",expiryDate:"2026-04-14"},
  {id:"qt2",title:"WiseTrax Type-B Messaging – IndiGo",accountId:"a2",oppId:"o6",contactId:"c3",product:"WiseTrax",items:[{description:"WiseTrax Annual License",qty:1,unitPrice:22,amount:22},{description:"SITA/ARINC Gateway Setup",qty:1,unitPrice:4,amount:4},{description:"Integration with Cargo System",qty:1,unitPrice:2,amount:2}],subtotal:28,taxType:"GST 18%",taxAmount:5.04,discount:0,total:33.04,status:"Accepted",validity:"30 Days",version:1,terms:"Annual licensing. DocuSign for digital countersign.\nPayment due within 30 days.\nSupport: 24/7 for Critical issues.",owner:"u2",notes:"Accepted by Mohan. NDA Clause 8 cleared. PO expected by 22 Mar.",createdDate:"2026-02-28",sentDate:"2026-03-01",expiryDate:"2026-03-31"},
  {id:"qt3",title:"WiseDox Phase 2 – CBIC",accountId:"a10",oppId:"o11",contactId:"c14",product:"WiseDox",items:[{description:"WiseDox Enterprise – Phase 2 Modules",qty:1,unitPrice:10,amount:10},{description:"Custom Development (8 modules)",qty:8,unitPrice:0.5,amount:4},{description:"Annual Maintenance Contract",qty:1,unitPrice:1,amount:1}],subtotal:15,taxType:"GST 18%",taxAmount:2.7,discount:0,total:17.7,status:"Accepted",validity:"45 Days",version:1,terms:"Government pricing. Milestone-based delivery.\nNet 30 days payment.\nWarranty: 90 days post go-live.",owner:"u6",notes:"PO received. Contract activated.",createdDate:"2026-01-15",sentDate:"2026-01-20",expiryDate:"2026-03-05"},
  {id:"qt4",title:"WiseCCS Proposal – Allcargo",accountId:"a16",oppId:"o10",contactId:"c16",product:"WiseCCS",items:[{description:"WiseCCS Platform License",qty:1,unitPrice:8,amount:8},{description:"Community Portal Setup",qty:1,unitPrice:3,amount:3},{description:"API Integration Pack",qty:1,unitPrice:2,amount:2}],subtotal:13,taxType:"GST 18%",taxAmount:2.34,discount:1,total:14.34,status:"Under Review",validity:"30 Days",version:1,terms:"Payment due within 30 days.\nAnnual license with quarterly billing option.\nSLA: 99.5% uptime guarantee.",owner:"u5",notes:"Sent to CIO Rajan Shah. Awaiting response after follow-up email.",createdDate:"2026-03-05",sentDate:"2026-03-06",expiryDate:"2026-04-05"},
  {id:"qt5",title:"WiseCargo + WiseTrax – Air India",accountId:"a1",oppId:"o5",contactId:"c1",product:"WiseCargo",items:[{description:"WiseCargo Enterprise License",qty:1,unitPrice:20,amount:20},{description:"WiseTrax Add-on License",qty:1,unitPrice:10,amount:10},{description:"Integration & Migration",qty:1,unitPrice:5,amount:5}],subtotal:35,taxType:"GST 18%",taxAmount:6.3,discount:2,total:39.3,status:"Draft",validity:"60 Days",version:1,terms:"Draft stage. Awaiting budget unfreeze in April.\nAnnual licensing.\nTraining: 3 sessions included.",owner:"u1",notes:"Budget freeze until April. Draft ready to send once approved.",createdDate:"2026-03-18",sentDate:"",expiryDate:""},
];

// ── Seed: Communication Logs ──
export const INIT_COMM_LOGS = [
  {id:"cm1",type:"Email Sent",subject:"WiseHandling GTM Proposal – Colossal Avia",body:"Dear Nonku, Please find attached the revised proposal for WiseHandling deployment including in-country hosting...",from:"charles@hansinfomatic.com",to:"nonku@colossalavia.co.za",accountId:"a6",contactId:"c6",oppId:"o1",date:"2026-03-15 10:30",status:"Delivered",owner:"u4"},
  {id:"cm2",type:"Email Received",subject:"RE: WiseHandling GTM Proposal",body:"Hi Charles, We have reviewed the proposal. The data sovereignty clause addresses our concern. We will share feedback by 25 March...",from:"nonku@colossalavia.co.za",to:"charles@hansinfomatic.com",accountId:"a6",contactId:"c6",oppId:"o1",date:"2026-03-17 14:20",status:"Read",owner:"u4"},
  {id:"cm3",type:"WhatsApp Sent",subject:"Quick update on WiseTrax setup",body:"Hi Mohan, just checking – has the legal team cleared NDA Clause 8? We need to finalize the PO this week.",from:"Rahul Sharma",to:"Mohan Desai",accountId:"a2",contactId:"c3",oppId:"o6",date:"2026-03-18 09:15",status:"Read",owner:"u2"},
  {id:"cm4",type:"Email Sent",subject:"WiseCCS Platform – Follow-up",body:"Dear Mr. Shah, Following up on the WiseCCS proposal sent on 6 March. Would you be available for a brief call this week?",from:"vikram@hansinfomatic.com",to:"rajan.shah@allcargo.com",accountId:"a16",contactId:"c16",oppId:"o10",date:"2026-03-14 11:00",status:"Delivered",owner:"u5"},
  {id:"cm5",type:"WhatsApp Received",subject:"Flynas requirements",body:"Ahmed shared requirements document for Type-B messaging solution. Attached PDF with technical specifications.",from:"Ahmed Al-Rashid",to:"Shivbrata Bose",accountId:"",contactId:"",oppId:"",date:"2026-03-08 16:45",status:"Read",owner:"u1"},
  {id:"cm6",type:"Email Sent",subject:"WiseDox Phase 2 – Milestone Update",body:"Dear Suresh ji, Phase 2 Module 3 development is complete and ready for UAT. Please schedule testing window.",from:"aisha@hansinfomatic.com",to:"suresh.v@cbic.gov.in",accountId:"a10",contactId:"c14",oppId:"o11",date:"2026-03-19 15:30",status:"Delivered",owner:"u6"},
  {id:"cm7",type:"Email Received",subject:"RE: DIAL Renewal Discussion",body:"Hi Vikram, Deepak confirmed the 15% uplift is acceptable. PO will be issued within 2 weeks. Please prepare the contract.",from:"deepak.r@newdelhiairport.in",to:"vikram@hansinfomatic.com",accountId:"a3",contactId:"c4",oppId:"o8",date:"2026-03-12 10:00",status:"Read",owner:"u5"},
];

// ── Seed: Calendar Events ──
export const INIT_EVENTS = [
  {id:"ev1",title:"Colossal Avia – GTM Presentation",type:"Presentation",status:"Scheduled",date:"2026-03-31",time:"10:00",endTime:"12:00",accountId:"a6",contactId:"c6",oppId:"o1",owner:"u4",attendees:["u4","u1"],location:"Colossal Avia HQ, Johannesburg",notes:"Week of 31 Mar presentation. Prepare data sovereignty slides.",reminderMin:60},
  {id:"ev2",title:"IndiGo – Contract Signing Call",type:"Call",status:"Scheduled",date:"2026-03-22",time:"11:00",endTime:"11:30",accountId:"a2",contactId:"c3",oppId:"o6",owner:"u2",attendees:["u2"],location:"Web Call",notes:"Discuss PO timeline. NDA cleared.",reminderMin:30},
  {id:"ev3",title:"Allcargo – CCS Demo Follow-up",type:"Follow-up",status:"Scheduled",date:"2026-03-24",time:"14:00",endTime:"14:30",accountId:"a16",contactId:"c16",oppId:"o10",owner:"u5",attendees:["u5"],location:"Phone",notes:"Escalate through CIO directly. No response to emails.",reminderMin:15},
  {id:"ev4",title:"DIAL – Renewal Sign-off",type:"Meeting",status:"Scheduled",date:"2026-03-25",time:"15:00",endTime:"16:00",accountId:"a3",contactId:"c4",oppId:"o8",owner:"u5",attendees:["u5","u3"],location:"DIAL Office, New Delhi",notes:"Final renewal sign-off meeting. 15% uplift approved.",reminderMin:60},
  {id:"ev5",title:"Ethiopian Airlines – Discovery Call",type:"Demo",status:"Scheduled",date:"2026-04-10",time:"09:00",endTime:"10:30",accountId:"a12",contactId:"c11",oppId:"o3",owner:"u4",attendees:["u4","u1","u7"],location:"Web Call (Zoom)",notes:"Cargo digitization demo. Getachew is champion. 120+ weekly cargo flights.",reminderMin:60},
  {id:"ev6",title:"Air India – Budget Review",type:"Call",status:"Scheduled",date:"2026-04-01",time:"10:00",endTime:"10:30",accountId:"a1",contactId:"c1",oppId:"o5",owner:"u1",attendees:["u1"],location:"Phone",notes:"Check if April budget unfreeze happened. Ready to send proposal.",reminderMin:30},
  {id:"ev7",title:"Weekly Team Standup",type:"Meeting",status:"Scheduled",date:"2026-03-21",time:"09:30",endTime:"10:00",accountId:"",contactId:"",oppId:"",owner:"u1",attendees:["u1","u2","u3","u4","u5","u6"],location:"Office / Teams",notes:"Weekly pipeline review and activity check.",reminderMin:15},
  {id:"ev8",title:"CBIC – UAT Review",type:"Review",status:"Completed",date:"2026-03-19",time:"14:00",endTime:"15:30",accountId:"a10",contactId:"c14",oppId:"o11",owner:"u6",attendees:["u6","u7"],location:"CBIC Office",notes:"Phase 2 Module 3 UAT completed successfully.",reminderMin:30},
];

// ── Blank template for Internal Updates ──
export const BLANK_UPDATE = {
  id:"", updateId:"", title:"", description:"", category:"Announcement", priority:"Medium",
  tags:[], createdBy:"", createdAt:"", updatedAt:"",
  recipientMode:"org", recipientTeamIds:[], recipientUserIds:[],
  taggedUserIds:[], attachments:[], readStatus:{}, editHistory:[], archived:false,
};

// ── Seed: Internal Updates & Notifications ──
export const INIT_UPDATES = [
  {
    id:"upd1", updateId:"#UPD-2026-001",
    title:"Q1 FY26 Pipeline Review – Key Wins, At-Risk Deals & Action Plan",
    description:"Team,\n\nAs we close Q1 FY26, here is a summary of our pipeline performance:\n\n🏆 WINS THIS QUARTER:\n• WiseDox Phase 2 – CBIC (₹15L) – PO received, kickoff April 7\n• WiseHandling Phase 3 – MIAL (₹28L) – Live, fully deployed\n\n⚠️ AT-RISK DEALS (action required):\n• IndiGo – WiseTrax (₹28L): Legal review of NDA Clause 8 in final stage. Rahul to follow up by March 22.\n• DIAL – WiseCargo Renewal (₹22L): Close date April 15 – Vikram to confirm PO status.\n• Allcargo – WiseCCS (₹18L): No response post proposal. Vikram to escalate via CIO channel.\n\n📊 PIPELINE HEALTH:\nTotal active pipeline: ₹355L | Win probability weighted: ₹198L\n\nPlease review your deals and ensure CRM is updated before the BD call on March 25.\n\nRegards,\nShivbrata",
    category:"Sales Alert", priority:"High",
    tags:["q1","pipeline","wins","at-risk"],
    createdBy:"u1", createdAt:"2026-03-20T08:00:00.000Z", updatedAt:"2026-03-20T08:00:00.000Z",
    recipientMode:"org",
    recipientTeamIds:[], recipientUserIds:["u1","u2","u3","u4","u5","u6","u7","u8"],
    taggedUserIds:["u2","u5","u4"],
    attachments:[{name:"Q1-Pipeline-Summary.xlsx",type:"Excel",url:""}],
    readStatus:{"u1":"read","u5":"read","u7":"read"},
    editHistory:[], archived:false,
  },
  {
    id:"upd2", updateId:"#UPD-2026-002",
    title:"New Leave Policy – Effective April 1, 2026",
    description:"Dear All,\n\nPlease note the following updates to our Leave Policy effective April 1, 2026:\n\n1. CASUAL LEAVE: Increased from 10 to 12 days per year (pro-rated for joiners mid-year).\n\n2. WORK FROM HOME: Sales & BD team members may avail up to 2 WFH days per week, subject to manager approval. No WFH on client-facing days or demo days.\n\n3. COMP-OFF POLICY: Travel for client visits (outstation, 1+ nights) earns 1 comp-off per trip. Apply within 30 days.\n\n4. LEAVE APPLICATION: All leaves must now be applied through the HR portal at least 48 hours in advance (except medical emergencies).\n\nFor questions, reach out to the HR team.\n\nBest,\nHans Infomatic HR",
    category:"HR", priority:"Medium",
    tags:["hr","policy","leave","wfh"],
    createdBy:"u5", createdAt:"2026-03-18T10:30:00.000Z", updatedAt:"2026-03-18T10:30:00.000Z",
    recipientMode:"org",
    recipientTeamIds:[], recipientUserIds:["u1","u2","u3","u4","u5","u6","u7","u8"],
    taggedUserIds:[],
    attachments:[{name:"Leave-Policy-v3.pdf",type:"PDF",url:""}],
    readStatus:{"u1":"read","u2":"read","u5":"read","u6":"read"},
    editHistory:[], archived:false,
  },
  {
    id:"upd3", updateId:"#UPD-2026-003",
    title:"WiseCargo v4.2 Released – New Features & Customer Communication Guide",
    description:"Team,\n\nWiseCargo v4.2 has been released to production. Here's what's new:\n\n🆕 NEW FEATURES:\n• Auto-generate NOTOC from DG declaration (addresses TK-010)\n• Bulk AWB print optimised – now handles 500+ records without timeout (addresses TK-003)\n• Enhanced cargo manifest reconciliation module\n• New API endpoints for third-party ERP integration\n\n🐛 BUG FIXES:\n• Fixed duplicate TP detection flag (addresses TK-009)\n• Improved WiseTrax SITA session stability (partial fix for TK-004)\n\n📣 CUSTOMER COMMUNICATION:\nAll WiseCargo customers (Air India, Blue Dart, Ethiopian Airlines, Kenya Airways) should be notified by their respective account managers. Please use the attached email template.\n\nRelease notes PDF is attached.\n\nTanbir Ansari\nTech Lead",
    category:"Product Release", priority:"High",
    tags:["product","wisecargo","v4.2","release"],
    createdBy:"u7", createdAt:"2026-03-15T14:00:00.000Z", updatedAt:"2026-03-15T14:00:00.000Z",
    recipientMode:"org",
    recipientTeamIds:[], recipientUserIds:["u1","u2","u3","u4","u5","u6","u7","u8"],
    taggedUserIds:["u1","u5","u4"],
    attachments:[
      {name:"WiseCargo-v4.2-Release-Notes.pdf",type:"PDF",url:""},
      {name:"Customer-Notification-Template.docx",type:"Word",url:""},
    ],
    readStatus:{"u7":"read","u1":"read","u5":"read"},
    editHistory:[], archived:false,
  },
  {
    id:"upd4", updateId:"#UPD-2026-004",
    title:"South Africa Market Update – Colossal Avia GTM Approach",
    description:"Hi Charles & Shivbrata,\n\nA few operational notes ahead of the Colossal Avia GTM presentation on March 31:\n\n🌐 DATA SOVEREIGNTY:\nSouth African airports are National Key Points. All data must remain within ZA borders. MTN Business data centres in Johannesburg are confirmed capable of hosting our stack. Include this in the presentation slide 8.\n\n🤝 MPC PARTNERSHIP:\nMPC will introduce us formally. Do not negotiate pricing directly – route all commercial discussions through Charles. MPC is our GTM partner for Sub-Saharan Africa.\n\n📋 PREPARATION CHECKLIST:\n✅ Architecture diagram with ZA hosting highlighted\n✅ Reference customers (MIAL, DIAL) – India success story\n✅ WiseHandling live demo environment set up (Tanbir to confirm)\n✅ Pricing deck – approved version with data sovereignty addendum\n❌ Compliance document (due March 28 – Aisha to prepare)\n\nLet's nail this one.\n\nShivbrata",
    category:"Operations", priority:"Critical",
    tags:["south-africa","colossal","gtm","mpc"],
    createdBy:"u1", createdAt:"2026-03-19T16:00:00.000Z", updatedAt:"2026-03-21T09:00:00.000Z",
    recipientMode:"specific",
    recipientTeamIds:[], recipientUserIds:["u1","u4","u7","u6"],
    taggedUserIds:["u4","u7","u6"],
    attachments:[{name:"GTM-Colossal-Deck-v2.pptx",type:"PPT",url:""}],
    readStatus:{"u1":"read","u4":"read"},
    editHistory:[{at:"2026-03-21T09:00:00.000Z",by:"u1"}], archived:false,
  },
  {
    id:"upd5", updateId:"#UPD-2026-005",
    title:"CRM SmartCRM – Tips for Accurate Pipeline Forecasting",
    description:"Team,\n\nAs we roll out SmartCRM across the sales org, here are some key tips for accurate pipeline forecasting:\n\n📌 DEAL VALUE:\nAlways enter deal value in ₹ Lakhs. Do not include GST in the deal value – that's captured in the Quotation module.\n\n📌 CLOSE DATE:\nSet close date to the realistic expected PO date, not the quarter end. Inflated pipelines hurt credibility with leadership.\n\n📌 STAGE DISCIPLINE:\nDo not move a deal to 'Proposal' unless a written proposal has been sent. Demo Scheduled = demo is booked (not just discussed).\n\n📌 CALL REPORTS:\nLog every customer interaction (call, email, WhatsApp, visit) within 24 hours. This directly feeds the Activity timeline and helps the team stay aligned.\n\n📌 LEAD SCORING:\nFill in the Sales Questionnaire (BFA) for all leads in SQL stage. A score of 40+ is required to progress to SAL.\n\nFor any SmartCRM support, contact Tanbir.\n\nThanks,\nShivbrata",
    category:"General", priority:"Low",
    tags:["crm","process","pipeline","tips"],
    createdBy:"u1", createdAt:"2026-03-10T09:00:00.000Z", updatedAt:"2026-03-10T09:00:00.000Z",
    recipientMode:"org",
    recipientTeamIds:[], recipientUserIds:["u1","u2","u3","u4","u5","u6","u7","u8"],
    taggedUserIds:["u7"],
    attachments:[],
    readStatus:{"u1":"read","u2":"read","u3":"read","u5":"read","u6":"read","u7":"read","u8":"read"},
    editHistory:[], archived:false,
  },
];
