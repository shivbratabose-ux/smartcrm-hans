import { useState, useMemo, useEffect } from "react";
import { Plus, Search, Edit2, Trash2, Check, Download, ArrowRightCircle, Users, Mail, Phone, Globe, FileText, Calendar, TrendingUp, MapPin, Building2, User, Star, Briefcase, Clock, Paperclip, AlertTriangle, PhoneCall, Filter, ArrowUpDown, ArrowUp, ArrowDown, MessageSquare } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { PRODUCTS, TEAM, TEAM_MAP, PROD_MAP, LEAD_STAGES, LEAD_STAGE_MAP, VERTICALS, LEAD_SOURCES, REGIONS, HIERARCHY_LEVELS, LEAD_TEMPERATURES, BUSINESS_TYPES, STAFF_SIZES, CURRENT_SOFTWARE, SW_AGE, PAIN_POINTS, BUDGET_RANGES, DECISION_MAKERS, DECISION_TIMELINES, EVALUATION_STATUS, NEXT_STEPS, CALL_TYPES, CALL_OBJECTIVES, CALL_OUTCOMES } from '../data/constants';
import { BLANK_LEAD } from '../data/seed';
import { fmt, uid, cmp, sanitizeObj, hasErrors, today } from '../utils/helpers';
import { StatusBadge, ProdTag, UserPill, Modal, Confirm, FormError, Empty } from './shared';
import Pagination, { usePagination } from './Pagination';
import BulkActions, { useBulkSelect } from './BulkActions';
import { exportCSV } from '../utils/csv';

/* ── Date range helpers ── */
const RANGE_PRESETS = [
  { key: "7d",   label: "Last 7 Days",     days: 7 },
  { key: "10d",  label: "Last 10 Days",    days: 10 },
  { key: "30d",  label: "Last 30 Days",    days: 30 },
  { key: "mtd",  label: "Month to Date",   days: null },
  { key: "qtd",  label: "Quarter to Date", days: null },
  { key: "6m",   label: "Last 6 Months",   days: 180 },
  { key: "1y",   label: "Last Year",       days: 365 },
  { key: "all",  label: "All Time",        days: null },
  { key: "custom", label: "Custom",        days: null },
];

function getDateRange(key) {
  const now = new Date(today);
  if (key === "all" || key === "custom") return { from: "2000-01-01", to: today };
  if (key === "mtd") return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), to: today };
  if (key === "qtd") return { from: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString().slice(0, 10), to: today };
  const preset = RANGE_PRESETS.find(p => p.key === key);
  if (!preset?.days) return { from: "2000-01-01", to: today };
  return { from: new Date(now.getTime() - preset.days * 864e5).toISOString().slice(0, 10), to: today };
}
const inRange = (dateStr, range) => dateStr && dateStr >= range.from && dateStr <= range.to;
const daysSince = (dateStr) => dateStr ? Math.max(0, Math.round((new Date(today) - new Date(dateStr)) / 864e5)) : null;

// ═══════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════
const validateLead = (f) => {
  const errs = {};
  if (!f.company?.trim()) errs.company = "Company name is required";
  if (!f.contact?.trim()) errs.contact = "Contact name is required";
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) errs.email = "Invalid email format";
  if (f.stage !== "NA" && !f.nextCall) errs.nextCall = "Next call date is required for active leads";
  if (f.score < 0 || f.score > 100) errs.score = "Score must be between 0 and 100";
  return errs;
};

// ═══════════════════════════════════════════════════════════════════
// LEAD SCORE BAR
// ═══════════════════════════════════════════════════════════════════
const LeadScore = ({score}) => {
  const color = score >= 67 ? "#22C55E" : score >= 34 ? "#F59E0B" : "#EF4444";
  return <div style={{display:"flex",alignItems:"center",gap:6}}>
    <div style={{width:48,height:6,background:"#E2E8F0",borderRadius:3,overflow:"hidden"}}>
      <div style={{width:`${score}%`,height:"100%",background:color,borderRadius:3}}/>
    </div>
    <span style={{fontSize:11,color:"#64748B"}}>{score}</span>
  </div>;
};

// ═══════════════════════════════════════════════════════════════════
// LEAD STAGE BADGE
// ═══════════════════════════════════════════════════════════════════
const LeadStageBadge = ({stage}) => {
  const s = LEAD_STAGE_MAP[stage];
  if (!s) return <span className="badge">{stage}</span>;
  return (
    <span className="badge" style={{
      background: s.color + "18",
      color: s.color,
      fontWeight: 600,
      fontSize: 11,
      padding: "3px 10px",
      borderRadius: 6
    }}>{s.name}</span>
  );
};

// ═══════════════════════════════════════════════════════════════════
// CSV COLUMNS
// ═══════════════════════════════════════════════════════════════════
const CSV_COLS = [
  { label: "Lead ID", accessor: l => l.leadId || "" },
  { label: "Company", accessor: l => l.company },
  { label: "Contact", accessor: l => l.contact },
  { label: "Email", accessor: l => l.email },
  { label: "Phone", accessor: l => l.phone },
  { label: "Product", accessor: l => PROD_MAP[l.product]?.name || l.product },
  { label: "Vertical", accessor: l => l.vertical },
  { label: "Source", accessor: l => l.source },
  { label: "Stage", accessor: l => LEAD_STAGE_MAP[l.stage]?.name || l.stage },
  { label: "Score", accessor: l => l.score },
  { label: "Assigned To", accessor: l => TEAM_MAP[l.assignedTo]?.name || l.assignedTo },
  { label: "Next Call", accessor: l => l.nextCall },
  { label: "Created", accessor: l => l.createdDate },
];

// ═══════════════════════════════════════════════════════════════════
// LEAD PROFILE DETAIL VIEW
// ═══════════════════════════════════════════════════════════════════
const kpiCard = (icon, label, value, sub, color = "#1B6B5A") => (
  <div style={{background:"white",borderRadius:12,padding:"16px 18px",border:"1px solid var(--border)",flex:1,minWidth:0}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
      <div style={{width:32,height:32,borderRadius:8,background:color+"14",display:"flex",alignItems:"center",justifyContent:"center",color}}>
        {icon}
      </div>
      <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",color:"var(--text3)"}}>{label}</div>
    </div>
    <div style={{fontSize:22,fontWeight:800,fontFamily:"'Outfit',sans-serif",color:"var(--text1)"}}>{value}</div>
    {sub && <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{sub}</div>}
  </div>
);

const infoRow = (label, value) => (
  <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
    <span style={{fontSize:12,color:"var(--text3)",fontWeight:500}}>{label}</span>
    <span style={{fontSize:12,color:"var(--text1)",fontWeight:600,textAlign:"right",maxWidth:"60%"}}>{value || "—"}</span>
  </div>
);

const activityItem = (icon, title, desc, time) => (
  <div style={{display:"flex",gap:10,padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
    <div style={{width:30,height:30,borderRadius:8,background:"var(--brand-light,#E8F5F1)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--brand)",flexShrink:0}}>
      {icon}
    </div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:12,fontWeight:600,color:"var(--text1)"}}>{title}</div>
      <div style={{fontSize:11,color:"var(--text3)"}}>{desc}</div>
      <div style={{fontSize:10,color:"var(--text3)",marginTop:2}}>{time}</div>
    </div>
  </div>
);

/* ── Lead Conversion Modal ── */
function ConvertToOppModal({ lead, onClose, accounts, contacts, onConvert, orgUsers }) {
  const _team = orgUsers?.length ? orgUsers.filter(u => u.status !== 'Inactive') : TEAM;
  const [form, setForm] = useState({
    title: `${PROD_MAP[lead.product]?.name || lead.product} – ${lead.company}`,
    accountId: lead.accountId || "",
    primaryContactId: "",
    value: 0,
    closeDate: "",
    owner: lead.assignedTo,
    secondaryOwners: [],
    country: lead.region === "South Asia" ? "India" : "",
    notes: lead.notes || "",
    forecastCategory: "Likely-Case",
    dealSize: "Medium",
    createNewAccount: !lead.accountId,
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!form.title?.trim()) errs.title = "Opportunity name is required";
    if (!form.accountId && !form.createNewAccount) errs.accountId = "Select an account or create new";
    if (!lead.email && !lead.phone) errs.contact = "Lead must have a valid email or phone";
    if (!form.notes?.trim() || form.notes.trim().length < 10) errs.notes = "Qualification notes required (min 10 chars)";
    if (!form.closeDate) errs.closeDate = "Expected close date is required";
    // Duplicate check
    if (form.accountId) {
      const existing = (accounts || []).find(a => a.id === form.accountId);
      if (existing) {
        // just info, not blocking
      }
    }
    return errs;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onConvert(lead, form);
    onClose();
  };

  const accContacts = form.accountId ? (contacts || []).filter(c => c.accountId === form.accountId) : [];

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()} style={{zIndex:1100}}>
      <div style={{background:"white",borderRadius:16,width:"90vw",maxWidth:680,maxHeight:"88vh",overflow:"auto",boxShadow:"0 25px 60px rgba(0,0,0,0.3)"}}>
        <div style={{padding:"20px 28px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:17,fontWeight:700,color:"var(--text1)"}}>Convert Lead to Opportunity</div>
            <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>Lead: {lead.leadId} – {lead.company}</div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{width:32,height:32,fontSize:18}}>✕</button>
        </div>
        <div style={{padding:"20px 28px"}}>
          {/* Validation Warning */}
          {(!lead.email && !lead.phone) && (
            <div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:"10px 14px",marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
              <AlertTriangle size={16} style={{color:"#EF4444",flexShrink:0}}/>
              <span style={{fontSize:12,color:"#991B1B"}}>This lead has no valid email or phone. Cannot convert without contact info.</span>
            </div>
          )}

          <div className="form-row"><div className="form-group"><label>Opportunity Name *</label>
            <input value={form.title} onChange={e => { setForm(f => ({...f, title: e.target.value})); setErrors(e2 => ({...e2, title: undefined})); }}
              style={errors.title ? {borderColor:"#DC2626"} : {}}/>
            {errors.title && <FormError error={errors.title}/>}
          </div></div>

          <div className="form-row">
            <div className="form-group"><label>Customer / Account *</label>
              <select value={form.accountId} onChange={e => setForm(f => ({...f, accountId: e.target.value, createNewAccount: !e.target.value}))}
                style={errors.accountId ? {borderColor:"#DC2626"} : {}}>
                <option value="">— Create new account from lead —</option>
                {(accounts || []).map(a => <option key={a.id} value={a.id}>{a.accountNo ? `[${a.accountNo}] ` : ""}{a.name}</option>)}
              </select>
              {errors.accountId && <FormError error={errors.accountId}/>}
            </div>
            <div className="form-group"><label>Contact Person</label>
              <select value={form.primaryContactId} onChange={e => setForm(f => ({...f, primaryContactId: e.target.value}))}>
                <option value="">— {accContacts.length ? "Select contact" : "Use lead contact"} —</option>
                {accContacts.map(c => <option key={c.id} value={c.id}>{c.name}{c.designation ? ` – ${c.designation}` : ""}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group"><label>Product / Service</label>
              <input value={PROD_MAP[lead.product]?.name || lead.product} disabled style={{background:"var(--s2)"}}/>
            </div>
            <div className="form-group"><label>Opportunity Value (₹Cr) *</label>
              <input type="number" min="0" step="0.1" value={form.value} onChange={e => setForm(f => ({...f, value: +e.target.value}))}/>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group"><label>Expected Close Date *</label>
              <input type="date" value={form.closeDate} onChange={e => { setForm(f => ({...f, closeDate: e.target.value})); setErrors(e2 => ({...e2, closeDate: undefined})); }}
                style={errors.closeDate ? {borderColor:"#DC2626"} : {}}/>
              {errors.closeDate && <FormError error={errors.closeDate}/>}
            </div>
            <div className="form-group"><label>Country</label>
              <select value={form.country} onChange={e => setForm(f => ({...f, country: e.target.value}))}>
                {["India","South Africa","UAE","Morocco","Kenya","Ethiopia","Nigeria","Egypt","Singapore","UK","USA"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group"><label>Owner (Primary)</label>
              <select value={form.owner} onChange={e => setForm(f => ({...f, owner: e.target.value}))}>
                {_team.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Forecast Category</label>
              <select value={form.forecastCategory} onChange={e => setForm(f => ({...f, forecastCategory: e.target.value}))}>
                {["Best-Case","Likely-Case","Worst-Case","Not Applicable"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group" style={{marginBottom:14}}><label>Qualification Notes / Remarks *</label>
            <textarea value={form.notes} onChange={e => { setForm(f => ({...f, notes: e.target.value})); setErrors(e2 => ({...e2, notes: undefined})); }}
              placeholder="Key qualification details, client requirements, objections..." rows={3}
              style={errors.notes ? {borderColor:"#DC2626"} : {}}/>
            {errors.notes && <FormError error={errors.notes}/>}
          </div>

          <div style={{display:"flex",justifyContent:"flex-end",gap:8,paddingTop:12,borderTop:"1px solid var(--border)"}}>
            <button className="btn btn-sec" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={!lead.email && !lead.phone}>
              <ArrowRightCircle size={14}/>Convert to Opportunity
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadDetail({ lead, onClose, accounts, contacts, onConvertToOpp, onEdit, orgUsers, activities: allActivities, callReports, setActivities, setCallReports }) {
  const _team = orgUsers?.length ? orgUsers.filter(u => u.status !== 'Inactive') : TEAM;
  const _teamMap = Object.fromEntries(_team.map(u => [u.id, u]));
  const [showConvertModal, setShowConvertModal] = useState(false);
  const linkedAccount = lead.accountId ? accounts.find(a => a.id === lead.accountId) : null;
  const stageInfo = LEAD_STAGE_MAP[lead.stage];
  const productInfo = PROD_MAP[lead.product];
  const assignee = _teamMap[lead.assignedTo];
  const winProb = Math.min(Math.round(lead.score * 0.85 + 5), 99);
  const dealValue = (lead.score * 0.5).toFixed(2);
  const pipelineValue = (dealValue * winProb / 100).toFixed(2);

  // Generate associated contacts from the lead's contact info + real contacts
  const realContacts = (contacts || []).filter(c => lead.accountId && c.accountId === lead.accountId);
  const displayContacts = [
    { name: lead.contact, designation: lead.designation || "Primary Contact", department: productInfo?.name || "General", email: lead.email, phone: lead.phone },
    ...realContacts.map(c => ({ name: c.name, designation: c.designation || c.role, department: c.department || "—", email: c.email, phone: c.phone })),
  ];
  if (linkedAccount && !realContacts.length) {
    displayContacts.push({ name: linkedAccount.owner ? (_teamMap[linkedAccount.owner]?.name || "Account Manager") : "Account Manager", designation: "Account Manager", department: "Management", email: "", phone: "" });
  }

  // Real activity timeline
  const leadActivities = (allActivities||[]).filter(a => a.accountId === lead.accountId || a.contactId === lead.contact);
  const leadCalls = (callReports||[]).filter(cr => cr.accountId === lead.accountId || cr.leadId === lead.id);

  const combinedTimeline = [
    ...leadActivities.map(a => ({ type: "activity", date: a.date || a.createdDate || "", icon: <MessageSquare size={13}/>, title: a.title || a.type || "Activity", desc: a.notes || a.description || "—", time: a.date || a.createdDate || "—" })),
    ...leadCalls.map(cr => ({ type: "call", date: cr.date || cr.callDate || "", icon: <Phone size={13}/>, title: cr.callType || "Call", desc: cr.notes || cr.outcome || "—", time: cr.date || cr.callDate || "—" })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  // If no real activities, show a placeholder
  const displayTimeline = combinedTimeline.length > 0 ? combinedTimeline : [
    { icon: <Calendar size={13}/>, title: "Lead Created", desc: `Lead ${lead.leadId} was created`, time: lead.createdDate || "—" },
  ];

  // Inline form states
  const [showCallForm, setShowCallForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [callForm, setCallForm] = useState({ callType: "Discovery", date: today, notes: "", outcome: "Interested", nextCallDate: "" });
  const [actForm, setActForm] = useState({ title: "", type: "Call", date: today, notes: "" });

  const saveCallLog = () => {
    if (!callForm.notes?.trim()) return;
    const newCall = {
      id: `cr-${Date.now()}`,
      accountId: lead.accountId || "",
      leadId: lead.id,
      contactId: lead.contact || "",
      callType: callForm.callType,
      date: callForm.date,
      callDate: callForm.date,
      notes: callForm.notes,
      outcome: callForm.outcome,
      nextCallDate: callForm.nextCallDate,
      createdBy: "",
    };
    setCallReports(p => [...p, newCall]);
    setCallForm({ callType: "Discovery", date: today, notes: "", outcome: "Interested", nextCallDate: "" });
    setShowCallForm(false);
  };

  const saveActivity = () => {
    if (!actForm.title?.trim()) return;
    const newAct = {
      id: `act-${Date.now()}`,
      accountId: lead.accountId || "",
      contactId: lead.contact || "",
      leadId: lead.id,
      title: actForm.title,
      type: actForm.type,
      date: actForm.date,
      notes: actForm.notes,
      createdDate: today,
    };
    setActivities(p => [...p, newAct]);
    setActForm({ title: "", type: "Call", date: today, notes: "" });
    setShowActivityForm(false);
  };

  // Mock documents
  const documents = [
    { name: `${lead.company}_Proposal.pdf`, size: "2.4 MB", date: lead.createdDate },
    { name: `NDA_${lead.company}.docx`, size: "156 KB", date: lead.createdDate },
    { name: `Meeting_Notes.pdf`, size: "890 KB", date: lead.nextCall || lead.createdDate },
  ];

  // Revenue source mock data bar widths
  const revSources = [
    { label: "Direct", pct: 45, color: "#1B6B5A" },
    { label: "Referral", pct: 30, color: "#3B82F6" },
    { label: "Inbound", pct: 25, color: "#F59E0B" },
  ];

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Lead Profile"
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{zIndex:1000}}>
      <div style={{
        background:"var(--bg,#F1F5F9)",width:"92vw",maxWidth:1100,maxHeight:"92vh",
        borderRadius:16,overflow:"hidden",display:"flex",flexDirection:"column",
        boxShadow:"0 25px 60px rgba(0,0,0,0.3)"
      }}>
        {/* Header */}
        <div style={{background:"white",padding:"20px 28px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:44,height:44,borderRadius:12,background:"#1B6B5A",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:16,fontWeight:700}}>
              {lead.company?.slice(0,2).toUpperCase()}
            </div>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:18,fontWeight:700,color:"var(--text1)"}}>{lead.company}</span>
                <LeadStageBadge stage={lead.stage}/>
                <span style={{fontSize:11,fontFamily:"'Courier New',monospace",color:"var(--text3)",background:"var(--s2)",padding:"2px 8px",borderRadius:4}}>{lead.leadId}</span>
              </div>
              <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                {lead.vertical} &middot; {lead.region} &middot; {lead.source}
              </div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            {lead.stage === "SAL" && (
              <button className="btn btn-primary" onClick={() => setShowConvertModal(true)}>
                <ArrowRightCircle size={14}/>Convert to Opportunity
              </button>
            )}
            {lead.stage === "Converted" && (
              <span style={{fontSize:11,fontWeight:600,color:"#16A34A",background:"#F0FDF4",padding:"5px 12px",borderRadius:6}}>✓ Converted</span>
            )}
            <button className="btn btn-sec" onClick={() => { onClose(); onEdit(lead); }}>
              <Edit2 size={14}/>Edit
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Close" style={{width:32,height:32,fontSize:18}}>✕</button>
          </div>
        </div>

        {/* Scrollable Body */}
        <div style={{flex:1,overflow:"auto",padding:"20px 28px 28px"}}>
          {/* KPI Metrics Row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
            {kpiCard(<TrendingUp size={15}/>, "Deal Value", `₹${dealValue} L`, `Based on score: ${lead.score}`)}
            {kpiCard(<Star size={15}/>, "Win Probability", `${winProb}%`, stageInfo?.name || lead.stage, "#3B82F6")}
            {kpiCard(<Briefcase size={15}/>, "Pipeline Value", `₹${pipelineValue} L`, "Weighted value", "#8B5CF6")}
            {kpiCard(<Calendar size={15}/>, "Last Activity", lead.nextCall ? fmt.short(lead.nextCall) : "—", "Next scheduled call", "#F59E0B")}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:20}}>
            {/* Left Column */}
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {/* General Information */}
              <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                  <Building2 size={15} style={{color:"var(--brand)"}}/> General Information
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 24px"}}>
                  <div>
                    {infoRow("Phase (Stage)", stageInfo?.name || lead.stage)}
                    {infoRow("Financial Rating", lead.score >= 70 ? "A — High Value" : lead.score >= 40 ? "B — Medium Value" : "C — Low Value")}
                    {infoRow("Region", lead.region)}
                    {infoRow("Vertical", lead.vertical)}
                  </div>
                  <div>
                    {infoRow("Product Interest", productInfo?.name || lead.product)}
                    {infoRow("Lead Source", lead.source)}
                    {infoRow("Sentiment Score", `${lead.score}/100`)}
                    {infoRow("Created Date", fmt.short(lead.createdDate))}
                  </div>
                </div>
                {lead.notes && (
                  <div style={{marginTop:12,padding:"10px 14px",background:"var(--s2,#F8FAFC)",borderRadius:8,border:"1px solid var(--border)"}}>
                    <div style={{fontSize:11,fontWeight:600,color:"var(--text3)",marginBottom:4}}>NOTES</div>
                    <div style={{fontSize:12,color:"var(--text2)",lineHeight:1.5}}>{lead.notes}</div>
                  </div>
                )}
              </div>

              {/* Associated Contacts */}
              <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                  <Users size={15} style={{color:"var(--brand)"}}/> Associated Contacts
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
                  {displayContacts.map((c, i) => (
                    <div key={i} style={{border:"1px solid var(--border)",borderRadius:10,padding:"14px 16px",background:"var(--s2,#F8FAFC)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                        <div className="u-av" style={{width:36,height:36,borderRadius:10,fontSize:12,flexShrink:0}}>
                          {c.name?.split(" ").map(n=>n[0]).join("").slice(0,2)}
                        </div>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:"var(--text1)"}}>{c.name}</div>
                          <div style={{fontSize:11,color:"var(--text3)"}}>{c.designation}</div>
                          <div style={{fontSize:10,color:"var(--brand)",fontWeight:500}}>{c.department}</div>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6}}>
                        {c.email && (
                          <a href={`mailto:${c.email}`} style={{width:28,height:28,borderRadius:6,background:"var(--brand)",color:"white",display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none"}} title={c.email}>
                            <Mail size={13}/>
                          </a>
                        )}
                        {c.phone && (
                          <a href={`tel:${c.phone}`} style={{width:28,height:28,borderRadius:6,background:"#3B82F6",color:"white",display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none"}} title={c.phone}>
                            <Phone size={13}/>
                          </a>
                        )}
                        <div style={{width:28,height:28,borderRadius:6,background:"#0A66C2",color:"white",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}} title="LinkedIn">
                          <Globe size={13}/>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Related Opportunities */}
              <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                  <Briefcase size={15} style={{color:"var(--brand)"}}/> Related Opportunities
                </div>
                {lead.stage === "SAL" ? (
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead>
                      <tr style={{borderBottom:"2px solid var(--border)"}}>
                        <th style={{textAlign:"left",padding:"8px 10px",fontSize:10,fontWeight:600,color:"var(--text3)",textTransform:"uppercase"}}>Opp Name</th>
                        <th style={{textAlign:"left",padding:"8px 10px",fontSize:10,fontWeight:600,color:"var(--text3)",textTransform:"uppercase"}}>Stage</th>
                        <th style={{textAlign:"right",padding:"8px 10px",fontSize:10,fontWeight:600,color:"var(--text3)",textTransform:"uppercase"}}>Value</th>
                        <th style={{textAlign:"center",padding:"8px 10px",fontSize:10,fontWeight:600,color:"var(--text3)",textTransform:"uppercase"}}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{borderBottom:"1px solid var(--border)"}}>
                        <td style={{padding:"10px",fontWeight:600}}>{lead.company} — {productInfo?.name}</td>
                        <td style={{padding:"10px"}}>Qualification</td>
                        <td style={{padding:"10px",textAlign:"right",fontWeight:600}}>₹{dealValue} L</td>
                        <td style={{padding:"10px",textAlign:"center"}}>
                          <span style={{padding:"3px 10px",borderRadius:6,background:"#22C55E18",color:"#22C55E",fontSize:11,fontWeight:600}}>Active</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <div style={{textAlign:"center",padding:"20px",color:"var(--text3)",fontSize:12}}>
                    No opportunities linked yet. {lead.stage !== "NA" && "Lead must reach SAL stage to convert."}
                  </div>
                )}
              </div>

              {/* Financial & Billing */}
              <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                  <TrendingUp size={15} style={{color:"var(--brand)"}}/> Financial & Billing
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                  {/* Revenue Source Bar */}
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",marginBottom:10}}>Revenue Source</div>
                    {revSources.map((s, i) => (
                      <div key={i} style={{marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                          <span style={{fontSize:11,color:"var(--text2)"}}>{s.label}</span>
                          <span style={{fontSize:11,fontWeight:600,color:"var(--text1)"}}>{s.pct}%</span>
                        </div>
                        <div style={{height:6,background:"#E2E8F0",borderRadius:3,overflow:"hidden"}}>
                          <div style={{width:`${s.pct}%`,height:"100%",background:s.color,borderRadius:3}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Monthly Revenue Sparkline */}
                  <div>
                    <div style={{fontSize:11,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",marginBottom:10}}>Monthly Revenue Trend</div>
                    <div style={{display:"flex",alignItems:"flex-end",gap:4,height:60}}>
                      {[30,45,38,52,48,65,58,72,68,80,75,lead.score].map((v,i) => (
                        <div key={i} style={{flex:1,height:`${v * 0.7}%`,background: i === 11 ? "#1B6B5A" : "#CBD5E1",borderRadius:2,minHeight:4}}/>
                      ))}
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                      <span style={{fontSize:9,color:"var(--text3)"}}>Jan</span>
                      <span style={{fontSize:9,color:"var(--text3)"}}>Dec</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {/* Sales Team */}
              <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                  <User size={15} style={{color:"var(--brand)"}}/> Sales Team
                </div>
                {[lead.assignedTo, ...(linkedAccount?.owner && linkedAccount.owner !== lead.assignedTo ? [linkedAccount.owner] : [])].map((uid, i) => {
                  const member = _teamMap[uid];
                  if (!member) return null;
                  return (
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom: i === 0 ? "1px solid var(--border)" : "none"}}>
                      <div className="u-av" style={{width:34,height:34,borderRadius:10,fontSize:11}}>
                        {member.name?.split(" ").map(n=>n[0]).join("").slice(0,2)}
                      </div>
                      <div>
                        <div style={{fontSize:12.5,fontWeight:600,color:"var(--text1)"}}>{member.name}</div>
                        <div style={{fontSize:11,color:"var(--text3)"}}>{i === 0 ? "Assigned Owner" : "Account Manager"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Linked Account */}
              {linkedAccount && (
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                    <Building2 size={15} style={{color:"var(--brand)"}}/> Linked Account
                  </div>
                  {infoRow("Account Name", linkedAccount.name)}
                  {infoRow("Industry", linkedAccount.industry)}
                  {infoRow("Region", linkedAccount.region)}
                  {linkedAccount.hierarchyPath && infoRow("Hierarchy", linkedAccount.hierarchyPath)}
                </div>
              )}

              {/* Recent Activity */}
              <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <Clock size={15} style={{color:"var(--brand)"}}/> Recent Activity
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    <button className="btn btn-sm btn-sec" style={{fontSize:10,padding:"3px 8px"}} onClick={() => { setShowCallForm(v => !v); setShowActivityForm(false); }}>
                      <Phone size={11}/>Log Call
                    </button>
                    <button className="btn btn-sm btn-sec" style={{fontSize:10,padding:"3px 8px"}} onClick={() => { setShowActivityForm(v => !v); setShowCallForm(false); }}>
                      <Plus size={11}/>Log Activity
                    </button>
                  </div>
                </div>

                {/* Inline Call Log Form */}
                {showCallForm && (
                  <div style={{background:"var(--s2,#F8FAFC)",borderRadius:8,padding:12,marginBottom:12,border:"1px solid var(--border)"}}>
                    <div style={{fontSize:11,fontWeight:600,color:"var(--text1)",marginBottom:8}}>Log a Call</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                      <div><label style={{fontSize:10,color:"var(--text3)"}}>Call Type</label>
                        <select value={callForm.callType} onChange={e => setCallForm(f => ({...f, callType: e.target.value}))} style={{fontSize:11,width:"100%"}}>
                          {["Discovery","Follow-up","Demo","Negotiation","Support","Cold Call"].map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div><label style={{fontSize:10,color:"var(--text3)"}}>Date</label>
                        <input type="date" value={callForm.date} onChange={e => setCallForm(f => ({...f, date: e.target.value}))} style={{fontSize:11,width:"100%"}}/>
                      </div>
                    </div>
                    <div style={{marginBottom:8}}>
                      <label style={{fontSize:10,color:"var(--text3)"}}>Notes</label>
                      <textarea value={callForm.notes} onChange={e => setCallForm(f => ({...f, notes: e.target.value}))} rows={2} style={{fontSize:11,width:"100%"}} placeholder="Call notes..."/>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                      <div><label style={{fontSize:10,color:"var(--text3)"}}>Outcome</label>
                        <select value={callForm.outcome} onChange={e => setCallForm(f => ({...f, outcome: e.target.value}))} style={{fontSize:11,width:"100%"}}>
                          {["Interested","Not Interested","Call Back","Voicemail","No Answer","Meeting Booked"].map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div><label style={{fontSize:10,color:"var(--text3)"}}>Next Call Date</label>
                        <input type="date" value={callForm.nextCallDate} onChange={e => setCallForm(f => ({...f, nextCallDate: e.target.value}))} style={{fontSize:11,width:"100%"}}/>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                      <button className="btn btn-sm btn-sec" style={{fontSize:10}} onClick={() => setShowCallForm(false)}>Cancel</button>
                      <button className="btn btn-sm btn-primary" style={{fontSize:10}} onClick={saveCallLog}><Check size={11}/>Save</button>
                    </div>
                  </div>
                )}

                {/* Inline Activity Log Form */}
                {showActivityForm && (
                  <div style={{background:"var(--s2,#F8FAFC)",borderRadius:8,padding:12,marginBottom:12,border:"1px solid var(--border)"}}>
                    <div style={{fontSize:11,fontWeight:600,color:"var(--text1)",marginBottom:8}}>Log an Activity</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                      <div><label style={{fontSize:10,color:"var(--text3)"}}>Title</label>
                        <input value={actForm.title} onChange={e => setActForm(f => ({...f, title: e.target.value}))} style={{fontSize:11,width:"100%"}} placeholder="Activity title"/>
                      </div>
                      <div><label style={{fontSize:10,color:"var(--text3)"}}>Type</label>
                        <select value={actForm.type} onChange={e => setActForm(f => ({...f, type: e.target.value}))} style={{fontSize:11,width:"100%"}}>
                          {["Call","Email","Meeting","Task","Note","Follow-up"].map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{marginBottom:8}}>
                      <label style={{fontSize:10,color:"var(--text3)"}}>Date</label>
                      <input type="date" value={actForm.date} onChange={e => setActForm(f => ({...f, date: e.target.value}))} style={{fontSize:11,width:"100%"}}/>
                    </div>
                    <div style={{marginBottom:8}}>
                      <label style={{fontSize:10,color:"var(--text3)"}}>Notes</label>
                      <textarea value={actForm.notes} onChange={e => setActForm(f => ({...f, notes: e.target.value}))} rows={2} style={{fontSize:11,width:"100%"}} placeholder="Activity notes..."/>
                    </div>
                    <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                      <button className="btn btn-sm btn-sec" style={{fontSize:10}} onClick={() => setShowActivityForm(false)}>Cancel</button>
                      <button className="btn btn-sm btn-primary" style={{fontSize:10}} onClick={saveActivity}><Check size={11}/>Save</button>
                    </div>
                  </div>
                )}

                {displayTimeline.map((a, i) => (
                  <div key={i}>{activityItem(a.icon, a.title, a.desc, a.time)}</div>
                ))}
              </div>

              {/* Documents & Files */}
              <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                  <Paperclip size={15} style={{color:"var(--brand)"}}/> Documents & Files
                </div>
                {documents.map((d, i) => (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom: i < documents.length - 1 ? "1px solid var(--border)" : "none"}}>
                    <div style={{width:32,height:32,borderRadius:8,background:"#EF444414",display:"flex",alignItems:"center",justifyContent:"center",color:"#EF4444",flexShrink:0}}>
                      <FileText size={14}/>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:"var(--text1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>
                      <div style={{fontSize:10,color:"var(--text3)"}}>{d.size} &middot; {fmt.short(d.date)}</div>
                    </div>
                    <Download size={13} style={{color:"var(--text3)",cursor:"pointer",flexShrink:0}}/>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {showConvertModal && (
          <ConvertToOppModal
            lead={lead}
            accounts={accounts}
            contacts={contacts || []}
            onConvert={(ld, data) => { onConvertToOpp(ld, data); onClose(); }}
            onClose={() => setShowConvertModal(false)}
            orgUsers={orgUsers}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LEADS PAGE
// ═══════════════════════════════════════════════════════════════════
function Leads({ leads, setLeads, accounts, currentUser, onConvertToOpp, contacts: allContacts, orgUsers, activities, setActivities, callReports, setCallReports, masters }) {
  const team = orgUsers?.length ? orgUsers.filter(u => u.status !== 'Inactive') : TEAM;
  const teamMap = Object.fromEntries(team.map(u => [u.id, u]));

  // Auto-generate leadId for bulk-uploaded leads that are missing one, and coerce score to number
  useEffect(() => {
    const needsLeadId = leads.some(l => !l.leadId);
    const needsScoreFix = leads.some(l => typeof l.score === "string" || l.score === undefined || l.score === null);
    if (!needsLeadId && !needsScoreFix) return;

    let maxSeq = 0;
    const year = new Date().getFullYear();
    leads.forEach(l => {
      const m = l.leadId?.match(/(?:LEAD-|#FL-)(\d{4})-?(\d+)/);
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[2]));
    });

    const updated = leads.map(l => {
      let patched = l;
      if (!l.leadId) {
        maxSeq++;
        patched = { ...patched, leadId: `#FL-${year}-${String(maxSeq).padStart(3, "0")}` };
      }
      // Ensure score is always a clamped number (0-100)
      const numScore = Math.max(0, Math.min(100, Number(patched.score) || 0));
      if (patched.score !== numScore) {
        patched = patched === l ? { ...l, score: numScore } : { ...patched, score: numScore };
      }
      return patched;
    });

    setLeads(updated);
  }, [leads]);

  const [search, setSearch] = useState("");
  const [productF, setProductF] = useState("All");
  const [stageF, setStageF] = useState("All");
  const [sourceF, setSourceF] = useState("All");
  const [ownerF, setOwnerF] = useState("All");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK_LEAD);
  const [confirm, setConfirm] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [detail, setDetail] = useState(null);
  const [rangeKey, setRangeKey] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState(today);
  const [sortCol, setSortCol] = useState("createdDate");
  const [sortDir, setSortDir] = useState("desc");
  const [callLogModal, setCallLogModal] = useState(null); // lead object when open
  const [callLogForm, setCallLogForm] = useState(null);

  const range = useMemo(() => rangeKey === "custom" && customFrom ? { from: customFrom, to: customTo || today } : getDateRange(rangeKey), [rangeKey, customFrom, customTo]);
  const rangeLabel = RANGE_PRESETS.find(p => p.key === rangeKey)?.label || "Custom";

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };
  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <ArrowUpDown size={11} style={{opacity:0.3,marginLeft:2}}/>;
    return sortDir === "asc" ? <ArrowUp size={11} style={{marginLeft:2}}/> : <ArrowDown size={11} style={{marginLeft:2}}/>;
  };

  const filtered = useMemo(() => [...leads].filter(l => {
    if (rangeKey !== "all" && !inRange(l.createdDate, range)) return false;
    if (productF !== "All" && l.product !== productF) return false;
    if (stageF !== "All" && l.stage !== stageF) return false;
    if (sourceF !== "All" && l.source !== sourceF) return false;
    if (ownerF !== "All" && l.assignedTo !== ownerF) return false;
    if (search && !(l.company + l.contact + l.email + (l.leadId||"")).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    let v;
    if (sortCol === "score") v = (a.score || 0) - (b.score || 0);
    else if (sortCol === "age") v = (daysSince(a.createdDate) || 0) - (daysSince(b.createdDate) || 0);
    else if (sortCol === "nextCall" || sortCol === "createdDate") v = (a[sortCol] || "").localeCompare(b[sortCol] || "");
    else v = cmp(a, b, sortCol);
    return sortDir === "desc" ? -v : v;
  }), [leads, productF, stageF, sourceF, ownerF, search, range, rangeKey, sortCol, sortDir]);

  const bulk = useBulkSelect(filtered);
  const pg = usePagination(filtered);

  const nextLeadId = () => {
    const year = new Date(today).getFullYear();
    const nums = leads.map(l => {
      const m = l.leadId?.match(/(?:LEAD-|#FL-)(\d{4})-?(\d+)/);
      return m ? parseInt(m[2] || m[1]) : 0;
    });
    const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
    return `#FL-${year}-${String(next).padStart(3, '0')}`;
  };

  const openAdd = () => {
    const leadId = nextLeadId();
    setForm({ ...BLANK_LEAD, id: `ld${uid()}`, leadId, createdDate: today });
    setFormErrors({});
    setModal({ mode: "add" });
  };

  const openEdit = (l) => {
    setForm({ ...l });
    setFormErrors({});
    setModal({ mode: "edit" });
  };

  const save = () => {
    const errs = validateLead(form);
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    // Duplicate check
    const isDup = leads.some(existing =>
      existing.id !== form.id && (
        (form.email && existing.email && existing.email.toLowerCase() === form.email.toLowerCase()) ||
        (form.phone && existing.phone && existing.phone === form.phone)
      )
    );
    if (isDup && !window.confirm("A lead with the same email or phone already exists. Continue anyway?")) return;
    const clean = sanitizeObj(form);
    if (modal.mode === "add") setLeads(p => [...p, { ...clean }]);
    else setLeads(p => p.map(l => l.id === clean.id ? { ...clean } : l));
    setModal(null);
    setFormErrors({});
  };

  const del = (id) => {
    setLeads(p => p.filter(l => l.id !== id));
    setConfirm(null);
  };

  const bulkDelete = () => {
    if (window.confirm("Delete " + bulk.count + " leads permanently?")) {
      setLeads(p => p.filter(l => !bulk.isSelected(l.id)));
      bulk.clear();
    }
  };

  const handleConvert = (lead, conversionData) => {
    if (lead.stage !== "SAL") return;
    onConvertToOpp(lead, conversionData);
  };

  // ─── Open Call Log Modal for a lead ───
  const openCallLog = (lead) => {
    const _callTypes = masters?.callTypes?.map(t => t.name) || CALL_TYPES;
    const _callObjectives = masters?.callSubjects?.map(t => t.name) || CALL_OBJECTIVES;
    setCallLogForm({
      callType: _callTypes[0] || "Telephone Call",
      objective: _callObjectives[0] || "General Followup",
      date: today,
      time: "",
      duration: 15,
      contactIds: [],
      ourParticipants: currentUser ? [currentUser] : [],
      notes: "",
      outcome: CALL_OUTCOMES[0] || "Completed",
      nextCallDate: "",
      nextStep: "",
      createFollowUp: false,
    });
    setCallLogModal(lead);
  };

  const saveCallLog = () => {
    if (!callLogForm || !callLogModal) return;
    const lead = callLogModal;
    const newCall = {
      id: `cr-${uid()}`,
      accountId: lead.accountId || "",
      leadId: lead.id,
      leadName: lead.company,
      company: lead.company,
      contactId: callLogForm.contactIds.join(","),
      marketingPerson: callLogForm.ourParticipants[0] || currentUser || "",
      callType: callLogForm.callType,
      objective: callLogForm.objective,
      callDate: callLogForm.date,
      date: callLogForm.date,
      time: callLogForm.time,
      duration: callLogForm.duration,
      notes: callLogForm.notes,
      outcome: callLogForm.outcome,
      nextCallDate: callLogForm.nextCallDate,
      nextStep: callLogForm.nextStep,
      leadStage: lead.stage,
      product: lead.product,
      createdBy: currentUser || "",
    };
    setCallReports(p => [...p, newCall]);

    // Optionally create follow-up activity
    if (callLogForm.createFollowUp && callLogForm.nextCallDate) {
      const followUp = {
        id: `act-${uid()}`,
        accountId: lead.accountId || "",
        contactId: lead.contact || "",
        leadId: lead.id,
        title: `Follow-up: ${lead.company} – ${callLogForm.objective}`,
        type: "Follow-up",
        date: callLogForm.nextCallDate,
        notes: callLogForm.nextStep || `Follow-up call for ${lead.company}`,
        createdDate: today,
        createdBy: currentUser || "",
      };
      setActivities(p => [...p, followUp]);
    }

    // Update lead's nextCall if a next call date was set
    if (callLogForm.nextCallDate) {
      setLeads(p => p.map(l => l.id === lead.id ? { ...l, nextCall: callLogForm.nextCallDate } : l));
    }

    setCallLogModal(null);
    setCallLogForm(null);
  };

  const stageCount = (stageId) => leads.filter(l => l.stage === stageId).length;

  // ─── Computed KPIs (date-filtered) ───
  const activeLeads = filtered.filter(l => l.stage !== "NA" && l.stage !== "Converted").length;
  const convertedCount = filtered.filter(l => l.stage === "Converted").length;
  const avgScore = filtered.length > 0 ? Math.round(filtered.reduce((s, l) => s + (Number(l.score) || 0), 0) / filtered.length) : 0;
  const salCount = filtered.filter(l => l.stage === "SAL").length;
  const mqlCount = filtered.filter(l => l.stage === "MQL").length;
  const sqlCount = filtered.filter(l => l.stage === "SQL").length;
  const pipelineValue = filtered.reduce((s, l) => s + ((Number(l.score) || 0) * 0.5), 0);
  const overdueLeads = filtered.filter(l => l.nextCall && l.nextCall < today && l.stage !== "NA").length;
  const hotLeads = filtered.filter(l => l.score >= 70 && l.stage !== "NA").length;
  const avgAge = filtered.length > 0 ? Math.round(filtered.reduce((s, l) => s + (daysSince(l.createdDate) || 0), 0) / filtered.length) : 0;

  // Lead source distribution for insights
  const sourceDistribution = useMemo(() => {
    const bySource = {};
    filtered.forEach(l => { bySource[l.source] = (bySource[l.source] || 0) + 1; });
    const COLORS = ["#1B6B5A", "#3B82F6", "#F59E0B", "#8B5CF6", "#EF4444", "#0D9488"];
    return Object.entries(bySource).map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  // Stage funnel data
  const stageFunnel = useMemo(() =>
    LEAD_STAGES.filter(s => s.id !== "NA").map(s => ({
      name: s.name, count: filtered.filter(l => l.stage === s.id).length, color: LEAD_STAGE_MAP[s.id]?.color || "#94A3B8"
    })), [filtered]);

  return (
    <div>
      <div className="pg-head">
        <div>
          <div className="pg-title">Leads</div>
          <div className="pg-sub">
            {filtered.length} leads{rangeKey !== "all" && ` (${rangeLabel})`}
            {LEAD_STAGES.filter(s => s.id !== "NA").map(s =>
              <span key={s.id}> · {s.id} {filtered.filter(l => l.stage === s.id).length}</span>
            )}
          </div>
        </div>
        <div className="pg-actions">
          {overdueLeads > 0 && <span style={{background:"var(--red-bg)",color:"var(--red-t)",fontSize:11,fontWeight:700,padding:"5px 10px",borderRadius:6,display:"flex",alignItems:"center",gap:4}}><AlertTriangle size={12}/>{overdueLeads} overdue</span>}
          <button className="btn btn-sec" onClick={() => exportCSV(filtered, CSV_COLS, "leads")}>
            <Download size={14}/>Export
          </button>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={14}/>Add Lead
          </button>
        </div>
      </div>

      {/* ──── DATE RANGE PILLS ──── */}
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        <Calendar size={14} style={{color:"var(--text3)",marginRight:2}}/>
        {RANGE_PRESETS.filter(p => p.key !== "custom").map(p => (
          <button key={p.key} className={`btn btn-sm ${rangeKey === p.key ? "btn-primary" : "btn-sec"}`}
            style={{fontSize:11,padding:"4px 10px",borderRadius:6}} onClick={() => setRangeKey(p.key)}>
            {p.label}
          </button>
        ))}
        <button className={`btn btn-sm ${rangeKey === "custom" ? "btn-primary" : "btn-sec"}`}
          style={{fontSize:11,padding:"4px 10px",borderRadius:6}} onClick={() => setRangeKey("custom")}>
          Custom
        </button>
        {rangeKey === "custom" && (
          <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:4}}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{fontSize:11,padding:"3px 6px",borderRadius:4,border:"1px solid var(--border)"}}/>
            <span style={{fontSize:11,color:"var(--text3)"}}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{fontSize:11,padding:"3px 6px",borderRadius:4,border:"1px solid var(--border)"}}/>
          </div>
        )}
      </div>

      {/* ──── KPI CARDS ──── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"14px 18px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.8}}>ACTIVE LEADS</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>{activeLeads}</div>
          <div style={{fontSize:11,opacity:0.7}}>{hotLeads} hot (70+ score)</div>
        </div>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"14px 18px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.8}}>AVG SCORE</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>{avgScore}<span style={{fontSize:14,opacity:0.7}}>/100</span></div>
          <div style={{fontSize:11,opacity:0.7}}>{avgScore >= 60 ? "Healthy pipeline" : "Needs nurturing"}</div>
        </div>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"14px 18px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.8}}>PIPELINE VALUE</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>₹{pipelineValue.toFixed(1)}L</div>
          <div style={{fontSize:11,opacity:0.7}}>Estimated from scores</div>
        </div>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"14px 18px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.8}}>CONVERSION</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>{salCount}</div>
          <div style={{fontSize:11,opacity:0.7}}>SAL ready to convert</div>
        </div>
        <div style={{background: overdueLeads > 0 ? "#DC2626" : "#1B6B5A",borderRadius:12,padding:"14px 18px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.8}}>FOLLOW-UPS</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>{overdueLeads}</div>
          <div style={{fontSize:11,opacity:0.7}}>{overdueLeads > 0 ? "Overdue – act now!" : "All on track"}</div>
        </div>
      </div>

      {/* ──── STAGE PIPELINE MINI BAR ──── */}
      <div style={{display:"flex",height:8,borderRadius:4,overflow:"hidden",marginBottom:16,gap:2}}>
        {stageFunnel.map(s => s.count > 0 && (
          <div key={s.name} style={{flex:s.count,background:s.color,borderRadius:2,position:"relative",minWidth:4}} title={`${s.name}: ${s.count}`}/>
        ))}
      </div>

      <div style={{display:"flex",gap:16}}>
        {/* Left: Main content */}
        <div style={{flex:1,minWidth:0}}>
          {/* Filters */}
          <div className="filter-bar" style={{flexWrap:"wrap"}}>
            <div className="filter-search">
              <Search size={14} style={{ color: "var(--text3)", flexShrink: 0 }}/>
              <input placeholder="Search leads..." value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
            <select className="filter-select" value={productF} onChange={e => setProductF(e.target.value)}>
              <option value="All">All Products</option>
              {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="filter-select" value={stageF} onChange={e => setStageF(e.target.value)}>
              <option value="All">All Stages</option>
              {LEAD_STAGES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="filter-select" value={sourceF} onChange={e => setSourceF(e.target.value)}>
              <option value="All">All Sources</option>
              {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="filter-select" value={ownerF} onChange={e => setOwnerF(e.target.value)}>
              <option value="All">All Owners</option>
              {team.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          {/* Bulk Actions */}
          <BulkActions count={bulk.count} onClear={bulk.clear}
            onDelete={bulkDelete}
            onExport={() => exportCSV(
              leads.filter(l => bulk.isSelected(l.id)),
              CSV_COLS,
              "leads"
            )}
          />

          {/* Table */}
          <div className="card" style={{ padding: 0 }}>
            {filtered.length === 0 ? (
              <Empty icon={<Users size={22}/>} title="No leads found" sub="Try adjusting filters or add a new lead."/>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}><input type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll}/></th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("leadId")}>Lead ID<SortIcon col="leadId"/></th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("company")}>Company<SortIcon col="company"/></th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("contact")}>Contact<SortIcon col="contact"/></th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("product")}>Product<SortIcon col="product"/></th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("stage")}>Stage<SortIcon col="stage"/></th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("score")}>Score<SortIcon col="score"/></th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("assignedTo")}>Assigned To<SortIcon col="assignedTo"/></th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("nextCall")}>Next Call<SortIcon col="nextCall"/></th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("age")}>Age<SortIcon col="age"/></th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pg.paged.map(l => {
                    const isOverdue = l.nextCall && l.nextCall < today && l.stage !== "NA";
                    const age = daysSince(l.createdDate);
                    return (
                    <tr key={l.id} style={isOverdue ? {background:"#FEF2F2"} : undefined}>
                      <td><input type="checkbox" checked={bulk.isSelected(l.id)} onChange={() => bulk.toggle(l.id)}/></td>
                      <td><span style={{fontFamily:"'Courier New',monospace", fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:4, background:"var(--s2)", color:"var(--text2)"}}>{l.leadId}</span></td>
                      <td>
                        <span style={{ fontWeight: 600, fontSize: 13, color:"var(--brand)", cursor:"pointer", textDecoration:"none" }}
                          onClick={() => setDetail(l)}
                          onMouseEnter={e => e.target.style.textDecoration="underline"}
                          onMouseLeave={e => e.target.style.textDecoration="none"}
                        >{l.company}</span>
                        <div style={{fontSize:11,color:"var(--text3)"}}>{l.source}{l.region ? ` · ${l.region}` : ""}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{l.contact}</div>
                        {l.email && <div style={{ fontSize: 11, color: "var(--text3)" }}>{l.email}</div>}
                      </td>
                      <td><ProdTag pid={l.product}/></td>
                      <td><LeadStageBadge stage={l.stage}/></td>
                      <td><LeadScore score={l.score}/></td>
                      <td><UserPill uid={l.assignedTo}/></td>
                      <td>
                        {isOverdue ? (
                          <span style={{fontSize:11,fontWeight:700,color:"#DC2626",display:"flex",alignItems:"center",gap:3}}>
                            <AlertTriangle size={11}/>{fmt.short(l.nextCall)}
                          </span>
                        ) : (
                          <span style={{fontSize:12,color:"var(--text3)"}}>{fmt.short(l.nextCall)}</span>
                        )}
                      </td>
                      <td>
                        <span style={{fontSize:11,fontWeight:600,color: age > 30 ? "#DC2626" : age > 14 ? "#F59E0B" : "#22C55E"}}>{age != null ? `${age}d` : "—"}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="icon-btn" aria-label="Log Call" title="Log Call"
                            style={{ color: "#3B82F6" }}
                            onClick={() => openCallLog(l)}>
                            <Phone size={14}/>
                          </button>
                          <button className="icon-btn" aria-label="Edit" onClick={() => openEdit(l)}>
                            <Edit2 size={14}/>
                          </button>
                          <button className="icon-btn" aria-label="Delete" onClick={() => setConfirm(l.id)}>
                            <Trash2 size={14}/>
                          </button>
                          {l.stage === "SAL" && (
                            <button className="icon-btn" aria-label="Convert to Opportunity"
                              title="Convert to Opportunity"
                              style={{ color: "var(--brand)" }}
                              onClick={() => handleConvert(l)}>
                              <ArrowRightCircle size={14}/>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <Pagination {...pg}/>
          </div>
        </div>

        {/* Right: Lead Insights Panel */}
        <div style={{width:270,flexShrink:0}}>
          {/* Source Distribution */}
          <div className="card" style={{padding:16,marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",color:"var(--text3)",letterSpacing:"0.06em",marginBottom:10}}>SOURCE DISTRIBUTION</div>
            {sourceDistribution.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={sourceDistribution} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="value" strokeWidth={2} stroke="white">
                      {sourceDistribution.map((s, i) => <Cell key={i} fill={s.color}/>)}
                    </Pie>
                    <Tooltip formatter={(v, name) => [`${v} leads`, name]}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:4}}>
                  {sourceDistribution.slice(0, 5).map(s => (
                    <span key={s.name} style={{fontSize:10,display:"flex",alignItems:"center",gap:3}}>
                      <span style={{width:8,height:8,borderRadius:2,background:s.color,display:"inline-block"}}/>{s.name} ({s.value})
                    </span>
                  ))}
                </div>
              </>
            ) : <div style={{fontSize:12,color:"var(--text3)",textAlign:"center",padding:20}}>No data</div>}
          </div>

          {/* Stage Funnel */}
          <div className="card" style={{padding:16,marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",color:"var(--text3)",letterSpacing:"0.06em",marginBottom:10}}>STAGE FUNNEL</div>
            {stageFunnel.map(s => (
              <div key={s.name} style={{marginBottom:6}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
                  <span style={{color:"var(--text2)",fontWeight:500}}>{s.name}</span>
                  <span style={{fontWeight:700,color:"var(--text1)"}}>{s.count}</span>
                </div>
                <div style={{height:6,background:"var(--s2)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${filtered.length ? (s.count / filtered.length * 100) : 0}%`,background:s.color,borderRadius:3,transition:"width 0.3s"}}/>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Stats & Recommendation */}
          <div className="card" style={{padding:16}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",color:"var(--text3)",letterSpacing:"0.06em",marginBottom:10}}>QUICK STATS</div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              <div style={{background:"var(--s2)",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:800,color:"var(--text1)"}}>{avgAge}d</div>
                <div style={{fontSize:9,color:"var(--text3)",fontWeight:600,textTransform:"uppercase"}}>Avg Age</div>
              </div>
              <div style={{background:"var(--s2)",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:800,color:"var(--text1)"}}>{mqlCount+sqlCount}</div>
                <div style={{fontSize:9,color:"var(--text3)",fontWeight:600,textTransform:"uppercase"}}>Qualifying</div>
              </div>
              <div style={{background:"var(--s2)",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:800,color: hotLeads > 0 ? "#1B6B5A" : "var(--text1)"}}>{hotLeads}</div>
                <div style={{fontSize:9,color:"var(--text3)",fontWeight:600,textTransform:"uppercase"}}>Hot Leads</div>
              </div>
              <div style={{background: overdueLeads > 0 ? "#FEF2F2" : "var(--s2)",borderRadius:8,padding:"8px 10px",textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:800,color: overdueLeads > 0 ? "#DC2626" : "var(--text1)"}}>{overdueLeads}</div>
                <div style={{fontSize:9,color: overdueLeads > 0 ? "#DC2626" : "var(--text3)",fontWeight:600,textTransform:"uppercase"}}>Overdue</div>
              </div>
            </div>

            {/* Next Step Recommendation */}
            <div style={{background:"#1B6B5A",borderRadius:8,padding:12,color:"white"}}>
              <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",opacity:0.8,marginBottom:6}}>RECOMMENDED ACTION</div>
              <div style={{fontSize:12,lineHeight:1.4}}>
                {overdueLeads > 0
                  ? `${overdueLeads} lead${overdueLeads > 1 ? "s have" : " has"} overdue follow-ups. Prioritise these calls today.`
                  : filtered.filter(l=>l.score>=70)[0]
                    ? `"${filtered.filter(l=>l.score>=70)[0].contact}" is hot — send proposal to close.`
                    : "All follow-ups on track. Focus on nurturing MQL leads."}
              </div>
            </div>

            {/* Top Lead */}
            {filtered.length > 0 && (() => {
              const top = [...filtered].sort((a, b) => b.score - a.score)[0];
              return (
                <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid var(--border)"}}>
                  <div style={{fontSize:10,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",marginBottom:6}}>TOP LEAD</div>
                  <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} onClick={() => setDetail(top)}>
                    <div style={{width:30,height:30,borderRadius:8,background:"#1B6B5A",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:11,fontWeight:700}}>
                      {top.company?.slice(0,2).toUpperCase()}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:"var(--text1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{top.company}</div>
                      <div style={{fontSize:10,color:"var(--text3)"}}>{top.contact} · Score {top.score}</div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {modal && (
        <Modal title={modal.mode === "add" ? "Add Lead" : "Edit Lead"} onClose={() => setModal(null)} lg
          footer={
            <>
              <button className="btn btn-sec" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save}><Check size={14}/>Save Lead</button>
            </>
          }
        >
          {/* Auto-generated Lead ID + Temperature */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,padding:"8px 12px",background:"var(--s2)",borderRadius:8}}>
            <span style={{fontSize:11,fontWeight:600,color:"var(--text3)"}}>Lead ID</span>
            <span style={{fontFamily:"'Courier New',monospace",fontSize:13,fontWeight:700,color:"var(--brand)"}}>{form.leadId}</span>
            <span style={{fontSize:10,color:"var(--text3)"}}>Auto-generated</span>
            <div style={{marginLeft:"auto",display:"flex",gap:4}}>
              {LEAD_TEMPERATURES.map(t => {
                const cols = {Hot:"#DC2626",Warm:"#F59E0B",Cool:"#3B82F6",Cold:"#94A3B8",Dead:"#64748B"};
                return <button key={t} type="button" onClick={() => setForm(f => ({...f, temperature:t}))}
                  style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:4,border:"none",cursor:"pointer",
                    background: form.temperature === t ? cols[t] : cols[t]+"18",
                    color: form.temperature === t ? "white" : cols[t]}}>{t}</button>;
              })}
            </div>
          </div>

          {/* ── A. PROSPECT DETAILS ── */}
          <div style={{fontSize:11,fontWeight:700,color:"var(--brand)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8,marginTop:4}}>A. Prospect Details</div>
          <div className="form-row">
            <div className="form-group"><label>Company Name *</label><input value={form.company} onChange={e => { setForm(f => ({...f, company:e.target.value})); setFormErrors(e => ({...e, company:undefined})); }} placeholder="Company name" style={formErrors.company ? {borderColor:"#DC2626"} : {}}/><FormError error={formErrors.company}/></div>
            <div className="form-group"><label>Contact Name *</label><input value={form.contact} onChange={e => { setForm(f => ({...f, contact:e.target.value})); setFormErrors(e => ({...e, contact:undefined})); }} placeholder="Contact person" style={formErrors.contact ? {borderColor:"#DC2626"} : {}}/><FormError error={formErrors.contact}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => { setForm(f => ({...f, email:e.target.value})); setFormErrors(e => ({...e, email:undefined})); }} placeholder="email@company.com" style={formErrors.email ? {borderColor:"#DC2626"} : {}}/><FormError error={formErrors.email}/></div>
            <div className="form-group"><label>Phone / WhatsApp</label><input value={form.phone} onChange={e => setForm(f => ({...f, phone:e.target.value}))} placeholder="+91-98765-00000"/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Designation</label><input value={form.designation||""} onChange={e => setForm(f => ({...f, designation:e.target.value}))} placeholder="e.g. VP Operations, Owner/MD"/></div>
            <div className="form-group"><label>No. of Users</label><input type="number" min="0" value={form.noOfUsers||0} onChange={e => setForm(f => ({...f, noOfUsers:+e.target.value}))}/></div>
          </div>

          {/* ── B. BUSINESS PROFILE ── */}
          <div style={{fontSize:11,fontWeight:700,color:"var(--brand)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8,marginTop:16,paddingTop:12,borderTop:"1px solid var(--border)"}}>B. Business Profile</div>
          <div className="form-row">
            <div className="form-group"><label>Business Type</label><select value={form.businessType||"Customs Broker"} onChange={e => setForm(f => ({...f, businessType:e.target.value}))}>{BUSINESS_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div className="form-group"><label>Staff Size</label><select value={form.staffSize||""} onChange={e => setForm(f => ({...f, staffSize:e.target.value}))}><option value="">Select</option>{STAFF_SIZES.map(s => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Branches</label><input type="number" min="0" value={form.branches||0} onChange={e => setForm(f => ({...f, branches:+e.target.value}))}/></div>
            <div className="form-group"><label>Product</label><select value={form.product} onChange={e => setForm(f => ({...f, product:e.target.value}))}>{PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Vertical</label><select value={form.vertical} onChange={e => setForm(f => ({...f, vertical:e.target.value}))}>{VERTICALS.map(v => <option key={v}>{v}</option>)}</select></div>
            <div className="form-group"><label>Region</label><select value={form.region} onChange={e => setForm(f => ({...f, region:e.target.value}))}>{REGIONS.map(r => <option key={r}>{r}</option>)}</select></div>
          </div>
          {/* Monthly Volume */}
          <div style={{fontSize:11,fontWeight:600,color:"var(--text3)",marginBottom:6,marginTop:8}}>Monthly Volume</div>
          <div className="form-row">
            <div className="form-group"><label>Air Exp (shpmts)</label><input value={form.monthlyVolume?.airExp||""} onChange={e => setForm(f => ({...f, monthlyVolume:{...f.monthlyVolume, airExp:e.target.value}}))} placeholder="e.g. 200"/></div>
            <div className="form-group"><label>Air Imp (shpmts)</label><input value={form.monthlyVolume?.airImp||""} onChange={e => setForm(f => ({...f, monthlyVolume:{...f.monthlyVolume, airImp:e.target.value}}))} placeholder="e.g. 150"/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Sea (TEUs/BLs)</label><input value={form.monthlyVolume?.seaTEU||""} onChange={e => setForm(f => ({...f, monthlyVolume:{...f.monthlyVolume, seaTEU:e.target.value}}))} placeholder="e.g. 50"/></div>
            <div className="form-group"><label>Customs Entries</label><input value={form.monthlyVolume?.customsEntries||""} onChange={e => setForm(f => ({...f, monthlyVolume:{...f.monthlyVolume, customsEntries:e.target.value}}))} placeholder="e.g. 500"/></div>
          </div>

          {/* ── C. CURRENT TECHNOLOGY ── */}
          <div style={{fontSize:11,fontWeight:700,color:"var(--brand)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8,marginTop:16,paddingTop:12,borderTop:"1px solid var(--border)"}}>C. Current Technology</div>
          <div className="form-row">
            <div className="form-group"><label>Current Software</label><select value={form.currentSoftware||""} onChange={e => setForm(f => ({...f, currentSoftware:e.target.value}))}><option value="">Select</option>{CURRENT_SOFTWARE.map(s => <option key={s}>{s}</option>)}</select></div>
            <div className="form-group"><label>Software Age</label><select value={form.swAge||""} onChange={e => setForm(f => ({...f, swAge:e.target.value}))}><option value="">Select</option>{SW_AGE.map(s => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div className="form-group">
            <label>Satisfaction (1–5): {form.swSatisfaction || "—"}</label>
            <div style={{display:"flex",gap:6,marginTop:4}}>
              {[1,2,3,4,5].map(n => <button key={n} type="button" onClick={() => setForm(f => ({...f, swSatisfaction:n}))}
                style={{width:32,height:28,borderRadius:6,border: form.swSatisfaction === n ? "2px solid var(--brand)" : "1px solid var(--border)",background: form.swSatisfaction === n ? "var(--brand)" : "white",color: form.swSatisfaction === n ? "white" : "var(--text2)",fontSize:12,fontWeight:700,cursor:"pointer"}}>{n}</button>)}
            </div>
          </div>

          {/* ── D. PAIN POINTS ── */}
          <div style={{fontSize:11,fontWeight:700,color:"var(--brand)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8,marginTop:16,paddingTop:12,borderTop:"1px solid var(--border)"}}>D. Pain Points</div>
          <div className="form-group">
            <label>Top Pain Points (select up to 3)</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
              {PAIN_POINTS.map(pp => {
                const sel = (form.painPoints||[]).includes(pp);
                return <button key={pp} type="button" onClick={() => {
                  const cur = form.painPoints || [];
                  setForm(f => ({...f, painPoints: sel ? cur.filter(x => x !== pp) : cur.length < 3 ? [...cur, pp] : cur}));
                }} style={{fontSize:10,padding:"4px 8px",borderRadius:4,border: sel ? "1px solid var(--brand)" : "1px solid var(--border)",background: sel ? "var(--brand)" : "white",color: sel ? "white" : "var(--text2)",cursor:"pointer",fontWeight: sel ? 700 : 400}}>{pp}</button>;
              })}
            </div>
          </div>

          {/* ── E. BUDGET & DECISION ── */}
          <div style={{fontSize:11,fontWeight:700,color:"var(--brand)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8,marginTop:16,paddingTop:12,borderTop:"1px solid var(--border)"}}>E. Budget & Decision</div>
          <div className="form-row">
            <div className="form-group"><label>Budget / Year</label><select value={form.budgetRange||""} onChange={e => setForm(f => ({...f, budgetRange:e.target.value}))}><option value="">Select</option>{BUDGET_RANGES.map(b => <option key={b}>{b}</option>)}</select></div>
            <div className="form-group"><label>Decision Maker</label><select value={form.decisionMaker||""} onChange={e => setForm(f => ({...f, decisionMaker:e.target.value}))}><option value="">Select</option>{DECISION_MAKERS.map(d => <option key={d}>{d}</option>)}</select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Decision Timeline</label><select value={form.decisionTimeline||""} onChange={e => setForm(f => ({...f, decisionTimeline:e.target.value}))}><option value="">Select</option>{DECISION_TIMELINES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div className="form-group"><label>Evaluating Others?</label><select value={form.evaluatingOthers||""} onChange={e => setForm(f => ({...f, evaluatingOthers:e.target.value}))}><option value="">Select</option>{EVALUATION_STATUS.map(e => <option key={e}>{e}</option>)}</select></div>
          </div>

          {/* ── F. NEXT STEPS & QUALIFICATION ── */}
          <div style={{fontSize:11,fontWeight:700,color:"var(--brand)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8,marginTop:16,paddingTop:12,borderTop:"1px solid var(--border)"}}>F. Next Steps & Qualification</div>
          <div className="form-row">
            <div className="form-group"><label>Source</label><select value={form.source} onChange={e => setForm(f => ({...f, source:e.target.value}))}>{LEAD_SOURCES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div className="form-group"><label>Next Step</label><select value={form.nextStep||""} onChange={e => setForm(f => ({...f, nextStep:e.target.value}))}><option value="">Select</option>{NEXT_STEPS.map(s => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Link to Account</label>
              <select value={form.accountId||""} onChange={e => setForm(f => ({...f, accountId:e.target.value||""}))}>
                <option value="">— None —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.accountNo ? `${a.accountNo} – ` : ""}{a.name}</option>)}
              </select>
              {form.accountId && (() => { const acct = accounts.find(a => a.id === form.accountId); return acct?.hierarchyPath ? <div style={{fontSize:11, color:"var(--text3)", marginTop:2}}>{acct.hierarchyPath}</div> : null; })()}
            </div>
            <div className="form-group"><label>Lead Stage</label><select value={form.stage} onChange={e => setForm(f => ({...f, stage:e.target.value}))}>{LEAD_STAGES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Assigned To</label><select value={form.assignedTo} onChange={e => setForm(f => ({...f, assignedTo:e.target.value}))}>{team.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Next Call Date {form.stage !== "NA" ? "*" : ""}</label>
              <input type="date" value={form.nextCall} onChange={e => { setForm(f => ({...f, nextCall:e.target.value})); setFormErrors(e => ({...e, nextCall:undefined})); }} style={formErrors.nextCall ? {borderColor:"#DC2626"} : {}}/>
              <FormError error={formErrors.nextCall}/>
            </div>
            <div className="form-group">
              <label>Score (0-100): {form.score}</label>
              <div style={{display:"flex",alignItems:"center",gap:10,marginTop:4}}>
                <input type="range" min="0" max="100" value={form.score} onChange={e => setForm(f => ({...f, score:+e.target.value}))} style={{flex:1}}/>
                <LeadScore score={form.score}/>
              </div>
              <FormError error={formErrors.score}/>
            </div>
          </div>
          <div className="form-group">
            <label>Observations / Key Notes</label>
            <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({...f, notes:e.target.value}))} placeholder="Key observations from meeting..." style={{width:"100%",resize:"vertical"}}/>
          </div>
          <div className="form-group">
            <label>Objections Raised</label>
            <textarea rows={2} value={form.objections||""} onChange={e => setForm(f => ({...f, objections:e.target.value}))} placeholder="Any objections or concerns raised..." style={{width:"100%",resize:"vertical"}}/>
          </div>
        </Modal>
      )}

      {/* Delete Confirmation */}
      {confirm && (
        <Confirm
          title="Delete Lead"
          msg="This will permanently remove this lead. This action cannot be undone."
          onConfirm={() => del(confirm)}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Lead Profile Detail View */}
      {detail && (
        <LeadDetail
          lead={detail}
          onClose={() => setDetail(null)}
          accounts={accounts}
          contacts={allContacts || []}
          onConvertToOpp={handleConvert}
          onEdit={(l) => { setDetail(null); openEdit(l); }}
          orgUsers={orgUsers}
          activities={activities}
          callReports={callReports}
          setActivities={setActivities}
          setCallReports={setCallReports}
        />
      )}

      {/* ──── LOG CALL MODAL ──── */}
      {callLogModal && callLogForm && (() => {
        const lead = callLogModal;
        const _callTypes = masters?.callTypes?.map(t => t.name) || CALL_TYPES;
        const _callObjectives = masters?.callSubjects?.map(t => t.name) || CALL_OBJECTIVES;
        const accContacts = lead.accountId ? (allContacts || []).filter(c => c.accountId === lead.accountId) : [];
        return (
          <div className="overlay" onClick={e => e.target === e.currentTarget && (setCallLogModal(null), setCallLogForm(null))} style={{zIndex:1100}}>
            <div style={{background:"white",borderRadius:16,width:"90vw",maxWidth:680,maxHeight:"88vh",overflow:"auto",boxShadow:"0 25px 60px rgba(0,0,0,0.3)"}}>
              <div style={{padding:"20px 28px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div>
                  <div style={{fontSize:17,fontWeight:700,color:"var(--text1)",display:"flex",alignItems:"center",gap:8}}>
                    <PhoneCall size={18} style={{color:"#3B82F6"}}/> Log Call
                  </div>
                  <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                    {lead.leadId} &middot; {lead.company} &middot; {lead.contact}
                  </div>
                </div>
                <button className="icon-btn" onClick={() => { setCallLogModal(null); setCallLogForm(null); }} style={{width:32,height:32,fontSize:18}}>✕</button>
              </div>
              <div style={{padding:"20px 28px"}}>
                {/* Pre-filled context */}
                <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
                  {lead.accountId && (() => { const acc = accounts.find(a => a.id === lead.accountId); return acc ? <span style={{fontSize:11,padding:"3px 10px",borderRadius:6,background:"var(--s2)",color:"var(--text2)",fontWeight:600}}>Account: {acc.name}</span> : null; })()}
                  <span style={{fontSize:11,padding:"3px 10px",borderRadius:6,background:"var(--s2)",color:"var(--text2)",fontWeight:600}}>Lead: {lead.leadId}</span>
                  <span style={{fontSize:11,padding:"3px 10px",borderRadius:6,background:"var(--s2)",color:"var(--text2)",fontWeight:600}}>Contact: {lead.contact}</span>
                </div>

                <div className="form-row">
                  <div className="form-group"><label>Call Type</label>
                    <select value={callLogForm.callType} onChange={e => setCallLogForm(f => ({...f, callType: e.target.value}))}>
                      {_callTypes.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label>Objective</label>
                    <select value={callLogForm.objective} onChange={e => setCallLogForm(f => ({...f, objective: e.target.value}))}>
                      {_callObjectives.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group"><label>Date</label>
                    <input type="date" value={callLogForm.date} onChange={e => setCallLogForm(f => ({...f, date: e.target.value}))}/>
                  </div>
                  <div className="form-group"><label>Time</label>
                    <input type="time" value={callLogForm.time} onChange={e => setCallLogForm(f => ({...f, time: e.target.value}))}/>
                  </div>
                  <div className="form-group"><label>Duration (min)</label>
                    <input type="number" min="1" max="480" value={callLogForm.duration} onChange={e => setCallLogForm(f => ({...f, duration: +e.target.value}))}/>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group"><label>Contacts (from account)</label>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4,minHeight:32,padding:"4px 8px",border:"1px solid var(--border)",borderRadius:8,background:"white"}}>
                      {accContacts.length > 0 ? accContacts.map(c => {
                        const sel = callLogForm.contactIds.includes(c.id);
                        return <button key={c.id} type="button" onClick={() => setCallLogForm(f => ({...f, contactIds: sel ? f.contactIds.filter(x => x !== c.id) : [...f.contactIds, c.id]}))}
                          style={{fontSize:10,padding:"3px 8px",borderRadius:4,border: sel ? "1px solid var(--brand)" : "1px solid var(--border)",background: sel ? "var(--brand)" : "white",color: sel ? "white" : "var(--text2)",cursor:"pointer",fontWeight: sel ? 700 : 400}}>{c.name}</button>;
                      }) : <span style={{fontSize:11,color:"var(--text3)",padding:"4px 0"}}>No contacts linked — lead contact: {lead.contact}</span>}
                    </div>
                  </div>
                  <div className="form-group"><label>Our Participants</label>
                    <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4,minHeight:32,padding:"4px 8px",border:"1px solid var(--border)",borderRadius:8,background:"white"}}>
                      {team.map(u => {
                        const sel = callLogForm.ourParticipants.includes(u.id);
                        return <button key={u.id} type="button" onClick={() => setCallLogForm(f => ({...f, ourParticipants: sel ? f.ourParticipants.filter(x => x !== u.id) : [...f.ourParticipants, u.id]}))}
                          style={{fontSize:10,padding:"3px 8px",borderRadius:4,border: sel ? "1px solid var(--brand)" : "1px solid var(--border)",background: sel ? "var(--brand)" : "white",color: sel ? "white" : "var(--text2)",cursor:"pointer",fontWeight: sel ? 700 : 400}}>{u.name}</button>;
                      })}
                    </div>
                  </div>
                </div>

                <div className="form-group" style={{marginBottom:14}}><label>Discussion Notes</label>
                  <textarea value={callLogForm.notes} onChange={e => setCallLogForm(f => ({...f, notes: e.target.value}))}
                    placeholder="Key discussion points, action items..." rows={3} style={{width:"100%",resize:"vertical"}}/>
                </div>

                <div className="form-row">
                  <div className="form-group"><label>Outcome</label>
                    <select value={callLogForm.outcome} onChange={e => setCallLogForm(f => ({...f, outcome: e.target.value}))}>
                      {CALL_OUTCOMES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label>Next Call Date</label>
                    <input type="date" value={callLogForm.nextCallDate} onChange={e => setCallLogForm(f => ({...f, nextCallDate: e.target.value}))}/>
                  </div>
                </div>

                <div className="form-group" style={{marginBottom:14}}><label>Next Step</label>
                  <input value={callLogForm.nextStep} onChange={e => setCallLogForm(f => ({...f, nextStep: e.target.value}))} placeholder="e.g. Send proposal, Schedule demo..."/>
                </div>

                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,padding:"10px 14px",background:"var(--s2)",borderRadius:8}}>
                  <input type="checkbox" id="createFollowUp" checked={callLogForm.createFollowUp} onChange={e => setCallLogForm(f => ({...f, createFollowUp: e.target.checked}))}/>
                  <label htmlFor="createFollowUp" style={{fontSize:12,fontWeight:600,color:"var(--text1)",cursor:"pointer"}}>Create follow-up activity</label>
                  <span style={{fontSize:11,color:"var(--text3)"}}>(auto-creates an activity record for the next call date)</span>
                </div>

                <div style={{display:"flex",justifyContent:"flex-end",gap:8,paddingTop:12,borderTop:"1px solid var(--border)"}}>
                  <button className="btn btn-sec" onClick={() => { setCallLogModal(null); setCallLogForm(null); }}>Cancel</button>
                  <button className="btn btn-primary" onClick={saveCallLog} disabled={!callLogForm.notes?.trim()}>
                    <PhoneCall size={14}/>Save Call Log
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default Leads;
