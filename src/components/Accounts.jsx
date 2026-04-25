import { useState, useMemo, useCallback } from "react";
import { Plus, Search, Edit2, Trash2, Check, TrendingUp, Activity, Download, ArrowUpDown, ArrowUp, ArrowDown, Users, Phone, Mail, FileText, Calendar, AlertTriangle, Shield, Globe, Building2, Target, DollarSign, Package, Clock, Star, BarChart3, Layers, ExternalLink, X } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { PRODUCTS, PROD_MAP, CUST_TYPES, COUNTRIES, TEAM, TEAM_MAP, HIERARCHY_LEVELS, CALL_TYPES, CALL_OBJECTIVES, CALL_OUTCOMES } from '../data/constants';
import { BLANK_ACC } from '../data/seed';
import { fmt, uid, cmp, sanitizeObj, validateAccount, hasErrors, today, migrateAccountAddresses, formatAddress } from '../utils/helpers';
import { StatusBadge, ProdTag, UserPill, Modal, Confirm, DeleteConfirm, FormError, NotesThread, FilesList, Empty, LogCallModal, TypeaheadSelect } from './shared';
import ProductModulePicker, { ProductSelectionDisplay, productSelectionToString } from './ProductModulePicker';
import Pagination, { usePagination } from './Pagination';
import BulkActions, { useBulkSelect } from './BulkActions';
import { exportCSV } from '../utils/csv';

/* ── helpers ── */
const daysSince = (d) => d ? Math.max(0, Math.round((new Date(today) - new Date(d)) / 864e5)) : null;
const infoRow = (label, value) => (
  <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
    <span style={{fontSize:12,color:"var(--text3)",fontWeight:500}}>{label}</span>
    <span style={{fontSize:12,color:"var(--text1)",fontWeight:600,textAlign:"right",maxWidth:"60%"}}>{value || "—"}</span>
  </div>
);

// ═══════════════════════════════════════════════════════════════════
// ACCOUNT PROFILE — Full Customer Profile Sheet
// ═══════════════════════════════════════════════════════════════════
function AccountProfile({a, onClose, onEdit, opps, activities, contacts, tickets, contracts, collections, notes, files, onAddNote, onAddFile, currentUser, allAccounts, leads=[], orgUsers, catalog, onLogCall, onNavigate}) {
  const _team = orgUsers?.length ? orgUsers.filter(u => u.status !== 'Inactive') : TEAM;
  const _teamMap = Object.fromEntries(_team.map(u => [u.id, u]));
  const [tab, setTab] = useState("overview");
  const accOpps = opps.filter(o => o.accountId === a.id);
  const accActs = [...activities].filter(act => act.accountId === a.id).sort((x, y) => (y.date||"").localeCompare(x.date||""));
  const accContacts = contacts.filter(c => c.accountId === a.id);
  const accTickets = tickets.filter(t => t.accountId === a.id);
  const accContracts = contracts.filter(c => c.accountId === a.id);
  const accCollections = collections.filter(c => c.accountId === a.id);
  const accLeads = leads.filter(l => l.accountId === a.id || l.company?.toLowerCase().trim() === a.name?.toLowerCase().trim());
  const accNotes = notes.filter(n => n.recordType === "account" && n.recordId === a.id);
  const accFiles = files.filter(f => f.linkedTo.some(l => l.type === "account" && l.id === a.id));

  // KPIs
  const totalARR = a.arrRevenue || 0;
  const openDeals = accOpps.filter(o => !["Won", "Lost"].includes(o.stage)).length;
  const wonDeals = accOpps.filter(o => o.stage === "Won");
  const wonValue = wonDeals.reduce((s, o) => s + (o.value || 0), 0);
  const pipelineValue = accOpps.filter(o => !["Won", "Lost"].includes(o.stage)).reduce((s, o) => s + (o.value || 0), 0);
  const openTickets = accTickets.filter(t => !["Resolved", "Closed"].includes(t.status)).length;
  const activeContracts = accContracts.filter(c => c.status === "Active" || c.status === "Signed").length;
  const pendingCollections = accCollections.filter(c => c.status !== "Paid").reduce((s, c) => s + (c.amount || 0), 0);
  const lastActivity = accActs[0];

  // Cross-sell: products NOT yet sold to this account
  const currentProducts = a.products || [];
  const crossSellProducts = PRODUCTS.filter(p => !currentProducts.includes(p.id));

  // Health score
  const healthFactors = [
    totalARR > 0 ? 20 : 0,
    openDeals > 0 ? 15 : 0,
    accActs.length > 2 ? 20 : accActs.length > 0 ? 15 : 10,
    openTickets === 0 ? 15 : (openTickets <= 2 ? 5 : 0),
    activeContracts > 0 ? 15 : 0,
    accContacts.length > 0 ? 10 : 0,
    pendingCollections === 0 ? 10 : 0,
  ];
  const healthScore = healthFactors.reduce((s, v) => s + v, 0);
  const healthColor = healthScore >= 70 ? "#22C55E" : healthScore >= 40 ? "#F59E0B" : "#EF4444";
  const healthLabel = healthScore >= 70 ? "Healthy" : healthScore >= 40 ? "Needs Attention" : "At Risk";

  // Deal stage distribution for chart
  const stageData = useMemo(() => {
    const stages = {};
    accOpps.forEach(o => { stages[o.stage] = (stages[o.stage] || 0) + 1; });
    const COLORS = { Prospect: "#94A3B8", Qualified: "#3B82F6", Demo: "#8B5CF6", Proposal: "#F59E0B", Negotiation: "#0D9488", Won: "#22C55E", Lost: "#EF4444" };
    return Object.entries(stages).map(([name, value]) => ({ name, value, color: COLORS[name] || "#94A3B8" }));
  }, [accOpps]);

  const TYPE_COL = {Call:"var(--brand)", Email:"var(--blue)", Meeting:"var(--purple)", Demo:"var(--orange)", Presentation:"var(--teal)", "Site Visit":"var(--amber)"};

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "contacts", label: `Contacts (${accContacts.length})` },
    { id: "leads", label: `Leads (${accLeads.length})` },
    { id: "deals", label: `Deals (${accOpps.length})` },
    { id: "activities", label: `Activities (${accActs.length})` },
    { id: "tickets", label: `Tickets (${accTickets.length})` },
    { id: "contracts", label: `Contracts (${accContracts.length})` },
    { id: "notes", label: `Notes${accNotes.length ? ` (${accNotes.length})` : ""}` },
    { id: "files", label: `Files${accFiles.length ? ` (${accFiles.length})` : ""}` },
  ];

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Account Profile"
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{zIndex:1000}}>
      <div style={{background:"var(--bg,#F1F5F9)",width:"94vw",maxWidth:1200,maxHeight:"94vh",borderRadius:16,overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 25px 60px rgba(0,0,0,0.3)"}}>

        {/* Header */}
        <div style={{background:"white",padding:"20px 28px",borderBottom:"1px solid var(--border)",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:48,height:48,borderRadius:12,background:"#1B6B5A",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:17,fontWeight:700}}>
                {a.name?.slice(0,2).toUpperCase()}
              </div>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:18,fontWeight:700,color:"var(--text1)"}}>{a.name}</span>
                  <StatusBadge status={a.status}/>
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:"#F1F5F9",color:"#475569",fontWeight:500}}>{a.type}</span>
                  {a.accountNo && <span style={{fontSize:11,fontFamily:"'Courier New',monospace",color:"var(--text3)",background:"var(--s2)",padding:"2px 8px",borderRadius:4}}>{a.accountNo}</span>}
                </div>
                <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                  {a.city ? `${a.city}, ` : ""}{a.country} · {a.segment} · Owner: {_teamMap[a.owner]?.name || a.owner}
                  {a.website && <> · <span style={{color:"var(--brand)"}}>{a.website}</span></>}
                </div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {/* Health Score */}
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:8,background:healthColor+"14",border:`1px solid ${healthColor}30`}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:healthColor}}/>
                <span style={{fontSize:12,fontWeight:700,color:healthColor}}>{healthScore}%</span>
                <span style={{fontSize:11,color:healthColor}}>{healthLabel}</span>
              </div>
              <button className="btn btn-sec btn-sm" onClick={onClose}>Close</button>
              <button className="btn btn-primary btn-sm" onClick={onEdit}><Edit2 size={13}/>Edit</button>
            </div>
          </div>

          {/* KPI Row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginTop:16}}>
            {[
              { label: "ARR", value: totalARR ? `₹${totalARR}L` : "—", sub: "Annual recurring", color: "#1B6B5A" },
              { label: "PIPELINE", value: `₹${pipelineValue}L`, sub: `${openDeals} open deals`, color: "#3B82F6" },
              { label: "WON", value: `₹${wonValue}L`, sub: `${wonDeals.length} deals closed`, color: "#22C55E" },
              { label: "CONTACTS", value: accContacts.length, sub: `${accContacts.filter(c=>c.primary).length} primary`, color: "#8B5CF6" },
              { label: "OPEN TICKETS", value: openTickets, sub: openTickets > 0 ? "Action needed" : "All clear", color: openTickets > 0 ? "#DC2626" : "#0D9488" },
              { label: "CONTRACTS", value: activeContracts, sub: `${accContracts.length} total`, color: "#D97706" },
            ].map(k => (
              <div key={k.label} style={{background:k.color+"0A",borderRadius:10,padding:"10px 14px",border:`1px solid ${k.color}20`}}>
                <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:k.color,opacity:0.8}}>{k.label}</div>
                <div style={{fontSize:20,fontWeight:800,fontFamily:"'Outfit',sans-serif",color:"var(--text1)",marginTop:2}}>{k.value}</div>
                <div style={{fontSize:10,color:"var(--text3)"}}>{k.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div style={{background:"white",borderBottom:"1px solid var(--border)",padding:"0 28px",display:"flex",gap:0,flexShrink:0,overflowX:"auto"}}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{padding:"10px 16px",fontSize:12,fontWeight:tab===t.id?700:500,color:tab===t.id?"var(--brand)":"var(--text3)",background:"none",border:"none",borderBottom:tab===t.id?"2px solid var(--brand)":"2px solid transparent",cursor:"pointer",whiteSpace:"nowrap"}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{flex:1,overflow:"auto",padding:24}}>

          {/* ── OVERVIEW TAB ── */}
          {tab === "overview" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              {/* Left column */}
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {/* General Info */}
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <Building2 size={15} style={{color:"var(--brand)"}}/> General Information
                  </div>
                  {infoRow("Account Name", a.name)}
                  {infoRow("Type", a.type)}
                  {infoRow("Country / City", `${a.country}${a.city ? ` · ${a.city}` : ""}`)}
                  {infoRow("Segment", a.segment)}
                  {infoRow("Status", a.status)}
                  {infoRow("Website", a.website || "—")}
                  {infoRow("Hierarchy", `${a.hierarchyLevel}${a.parentId ? ` → ${allAccounts.find(x=>x.id===a.parentId)?.name||""}` : ""}`)}
                  {a.address && infoRow("Address", a.address)}
                </div>

                {/* Legal & Tax */}
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <Shield size={15} style={{color:"var(--brand)"}}/> Legal &amp; Tax
                  </div>
                  {infoRow("Legal Name", a.legalName)}
                  {infoRow("PAN / Tax ID", a.pan)}
                  {infoRow("GSTIN", a.gstin)}
                  {infoRow("CIN", a.cin)}
                  {infoRow("Tax Treatment", a.taxTreatment)}
                  {infoRow("TDS Applicable", a.tdsApplicable)}
                  {infoRow("PO Mandatory", a.poMandatory)}
                </div>

                {/* Billing Profile */}
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <DollarSign size={15} style={{color:"var(--brand)"}}/> Billing Profile
                  </div>
                  {infoRow("Payment Terms", a.paymentTerms)}
                  {infoRow("Credit Days", a.creditDays != null ? String(a.creditDays) : "")}
                  {infoRow("Currency", a.currency)}
                  {infoRow("Billing Frequency", a.billingFrequency)}
                  {infoRow("Primary Contact", a.primaryContact)}
                  {infoRow("Primary Email", a.primaryEmail)}
                  {infoRow("Billing Contact", a.billingContactName)}
                  {infoRow("Billing Contact Email", a.billingContactEmail)}
                  {infoRow("Finance Contact Email", a.financeContactEmail)}
                </div>

                {/* Products */}
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <Package size={15} style={{color:"var(--brand)"}}/> Products & Revenue
                  </div>
                  <div style={{marginBottom:12}}>
                    <ProductSelectionDisplay
                      value={a.productSelection}
                      catalog={catalog}
                      fallbackProducts={currentProducts}
                    />
                  </div>
                  {infoRow("ARR (Annual Recurring Revenue)", totalARR ? `₹${totalARR} L` : "—")}
                  {infoRow("Potential Value", a.potential ? `₹${a.potential} L` : "—")}
                  {infoRow("Won Deal Value", wonValue ? `₹${wonValue} L` : "—")}
                  {pendingCollections > 0 && infoRow("Pending Collections", <span style={{color:"#DC2626",fontWeight:700}}>₹{pendingCollections.toFixed(1)} L</span>)}
                </div>

                {/* Cross-sell Opportunities */}
                {crossSellProducts.length > 0 && (
                  <div style={{background:"#1B6B5A0A",borderRadius:12,padding:"18px 20px",border:"1px solid #1B6B5A20"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
                      <Target size={15} style={{color:"#1B6B5A"}}/> Cross-sell Opportunities
                    </div>
                    <div style={{fontSize:12,color:"var(--text3)",marginBottom:10}}>Products not yet adopted by this account:</div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      {crossSellProducts.map(p => (
                        <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"white",borderRadius:8,border:"1px solid var(--border)"}}>
                          <div style={{width:8,height:8,borderRadius:2,background:p.color,flexShrink:0}}/>
                          <div style={{flex:1}}>
                            <div style={{fontSize:12,fontWeight:600,color:"var(--text1)"}}>{p.name}</div>
                            <div style={{fontSize:10,color:"var(--text3)"}}>{p.desc}</div>
                          </div>
                          <span style={{fontSize:10,fontWeight:600,color:"#1B6B5A",background:"#1B6B5A14",padding:"2px 8px",borderRadius:4}}>OPPORTUNITY</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right column */}
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {/* Deal Pipeline */}
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <BarChart3 size={15} style={{color:"var(--brand)"}}/> Deal Pipeline
                  </div>
                  {stageData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={stageData} layout="vertical">
                        <XAxis type="number" hide/>
                        <YAxis type="category" dataKey="name" width={80} tick={{fontSize:11}} axisLine={false} tickLine={false}/>
                        <Tooltip formatter={(v) => [`${v} deals`]}/>
                        <Bar dataKey="value" radius={[0,4,4,0]}>
                          {stageData.map((s, i) => <Cell key={i} fill={s.color}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div style={{fontSize:12,color:"var(--text3)",textAlign:"center",padding:20}}>No deals yet</div>}
                </div>

                {/* Key Contacts */}
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <Users size={15} style={{color:"var(--brand)"}}/> Key Contacts
                  </div>
                  {accContacts.length > 0 ? accContacts.slice(0, 5).map(c => (
                    <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
                      <div style={{width:32,height:32,borderRadius:8,background:"var(--brand)",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:11,fontWeight:700,flexShrink:0}}>
                        {c.name?.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:"var(--text1)"}}>{c.name}{c.primary && <Star size={10} style={{color:"#F59E0B",marginLeft:4,verticalAlign:"middle"}}/>}</div>
                        <div style={{fontSize:10,color:"var(--text3)"}}>{c.role || c.designation || "—"}</div>
                      </div>
                      {c.email && <Mail size={12} style={{color:"var(--text3)",flexShrink:0}}/>}
                      {c.phone && <Phone size={12} style={{color:"var(--text3)",flexShrink:0}}/>}
                    </div>
                  )) : <div style={{fontSize:12,color:"var(--text3)",textAlign:"center",padding:16}}>No contacts linked</div>}
                  {accContacts.length > 5 && <div style={{fontSize:11,color:"var(--brand)",fontWeight:600,marginTop:8,cursor:"pointer"}} onClick={() => setTab("contacts")}>View all {accContacts.length} contacts →</div>}
                </div>

                {/* Recent Activity */}
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <Clock size={15} style={{color:"var(--brand)"}}/> Recent Activity
                  </div>
                  {accActs.length > 0 ? accActs.slice(0, 4).map(act => {
                    const col = TYPE_COL[act.type] || "var(--text3)";
                    return (
                      <div key={act.id} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
                        <div style={{width:28,height:28,borderRadius:6,background:col+"18",display:"flex",alignItems:"center",justifyContent:"center",color:col,flexShrink:0}}>
                          <Activity size={12}/>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:500,color:"var(--text1)"}}>{act.title}</div>
                          <div style={{fontSize:10,color:"var(--text3)"}}>{act.type} · {fmt.short(act.date)} · <StatusBadge status={act.status}/></div>
                        </div>
                      </div>
                    );
                  }) : <div style={{fontSize:12,color:"var(--text3)",textAlign:"center",padding:16}}>No activities logged</div>}
                  {accActs.length > 4 && <div style={{fontSize:11,color:"var(--brand)",fontWeight:600,marginTop:8,cursor:"pointer"}} onClick={() => setTab("activities")}>View all {accActs.length} activities →</div>}
                </div>

                {/* Open Tickets */}
                {openTickets > 0 && (
                  <div style={{background:"#FEF2F2",borderRadius:12,padding:"18px 20px",border:"1px solid #FECACA"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#DC2626",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
                      <AlertTriangle size={15}/> Open Support Tickets ({openTickets})
                    </div>
                    {accTickets.filter(t => !["Resolved","Closed"].includes(t.status)).slice(0, 3).map(t => (
                      <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #FECACA40"}}>
                        <span style={{fontSize:10,fontWeight:700,fontFamily:"'Courier New',monospace",color:"#DC2626"}}>{t.id}</span>
                        <span style={{fontSize:12,color:"var(--text1)",flex:1}}>{t.title?.slice(0, 40)}</span>
                        <StatusBadge status={t.priority || t.status}/>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CONTACTS TAB ── */}
          {tab === "contacts" && (
            accContacts.length === 0 ? <Empty icon={<Users size={22}/>} title="No contacts" sub="No contacts linked to this account."><button className="btn btn-primary" style={{marginTop:12}} onClick={()=>onNavigate?.("contacts")}><Plus size={13}/>Go to Contacts</button></Empty> :
            <div className="card" style={{padding:0}}>
              <table className="tbl">
                <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Email</th><th>Phone</th><th>Primary</th></tr></thead>
                <tbody>{accContacts.map(c => (
                  <tr key={c.id} style={{cursor:"pointer"}} onClick={() => onNavigate?.("contacts")}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--s2)"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <td style={{fontWeight:600,fontSize:12.5}}>{c.name}</td>
                    <td style={{fontSize:12}}>{c.role || c.designation || "—"}</td>
                    <td style={{fontSize:12}}>{c.department || "—"}</td>
                    <td style={{fontSize:12}}><a href={`mailto:${c.email}`} onClick={e=>e.stopPropagation()} style={{color:"var(--brand)"}}>{c.email || "—"}</a></td>
                    <td style={{fontSize:12}}>{c.phone || "—"}</td>
                    <td>{c.primary && <Star size={13} style={{color:"#F59E0B"}}/>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {/* ── LEADS TAB ── */}
          {tab === "leads" && (
            accLeads.length === 0 ? <Empty icon={<Target size={22}/>} title="No leads" sub="No leads linked to this account."><button className="btn btn-primary" style={{marginTop:12}} onClick={()=>onNavigate?.("leads")}><Plus size={13}/>Add Lead</button></Empty> :
            <div className="card" style={{padding:0}}>
              <table className="tbl">
                <thead><tr><th>Lead ID</th><th>Contact</th><th>Product</th><th>Stage</th><th>Score</th><th>Temperature</th><th>Next Call</th><th>Assigned</th></tr></thead>
                <tbody>{accLeads.map(l => {
                  const tempColors = {Hot:"#DC2626",Warm:"#F59E0B",Cool:"#3B82F6",Cold:"#94A3B8",Dead:"#64748B"};
                  return (
                    <tr key={l.id} style={{cursor:"pointer", background: l.temperature === "Hot" ? "#FEF2F214" : ""}}
                      onClick={() => onNavigate?.("leads")}
                      onMouseEnter={e=>e.currentTarget.style.background="var(--s2)"} onMouseLeave={e=>e.currentTarget.style.background=l.temperature==="Hot"?"#FEF2F214":""}>
                      <td><span style={{fontFamily:"'Courier New',monospace",fontSize:11,fontWeight:600,color:"var(--brand)"}}>{l.leadId}</span></td>
                      <td><div style={{fontSize:12,fontWeight:600}}>{l.contact}</div><div style={{fontSize:10,color:"var(--text3)"}}>{l.designation || l.email}</div></td>
                      <td><ProdTag pid={l.product}/></td>
                      <td><StatusBadge status={l.stage === "MQL" ? "MQL" : l.stage === "SQL" ? "SQL" : l.stage === "SAL" ? "SAL" : l.stage}/></td>
                      <td style={{fontSize:12,fontWeight:700}}>{l.score}</td>
                      <td><span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:4,background:(tempColors[l.temperature]||"#94A3B8")+"18",color:tempColors[l.temperature]||"#94A3B8"}}>{l.temperature || "—"}</span></td>
                      <td style={{fontSize:12,color:"var(--text3)"}}>{fmt.short(l.nextCall)}</td>
                      <td><UserPill uid={l.assignedTo}/></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}

          {/* ── DEALS TAB ── */}
          {tab === "deals" && (
            accOpps.length === 0 ? <Empty icon={<TrendingUp size={22}/>} title="No deals" sub="No opportunities linked to this account."><button className="btn btn-primary" style={{marginTop:12}} onClick={()=>onNavigate?.("pipeline")}><Plus size={13}/>Add Deal</button></Empty> :
            <div className="card" style={{padding:0}}>
              <table className="tbl">
                <thead><tr><th>Deal</th><th>Products</th><th>Stage</th><th>Value</th><th>Probability</th><th>Close Date</th><th>Owner</th></tr></thead>
                <tbody>{accOpps.map(o => (
                  <tr key={o.id} style={{cursor:"pointer", background: o.stage==="Won"?"#F0FDF4":o.stage==="Lost"?"#FEF2F2":""}}
                    onClick={() => onNavigate?.("pipeline")}
                    onMouseEnter={e=>e.currentTarget.style.background="var(--s2)"} onMouseLeave={e=>e.currentTarget.style.background=o.stage==="Won"?"#F0FDF4":o.stage==="Lost"?"#FEF2F2":""}>
                    <td style={{fontWeight:600,fontSize:12.5}}>{o.title}</td>
                    <td><ProductSelectionDisplay value={o.productSelection} catalog={catalog} fallbackProducts={o.products||[]} compact/></td>
                    <td><StatusBadge status={o.stage}/></td>
                    <td style={{fontFamily:"'Outfit',sans-serif",fontWeight:700}}>₹{o.value}L</td>
                    <td style={{fontSize:12}}>{o.probability}%</td>
                    <td style={{fontSize:12,color:"var(--text3)"}}>{fmt.short(o.closeDate)}</td>
                    <td><UserPill uid={o.owner}/></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {/* ── ACTIVITIES TAB ── */}
          {tab === "activities" && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <button className="btn btn-xs btn-sec" onClick={() => onLogCall && onLogCall({ accountId: a.id })}>
                  <Phone size={12} /> Log Call
                </button>
              </div>
            {accActs.length === 0 ? <Empty icon={<Activity size={22}/>} title="No activities" sub="No activities logged for this account."/> :
            <div className="timeline">
              {accActs.map(act => {
                const col = TYPE_COL[act.type] || "var(--text3)";
                return (
                  <div key={act.id} className="tl-item">
                    <div className="tl-dot" style={{borderColor:col,color:col,width:28,height:28}}><Activity size={11}/></div>
                    <div className="tl-body">
                      <div className="tl-head"><div className="tl-title" style={{fontSize:12.5}}>{act.title}</div><div className="tl-date">{fmt.short(act.date)}{act.time ? " · " + fmt.time(act.time) : ""}</div></div>
                      <div className="tl-meta">
                        <span style={{fontSize:10,fontWeight:700,padding:"1px 5px",borderRadius:3,background:col+"18",color:col}}>{act.type}</span>
                        <StatusBadge status={act.status}/>
                        <UserPill uid={act.owner}/>
                        {act.notes && <span style={{fontSize:11,color:"var(--text3)"}}>{act.notes.substring(0, 60)}…</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>}
            </div>
          )}

          {/* ── TICKETS TAB ── */}
          {tab === "tickets" && (
            accTickets.length === 0 ? <Empty icon={<Shield size={22}/>} title="No tickets" sub="No support tickets for this account."/> :
            <div className="card" style={{padding:0}}>
              <table className="tbl">
                <thead><tr><th>Ticket ID</th><th>Title</th><th>Product</th><th>Priority</th><th>Status</th><th>Assigned</th></tr></thead>
                <tbody>{accTickets.map(t => (
                  <tr key={t.id} style={!["Resolved","Closed"].includes(t.status) ? {background: t.priority === "Critical" ? "#FEF2F2" : undefined} : undefined}>
                    <td><span style={{fontFamily:"'Courier New',monospace",fontSize:11,fontWeight:600}}>{t.id}</span></td>
                    <td style={{fontSize:12,fontWeight:500}}>{t.title}</td>
                    <td><ProdTag pid={t.product}/></td>
                    <td><StatusBadge status={t.priority}/></td>
                    <td><StatusBadge status={t.status}/></td>
                    <td><UserPill uid={t.assigned}/></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {/* ── CONTRACTS TAB ── */}
          {tab === "contracts" && (
            accContracts.length === 0 ? <Empty icon={<FileText size={22}/>} title="No contracts" sub="No contracts for this account."/> :
            <div className="card" style={{padding:0}}>
              <table className="tbl">
                <thead><tr><th>Contract</th><th>Product</th><th>Status</th><th>Value</th><th>Start</th><th>End</th><th>Renewal</th></tr></thead>
                <tbody>{accContracts.map(c => {
                  const isExpiring = c.endDate && c.endDate <= today && c.status !== "Expired";
                  return (
                    <tr key={c.id} style={isExpiring ? {background:"#FEF2F2"} : undefined}>
                      <td style={{fontSize:12,fontWeight:600}}>{c.title || c.contractId || c.id}</td>
                      <td><ProdTag pid={c.product}/></td>
                      <td><StatusBadge status={c.status}/></td>
                      <td style={{fontFamily:"'Outfit',sans-serif",fontWeight:700}}>₹{c.value || 0}L</td>
                      <td style={{fontSize:12,color:"var(--text3)"}}>{fmt.short(c.startDate)}</td>
                      <td style={{fontSize:12,color: isExpiring ? "#DC2626" : "var(--text3)",fontWeight: isExpiring ? 700 : 400}}>{fmt.short(c.endDate)}</td>
                      <td style={{fontSize:12,color:"var(--text3)"}}>{fmt.short(c.renewalDate)}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}

          {/* ── NOTES TAB ── */}
          {tab === "notes" && <NotesThread notes={accNotes} currentUser={currentUser} onAdd={text => onAddNote({id:`n${uid()}`,recordType:"account",recordId:a.id,author:currentUser,date:new Date().toISOString().slice(0,16).replace("T"," "),text})}/>}

          {/* ── FILES TAB ── */}
          {tab === "files" && <FilesList files={accFiles} currentUser={currentUser} onAdd={f => onAddFile({...f,linkedTo:[{type:"account",id:a.id}]})}/>}
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// ACCOUNTS PAGE
// ═══════════════════════════════════════════════════════════════════
function Accounts({accounts, setAccounts, onDeleteAccount, opps, activities, setActivities, notes, files, onAddNote, onAddFile, currentUser, contacts=[], tickets=[], contracts=[], collections=[], leads=[], orgUsers, callReports, setCallReports, masters, catalog, canDelete}) {
  const team = orgUsers?.length ? orgUsers.filter(u => u.status !== 'Inactive') : TEAM;
  const teamMap = Object.fromEntries(team.map(u => [u.id, u]));
  const [typeF, setTypeF] = useState("All");
  const [countryF, setCountryF] = useState("All");
  const [statusF, setStatusF] = useState("All");
  const [ownerF, setOwnerF] = useState("All");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK_ACC);
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [logCallPrefill, setLogCallPrefill] = useState(null);
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  /* ── Save call report handler ── */
  const handleSaveCall = useCallback((callForm) => {
    const clean = sanitizeObj(callForm);
    const callReport = {
      id: `cr${uid()}`,
      company: accounts.find(a => a.id === clean.accountId)?.name || "",
      marketingPerson: currentUser,
      callType: clean.callType,
      callDate: clean.callDate,
      notes: clean.notes,
      nextCallDate: clean.nextCallDate,
      objective: clean.objective,
      outcome: clean.outcome,
      duration: clean.duration,
      accountId: clean.accountId,
      contactId: clean.contactIds?.[0] || "",
      oppId: clean.oppId,
      contactIds: clean.contactIds,
      participantIds: clean.participantIds,
      callTime: clean.callTime,
      leadId: clean.leadId || "",
      nextStepDesc: clean.nextStepDesc,
    };
    setCallReports(p => [...p, callReport]);

    if (clean.createFollowup) {
      const acctName = accounts.find(a => a.id === clean.accountId)?.name || "";
      const followup = {
        id: `act${uid()}`,
        title: clean.followupTitle || `Follow-up: ${acctName}`,
        type: "Call",
        status: "Planned",
        date: clean.followupDue || clean.nextCallDate || today,
        accountId: clean.accountId,
        contactId: clean.contactIds?.[0] || "",
        oppId: clean.oppId,
        owner: clean.followupAssign || currentUser,
        notes: `Follow-up from call on ${clean.callDate}`,
      };
      setActivities(p => [...p, followup]);
    }
  }, [accounts, currentUser, setCallReports, setActivities]);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };
  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <ArrowUpDown size={11} style={{opacity:0.3,marginLeft:2}}/>;
    return sortDir === "asc" ? <ArrowUp size={11} style={{marginLeft:2}}/> : <ArrowDown size={11} style={{marginLeft:2}}/>;
  };

  const filtered = useMemo(() => [...accounts].filter(a => {
    if (typeF !== "All" && a.type !== typeF) return false;
    if (countryF !== "All" && a.country !== countryF) return false;
    if (statusF !== "All" && a.status !== statusF) return false;
    if (ownerF !== "All" && a.owner !== ownerF) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    let v;
    if (sortCol === "arrRevenue" || sortCol === "potential") v = (a[sortCol] || 0) - (b[sortCol] || 0);
    else v = cmp(a, b, sortCol);
    return sortDir === "desc" ? -v : v;
  }), [accounts, typeF, countryF, statusF, ownerF, search, sortCol, sortDir]);

  const bulk = useBulkSelect(filtered);
  const pg = usePagination(filtered);

  // Enriched data for table
  const enriched = useMemo(() => {
    return pg.paged.map(a => ({
      ...a,
      _contacts: contacts.filter(c => c.accountId === a.id).length,
      _openDeals: opps.filter(o => o.accountId === a.id && !["Won","Lost"].includes(o.stage)).length,
      _openTickets: tickets.filter(t => t.accountId === a.id && !["Resolved","Closed"].includes(t.status)).length,
      _leads: leads.filter(l => l.accountId === a.id || l.company?.toLowerCase().trim() === a.name?.toLowerCase().trim()).length,
      _lastActivity: (() => {
        const acts = activities.filter(act => act.accountId === a.id).sort((x,y) => (y.date||"").localeCompare(x.date||""));
        return acts[0]?.date || null;
      })(),
    }));
  }, [pg.paged, contacts, opps, tickets, activities]);

  // ── KPI computations ──
  const totalARR = accounts.filter(a => a.status === "Active").reduce((s, a) => s + (a.arrRevenue || 0), 0);
  const totalPotential = accounts.reduce((s, a) => s + (a.potential || 0), 0);
  const activeCount = accounts.filter(a => a.status === "Active").length;
  const prospectCount = accounts.filter(a => a.status === "Prospect").length;
  const avgProducts = accounts.length > 0 ? (accounts.reduce((s, a) => s + (a.products?.length || 0), 0) / accounts.length).toFixed(1) : 0;

  // Product adoption for insights
  const productAdoption = useMemo(() => {
    const byProd = {};
    accounts.forEach(a => (a.products || []).forEach(p => { byProd[p] = (byProd[p] || 0) + 1; }));
    return PRODUCTS.map(p => ({ name: p.name, value: byProd[p.id] || 0, color: p.color })).sort((a, b) => b.value - a.value);
  }, [accounts]);

  // Type distribution
  const typeDistribution = useMemo(() => {
    const byType = {};
    accounts.forEach(a => { byType[a.type] = (byType[a.type] || 0) + 1; });
    const COLORS = ["#1B6B5A","#3B82F6","#F59E0B","#8B5CF6","#EF4444","#0D9488","#D97706"];
    return Object.entries(byType).map(([name, value], i) => ({ name, value, color: COLORS[i % COLORS.length] })).sort((a, b) => b.value - a.value);
  }, [accounts]);

  const nextAccountNo = () => {
    const year = new Date(today).getFullYear();
    const nums = accounts.map(a => {
      const m = a.accountNo?.match(/ACC-\d{4}-(\d+)/);
      return m ? parseInt(m[1]) : 0;
    });
    const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1;
    return `ACC-${year}-${String(next).padStart(3, '0')}`;
  };
  const openAdd = () => { setForm({...BLANK_ACC, id:`a${uid()}`, accountNo: nextAccountNo(), addresses:[], owner: currentUser || BLANK_ACC.owner}); setFormErrors({}); setModal({mode:"add"}); };
  const openEdit = a => {
    // Backfill productSelection from legacy `products` array so existing accounts open in the picker
    const seeded = (Array.isArray(a.productSelection) && a.productSelection.length > 0)
      ? a.productSelection
      : (a.products || []).filter(Boolean).map(productId => ({ productId, moduleIds: [], noAddons: false }));
    // Auto-migrate legacy address fields into the new addresses[] array
    const migrated = migrateAccountAddresses(a);
    setForm({...migrated, products:[...(a.products||[])], productSelection: seeded, addresses: [...(migrated.addresses || [])]});
    setFormErrors({});
    setModal({mode:"edit"});
  };

  /* ── Address book CRUD (operates on form.addresses) ── */
  const addAddress = () => {
    const nextId = `addr_${Date.now().toString(36)}_${(form.addresses||[]).length + 1}`;
    const isFirst = (form.addresses||[]).length === 0;
    setForm(f => ({...f, addresses: [...(f.addresses||[]), {
      id: nextId, label: isFirst ? "Head Office" : "Office",
      line1: "", city: "", state: "", country: f.country || "India", pincode: "",
      isPrimary: isFirst, isBilling: isFirst,
    }]}));
  };
  const updateAddress = (idx, patch) => {
    setForm(f => {
      const next = [...(f.addresses||[])];
      next[idx] = {...next[idx], ...patch};
      // Enforce single primary / single billing — toggling on one clears the others
      if (patch.isPrimary === true) next.forEach((a, i) => { if (i !== idx) a.isPrimary = false; });
      if (patch.isBilling === true) next.forEach((a, i) => { if (i !== idx) a.isBilling = false; });
      return {...f, addresses: next};
    });
  };
  const removeAddress = (idx) => {
    setForm(f => {
      const next = (f.addresses||[]).filter((_, i) => i !== idx);
      // If we removed the primary, promote the first remaining
      if (next.length > 0 && !next.some(a => a.isPrimary)) next[0].isPrimary = true;
      if (next.length > 0 && !next.some(a => a.isBilling)) next[0].isBilling = true;
      return {...f, addresses: next};
    });
  };

  const save = () => {
    const errs = validateAccount(form);
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    const isDup = accounts.some(existing => existing.id !== form.id && existing.name.toLowerCase().trim() === form.name.toLowerCase().trim() && existing.country === form.country);
    if (isDup && !window.confirm("An account with the same name and country already exists. Continue anyway?")) return;
    // Sync legacy single-address + billingAddress fields with the primary/billing entries
    // so anywhere in the app that still reads `acc.address` keeps working.
    const addrs = form.addresses || [];
    const primary = addrs.find(a => a.isPrimary) || addrs[0];
    const billing = addrs.find(a => a.isBilling) || primary;
    const synced = primary ? {
      address: primary.line1 || form.address,
      city: primary.city || form.city,
      state: primary.state || form.state,
      country: primary.country || form.country,
      pincode: primary.pincode || form.pincode,
    } : {};
    const billingSynced = billing ? {
      billingAddress: billing.line1 || form.billingAddress,
      billingCity: billing.city || form.billingCity,
      billingState: billing.state || form.billingState,
      billingCountry: billing.country || form.billingCountry,
      billingPincode: billing.pincode || form.billingPincode,
    } : {};
    const clean = sanitizeObj({...form, ...synced, ...billingSynced});
    if (modal.mode === "add") setAccounts(p => [...p, {...clean}]);
    else setAccounts(p => p.map(a => a.id === clean.id ? {...clean} : a));
    setModal(null); setDetail(null); setFormErrors({});
  };
  const del = id => { onDeleteAccount(id); setConfirm(null); setDetail(null); };
  const toggleProd = pid => {
    const pp = form.products.includes(pid) ? form.products.filter(x => x !== pid) : [...form.products, pid];
    setForm(f => ({...f, products: pp}));
  };

  // Column headers match BulkUpload field names — export is directly re-importable for bulk UPDATE
  const CSV_COLS = [
    {label:"accountNo",          accessor:a=>a.accountNo||""},
    {label:"name",               accessor:a=>a.name||""},
    {label:"type",               accessor:a=>a.type||""},
    {label:"country",            accessor:a=>a.country||""},
    {label:"city",               accessor:a=>a.city||""},
    {label:"address",            accessor:a=>a.address||""},
    {label:"website",            accessor:a=>a.website||""},
    {label:"segment",            accessor:a=>a.segment||""},
    {label:"status",             accessor:a=>a.status||""},
    {label:"hierarchyLevel",     accessor:a=>a.hierarchyLevel||"Parent Company"},
    {label:"parentId",           accessor:a=>a.parentId||""},
    {label:"products",           accessor:a=>(a.products||[]).join(";")},
    {label:"productSelection",   accessor:a=>productSelectionToString(a.productSelection, catalog)},
    {label:"arrRevenue",         accessor:a=>a.arrRevenue||0},
    {label:"potential",          accessor:a=>a.potential||0},
    {label:"owner",              accessor:a=>teamMap[a.owner]?.name||a.owner||""},
    {label:"state",              accessor:a=>a.state||""},
    {label:"pincode",            accessor:a=>a.pincode||""},
    {label:"legalName",          accessor:a=>a.legalName||""},
    {label:"pan",                accessor:a=>a.pan||""},
    {label:"gstin",              accessor:a=>a.gstin||""},
    {label:"cin",                accessor:a=>a.cin||""},
    {label:"taxTreatment",       accessor:a=>a.taxTreatment||""},
    {label:"tdsApplicable",      accessor:a=>a.tdsApplicable||""},
    {label:"poMandatory",        accessor:a=>a.poMandatory||""},
    {label:"billingAddress",     accessor:a=>a.billingAddress||""},
    {label:"billingCity",        accessor:a=>a.billingCity||""},
    {label:"billingState",       accessor:a=>a.billingState||""},
    {label:"billingPincode",     accessor:a=>a.billingPincode||""},
    {label:"billingCountry",     accessor:a=>a.billingCountry||""},
    {label:"primaryContact",     accessor:a=>a.primaryContact||""},
    {label:"primaryEmail",       accessor:a=>a.primaryEmail||""},
    {label:"primaryPhone",       accessor:a=>a.primaryPhone||""},
    {label:"billingContactName", accessor:a=>a.billingContactName||""},
    {label:"billingContactEmail",accessor:a=>a.billingContactEmail||""},
    {label:"financeContactEmail",accessor:a=>a.financeContactEmail||""},
    {label:"paymentTerms",       accessor:a=>a.paymentTerms||""},
    {label:"creditDays",         accessor:a=>a.creditDays??30},
    {label:"currency",           accessor:a=>a.currency||""},
    {label:"billingFrequency",   accessor:a=>a.billingFrequency||""},
    {label:"entityType",         accessor:a=>a.entityType||""},
    {label:"groupCode",          accessor:a=>a.groupCode||""},
    {label:"territory",          accessor:a=>a.territory||""},
  ];

  return (
    <div>
      <div className="pg-head">
        <div>
          <div className="pg-title">Accounts</div>
          <div className="pg-sub">{accounts.length} total · {activeCount} active · {prospectCount} prospects</div>
        </div>
        <div className="pg-actions">
          <button className="btn btn-sec" onClick={() => exportCSV(filtered, CSV_COLS, "accounts")}><Download size={14}/>Export</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={14}/>Add Account</button>
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:16}}>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"14px 18px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.8}}>TOTAL ACCOUNTS</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>{accounts.length}</div>
          <div style={{fontSize:11,opacity:0.7}}>{activeCount} active · {prospectCount} prospects</div>
        </div>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"14px 18px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.8}}>TOTAL ARR</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>₹{totalARR}L</div>
          <div style={{fontSize:11,opacity:0.7}}>Active accounts</div>
        </div>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"14px 18px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.8}}>PIPELINE POTENTIAL</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>₹{totalPotential}L</div>
          <div style={{fontSize:11,opacity:0.7}}>Across all accounts</div>
        </div>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"14px 18px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.8}}>AVG PRODUCTS</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>{avgProducts}</div>
          <div style={{fontSize:11,opacity:0.7}}>Per account</div>
        </div>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"14px 18px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.8}}>COUNTRIES</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>{new Set(accounts.map(a => a.country)).size}</div>
          <div style={{fontSize:11,opacity:0.7}}>Geographic reach</div>
        </div>
      </div>

      <div className="list-with-aside">
        {/* Left: Main table */}
        <div className="lwa-main">
          {/* Filters */}
          <div className="filter-bar" style={{flexWrap:"wrap"}}>
            <div className="filter-search"><Search size={14} style={{color:"var(--text3)",flexShrink:0}}/><input placeholder="Search accounts…" value={search} onChange={e => setSearch(e.target.value)}/></div>
            <select className="filter-select" value={typeF} onChange={e => setTypeF(e.target.value)}><option>All</option>{CUST_TYPES.map(t => <option key={t}>{t}</option>)}</select>
            {/* Country list grows with global expansion → typeahead */}
            <TypeaheadSelect
              size="filter" allowAll allLabel="All Countries" placeholder="Search countries…"
              value={countryF} onChange={setCountryF}
              options={COUNTRIES.map(c => ({ value: c, label: c }))}
            />
            <select className="filter-select" value={statusF} onChange={e => setStatusF(e.target.value)}><option>All</option><option>Active</option><option>Prospect</option></select>
            <TypeaheadSelect
              size="filter" allowAll allLabel="All Owners" placeholder="Search owners…"
              value={ownerF} onChange={setOwnerF}
              options={team.map(u => ({ value: u.id, label: u.name, sub: u.role }))}
            />
          </div>

          <BulkActions count={bulk.count} onClear={bulk.clear}
            onDelete={() => { if(window.confirm("Delete " + bulk.count + " accounts and all linked data?")) { bulk.selected.forEach(id => onDeleteAccount(id)); bulk.clear(); }}}
            onExport={() => exportCSV(accounts.filter(a => bulk.isSelected(a.id)), CSV_COLS, "accounts")}/>

          <div className="card" style={{padding:0}}>
            {filtered.length === 0 ? (
              <Empty icon={<Building2 size={22}/>} title="No accounts found" sub="Try adjusting filters or add a new account."/>
            ) : (
              <div className="tbl-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{width:36}}><input type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll}/></th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("name")}>Account<SortIcon col="name"/></th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("type")}>Type<SortIcon col="type"/></th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("country")}>Country<SortIcon col="country"/></th>
                    <th>Products</th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("status")}>Status<SortIcon col="status"/></th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("arrRevenue")}>ARR<SortIcon col="arrRevenue"/></th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("potential")}>Potential<SortIcon col="potential"/></th>
                    <th>Relationships</th>
                    <th><UserPill uid={null} style={{visibility:"hidden"}}/></th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>{enriched.map(a => (
                  <tr key={a.id}>
                    <td><input type="checkbox" checked={bulk.isSelected(a.id)} onChange={() => bulk.toggle(a.id)}/></td>
                    <td>
                      <span className="tbl-link" onClick={() => setDetail(a)}>{a.name}</span>
                      <div style={{fontSize:11,color:"var(--text3)"}}>
                        {a.accountNo && <span style={{fontFamily:"'Courier New',monospace",marginRight:4}}>{a.accountNo}</span>}
                        {a.city}{a.hierarchyLevel !== "Parent Company" ? ` · ${a.hierarchyLevel}` : ""}
                      </div>
                    </td>
                    <td style={{fontSize:12}}>{a.type}</td>
                    <td style={{fontSize:12}}>{a.country}</td>
                    <td><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{(a.products||[]).map(p => <ProdTag key={p} pid={p}/>)}</div></td>
                    <td><StatusBadge status={a.status}/></td>
                    <td style={{fontFamily:"'Outfit',sans-serif",fontWeight:700}}>{a.arrRevenue ? fmt.inr(a.arrRevenue) : "—"}</td>
                    <td style={{fontFamily:"'Outfit',sans-serif",fontWeight:700,color:"var(--brand)"}}>{a.potential ? fmt.inr(a.potential) : "—"}</td>
                    <td>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {a._contacts > 0 && <span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:"#8B5CF614",color:"#8B5CF6"}} title="Contacts"><Users size={9}/> {a._contacts}</span>}
                        {a._leads > 0 && <span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:"#F59E0B14",color:"#F59E0B"}} title="Active leads"><Target size={9}/> {a._leads}</span>}
                        {a._openDeals > 0 && <span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:"#3B82F614",color:"#3B82F6"}} title="Open deals"><TrendingUp size={9}/> {a._openDeals}</span>}
                        {a._openTickets > 0 && <span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:"#DC262614",color:"#DC2626"}} title="Open tickets"><AlertTriangle size={9}/> {a._openTickets}</span>}
                        {a._lastActivity && <span style={{fontSize:10,color:"var(--text3)"}} title={`Last activity: ${a._lastActivity}`}>{daysSince(a._lastActivity)}d ago</span>}
                      </div>
                    </td>
                    <td><UserPill uid={a.owner}/></td>
                    <td>
                      <div style={{display:"flex",gap:4}}>
                        <button className="icon-btn" aria-label="Edit" onClick={() => openEdit(a)}><Edit2 size={14}/></button>
                        {canDelete && <button className="icon-btn" aria-label="Delete" onClick={() => setConfirm(a.id)}><Trash2 size={14}/></button>}
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
              </div>
            )}
            <Pagination {...pg}/>
          </div>
        </div>

        {/* Right: Insights Panel */}
        <div className="lwa-aside">
          {/* Product Adoption */}
          <div className="card" style={{padding:16,marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",color:"var(--text3)",letterSpacing:"0.06em",marginBottom:10}}>PRODUCT ADOPTION</div>
            {productAdoption.map(p => (
              <div key={p.name} style={{marginBottom:6}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}>
                  <span style={{color:"var(--text2)",fontWeight:500}}>{p.name}</span>
                  <span style={{fontWeight:700,color:"var(--text1)"}}>{p.value}</span>
                </div>
                <div style={{height:6,background:"var(--s2)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${accounts.length ? (p.value / accounts.length * 100) : 0}%`,background:p.color,borderRadius:3,transition:"width 0.3s"}}/>
                </div>
              </div>
            ))}
          </div>

          {/* Account Type Distribution */}
          <div className="card" style={{padding:16,marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",color:"var(--text3)",letterSpacing:"0.06em",marginBottom:10}}>BY TYPE</div>
            <ResponsiveContainer width="100%" height={130}>
              <PieChart>
                <Pie data={typeDistribution} cx="50%" cy="50%" innerRadius={25} outerRadius={50} dataKey="value" strokeWidth={2} stroke="white">
                  {typeDistribution.map((s, i) => <Cell key={i} fill={s.color}/>)}
                </Pie>
                <Tooltip formatter={(v, name) => [`${v} accounts`, name]}/>
              </PieChart>
            </ResponsiveContainer>
            <div style={{display:"flex",flexWrap:"wrap",gap:5,marginTop:4}}>
              {typeDistribution.map(s => (
                <span key={s.name} style={{fontSize:9,display:"flex",alignItems:"center",gap:3}}>
                  <span style={{width:7,height:7,borderRadius:2,background:s.color,display:"inline-block"}}/>{s.name} ({s.value})
                </span>
              ))}
            </div>
          </div>

          {/* Revenue Breakdown */}
          <div className="card" style={{padding:16}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",color:"var(--text3)",letterSpacing:"0.06em",marginBottom:10}}>REVENUE LEADERS</div>
            {[...accounts].filter(a => a.arrRevenue > 0).sort((a, b) => b.arrRevenue - a.arrRevenue).slice(0, 5).map(a => (
              <div key={a.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--border)",cursor:"pointer"}} onClick={() => setDetail(a)}>
                <div style={{width:26,height:26,borderRadius:6,background:"#1B6B5A",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:9,fontWeight:700}}>
                  {a.name?.slice(0,2).toUpperCase()}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,fontWeight:600,color:"var(--text1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</div>
                  <div style={{fontSize:10,color:"var(--text3)"}}>{a.type} · {a.country}</div>
                </div>
                <span style={{fontSize:12,fontWeight:800,fontFamily:"'Outfit',sans-serif",color:"var(--brand)"}}>₹{a.arrRevenue}L</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Account Profile */}
      {detail && <AccountProfile a={detail} onClose={() => setDetail(null)} onEdit={() => { openEdit(detail); setDetail(null); }} opps={opps} activities={activities} contacts={contacts} tickets={tickets} contracts={contracts} collections={collections} notes={notes} files={files} onAddNote={onAddNote} onAddFile={onAddFile} currentUser={currentUser} allAccounts={accounts} leads={leads} orgUsers={orgUsers} catalog={catalog} onLogCall={(prefill) => { setDetail(null); setLogCallPrefill(prefill); }} onNavigate={(page) => { setDetail(null); window.location.hash = `#/${page}`; }}/>}

      {/* Add / Edit Modal */}
      {modal && (
        <Modal title={modal.mode === "add" ? "Add Account" : "Edit Account"} onClose={() => setModal(null)} lg footer={<><button className="btn btn-sec" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}><Check size={14}/>Save Account</button></>}>
          {form.accountNo && <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,padding:"8px 12px",background:"var(--s2)",borderRadius:8}}>
            <span style={{fontSize:11,fontWeight:600,color:"var(--text3)"}}>Account No.</span>
            <span style={{fontFamily:"'Courier New',monospace",fontSize:13,fontWeight:700,color:"var(--brand)"}}>{form.accountNo}</span>
            <span style={{fontSize:10,color:"var(--text3)",marginLeft:"auto"}}>Auto-generated</span>
          </div>}
          <div className="form-row"><div className="form-group"><label>Account Name *</label><input value={form.name} onChange={e => {setForm(f => ({...f,name:e.target.value})); setFormErrors(e => ({...e,name:undefined}));}} placeholder="Company name" style={formErrors.name?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.name}/></div><div className="form-group"><label>Type</label><select value={form.type} onChange={e => setForm(f => ({...f,type:e.target.value}))}>{CUST_TYPES.map(t => <option key={t}>{t}</option>)}</select></div></div>
          <div className="form-row"><div className="form-group"><label>Country</label><select value={form.country} onChange={e => setForm(f => ({...f,country:e.target.value}))}>{COUNTRIES.map(c => <option key={c}>{c}</option>)}</select></div><div className="form-group"><label>City</label><input value={form.city} onChange={e => setForm(f => ({...f,city:e.target.value}))} placeholder="City"/></div></div>
          <div className="form-row">
            <div className="form-group">
              <label>Hierarchy Level</label>
              <select value={form.hierarchyLevel} onChange={e => setForm(f => ({...f,hierarchyLevel:e.target.value}))}>
                {HIERARCHY_LEVELS.map(h => <option key={h}>{h}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Parent Account</label>
              <select value={form.parentId} onChange={e => {
                const parent = accounts.find(a => a.id === e.target.value);
                setForm(f => ({...f, parentId:e.target.value, hierarchyPath: parent ? parent.hierarchyPath + " > " + (f.name||"New") : f.name||""}));
              }}>
                <option value="">None (Top Level)</option>
                {accounts.filter(a => a.id !== form.id).map(a => <option key={a.id} value={a.id}>{a.hierarchyPath || a.name}</option>)}
              </select>
            </div>
          </div>
          {/* Legacy single-address input removed — managed via Address Book section below */}
          <div className="form-row"><div className="form-group"><label>Status</label><select value={form.status} onChange={e => setForm(f => ({...f,status:e.target.value}))}><option>Active</option><option>Prospect</option><option>Inactive</option></select></div><div className="form-group"><label>Segment</label><select value={form.segment} onChange={e => setForm(f => ({...f,segment:e.target.value}))}>{["Enterprise","Mid-Market","SMB","Government","Association"].map(s => <option key={s}>{s}</option>)}</select></div></div>
          <div className="form-row"><div className="form-group"><label>ARR (₹L)</label><input type="number" min="0" value={form.arrRevenue} onChange={e => setForm(f => ({...f,arrRevenue:+e.target.value}))}/><FormError error={formErrors.arrRevenue}/></div><div className="form-group"><label>Potential (₹L)</label><input type="number" min="0" value={form.potential} onChange={e => setForm(f => ({...f,potential:+e.target.value}))}/><FormError error={formErrors.potential}/></div></div>
          <div className="form-row">
            <div className="form-group"><label>Website</label><input value={form.website} onChange={e => setForm(f => ({...f,website:e.target.value}))} placeholder="website.com"/></div>
            <div className="form-group"><label>Owner</label>
              <TypeaheadSelect
                value={form.owner}
                onChange={(id) => setForm(f => ({...f, owner: id}))}
                options={team.map(u => ({ value: u.id, label: u.name, sub: u.role }))}
                placeholder="Search owners…"
              />
            </div>
          </div>
          <div className="form-group"><label>Products & Modules</label>
            <ProductModulePicker
              catalog={catalog || []}
              value={form.productSelection || []}
              onChange={(next) => setForm(f => ({ ...f, productSelection: next, products: next.map(e => e.productId) }))}
            />
          </div>

          {/* ── Legal & Tax ── */}
          <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:16,marginBottom:8,borderTop:"1px solid var(--border)",paddingTop:14}}>Legal &amp; Tax</div>
          <div className="form-row"><div className="form-group"><label>Legal Name</label><input value={form.legalName||""} onChange={e => setForm(f => ({...f,legalName:e.target.value}))} placeholder="Full registered legal name"/></div></div>
          <div className="form-row">
            <div className="form-group"><label>PAN / Tax ID</label><input value={form.pan||""} onChange={e => setForm(f => ({...f,pan:e.target.value}))} placeholder="PAN number"/></div>
            <div className="form-group"><label>GSTIN</label><input value={form.gstin||""} onChange={e => setForm(f => ({...f,gstin:e.target.value}))} placeholder="GST registration no."/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>CIN</label><input value={form.cin||""} onChange={e => setForm(f => ({...f,cin:e.target.value}))} placeholder="Company registration no."/></div>
            <div className="form-group"><label>Tax Treatment</label><select value={form.taxTreatment||"Domestic"} onChange={e => setForm(f => ({...f,taxTreatment:e.target.value}))}><option>Domestic</option><option>Export</option><option>Exempt</option><option>SEZ</option></select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>TDS Applicable</label><select value={form.tdsApplicable||"No"} onChange={e => setForm(f => ({...f,tdsApplicable:e.target.value}))}><option>Yes</option><option>No</option></select></div>
            <div className="form-group"><label>PO Mandatory</label><select value={form.poMandatory||"No"} onChange={e => setForm(f => ({...f,poMandatory:e.target.value}))}><option>Yes</option><option>No</option></select></div>
          </div>

          {/* ── Address Book (multi-address per account; contacts link to one of these) ── */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16,marginBottom:8,borderTop:"1px solid var(--border)",paddingTop:14}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.06em"}}>Address Book ({(form.addresses||[]).length})</div>
            <button type="button" className="btn btn-sec btn-sm" onClick={addAddress}><Plus size={13}/> Add Address</button>
          </div>
          <div style={{fontSize:11,color:"var(--text3)",marginBottom:10,fontStyle:"italic"}}>
            Add every office / branch / billing location for this company. Contacts must link to one of these addresses.
          </div>
          {(form.addresses||[]).length === 0 && (
            <div style={{background:"#FEF3C7",border:"1px solid #FCD34D",padding:"10px 14px",borderRadius:8,fontSize:12,color:"#92400E",marginBottom:12}}>
              No addresses yet. Add at least one — contacts cannot be saved against an account that has no addresses.
            </div>
          )}
          {(form.addresses||[]).map((addr, idx) => (
            <div key={addr.id} style={{border:"1px solid var(--border)",borderRadius:8,padding:"12px 14px",marginBottom:10,background:addr.isPrimary?"#F0FDF4":"#fff"}}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8}}>
                <input value={addr.label||""} onChange={e=>updateAddress(idx,{label:e.target.value})} placeholder="Label (e.g. Mumbai HQ, Delhi Branch)" style={{flex:1,fontWeight:600,fontSize:13}}/>
                <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,color:"#15803D",cursor:"pointer"}}>
                  <input type="checkbox" checked={!!addr.isPrimary} onChange={e=>updateAddress(idx,{isPrimary:e.target.checked})}/> Primary
                </label>
                <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,color:"#1E40AF",cursor:"pointer"}}>
                  <input type="checkbox" checked={!!addr.isBilling} onChange={e=>updateAddress(idx,{isBilling:e.target.checked})}/> Billing
                </label>
                <button type="button" className="icon-btn" onClick={()=>removeAddress(idx)} title="Remove address"><Trash2 size={14}/></button>
              </div>
              <div className="form-row"><div className="form-group" style={{marginBottom:8}}><label>Address Line</label><input value={addr.line1||""} onChange={e=>updateAddress(idx,{line1:e.target.value})} placeholder="Street, building, floor"/></div></div>
              <div className="form-row">
                <div className="form-group" style={{marginBottom:0}}><label>City</label><input value={addr.city||""} onChange={e=>updateAddress(idx,{city:e.target.value})}/></div>
                <div className="form-group" style={{marginBottom:0}}><label>State</label><input value={addr.state||""} onChange={e=>updateAddress(idx,{state:e.target.value})}/></div>
              </div>
              <div className="form-row" style={{marginTop:8}}>
                <div className="form-group" style={{marginBottom:0}}><label>Pincode</label><input value={addr.pincode||""} onChange={e=>updateAddress(idx,{pincode:e.target.value})}/></div>
                <div className="form-group" style={{marginBottom:0}}><label>Country</label><input value={addr.country||""} onChange={e=>updateAddress(idx,{country:e.target.value})}/></div>
              </div>
            </div>
          ))}

          {/* ── Billing Profile ── */}
          <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:16,marginBottom:8,borderTop:"1px solid var(--border)",paddingTop:14}}>Billing Profile</div>
          <div className="form-row">
            <div className="form-group"><label>Payment Terms</label><select value={form.paymentTerms||"Net 30"} onChange={e => setForm(f => ({...f,paymentTerms:e.target.value}))}><option>Advance</option><option>Net 7</option><option>Net 15</option><option>Net 30</option><option>Net 45</option><option>Net 60</option></select></div>
            <div className="form-group"><label>Credit Days</label><input type="number" min="0" value={form.creditDays??30} onChange={e => setForm(f => ({...f,creditDays:+e.target.value}))}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Currency</label><select value={form.currency||"INR"} onChange={e => setForm(f => ({...f,currency:e.target.value}))}><option>INR</option><option>USD</option><option>AED</option><option>EUR</option><option>GBP</option></select></div>
            <div className="form-group"><label>Billing Frequency</label><select value={form.billingFrequency||"Annual"} onChange={e => setForm(f => ({...f,billingFrequency:e.target.value}))}><option>Monthly</option><option>Quarterly</option><option>Half-Yearly</option><option>Annual</option><option>One-Time</option></select></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Primary Contact Name</label><input value={form.primaryContact||""} onChange={e => setForm(f => ({...f,primaryContact:e.target.value}))} placeholder="Primary contact name"/></div>
            <div className="form-group"><label>Primary Phone</label><input value={form.primaryPhone||""} onChange={e => setForm(f => ({...f,primaryPhone:e.target.value}))} placeholder="Primary phone/mobile"/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Primary Email</label><input value={form.primaryEmail||""} onChange={e => setForm(f => ({...f,primaryEmail:e.target.value}))} placeholder="Primary email"/></div>
            <div className="form-group"><label>Billing Contact Email</label><input value={form.billingContactEmail||""} onChange={e => setForm(f => ({...f,billingContactEmail:e.target.value}))} placeholder="Billing contact email"/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Billing Contact Name</label><input value={form.billingContactName||""} onChange={e => setForm(f => ({...f,billingContactName:e.target.value}))} placeholder="Billing contact name"/></div>
            <div className="form-group"><label>Finance Contact Email</label><input value={form.financeContactEmail||""} onChange={e => setForm(f => ({...f,financeContactEmail:e.target.value}))} placeholder="Finance contact email"/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Entity Type</label><select value={form.entityType||"Head Office"} onChange={e => setForm(f => ({...f,entityType:e.target.value}))}><option>Head Office</option><option>Branch Office</option><option>Sister Concern</option><option>Subsidiary</option><option>Franchise</option></select></div>
            <div className="form-group"><label>Group Code</label><input value={form.groupCode||""} onChange={e => setForm(f => ({...f,groupCode:e.target.value}))} placeholder="Corporate group code"/></div>
          </div>
          <div className="form-row"><div className="form-group"><label>Territory / Region</label><input value={form.territory||""} onChange={e => setForm(f => ({...f,territory:e.target.value}))} placeholder="Territory or region"/></div></div>
        </Modal>
      )}
      {confirm && <DeleteConfirm title="Delete Account" recordLabel={accounts.find(a => a.id === confirm)?.name || "this account"} onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)}/>}

      {/* ═════════ LOG CALL MODAL ═════════ */}
      {logCallPrefill && (
        <LogCallModal
          onClose={() => setLogCallPrefill(null)}
          onSave={handleSaveCall}
          accounts={accounts} contacts={contacts} opps={opps} orgUsers={orgUsers} masters={masters}
          prefill={logCallPrefill}
        />
      )}
    </div>
  );
}

export { AccountProfile };
export default Accounts;
