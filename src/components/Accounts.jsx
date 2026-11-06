import { useState, useMemo, useCallback } from "react";
import { Plus, Search, Edit2, Trash2, Check, TrendingUp, Activity, Download, ArrowUpDown, ArrowUp, ArrowDown, Users, Phone, Mail, FileText, Calendar, AlertTriangle, Shield, Globe, Building2, Target, DollarSign, Package, Clock, Star, BarChart3, Layers, ExternalLink, X } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import {
  CUST_TYPES, COUNTRIES, TEAM, TEAM_MAP, HIERARCHY_LEVELS, CALL_TYPES, CALL_OBJECTIVES, CALL_OUTCOMES,
  ACCOUNT_TYPES, ACCOUNT_STATUSES, ACCOUNT_LEVELS, ENTITY_TYPES, TAX_TREATMENTS, RENEWAL_TYPES,
  PAYMENT_TERMS_LIST, BILLING_FREQUENCIES, INVOICE_GEN_BASIS, DISCOUNT_TYPES,
  GRI_TYPES, GRI_FREQUENCIES, GRI_EFFECTIVE_BASIS, SERVICE_CATEGORIES, COMMERCIAL_MODELS,
  CHARGE_TYPES, UNIT_OF_MEASURES, RATE_TYPES, USAGE_SOURCES, RECONCILIATION_METHODS,
  PRORATION_RULES, INVOICE_CONSOLIDATION_RULES, LICENSE_TYPES, PLAN_TYPES_ANNUAL,
  SOFTWARE_SALE_TYPES, LICENSE_OWNERSHIP_MODELS, LICENSE_SCOPES, DEPLOYMENT_TYPES, DELIVERY_TYPES,
  DEV_PROJECT_TYPES, REVENUE_RECOGNITION_BASIS, CHANNEL_TYPES, MESSAGING_BILLING_BASIS,
  OCR_AI_SERVICE_UNITS, CUSTOMER_TIERS, BUSINESS_UNITS, COLLECTION_BUCKETS, GRI_RULE_TYPES,
  BILLING_TIMINGS, ANNUAL_INVOICE_TYPES, DEFERRED_REVENUE_METHODS, AMC_BILLING_FREQUENCIES,
  RENEWAL_INCREMENT_BASIS,
} from '../data/constants';
import { useProducts } from '../contexts/ProductsContext';
import { BLANK_ACC, BLANK_SERVICE_SUB, BLANK_CHARGE_MAP } from '../data/seed';
import { fmt, uid, cmp, sanitizeObj, validateAccount, hasErrors, today } from '../utils/helpers';
import { StatusBadge, ProdTag, UserPill, Modal, Confirm, FormError, NotesThread, FilesList, Empty, LogCallModal } from './shared';
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
function AccountProfile({a, onClose, onEdit, opps, activities, contacts, tickets, contracts, collections, notes, files, onAddNote, onAddFile, currentUser, allAccounts, leads=[], orgUsers, onLogCall, onNavigate}) {
  const { products: PRODUCTS, prodMap: PROD_MAP } = useProducts();
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

  const svcCount = (a.serviceSubscriptions||[]).length;
  const chgCount = (a.chargeMappings||[]).length;
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "billing", label: "Billing & Commercial" },
    { id: "hierarchy", label: "Hierarchy" },
    ...(svcCount ? [{ id: "services", label: `Services (${svcCount})` }] : []),
    ...(chgCount ? [{ id: "charges", label: `Charges (${chgCount})` }] : []),
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

                {/* Products */}
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <Package size={15} style={{color:"var(--brand)"}}/> Products & Revenue
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                    {currentProducts.map(p => <ProdTag key={p} pid={p}/>)}
                    {currentProducts.length === 0 && <span style={{fontSize:12,color:"var(--text3)"}}>No products assigned</span>}
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

          {/* ── BILLING & COMMERCIAL TAB ── */}
          {tab === "billing" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              {/* Left */}
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <DollarSign size={15} style={{color:"var(--brand)"}}/> Contract & Payment
                  </div>
                  {infoRow("Contract No", a.contractNo)}
                  {infoRow("PO Number", a.poNumber)}
                  {infoRow("Contract Start", fmt.short(a.contractStartDate))}
                  {infoRow("Contract End", fmt.short(a.contractEndDate))}
                  {infoRow("Service Start", fmt.short(a.serviceStartDate))}
                  {infoRow("Renewal Type", a.renewalType)}
                  {infoRow("Renewal Notice Days", a.renewalNoticeDays)}
                  {infoRow("Payment Terms", a.paymentTerms)}
                  {infoRow("Credit Days", a.creditDays)}
                  {infoRow("Credit Limit", a.creditLimit ? `₹${a.creditLimit}` : null)}
                  {infoRow("Currency", a.currencyCode)}
                </div>
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <FileText size={15} style={{color:"var(--brand)"}}/> Billing Setup
                  </div>
                  {infoRow("Billing Frequency", a.billingFrequency)}
                  {infoRow("Invoice Basis", a.invoiceGenerationBasis)}
                  {infoRow("Min Monthly Commitment", a.minimumMonthlyCommitment ? `₹${a.minimumMonthlyCommitment}` : null)}
                  {infoRow("Discount", a.discountType ? `${a.discountType} — ${a.discountValue||0}` : "None")}
                  {infoRow("Billing Approval", a.billingApprovalRequired ? "Required" : "Not required")}
                </div>
              </div>
              {/* Right */}
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <Shield size={15} style={{color:"var(--brand)"}}/> Legal & Tax
                  </div>
                  {infoRow("Legal Entity", a.legalEntityName)}
                  {infoRow("PAN / Tax ID", a.panTaxId)}
                  {infoRow("GST / VAT", a.gstVatNo)}
                  {infoRow("CIN / Reg No", a.cinNo)}
                  {infoRow("Tax Treatment", a.taxTreatment)}
                  {infoRow("TDS Applicable", a.tdsApplicable ? `Yes (${a.tdsRate||0}%)` : "No")}
                  {infoRow("E-Invoice", a.eInvoiceApplicable ? "Yes" : "No")}
                  {infoRow("PO Mandatory", a.poMandatory ? "Yes" : "No")}
                </div>
                {a.griApplicable && <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <TrendingUp size={15} style={{color:"#F59E0B"}}/> GRI (Rate Escalation)
                  </div>
                  {infoRow("GRI Type", a.griType)}
                  {infoRow("GRI %", a.griPercentage ? `${a.griPercentage}%` : null)}
                  {infoRow("Frequency", a.griFrequency)}
                  {infoRow("Effective Basis", a.griEffectiveBasis)}
                  {infoRow("First GRI Date", fmt.short(a.firstGRIEffectiveDate))}
                  {infoRow("Next GRI Date", fmt.short(a.nextGRIDate))}
                  {infoRow("Cap / Floor", `${a.griCapPercentage||0}% / ${a.griFloorPercentage||0}%`)}
                  {infoRow("Approval Required", a.griApprovalRequired ? "Yes" : "No")}
                </div>}
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                    <Mail size={15} style={{color:"var(--brand)"}}/> Billing Contacts
                  </div>
                  {infoRow("Billing Contact", a.billingContactName ? `${a.billingContactName} (${a.billingContactEmail||""})` : null)}
                  {infoRow("Finance Contact", a.financeContactName ? `${a.financeContactName} (${a.financeContactEmail||""})` : null)}
                  {infoRow("Collections Contact", a.collectionsContactName ? `${a.collectionsContactName} (${a.collectionsContactEmail||""})` : null)}
                  {infoRow("Escalation Contact", a.escalationContact)}
                  {infoRow("Sales Owner", a.salesOwnerId ? (_teamMap[a.salesOwnerId]?.name||a.salesOwnerId) : null)}
                  {infoRow("Support Owner", a.supportOwnerId ? (_teamMap[a.supportOwnerId]?.name||a.supportOwnerId) : null)}
                </div>
              </div>
            </div>
          )}

          {/* ── HIERARCHY TAB ── */}
          {tab === "hierarchy" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                  <Layers size={15} style={{color:"var(--brand)"}}/> Account Hierarchy
                </div>
                {infoRow("Account Level", a.accountLevel || a.hierarchyLevel)}
                {infoRow("Entity Type", a.entityType)}
                {infoRow("Parent Account", a.parentId ? (allAccounts.find(x=>x.id===a.parentId)?.name||a.parentCompanyName||a.parentId) : "None (Top Level)")}
                {infoRow("Hierarchy Path", a.hierarchyPath)}
                {infoRow("Corporate Group", a.corporateGroup)}
                {infoRow("Branch / Entity Code", a.branchEntityCode)}
                {infoRow("Branch / Entity Name", a.branchEntityName)}
              </div>
              <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                  <Building2 size={15} style={{color:"var(--brand)"}}/> Billing Rules
                </div>
                {[
                  ["Billing To Parent", a.isBillingToParent],
                  ["Separate Invoice", a.separateInvoiceRequired],
                  ["Contract Signed By Parent", a.contractSignedByParent],
                  ["Pricing Inherited", a.pricingInheritedFromParent],
                  ["Credit Shared With Parent", a.creditSharedWithParent],
                  ["Tax Registration Separate", a.taxRegistrationSeparate],
                ].map(([label, val]) => (
                  <div key={label} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
                    <span style={{fontSize:12,color:"var(--text3)",fontWeight:500}}>{label}</span>
                    <span style={{fontSize:12,fontWeight:600,color: val ? "#22C55E" : "var(--text3)"}}>{val ? "Yes" : "No"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SERVICES TAB ── */}
          {tab === "services" && (
            (a.serviceSubscriptions||[]).length === 0
              ? <Empty icon={<Package size={22}/>} title="No services" sub="No service subscriptions configured for this account."/>
              : <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {(a.serviceSubscriptions||[]).map((s,i) => (
                    <div key={s.id||i} style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                        <span style={{fontSize:13,fontWeight:700,color:"var(--brand)"}}>Service #{i+1}</span>
                        {s.productName && <ProdTag pid={s.productId}/>}
                        <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:4,background:"#3B82F614",color:"#3B82F6"}}>{s.serviceCategory}</span>
                        <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:4,background:"#8B5CF614",color:"#8B5CF6"}}>{s.commercialModel}</span>
                        {s.billingActive && <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:4,background:"#22C55E14",color:"#22C55E"}}>Billing Active</span>}
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                        {infoRow("Variant", s.productVariant)}
                        {infoRow("Active From", fmt.short(s.activeFrom))}
                        {infoRow("Active To", fmt.short(s.activeTo))}
                        {s.serviceCategory==="SaaS" && <>{infoRow("Plan", s.planName)}{infoRow("License Type", s.licenseType)}{infoRow("Users / Branches", `${s.includedUsers||0} / ${s.includedBranches||0}`)}</>}
                        {s.serviceCategory==="Annual Plan" && <>{infoRow("Plan Type", s.planType)}{infoRow("Tenure", s.contractTenureMonths ? `${s.contractTenureMonths} mo` : null)}{infoRow("Annual Amount", s.annualSubscriptionAmount ? `₹${s.annualSubscriptionAmount}` : null)}</>}
                        {s.serviceCategory==="One-Time Software Sale" && <>{infoRow("Sale Type", s.softwareSaleType)}{infoRow("License Amount", s.oneTimeLicenseAmount ? `₹${s.oneTimeLicenseAmount}` : null)}{infoRow("Deployment", s.deploymentType)}</>}
                        {s.serviceCategory==="Development / Customization" && <>{infoRow("Project Type", s.devProjectType)}{infoRow("SOW No", s.sowNo)}{infoRow("Budget", s.approvedBudget ? `₹${s.approvedBudget}` : null)}</>}
                        {s.serviceCategory==="Transaction / Filing / Data Entry" && <>{infoRow("Transaction Type", s.transactionType)}{infoRow("Billing Unit", s.billingUnit)}</>}
                        {s.serviceCategory==="Messaging" && <>{infoRow("Channel", s.channelType)}{infoRow("Billing Basis", s.messagingBillingBasis)}</>}
                        {s.serviceCategory==="OCR / AI / API" && <>{infoRow("Service Unit", s.serviceUnitType)}{infoRow("Model/Engine", s.modelEngineType)}</>}
                      </div>
                    </div>
                  ))}
                </div>
          )}

          {/* ── CHARGES TAB ── */}
          {tab === "charges" && (
            (a.chargeMappings||[]).length === 0
              ? <Empty icon={<DollarSign size={22}/>} title="No charges" sub="No charge mappings configured for this account."/>
              : <div className="card" style={{padding:0}}>
                  <table className="tbl">
                    <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>UOM</th><th>Rate Type</th><th>Unit Rate</th><th>Free Vol</th><th>Overage</th><th>Min/Max</th><th>Effective</th><th>GRI</th></tr></thead>
                    <tbody>{(a.chargeMappings||[]).map((c,i) => (
                      <tr key={c.id||i}>
                        <td style={{fontFamily:"'Courier New',monospace",fontSize:11,fontWeight:600}}>{c.chargeCode||"—"}</td>
                        <td style={{fontSize:12,fontWeight:600}}>{c.chargeName||"—"}</td>
                        <td style={{fontSize:12}}>{c.chargeType}</td>
                        <td style={{fontSize:12}}>{c.unitOfMeasure}</td>
                        <td style={{fontSize:12}}>{c.rateType}</td>
                        <td style={{fontFamily:"'Outfit',sans-serif",fontWeight:700}}>₹{c.unitRate||0}</td>
                        <td style={{fontSize:12}}>{c.includedFreeVolume||0}</td>
                        <td style={{fontFamily:"'Outfit',sans-serif",fontWeight:600,color:"#F59E0B"}}>₹{c.overageRate||0}</td>
                        <td style={{fontSize:11}}>{c.minimumBillAmount||0} / {c.maximumCapAmount||"∞"}</td>
                        <td style={{fontSize:11,color:"var(--text3)"}}>{fmt.short(c.effectiveFrom)} → {fmt.short(c.effectiveTo)||"∞"}</td>
                        <td>{c.chargeLevelGRIApplicable ? <span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:"#F59E0B14",color:"#F59E0B"}}>{c.griRuleType} {c.griOverridePercentage||0}%</span> : "—"}</td>
                      </tr>
                    ))}</tbody>
                  </table>
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
                    <td><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{(o.products||[]).map(p => <ProdTag key={p} pid={p}/>)}</div></td>
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
// ACCOUNT FORM MODAL — Tabbed billing master form
// ═══════════════════════════════════════════════════════════════════
const FORM_TABS=[
  {id:"identity",label:"Identity"},
  {id:"hierarchy",label:"Hierarchy"},
  {id:"legal",label:"Legal & Tax"},
  {id:"address",label:"Addresses"},
  {id:"contacts",label:"Billing Contacts"},
  {id:"commercial",label:"Commercial"},
  {id:"gri",label:"GRI"},
  {id:"services",label:"Services"},
  {id:"charges",label:"Charges"},
  {id:"usage",label:"Usage Billing"},
  {id:"finance",label:"Finance"},
];

// Helpers for the form
const F2=({children})=><div className="form-row">{children}</div>;
const FG=({label,children,req})=><div className="form-group"><label>{label}{req&&<span style={{color:"#DC2626"}}> *</span>}</label>{children}</div>;
const Chk=({label,checked,onChange})=><label style={{display:"flex",alignItems:"center",gap:6,fontSize:12.5,cursor:"pointer",padding:"2px 0"}}><input type="checkbox" checked={!!checked} onChange={e=>onChange(e.target.checked)}/>{label}</label>;
const SectionHead=({title})=><div style={{fontSize:13,fontWeight:700,color:"var(--brand)",borderBottom:"1.5px solid var(--brand)",paddingBottom:4,marginBottom:12,marginTop:8}}>{title}</div>;

function AccountFormModal({form,setForm,formErrors,setFormErrors,modal,setModal,save,accounts,team,toggleProd,PRODUCTS,masters}) {
  const [formTab,setFormTab]=useState("identity");
  const f=(key,val)=>setForm(p=>({...p,[key]:val}));
  const fi=(key)=>(form[key]===undefined||form[key]===null)?"":form[key];

  // Derive dropdown lists from masters (dynamic) with fallback to static constants
  const ml=(key,fallback)=>(masters?.[key]||[]).map(i=>i.name).length>0 ? (masters[key]).map(i=>i.name) : fallback;

  // ── Service subscription helpers ──
  const subs=form.serviceSubscriptions||[];
  const addSub=()=>{f("serviceSubscriptions",[...subs,{...BLANK_SERVICE_SUB,id:`ss_${uid()}`}]);};
  const updSub=(i,key,val)=>{const n=[...subs];n[i]={...n[i],[key]:val};f("serviceSubscriptions",n);};
  const delSub=(i)=>{f("serviceSubscriptions",subs.filter((_,j)=>j!==i));};

  // ── Charge mapping helpers ──
  const charges=form.chargeMappings||[];
  const addCharge=()=>{f("chargeMappings",[...charges,{...BLANK_CHARGE_MAP,id:`ch_${uid()}`}]);};
  const updChg=(i,key,val)=>{const n=[...charges];n[i]={...n[i],[key]:val};f("chargeMappings",n);};
  const delChg=(i)=>{f("chargeMappings",charges.filter((_,j)=>j!==i));};

  return (
    <Modal title={modal.mode==="add"?"Add Account":"Edit Account"} onClose={()=>setModal(null)} lg footer={<><button className="btn btn-sec" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}><Check size={14}/>Save Account</button></>}>
      {form.accountNo&&<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,padding:"6px 12px",background:"var(--s2)",borderRadius:8}}>
        <span style={{fontSize:11,fontWeight:600,color:"var(--text3)"}}>Account No.</span>
        <span style={{fontFamily:"'Courier New',monospace",fontSize:13,fontWeight:700,color:"var(--brand)"}}>{form.accountNo}</span>
      </div>}
      {/* Tab bar */}
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:16,borderBottom:"1.5px solid var(--border)",paddingBottom:8}}>
        {FORM_TABS.map(t=>(
          <button key={t.id} onClick={()=>setFormTab(t.id)} style={{padding:"5px 12px",borderRadius:6,fontSize:11.5,fontWeight:formTab===t.id?700:500,cursor:"pointer",border:formTab===t.id?"1.5px solid var(--brand)":"1.5px solid transparent",background:formTab===t.id?"var(--brand)":"var(--s2)",color:formTab===t.id?"white":"var(--text2)",transition:"all 0.15s"}}>{t.label}</button>
        ))}
      </div>

      {/* ═══ IDENTITY ═══ */}
      {formTab==="identity"&&<>
        <F2><FG label="Account Name" req><input value={fi("name")} onChange={e=>{f("name",e.target.value);setFormErrors(er=>({...er,name:undefined}));}} placeholder="Legal / company name" style={formErrors.name?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.name}/></FG>
        <FG label="Display Name"><input value={fi("displayName")} onChange={e=>f("displayName",e.target.value)} placeholder="Short name for UI"/></FG></F2>
        <F2><FG label="Account Code"><input value={fi("accountCode")} onChange={e=>f("accountCode",e.target.value)} placeholder="Business code"/></FG>
        <FG label="Account Type"><select value={fi("type")} onChange={e=>f("type",e.target.value)}>{[...CUST_TYPES,...ACCOUNT_TYPES.filter(t=>!CUST_TYPES.includes(t))].map(t=><option key={t}>{t}</option>)}</select></FG></F2>
        <F2><FG label="Status"><select value={fi("status")} onChange={e=>f("status",e.target.value)}>{ACCOUNT_STATUSES.map(s=><option key={s}>{s}</option>)}</select></FG>
        <FG label="Segment"><select value={fi("segment")} onChange={e=>f("segment",e.target.value)}>{["Enterprise","Mid-Market","SMB","Government","Association"].map(s=><option key={s}>{s}</option>)}</select></FG></F2>
        <F2><FG label="Country"><select value={fi("country")} onChange={e=>f("country",e.target.value)}>{COUNTRIES.map(c=><option key={c}>{c}</option>)}</select></FG>
        <FG label="City"><input value={fi("city")} onChange={e=>f("city",e.target.value)} placeholder="City"/></FG></F2>
        <F2><FG label="Website"><input value={fi("website")} onChange={e=>f("website",e.target.value)} placeholder="website.com"/></FG>
        <FG label="Owner"><select value={fi("owner")} onChange={e=>f("owner",e.target.value)}>{team.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></FG></F2>
        <F2><FG label="ARR (₹L)"><input type="number" min="0" value={fi("arrRevenue")} onChange={e=>f("arrRevenue",+e.target.value)}/><FormError error={formErrors.arrRevenue}/></FG>
        <FG label="Potential (₹L)"><input type="number" min="0" value={fi("potential")} onChange={e=>f("potential",+e.target.value)}/><FormError error={formErrors.potential}/></FG></F2>
        <F2><FG label="Business Unit"><select value={fi("businessUnit")} onChange={e=>f("businessUnit",e.target.value)}>{ml("businessUnits",BUSINESS_UNITS).map(b=><option key={b}>{b}</option>)}</select></FG>
        <FG label="Customer Tier"><select value={fi("customerTier")} onChange={e=>f("customerTier",e.target.value)}>{ml("customerTiers",CUSTOMER_TIERS).map(t=><option key={t}>{t}</option>)}</select></FG></F2>
        <FG label="Products"><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>{PRODUCTS.map(p=><button key={p.id} className="btn btn-xs" style={{background:form.products?.includes(p.id)?p.color:"var(--s3)",color:form.products?.includes(p.id)?"white":"var(--text2)",border:"none",cursor:"pointer"}} onClick={()=>toggleProd(p.id)}>{p.name}</button>)}</div></FG>
      </>}

      {/* ═══ HIERARCHY ═══ */}
      {formTab==="hierarchy"&&<>
        <F2><FG label="Account Level"><select value={fi("accountLevel")||fi("hierarchyLevel")} onChange={e=>{f("accountLevel",e.target.value);f("hierarchyLevel",e.target.value);}}>{ACCOUNT_LEVELS.map(l=><option key={l}>{l}</option>)}</select></FG>
        <FG label="Entity Type"><select value={fi("entityType")} onChange={e=>f("entityType",e.target.value)}>{ENTITY_TYPES.map(t=><option key={t}>{t}</option>)}</select></FG></F2>
        <F2><FG label="Parent Account"><select value={fi("parentId")} onChange={e=>{const parent=accounts.find(a=>a.id===e.target.value);f("parentId",e.target.value);f("parentCompanyName",parent?.name||"");f("hierarchyPath",parent?parent.hierarchyPath+" > "+(form.name||"New"):form.name||"");}}><option value="">None (Top Level)</option>{accounts.filter(a=>a.id!==form.id).map(a=><option key={a.id} value={a.id}>{a.hierarchyPath||a.name}</option>)}</select></FG>
        <FG label="Corporate Group"><input value={fi("corporateGroup")} onChange={e=>f("corporateGroup",e.target.value)} placeholder="Group code"/></FG></F2>
        <F2><FG label="Branch / Entity Code"><input value={fi("branchEntityCode")} onChange={e=>f("branchEntityCode",e.target.value)}/></FG>
        <FG label="Branch / Entity Name"><input value={fi("branchEntityName")} onChange={e=>f("branchEntityName",e.target.value)}/></FG></F2>
        <SectionHead title="Billing Hierarchy Rules"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 20px"}}>
          <Chk label="Billing To Parent" checked={fi("isBillingToParent")} onChange={v=>f("isBillingToParent",v)}/>
          <Chk label="Separate Invoice Required" checked={fi("separateInvoiceRequired")} onChange={v=>f("separateInvoiceRequired",v)}/>
          <Chk label="Contract Signed By Parent" checked={fi("contractSignedByParent")} onChange={v=>f("contractSignedByParent",v)}/>
          <Chk label="Pricing Inherited From Parent" checked={fi("pricingInheritedFromParent")} onChange={v=>f("pricingInheritedFromParent",v)}/>
          <Chk label="Credit Shared With Parent" checked={fi("creditSharedWithParent")} onChange={v=>f("creditSharedWithParent",v)}/>
          <Chk label="Tax Registration Separate" checked={fi("taxRegistrationSeparate")} onChange={v=>f("taxRegistrationSeparate",v)}/>
        </div>
      </>}

      {/* ═══ LEGAL & TAX ═══ */}
      {formTab==="legal"&&<>
        <F2><FG label="Legal Entity Name"><input value={fi("legalEntityName")} onChange={e=>f("legalEntityName",e.target.value)}/></FG>
        <FG label="PAN / Tax ID"><input value={fi("panTaxId")} onChange={e=>f("panTaxId",e.target.value)}/></FG></F2>
        <F2><FG label="GST / VAT No"><input value={fi("gstVatNo")} onChange={e=>f("gstVatNo",e.target.value)}/></FG>
        <FG label="CIN / Registration No"><input value={fi("cinNo")} onChange={e=>f("cinNo",e.target.value)}/></FG></F2>
        <F2><FG label="Tax Country"><select value={fi("taxCountry")} onChange={e=>f("taxCountry",e.target.value)}>{COUNTRIES.map(c=><option key={c}>{c}</option>)}</select></FG>
        <FG label="Tax State"><input value={fi("taxState")} onChange={e=>f("taxState",e.target.value)}/></FG></F2>
        <F2><FG label="Tax Treatment"><select value={fi("taxTreatment")} onChange={e=>f("taxTreatment",e.target.value)}>{ml("taxTreatments",TAX_TREATMENTS).map(t=><option key={t}>{t}</option>)}</select></FG></F2>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 20px",marginTop:8}}>
          <Chk label="TDS / Withholding Applicable" checked={fi("tdsApplicable")} onChange={v=>f("tdsApplicable",v)}/>
          <Chk label="E-Invoice Applicable" checked={fi("eInvoiceApplicable")} onChange={v=>f("eInvoiceApplicable",v)}/>
          <Chk label="PO Mandatory" checked={fi("poMandatory")} onChange={v=>f("poMandatory",v)}/>
        </div>
        {form.tdsApplicable&&<F2><FG label="TDS Rate %"><input type="number" min="0" step="0.01" value={fi("tdsRate")} onChange={e=>f("tdsRate",+e.target.value)}/></FG></F2>}
      </>}

      {/* ═══ ADDRESSES ═══ */}
      {formTab==="address"&&<>
        <SectionHead title="Registered Address"/>
        <F2><FG label="Address Line 1"><input value={fi("registeredAddress1")||fi("address")} onChange={e=>{f("registeredAddress1",e.target.value);f("address",e.target.value);}}/></FG>
        <FG label="Address Line 2"><input value={fi("registeredAddress2")} onChange={e=>f("registeredAddress2",e.target.value)}/></FG></F2>
        <F2><FG label="City"><input value={fi("registeredCity")} onChange={e=>f("registeredCity",e.target.value)}/></FG>
        <FG label="State"><input value={fi("registeredState")} onChange={e=>f("registeredState",e.target.value)}/></FG></F2>
        <F2><FG label="Postal Code"><input value={fi("registeredPostalCode")} onChange={e=>f("registeredPostalCode",e.target.value)}/></FG>
        <FG label="Country"><select value={fi("registeredCountry")} onChange={e=>f("registeredCountry",e.target.value)}>{COUNTRIES.map(c=><option key={c}>{c}</option>)}</select></FG></F2>
        <SectionHead title="Billing Address"/>
        <F2><FG label="Address Line 1"><input value={fi("billingAddress1")} onChange={e=>f("billingAddress1",e.target.value)}/></FG>
        <FG label="Address Line 2"><input value={fi("billingAddress2")} onChange={e=>f("billingAddress2",e.target.value)}/></FG></F2>
        <F2><FG label="City"><input value={fi("billingCity")} onChange={e=>f("billingCity",e.target.value)}/></FG>
        <FG label="State"><input value={fi("billingState")} onChange={e=>f("billingState",e.target.value)}/></FG></F2>
        <F2><FG label="Postal Code"><input value={fi("billingPostalCode")} onChange={e=>f("billingPostalCode",e.target.value)}/></FG>
        <FG label="Country"><select value={fi("billingCountry")} onChange={e=>f("billingCountry",e.target.value)}>{COUNTRIES.map(c=><option key={c}>{c}</option>)}</select></FG></F2>
        <F2><FG label="Time Zone"><input value={fi("timeZone")} onChange={e=>f("timeZone",e.target.value)} placeholder="Asia/Kolkata"/></FG></F2>
      </>}

      {/* ═══ BILLING CONTACTS ═══ */}
      {formTab==="contacts"&&<>
        <F2><FG label="Billing Contact Name"><input value={fi("billingContactName")} onChange={e=>f("billingContactName",e.target.value)}/></FG>
        <FG label="Billing Contact Email"><input type="email" value={fi("billingContactEmail")} onChange={e=>f("billingContactEmail",e.target.value)}/></FG></F2>
        <F2><FG label="Finance Contact Name"><input value={fi("financeContactName")} onChange={e=>f("financeContactName",e.target.value)}/></FG>
        <FG label="Finance Contact Email"><input type="email" value={fi("financeContactEmail")} onChange={e=>f("financeContactEmail",e.target.value)}/></FG></F2>
        <F2><FG label="Collections Contact Name"><input value={fi("collectionsContactName")} onChange={e=>f("collectionsContactName",e.target.value)}/></FG>
        <FG label="Collections Contact Email"><input type="email" value={fi("collectionsContactEmail")} onChange={e=>f("collectionsContactEmail",e.target.value)}/></FG></F2>
        <F2><FG label="Escalation Contact"><input value={fi("escalationContact")} onChange={e=>f("escalationContact",e.target.value)}/></FG>
        <FG label="Sales Owner"><select value={fi("salesOwnerId")} onChange={e=>f("salesOwnerId",e.target.value)}><option value="">—</option>{team.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></FG></F2>
        <F2><FG label="Support Owner"><select value={fi("supportOwnerId")} onChange={e=>f("supportOwnerId",e.target.value)}><option value="">—</option>{team.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></FG>
        <FG label="Territory / Region"><input value={fi("territory")} onChange={e=>f("territory",e.target.value)}/></FG></F2>
        <F2><FG label="Cost Center"><input value={fi("costCenter")} onChange={e=>f("costCenter",e.target.value)}/></FG>
        <FG label="Profit Center"><input value={fi("profitCenter")} onChange={e=>f("profitCenter",e.target.value)}/></FG></F2>
      </>}

      {/* ═══ COMMERCIAL ═══ */}
      {formTab==="commercial"&&<>
        <SectionHead title="Contract"/>
        <F2><FG label="Contract No"><input value={fi("contractNo")} onChange={e=>f("contractNo",e.target.value)}/></FG>
        <FG label="PO Number"><input value={fi("poNumber")} onChange={e=>f("poNumber",e.target.value)}/></FG></F2>
        <F2><FG label="Contract Start"><input type="date" value={fi("contractStartDate")} onChange={e=>f("contractStartDate",e.target.value)}/></FG>
        <FG label="Contract End"><input type="date" value={fi("contractEndDate")} onChange={e=>f("contractEndDate",e.target.value)}/></FG></F2>
        <F2><FG label="Service Start"><input type="date" value={fi("serviceStartDate")} onChange={e=>f("serviceStartDate",e.target.value)}/></FG>
        <FG label="Renewal Type"><select value={fi("renewalType")} onChange={e=>f("renewalType",e.target.value)}>{ml("renewalTypes",RENEWAL_TYPES).map(t=><option key={t}>{t}</option>)}</select></FG></F2>
        <F2><FG label="Renewal Notice Days"><input type="number" min="0" value={fi("renewalNoticeDays")} onChange={e=>f("renewalNoticeDays",+e.target.value)}/></FG></F2>
        <SectionHead title="Payment & Billing"/>
        <F2><FG label="Payment Terms"><select value={fi("paymentTerms")} onChange={e=>f("paymentTerms",e.target.value)}>{ml("paymentTerms",PAYMENT_TERMS_LIST).map(t=><option key={t}>{t}</option>)}</select></FG>
        <FG label="Credit Days"><input type="number" min="0" value={fi("creditDays")} onChange={e=>f("creditDays",+e.target.value)}/></FG></F2>
        <F2><FG label="Credit Limit"><input type="number" min="0" value={fi("creditLimit")} onChange={e=>f("creditLimit",+e.target.value)}/></FG>
        <FG label="Currency"><input value={fi("currencyCode")} onChange={e=>f("currencyCode",e.target.value)} placeholder="INR"/></FG></F2>
        <F2><FG label="Billing Frequency"><select value={fi("billingFrequency")} onChange={e=>f("billingFrequency",e.target.value)}>{ml("billingFrequencies",BILLING_FREQUENCIES).map(b=><option key={b}>{b}</option>)}</select></FG>
        <FG label="Invoice Basis"><select value={fi("invoiceGenerationBasis")} onChange={e=>f("invoiceGenerationBasis",e.target.value)}>{ml("invoiceBasis",INVOICE_GEN_BASIS).map(b=><option key={b}>{b}</option>)}</select></FG></F2>
        <F2><FG label="Min Monthly Commitment"><input type="number" min="0" value={fi("minimumMonthlyCommitment")} onChange={e=>f("minimumMonthlyCommitment",+e.target.value)}/></FG>
        <FG label="Discount Type"><select value={fi("discountType")} onChange={e=>f("discountType",e.target.value)}><option value="">None</option>{ml("discountTypes",DISCOUNT_TYPES).map(d=><option key={d}>{d}</option>)}</select></FG></F2>
        {fi("discountType")&&<F2><FG label="Discount Value"><input type="number" min="0" value={fi("discountValue")} onChange={e=>f("discountValue",+e.target.value)}/></FG></F2>}
        <Chk label="Billing Approval Required" checked={fi("billingApprovalRequired")} onChange={v=>f("billingApprovalRequired",v)}/>
      </>}

      {/* ═══ GRI ═══ */}
      {formTab==="gri"&&<>
        <Chk label="GRI Applicable" checked={fi("griApplicable")} onChange={v=>f("griApplicable",v)}/>
        {form.griApplicable&&<>
          <F2><FG label="GRI Type"><select value={fi("griType")} onChange={e=>f("griType",e.target.value)}><option value="">Select…</option>{ml("griTypes",GRI_TYPES).map(t=><option key={t}>{t}</option>)}</select></FG>
          <FG label="GRI %"><input type="number" step="0.01" value={fi("griPercentage")} onChange={e=>f("griPercentage",+e.target.value)}/></FG></F2>
          <F2><FG label="GRI Frequency"><select value={fi("griFrequency")} onChange={e=>f("griFrequency",e.target.value)}>{ml("griFrequencies",GRI_FREQUENCIES).map(g=><option key={g}>{g}</option>)}</select></FG>
          <FG label="Effective Basis"><select value={fi("griEffectiveBasis")} onChange={e=>f("griEffectiveBasis",e.target.value)}>{GRI_EFFECTIVE_BASIS.map(g=><option key={g}>{g}</option>)}</select></FG></F2>
          <F2><FG label="First GRI Date"><input type="date" value={fi("firstGRIEffectiveDate")} onChange={e=>f("firstGRIEffectiveDate",e.target.value)}/></FG>
          <FG label="Next GRI Date"><input type="date" value={fi("nextGRIDate")} onChange={e=>f("nextGRIDate",e.target.value)}/></FG></F2>
          <F2><FG label="Notice Period Days"><input type="number" min="0" value={fi("griNoticePeriodDays")} onChange={e=>f("griNoticePeriodDays",+e.target.value)}/></FG>
          <FG label="Cap %"><input type="number" step="0.01" value={fi("griCapPercentage")} onChange={e=>f("griCapPercentage",+e.target.value)}/></FG></F2>
          <F2><FG label="Floor %"><input type="number" step="0.01" value={fi("griFloorPercentage")} onChange={e=>f("griFloorPercentage",+e.target.value)}/></FG></F2>
          <Chk label="GRI Approval Required" checked={fi("griApprovalRequired")} onChange={v=>f("griApprovalRequired",v)}/>
          <FG label="GRI Remarks"><textarea rows={2} value={fi("griRemarks")} onChange={e=>f("griRemarks",e.target.value)}/></FG>
        </>}
      </>}

      {/* ═══ SERVICES ═══ */}
      {formTab==="services"&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:13,fontWeight:700,color:"var(--text1)"}}>Service Subscriptions ({subs.length})</span>
          <button className="btn btn-primary btn-xs" onClick={addSub}><Plus size={11}/>Add Service</button>
        </div>
        {subs.map((s,i)=>(
          <div key={s.id||i} style={{border:"1.5px solid var(--border)",borderRadius:10,padding:14,marginBottom:12,background:"var(--s2)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:12,fontWeight:700,color:"var(--brand)"}}>Service #{i+1}</span>
              <button className="icon-btn" onClick={()=>delSub(i)}><Trash2 size={13} style={{color:"#EF4444"}}/></button>
            </div>
            <F2><FG label="Product"><select value={s.productId} onChange={e=>{const p=PRODUCTS.find(x=>x.id===e.target.value);updSub(i,"productId",e.target.value);updSub(i,"productName",p?.name||e.target.value);}}><option value="">Select…</option>{PRODUCTS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></FG>
            <FG label="Variant"><input value={s.productVariant} onChange={e=>updSub(i,"productVariant",e.target.value)} placeholder="Standard / Pro / Enterprise"/></FG></F2>
            <F2><FG label="Service Category"><select value={s.serviceCategory} onChange={e=>updSub(i,"serviceCategory",e.target.value)}>{ml("serviceCategories",SERVICE_CATEGORIES).map(c=><option key={c}>{c}</option>)}</select></FG>
            <FG label="Commercial Model"><select value={s.commercialModel} onChange={e=>updSub(i,"commercialModel",e.target.value)}>{ml("commercialModels",COMMERCIAL_MODELS).map(c=><option key={c}>{c}</option>)}</select></FG></F2>
            <F2><FG label="Active From"><input type="date" value={s.activeFrom} onChange={e=>updSub(i,"activeFrom",e.target.value)}/></FG>
            <FG label="Active To"><input type="date" value={s.activeTo} onChange={e=>updSub(i,"activeTo",e.target.value)}/></FG></F2>
            <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:4}}>
              <Chk label="Billing Active" checked={s.billingActive} onChange={v=>updSub(i,"billingActive",v)}/>
              <Chk label="Usage Tracking" checked={s.usageTrackingRequired} onChange={v=>updSub(i,"usageTrackingRequired",v)}/>
              <Chk label="Support Included" checked={s.supportIncluded} onChange={v=>updSub(i,"supportIncluded",v)}/>
            </div>
            {/* SaaS fields */}
            {s.serviceCategory==="SaaS"&&<><SectionHead title="SaaS Details"/>
              <F2><FG label="Plan Name"><input value={s.planName} onChange={e=>updSub(i,"planName",e.target.value)}/></FG>
              <FG label="License Type"><select value={s.licenseType} onChange={e=>updSub(i,"licenseType",e.target.value)}>{LICENSE_TYPES.map(t=><option key={t}>{t}</option>)}</select></FG></F2>
              <F2><FG label="Included Users"><input type="number" min="0" value={s.includedUsers} onChange={e=>updSub(i,"includedUsers",+e.target.value)}/></FG>
              <FG label="Included Branches"><input type="number" min="0" value={s.includedBranches} onChange={e=>updSub(i,"includedBranches",+e.target.value)}/></FG></F2>
            </>}
            {/* Annual Plan fields */}
            {s.serviceCategory==="Annual Plan"&&<><SectionHead title="Annual Plan Details"/>
              <F2><FG label="Plan Type"><select value={s.planType} onChange={e=>updSub(i,"planType",e.target.value)}>{PLAN_TYPES_ANNUAL.map(t=><option key={t}>{t}</option>)}</select></FG>
              <FG label="Tenure (months)"><input type="number" min="1" value={s.contractTenureMonths} onChange={e=>updSub(i,"contractTenureMonths",+e.target.value)}/></FG></F2>
              <F2><FG label="Annual Amount"><input type="number" min="0" value={s.annualSubscriptionAmount} onChange={e=>updSub(i,"annualSubscriptionAmount",+e.target.value)}/></FG>
              <FG label="Renewal Date"><input type="date" value={s.renewalDate} onChange={e=>updSub(i,"renewalDate",e.target.value)}/></FG></F2>
              <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:4}}>
                <Chk label="Auto Renewal" checked={s.autoRenewalFlag} onChange={v=>updSub(i,"autoRenewalFlag",v)}/>
                <Chk label="Overage Billing" checked={s.overageBillingAllowed} onChange={v=>updSub(i,"overageBillingAllowed",v)}/>
                <Chk label="Deferred Revenue" checked={s.deferredRevenueApplicable} onChange={v=>updSub(i,"deferredRevenueApplicable",v)}/>
              </div>
            </>}
            {/* One-Time Software Sale */}
            {s.serviceCategory==="One-Time Software Sale"&&<><SectionHead title="One-Time Sale Details"/>
              <F2><FG label="Sale Type"><select value={s.softwareSaleType} onChange={e=>updSub(i,"softwareSaleType",e.target.value)}>{SOFTWARE_SALE_TYPES.map(t=><option key={t}>{t}</option>)}</select></FG>
              <FG label="License Scope"><select value={s.licenseScope} onChange={e=>updSub(i,"licenseScope",e.target.value)}>{LICENSE_SCOPES.map(t=><option key={t}>{t}</option>)}</select></FG></F2>
              <F2><FG label="License Amount"><input type="number" min="0" value={s.oneTimeLicenseAmount} onChange={e=>updSub(i,"oneTimeLicenseAmount",+e.target.value)}/></FG>
              <FG label="Deployment"><select value={s.deploymentType} onChange={e=>updSub(i,"deploymentType",e.target.value)}>{DEPLOYMENT_TYPES.map(t=><option key={t}>{t}</option>)}</select></FG></F2>
              <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:4}}>
                <Chk label="Customization" checked={s.customizationIncluded} onChange={v=>updSub(i,"customizationIncluded",v)}/>
                <Chk label="Implementation" checked={s.implementationIncluded} onChange={v=>updSub(i,"implementationIncluded",v)}/>
                <Chk label="Training" checked={s.trainingIncluded} onChange={v=>updSub(i,"trainingIncluded",v)}/>
                <Chk label="AMC Applicable" checked={s.amcApplicable} onChange={v=>updSub(i,"amcApplicable",v)}/>
              </div>
              {s.amcApplicable&&<F2><FG label="AMC Amount"><input type="number" min="0" value={s.amcAmount} onChange={e=>updSub(i,"amcAmount",+e.target.value)}/></FG>
              <FG label="AMC Frequency"><select value={s.amcBillingFrequency} onChange={e=>updSub(i,"amcBillingFrequency",e.target.value)}>{AMC_BILLING_FREQUENCIES.map(f2=><option key={f2}>{f2}</option>)}</select></FG></F2>}
              <F2><FG label="Go-Live Date"><input type="date" value={s.goLiveDate} onChange={e=>updSub(i,"goLiveDate",e.target.value)}/></FG>
              <FG label="Revenue Basis"><select value={s.revenueRecognitionBasis} onChange={e=>updSub(i,"revenueRecognitionBasis",e.target.value)}>{REVENUE_RECOGNITION_BASIS.map(r=><option key={r}>{r}</option>)}</select></FG></F2>
            </>}
            {/* Development/Customization */}
            {s.serviceCategory==="Development / Customization"&&<><SectionHead title="Development Details"/>
              <F2><FG label="Project Type"><select value={s.devProjectType} onChange={e=>updSub(i,"devProjectType",e.target.value)}>{DEV_PROJECT_TYPES.map(t=><option key={t}>{t}</option>)}</select></FG>
              <FG label="SOW / Proposal No"><input value={s.sowNo} onChange={e=>updSub(i,"sowNo",e.target.value)}/></FG></F2>
              <F2><FG label="Approved Budget"><input type="number" min="0" value={s.approvedBudget} onChange={e=>updSub(i,"approvedBudget",+e.target.value)}/></FG>
              <FG label="Advance Amount"><input type="number" min="0" value={s.advanceAmount} onChange={e=>updSub(i,"advanceAmount",+e.target.value)}/></FG></F2>
            </>}
            {/* Transaction / Filing */}
            {(s.serviceCategory==="Transaction / Filing / Data Entry")&&<><SectionHead title="Transaction Billing"/>
              <F2><FG label="Transaction Type"><input value={s.transactionType} onChange={e=>updSub(i,"transactionType",e.target.value)}/></FG>
              <FG label="Billing Unit"><input value={s.billingUnit} onChange={e=>updSub(i,"billingUnit",e.target.value)} placeholder="Per Filing / Per Record"/></FG></F2>
            </>}
            {/* Messaging */}
            {s.serviceCategory==="Messaging"&&<><SectionHead title="Messaging"/>
              <F2><FG label="Channel"><select value={s.channelType} onChange={e=>updSub(i,"channelType",e.target.value)}>{CHANNEL_TYPES.map(t=><option key={t}>{t}</option>)}</select></FG>
              <FG label="Billing Basis"><select value={s.messagingBillingBasis} onChange={e=>updSub(i,"messagingBillingBasis",e.target.value)}>{MESSAGING_BILLING_BASIS.map(t=><option key={t}>{t}</option>)}</select></FG></F2>
            </>}
            {/* OCR / AI / API */}
            {s.serviceCategory==="OCR / AI / API"&&<><SectionHead title="OCR / AI / API"/>
              <F2><FG label="Service Unit"><select value={s.serviceUnitType} onChange={e=>updSub(i,"serviceUnitType",e.target.value)}>{OCR_AI_SERVICE_UNITS.map(t=><option key={t}>{t}</option>)}</select></FG>
              <FG label="Model / Engine"><input value={s.modelEngineType} onChange={e=>updSub(i,"modelEngineType",e.target.value)}/></FG></F2>
              <Chk label="Success-Based Billing" checked={s.successBasedBilling} onChange={v=>updSub(i,"successBasedBilling",v)}/>
            </>}
          </div>
        ))}
        {subs.length===0&&<div style={{textAlign:"center",color:"var(--text3)",fontSize:13,padding:20}}>No services yet. Click "Add Service" to add a product/service subscription.</div>}
      </>}

      {/* ═══ CHARGES ═══ */}
      {formTab==="charges"&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:13,fontWeight:700,color:"var(--text1)"}}>Charge Mappings ({charges.length})</span>
          <button className="btn btn-primary btn-xs" onClick={addCharge}><Plus size={11}/>Add Charge</button>
        </div>
        {charges.map((c,i)=>(
          <div key={c.id||i} style={{border:"1.5px solid var(--border)",borderRadius:10,padding:14,marginBottom:12,background:"var(--s2)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:12,fontWeight:700,color:"var(--brand)"}}>Charge #{i+1}</span>
              <button className="icon-btn" onClick={()=>delChg(i)}><Trash2 size={13} style={{color:"#EF4444"}}/></button>
            </div>
            <F2><FG label="Charge Code"><input value={c.chargeCode} onChange={e=>updChg(i,"chargeCode",e.target.value)}/></FG>
            <FG label="Charge Name"><input value={c.chargeName} onChange={e=>updChg(i,"chargeName",e.target.value)}/></FG></F2>
            <F2><FG label="Charge Type"><select value={c.chargeType} onChange={e=>updChg(i,"chargeType",e.target.value)}>{ml("chargeTypes",CHARGE_TYPES).map(t=><option key={t}>{t}</option>)}</select></FG>
            <FG label="Unit of Measure"><select value={c.unitOfMeasure} onChange={e=>updChg(i,"unitOfMeasure",e.target.value)}>{ml("unitOfMeasures",UNIT_OF_MEASURES).map(u=><option key={u}>{u}</option>)}</select></FG></F2>
            <F2><FG label="Rate Type"><select value={c.rateType} onChange={e=>updChg(i,"rateType",e.target.value)}>{ml("rateTypes",RATE_TYPES).map(r=><option key={r}>{r}</option>)}</select></FG>
            <FG label="Unit Rate"><input type="number" min="0" step="0.0001" value={c.unitRate} onChange={e=>updChg(i,"unitRate",+e.target.value)}/></FG></F2>
            <F2><FG label="Included Free Volume"><input type="number" min="0" value={c.includedFreeVolume} onChange={e=>updChg(i,"includedFreeVolume",+e.target.value)}/></FG>
            <FG label="Overage Rate"><input type="number" min="0" step="0.0001" value={c.overageRate} onChange={e=>updChg(i,"overageRate",+e.target.value)}/></FG></F2>
            <F2><FG label="Min Bill Amount"><input type="number" min="0" value={c.minimumBillAmount} onChange={e=>updChg(i,"minimumBillAmount",+e.target.value)}/></FG>
            <FG label="Max Cap"><input type="number" min="0" value={c.maximumCapAmount} onChange={e=>updChg(i,"maximumCapAmount",+e.target.value)}/></FG></F2>
            <F2><FG label="Effective From"><input type="date" value={c.effectiveFrom} onChange={e=>updChg(i,"effectiveFrom",e.target.value)}/></FG>
            <FG label="Effective To"><input type="date" value={c.effectiveTo} onChange={e=>updChg(i,"effectiveTo",e.target.value)}/></FG></F2>
            <F2><FG label="Revenue Ledger"><input value={c.revenueLedger} onChange={e=>updChg(i,"revenueLedger",e.target.value)}/></FG>
            <FG label="Tax Code"><input value={c.taxCode} onChange={e=>updChg(i,"taxCode",e.target.value)}/></FG></F2>
            <Chk label="Charge-level GRI" checked={c.chargeLevelGRIApplicable} onChange={v=>updChg(i,"chargeLevelGRIApplicable",v)}/>
            {c.chargeLevelGRIApplicable&&<F2><FG label="GRI Rule"><select value={c.griRuleType} onChange={e=>updChg(i,"griRuleType",e.target.value)}>{GRI_RULE_TYPES.map(r=><option key={r}>{r}</option>)}</select></FG>
            <FG label="Override %"><input type="number" step="0.01" value={c.griOverridePercentage} onChange={e=>updChg(i,"griOverridePercentage",+e.target.value)}/></FG></F2>}
          </div>
        ))}
        {charges.length===0&&<div style={{textAlign:"center",color:"var(--text3)",fontSize:13,padding:20}}>No charges yet. Click "Add Charge" to map a charge/rate.</div>}
      </>}

      {/* ═══ USAGE BILLING ═══ */}
      {formTab==="usage"&&<>
        <F2><FG label="Usage Source"><select value={fi("usageSource")} onChange={e=>f("usageSource",e.target.value)}>{USAGE_SOURCES.map(u=><option key={u}>{u}</option>)}</select></FG>
        <FG label="Reconciliation Method"><select value={fi("reconciliationMethod")} onChange={e=>f("reconciliationMethod",e.target.value)}>{RECONCILIATION_METHODS.map(r=><option key={r}>{r}</option>)}</select></FG></F2>
        <F2><FG label="Proration Rule"><select value={fi("prorationRule")} onChange={e=>f("prorationRule",e.target.value)}>{PRORATION_RULES.map(p=><option key={p}>{p}</option>)}</select></FG>
        <FG label="Billing Cut-off Day"><input type="number" min="1" max="31" value={fi("billingCutoffDay")} onChange={e=>f("billingCutoffDay",+e.target.value)}/></FG></F2>
        <F2><FG label="Invoice Consolidation"><select value={fi("invoiceConsolidationRule")} onChange={e=>f("invoiceConsolidationRule",e.target.value)}>{INVOICE_CONSOLIDATION_RULES.map(r=><option key={r}>{r}</option>)}</select></FG>
        <FG label="Review Frequency"><select value={fi("usageReviewFrequency")} onChange={e=>f("usageReviewFrequency",e.target.value)}>{["Weekly","Monthly"].map(r=><option key={r}>{r}</option>)}</select></FG></F2>
        <F2><FG label="Dispute Window Days"><input type="number" min="0" value={fi("disputeWindowDays")} onChange={e=>f("disputeWindowDays",+e.target.value)}/></FG></F2>
        <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:8}}>
          <Chk label="Billing Proof Required" checked={fi("billingProofRequired")} onChange={v=>f("billingProofRequired",v)}/>
          <Chk label="Unbilled Usage Allowed" checked={fi("unbilledUsageAllowed")} onChange={v=>f("unbilledUsageAllowed",v)}/>
        </div>
      </>}

      {/* ═══ FINANCE ═══ */}
      {formTab==="finance"&&<>
        <SectionHead title="Ledgers"/>
        <F2><FG label="Receivable Ledger"><input value={fi("receivableLedger")} onChange={e=>f("receivableLedger",e.target.value)}/></FG>
        <FG label="Advance Ledger"><input value={fi("advanceLedger")} onChange={e=>f("advanceLedger",e.target.value)}/></FG></F2>
        <F2><FG label="Tax Ledger"><input value={fi("taxLedger")} onChange={e=>f("taxLedger",e.target.value)}/></FG>
        <FG label="Collection Bucket"><select value={fi("collectionBucket")} onChange={e=>f("collectionBucket",e.target.value)}>{ml("collectionBuckets",COLLECTION_BUCKETS).map(b=><option key={b}>{b}</option>)}</select></FG></F2>
        <SectionHead title="Controls"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 20px"}}>
          <Chk label="Debit Note Allowed" checked={fi("debitNoteAllowed")} onChange={v=>f("debitNoteAllowed",v)}/>
          <Chk label="Credit Note Allowed" checked={fi("creditNoteAllowed")} onChange={v=>f("creditNoteAllowed",v)}/>
          <Chk label="Late Fee Applicable" checked={fi("lateFeeApplicable")} onChange={v=>f("lateFeeApplicable",v)}/>
          <Chk label="Billing Hold" checked={fi("billingHoldFlag")} onChange={v=>f("billingHoldFlag",v)}/>
          <Chk label="Collections Hold" checked={fi("collectionsHoldFlag")} onChange={v=>f("collectionsHoldFlag",v)}/>
        </div>
        {form.lateFeeApplicable&&<F2><FG label="Late Fee Rule"><input value={fi("lateFeeRule")} onChange={e=>f("lateFeeRule",e.target.value)} placeholder="e.g. 1.5% per month"/></FG></F2>}
        <FG label="Remarks"><textarea rows={2} value={fi("remarks")} onChange={e=>f("remarks",e.target.value)}/></FG>
      </>}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ACCOUNTS PAGE
// ═══════════════════════════════════════════════════════════════════
function Accounts({accounts, setAccounts, onDeleteAccount, opps, activities, setActivities, notes, files, onAddNote, onAddFile, currentUser, contacts=[], tickets=[], contracts=[], collections=[], leads=[], orgUsers, callReports, setCallReports, masters}) {
  const { products: PRODUCTS, prodMap: PROD_MAP } = useProducts();
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
    {label:"ARR (L)",accessor:a=>a.arrRevenue},{label:"Potential (L)",accessor:a=>a.potential},
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
                <span style={{fontSize:12,fontWeight:800,fontFamily:"'Outfit',sans-serif",color:"var(--brand)"}}>₹{a.arrRevenue}L</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Account Profile */}
      {detail && <AccountProfile a={detail} onClose={() => setDetail(null)} onEdit={() => { openEdit(detail); setDetail(null); }} opps={opps} activities={activities} contacts={contacts} tickets={tickets} contracts={contracts} collections={collections} notes={notes} files={files} onAddNote={onAddNote} onAddFile={onAddFile} currentUser={currentUser} allAccounts={accounts} leads={leads} orgUsers={orgUsers} onLogCall={(prefill) => { setDetail(null); setLogCallPrefill(prefill); }} onNavigate={(page) => { setDetail(null); window.location.hash = `#/${page}`; }}/>}

      {/* Add / Edit Modal — Tabbed */}
      {modal && <AccountFormModal form={form} setForm={setForm} formErrors={formErrors} setFormErrors={setFormErrors} modal={modal} setModal={setModal} save={save} accounts={accounts} team={team} toggleProd={toggleProd} PRODUCTS={PRODUCTS} masters={masters}/>}
      {confirm && <Confirm title="Delete Account" msg="This will permanently remove the account and all linked contacts, deals, activities, tickets, and notes." onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)}/>}

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
