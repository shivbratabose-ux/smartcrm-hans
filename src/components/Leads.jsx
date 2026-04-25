import { useState, useMemo, useEffect } from "react";
import { Plus, Search, Edit2, Trash2, Check, Download, ArrowRightCircle, Users, Mail, Phone, Globe, FileText, Calendar, TrendingUp, MapPin, Building2, User, Star, Briefcase, Clock, Paperclip, AlertTriangle, PhoneCall, Filter, ArrowUpDown, ArrowUp, ArrowDown, MessageSquare, UserPlus, ChevronDown, ChevronUp, ShieldCheck, X, Save, Home, Warehouse, Upload, ChevronRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { PRODUCTS, TEAM, TEAM_MAP, PROD_MAP, LEAD_STAGES, LEAD_STAGE_MAP, VERTICALS, LEAD_SOURCES, REGIONS, HIERARCHY_LEVELS, LEAD_TEMPERATURES, BUSINESS_TYPES, STAFF_SIZES, CURRENT_SOFTWARE, SW_AGE, PAIN_POINTS, BUDGET_RANGES, DECISION_MAKERS, DECISION_TIMELINES, EVALUATION_STATUS, NEXT_STEPS, CALL_TYPES, CALL_OBJECTIVES, CALL_OUTCOMES, STAGE_GATES, OPP_CONTACT_ROLES, LEAD_CONTACT_ROLES, COUNTRIES } from '../data/constants';
import { BLANK_LEAD } from '../data/seed';
import { fmt, uid, cmp, sanitizeObj, hasErrors, today, validateStageGate, getScopedUserIds, upper } from '../utils/helpers';
import { StatusBadge, ProdTag, UserPill, Modal, Confirm, DeleteConfirm, FormError, Empty, InlineContactForm, LogCallModal, PageTip, TypeaheadSelect } from './shared';
import Pagination, { usePagination } from './Pagination';
import ProductModulePicker, { validateProductSelection, primaryProductId } from './ProductModulePicker';
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
  if (!f.source?.trim()) errs.source = "Lead source is required";
  if (f.score < 0 || f.score > 100) errs.score = "Score must be between 0 and 100";
  // Required: at least one product line + module-or-None per line
  const psErr = validateProductSelection(f.productSelection);
  if (psErr) errs.productSelection = psErr;
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
  { label: "leadId",           accessor: l => l.leadId || "" },
  { label: "company",          accessor: l => l.company },
  { label: "contactName",      accessor: l => l.contact },
  { label: "email",            accessor: l => l.email },
  { label: "phone",            accessor: l => l.phone },
  { label: "product",          accessor: l => l.product },
  { label: "vertical",         accessor: l => l.vertical },
  { label: "region",           accessor: l => l.region },
  { label: "source",           accessor: l => l.source },
  { label: "stage",            accessor: l => l.stage },
  { label: "score",            accessor: l => l.score },
  { label: "assignedTo",       accessor: l => l.assignedTo },
  { label: "nextCall",         accessor: l => l.nextCall },
  { label: "createdDate",      accessor: l => l.createdDate },
  { label: "country",          accessor: l => l.country || "" },
  { label: "state",            accessor: l => l.state || "" },
  { label: "city",             accessor: l => l.city || "" },
  { label: "companyWebsite",   accessor: l => l.companyWebsite || "" },
  { label: "alternatePhone",   accessor: l => l.alternatePhone || "" },
  { label: "alternateEmail",   accessor: l => l.alternateEmail || "" },
  { label: "linkedInUrl",      accessor: l => l.linkedInUrl || "" },
  { label: "annualRevenue",    accessor: l => l.annualRevenue || 0 },
  { label: "campaignName",     accessor: l => l.campaignName || "" },
  { label: "referredBy",       accessor: l => l.referredBy || "" },
  { label: "expectedCloseDate",accessor: l => l.expectedCloseDate || "" },
  { label: "estimatedValue",   accessor: l => l.estimatedValue || 0 },
  { label: "proposalSent",     accessor: l => l.proposalSent || "No" },
  { label: "demoScheduled",    accessor: l => l.demoScheduled || "No" },
  { label: "competitorName",   accessor: l => l.competitorName || "" },
  { label: "lastContactDate",  accessor: l => l.lastContactDate || "" },
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
function ConvertToOppModal({ lead, onClose, accounts, contacts, onConvert, orgUsers, setContacts }) {
  const _team = orgUsers?.length ? orgUsers.filter(u => u.status !== 'Inactive') : TEAM;
  const gateResult = validateStageGate(lead, "Converted", STAGE_GATES);
  const [showGateDetails, setShowGateDetails] = useState(false);
  const [showInlineContact, setShowInlineContact] = useState(false);
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
    selectedProducts: lead.product ? [lead.product] : [],
    keepLeadOpen: false,
    contactRoles: {},
    lob: "",
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!form.title?.trim()) errs.title = "Opportunity name is required";
    if (!form.accountId && !form.createNewAccount) errs.accountId = "Select an account or create new";
    if (!lead.email && !lead.phone && !(lead.contactIds?.length)) errs.contact = "Lead must have a valid email or phone";
    if (!form.notes?.trim() || form.notes.trim().length < 10) errs.notes = "Qualification notes required (min 10 chars)";
    if (!form.closeDate) errs.closeDate = "Expected close date is required";
    if (form.selectedProducts.length === 0) errs.products = "Select at least one product";
    return errs;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onConvert(lead, { ...form, keepLeadOpen: form.keepLeadOpen });
    onClose();
  };

  const accContacts = form.accountId ? (contacts || []).filter(c => c.accountId === form.accountId) : [];
  const leadContactIds = lead.contactIds || [];
  const relevantContacts = accContacts.length > 0 ? accContacts : (contacts || []).filter(c => leadContactIds.includes(c.id));

  const handleInlineContactSave = (contactData) => {
    const newContact = {
      ...contactData,
      id: `c-${uid()}`,
      accountId: form.accountId || lead.accountId || "",
      primary: false,
      contactId: `CON-${Date.now()}`,
      departments: [],
      products: [],
      branches: [],
      countries: [],
      linkedOpps: [],
    };
    if (setContacts) setContacts(p => [...p, newContact]);
    setForm(f => ({ ...f, contactRoles: { ...f.contactRoles, [newContact.id]: OPP_CONTACT_ROLES[0] } }));
    setShowInlineContact(false);
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()} style={{zIndex:1100}}>
      <div style={{background:"white",borderRadius:16,width:"90vw",maxWidth:720,maxHeight:"88vh",overflow:"auto",boxShadow:"0 25px 60px rgba(0,0,0,0.3)"}}>
        <div style={{padding:"20px 28px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:17,fontWeight:700,color:"var(--text1)"}}>Convert Lead to Opportunity</div>
            <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>Lead: {lead.leadId} – {lead.company}</div>
            <div style={{fontSize:12,fontWeight:600,color:"#1B6B5A",marginTop:4,fontFamily:"'Courier New',monospace"}}>Opportunity ID: {lead.leadId ? `O${lead.leadId}` : "OPP-" + new Date().getFullYear() + "-***"}</div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{width:32,height:32,fontSize:18}}>✕</button>
        </div>
        <div style={{padding:"20px 28px"}}>

          {/* Stage Gate Checklist */}
          <div style={{background: gateResult.canAdvance ? "#F0FDF4" : "#FFFBEB",border:`1px solid ${gateResult.canAdvance ? "#BBF7D0" : "#FDE68A"}`,borderRadius:10,padding:"12px 16px",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}} onClick={() => setShowGateDetails(v => !v)}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <ShieldCheck size={16} style={{color: gateResult.canAdvance ? "#16A34A" : "#D97706"}}/>
                <span style={{fontSize:13,fontWeight:700,color: gateResult.canAdvance ? "#15803D" : "#92400E"}}>
                  Conversion Gate: {gateResult.canAdvance ? "All checks passed" : `${gateResult.failed.length} check${gateResult.failed.length > 1 ? "s" : ""} remaining`}
                </span>
              </div>
              {showGateDetails ? <ChevronUp size={14} style={{color:"var(--text3)"}}/> : <ChevronDown size={14} style={{color:"var(--text3)"}}/>}
            </div>
            {showGateDetails && (
              <div style={{marginTop:10,display:"grid",gap:4}}>
                {gateResult.passed.map(c => (
                  <div key={c.key} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}>
                    <Check size={13} style={{color:"#16A34A"}}/><span style={{color:"#15803D"}}>{c.label}</span>
                  </div>
                ))}
                {gateResult.failed.map(c => (
                  <div key={c.key} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}>
                    <X size={13} style={{color:"#DC2626"}}/><span style={{color:"#991B1B"}}>{c.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Validation Warning */}
          {(!lead.email && !lead.phone && !(lead.contactIds?.length)) && (
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

          {/* Multi-Product Selection */}
          <div className="form-group" style={{marginBottom:14}}>
            <label>Products / Services *</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:4}}>
              {PRODUCTS.map(p => {
                const sel = form.selectedProducts.includes(p.id);
                return <button key={p.id} type="button" onClick={() => setForm(f => ({...f, selectedProducts: sel ? f.selectedProducts.filter(x => x !== p.id) : [...f.selectedProducts, p.id]}))}
                  style={{fontSize:11,padding:"4px 10px",borderRadius:6,border: sel ? `2px solid ${p.color}` : "1px solid var(--border)",background: sel ? p.bg : "white",color: sel ? p.text : "var(--text2)",cursor:"pointer",fontWeight: sel ? 700 : 400,display:"flex",alignItems:"center",gap:4}}>
                  {sel && <Check size={11}/>}{p.name}
                </button>;
              })}
            </div>
            {errors.products && <FormError error={errors.products}/>}
          </div>

          {/* LOB Field */}
          <div className="form-row">
            <div className="form-group"><label>Line of Business (LOB)</label>
              <input value={form.lob} onChange={e => setForm(f => ({...f, lob: e.target.value}))} placeholder="e.g. Air Cargo Operations, Customs Brokerage"/>
            </div>
            <div className="form-group"><label>Opportunity Value (₹L) *</label>
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
              <TypeaheadSelect
                value={form.owner}
                onChange={(id) => setForm(f => ({...f, owner: id}))}
                options={_team.map(u => ({ value: u.id, label: u.name, sub: u.role }))}
                placeholder="Search owners…"
              />
            </div>
            <div className="form-group"><label>Forecast Category</label>
              <select value={form.forecastCategory} onChange={e => setForm(f => ({...f, forecastCategory: e.target.value}))}>
                {["Best-Case","Likely-Case","Worst-Case","Not Applicable"].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Contact Role Assignment */}
          {relevantContacts.length > 0 && (
            <div className="form-group" style={{marginBottom:14}}>
              <label style={{display:"flex",alignItems:"center",gap:6}}>Contact Roles
                <button type="button" className="btn btn-sm btn-sec" style={{fontSize:10,padding:"2px 8px"}} onClick={() => setShowInlineContact(true)}>
                  <UserPlus size={11}/>Add Contact
                </button>
              </label>
              <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden",marginTop:4}}>
                {relevantContacts.map(c => (
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:"1px solid var(--border)",background:"white"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <span style={{fontSize:12,fontWeight:600,color:"var(--text1)"}}>{c.name}</span>
                      {c.designation && <span style={{fontSize:11,color:"var(--text3)",marginLeft:6}}>{c.designation}</span>}
                    </div>
                    <select value={form.contactRoles[c.id] || ""} onChange={e => setForm(f => ({...f, contactRoles: {...f.contactRoles, [c.id]: e.target.value}}))}
                      style={{fontSize:11,padding:"3px 8px",borderRadius:4,border:"1px solid var(--border)",minWidth:160}}>
                      <option value="">— Assign role —</option>
                      {OPP_CONTACT_ROLES.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inline Add Contact */}
          {showInlineContact && (
            <InlineContactForm
              accountId={form.accountId || lead.accountId || ""}
              onSave={handleInlineContactSave}
              onCancel={() => setShowInlineContact(false)}
            />
          )}

          {/* Add Contact button when no contacts exist */}
          {relevantContacts.length === 0 && !showInlineContact && (
            <div style={{marginBottom:14}}>
              <button type="button" className="btn btn-sm btn-sec" onClick={() => setShowInlineContact(true)} style={{fontSize:11}}>
                <UserPlus size={12}/>Add Contact for Role Assignment
              </button>
            </div>
          )}

          <div className="form-group" style={{marginBottom:14}}><label>Qualification Notes / Remarks *</label>
            <textarea value={form.notes} onChange={e => { setForm(f => ({...f, notes: e.target.value})); setErrors(e2 => ({...e2, notes: undefined})); }}
              placeholder="Key qualification details, client requirements, objections..." rows={3}
              style={errors.notes ? {borderColor:"#DC2626"} : {}}/>
            {errors.notes && <FormError error={errors.notes}/>}
          </div>

          {/* Keep Lead Open Checkbox */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,padding:"10px 14px",background:"var(--s2)",borderRadius:8}}>
            <input type="checkbox" id="keepLeadOpen" checked={form.keepLeadOpen} onChange={e => setForm(f => ({...f, keepLeadOpen: e.target.checked}))}/>
            <label htmlFor="keepLeadOpen" style={{fontSize:12,fontWeight:600,color:"var(--text1)",cursor:"pointer"}}>Keep lead open for additional LOBs</label>
            <span style={{fontSize:11,color:"var(--text3)"}}>(won't mark as Converted; adds opp ID to lead)</span>
          </div>

          <div style={{display:"flex",justifyContent:"flex-end",gap:8,paddingTop:12,borderTop:"1px solid var(--border)"}}>
            <button className="btn btn-sec" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={!lead.email && !lead.phone && !(lead.contactIds?.length)}>
              <ArrowRightCircle size={14}/>Convert to Opportunity
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadDetail({ lead, onClose, accounts, contacts, onConvertToOpp, onEdit, onLogCall, orgUsers, activities: allActivities, callReports, setActivities, setCallReports, setContacts, setLeads }) {
  const _team = orgUsers?.length ? orgUsers.filter(u => u.status !== 'Inactive') : TEAM;
  const _teamMap = Object.fromEntries(_team.map(u => [u.id, u]));
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showStageGate, setShowStageGate] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const linkedAccount = lead.accountId ? accounts.find(a => a.id === lead.accountId) : null;
  const stageInfo = LEAD_STAGE_MAP[lead.stage];
  const productInfo = PROD_MAP[lead.product];
  const assignee = _teamMap[lead.assignedTo];
  const winProb = Math.min(Math.round(lead.score * 0.85 + 5), 99);
  const dealValue = lead.estimatedValue > 0 ? Number(lead.estimatedValue).toFixed(2) : (lead.score * 0.5).toFixed(2);
  const pipelineValue = (dealValue * winProb / 100).toFixed(2);

  // ── Per-field click-to-edit state ──
  const [editingField, setEditingField] = useState(null);
  const [fieldVal, setFieldVal] = useState("");
  const startFieldEdit = (field) => { setEditingField(field); setFieldVal(lead[field] ?? ""); };
  const saveFieldEdit = (field, val) => {
    updateLead({ [field]: val !== undefined ? val : fieldVal });
    setEditingField(null); setFieldVal("");
  };
  const cancelFieldEdit = () => { setEditingField(null); setFieldVal(""); };
  const updateLead = (patch) => {
    if (setLeads) setLeads(prev => prev.map(l => l.id === lead.id ? {...l, ...patch} : l));
  };

  // ── Contacts data ──
  const linkedContactIds = lead.contactIds || [];
  const linkedContacts = (contacts || []).filter(c => linkedContactIds.includes(c.id));
  const accountContacts = (contacts || []).filter(c => lead.accountId && c.accountId === lead.accountId && !linkedContactIds.includes(c.id));
  const contactRolesMap = lead.contactRoles || {};
  const displayContacts = [
    { id: "_primary", name: lead.contact, designation: lead.designation || "Primary Contact", department: productInfo?.name || "General", email: lead.email, phone: lead.phone, role: "Primary Contact", isPrimary: true },
    ...linkedContacts.map(c => ({ id: c.id, name: c.name, designation: c.designation || "", department: c.department || "", email: c.email, phone: c.phone, role: contactRolesMap[c.id] || "Other" })),
    ...accountContacts.map(c => ({ id: c.id, name: c.name, designation: c.designation || c.role, department: c.department || "", email: c.email, phone: c.phone, role: contactRolesMap[c.id] || "Account Contact" })),
  ];

  // ── Addresses data ──
  const addresses = lead.addresses || [];

  // ── Sales Team data ──
  const salesTeam = lead.salesTeam || [{userId: lead.assignedTo, role: "Sales Owner"}];
  const TEAM_ROLES = ["Sales Owner","Account Manager","Pre-sales","Inside Sales","Support"];

  // ── Activities / Timeline ──
  const leadActivities = (allActivities||[]).filter(a => a.accountId === lead.accountId || (lead.contactIds||[]).includes(a.contactId) || a.leadId === lead.id);
  const leadCalls = (callReports||[]).filter(cr => cr.accountId === lead.accountId || cr.leadId === lead.id);
  const combinedTimeline = [
    ...leadActivities.map(a => ({ type: "activity", date: a.date || a.createdDate || "", icon: <MessageSquare size={13}/>, title: a.title || a.type || "Activity", desc: a.notes || a.description || "", time: a.date || a.createdDate || "" })),
    ...leadCalls.map(cr => ({ type: "call", date: cr.date || cr.callDate || "", icon: <Phone size={13}/>, title: cr.callType || "Call", desc: cr.notes || cr.outcome || "", time: cr.date || cr.callDate || "" })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const displayTimeline = combinedTimeline.length > 0 ? combinedTimeline : [
    { icon: <Calendar size={13}/>, title: "Lead Created", desc: `Lead ${lead.leadId} was created`, time: lead.createdDate || "" },
  ];

  // ── Inline forms for activities tab ──
  const [showCallForm, setShowCallForm] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [callForm, setCallForm] = useState({ callType: "Discovery", date: today, notes: "", outcome: "Interested", nextCallDate: "" });
  const [actForm, setActForm] = useState({ title: "", type: "Call", date: today, notes: "" });
  const [expandedTimeline, setExpandedTimeline] = useState(null);

  const saveCallLog = () => {
    if (!callForm.notes?.trim()) return;
    const newCall = { id: `cr-${Date.now()}`, accountId: lead.accountId || "", leadId: lead.id, contactId: lead.contact || "", callType: callForm.callType, date: callForm.date, callDate: callForm.date, notes: callForm.notes, outcome: callForm.outcome, nextCallDate: callForm.nextCallDate, createdBy: "" };
    setCallReports(p => [...p, newCall]);
    setCallForm({ callType: "Discovery", date: today, notes: "", outcome: "Interested", nextCallDate: "" });
    setShowCallForm(false);
  };
  const saveActivity = () => {
    if (!actForm.title?.trim()) return;
    const newAct = { id: `act-${Date.now()}`, accountId: lead.accountId || "", contactId: lead.contact || "", leadId: lead.id, title: actForm.title, type: actForm.type, date: actForm.date, notes: actForm.notes, createdDate: today };
    setActivities(p => [...p, newAct]);
    setActForm({ title: "", type: "Call", date: today, notes: "" });
    setShowActivityForm(false);
  };

  // ── Contacts tab state ──
  const [showAddContact, setShowAddContact] = useState(false);
  const [showNewContactForm, setShowNewContactForm] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactEditData, setContactEditData] = useState({});

  // ── Addresses tab state ──
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addressForm, setAddressForm] = useState({ type: "HQ", line1: "", line2: "", city: "", state: "", country: "India", pin: "", phone: "", email: "", status: "Active", isPrimary: false });
  const [editingAddress, setEditingAddress] = useState(null);
  const [expandedAddress, setExpandedAddress] = useState(null);

  // ── Team tab state ──
  const [showAddTeamMember, setShowAddTeamMember] = useState(false);
  const [newTeamMember, setNewTeamMember] = useState({ userId: "", role: "Inside Sales" });

  // ── Documents ──
  const documents = lead.documents || [];
  const [showDocForm, setShowDocForm] = useState(false);
  const [docForm, setDocForm] = useState({ name: "", url: "", type: "PDF" });
  const saveDoc = () => {
    if (!docForm.name?.trim()) return;
    const newDoc = { id: `doc-${Date.now()}`, name: docForm.name.trim(), url: docForm.url.trim(), type: docForm.type, size: "—", date: today };
    updateLead({ documents: [...documents, newDoc] });
    setDocForm({ name: "", url: "", type: "PDF" });
    setShowDocForm(false);
  };
  const deleteDoc = (docId) => {
    updateLead({ documents: documents.filter(d => d.id !== docId) });
  };

  // ── Tab definitions ──
  const TABS = [
    { id: "overview", label: "Overview", icon: <TrendingUp size={13}/> },
    { id: "contacts", label: "Contacts", icon: <Users size={13}/> },
    { id: "addresses", label: "Addresses", icon: <MapPin size={13}/> },
    { id: "team", label: "Team", icon: <User size={13}/> },
    { id: "activities", label: "Activities", icon: <Clock size={13}/> },
    { id: "documents", label: "Documents", icon: <Paperclip size={13}/> },
    ...(lead.stage !== "NA" ? [{ id: "convert", label: "Convert", icon: <ArrowRightCircle size={13}/> }] : []),
  ];

  // ── Editable field helper — click any value to edit inline ──
  const editField = (label, field, type, options) => {
    const isEditing = editingField === field;
    const rawVal = lead[field] ?? "";
    const iStyle = {fontSize:12,padding:"4px 8px",borderRadius:6,border:"1px solid var(--brand)",width:"100%",boxSizing:"border-box",outline:"none"};

    if (!isEditing) {
      let display = rawVal;
      if (field === "product") display = PROD_MAP[rawVal]?.name || rawVal;
      else if (field === "stage") display = LEAD_STAGE_MAP[rawVal]?.name || rawVal;
      else if (field === "assignedTo") display = _teamMap[rawVal]?.name || rawVal;
      else if (field === "estimatedValue") display = rawVal > 0 ? `₹${rawVal} L` : "— (auto from score)";
      return (
        <div onClick={() => startFieldEdit(field)} title="Click to edit"
          style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid var(--border)",cursor:"pointer",borderRadius:4,transition:"background 0.1s"}}
          onMouseEnter={e=>e.currentTarget.style.background="#F8FAFC"} onMouseLeave={e=>e.currentTarget.style.background=""}>
          <span style={{fontSize:12,color:"var(--text3)",fontWeight:500}}>{label}</span>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <span style={{fontSize:12,color:"var(--text1)",fontWeight:600,textAlign:"right"}}>{display || "—"}</span>
            <Edit2 size={10} style={{color:"var(--text3)",opacity:0.4,flexShrink:0}}/>
          </div>
        </div>
      );
    }

    let input;
    if (type === "select" && options) {
      input = <select autoFocus value={fieldVal} onChange={e => setFieldVal(e.target.value)}
        onBlur={() => saveFieldEdit(field)} style={iStyle}>
        {options.map(o => <option key={typeof o==="object"?o.id:o} value={typeof o==="object"?o.id:o}>{typeof o==="object"?o.name:o}</option>)}
      </select>;
    } else if (type === "date") {
      input = <input type="date" autoFocus value={fieldVal} onChange={e => setFieldVal(e.target.value)}
        onBlur={() => saveFieldEdit(field)} onKeyDown={e=>{if(e.key==="Escape")cancelFieldEdit();}} style={iStyle}/>;
    } else if (type === "range") {
      input = <div style={{display:"flex",alignItems:"center",gap:8}}>
        <input type="range" min="0" max="100" value={fieldVal} onChange={e => setFieldVal(+e.target.value)} style={{flex:1}}/>
        <span style={{fontSize:12,fontWeight:600,minWidth:28}}>{fieldVal}</span>
        <button onClick={()=>saveFieldEdit(field)} style={{fontSize:10,padding:"2px 8px",borderRadius:5,background:"var(--brand)",color:"white",border:"none",cursor:"pointer"}}>✓</button>
        <button onClick={cancelFieldEdit} style={{fontSize:10,padding:"2px 8px",borderRadius:5,background:"var(--s2)",border:"none",cursor:"pointer"}}>✕</button>
      </div>;
    } else if (type === "textarea") {
      input = <textarea autoFocus value={fieldVal} onChange={e => setFieldVal(e.target.value)}
        onBlur={() => saveFieldEdit(field)} rows={3} style={{...iStyle,resize:"vertical"}}/>;
    } else if (type === "number") {
      input = <input type="number" min="0" step="0.01" autoFocus value={fieldVal} onChange={e => setFieldVal(e.target.value)}
        onBlur={() => saveFieldEdit(field, +fieldVal)}
        onKeyDown={e=>{if(e.key==="Enter")saveFieldEdit(field, +fieldVal);if(e.key==="Escape")cancelFieldEdit();}}
        style={iStyle}/>;
    } else {
      input = <input autoFocus value={fieldVal} onChange={e => setFieldVal(e.target.value)}
        onBlur={() => saveFieldEdit(field)}
        onKeyDown={e=>{if(e.key==="Enter")saveFieldEdit(field);if(e.key==="Escape")cancelFieldEdit();}}
        style={iStyle}/>;
    }
    return (
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:"1px solid var(--border)",gap:12}}>
        <span style={{fontSize:12,color:"var(--text3)",fontWeight:500,minWidth:100,flexShrink:0}}>{label}</span>
        <div style={{flex:1,maxWidth:"65%"}}>{input}</div>
      </div>
    );
  };

  // ── Stage gate for advance ──
  const STAGE_ORDER = ["MQL","SQL","SAL","Converted"];
  const curIdx = STAGE_ORDER.indexOf(lead.stage);
  const nextStage = curIdx >= 0 && curIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[curIdx + 1] : null;
  const nextGateResult = nextStage ? validateStageGate(lead, nextStage, STAGE_GATES) : null;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Lead Profile"
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{zIndex:1000}}>
      <div style={{
        background:"var(--bg,#F1F5F9)",width:"94vw",maxWidth:1200,maxHeight:"94vh",
        borderRadius:16,overflow:"hidden",display:"flex",flexDirection:"column",
        boxShadow:"0 25px 60px rgba(0,0,0,0.3)"
      }}>
        {/* ═══ Header ═══ */}
        <div style={{background:"white",padding:"18px 28px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:44,height:44,borderRadius:12,background:"#1B6B5A",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:16,fontWeight:700}}>
              {lead.company?.slice(0,2).toUpperCase()}
            </div>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
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
            {lead.stage !== "Converted" && lead.stage !== "NA" && (
              <button className="btn btn-primary" onClick={() => setShowConvertModal(true)}>
                <ArrowRightCircle size={14}/>Convert
              </button>
            )}
            {lead.stage === "Converted" && (
              <span style={{fontSize:11,fontWeight:600,color:"#16A34A",background:"#F0FDF4",padding:"5px 12px",borderRadius:6}}>
                Converted{lead.convertedOppRefId ? ` \u2192 ${lead.convertedOppRefId}` : ""}
              </span>
            )}
            <button className="btn btn-sec" style={{color:"#3B82F6"}} onClick={() => onLogCall && onLogCall(lead)}>
              <Phone size={14}/>Log Call
            </button>
            <button className="btn btn-sec" onClick={() => { onClose(); onEdit(lead); }}>
              <Edit2 size={14}/>Edit
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Close" style={{width:32,height:32,fontSize:18}}>&#10005;</button>
          </div>
        </div>

        {/* ═══ Tab Bar ═══ */}
        <div style={{background:"white",borderBottom:"1px solid var(--border)",padding:"0 28px",display:"flex",gap:0,flexShrink:0,position:"sticky",top:0,zIndex:10}}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{display:"flex",alignItems:"center",gap:5,padding:"10px 16px",fontSize:12,fontWeight: activeTab === t.id ? 700 : 500,
                color: activeTab === t.id ? "var(--brand,#1B6B5A)" : "var(--text3)",
                borderTop:"none",borderLeft:"none",borderRight:"none",
                borderBottom: activeTab === t.id ? "2px solid var(--brand,#1B6B5A)" : "2px solid transparent",
                background:"none",cursor:"pointer",transition:"all 0.15s"}}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ═══ Scrollable Body ═══ */}
        <div style={{flex:1,overflow:"auto",padding:"20px 28px 28px"}}>

          {/* ─────────── OVERVIEW TAB ─────────── */}
          {activeTab === "overview" && <>
            {/* Stage Advancement */}
            {lead.stage !== "Converted" && lead.stage !== "NA" && (
              <div style={{marginBottom:16}}>
                <div style={{background:"white",borderRadius:10,border:"1px solid var(--border)",padding:"14px 18px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:showStageGate ? 10 : 0}}>
                    <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                      <span style={{fontSize:12,fontWeight:600,color:"var(--text3)"}}>Stage Progression:</span>
                      {STAGE_ORDER.map((s, i) => {
                        const si = LEAD_STAGE_MAP[s];
                        const isCurrent = s === lead.stage;
                        const isPast = i < curIdx;
                        return (
                          <div key={s} style={{display:"flex",alignItems:"center",gap:4}}>
                            {i > 0 && <div style={{width:20,height:2,background: isPast ? "#22C55E" : "var(--border)"}}/>}
                            <span style={{fontSize:11,fontWeight:isCurrent ? 700 : 500,padding:"3px 8px",borderRadius:6,
                              background: isCurrent ? (si?.color || "#94A3B8") + "18" : isPast ? "#22C55E18" : "var(--s2)",
                              color: isCurrent ? (si?.color || "#94A3B8") : isPast ? "#22C55E" : "var(--text3)",
                              border: isCurrent ? `1.5px solid ${si?.color || "#94A3B8"}` : "1px solid transparent"}}>{s}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      {nextStage && (
                        <button className="btn btn-sm" style={{fontSize:11,padding:"4px 12px",borderRadius:6,
                          background: nextGateResult?.canAdvance ? "var(--brand)" : "var(--s2)",
                          color: nextGateResult?.canAdvance ? "white" : "var(--text3)",
                          border:"none",cursor: nextGateResult?.canAdvance ? "pointer" : "not-allowed",opacity: nextGateResult?.canAdvance ? 1 : 0.7}}
                          disabled={!nextGateResult?.canAdvance}
                          onClick={() => {
                            if (nextStage === "Converted") { setShowConvertModal(true); }
                            else { updateLead({ stage: nextStage, stageHistory: [...(lead.stageHistory||[]), {from:lead.stage,to:nextStage,date:today}] }); }
                          }}>
                          <ArrowRightCircle size={12}/>{nextStage === "Converted" ? "Convert" : `Advance to ${nextStage}`}
                        </button>
                      )}
                      <button type="button" onClick={() => setShowStageGate(v => !v)}
                        style={{background:"none",border:"none",cursor:"pointer",color:"var(--text3)",display:"flex",alignItems:"center",gap:2,fontSize:11}}>
                        {showStageGate ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
                        {showStageGate ? "Hide" : "Gates"}
                      </button>
                    </div>
                  </div>
                  {showStageGate && nextGateResult && (
                    <div style={{background: nextGateResult.canAdvance ? "#F0FDF4" : "#FFFBEB",borderRadius:8,padding:"10px 14px",border:`1px solid ${nextGateResult.canAdvance ? "#BBF7D0" : "#FDE68A"}`}}>
                      <div style={{fontSize:11,fontWeight:700,color:"var(--text2)",marginBottom:6}}>Requirements for {nextGateResult.label || nextStage}:</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                        {nextGateResult.passed.map(c => (
                          <div key={c.key} style={{display:"flex",alignItems:"center",gap:5,fontSize:11}}>
                            <Check size={12} style={{color:"#16A34A"}}/><span style={{color:"#15803D"}}>{c.label}</span>
                          </div>
                        ))}
                        {nextGateResult.failed.map(c => (
                          <div key={c.key} style={{display:"flex",alignItems:"center",gap:5,fontSize:11}}>
                            <X size={12} style={{color:"#DC2626"}}/><span style={{color:"#991B1B"}}>{c.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* KPI Metrics */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
              {kpiCard(<TrendingUp size={15}/>, "Deal Value", `\u20B9${dealValue} L`, lead.estimatedValue > 0 ? "Manually set" : `Score-based (${lead.score})`)}
              {kpiCard(<Star size={15}/>, "Win Probability", `${winProb}%`, stageInfo?.name || lead.stage, "#3B82F6")}
              {kpiCard(<Briefcase size={15}/>, "Pipeline Value", `\u20B9${pipelineValue} L`, "Weighted value", "#8B5CF6")}
              {kpiCard(<Calendar size={15}/>, "Next Call", lead.nextCall ? fmt.short(lead.nextCall) : "\u2014", "Scheduled follow-up", "#F59E0B")}
            </div>

            {/* General Information - Inline Editable */}
            <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                <Building2 size={15} style={{color:"var(--brand)"}}/> General Information
                <span style={{fontSize:10,color:"var(--text3)",fontWeight:400}}>(click any field to edit)</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 24px"}}>
                <div>
                  {editField("Company", "company", "text")}
                  {editField("Stage", "stage", "select", LEAD_STAGES)}
                  {editField("Region", "region", "select", REGIONS)}
                  {editField("Vertical", "vertical", "select", VERTICALS.map(v => ({id:v, name:v})))}
                  {editField("Branch", "branch", "text")}
                  {editField("Location", "location", "text")}
                  {editField("Department", "department", "text")}
                </div>
                <div>
                  {editField("Product Interest", "product", "select", PRODUCTS)}
                  {editField("Lead Source", "source", "select", LEAD_SOURCES.map(s => ({id:s, name:s})))}
                  {editField("Score", "score", "range")}
                  {editField("Est. Value (₹L)", "estimatedValue", "number")}
                  {editField("Temperature", "temperature", "select", LEAD_TEMPERATURES.map(t => ({id:t, name:t})))}
                  {editField("Next Call Date", "nextCall", "date")}
                  {editField("Assigned To", "assignedTo", "select", _team)}
                  {editField("Created Date", "createdDate", "date")}
                </div>
              </div>
              {/* Notes section */}
              <div style={{marginTop:12}}>
                <div style={{fontSize:11,fontWeight:600,color:"var(--text3)",marginBottom:4}}>NOTES</div>
                {editingField === "notes" ? (
                  <div>
                    <textarea autoFocus value={fieldVal} onChange={e => setFieldVal(e.target.value)}
                      onBlur={() => saveFieldEdit("notes")} rows={3}
                      style={{width:"100%",fontSize:12,padding:"8px 12px",borderRadius:8,border:"1px solid var(--brand)",resize:"vertical",boxSizing:"border-box",outline:"none"}}/>
                    <div style={{display:"flex",gap:6,marginTop:4,justifyContent:"flex-end"}}>
                      <button onClick={cancelFieldEdit} className="btn btn-sm btn-sec" style={{fontSize:10}}>Cancel</button>
                      <button onClick={() => saveFieldEdit("notes")} className="btn btn-sm btn-primary" style={{fontSize:10}}><Check size={11}/>Save</button>
                    </div>
                  </div>
                ) : (
                  <div onClick={() => startFieldEdit("notes")} title="Click to edit notes"
                    style={{padding:"10px 14px",background:"var(--s2,#F8FAFC)",borderRadius:8,border:"1px solid var(--border)",cursor:"pointer",minHeight:40,transition:"border-color 0.15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor="var(--brand)"} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
                    {lead.notes
                      ? <div style={{fontSize:12,color:"var(--text2)",lineHeight:1.5}}>{lead.notes}</div>
                      : <div style={{fontSize:12,color:"var(--text3)",fontStyle:"italic",display:"flex",alignItems:"center",gap:5}}><Edit2 size={11}/>Click to add notes...</div>}
                  </div>
                )}
              </div>
            </div>

            {/* Linked Account */}
            {linkedAccount && (
              <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)",marginTop:16}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:14,display:"flex",alignItems:"center",gap:8}}>
                  <Building2 size={15} style={{color:"var(--brand)"}}/> Linked Account
                </div>
                {infoRow("Account Name", linkedAccount.name)}
                {infoRow("Industry", linkedAccount.industry)}
                {infoRow("Region", linkedAccount.region)}
                {linkedAccount.hierarchyPath && infoRow("Hierarchy", linkedAccount.hierarchyPath)}
              </div>
            )}
          </>}

          {/* ─────────── CONTACTS TAB ─────────── */}
          {activeTab === "contacts" && <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--text1)"}}>Contacts ({displayContacts.length})</div>
              <div style={{display:"flex",gap:6}}>
                <button className="btn btn-sm btn-sec" style={{fontSize:11}} onClick={() => { setShowAddContact(true); setShowNewContactForm(false); }}>
                  <UserPlus size={12}/>Add Existing
                </button>
                <button className="btn btn-sm btn-primary" style={{fontSize:11}} onClick={() => { setShowNewContactForm(true); setShowAddContact(false); }}>
                  <Plus size={12}/>New Contact
                </button>
              </div>
            </div>

            {/* Add existing contact dropdown */}
            {showAddContact && (
              <div style={{background:"white",borderRadius:10,padding:14,border:"1px solid var(--border)",marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:600,color:"var(--text1)",marginBottom:8}}>Link Existing Contact</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,alignItems:"end"}}>
                  <select id="addContactSelect" style={{fontSize:12,padding:"6px 10px",borderRadius:6,border:"1px solid var(--border)"}}>
                    <option value="">-- Select Contact --</option>
                    {(contacts || []).filter(c => !linkedContactIds.includes(c.id)).map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.designation ? ` - ${c.designation}` : ""}{c.email ? ` (${c.email})` : ""}</option>
                    ))}
                  </select>
                  <button className="btn btn-sm btn-primary" style={{fontSize:11}} onClick={() => {
                    const sel = document.getElementById("addContactSelect")?.value;
                    if (!sel) return;
                    updateLead({ contactIds: [...linkedContactIds, sel] });
                    setShowAddContact(false);
                  }}><Check size={11}/>Link</button>
                  <button className="btn btn-sm btn-sec" style={{fontSize:11}} onClick={() => setShowAddContact(false)}>Cancel</button>
                </div>
              </div>
            )}

            {/* Create new contact inline */}
            {showNewContactForm && (
              <div style={{background:"white",borderRadius:10,padding:14,border:"1px solid var(--border)",marginBottom:14}}>
                <InlineContactForm
                  accountId={lead.accountId || ""}
                  onSave={(contactData) => {
                    const newContact = { ...contactData, id: `c-${uid()}`, accountId: lead.accountId || "", primary: false, contactId: `CON-${Date.now()}`, departments: [], products: [], branches: [], countries: [], linkedOpps: [] };
                    if (setContacts) setContacts(p => [...p, newContact]);
                    updateLead({ contactIds: [...linkedContactIds, newContact.id], contactRoles: { ...contactRolesMap, [newContact.id]: "Other" } });
                    setShowNewContactForm(false);
                  }}
                  onCancel={() => setShowNewContactForm(false)}
                />
              </div>
            )}

            {/* Contact cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
              {displayContacts.map((c, i) => {
                const ROLE_COLORS = {"Primary Contact":"#1B6B5A","Decision Maker/HOD":"#DC2626","Technical/IT":"#3B82F6","End User":"#8B5CF6","Finance/Accounts":"#F59E0B","Presales/Demo":"#0D9488","Management":"#7C3AED","Operations":"#EA580C","Account Contact":"#64748B","Other":"#94A3B8"};
                const roleColor = ROLE_COLORS[c.role] || "#64748B";
                const isEditingThis = editingContact === c.id;

                if (isEditingThis) {
                  return (
                    <div key={c.id} style={{border:"1px solid var(--brand)",borderRadius:10,padding:"14px 16px",background:"white"}}>
                      <div style={{fontSize:12,fontWeight:600,color:"var(--text1)",marginBottom:8}}>Edit Contact</div>
                      <div style={{display:"grid",gap:6}}>
                        <input placeholder="Name" value={contactEditData.name || ""} onChange={e => setContactEditData(d => ({...d, name: e.target.value}))} style={{fontSize:12,padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)"}}/>
                        <input placeholder="Email" value={contactEditData.email || ""} onChange={e => setContactEditData(d => ({...d, email: e.target.value}))} style={{fontSize:12,padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)"}}/>
                        <input placeholder="Phone" value={contactEditData.phone || ""} onChange={e => setContactEditData(d => ({...d, phone: e.target.value}))} style={{fontSize:12,padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)"}}/>
                        <input placeholder="Designation" value={contactEditData.designation || ""} onChange={e => setContactEditData(d => ({...d, designation: e.target.value}))} style={{fontSize:12,padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)"}}/>
                        <select value={contactEditData.role || ""} onChange={e => setContactEditData(d => ({...d, role: e.target.value}))} style={{fontSize:12,padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)"}}>
                          {LEAD_CONTACT_ROLES.map(r => <option key={r}>{r}</option>)}
                        </select>
                      </div>
                      <div style={{display:"flex",gap:6,justifyContent:"flex-end",marginTop:8}}>
                        <button className="btn btn-sm btn-sec" style={{fontSize:10}} onClick={() => setEditingContact(null)}>Cancel</button>
                        <button className="btn btn-sm btn-primary" style={{fontSize:10}} onClick={() => {
                          if (c.id === "_primary") {
                            updateLead({ contact: contactEditData.name, email: contactEditData.email, phone: contactEditData.phone, designation: contactEditData.designation });
                          } else {
                            if (setContacts) setContacts(prev => prev.map(cc => cc.id === c.id ? {...cc, ...contactEditData} : cc));
                            updateLead({ contactRoles: { ...contactRolesMap, [c.id]: contactEditData.role } });
                          }
                          setEditingContact(null);
                        }}><Check size={11}/>Save</button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={c.id} style={{border:"1px solid var(--border)",borderRadius:10,padding:"14px 16px",background:"white"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                      <div className="u-av" style={{width:36,height:36,borderRadius:10,fontSize:12,flexShrink:0}}>
                        {c.name?.split(" ").map(n=>n[0]).join("").slice(0,2)}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--text1)"}}>{c.name}</div>
                        {c.designation && <div style={{fontSize:11,color:"var(--text3)"}}>{c.designation}</div>}
                        {c.department && <div style={{fontSize:10,color:"var(--brand)",fontWeight:500}}>{c.department}</div>}
                      </div>
                      {c.isPrimary && <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:"#F59E0B18",color:"#D97706"}}>PRIMARY</span>}
                    </div>
                    <div style={{marginBottom:8}}>
                      <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:4,background:roleColor+"18",color:roleColor}}>{c.role}</span>
                    </div>
                    {c.email && <div style={{fontSize:11,color:"var(--text2)",marginBottom:2,display:"flex",alignItems:"center",gap:4}}><Mail size={11} style={{color:"var(--text3)"}}/>{c.email}</div>}
                    {c.phone && <div style={{fontSize:11,color:"var(--text2)",marginBottom:6,display:"flex",alignItems:"center",gap:4}}><Phone size={11} style={{color:"var(--text3)"}}/>{c.phone}</div>}
                    <div style={{display:"flex",gap:6}}>
                      <button className="btn btn-sm btn-sec" style={{fontSize:10,padding:"2px 8px"}} onClick={() => {
                        setEditingContact(c.id);
                        setContactEditData({ name: c.name, email: c.email, phone: c.phone, designation: c.designation, role: c.role, department: c.department });
                      }}><Edit2 size={10}/>Edit</button>
                      {c.id !== "_primary" && (
                        <button className="btn btn-sm btn-sec" style={{fontSize:10,padding:"2px 8px",color:"#DC2626"}} onClick={() => {
                          const newIds = linkedContactIds.filter(id => id !== c.id);
                          const newRoles = {...contactRolesMap};
                          delete newRoles[c.id];
                          updateLead({ contactIds: newIds, contactRoles: newRoles });
                        }}><Trash2 size={10}/>Unlink</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>}

          {/* ─────────── ADDRESSES TAB ─────────── */}
          {activeTab === "addresses" && <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--text1)"}}>Addresses ({addresses.length})</div>
              <button className="btn btn-sm btn-primary" style={{fontSize:11}} onClick={() => {
                setShowAddAddress(true);
                setAddressForm({ type: "HQ", line1: "", line2: "", city: "", state: "", country: "India", pin: "", phone: "", email: "", status: "Active", isPrimary: addresses.length === 0 });
                setEditingAddress(null);
              }}><Plus size={12}/>Add Address</button>
            </div>

            {/* Add/Edit address form */}
            {(showAddAddress || editingAddress !== null) && (
              <div style={{background:"white",borderRadius:10,padding:16,border:"1px solid var(--border)",marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:600,color:"var(--text1)",marginBottom:10}}>{editingAddress !== null ? "Edit Address" : "New Address"}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>Type</label>
                    <select value={addressForm.type} onChange={e => setAddressForm(f => ({...f, type: e.target.value}))} style={{fontSize:11,width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)"}}>
                      {["HQ","Branch","Warehouse","Office"].map(t => <option key={t}>{t}</option>)}
                    </select></div>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>Country</label>
                    <select value={addressForm.country} onChange={e => setAddressForm(f => ({...f, country: e.target.value}))} style={{fontSize:11,width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)"}}>
                      {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                    </select></div>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>Status</label>
                    <select value={addressForm.status} onChange={e => setAddressForm(f => ({...f, status: e.target.value}))} style={{fontSize:11,width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)"}}>
                      {["Active","Inactive"].map(s => <option key={s}>{s}</option>)}
                    </select></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>Address Line 1</label>
                    <input value={addressForm.line1} onChange={e => setAddressForm(f => ({...f, line1: e.target.value}))} style={{fontSize:11,width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",boxSizing:"border-box"}} placeholder="Street address"/></div>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>Address Line 2</label>
                    <input value={addressForm.line2} onChange={e => setAddressForm(f => ({...f, line2: e.target.value}))} style={{fontSize:11,width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",boxSizing:"border-box"}} placeholder="Suite, floor"/></div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>City</label>
                    <input value={addressForm.city} onChange={e => setAddressForm(f => ({...f, city: e.target.value}))} style={{fontSize:11,width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",boxSizing:"border-box"}}/></div>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>State</label>
                    <input value={addressForm.state} onChange={e => setAddressForm(f => ({...f, state: e.target.value}))} style={{fontSize:11,width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",boxSizing:"border-box"}}/></div>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>PIN/ZIP</label>
                    <input value={addressForm.pin} onChange={e => setAddressForm(f => ({...f, pin: e.target.value}))} style={{fontSize:11,width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",boxSizing:"border-box"}}/></div>
                  <div style={{display:"flex",alignItems:"end",gap:6}}>
                    <label style={{fontSize:10,display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
                      <input type="checkbox" checked={addressForm.isPrimary} onChange={e => setAddressForm(f => ({...f, isPrimary: e.target.checked}))}/>Primary
                    </label>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>Phone</label>
                    <input value={addressForm.phone} onChange={e => setAddressForm(f => ({...f, phone: e.target.value}))} style={{fontSize:11,width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",boxSizing:"border-box"}}/></div>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>Email</label>
                    <input value={addressForm.email} onChange={e => setAddressForm(f => ({...f, email: e.target.value}))} style={{fontSize:11,width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",boxSizing:"border-box"}}/></div>
                </div>
                <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                  <button className="btn btn-sm btn-sec" style={{fontSize:10}} onClick={() => { setShowAddAddress(false); setEditingAddress(null); }}>Cancel</button>
                  <button className="btn btn-sm btn-primary" style={{fontSize:10}} onClick={() => {
                    const addr = { ...addressForm, id: editingAddress !== null ? editingAddress : `addr-${Date.now()}` };
                    let newAddrs;
                    if (editingAddress !== null) {
                      newAddrs = addresses.map(a => a.id === editingAddress ? addr : a);
                    } else {
                      newAddrs = [...addresses, addr];
                    }
                    if (addr.isPrimary) newAddrs = newAddrs.map(a => ({ ...a, isPrimary: a.id === addr.id }));
                    updateLead({ addresses: newAddrs });
                    setShowAddAddress(false); setEditingAddress(null);
                  }}><Save size={11}/>{editingAddress !== null ? "Update" : "Add"}</button>
                </div>
              </div>
            )}

            {addresses.length === 0 && !showAddAddress && (
              <div style={{textAlign:"center",padding:40,color:"var(--text3)",fontSize:12}}>No addresses yet. Click "Add Address" to begin.</div>
            )}

            {/* Address cards */}
            <div style={{display:"grid",gap:12}}>
              {addresses.map(a => {
                const isExpanded = expandedAddress === a.id;
                const TYPE_ICONS = { HQ: <Home size={14}/>, Branch: <Building2 size={14}/>, Warehouse: <Warehouse size={14}/>, Office: <Briefcase size={14}/> };
                return (
                  <div key={a.id} style={{background:"white",borderRadius:12,border:"1px solid var(--border)",overflow:"hidden"}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",cursor:"pointer"}} onClick={() => setExpandedAddress(isExpanded ? null : a.id)}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:32,height:32,borderRadius:8,background:"var(--brand-light,#E8F5F1)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--brand)"}}>
                          {TYPE_ICONS[a.type] || <MapPin size={14}/>}
                        </div>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:"var(--text1)",display:"flex",alignItems:"center",gap:6}}>
                            {a.type}{a.isPrimary && <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:"#F59E0B18",color:"#D97706"}}>PRIMARY</span>}
                            <span style={{fontSize:10,padding:"1px 6px",borderRadius:4,background: a.status === "Active" ? "#22C55E18" : "#EF444418",color: a.status === "Active" ? "#22C55E" : "#EF4444"}}>{a.status}</span>
                          </div>
                          <div style={{fontSize:11,color:"var(--text3)"}}>{[a.city, a.state, a.country].filter(Boolean).join(", ")}</div>
                        </div>
                      </div>
                      <ChevronRight size={14} style={{color:"var(--text3)",transform: isExpanded ? "rotate(90deg)" : "none",transition:"transform 0.15s"}}/>
                    </div>
                    {isExpanded && (
                      <div style={{padding:"0 16px 14px",borderTop:"1px solid var(--border)"}}>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"10px 0"}}>
                          {infoRow("Line 1", a.line1)}
                          {a.line2 && infoRow("Line 2", a.line2)}
                          {infoRow("City", a.city)}
                          {infoRow("State", a.state)}
                          {infoRow("Country", a.country)}
                          {infoRow("PIN/ZIP", a.pin)}
                          {a.phone && infoRow("Phone", a.phone)}
                          {a.email && infoRow("Email", a.email)}
                        </div>
                        <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                          <button className="btn btn-sm btn-sec" style={{fontSize:10}} onClick={(e) => {
                            e.stopPropagation();
                            setAddressForm({...a});
                            setEditingAddress(a.id);
                            setShowAddAddress(false);
                          }}><Edit2 size={10}/>Edit</button>
                          {!a.isPrimary && <button className="btn btn-sm btn-sec" style={{fontSize:10}} onClick={(e) => {
                            e.stopPropagation();
                            updateLead({ addresses: addresses.map(x => ({...x, isPrimary: x.id === a.id})) });
                          }}><Star size={10}/>Set Primary</button>}
                          <button className="btn btn-sm btn-sec" style={{fontSize:10,color:"#DC2626"}} onClick={(e) => {
                            e.stopPropagation();
                            updateLead({ addresses: addresses.filter(x => x.id !== a.id) });
                          }}><Trash2 size={10}/>Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>}

          {/* ─────────── TEAM TAB ─────────── */}
          {activeTab === "team" && <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--text1)"}}>Sales Team ({salesTeam.length})</div>
              <button className="btn btn-sm btn-primary" style={{fontSize:11}} onClick={() => setShowAddTeamMember(true)}><Plus size={12}/>Add Member</button>
            </div>

            {showAddTeamMember && (
              <div style={{background:"white",borderRadius:10,padding:14,border:"1px solid var(--border)",marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:600,color:"var(--text1)",marginBottom:8}}>Add Team Member</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto auto",gap:8,alignItems:"end"}}>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>User</label>
                    <select value={newTeamMember.userId} onChange={e => setNewTeamMember(f => ({...f, userId: e.target.value}))}
                      style={{fontSize:11,width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)"}}>
                      <option value="">-- Select --</option>
                      {_team.filter(u => !salesTeam.some(st => st.userId === u.id)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select></div>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>Role</label>
                    <select value={newTeamMember.role} onChange={e => setNewTeamMember(f => ({...f, role: e.target.value}))}
                      style={{fontSize:11,width:"100%",padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)"}}>
                      {TEAM_ROLES.map(r => <option key={r}>{r}</option>)}
                    </select></div>
                  <button className="btn btn-sm btn-primary" style={{fontSize:10}} onClick={() => {
                    if (!newTeamMember.userId) return;
                    updateLead({ salesTeam: [...salesTeam, { userId: newTeamMember.userId, role: newTeamMember.role }] });
                    setNewTeamMember({ userId: "", role: "Inside Sales" });
                    setShowAddTeamMember(false);
                  }}><Check size={11}/>Add</button>
                  <button className="btn btn-sm btn-sec" style={{fontSize:10}} onClick={() => setShowAddTeamMember(false)}>Cancel</button>
                </div>
              </div>
            )}

            <div style={{display:"grid",gap:10}}>
              {salesTeam.map((st, i) => {
                const member = _teamMap[st.userId];
                if (!member) return null;
                const isOwner = st.role === "Sales Owner";
                return (
                  <div key={st.userId + i} style={{background:"white",borderRadius:12,padding:"14px 18px",border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div className="u-av" style={{width:40,height:40,borderRadius:10,fontSize:13}}>{member.name?.split(" ").map(n=>n[0]).join("").slice(0,2)}</div>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--text1)"}}>{member.name}</div>
                        <div style={{fontSize:11,color:"var(--text3)"}}>{member.email || member.role}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:6,
                        background: isOwner ? "var(--brand-light,#E8F5F1)" : "var(--s2)",
                        color: isOwner ? "var(--brand,#1B6B5A)" : "var(--text2)"}}>{st.role}</span>
                      {isOwner ? (
                        <select value={st.userId} onChange={e => {
                          const newTeam = salesTeam.map((t2, j) => j === i ? {...t2, userId: e.target.value} : t2);
                          updateLead({ salesTeam: newTeam, assignedTo: e.target.value });
                        }} style={{fontSize:11,padding:"3px 8px",borderRadius:6,border:"1px solid var(--border)"}}>
                          {_team.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      ) : (
                        <button className="btn btn-sm btn-sec" style={{fontSize:10,color:"#DC2626",padding:"2px 8px"}} onClick={() => {
                          updateLead({ salesTeam: salesTeam.filter((_, j) => j !== i) });
                        }}><Trash2 size={10}/>Remove</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>}

          {/* ─────────── ACTIVITIES TAB ─────────── */}
          {activeTab === "activities" && <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--text1)"}}>Activity Timeline ({combinedTimeline.length})</div>
              <div style={{display:"flex",gap:6}}>
                <button className="btn btn-sm btn-sec" style={{fontSize:11}} onClick={() => { setShowCallForm(v => !v); setShowActivityForm(false); }}>
                  <Phone size={12}/>Log Call
                </button>
                <button className="btn btn-sm btn-sec" style={{fontSize:11}} onClick={() => { setShowActivityForm(v => !v); setShowCallForm(false); }}>
                  <Plus size={12}/>Log Activity
                </button>
                <button className="btn btn-sm btn-sec" style={{fontSize:11}} onClick={() => {
                  const followup = { id: `act-${Date.now()}`, accountId: lead.accountId || "", contactId: lead.contact || "", leadId: lead.id, title: `Follow-up: ${lead.company}`, type: "Follow-up", status: "Planned", date: today, notes: "", createdDate: today };
                  setActivities(p => [...p, followup]);
                }}><Calendar size={12}/>Set Follow-up</button>
              </div>
            </div>

            {/* Inline Call Form */}
            {showCallForm && (
              <div style={{background:"white",borderRadius:10,padding:14,border:"1px solid var(--border)",marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:600,color:"var(--text1)",marginBottom:8}}>Log a Call</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>Call Type</label>
                    <select value={callForm.callType} onChange={e => setCallForm(f => ({...f, callType: e.target.value}))} style={{fontSize:11,width:"100%"}}>
                      {["Discovery","Follow-up","Demo","Negotiation","Support","Cold Call"].map(t => <option key={t}>{t}</option>)}
                    </select></div>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>Date</label>
                    <input type="date" value={callForm.date} onChange={e => setCallForm(f => ({...f, date: e.target.value}))} style={{fontSize:11,width:"100%"}}/></div>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>Outcome</label>
                    <select value={callForm.outcome} onChange={e => setCallForm(f => ({...f, outcome: e.target.value}))} style={{fontSize:11,width:"100%"}}>
                      {["Interested","Not Interested","Call Back","Voicemail","No Answer","Meeting Booked"].map(t => <option key={t}>{t}</option>)}
                    </select></div>
                </div>
                <div style={{marginBottom:8}}><label style={{fontSize:10,color:"var(--text3)"}}>Notes *</label>
                  <textarea value={callForm.notes} onChange={e => setCallForm(f => ({...f, notes: e.target.value}))} rows={2} style={{fontSize:11,width:"100%"}} placeholder="Call notes..."/></div>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:8,alignItems:"end"}}>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>Next Call Date</label>
                    <input type="date" value={callForm.nextCallDate} onChange={e => setCallForm(f => ({...f, nextCallDate: e.target.value}))} style={{fontSize:11,width:"100%"}}/></div>
                  <button className="btn btn-sm btn-sec" style={{fontSize:10}} onClick={() => setShowCallForm(false)}>Cancel</button>
                  <button className="btn btn-sm btn-primary" style={{fontSize:10}} onClick={saveCallLog}><Check size={11}/>Save</button>
                </div>
              </div>
            )}

            {/* Inline Activity Form */}
            {showActivityForm && (
              <div style={{background:"white",borderRadius:10,padding:14,border:"1px solid var(--border)",marginBottom:14}}>
                <div style={{fontSize:12,fontWeight:600,color:"var(--text1)",marginBottom:8}}>Log an Activity</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>Title *</label>
                    <input value={actForm.title} onChange={e => setActForm(f => ({...f, title: e.target.value}))} style={{fontSize:11,width:"100%"}} placeholder="Activity title"/></div>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>Type</label>
                    <select value={actForm.type} onChange={e => setActForm(f => ({...f, type: e.target.value}))} style={{fontSize:11,width:"100%"}}>
                      {["Call","Email","Meeting","Task","Note","Follow-up"].map(t => <option key={t}>{t}</option>)}
                    </select></div>
                  <div><label style={{fontSize:10,color:"var(--text3)"}}>Date</label>
                    <input type="date" value={actForm.date} onChange={e => setActForm(f => ({...f, date: e.target.value}))} style={{fontSize:11,width:"100%"}}/></div>
                </div>
                <div style={{marginBottom:8}}><label style={{fontSize:10,color:"var(--text3)"}}>Notes</label>
                  <textarea value={actForm.notes} onChange={e => setActForm(f => ({...f, notes: e.target.value}))} rows={2} style={{fontSize:11,width:"100%"}} placeholder="Activity notes..."/></div>
                <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                  <button className="btn btn-sm btn-sec" style={{fontSize:10}} onClick={() => setShowActivityForm(false)}>Cancel</button>
                  <button className="btn btn-sm btn-primary" style={{fontSize:10}} onClick={saveActivity}><Check size={11}/>Save</button>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div style={{background:"white",borderRadius:12,border:"1px solid var(--border)",overflow:"hidden"}}>
              {displayTimeline.map((a, i) => (
                <div key={i} style={{borderBottom: i < displayTimeline.length - 1 ? "1px solid var(--border)" : "none"}}>
                  <div style={{display:"flex",gap:10,padding:"12px 16px",cursor:"pointer"}} onClick={() => setExpandedTimeline(expandedTimeline === i ? null : i)}>
                    <div style={{width:30,height:30,borderRadius:8,background:"var(--brand-light,#E8F5F1)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--brand)",flexShrink:0}}>
                      {a.icon}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <div style={{fontSize:12,fontWeight:600,color:"var(--text1)"}}>{a.title}</div>
                        <div style={{fontSize:10,color:"var(--text3)"}}>{a.time}</div>
                      </div>
                      <div style={{fontSize:11,color:"var(--text3)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace: expandedTimeline === i ? "normal" : "nowrap"}}>{a.desc}</div>
                    </div>
                  </div>
                  {expandedTimeline === i && a.desc && (
                    <div style={{padding:"0 16px 12px 56px"}}>
                      <div style={{fontSize:12,color:"var(--text2)",lineHeight:1.5,background:"var(--s2)",borderRadius:8,padding:"8px 12px"}}>{a.desc}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>}

          {/* ─────────── DOCUMENTS TAB ─────────── */}
          {activeTab === "documents" && <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:700,color:"var(--text1)"}}>Documents ({documents.length})</div>
              <button className="btn btn-sm btn-sec" style={{fontSize:11}} onClick={() => setShowDocForm(v => !v)}>
                <Upload size={12}/>Add Document
              </button>
            </div>

            {/* Add Document Form */}
            {showDocForm && (
              <div style={{background:"white",borderRadius:10,border:"1px solid var(--brand)",padding:"14px 16px",marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--text1)",marginBottom:10}}>Add Document</div>
                <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8,marginBottom:8}}>
                  <div>
                    <label style={{fontSize:11,color:"var(--text3)"}}>Document Name *</label>
                    <input value={docForm.name} onChange={e => setDocForm(f => ({...f, name: e.target.value}))}
                      placeholder="e.g. Proposal_v2.pdf"
                      style={{width:"100%",fontSize:12,padding:"6px 10px",borderRadius:6,border:"1px solid var(--border)",boxSizing:"border-box",marginTop:2}}/>
                  </div>
                  <div>
                    <label style={{fontSize:11,color:"var(--text3)"}}>Type</label>
                    <select value={docForm.type} onChange={e => setDocForm(f => ({...f, type: e.target.value}))}
                      style={{width:"100%",fontSize:12,padding:"6px 10px",borderRadius:6,border:"1px solid var(--border)",marginTop:2}}>
                      {["PDF","Word","Excel","PPT","Image","Other"].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{marginBottom:10}}>
                  <label style={{fontSize:11,color:"var(--text3)"}}>URL / Link (optional)</label>
                  <input value={docForm.url} onChange={e => setDocForm(f => ({...f, url: e.target.value}))}
                    placeholder="https://..."
                    style={{width:"100%",fontSize:12,padding:"6px 10px",borderRadius:6,border:"1px solid var(--border)",boxSizing:"border-box",marginTop:2}}/>
                </div>
                <div style={{display:"flex",gap:6,justifyContent:"flex-end"}}>
                  <button className="btn btn-sm btn-sec" style={{fontSize:10}} onClick={() => { setShowDocForm(false); setDocForm({ name: "", url: "", type: "PDF" }); }}>Cancel</button>
                  <button className="btn btn-sm btn-primary" style={{fontSize:10}} onClick={saveDoc} disabled={!docForm.name?.trim()}><Check size={11}/>Add</button>
                </div>
              </div>
            )}

            <div style={{background:"white",borderRadius:12,border:"1px solid var(--border)",overflow:"hidden"}}>
              {documents.map((d, i) => {
                const extMap = { pdf: "#EF4444", docx: "#3B82F6", xlsx: "#22C55E", pptx: "#F59E0B", doc: "#3B82F6", word: "#3B82F6", excel: "#22C55E", image: "#EC4899" };
                const typeKey = (d.type || d.name?.split(".").pop() || "").toLowerCase();
                const iconColor = extMap[typeKey] || "#64748B";
                return (
                  <div key={d.id || i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderBottom: i < documents.length - 1 ? "1px solid var(--border)" : "none"}}>
                    <div style={{width:34,height:34,borderRadius:8,background:iconColor+"14",display:"flex",alignItems:"center",justifyContent:"center",color:iconColor,flexShrink:0}}>
                      <FileText size={15}/>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      {d.url
                        ? <a href={d.url} target="_blank" rel="noopener noreferrer" style={{fontSize:12,fontWeight:600,color:"var(--brand)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block"}}>{d.name}</a>
                        : <div style={{fontSize:12,fontWeight:600,color:"var(--text1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div>}
                      <div style={{fontSize:10,color:"var(--text3)"}}>{d.type || ""}{d.size && d.size !== "—" ? ` · ${d.size}` : ""}{d.date ? ` · ${fmt.short(d.date)}` : ""}</div>
                    </div>
                    <div style={{display:"flex",gap:4,alignItems:"center",flexShrink:0}}>
                      {d.url && <a href={d.url} target="_blank" rel="noopener noreferrer"><Download size={14} style={{color:"var(--text3)",cursor:"pointer"}}/></a>}
                      <button onClick={() => deleteDoc(d.id)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--red,#EF4444)",padding:2,display:"flex",alignItems:"center"}} title="Delete document">
                        <X size={13}/>
                      </button>
                    </div>
                  </div>
                );
              })}
              {documents.length === 0 && !showDocForm && (
                <div style={{textAlign:"center",padding:40,color:"var(--text3)",fontSize:12}}>
                  <Paperclip size={28} style={{opacity:0.3,marginBottom:8,display:"block",margin:"0 auto 8px"}}/>
                  No documents yet. Click "Add Document" to attach links or files.
                </div>
              )}
            </div>
          </>}

          {/* ─────────── CONVERT TAB ─────────── */}
          {activeTab === "convert" && <>
            <div style={{fontSize:14,fontWeight:700,color:"var(--text1)",marginBottom:14}}>Lead Conversion</div>

            {/* Conversion Readiness Checklist */}
            {(() => {
              const convGate = validateStageGate(lead, "Converted", STAGE_GATES);
              return (
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)",marginBottom:16}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <ShieldCheck size={15} style={{color: convGate.canAdvance ? "#16A34A" : "#D97706"}}/>
                    Conversion Readiness: {convGate.canAdvance ? "All checks passed" : `${convGate.failed.length} check(s) remaining`}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    {convGate.passed.map(c => (
                      <div key={c.key} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}>
                        <Check size={13} style={{color:"#16A34A"}}/><span style={{color:"#15803D"}}>{c.label}</span>
                      </div>
                    ))}
                    {convGate.failed.map(c => (
                      <div key={c.key} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}>
                        <X size={13} style={{color:"#DC2626"}}/><span style={{color:"#991B1B"}}>{c.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Pre-filled conversion info */}
            <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)",marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12}}>Conversion Summary</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 24px"}}>
                {infoRow("Company", lead.company)}
                {infoRow("Product", productInfo?.name || lead.product)}
                {infoRow("Lead Score", `${lead.score}/100`)}
                {infoRow("Stage", stageInfo?.name || lead.stage)}
                {infoRow("Assigned To", assignee?.name || lead.assignedTo)}
                {infoRow("Primary Contact", lead.contact)}
                {infoRow("Email", lead.email || "\u2014")}
                {infoRow("Phone", lead.phone || "\u2014")}
              </div>
            </div>

            {/* Conversion history */}
            {(lead.convertedOppIds?.length > 0 || lead.stage === "Converted") && (
              <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)",marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12}}>Conversion History</div>
                {lead.convertedOppIds?.length > 0 ? lead.convertedOppIds.map((oppId, i) => (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--border)"}}>
                    <Check size={13} style={{color:"#16A34A"}}/>
                    <span style={{fontSize:12,color:"var(--text1)"}}>Converted to Opportunity: {oppId}</span>
                  </div>
                )) : (
                  <div style={{fontSize:12,color:"var(--text3)"}}>Lead has been converted.</div>
                )}
              </div>
            )}

            <button className="btn btn-primary" onClick={() => setShowConvertModal(true)}
              disabled={lead.stage === "NA"}
              style={{opacity: lead.stage === "NA" ? 0.5 : 1}}>
              <ArrowRightCircle size={14}/>Convert to Deal
            </button>
          </>}
        </div>

        {/* ═══ Convert Modal ═══ */}
        {showConvertModal && (
          <ConvertToOppModal
            lead={lead}
            accounts={accounts}
            contacts={contacts || []}
            onConvert={(ld, data) => { onConvertToOpp(ld, data); onClose(); }}
            onClose={() => setShowConvertModal(false)}
            orgUsers={orgUsers}
            setContacts={setContacts}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// LEADS PAGE
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// EDITABLE GRID (Excel-like)
// Inline edit cells commit on blur (text/number/date) or onChange (select).
// Keeps the same sort headers + bulk-select column as the read-only table.
// ═══════════════════════════════════════════════════════════════════
function GridCell({ value, onCommit, type = "text", placeholder = "", style = {} }) {
  const [v, setV] = useState(value ?? "");
  // Keep local state in sync if parent value changes (e.g. another edit)
  useEffect(() => { setV(value ?? ""); }, [value]);
  return (
    <input
      type={type}
      value={v}
      placeholder={placeholder}
      onChange={e => setV(e.target.value)}
      onBlur={() => { if ((v ?? "") !== (value ?? "")) onCommit(v); }}
      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setV(value ?? ""); e.currentTarget.blur(); } }}
      style={{
        width: "100%",
        border: "1px solid transparent",
        borderRadius: 3,
        padding: "3px 5px",
        fontSize: 12,
        background: "transparent",
        outline: "none",
        ...style,
      }}
      onFocus={e => { e.target.style.border = "1px solid #1B6B5A"; e.target.style.background = "#F0FDF4"; }}
      onBlurCapture={e => { e.target.style.border = "1px solid transparent"; e.target.style.background = "transparent"; }}
    />
  );
}

function GridSelect({ value, onCommit, options, style = {} }) {
  return (
    <select
      value={value ?? ""}
      onChange={e => onCommit(e.target.value)}
      style={{
        width: "100%",
        border: "1px solid transparent",
        borderRadius: 3,
        padding: "3px 4px",
        fontSize: 12,
        background: "transparent",
        outline: "none",
        cursor: "pointer",
        ...style,
      }}>
      <option value="">—</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function EditableLeadsGrid({ rows, team, updateLeadField, bulk, toggleSort, SortIcon, openEdit, onOpenDetail }) {
  const stageOpts = LEAD_STAGES.map(s => ({ value: s.id, label: s.name }));
  const sourceOpts = LEAD_SOURCES.map(s => ({ value: s, label: s }));
  const regionOpts = REGIONS.map(r => ({ value: r, label: r }));
  const ownerOpts = team.map(u => ({ value: u.id, label: u.name }));

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="tbl" style={{ minWidth: 1400 }}>
        <thead>
          <tr style={{ background: "#F8FAFC" }}>
            <th style={{ width: 32 }}><input type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll}/></th>
            <th style={{cursor:"pointer",userSelect:"none",width:110}} onClick={() => toggleSort("leadId")}>Lead ID<SortIcon col="leadId"/></th>
            <th style={{cursor:"pointer",userSelect:"none",minWidth:160}} onClick={() => toggleSort("company")}>Company<SortIcon col="company"/></th>
            <th style={{cursor:"pointer",userSelect:"none",minWidth:140}} onClick={() => toggleSort("contact")}>Contact<SortIcon col="contact"/></th>
            <th style={{minWidth:180}}>Email</th>
            <th style={{minWidth:120}}>Phone</th>
            <th style={{cursor:"pointer",userSelect:"none",minWidth:120}} onClick={() => toggleSort("stage")}>Stage<SortIcon col="stage"/></th>
            <th style={{cursor:"pointer",userSelect:"none",width:80}} onClick={() => toggleSort("score")}>Score<SortIcon col="score"/></th>
            <th style={{minWidth:130}}>Source</th>
            <th style={{minWidth:120}}>Region</th>
            <th style={{cursor:"pointer",userSelect:"none",minWidth:130}} onClick={() => toggleSort("assignedTo")}>Assigned<SortIcon col="assignedTo"/></th>
            <th style={{cursor:"pointer",userSelect:"none",width:130}} onClick={() => toggleSort("nextCall")}>Next Call<SortIcon col="nextCall"/></th>
            <th style={{width:60}}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(l => {
            const isOverdue = l.nextCall && l.nextCall < today && l.stage !== "NA";
            return (
              <tr key={l.id} style={isOverdue ? { background: "#FEF2F2" } : undefined}>
                <td><input type="checkbox" checked={bulk.isSelected(l.id)} onChange={() => bulk.toggle(l.id)}/></td>
                <td>
                  <span
                    onClick={() => onOpenDetail(l)}
                    style={{fontFamily:"'Courier New',monospace",fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:4,background:"var(--s2)",color:"var(--brand)",cursor:"pointer"}}
                    title="Open detail view">{l.leadId}</span>
                </td>
                <td><GridCell value={l.company} onCommit={v => updateLeadField(l.id, "company", v)} style={{ fontWeight: 600, textTransform: "uppercase" }}/></td>
                <td><GridCell value={l.contact} onCommit={v => updateLeadField(l.id, "contact", v)}/></td>
                <td><GridCell type="email" value={l.email} onCommit={v => updateLeadField(l.id, "email", v)}/></td>
                <td><GridCell value={l.phone} onCommit={v => updateLeadField(l.id, "phone", v)}/></td>
                <td><GridSelect value={l.stage} options={stageOpts} onCommit={v => updateLeadField(l.id, "stage", v)}/></td>
                <td>
                  <GridCell
                    type="number"
                    value={l.score}
                    onCommit={v => {
                      const n = Math.max(0, Math.min(100, Number(v) || 0));
                      updateLeadField(l.id, "score", n);
                    }}
                    style={{ textAlign: "right" }}
                  />
                </td>
                <td><GridSelect value={l.source} options={sourceOpts} onCommit={v => updateLeadField(l.id, "source", v)}/></td>
                <td><GridSelect value={l.region} options={regionOpts} onCommit={v => updateLeadField(l.id, "region", v)}/></td>
                <td><GridSelect value={l.assignedTo} options={ownerOpts} onCommit={v => updateLeadField(l.id, "assignedTo", v)}/></td>
                <td>
                  <GridCell
                    type="date"
                    value={l.nextCall}
                    onCommit={v => updateLeadField(l.id, "nextCall", v)}
                    style={isOverdue ? { color: "#DC2626", fontWeight: 700 } : undefined}
                  />
                </td>
                <td>
                  <button className="icon-btn" aria-label="Open full editor" title="Open full editor" onClick={() => openEdit(l)}>
                    <Edit2 size={13}/>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{padding:"8px 14px",fontSize:11,color:"var(--text3)",borderTop:"1px solid #E2E8F0",background:"#F8FAFC"}}>
        Tip: Edits save automatically on blur · Press <kbd style={{background:"#fff",padding:"1px 5px",border:"1px solid #CBD5E1",borderRadius:3,fontSize:10}}>Enter</kbd> to commit, <kbd style={{background:"#fff",padding:"1px 5px",border:"1px solid #CBD5E1",borderRadius:3,fontSize:10}}>Esc</kbd> to cancel · Click the lead ID to open the full detail panel.
      </div>
    </div>
  );
}

function Leads({ leads, setLeads, accounts, currentUser, onConvertToOpp, contacts: allContacts, setContacts, orgUsers, activities, setActivities, callReports, setCallReports, masters, catalog, canDelete }) {
  // Scope the team list to only users this logged-in user has visibility over.
  // This keeps owner filter and assignment dropdowns consistent with the scoped data.
  const _scopedIds = useMemo(() => getScopedUserIds(currentUser, orgUsers), [currentUser, orgUsers]);
  const team = useMemo(() => {
    const all = orgUsers?.length ? orgUsers.filter(u => u.status !== 'Inactive') : TEAM;
    return all.filter(u => _scopedIds.has(u.id));
  }, [orgUsers, _scopedIds]);
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
  const [detailId, setDetailId] = useState(null);
  const detail = detailId ? leads.find(l => l.id === detailId) || null : null;
  const setDetail = (v) => setDetailId(v ? (v.id || v) : null);
  const [rangeKey, setRangeKey] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState(today);
  const [sortCol, setSortCol] = useState("createdDate");
  const [sortDir, setSortDir] = useState("desc");
  const [overdueOnly, setOverdueOnly] = useState(false); // true → show only overdue follow-up leads
  const [callLogModal, setCallLogModal] = useState(null); // prefill object when open
  const [showFormInlineContact, setShowFormInlineContact] = useState(null); // null=hidden, false=show existing dropdown, true=show new form
  const [viewMode, setViewMode] = useState("table"); // "table" | "grid" (Excel-like editable)

  // Inline field updater for the editable grid. Saves immediately to leads state.
  // Company names get uppercased per the company-wide policy that all
  // Account / Company names are stored ALL CAPS — see upper() in helpers.
  const updateLeadField = (id, field, value) => {
    const v = field === "company" ? upper(value) : value;
    setLeads(prev => prev.map(l => l.id === id ? { ...l, [field]: v } : l));
  };

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
    if (overdueOnly && !(l.nextCall && l.nextCall < today && l.stage !== "NA")) return false;
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
  }), [leads, productF, stageF, sourceF, ownerF, search, range, rangeKey, sortCol, sortDir, overdueOnly]);

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
    // Default assignedTo to the current user so RLS lets them see their
    // own new lead. BLANK_LEAD hardcodes "u1" (admin), which meant leads
    // created by other users were invisible to them — only admins saw
    // them — because the DB `owner` column ended up as u1.
    setForm({
      ...BLANK_LEAD,
      id: `ld${uid()}`,
      leadId,
      createdDate: today,
      assignedTo: currentUser || BLANK_LEAD.assignedTo,
    });
    setFormErrors({});
    setModal({ mode: "add" });
  };

  const openEdit = (l) => {
    // Backfill productSelection for legacy leads (created before the picker existed):
    // seed it from the single `product` field + any `additionalProducts`. User must
    // still confirm modules-or-None per line on next save (validation will prompt).
    const seeded = (Array.isArray(l.productSelection) && l.productSelection.length > 0)
      ? l.productSelection
      : [l.product, ...(l.additionalProducts || [])]
          .filter(Boolean)
          .filter((id, i, arr) => arr.indexOf(id) === i)
          .map(productId => ({ productId, moduleIds: [], noAddons: false }));
    setForm({ ...l, productSelection: seeded });
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
    const now = new Date().toISOString();
    setLeads(p => p.map(l => l.id === id ? { ...l, isDeleted: true, deletedAt: now, deletedBy: currentUser } : l));
    setConfirm(null);
  };

  const bulkDelete = () => {
    if (!canDelete) return;
    const now = new Date().toISOString();
    setLeads(p => p.map(l => bulk.isSelected(l.id) ? { ...l, isDeleted: true, deletedAt: now, deletedBy: currentUser } : l));
    bulk.clear();
  };

  const handleConvert = (lead, conversionData) => {
    if (lead.stage === "Converted" || lead.stage === "NA") return;
    onConvertToOpp(lead, conversionData);
  };

  // ─── Open Call Log Modal for a lead ───
  const openCallLog = (lead) => {
    setCallLogModal({
      accountId: lead.accountId || "",
      leadId: lead.id,
      participantIds: currentUser ? [currentUser] : [],
    });
  };

  // ─── Save call from shared LogCallModal ───
  const handleSaveCall = (callForm) => {
    const lead = leads.find(l => l.id === callLogModal?.leadId) || {};
    const callReport = {
      id: `cr-${uid()}`,
      company: lead.company || accounts.find(a => a.id === callForm.accountId)?.name || "",
      marketingPerson: currentUser,
      callType: callForm.callType,
      callDate: callForm.callDate,
      notes: callForm.notes,
      nextCallDate: callForm.nextCallDate,
      objective: callForm.objective,
      outcome: callForm.outcome,
      duration: callForm.duration,
      accountId: callForm.accountId,
      contactId: callForm.contactIds?.[0] || "",
      oppId: callForm.oppId,
      contactIds: callForm.contactIds,
      participantIds: callForm.participantIds,
      callTime: callForm.callTime,
      leadId: callForm.leadId || "",
      nextStepDesc: callForm.nextStepDesc,
      leadStage: lead.stage,
      product: lead.product,
      createdBy: currentUser || "",
    };
    setCallReports(p => [...p, callReport]);

    // Create activity record
    const actRecord = {
      id: `act-${uid()}`,
      accountId: callForm.accountId || "",
      contactId: callForm.contactIds?.[0] || lead.contact || "",
      leadId: callForm.leadId || "",
      title: `Call: ${lead.company || ""} – ${callForm.objective}`,
      type: "Call",
      date: callForm.callDate,
      notes: callForm.notes,
      createdDate: today,
      createdBy: currentUser || "",
    };
    setActivities(p => [...p, actRecord]);

    // Create follow-up activity if requested
    if (callForm.createFollowup && callForm.nextCallDate) {
      const acctName = lead.company || accounts.find(a => a.id === callForm.accountId)?.name || "";
      const followup = {
        id: `act-${uid()}`,
        title: callForm.followupTitle || `Follow-up: ${acctName}`,
        type: "Call",
        status: "Planned",
        date: callForm.followupDue || callForm.nextCallDate || today,
        accountId: callForm.accountId,
        contactId: callForm.contactIds?.[0] || "",
        leadId: callForm.leadId || "",
        owner: callForm.followupAssign || currentUser,
        notes: `Follow-up from call on ${callForm.callDate}`,
        createdDate: today,
        createdBy: currentUser || "",
      };
      setActivities(p => [...p, followup]);
    }

    // Update lead's nextCall if a next call date was set
    if (callForm.nextCallDate && callLogModal?.leadId) {
      setLeads(p => p.map(l => l.id === callLogModal.leadId ? { ...l, nextCall: callForm.nextCallDate } : l));
    }

    setCallLogModal(null);
  };

  const stageCount = (stageId) => leads.filter(l => l.stage === stageId).length;

  // ─── Computed KPIs (date-filtered) ───
  const activeLeads = filtered.filter(l => l.stage !== "NA" && l.stage !== "Converted").length;
  const convertedCount = filtered.filter(l => l.stage === "Converted").length;
  const clampScore = (v) => { const n = Number(v) || 0; return n >= 0 && n <= 100 ? n : Math.max(0, Math.min(100, n)); };
  const avgScore = filtered.length > 0 ? Math.round(filtered.reduce((s, l) => s + clampScore(l.score), 0) / filtered.length) : 0;
  const salCount = filtered.filter(l => l.stage === "SAL").length;
  const mqlCount = filtered.filter(l => l.stage === "MQL").length;
  const sqlCount = filtered.filter(l => l.stage === "SQL").length;
  const pipelineValue = filtered.reduce((s, l) => s + (clampScore(l.score) * 0.5), 0);
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
      <PageTip
        id="leads-tip-v1"
        title="Leads module:"
        text="Click any row to open a lead. All fields are editable inline — click any value to change it. Use the Convert tab to push a qualified lead into the Pipeline."
      />
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
          {overdueLeads > 0 && <button onClick={() => setOverdueOnly(v => !v)} style={{background:overdueOnly?"#DC2626":"var(--red-bg)",color:overdueOnly?"#fff":"var(--red-t)",fontSize:11,fontWeight:700,padding:"5px 10px",borderRadius:6,display:"flex",alignItems:"center",gap:4,border:"none",cursor:"pointer",transition:"all 0.15s"}} title={overdueOnly ? "Click to show all leads" : "Click to filter overdue only"}><AlertTriangle size={12}/>{overdueOnly ? `Showing ${overdueLeads} overdue` : `${overdueLeads} overdue`}</button>}
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
          <button key={p.key}
            style={{fontSize:11,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontWeight:600,border:rangeKey===p.key?"none":"1.5px solid #CBD5E1",background:rangeKey===p.key?"#1B6B5A":"#fff",color:rangeKey===p.key?"#fff":"#334155",transition:"all 0.15s",whiteSpace:"nowrap"}}
            onClick={() => setRangeKey(p.key)}>
            {p.label}
          </button>
        ))}
        <button
          style={{fontSize:11,padding:"5px 12px",borderRadius:6,cursor:"pointer",fontWeight:600,border:rangeKey==="custom"?"none":"1.5px solid #CBD5E1",background:rangeKey==="custom"?"#1B6B5A":"#fff",color:rangeKey==="custom"?"#fff":"#334155",transition:"all 0.15s",whiteSpace:"nowrap"}}
          onClick={() => setRangeKey("custom")}>
          Custom
        </button>
        {rangeKey === "custom" && (
          <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:4}}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{fontSize:11,padding:"4px 8px",borderRadius:4,border:"1.5px solid #CBD5E1"}}/>
            <span style={{fontSize:11,color:"#64748B"}}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{fontSize:11,padding:"4px 8px",borderRadius:4,border:"1.5px solid #CBD5E1"}}/>
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
        <div onClick={() => overdueLeads > 0 && setOverdueOnly(v => !v)} style={{background: overdueOnly ? "#7F1D1D" : overdueLeads > 0 ? "#DC2626" : "#1B6B5A",borderRadius:12,padding:"14px 18px",color:"white",cursor:overdueLeads > 0 ? "pointer" : "default",transition:"all 0.15s",outline:overdueOnly?"2px solid #FCA5A5":"none"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.8}}>{overdueOnly ? "FILTERED: OVERDUE" : "FOLLOW-UPS"}</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>{overdueLeads}</div>
          <div style={{fontSize:11,opacity:0.7}}>{overdueOnly ? "Click to show all" : overdueLeads > 0 ? "Overdue – click to filter!" : "All on track"}</div>
        </div>
      </div>

      {/* ──── STAGE PIPELINE MINI BAR ──── */}
      <div style={{display:"flex",height:8,borderRadius:4,overflow:"hidden",marginBottom:16,gap:2}}>
        {stageFunnel.map(s => s.count > 0 && (
          <div key={s.name} style={{flex:s.count,background:s.color,borderRadius:2,position:"relative",minWidth:4}} title={`${s.name}: ${s.count}`}/>
        ))}
      </div>

      <div className="list-with-aside">
        {/* Left: Main content */}
        <div className="lwa-main">
          {/* Filters */}
          <div className="filter-bar" style={{flexWrap:"wrap"}}>
            <div className="filter-search">
              <Search size={14} style={{ color: "var(--text3)", flexShrink: 0 }}/>
              <input placeholder="Search leads..." value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
            {/* Product / Owner use TypeaheadSelect — both can grow large.
                Stage / Source stay as plain selects: bounded enums (~5 items),
                no benefit from typing. */}
            <TypeaheadSelect
              size="filter" allowAll allLabel="All Products" placeholder="Search products…"
              value={productF} onChange={setProductF}
              options={PRODUCTS.map(p => ({ value: p.id, label: p.name }))}
            />
            <select className="filter-select" value={stageF} onChange={e => setStageF(e.target.value)}>
              <option value="All">All Stages</option>
              {LEAD_STAGES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="filter-select" value={sourceF} onChange={e => setSourceF(e.target.value)}>
              <option value="All">All Sources</option>
              {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <TypeaheadSelect
              size="filter" allowAll allLabel="All Owners" placeholder="Search owners…"
              value={ownerF} onChange={setOwnerF}
              options={team.map(u => ({ value: u.id, label: u.name, sub: u.role }))}
            />

            {/* View toggle: Table (read-only) vs. Grid (Excel-like editable) */}
            <div style={{display:"flex",gap:0,marginLeft:"auto",border:"1.5px solid #CBD5E1",borderRadius:6,overflow:"hidden"}}>
              <button
                onClick={() => setViewMode("table")}
                style={{fontSize:11,padding:"5px 12px",fontWeight:600,cursor:"pointer",border:"none",background:viewMode==="table"?"#1B6B5A":"#fff",color:viewMode==="table"?"#fff":"#334155"}}
                title="Table view">
                Table
              </button>
              <button
                onClick={() => setViewMode("grid")}
                style={{fontSize:11,padding:"5px 12px",fontWeight:600,cursor:"pointer",border:"none",background:viewMode==="grid"?"#1B6B5A":"#fff",color:viewMode==="grid"?"#fff":"#334155"}}
                title="Excel-like editable grid">
                Grid
              </button>
            </div>
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

          {/* Table / Grid */}
          <div className="card" style={{ padding: 0 }}>
            {filtered.length === 0 ? (
              <Empty icon={<Users size={22}/>} title="No leads found" sub="Try adjusting filters or add a new lead."/>
            ) : viewMode === "grid" ? (
              <EditableLeadsGrid
                rows={pg.paged}
                team={team}
                updateLeadField={updateLeadField}
                bulk={bulk}
                toggleSort={toggleSort}
                SortIcon={SortIcon}
                openEdit={openEdit}
                onOpenDetail={setDetail}
              />
            ) : (
              <div className="tbl-scroll">
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
                        {(l.contactIds?.length > 0) && (
                          <span style={{fontSize:10,fontWeight:600,color:"#3B82F6",background:"#EFF6FF",padding:"1px 6px",borderRadius:4,marginTop:2,display:"inline-block"}}>+{l.contactIds.length} more</span>
                        )}
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
                          {canDelete && (
                            <button className="icon-btn" aria-label="Delete" onClick={() => setConfirm(l.id)}>
                              <Trash2 size={14}/>
                            </button>
                          )}
                          {l.stage !== "Converted" && l.stage !== "NA" && (
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
              </div>
            )}
            <Pagination {...pg}/>
          </div>
        </div>

        {/* Right: Lead Insights Panel */}
        <div className="lwa-aside">
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
              <div onClick={() => overdueLeads > 0 && setOverdueOnly(v => !v)} style={{background: overdueOnly ? "#DC2626" : overdueLeads > 0 ? "#FEF2F2" : "var(--s2)",borderRadius:8,padding:"8px 10px",textAlign:"center",cursor:overdueLeads > 0 ? "pointer" : "default",transition:"all 0.15s"}}>
                <div style={{fontSize:18,fontWeight:800,color: overdueOnly ? "#fff" : overdueLeads > 0 ? "#DC2626" : "var(--text1)"}}>{overdueLeads}</div>
                <div style={{fontSize:9,color: overdueOnly ? "#FCA5A5" : overdueLeads > 0 ? "#DC2626" : "var(--text3)",fontWeight:600,textTransform:"uppercase"}}>{overdueOnly ? "Filtered" : "Overdue"}</div>
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
            <div className="form-group"><label>Company Name * <span style={{fontSize:10.5,color:"var(--text3)",fontWeight:400,letterSpacing:"0.3px",marginLeft:6}}>(ALL CAPS)</span></label><input value={form.company} onChange={e => { setForm(f => ({...f, company:upper(e.target.value)})); setFormErrors(e => ({...e, company:undefined})); }} placeholder="COMPANY NAME" style={{textTransform:"uppercase",...(formErrors.company ? {borderColor:"#DC2626"} : {})}}/><FormError error={formErrors.company}/></div>
            <div className="form-group"><label>Contact Name *</label><input value={form.contact} onChange={e => { setForm(f => ({...f, contact:e.target.value})); setFormErrors(e => ({...e, contact:undefined})); }} placeholder="Contact person" style={formErrors.contact ? {borderColor:"#DC2626"} : {}}/><FormError error={formErrors.contact}/></div>
          </div>

          {/* Company Hierarchy */}
          <div className="form-row">
            <div className="form-group"><label>Branch</label><input value={form.branch||""} onChange={e => setForm(f => ({...f, branch:e.target.value}))} placeholder="e.g. Mumbai HQ, Delhi NCR"/></div>
            <div className="form-group"><label>Location</label><input value={form.location||""} onChange={e => setForm(f => ({...f, location:e.target.value}))} placeholder="City / Address"/></div>
            <div className="form-group"><label>Department</label><input value={form.department||""} onChange={e => setForm(f => ({...f, department:e.target.value}))} placeholder="e.g. Operations, IT, Finance"/></div>
          </div>

          {/* Primary Contact Email/Phone */}
          <div className="form-row">
            <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e => { setForm(f => ({...f, email:e.target.value})); setFormErrors(e => ({...e, email:undefined})); }} placeholder="email@company.com" style={formErrors.email ? {borderColor:"#DC2626"} : {}}/><FormError error={formErrors.email}/></div>
            <div className="form-group"><label>Phone / WhatsApp</label><input value={form.phone} onChange={e => setForm(f => ({...f, phone:e.target.value}))} placeholder="+91-98765-00000"/></div>
          </div>

          {/* ── CONTACTS SECTION ── */}
          {(() => {
            const linkedIds = form.contactIds || [];
            const linkedContacts = (allContacts || []).filter(c => linkedIds.includes(c.id));
            const companyContacts = form.accountId
              ? (allContacts || []).filter(c => c.accountId === form.accountId && !linkedIds.includes(c.id))
              : (allContacts || []).filter(c => !linkedIds.includes(c.id));
            const formContactRoles = form.contactRoles || {};
            const ROLE_COLORS = {"Decision Maker/HOD":"#DC2626","Technical/IT":"#3B82F6","End User":"#8B5CF6","Finance/Accounts":"#F59E0B","Presales/Demo":"#0D9488","Management":"#7C3AED","Operations":"#EA580C","Other":"#94A3B8"};

            return (
              <div style={{marginBottom:12,border:"1px solid var(--border)",borderRadius:10,padding:"12px 14px",background:"var(--s2,#F8FAFC)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:700,color:"var(--text1)",display:"flex",alignItems:"center",gap:6}}><Users size={13} style={{color:"var(--brand)"}}/>Contacts ({linkedContacts.length})</span>
                  <div style={{display:"flex",gap:4}}>
                    <button type="button" className="btn btn-sm btn-sec" style={{fontSize:10,padding:"3px 8px",background: showFormInlineContact === false ? "var(--brand)" : undefined,color: showFormInlineContact === false ? "white" : undefined}} onClick={() => setShowFormInlineContact(v => v === false ? null : false)}
                      title="Add from existing contacts">
                      <UserPlus size={11}/>Add Existing
                    </button>
                    <button type="button" className="btn btn-sm btn-sec" style={{fontSize:10,padding:"3px 8px",background: showFormInlineContact === true ? "var(--brand)" : undefined,color: showFormInlineContact === true ? "white" : undefined}} onClick={() => setShowFormInlineContact(v => v === true ? null : true)}>
                      <Plus size={11}/>New Contact
                    </button>
                  </div>
                </div>

                {/* Linked contacts list with role assignment */}
                {linkedContacts.length > 0 && (
                  <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden",marginBottom:8,background:"white"}}>
                    {linkedContacts.map(c => {
                      const role = formContactRoles[c.id] || "";
                      const roleCol = ROLE_COLORS[role] || "#64748B";
                      return (
                        <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderBottom:"1px solid var(--border)",fontSize:12}}>
                          <div style={{flex:1,minWidth:0}}>
                            <span style={{fontWeight:600,color:"var(--text1)"}}>{c.name}</span>
                            {c.designation && <span style={{color:"var(--text3)",marginLeft:4,fontSize:11}}>({c.designation})</span>}
                            {c.email && <span style={{color:"var(--text3)",marginLeft:6,fontSize:10}}>{c.email}</span>}
                          </div>
                          <select value={role} onChange={e => setForm(f => ({...f, contactRoles: {...(f.contactRoles||{}), [c.id]: e.target.value}}))}
                            style={{fontSize:10,padding:"2px 6px",borderRadius:4,border:"1px solid var(--border)",minWidth:130,color: role ? roleCol : "var(--text3)",fontWeight: role ? 600 : 400}}>
                            <option value="">— Role —</option>
                            {LEAD_CONTACT_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <button type="button" onClick={() => setForm(f => {
                            const newIds = (f.contactIds||[]).filter(x => x !== c.id);
                            const newRoles = {...(f.contactRoles||{})};
                            delete newRoles[c.id];
                            return {...f, contactIds: newIds, contactRoles: newRoles};
                          })} style={{background:"none",border:"none",cursor:"pointer",color:"#DC2626",padding:2}} title="Remove contact">
                            <X size={13}/>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {linkedContacts.length === 0 && !showFormInlineContact && (
                  <div style={{fontSize:11,color:"var(--text3)",padding:"6px 0",textAlign:"center"}}>No additional contacts linked. Use buttons above to add.</div>
                )}

                {/* Add Existing Contact Dropdown */}
                {showFormInlineContact === false && companyContacts.length > 0 && (
                  <div style={{marginBottom:8}}>
                    <select
                      value=""
                      onChange={e => {
                        const cid = e.target.value;
                        if (!cid) return;
                        setForm(f => ({...f, contactIds: [...(f.contactIds||[]), cid]}));
                      }}
                      style={{fontSize:11,padding:"5px 8px",borderRadius:6,border:"1px solid var(--border)",width:"100%",color:"var(--text2)"}}>
                      <option value="">— Select existing contact to link —</option>
                      {companyContacts.map(c => (
                        <option key={c.id} value={c.id}>{c.name}{c.designation ? ` – ${c.designation}` : ""}{c.email ? ` (${c.email})` : ""}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Inline New Contact Form */}
                {showFormInlineContact === true && (
                  <InlineContactForm
                    accountId={form.accountId || ""}
                    onSave={(contactData) => {
                      const newContact = {
                        ...contactData,
                        id: `c-${uid()}`,
                        accountId: form.accountId || "",
                        primary: false,
                        contactId: `CON-${Date.now()}`,
                        departments: [],
                        products: [],
                        branches: [],
                        countries: [],
                        linkedOpps: [],
                      };
                      if (setContacts) setContacts(p => [...p, newContact]);
                      setForm(f => ({ ...f, contactIds: [...(f.contactIds||[]), newContact.id] }));
                      setShowFormInlineContact(null);
                    }}
                    onCancel={() => setShowFormInlineContact(null)}
                  />
                )}
              </div>
            );
          })()}
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
            <div className="form-group"></div>
          </div>
          <div className="form-group">
            <label>Products & Modules <span style={{color:"#DC2626"}}>*</span></label>
            <ProductModulePicker
              catalog={catalog || []}
              value={form.productSelection || []}
              error={formErrors.productSelection}
              onChange={(next) => {
                setForm(f => ({
                  ...f,
                  productSelection: next,
                  // Keep legacy single-product field in sync for lists/filters/reports
                  product: primaryProductId(next) || f.product,
                  // Mirror remaining selected product lines into additionalProducts
                  additionalProducts: next.slice(1).map(e => e.productId),
                }));
                setFormErrors(e => ({ ...e, productSelection: undefined }));
              }}
            />
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
            <div className="form-group"><label>Source <span style={{color:"#EF4444"}}>*</span></label><select value={form.source} onChange={e => setForm(f => ({...f, source:e.target.value}))}><option value="">Select Source</option>{LEAD_SOURCES.map(s => <option key={s}>{s}</option>)}</select><FormError msg={formErrors.source}/></div>
            <div className="form-group"><label>Next Step</label><select value={form.nextStep||""} onChange={e => setForm(f => ({...f, nextStep:e.target.value}))}><option value="">Select</option>{NEXT_STEPS.map(s => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Link to Account</label>
              <TypeaheadSelect
                value={form.accountId||""}
                onChange={(id) => setForm(f => ({...f, accountId: id || ""}))}
                options={accounts.map(a => ({
                  value: a.id,
                  label: a.accountNo ? `${a.accountNo} – ${a.name}` : a.name,
                  sub: a.country || a.type || "",
                }))}
                placeholder="Search accounts…"
              />
              {form.accountId && (() => { const acct = accounts.find(a => a.id === form.accountId); return acct?.hierarchyPath ? <div style={{fontSize:11, color:"var(--text3)", marginTop:2}}>{acct.hierarchyPath}</div> : null; })()}
            </div>
            <div className="form-group"><label>Lead Stage</label><select value={form.stage} onChange={e => setForm(f => ({...f, stage:e.target.value}))}>{LEAD_STAGES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Assigned To</label>
              <TypeaheadSelect
                value={form.assignedTo}
                onChange={(id) => setForm(f => ({...f, assignedTo: id}))}
                options={team.map(u => ({ value: u.id, label: u.name, sub: u.role }))}
                placeholder="Search team…"
              />
            </div>
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
        <DeleteConfirm
          title="Delete Lead"
          recordLabel={leads.find(l => l.id === confirm)?.company || "this lead"}
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
          onLogCall={(l) => openCallLog(l)}
          orgUsers={orgUsers}
          activities={activities}
          callReports={callReports}
          setActivities={setActivities}
          setCallReports={setCallReports}
          setContacts={setContacts}
          setLeads={setLeads}
        />
      )}

      {/* ──── LOG CALL MODAL (shared) ──── */}
      {callLogModal && (
        <LogCallModal
          onClose={() => setCallLogModal(null)}
          onSave={handleSaveCall}
          accounts={accounts}
          contacts={allContacts || []}
          opps={[]}
          orgUsers={orgUsers}
          masters={masters}
          prefill={callLogModal}
        />
      )}
    </div>
  );
}

export default Leads;
