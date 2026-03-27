import { useState, useMemo, useCallback } from "react";
import { Plus, Search, Edit2, Trash2, Check, TrendingUp, Activity, Download, ArrowUpDown, ArrowUp, ArrowDown, Users, Phone, Mail, FileText, Calendar, AlertTriangle, Shield, Globe, Building2, Target, DollarSign, Package, Clock, Star, BarChart3, Layers, ExternalLink, X } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { PRODUCTS, PROD_MAP, CUST_TYPES, COUNTRIES, TEAM, TEAM_MAP, HIERARCHY_LEVELS, CALL_TYPES, CALL_OBJECTIVES, CALL_OUTCOMES } from '../data/constants';
import { BLANK_ACC } from '../data/seed';
import { fmt, uid, cmp, sanitizeObj, validateAccount, hasErrors, today } from '../utils/helpers';
import { StatusBadge, ProdTag, UserPill, Modal, Confirm, FormError, NotesThread, FilesList, Empty } from './shared';
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
function AccountProfile({a, onClose, onEdit, opps, activities, contacts, tickets, contracts, collections, notes, files, onAddNote, onAddFile, currentUser, allAccounts, leads=[], orgUsers, onLogCall}) {
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
    accActs.length > 0 ? 15 : (accActs.length > 2 ? 20 : 10),
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
              { label: "ARR", value: totalARR ? `₹${totalARR}Cr` : "—", sub: "Annual recurring", color: "#1B6B5A" },
              { label: "PIPELINE", value: `₹${pipelineValue}Cr`, sub: `${openDeals} open deals`, color: "#3B82F6" },
              { label: "WON", value: `₹${wonValue}Cr`, sub: `${wonDeals.length} deals closed`, color: "#22C55E" },
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

                {/* Products */}
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <Package size={15} style={{color:"var(--brand)"}}/> Products & Revenue
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                    {currentProducts.map(p => <ProdTag key={p} pid={p}/>)}
                    {currentProducts.length === 0 && <span style={{fontSize:12,color:"var(--text3)"}}>No products assigned</span>}
                  </div>
                  {infoRow("ARR (Annual Recurring Revenue)", totalARR ? `₹${totalARR} Cr` : "—")}
                  {infoRow("Potential Value", a.potential ? `₹${a.potential} Cr` : "—")}
                  {infoRow("Won Deal Value", wonValue ? `₹${wonValue} Cr` : "—")}
                  {pendingCollections > 0 && infoRow("Pending Collections", <span style={{color:"#DC2626",fontWeight:700}}>₹{pendingCollections.toFixed(1)} Cr</span>)}
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
            accContacts.length === 0 ? <Empty icon={<Users size={22}/>} title="No contacts" sub="No contacts linked to this account."/> :
            <div className="card" style={{padding:0}}>
              <table className="tbl">
                <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Email</th><th>Phone</th><th>Primary</th></tr></thead>
                <tbody>{accContacts.map(c => (
                  <tr key={c.id}>
                    <td style={{fontWeight:600,fontSize:12.5}}>{c.name}</td>
                    <td style={{fontSize:12}}>{c.role || c.designation || "—"}</td>
                    <td style={{fontSize:12}}>{c.department || "—"}</td>
                    <td style={{fontSize:12,color:"var(--brand)"}}>{c.email || "—"}</td>
                    <td style={{fontSize:12}}>{c.phone || "—"}</td>
                    <td>{c.primary && <Star size={13} style={{color:"#F59E0B"}}/>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}

          {/* ── LEADS TAB ── */}
          {tab === "leads" && (
            accLeads.length === 0 ? <Empty icon={<Target size={22}/>} title="No leads" sub="No leads linked to this account."/> :
            <div className="card" style={{padding:0}}>
              <table className="tbl">
                <thead><tr><th>Lead ID</th><th>Contact</th><th>Product</th><th>Stage</th><th>Score</th><th>Temperature</th><th>Next Call</th><th>Assigned</th></tr></thead>
                <tbody>{accLeads.map(l => {
                  const tempColors = {Hot:"#DC2626",Warm:"#F59E0B",Cool:"#3B82F6",Cold:"#94A3B8",Dead:"#64748B"};
                  return (
                    <tr key={l.id} style={l.temperature === "Hot" ? {background:"#FEF2F214"} : undefined}>
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
            accOpps.length === 0 ? <Empty icon={<TrendingUp size={22}/>} title="No deals" sub="No opportunities linked to this account."/> :
            <div className="card" style={{padding:0}}>
              <table className="tbl">
                <thead><tr><th>Deal</th><th>Products</th><th>Stage</th><th>Value</th><th>Probability</th><th>Close Date</th><th>Owner</th></tr></thead>
                <tbody>{accOpps.map(o => (
                  <tr key={o.id} style={o.stage === "Won" ? {background:"#F0FDF4"} : o.stage === "Lost" ? {background:"#FEF2F2"} : undefined}>
                    <td style={{fontWeight:600,fontSize:12.5}}>{o.title}</td>
                    <td><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{(o.products||[]).map(p => <ProdTag key={p} pid={p}/>)}</div></td>
                    <td><StatusBadge status={o.stage}/></td>
                    <td style={{fontFamily:"'Outfit',sans-serif",fontWeight:700}}>₹{o.value}Cr</td>
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
                      <td style={{fontFamily:"'Outfit',sans-serif",fontWeight:700}}>₹{c.value || 0}Cr</td>
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
// LOG CALL MODAL — inline call logging for Accounts
// ═══════════════════════════════════════════════════════════════════
const nowTimeAcct = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};

function AcctLogCallModal({ onClose, onSave, accounts, contacts, opps, orgUsers, masters, prefill = {} }) {
  const team = orgUsers?.length ? orgUsers.filter(u => u.status !== "Inactive") : TEAM;
  const callTypes = masters?.callTypes?.length ? masters.callTypes : CALL_TYPES;
  const callSubjects = masters?.callSubjects?.length ? masters.callSubjects : CALL_OBJECTIVES;
  const [form, setForm] = useState({
    callType: "Telephone Call", objective: "General Followup", callDate: today, callTime: nowTimeAcct(),
    duration: 15, accountId: "", leadId: "", oppId: "", contactIds: [], participantIds: [],
    notes: "", outcome: "Completed", nextCallDate: "", nextStepDesc: "", createFollowup: false,
    followupTitle: "", followupAssign: "", followupDue: "",
    ...prefill,
  });
  const [errors, setErrors] = useState({});

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: undefined })); };

  const filteredContacts = useMemo(() =>
    form.accountId ? contacts.filter(c => c.accountId === form.accountId) : contacts,
  [contacts, form.accountId]);
  const filteredOpps = useMemo(() =>
    form.accountId ? opps.filter(o => o.accountId === form.accountId) : opps,
  [opps, form.accountId]);

  const acctName = accounts.find(a => a.id === form.accountId)?.name || "";

  const validate = () => {
    const errs = {};
    if (!form.callDate) errs.callDate = "Call date is required";
    if (!form.notes?.trim()) errs.notes = "Discussion notes are required";
    else if (form.notes.trim().length < 10) errs.notes = "Notes must be at least 10 characters";
    return errs;
  };

  const submit = () => {
    const errs = validate();
    if (hasErrors(errs)) { setErrors(errs); return; }
    onSave(form);
    onClose();
  };

  return (
    <Modal title="Log Call" onClose={onClose} lg footer={
      <>
        <button className="btn btn-sec" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit}><Check size={14} /> Save Call</button>
      </>
    }>
      <div className="form-row">
        <div className="form-group"><label>Call Type</label>
          <select value={form.callType} onChange={e => set("callType", e.target.value)}>
            {callTypes.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Call Subject</label>
          <select value={form.objective} onChange={e => set("objective", e.target.value)}>
            {callSubjects.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row three">
        <div className="form-group"><label>Date *</label>
          <input type="date" value={form.callDate} onChange={e => set("callDate", e.target.value)}
            style={errors.callDate ? { borderColor: "#DC2626" } : {}} />
          <FormError error={errors.callDate} />
        </div>
        <div className="form-group"><label>Time</label>
          <input type="time" value={form.callTime} onChange={e => set("callTime", e.target.value)} />
        </div>
        <div className="form-group"><label>Duration (min)</label>
          <input type="number" min={0} step={5} value={form.duration}
            onChange={e => set("duration", +e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Company / Account</label>
          <select value={form.accountId} onChange={e => set("accountId", e.target.value)}>
            <option value="">-- Select --</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Opportunity</label>
          <select value={form.oppId} onChange={e => set("oppId", e.target.value)}>
            <option value="">-- None --</option>
            {filteredOpps.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Outcome</label>
          <select value={form.outcome} onChange={e => set("outcome", e.target.value)}>
            {CALL_OUTCOMES.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {/* Multi-select contacts */}
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label>Contacts</label>
        <div style={{ maxHeight: 120, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6, padding: 4, background: "white" }}>
          {filteredContacts.length === 0 && <div style={{ fontSize: 11, color: "var(--text3)", padding: 8, textAlign: "center" }}>No contacts</div>}
          {filteredContacts.map(c => (
            <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12 }}>
              <input type="checkbox" checked={form.contactIds.includes(c.id)}
                onChange={() => set("contactIds", form.contactIds.includes(c.id) ? form.contactIds.filter(x => x !== c.id) : [...form.contactIds, c.id])}
                style={{ accentColor: "var(--brand)" }} />
              {c.name}{c.designation ? ` (${c.designation})` : ""}
            </label>
          ))}
        </div>
      </div>

      {/* Multi-select our participants */}
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label>Our Participants</label>
        <div style={{ maxHeight: 120, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 6, padding: 4, background: "white" }}>
          {team.map(u => (
            <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12 }}>
              <input type="checkbox" checked={form.participantIds.includes(u.id)}
                onChange={() => set("participantIds", form.participantIds.includes(u.id) ? form.participantIds.filter(x => x !== u.id) : [...form.participantIds, u.id])}
                style={{ accentColor: "var(--brand)" }} />
              {u.name}{u.role ? ` (${u.role})` : ""}
            </label>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label>Discussion Notes * <span style={{ fontSize: 10, color: "var(--text3)", fontWeight: 400 }}>(min 10 chars)</span></label>
        <textarea rows={3} value={form.notes}
          onChange={e => set("notes", e.target.value)}
          placeholder="Discussion summary, objections, decisions, and next steps..."
          style={{ ...(errors.notes ? { borderColor: "#DC2626" } : {}), width: "100%", resize: "vertical" }} />
        <FormError error={errors.notes} />
      </div>

      <div className="form-row">
        <div className="form-group"><label>Next Step / Follow-up Date</label>
          <input type="date" value={form.nextCallDate} onChange={e => set("nextCallDate", e.target.value)} />
        </div>
        <div className="form-group"><label>Next Step Description</label>
          <input value={form.nextStepDesc} onChange={e => set("nextStepDesc", e.target.value)}
            placeholder="e.g. Send proposal, Schedule demo..." />
        </div>
      </div>

      {/* Create follow-up task */}
      <div style={{
        marginTop: 10, padding: 12, borderRadius: 8, border: "1px solid var(--border)",
        background: "var(--s2)"
      }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={form.createFollowup}
            onChange={e => set("createFollowup", e.target.checked)}
            style={{ accentColor: "var(--brand)" }} />
          Create Follow-up Task
        </label>
        {form.createFollowup && (
          <div style={{ marginTop: 10 }}>
            <div className="form-row">
              <div className="form-group"><label>Task Title</label>
                <input value={form.followupTitle || `Follow-up: ${acctName}`}
                  onChange={e => set("followupTitle", e.target.value)}
                  placeholder="Follow-up task title" />
              </div>
              <div className="form-group"><label>Assign To</label>
                <select value={form.followupAssign} onChange={e => set("followupAssign", e.target.value)}>
                  <option value="">-- Select --</option>
                  {team.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group"><label>Due Date</label>
              <input type="date" value={form.followupDue || form.nextCallDate}
                onChange={e => set("followupDue", e.target.value)} />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ACCOUNTS PAGE
// ═══════════════════════════════════════════════════════════════════
function Accounts({accounts, setAccounts, onDeleteAccount, opps, activities, setActivities, notes, files, onAddNote, onAddFile, currentUser, contacts=[], tickets=[], contracts=[], collections=[], leads=[], orgUsers, callReports, setCallReports, masters}) {
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
  const openAdd = () => { setForm({...BLANK_ACC, id:`a${uid()}`, accountNo: nextAccountNo()}); setFormErrors({}); setModal({mode:"add"}); };
  const openEdit = a => { setForm({...a, products:[...a.products]}); setFormErrors({}); setModal({mode:"edit"}); };
  const save = () => {
    const errs = validateAccount(form);
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    const isDup = accounts.some(existing => existing.id !== form.id && existing.name.toLowerCase().trim() === form.name.toLowerCase().trim() && existing.country === form.country);
    if (isDup && !window.confirm("An account with the same name and country already exists. Continue anyway?")) return;
    const clean = sanitizeObj(form);
    if (modal.mode === "add") setAccounts(p => [...p, {...clean}]);
    else setAccounts(p => p.map(a => a.id === clean.id ? {...clean} : a));
    setModal(null); setDetail(null); setFormErrors({});
  };
  const del = id => { onDeleteAccount(id); setConfirm(null); setDetail(null); };
  const toggleProd = pid => {
    const pp = form.products.includes(pid) ? form.products.filter(x => x !== pid) : [...form.products, pid];
    setForm(f => ({...f, products: pp}));
  };

  const CSV_COLS = [
    {label:"Name",accessor:a=>a.name},{label:"Type",accessor:a=>a.type},{label:"Country",accessor:a=>a.country},
    {label:"City",accessor:a=>a.city},{label:"Status",accessor:a=>a.status},{label:"Segment",accessor:a=>a.segment},
    {label:"ARR (Cr)",accessor:a=>a.arrRevenue},{label:"Potential (Cr)",accessor:a=>a.potential},
    {label:"Products",accessor:a=>(a.products||[]).map(p=>PROD_MAP[p]?.name||p).join(", ")},
    {label:"Owner",accessor:a=>teamMap[a.owner]?.name||a.owner},
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
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>₹{totalARR}Cr</div>
          <div style={{fontSize:11,opacity:0.7}}>Active accounts</div>
        </div>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"14px 18px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.8}}>PIPELINE POTENTIAL</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>₹{totalPotential}Cr</div>
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

      <div style={{display:"flex",gap:16}}>
        {/* Left: Main table */}
        <div style={{flex:1,minWidth:0}}>
          {/* Filters */}
          <div className="filter-bar" style={{flexWrap:"wrap"}}>
            <div className="filter-search"><Search size={14} style={{color:"var(--text3)",flexShrink:0}}/><input placeholder="Search accounts…" value={search} onChange={e => setSearch(e.target.value)}/></div>
            <select className="filter-select" value={typeF} onChange={e => setTypeF(e.target.value)}><option>All</option>{CUST_TYPES.map(t => <option key={t}>{t}</option>)}</select>
            <select className="filter-select" value={countryF} onChange={e => setCountryF(e.target.value)}><option>All</option>{COUNTRIES.map(c => <option key={c}>{c}</option>)}</select>
            <select className="filter-select" value={statusF} onChange={e => setStatusF(e.target.value)}><option>All</option><option>Active</option><option>Prospect</option></select>
            <select className="filter-select" value={ownerF} onChange={e => setOwnerF(e.target.value)}><option value="All">All Owners</option>{team.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </div>

          <BulkActions count={bulk.count} onClear={bulk.clear}
            onDelete={() => { if(window.confirm("Delete " + bulk.count + " accounts and all linked data?")) { bulk.selected.forEach(id => onDeleteAccount(id)); bulk.clear(); }}}
            onExport={() => exportCSV(accounts.filter(a => bulk.isSelected(a.id)), CSV_COLS, "accounts")}/>

          <div className="card" style={{padding:0}}>
            {filtered.length === 0 ? (
              <Empty icon={<Building2 size={22}/>} title="No accounts found" sub="Try adjusting filters or add a new account."/>
            ) : (
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
                    <td><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{a.products.map(p => <ProdTag key={p} pid={p}/>)}</div></td>
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
                        <button className="icon-btn" aria-label="Delete" onClick={() => setConfirm(a.id)}><Trash2 size={14}/></button>
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
            <Pagination {...pg}/>
          </div>
        </div>

        {/* Right: Insights Panel */}
        <div style={{width:270,flexShrink:0}}>
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
                <span style={{fontSize:12,fontWeight:800,fontFamily:"'Outfit',sans-serif",color:"var(--brand)"}}>₹{a.arrRevenue}Cr</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Account Profile */}
      {detail && <AccountProfile a={detail} onClose={() => setDetail(null)} onEdit={() => { openEdit(detail); setDetail(null); }} opps={opps} activities={activities} contacts={contacts} tickets={tickets} contracts={contracts} collections={collections} notes={notes} files={files} onAddNote={onAddNote} onAddFile={onAddFile} currentUser={currentUser} allAccounts={accounts} leads={leads} orgUsers={orgUsers} onLogCall={(prefill) => { setDetail(null); setLogCallPrefill(prefill); }}/>}

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
          <div className="form-row">
            <div className="form-group">
              <label>Address</label>
              <input value={form.address||""} onChange={e => setForm(f => ({...f,address:e.target.value}))} placeholder="Full address"/>
            </div>
          </div>
          <div className="form-row"><div className="form-group"><label>Status</label><select value={form.status} onChange={e => setForm(f => ({...f,status:e.target.value}))}><option>Active</option><option>Prospect</option><option>Inactive</option></select></div><div className="form-group"><label>Segment</label><select value={form.segment} onChange={e => setForm(f => ({...f,segment:e.target.value}))}>{["Enterprise","Mid-Market","SMB","Government","Association"].map(s => <option key={s}>{s}</option>)}</select></div></div>
          <div className="form-row"><div className="form-group"><label>ARR (₹Cr)</label><input type="number" min="0" value={form.arrRevenue} onChange={e => setForm(f => ({...f,arrRevenue:+e.target.value}))}/><FormError error={formErrors.arrRevenue}/></div><div className="form-group"><label>Potential (₹Cr)</label><input type="number" min="0" value={form.potential} onChange={e => setForm(f => ({...f,potential:+e.target.value}))}/><FormError error={formErrors.potential}/></div></div>
          <div className="form-row"><div className="form-group"><label>Website</label><input value={form.website} onChange={e => setForm(f => ({...f,website:e.target.value}))} placeholder="website.com"/></div><div className="form-group"><label>Owner</label><select value={form.owner} onChange={e => setForm(f => ({...f,owner:e.target.value}))}>{team.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div></div>
          <div className="form-group"><label>Products</label><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>{PRODUCTS.map(p => <button key={p.id} className="btn btn-xs" style={{background:form.products.includes(p.id)?p.color:"var(--s3)",color:form.products.includes(p.id)?"white":"var(--text2)",border:"none",cursor:"pointer"}} onClick={() => toggleProd(p.id)}>{p.name}</button>)}</div></div>
        </Modal>
      )}
      {confirm && <Confirm title="Delete Account" msg="This will permanently remove the account and all linked contacts, deals, activities, tickets, and notes." onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)}/>}

      {/* ═════════ LOG CALL MODAL ═════════ */}
      {logCallPrefill && (
        <AcctLogCallModal
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
