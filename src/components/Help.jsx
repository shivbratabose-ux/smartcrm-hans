import { useState, useMemo } from "react";
import {
  Search, HelpCircle, Rocket, Users, Building2, TrendingUp, Activity,
  Phone, Ticket, FileText, DollarSign, Target, BarChart3, SlidersHorizontal,
  Layers, Upload, Calendar, Mail, Bell, ClipboardList, UserPlus,
  ChevronRight, Lightbulb, AlertCircle, Info, CheckCircle, Keyboard,
  MessageSquare, BookOpen, Zap, Star, X
} from "lucide-react";

// ══════════════════════════════════════════════════════════════════════
// HELP CONTENT DATA
// ══════════════════════════════════════════════════════════════════════

// Section types: para | heading | list | steps | tip | warning | table | shortcut-group | note
const HELP_DATA = [
  // ── GETTING STARTED ──────────────────────────────────────────────
  {
    id:"getting-started", label:"Getting Started", icon:<Rocket size={15}/>, color:"#7C3AED",
    articles:[
      {
        id:"welcome", title:"Welcome to SmartCRM", tags:["intro","overview","start","welcome","crm"],
        content:[
          {type:"para", text:"SmartCRM by Hans Infomatic is a purpose-built Customer Relationship Management system for aviation, cargo, and logistics software sales. It manages your entire sales cycle — from the first lead to contract renewal — in one place."},
          {type:"heading", text:"What Can SmartCRM Do?"},
          {type:"list", items:[
            "Capture and qualify leads using a structured scoring questionnaire (BFA)",
            "Manage accounts, contacts, and the full opportunity pipeline",
            "Log calls, emails, meetings, and activities against any record",
            "Track support tickets with SLA monitoring",
            "Generate quotations with tax calculations",
            "Manage contracts, collections, and renewal tracking",
            "View rich reports: pipeline, revenue, call performance, stalled deals",
            "Post internal updates and announcements with read tracking",
            "Set targets and measure team achievement",
          ]},
          {type:"tip", text:"Quick start: Navigate using the left sidebar. Click any module to explore. Use Ctrl+1 through Ctrl+9 for instant keyboard navigation."},
        ]
      },
      {
        id:"navigation", title:"Navigating the Application", tags:["nav","sidebar","keyboard","shortcuts","hash","url"],
        content:[
          {type:"heading", text:"Sidebar Navigation"},
          {type:"list", items:[
            "Click any item in the left sidebar to switch pages instantly",
            "The sidebar collapses to icon-only view — click the « button at the top",
            "Badges (red/green numbers) on sidebar items show open tickets, active leads, overdue collections, and unread updates",
            "Your name and role appear at the bottom of the sidebar",
          ]},
          {type:"heading", text:"Header Bar"},
          {type:"list", items:[
            "🔍 Global Search — type any account, contact, deal, lead, or ticket name to jump to it instantly",
            "🔔 Bell icon — shows latest unread internal updates with a dropdown preview",
            "📊 Chart icon — quick shortcut to Reports",
            "Your avatar → Profile, Team & Settings, Sign Out",
          ]},
          {type:"heading", text:"Keyboard Shortcuts"},
          {type:"shortcut-group", items:[
            ["Ctrl + 1–9", "Jump to the 1st–9th sidebar item"],
            ["↑ / ↓ (in sidebar)", "Move focus between nav items"],
            ["Enter / Space", "Activate focused nav item"],
            ["Escape", "Close any modal or dropdown"],
            ["Enter (in form field)", "Save inline-edit field"],
          ]},
        ]
      },
      {
        id:"roles", title:"User Roles & Permissions", tags:["roles","access","permissions","admin","viewer"],
        content:[
          {type:"para", text:"SmartCRM uses a role-based permission system. Your role determines which modules you can view or edit."},
          {type:"table", rows:[
            ["Admin",        "Full system access, user management, all modules read/write"],
            ["MD",           "All data visibility, strategy-level access, most modules read/write"],
            ["Director",     "Full read/write on all modules, read on org/team"],
            ["Line Manager", "Team oversight, deals management, reports, read/write on most"],
            ["Country Mgr",  "Country-scoped accounts, pipeline, activities — read/write"],
            ["BD Lead",      "Cross-LOB BD, full sales access, read/write on contracts & collections"],
            ["Sales Exec",   "Own accounts, contacts, pipeline, activities — read-only tickets & leads"],
            ["Tech Lead",    "Technical modules, tickets full access, read-only on sales modules"],
            ["Support Engr", "Tickets full access, read-only on accounts and contacts"],
            ["Viewer",       "Read-only across all visible modules"],
          ]},
          {type:"tip", text:"Admins can customise permissions per role — or even override for individual users — in the Team & Users → Permissions tab."},
        ]
      },
      {
        id:"data-version", title:"Data & Sync", tags:["data","save","sync","supabase","localStorage","reset"],
        content:[
          {type:"heading", text:"How Data Is Saved"},
          {type:"list", items:[
            "All data is saved automatically to your browser's localStorage every time you make a change — no Save button needed",
            "If Supabase is configured, data also syncs to the cloud in real time",
            "Data persists across browser refreshes and tab closes",
          ]},
          {type:"heading", text:"Resetting Data"},
          {type:"warning", text:"To reset all data to factory defaults, open the browser console and run: window.__resetCRM(). This is irreversible — all your entered data will be lost."},
          {type:"heading", text:"Session Timeout"},
          {type:"para", text:"Sessions automatically expire after 30 minutes of inactivity. You will be redirected to the login page. Simply log back in — your data is not affected."},
        ]
      },
    ]
  },

  // ── LEADS ─────────────────────────────────────────────────────────
  {
    id:"leads", label:"Leads", icon:<UserPlus size={15}/>, color:"#2563EB",
    articles:[
      {
        id:"leads-overview", title:"Lead Management Overview", tags:["leads","mql","sql","sal","convert","stage","score"],
        content:[
          {type:"para", text:"The Leads module tracks potential customers from first contact through qualification and conversion to a sales opportunity. Every lead follows a structured lifecycle."},
          {type:"heading", text:"Lead Lifecycle Stages"},
          {type:"table", rows:[
            ["MQL", "Marketing Qualified Lead — basic info captured, product interest identified"],
            ["SQL", "Sales Qualified — email/phone known, pain points identified, score ≥ 40"],
            ["SAL", "Sales Accepted — budget known, decision maker identified, timeline set"],
            ["Converted", "Lead has been converted to a pipeline opportunity (score ≥ 60)"],
            ["N/A", "Lead is not applicable or disqualified"],
          ]},
          {type:"heading", text:"Stage Gates"},
          {type:"para", text:"Each stage has automatic gate checks. On the Convert tab of a lead, you will see a checklist of what must be completed before you can progress to the next stage. Gates cannot be bypassed — complete the required fields first."},
          {type:"tip", text:"The Lead Score (0–100) is calculated from the BFA Sales Questionnaire. A score of 40+ qualifies for SQL; 60+ enables conversion to opportunity."},
        ]
      },
      {
        id:"leads-editing", title:"Editing a Lead Inline", tags:["edit","inline","field","lead","click"],
        content:[
          {type:"heading", text:"Click-to-Edit Fields"},
          {type:"para", text:"Every field in the Lead Detail view is editable inline — no separate Edit mode needed. Simply click on any value to edit it immediately."},
          {type:"list", items:[
            "Click a text value → turns into a text input; press Enter or click away to save",
            "Click a dropdown value → turns into a select; choose and auto-saves",
            "Click a date value → turns into a date picker",
            "Click the Est. Value field → enter a number in ₹ Lakhs",
            "Click the Notes section → edit a rich textarea; click Save or press Ctrl+Enter",
          ]},
          {type:"heading", text:"Lead Detail Tabs"},
          {type:"list", items:[
            "Overview — all key fields, lead score, product interest, BFA questionnaire",
            "Contacts — link multiple contacts, assign roles to each",
            "Addresses — manage billing and shipping addresses",
            "Team — assign sales team members to this lead",
            "Activities — view and log calls/activities tied to this lead",
            "Documents — attach files and links (name + URL)",
            "Convert — stage gate checklist and conversion to opportunity",
          ]},
        ]
      },
      {
        id:"leads-convert", title:"Converting a Lead to Opportunity", tags:["convert","opportunity","pipeline","lead","stage"],
        content:[
          {type:"steps", items:[
            "Open the lead record and go to the Convert tab",
            "Check that all stage gate requirements are met (green checkmarks)",
            "Click Convert to Opportunity",
            "Fill in the conversion form: title, value, close date, products, account link",
            "Choose to keep the lead open (multi-LOB) or fully convert it",
            "The new opportunity appears instantly in the Pipeline",
          ]},
          {type:"tip", text:"Keeping a lead open (multi-LOB conversion) is useful when you are selling multiple products to the same company — each can become a separate opportunity while the lead record tracks the full relationship."},
          {type:"note", text:"All activities and call reports previously logged against the lead are automatically re-linked to the new opportunity on conversion."},
        ]
      },
      {
        id:"leads-bulk", title:"Bulk Uploading Leads (CSV)", tags:["bulk","csv","upload","import","leads"],
        content:[
          {type:"para", text:"You can import leads in bulk using a CSV file via the Bulk Upload module (Admin section in sidebar)."},
          {type:"heading", text:"Required CSV Columns"},
          {type:"table", rows:[
            ["company", "Company / account name (required)"],
            ["contact", "Contact person's name"],
            ["email",   "Contact email address"],
            ["phone",   "Contact phone number"],
            ["product", "Product of interest (e.g. WiseCargo)"],
            ["source",  "Lead source (e.g. Inside Sales, Referrals)"],
            ["country", "Country name"],
            ["score",   "Lead score 0–100 (optional, defaults to 30)"],
          ]},
          {type:"tip", text:"If a contact with the same email already exists, the lead will be linked to that contact automatically. If not, a new Contact record is created from the lead data."},
          {type:"warning", text:"Use a plain comma-separated CSV. If any field contains a comma, wrap it in double quotes. Excel exports are supported."},
        ]
      },
    ]
  },

  // ── ACCOUNTS ──────────────────────────────────────────────────────
  {
    id:"accounts", label:"Accounts", icon:<Building2 size={15}/>, color:"#16A34A",
    articles:[
      {
        id:"accounts-overview", title:"Account Management Overview", tags:["accounts","customer","account","health","segment","hierarchy"],
        content:[
          {type:"para", text:"Accounts represent your customer companies. Each account aggregates contacts, deals, activities, contracts, collections, and support tickets in a single 360° view."},
          {type:"heading", text:"Account Profile Tabs"},
          {type:"table", rows:[
            ["Overview",     "Health score, ARR, key stats, products, owner"],
            ["Contacts",     "All people linked to this account — click to navigate to Contacts module"],
            ["Deals",        "All opportunities for this account — click to navigate to Pipeline"],
            ["Activities",   "Full activity timeline for this account"],
            ["Tickets",      "Support tickets raised for this account"],
            ["Contracts",    "Contracts linked to this account"],
            ["Collections",  "Outstanding payments and collection status"],
            ["Notes & Docs", "Internal notes and document links"],
          ]},
          {type:"heading", text:"Account Health Score"},
          {type:"para", text:"The Health Score (0–100) is calculated automatically from: open tickets (−10 per critical), pending collections (−15 per overdue), recent activities (+15 for active, +20 for 2+ activities), products in use (+5 each), open pipeline (positive signal). It is re-calculated on every page load."},
          {type:"tip", text:"Accounts with a Health Score below 50 appear as 'At Risk'. Address open tickets and overdue collections to improve the score."},
        ]
      },
      {
        id:"accounts-hierarchy", title:"Account Hierarchy", tags:["hierarchy","parent","subsidiary","branch"],
        content:[
          {type:"para", text:"SmartCRM supports multi-level account hierarchies — useful for large enterprise customers with subsidiaries, branches, or country entities."},
          {type:"list", items:[
            "When creating or editing an account, set the Parent Account field to link it",
            "The Hierarchy Level field describes the node type: Parent Company, Subsidiary, Branch, Department, Office, or Country Entity",
            "The Hierarchy Path shows the full ancestor chain (auto-generated)",
            "In the Organisation module, you can visualise the full corporate tree",
          ]},
        ]
      },
    ]
  },

  // ── CONTACTS ──────────────────────────────────────────────────────
  {
    id:"contacts", label:"Contacts", icon:<Users size={15}/>, color:"#0D9488",
    articles:[
      {
        id:"contacts-overview", title:"Managing Contacts", tags:["contacts","role","email","phone","link","opp"],
        content:[
          {type:"para", text:"Contacts are people at your customer accounts. Each contact can be linked to multiple opportunities and appear in activity logs, call reports, and email communications."},
          {type:"heading", text:"Contact Fields"},
          {type:"table", rows:[
            ["Designation",   "Job title within the company"],
            ["Department",    "Finance, IT, Operations, Management, etc."],
            ["Role",          "CRM-specific role: Decision Maker, Influencer, End User, etc."],
            ["Disposition",   "Favourable / Neutral / Unfavourable — tracks sentiment"],
            ["Products",      "Which Hans Infomatic products they use or evaluate"],
            ["Linked Deals",  "Which opportunities they are involved in"],
          ]},
          {type:"tip", text:"Marking a contact as Primary on an account means they are the go-to person for account-level communication. Each account can have one primary contact."},
          {type:"heading", text:"Linking Contacts to Leads & Opportunities"},
          {type:"list", items:[
            "From a Lead record → Contacts tab: search and link existing contacts, or create new ones",
            "From a Lead record → Convert tab: assign roles to contacts during conversion",
            "From a Pipeline deal record: set Primary Contact and Secondary Contacts",
          ]},
        ]
      },
    ]
  },

  // ── PIPELINE ──────────────────────────────────────────────────────
  {
    id:"pipeline", label:"Pipeline", icon:<TrendingUp size={15}/>, color:"#7C3AED",
    articles:[
      {
        id:"pipeline-overview", title:"Pipeline & Opportunities", tags:["pipeline","opportunity","stage","deal","kanban","forecast"],
        content:[
          {type:"para", text:"The Pipeline module manages all sales opportunities. View them as a Kanban board (by stage) or as a table. Click any deal card to open the full detail view."},
          {type:"heading", text:"Pipeline Views"},
          {type:"list", items:[
            "Board view — vertical Kanban columns by stage, drag cards between stages",
            "Table view — sortable rows with all key fields visible at once",
            "Switch using the 'Board / Table' toggle buttons in the header",
          ]},
          {type:"heading", text:"Opportunity Stages"},
          {type:"table", rows:[
            ["Lead Identified",       "10%  — Initial identification, no contact yet"],
            ["Contacted",             "25%  — First contact made"],
            ["Qualification (BFA)",   "30%  — Needs assessment in progress"],
            ["Demo Scheduled",        "40%  — Demo booked"],
            ["Solution Development",  "60%  — Proposal being built"],
            ["Proposal Submission",   "60%  — Proposal sent to customer"],
            ["Pricing & Negotiation", "75%  — Commercial negotiation underway"],
            ["Decision Pending",      "90%  — Decision imminent"],
            ["Closed Won",            "100% — Deal won!"],
            ["Closed Lost",           "0%   — Deal lost"],
            ["Suspended",             "0%   — On hold (2-3m / 3-6m / 6m+ / Nurturing)"],
          ]},
        ]
      },
      {
        id:"pipeline-editing", title:"Editing Deal Values Inline", tags:["edit","value","deal","stage","close date","probability"],
        content:[
          {type:"para", text:"Deal details can be edited directly inside the Deal Detail panel — no need to open a separate edit form for quick changes."},
          {type:"list", items:[
            "Click the value in '₹ Value (Lakhs)' row → type new number, press Enter",
            "Click the Probability row → type new percentage",
            "Click the Stage row → choose from dropdown",
            "Click the Close Date row → pick a new date",
            "Use the Edit button (pencil icon) for editing all other fields like title, contacts, notes",
          ]},
          {type:"tip", text:"Changes to stage, value, and probability reflect immediately in the Dashboard pipeline chart and Reports — no page refresh needed."},
        ]
      },
      {
        id:"pipeline-forecast", title:"Forecast & Deal Categories", tags:["forecast","best case","likely","worst case","deal size"],
        content:[
          {type:"heading", text:"Forecast Categories"},
          {type:"table", rows:[
            ["Best-Case",     "Optimistic scenario — all deals in play"],
            ["Likely-Case",   "Realistic mid-point estimate"],
            ["Worst-Case",    "Conservative — only high-confidence deals"],
            ["Not Applicable","Deal not included in forecast"],
          ]},
          {type:"heading", text:"Deal Size"},
          {type:"list", items:[
            "Small — typically < ₹10L, short sales cycle",
            "Medium — ₹10L–₹50L, standard sales process",
            "Large Enterprise — ₹50L+, complex multi-stakeholder deals",
          ]},
          {type:"note", text:"Forecast Category and Deal Size are used in the Reports module's pipeline summary and weighted value calculations."},
        ]
      },
    ]
  },

  // ── ACTIVITIES ────────────────────────────────────────────────────
  {
    id:"activities", label:"Activities", icon:<Activity size={15}/>, color:"#D97706",
    articles:[
      {
        id:"activities-overview", title:"Activity Logging", tags:["activity","call","email","meeting","log","timeline"],
        content:[
          {type:"para", text:"Activities track every customer interaction — calls, emails, meetings, demos, site visits, and more. They appear on account timelines, lead timelines, and opportunity views."},
          {type:"heading", text:"Activity Types"},
          {type:"list", items:["Call","Email","Meeting","Demo","WhatsApp","LinkedIn","Site Visit","Presentation","Conference"]},
          {type:"heading", text:"Logging an Activity"},
          {type:"steps", items:[
            "Go to Activities page, or open the Quick Log FAB (bottom-right + button)",
            "Click + Log Activity",
            "Select type, date, time, duration, outcome",
            "Link to an Account, Contact, Opportunity, or Lead",
            "Add notes and click Save",
          ]},
          {type:"tip", text:"The Quick Log FAB (green + button, bottom-right of every page) lets you log a call or activity from any page without losing your current view."},
        ]
      },
      {
        id:"activities-today", title:"Today's Activity Dashboard", tags:["today","daily","count","yesterday"],
        content:[
          {type:"para", text:"The Activities page header shows today's interaction count compared to yesterday. This real-time comparison helps track daily call discipline."},
          {type:"list", items:[
            "Green badge = more activity than yesterday",
            "Amber badge = same as yesterday",
            "Red/neutral = fewer or no data to compare",
          ]},
          {type:"tip", text:"Use the Calendar module to plan future activities as Events — they appear on the calendar view and can be marked complete after the meeting."},
        ]
      },
    ]
  },

  // ── CALL REPORTS ──────────────────────────────────────────────────
  {
    id:"callreports", label:"Call Reports", icon:<Phone size={15}/>, color:"#16A34A",
    articles:[
      {
        id:"callreports-overview", title:"Call Reports Overview", tags:["call","report","log","objective","outcome","bulk"],
        content:[
          {type:"para", text:"Call Reports are structured logs for customer interactions — more detailed than Activities. They capture call type, objective, outcome, next steps, and follow-up actions."},
          {type:"heading", text:"Call Types"},
          {type:"list", items:["Telephone Call","Visit","Web Call","WhatsApp/Text","Email","LinkedIn"]},
          {type:"heading", text:"Call Objectives"},
          {type:"list", items:["Maintenance/QBR","Maintenance/MBR","Issue Resolution","Renewal Followup","Payment Followup","Cross-Sales/New Offer","Training/Feature Adoption","VOC/Testimonials","Competition Info","General Followup"]},
          {type:"tip", text:"Assign a Next Call Date when logging a call — this auto-populates a follow-up reminder and keeps your pipeline moving forward."},
          {type:"heading", text:"Bulk Delete"},
          {type:"para", text:"Select multiple call reports using the checkboxes, then click the Bulk Delete button. A confirmation dialog will appear before deletion."},
        ]
      },
    ]
  },

  // ── TICKETS ───────────────────────────────────────────────────────
  {
    id:"tickets", label:"Support Tickets", icon:<Ticket size={15}/>, color:"#DC2626",
    articles:[
      {
        id:"tickets-overview", title:"Support Ticket Management", tags:["ticket","support","sla","priority","status","escalation"],
        content:[
          {type:"para", text:"The Tickets module tracks all customer-raised support issues, new development requests, enhancements, and integration problems."},
          {type:"heading", text:"Ticket Statuses"},
          {type:"table", rows:[
            ["Open",             "Newly created, not yet picked up"],
            ["In Progress",      "Being actively worked on"],
            ["Pending QA",       "Fix complete, in quality assurance"],
            ["Pending Customer", "Waiting for customer response or test data"],
            ["Resolved",         "Solution delivered — awaiting customer confirmation"],
            ["Closed",           "Formally closed by customer or auto after 7 days"],
          ]},
          {type:"heading", text:"SLA Response Times"},
          {type:"table", rows:[
            ["Critical", "4 hours — system down, data loss, blocking operations"],
            ["High",     "8 hours — major functionality impaired"],
            ["Medium",   "24 hours — partial functionality affected"],
            ["Low",      "48 hours — cosmetic or minor issue"],
          ]},
          {type:"warning", text:"Critical tickets trigger the red notification dot on the Bell icon in the header. They must be acknowledged within 4 hours per SLA."},
        ]
      },
    ]
  },

  // ── CONTRACTS ─────────────────────────────────────────────────────
  {
    id:"contracts", label:"Contracts", icon:<FileText size={15}/>, color:"#0D9488",
    articles:[
      {
        id:"contracts-overview", title:"Contract Management", tags:["contract","renewal","status","expiry","approval"],
        content:[
          {type:"para", text:"Contracts tracks all signed agreements, their renewal dates, approval status, and billing terms. Contracts link to accounts and opportunities."},
          {type:"heading", text:"Contract Statuses"},
          {type:"table", rows:[
            ["Draft",            "Being prepared — not yet sent for approval"],
            ["Pending Approval", "In internal approval workflow"],
            ["Active",           "Signed and in force"],
            ["Expired",          "End date has passed — renewal needed"],
            ["Terminated",       "Contract ended early"],
          ]},
          {type:"heading", text:"Renewal Alerts"},
          {type:"para", text:"The Contracts list highlights contracts expiring within 30 days in amber, and those already expired in red. The Dashboard also shows renewal risk counts."},
          {type:"tip", text:"Set up a Call Report with Objective = 'Renewal Followup' at least 60 days before contract expiry to start the renewal conversation early."},
        ]
      },
    ]
  },

  // ── COLLECTIONS ───────────────────────────────────────────────────
  {
    id:"collections", label:"Collections", icon:<DollarSign size={15}/>, color:"#DC2626",
    articles:[
      {
        id:"collections-overview", title:"Collections & Receivables", tags:["collections","payment","overdue","ageing","invoice"],
        content:[
          {type:"para", text:"Collections tracks outstanding payments from customers — invoices sent, amounts pending, ageing buckets, and collection status."},
          {type:"heading", text:"Ageing Buckets"},
          {type:"list", items:["0–30 days (current)","30–60 days","60–90 days","90–120 days","120–180 days","180+ days (critical)"]},
          {type:"heading", text:"Collection Statuses"},
          {type:"table", rows:[
            ["Current",     "Within payment terms, not yet due"],
            ["Overdue",     "Past due date — action required"],
            ["Escalated",   "Escalated to management or legal"],
            ["Written Off", "Amount deemed uncollectable"],
          ]},
          {type:"warning", text:"Overdue collections appear as a red badge on the Collections sidebar item. Each overdue entry also negatively impacts the linked account's Health Score."},
        ]
      },
    ]
  },

  // ── QUOTATIONS ────────────────────────────────────────────────────
  {
    id:"quotations", label:"Quotations", icon:<ClipboardList size={15}/>, color:"#7C3AED",
    articles:[
      {
        id:"quotations-overview", title:"Creating Quotations", tags:["quote","quotation","tax","gst","discount","item","pdf"],
        content:[
          {type:"para", text:"The Quotations module lets you build professional quote documents for your deals, with line items, tax calculations, and discount tracking."},
          {type:"steps", items:[
            "Click + New Quotation",
            "Select Account, Opportunity, and Contact",
            "Choose Product and set Validity period",
            "Add line items — description, quantity, unit price (auto-calculates amount)",
            "Set Tax Type (GST 18%, 12%, 5%, No Tax) — tax amount calculated automatically",
            "Apply a discount if applicable",
            "Set Status (Draft → Sent → Under Review → Accepted / Rejected / Expired)",
            "Save the quotation",
          ]},
          {type:"tip", text:"Accepted quotations should be linked to a Contract record. When a deal is marked Won, the linked quotation automatically moves to Accepted status."},
          {type:"heading", text:"Standard Terms"},
          {type:"para", text:"The quotation form includes standard terms presets (payment terms, SLA, training, data migration) that you can select and customise for each deal."},
        ]
      },
    ]
  },

  // ── CALENDAR ──────────────────────────────────────────────────────
  {
    id:"calendar", label:"Calendar", icon:<Calendar size={15}/>, color:"#2563EB",
    articles:[
      {
        id:"calendar-overview", title:"Calendar & Events", tags:["calendar","event","reminder","schedule","meeting"],
        content:[
          {type:"para", text:"The Calendar provides a visual monthly view of all scheduled events — meetings, demos, calls, presentations, and follow-ups."},
          {type:"list", items:[
            "Click any day cell to see events on that day",
            "Click + Add Event to schedule a new event",
            "Link events to Accounts, Contacts, and Opportunities",
            "Set attendees (team members) and location",
            "Set reminder minutes (15, 30, 60 mins before)",
            "Today is highlighted in the calendar view",
          ]},
          {type:"tip", text:"Events sync with Activities — a completed event can be logged as an Activity for full timeline tracking on the account and opportunity."},
        ]
      },
    ]
  },

  // ── TARGETS ───────────────────────────────────────────────────────
  {
    id:"targets", label:"Targets", icon:<Target size={15}/>, color:"#D97706",
    articles:[
      {
        id:"targets-overview", title:"Target vs Achievement", tags:["target","kpi","achievement","quarter","period","revenue"],
        content:[
          {type:"para", text:"The Targets module sets quarterly KPIs for each team member and tracks real-time achievement."},
          {type:"heading", text:"Target Metrics"},
          {type:"table", rows:[
            ["Target Value (₹L)", "Revenue target for the period"],
            ["Achieved Value",    "Actual revenue closed (won deals)"],
            ["Target Deals",     "Number of deals to close"],
            ["Achieved Deals",   "Actual won deals in period"],
            ["Target Calls",     "Number of customer interactions"],
            ["Achieved Calls",   "Actual logged activities/call reports"],
          ]},
          {type:"tip", text:"Targets are per user, per period (Q1 2026, Q4 2025, etc.), and per product line. You can set 'All' as the product for overall targets."},
        ]
      },
    ]
  },

  // ── REPORTS ───────────────────────────────────────────────────────
  {
    id:"reports", label:"Reports & Analytics", icon:<BarChart3 size={15}/>, color:"#2563EB",
    articles:[
      {
        id:"reports-overview", title:"Reports Overview", tags:["reports","analytics","pipeline","revenue","forecast","stalled"],
        content:[
          {type:"para", text:"The Reports module provides 6 analytical views of your CRM data, recalculated live from the latest data on every visit."},
          {type:"table", rows:[
            ["Pipeline Summary",   "Stage-wise deal count, value, and weighted forecast"],
            ["Revenue Analytics",  "Won vs pipeline, monthly trends, product breakdown"],
            ["Activity Analysis",  "Call/meeting counts by user, type, and period"],
            ["Support Analytics",  "Ticket volume, SLA compliance, resolution times"],
            ["Collections Report", "Overdue amounts, ageing analysis, at-risk accounts"],
            ["Stalled Deals",      "Opportunities with no activity for 14+ days"],
          ]},
          {type:"tip", text:"The Stalled Deals list in Reports flags any active deal with no logged activity in 14 days. Use this list to prioritise outreach and keep deals moving."},
          {type:"note", text:"All report data is computed live — there is no cached or scheduled report generation. The data is always current as of your last CRM entry."},
        ]
      },
    ]
  },

  // ── UPDATES ───────────────────────────────────────────────────────
  {
    id:"updates", label:"Internal Updates", icon:<Bell size={15}/>, color:"#7C3AED",
    articles:[
      {
        id:"updates-overview", title:"Internal Updates & Notifications", tags:["updates","announcement","notification","post","read","unread"],
        content:[
          {type:"para", text:"Internal Updates is the company's structured internal communication channel — for announcements, policy changes, product releases, sales alerts, and HR notices. It is not a chat tool."},
          {type:"heading", text:"Who Can Post?"},
          {type:"list", items:[
            "Admin, MD, Director, Line Manager, Country Manager, BD Lead, Tech Lead can post updates",
            "All users can read updates addressed to them",
            "Admins, MD, and Directors can archive any update",
          ]},
          {type:"heading", text:"Recipient Modes"},
          {type:"table", rows:[
            ["Entire Org",      "Update goes to all active users"],
            ["Specific Users",  "Handpick exactly who receives this update"],
          ]},
          {type:"tip", text:"When you open a card in the feed, it is automatically marked as Read. The unread count on the sidebar badge and bell dropdown updates immediately."},
          {type:"heading", text:"Read Tracking"},
          {type:"para", text:"Click the 'Read Tracking' tab inside any update to see exactly who has read the update and who hasn't — useful for policy acknowledgement and critical announcements."},
        ]
      },
    ]
  },

  // ── MASTERS ───────────────────────────────────────────────────────
  {
    id:"masters", label:"Masters & Settings", icon:<SlidersHorizontal size={15}/>, color:"#64748B",
    articles:[
      {
        id:"masters-reference", title:"Reference Data", tags:["masters","reference","stage","activity","type","country","priority"],
        content:[
          {type:"para", text:"The Masters module lets Admins manage the picklist values used across all modules — so your dropdown options stay clean and relevant."},
          {type:"table", rows:[
            ["Activity Types",          "Types available when logging activities"],
            ["Deal Stages",             "Custom pipeline stages with probability %"],
            ["Customer Types",          "Account classification categories"],
            ["Countries",               "Countries list with region grouping"],
            ["Priorities",              "Priority levels used in tickets and updates"],
            ["Ticket Types",            "Support ticket categories"],
            ["Call Types",              "Call log interaction types"],
            ["Call Subjects/Objectives","Objectives dropdown in call reports"],
          ]},
          {type:"tip", text:"Changes to Master data propagate immediately — new options appear in all dropdowns across the app without any refresh."},
        ]
      },
      {
        id:"masters-catalog", title:"Product Catalogue", tags:["product","catalogue","module","addon","integration","wisecargo"],
        content:[
          {type:"para", text:"The Product Catalogue manages Hans Infomatic's product lines and their sub-products, modules, and add-ons."},
          {type:"heading", text:"Module Types"},
          {type:"table", rows:[
            ["Core",        "Primary product functionality"],
            ["Add-on",      "Optional feature extensions"],
            ["Integration", "Third-party system connectors"],
            ["Analytics",   "Reporting and data intelligence modules"],
            ["Mobile",      "Mobile application components"],
          ]},
          {type:"tip", text:"Keeping the product catalogue up to date ensures that Quotations, Leads, and Opportunities always reflect the latest product offerings."},
        ]
      },
    ]
  },

  // ── BULK UPLOAD ───────────────────────────────────────────────────
  {
    id:"bulkupload", label:"Bulk Upload", icon:<Upload size={15}/>, color:"#D97706",
    articles:[
      {
        id:"bulkupload-overview", title:"Bulk Upload Guide", tags:["bulk","csv","upload","import","format","contact","account"],
        content:[
          {type:"para", text:"The Bulk Upload module lets you import large datasets via CSV files. It supports Leads, Customers (Accounts), Contacts, Collections, Support Tickets, and Contracts."},
          {type:"steps", items:[
            "Select the data type from the dropdown (Leads, Customers, Contacts, etc.)",
            "Click 'Download Template' to get the correct column headers",
            "Fill in your data using Excel or any spreadsheet app",
            "Save as CSV (Comma Separated Values)",
            "Click Upload CSV and select your file",
            "Review the preview table — check rows and counts",
            "Click Import to save all records",
          ]},
          {type:"warning", text:"Always use the downloaded template — column names must match exactly. Do not add or rename columns."},
          {type:"tip", text:"For Leads and Contacts, if a matching email already exists in the system, the record will be linked (not duplicated). For Accounts, matching is by company name."},
          {type:"note", text:"CSV files with commas inside field values must wrap those fields in double-quotes. Excel's 'Save As CSV' handles this automatically."},
        ]
      },
    ]
  },

  // ── ORG & TEAM ────────────────────────────────────────────────────
  {
    id:"org-team", label:"Org & Team", icon:<Layers size={15}/>, color:"#64748B",
    articles:[
      {
        id:"org-overview", title:"Organisation Structure", tags:["org","organisation","hierarchy","tree","branch","department"],
        content:[
          {type:"para", text:"The Organisation module displays your company's structure as a visual interactive tree — branches, departments, and reporting lines."},
          {type:"list", items:[
            "Expand/collapse nodes by clicking the toggle arrow",
            "Add child nodes under any existing branch or department",
            "Each node stores: name, type, head, location, employee count",
            "The tree is purely informational and does not affect permissions",
          ]},
        ]
      },
      {
        id:"team-users", title:"Team & User Management", tags:["team","user","permission","role","password","active"],
        content:[
          {type:"para", text:"The Team & Users module lets Admins manage user accounts, assign roles, adjust permissions, and reset passwords."},
          {type:"heading", text:"Managing Users"},
          {type:"list", items:[
            "Create new users with name, email, role, LOB, branch, department",
            "Deactivate a user to prevent login without deleting their records",
            "Reset user passwords (all users default to hans@2026)",
            "View login history and last active dates",
          ]},
          {type:"heading", text:"Custom Permissions"},
          {type:"para", text:"In the Permissions tab, override the default role-based permissions for any module — either for an entire role or for a specific individual. Role overrides apply to all users with that role; individual overrides take priority."},
          {type:"warning", text:"Only Admins can access Team & Users. Changes to permissions take effect immediately on the user's next page navigation."},
        ]
      },
    ]
  },

  // ── FAQ ───────────────────────────────────────────────────────────
  {
    id:"faq", label:"FAQ & Troubleshooting", icon:<MessageSquare size={15}/>, color:"#DC2626",
    articles:[
      {
        id:"faq-general", title:"Frequently Asked Questions", tags:["faq","help","error","bug","lost","data","fix"],
        content:[
          {type:"heading", text:"Why can't I see some modules in the sidebar?"},
          {type:"para", text:"Module visibility is controlled by your user role. Sales Executives cannot see Org or Team modules. Viewers cannot access Reports. Contact your Admin to adjust your role or permissions."},
          {type:"heading", text:"My changes aren't saving — what's wrong?"},
          {type:"para", text:"SmartCRM saves data automatically to your browser's localStorage. If changes aren't persisting, check that you haven't exceeded your browser's storage limit (usually 5–10MB). Try clearing old browser data or using a different browser."},
          {type:"heading", text:"How do I undo a deletion?"},
          {type:"warning", text:"Deletions are permanent — there is no undo. Always use the Confirm dialog carefully. If you deleted an account, all linked contacts, deals, activities, and tickets are also removed (cascade delete)."},
          {type:"heading", text:"Why do some contacts/leads show '?' as the user avatar?"},
          {type:"para", text:"This happens when a record references a user ID that no longer exists (e.g. a deleted user). The '?' pill still shows the user ID for reference. Re-assign ownership to fix this."},
          {type:"heading", text:"The Lead Score isn't updating after I filled in the questionnaire"},
          {type:"para", text:"The Lead Score is recalculated live when you open the Lead Detail. Try clicking away and reopening the lead. If the BFA questionnaire fields are filled correctly, the score should reflect immediately."},
          {type:"heading", text:"Can I export data to Excel?"},
          {type:"para", text:"Direct export is not yet available in this version. You can use the browser's developer console to access window.__crmAudit() for a data summary. Full CSV export is planned for a future release."},
        ]
      },
    ]
  },

  // ── SHORTCUTS ─────────────────────────────────────────────────────
  {
    id:"shortcuts", label:"Keyboard Shortcuts", icon:<Keyboard size={15}/>, color:"#2563EB",
    articles:[
      {
        id:"shortcuts-all", title:"All Keyboard Shortcuts", tags:["keyboard","shortcut","ctrl","escape","arrow"],
        content:[
          {type:"heading", text:"Navigation"},
          {type:"shortcut-group", items:[
            ["Ctrl + 1", "Dashboard"],
            ["Ctrl + 2", "Updates"],
            ["Ctrl + 3", "Leads"],
            ["Ctrl + 4", "Accounts"],
            ["Ctrl + 5", "Contacts"],
            ["Ctrl + 6", "Pipeline"],
            ["Ctrl + 7", "Activities"],
            ["Ctrl + 8", "Call Reports"],
            ["Ctrl + 9", "Calendar"],
          ]},
          {type:"heading", text:"Sidebar Focus"},
          {type:"shortcut-group", items:[
            ["↑ / ↓ in sidebar", "Move between nav items"],
            ["Enter or Space", "Go to focused page"],
          ]},
          {type:"heading", text:"Inline Editing"},
          {type:"shortcut-group", items:[
            ["Click any value", "Enter edit mode for that field"],
            ["Enter", "Save the current inline edit"],
            ["Escape", "Cancel the current inline edit"],
            ["Tab", "Move to next field (in forms/modals)"],
          ]},
          {type:"heading", text:"Modals & Dialogs"},
          {type:"shortcut-group", items:[
            ["Escape", "Close the current modal"],
            ["Enter (in last field)", "Submit the form (where supported)"],
          ]},
          {type:"heading", text:"Search"},
          {type:"shortcut-group", items:[
            ["Type in header search", "Live search across accounts, contacts, deals, leads, tickets"],
            ["Click a result", "Navigate directly to that module"],
          ]},
        ]
      },
    ]
  },
];

// ══════════════════════════════════════════════════════════════════════
// CONTENT RENDERER
// ══════════════════════════════════════════════════════════════════════
function RenderContent({ sections }) {
  return (
    <div className="help-content-body">
      {sections.map((sec, i) => {
        switch (sec.type) {
          case "para":
            return <p key={i} className="help-para">{sec.text}</p>;

          case "heading":
            return <h3 key={i} className="help-h3">{sec.text}</h3>;

          case "list":
            return (
              <ul key={i} className="help-list">
                {sec.items.map((item, j) => (
                  <li key={j}><CheckCircle size={11} style={{color:"var(--brand)",flexShrink:0,marginTop:3}}/><span>{item}</span></li>
                ))}
              </ul>
            );

          case "steps":
            return (
              <ol key={i} className="help-steps">
                {sec.items.map((item, j) => (
                  <li key={j}>
                    <span className="help-step-num">{j+1}</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            );

          case "tip":
            return (
              <div key={i} className="help-callout tip">
                <Lightbulb size={14} style={{flexShrink:0,marginTop:2}}/>
                <span>{sec.text}</span>
              </div>
            );

          case "warning":
            return (
              <div key={i} className="help-callout warning">
                <AlertCircle size={14} style={{flexShrink:0,marginTop:2}}/>
                <span>{sec.text}</span>
              </div>
            );

          case "note":
            return (
              <div key={i} className="help-callout note">
                <Info size={14} style={{flexShrink:0,marginTop:2}}/>
                <span>{sec.text}</span>
              </div>
            );

          case "table":
            return (
              <div key={i} className="help-table-wrap">
                <table className="help-table">
                  <tbody>
                    {sec.rows.map((row, j) => (
                      <tr key={j}>
                        <td className="help-table-key">{row[0]}</td>
                        <td className="help-table-val">{row[1]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "shortcut-group":
            return (
              <div key={i} className="help-shortcut-group">
                {sec.items.map(([keys, desc], j) => (
                  <div key={j} className="help-shortcut-row">
                    <kbd className="help-kbd">{keys}</kbd>
                    <span className="help-shortcut-desc">{desc}</span>
                  </div>
                ))}
              </div>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN HELP PAGE COMPONENT
// ══════════════════════════════════════════════════════════════════════
function Help({ currentPage }) {
  // Auto-select the section matching the current app page
  const defaultCat = useMemo(() => {
    const match = HELP_DATA.find(c => c.id === currentPage || c.articles.some(a => a.id === currentPage));
    return match?.id || "getting-started";
  }, [currentPage]);

  const [search,      setSearch]      = useState("");
  const [selectedCat, setSelectedCat] = useState(defaultCat);
  const [selectedArt, setSelectedArt] = useState(null);

  // Flatten all articles for search
  const allArticles = useMemo(() =>
    HELP_DATA.flatMap(cat => cat.articles.map(a => ({ ...a, catId:cat.id, catLabel:cat.label, catColor:cat.color }))),
  []);

  // Search results
  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return allArticles.filter(a =>
      a.title.toLowerCase().includes(q) ||
      (a.tags || []).some(t => t.includes(q)) ||
      a.content.some(s => (s.text || "").toLowerCase().includes(q) ||
        (s.items || []).some(it => it.toLowerCase().includes(q)) ||
        (s.rows  || []).some(r => r.join(" ").toLowerCase().includes(q))
      )
    );
  }, [search, allArticles]);

  // Current category
  const category = HELP_DATA.find(c => c.id === selectedCat);

  // Current article
  const article = useMemo(() => {
    if (selectedArt) return allArticles.find(a => a.id === selectedArt);
    if (category?.articles?.length) return category.articles[0];
    return null;
  }, [selectedArt, allArticles, category]);

  const selectArticle = (catId, artId) => {
    setSelectedCat(catId);
    setSelectedArt(artId);
    setSearch("");
  };

  return (
    <div>
      {/* Page header */}
      <div className="pg-head">
        <div>
          <div className="pg-title">Help & User Guide</div>
          <div className="pg-sub">Comprehensive documentation, tips, and keyboard shortcuts for SmartCRM.</div>
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <BookOpen size={15} style={{ color:"var(--text3)" }}/>
          <span style={{ fontSize:12, color:"var(--text3)" }}>{allArticles.length} articles</span>
        </div>
      </div>

      {/* Search bar */}
      <div className="help-search-wrap">
        <Search size={16} style={{ color:"var(--text3)", flexShrink:0 }}/>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search the user guide — try 'convert lead', 'SLA', 'bulk upload', 'shortcuts'…"
          className="help-search-input"
          autoComplete="off"
        />
        {search && (
          <button className="icon-btn" onClick={() => setSearch("")}><X size={13}/></button>
        )}
      </div>

      {/* Search results */}
      {search.trim() ? (
        <div className="help-layout">
          <div className="help-search-results">
            <div style={{ fontSize:12, fontWeight:700, color:"var(--text3)", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.06em" }}>
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for "{search}"
            </div>
            {searchResults.length === 0 ? (
              <div style={{ padding:"32px 20px", textAlign:"center", color:"var(--text3)" }}>
                <HelpCircle size={28} style={{ margin:"0 auto 12px", display:"block", opacity:0.3 }}/>
                <div style={{ fontWeight:600, fontSize:14, color:"var(--text2)", marginBottom:4 }}>No results found</div>
                <div style={{ fontSize:12 }}>Try different keywords or browse categories on the left.</div>
              </div>
            ) : searchResults.map(a => (
              <div key={a.id} className="help-search-result-card"
                onClick={() => selectArticle(a.catId, a.id)}>
                <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:4 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:"1px 7px", borderRadius:4, background:a.catColor+"18", color:a.catColor }}>{a.catLabel}</span>
                </div>
                <div style={{ fontSize:13.5, fontWeight:600, color:"var(--text)" }}>{a.title}</div>
                <div style={{ fontSize:12, color:"var(--text3)", marginTop:2 }}>
                  {(a.content.find(s => s.type === "para")?.text || "").slice(0, 100)}…
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="help-layout">
          {/* Left: Category + Article list */}
          <div className="help-sidebar">
            {HELP_DATA.map(cat => (
              <div key={cat.id} className="help-cat-group">
                <div
                  className={`help-cat-item${selectedCat === cat.id ? " active" : ""}`}
                  onClick={() => { setSelectedCat(cat.id); setSelectedArt(null); }}
                  style={{ "--cat-color": cat.color }}
                >
                  <span className="help-cat-icon" style={{ color: cat.color }}>{cat.icon}</span>
                  <span className="help-cat-label">{cat.label}</span>
                  <ChevronRight size={12} className="help-cat-chevron"
                    style={{ transform: selectedCat === cat.id ? "rotate(90deg)" : "none", transition:"transform 0.15s" }}/>
                </div>
                {selectedCat === cat.id && (
                  <div className="help-art-list">
                    {cat.articles.map(a => (
                      <div key={a.id}
                        className={`help-art-item${article?.id === a.id ? " active" : ""}`}
                        onClick={() => setSelectedArt(a.id)}>
                        {a.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right: Article content */}
          <div className="help-article-panel">
            {article ? (
              <>
                <div className="help-article-head">
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:5,
                      background: (HELP_DATA.find(c=>c.id===selectedCat)?.color || "#64748B")+"18",
                      color: HELP_DATA.find(c=>c.id===selectedCat)?.color || "#64748B" }}>
                      {HELP_DATA.find(c=>c.id===selectedCat)?.label}
                    </span>
                  </div>
                  <h2 className="help-article-title">{article.title}</h2>
                  {article.tags?.length > 0 && (
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginTop:8 }}>
                      {article.tags.map(t => (
                        <span key={t} className="help-tag" onClick={() => setSearch(t)}>#{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <RenderContent sections={article.content}/>

                {/* Footer: next article navigation */}
                {(() => {
                  const cat = HELP_DATA.find(c => c.id === selectedCat);
                  if (!cat) return null;
                  const idx = cat.articles.findIndex(a => a.id === article.id);
                  const next = cat.articles[idx + 1];
                  if (!next) return null;
                  return (
                    <div className="help-article-next" onClick={() => setSelectedArt(next.id)}>
                      <span style={{ fontSize:11, color:"var(--text3)" }}>Next article</span>
                      <div style={{ fontSize:13, fontWeight:600, color:"var(--brand)", marginTop:2 }}>{next.title} →</div>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div style={{ padding:"60px 30px", textAlign:"center", color:"var(--text3)" }}>
                <BookOpen size={32} style={{ margin:"0 auto 14px", display:"block", opacity:0.3 }}/>
                <div style={{ fontWeight:600, fontSize:15, color:"var(--text2)", marginBottom:6 }}>Select an article</div>
                <div style={{ fontSize:12.5 }}>Choose a topic from the left panel to read the guide.</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Help;
