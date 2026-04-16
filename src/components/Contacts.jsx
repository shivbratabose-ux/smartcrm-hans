import { useState, useMemo } from "react";
import { Plus, Search, Edit2, Trash2, Check, Download, Users, Mail, Phone, Star, Building2, ArrowUpDown, ArrowUp, ArrowDown, Globe, Briefcase, Calendar, TrendingUp, FileText, Activity } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { uid, cmp, sanitizeObj, validateContact, hasErrors, fmt, today } from "../utils/helpers";
import { PRODUCTS, PROD_MAP, COUNTRIES, CONTACT_DEPARTMENTS, TEAM_MAP } from '../data/constants';
import { StatusBadge, ProdTag, UserPill, Modal, DeleteConfirm, FormError, Empty } from "./shared";
import Pagination, { usePagination } from './Pagination';
import BulkActions, { useBulkSelect } from './BulkActions';
import { exportCSV } from '../utils/csv';

const BLANK_CON={name:"",role:"",email:"",phone:"",accountId:"",primary:false,contactId:"",designation:"",department:"",departments:[],products:[],branches:[],countries:[],linkedOpps:[]};

const infoRow = (label, value) => (
  <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
    <span style={{fontSize:12,color:"var(--text3)",fontWeight:500}}>{label}</span>
    <span style={{fontSize:12,color:"var(--text1)",fontWeight:600,textAlign:"right",maxWidth:"60%"}}>{value || "—"}</span>
  </div>
);

// ═══════════════════════════════════════════════════════════════════
// CONTACT DETAIL PROFILE
// ═══════════════════════════════════════════════════════════════════
function ContactDetail({ c, onClose, onEdit, accounts, opps=[], activities=[] }) {
  const acc = accounts.find(a => a.id === c.accountId);
  const linkedOpps = opps.filter(o => o.primaryContactId === c.id || (o.secondaryContactIds||[]).includes(c.id));
  const linkedActs = [...activities].filter(a => a.contactId === c.id).sort((x,y) => (y.date||"").localeCompare(x.date||""));

  return (
    <div className="overlay" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && onClose()} style={{zIndex:1000}}>
      <div style={{background:"var(--bg,#F1F5F9)",width:"90vw",maxWidth:800,maxHeight:"90vh",borderRadius:16,overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 25px 60px rgba(0,0,0,0.3)"}}>
        {/* Header */}
        <div style={{background:"white",padding:"20px 28px",borderBottom:"1px solid var(--border)",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:48,height:48,borderRadius:12,background:"#1B6B5A",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:17,fontWeight:700}}>
                {c.name?.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}
              </div>
              <div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:18,fontWeight:700,color:"var(--text1)"}}>{c.name}</span>
                  {c.primary && <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:4,background:"#F59E0B18",color:"#F59E0B"}}>PRIMARY</span>}
                  {c.contactId && <span style={{fontSize:11,fontFamily:"'Courier New',monospace",color:"var(--text3)",background:"var(--s2)",padding:"2px 8px",borderRadius:4}}>{c.contactId}</span>}
                </div>
                <div style={{fontSize:12,color:"var(--text3)",marginTop:2}}>
                  {c.designation || c.role || "—"} {acc ? `at ${acc.name}` : ""}
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-sec btn-sm" onClick={onClose}>Close</button>
              <button className="btn btn-primary btn-sm" onClick={onEdit}><Edit2 size={13}/>Edit</button>
            </div>
          </div>

          {/* Quick stat row */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginTop:16}}>
            {[
              { label: "ACCOUNT", value: acc?.name || "—", color: "#1B6B5A" },
              { label: "DEALS", value: linkedOpps.length, color: "#3B82F6" },
              { label: "ACTIVITIES", value: linkedActs.length, color: "#8B5CF6" },
              { label: "PRODUCTS", value: (c.products||[]).length, color: "#D97706" },
            ].map(k => (
              <div key={k.label} style={{background:k.color+"0A",borderRadius:10,padding:"10px 14px",border:`1px solid ${k.color}20`}}>
                <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:k.color}}>{k.label}</div>
                <div style={{fontSize:16,fontWeight:800,fontFamily:"'Outfit',sans-serif",color:"var(--text1)",marginTop:2}}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{flex:1,overflow:"auto",padding:24}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {/* Left */}
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                  <Users size={15} style={{color:"var(--brand)"}}/> Contact Information
                </div>
                {infoRow("Full Name", c.name)}
                {infoRow("Designation", c.designation || c.role)}
                {infoRow("Department", c.department || "—")}
                {infoRow("Email", c.email ? <a href={`mailto:${c.email}`} style={{color:"var(--brand)",textDecoration:"none"}}>{c.email}</a> : "—")}
                {infoRow("Phone", c.phone || "—")}
                {infoRow("Primary Contact", c.primary ? "Yes" : "No")}
              </div>

              <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                  <Building2 size={15} style={{color:"var(--brand)"}}/> Account Details
                </div>
                {infoRow("Account", acc?.name || "—")}
                {infoRow("Account No.", acc?.accountNo || "—")}
                {infoRow("Type", acc?.type || "—")}
                {infoRow("Country", acc?.country || "—")}
                {infoRow("Status", acc?.status || "—")}
              </div>

              {(c.departments||[]).length > 0 && (
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:10}}>Departments</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {(c.departments||[]).map(d => <span key={d} style={{fontSize:10,padding:"3px 8px",borderRadius:4,background:"#E0E7FF",color:"#3730A3",fontWeight:600}}>{d}</span>)}
                  </div>
                </div>
              )}

              {(c.products||[]).length > 0 && (
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:10}}>Products</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {(c.products||[]).map(p => <ProdTag key={p} pid={p}/>)}
                  </div>
                </div>
              )}
            </div>

            {/* Right */}
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {/* Linked Deals */}
              <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                  <TrendingUp size={15} style={{color:"var(--brand)"}}/> Linked Deals ({linkedOpps.length})
                </div>
                {linkedOpps.length > 0 ? linkedOpps.map(o => (
                  <div key={o.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid var(--border)"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,color:"var(--text1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.title}</div>
                      <div style={{fontSize:10,color:"var(--text3)"}}>₹{o.value}L · {o.stage}</div>
                    </div>
                    <StatusBadge status={o.stage}/>
                  </div>
                )) : <div style={{fontSize:12,color:"var(--text3)",textAlign:"center",padding:16}}>No linked deals</div>}
              </div>

              {/* Recent Activity */}
              <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:12,display:"flex",alignItems:"center",gap:8}}>
                  <Activity size={15} style={{color:"var(--brand)"}}/> Recent Activity ({linkedActs.length})
                </div>
                {linkedActs.length > 0 ? linkedActs.slice(0, 5).map(a => (
                  <div key={a.id} style={{display:"flex",gap:8,padding:"6px 0",borderBottom:"1px solid var(--border)"}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:500,color:"var(--text1)"}}>{a.title}</div>
                      <div style={{fontSize:10,color:"var(--text3)"}}>{a.type} · {fmt.short(a.date)}</div>
                    </div>
                    <StatusBadge status={a.status}/>
                  </div>
                )) : <div style={{fontSize:12,color:"var(--text3)",textAlign:"center",padding:16}}>No activities logged</div>}
              </div>

              {/* Countries */}
              {(c.countries||[]).length > 0 && (
                <div style={{background:"white",borderRadius:12,padding:"18px 20px",border:"1px solid var(--border)"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--text1)",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
                    <Globe size={15} style={{color:"var(--brand)"}}/> Countries
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {(c.countries||[]).map(ct => <span key={ct} style={{fontSize:11,padding:"3px 8px",borderRadius:4,background:"var(--s2)",color:"var(--text2)",fontWeight:500}}>{ct}</span>)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// CONTACTS PAGE
// ═══════════════════════════════════════════════════════════════════
function Contacts({contacts, setContacts, onDeleteContact, accounts, opps=[], activities=[], canDelete}) {
  const [search, setSearch] = useState("");
  const [accF, setAccF] = useState("All");
  const [deptF, setDeptF] = useState("All");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK_CON);
  const [confirm, setConfirm] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [detail, setDetail] = useState(null);
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };
  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <ArrowUpDown size={11} style={{opacity:0.3,marginLeft:2}}/>;
    return sortDir === "asc" ? <ArrowUp size={11} style={{marginLeft:2}}/> : <ArrowDown size={11} style={{marginLeft:2}}/>;
  };

  const filtered = useMemo(() => [...contacts].filter(c => {
    if (accF !== "All" && c.accountId !== accF) return false;
    if (deptF !== "All" && !(c.departments||[]).includes(deptF) && c.department !== deptF) return false;
    if (search && !(c.name+(c.role||"")+(c.email||"")+(c.contactId||"")+(c.designation||"")).toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    const v = cmp(a, b, sortCol);
    return sortDir === "desc" ? -v : v;
  }), [contacts, accF, deptF, search, sortCol, sortDir]);

  const bulk = useBulkSelect(filtered);
  const pg = usePagination(filtered);

  // KPIs
  const totalContacts = contacts.length;
  const primaryContacts = contacts.filter(c => c.primary).length;
  const uniqueAccounts = new Set(contacts.map(c => c.accountId).filter(Boolean)).size;
  const withEmail = contacts.filter(c => c.email).length;

  // Department distribution
  const deptData = useMemo(() => {
    const byDept = {};
    contacts.forEach(c => (c.departments||[]).forEach(d => { byDept[d] = (byDept[d] || 0) + 1; }));
    const COLORS = ["#1B6B5A","#3B82F6","#F59E0B","#8B5CF6","#EF4444","#0D9488","#D97706","#EC4899","#6366F1","#14B8A6","#F97316","#84CC16"];
    return Object.entries(byDept).map(([name, value], i) => ({name, value, color: COLORS[i % COLORS.length]})).sort((a,b) => b.value - a.value);
  }, [contacts]);

  const openAdd = () => {
    const nextNum = contacts.length > 0 ? Math.max(...contacts.map(c => {
      const m = c.contactId?.match(/CON-(\d+)/);
      return m ? parseInt(m[1]) : 0;
    })) + 1 : 1;
    const contactId = `CON-${String(nextNum).padStart(3, '0')}`;
    setForm({...BLANK_CON, id:`c${uid()}`, contactId});
    setFormErrors({});
    setModal({mode:"add"});
  };
  const openEdit = c => { setForm({...c}); setFormErrors({}); setModal({mode:"edit"}); };
  const save = () => {
    const errs = validateContact(form);
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    const isDup = contacts.some(existing =>
      existing.id !== form.id && (
        (form.email && existing.email && existing.email.toLowerCase() === form.email.toLowerCase()) ||
        (form.phone && existing.phone && existing.phone === form.phone)
      )
    );
    if (isDup && !window.confirm("A contact with the same email or phone already exists. This may be a duplicate. Continue anyway?")) return;
    const clean = sanitizeObj(form);
    if (modal.mode === "add") setContacts(p => [...p, {...clean}]);
    else setContacts(p => p.map(c => c.id === clean.id ? {...clean} : c));
    setModal(null); setFormErrors({});
  };
  const del = id => { onDeleteContact(id); setConfirm(null); setDetail(null); };

  const CSV_COLS = [
    {label:"contactId",             accessor:c=>c.contactId||""},
    {label:"name",                  accessor:c=>c.name},
    {label:"email",                 accessor:c=>c.email},
    {label:"phone",                 accessor:c=>c.phone},
    {label:"designation",           accessor:c=>c.designation||""},
    {label:"role",                  accessor:c=>c.role},
    {label:"department",            accessor:c=>(c.departments||[]).join("; ")},
    {label:"accountId",             accessor:c=>accounts.find(a=>a.id===c.accountId)?.accountNo||c.accountId||""},
    {label:"primary",               accessor:c=>c.primary?"Yes":"No"},
    {label:"city",                  accessor:c=>c.city||""},
    {label:"state",                 accessor:c=>c.state||""},
    {label:"country",               accessor:c=>c.country||""},
    {label:"pincode",               accessor:c=>c.pincode||""},
    {label:"alternateEmail",        accessor:c=>c.alternateEmail||""},
    {label:"alternatePhone",        accessor:c=>c.alternatePhone||""},
    {label:"linkedInUrl",           accessor:c=>c.linkedInUrl||""},
    {label:"decisionLevel",         accessor:c=>c.decisionLevel||""},
    {label:"influence",             accessor:c=>c.influence||""},
    {label:"category",              accessor:c=>c.category||""},
    {label:"preferredContactMode",  accessor:c=>c.preferredContactMode||""},
    {label:"doNotContact",          accessor:c=>c.doNotContact||"No"},
    {label:"lastContactDate",       accessor:c=>c.lastContactDate||""},
    {label:"source",                accessor:c=>c.source||""},
  ];

  return (
    <div>
      <div className="pg-head">
        <div>
          <div className="pg-title">Contacts</div>
          <div className="pg-sub">{totalContacts} contacts across {uniqueAccounts} accounts</div>
        </div>
        <div className="pg-actions">
          <button className="btn btn-sec" onClick={() => exportCSV(filtered, CSV_COLS, "contacts")}><Download size={14}/>Export</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={14}/>Add Contact</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"14px 18px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.8}}>TOTAL CONTACTS</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>{totalContacts}</div>
          <div style={{fontSize:11,opacity:0.7}}>Across {uniqueAccounts} accounts</div>
        </div>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"14px 18px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.8}}>PRIMARY CONTACTS</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>{primaryContacts}</div>
          <div style={{fontSize:11,opacity:0.7}}>Key decision makers</div>
        </div>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"14px 18px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.8}}>WITH EMAIL</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>{withEmail}</div>
          <div style={{fontSize:11,opacity:0.7}}>{totalContacts > 0 ? Math.round(withEmail/totalContacts*100) : 0}% reachable</div>
        </div>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"14px 18px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em",opacity:0.8}}>AVG PER ACCOUNT</div>
          <div style={{fontSize:26,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>{uniqueAccounts > 0 ? (totalContacts / uniqueAccounts).toFixed(1) : 0}</div>
          <div style={{fontSize:11,opacity:0.7}}>Contact density</div>
        </div>
      </div>

      <div style={{display:"flex",gap:16}}>
        {/* Main table */}
        <div style={{flex:1,minWidth:0}}>
          <div className="filter-bar" style={{flexWrap:"wrap"}}>
            <div className="filter-search"><Search size={14} style={{color:"var(--text3)",flexShrink:0}}/><input placeholder="Search contacts…" value={search} onChange={e => setSearch(e.target.value)}/></div>
            <select className="filter-select" value={accF} onChange={e => setAccF(e.target.value)}><option value="All">All Accounts</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <select className="filter-select" value={deptF} onChange={e => setDeptF(e.target.value)}><option value="All">All Departments</option>{CONTACT_DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}</select>
          </div>

          <BulkActions count={bulk.count} onClear={bulk.clear}
            onDelete={() => { if(window.confirm("Delete " + bulk.count + " contacts?")) { bulk.selected.forEach(id => onDeleteContact(id)); bulk.clear(); }}}
            onExport={() => exportCSV(contacts.filter(c => bulk.isSelected(c.id)), CSV_COLS, "contacts")}/>

          <div className="card" style={{padding:0}}>
            {filtered.length === 0 ? (
              <Empty icon={<Users size={22}/>} title="No contacts found" sub="Try adjusting filters or add a new contact."/>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{width:36}}><input type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll}/></th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("name")}>Contact<SortIcon col="name"/></th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("designation")}>Designation<SortIcon col="designation"/></th>
                    <th>Departments</th>
                    <th style={{cursor:"pointer",userSelect:"none"}} onClick={() => toggleSort("accountId")}>Account<SortIcon col="accountId"/></th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>{pg.paged.map(c => {
                  const acc = accounts.find(a => a.id === c.accountId);
                  return (
                    <tr key={c.id}>
                      <td><input type="checkbox" checked={bulk.isSelected(c.id)} onChange={() => bulk.toggle(c.id)}/></td>
                      <td>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div className="u-av" style={{width:30,height:30,borderRadius:8,fontSize:10}}>{c.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase()}</div>
                          <div>
                            <span style={{fontWeight:600,fontSize:13,color:"var(--brand)",cursor:"pointer"}} onClick={() => setDetail(c)}
                              onMouseEnter={e => e.target.style.textDecoration="underline"} onMouseLeave={e => e.target.style.textDecoration="none"}>{c.name}</span>
                            {c.primary && <Star size={10} style={{color:"#F59E0B",marginLeft:4,verticalAlign:"middle"}}/>}
                            <div style={{fontSize:10,color:"var(--text3)"}}>
                              {c.contactId}
                              {(c.products||[]).length > 0 && ` · ${(c.products||[]).length} products`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{fontSize:12,color:"var(--text2)"}}>{c.designation || c.role || "—"}</td>
                      <td><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{(c.departments||[]).slice(0,2).map(d => <span key={d} style={{fontSize:10,padding:"1px 5px",borderRadius:3,background:"#E0E7FF",color:"#3730A3"}}>{d}</span>)}{(c.departments||[]).length > 2 && <span style={{fontSize:10,color:"var(--text3)"}}>+{(c.departments||[]).length - 2}</span>}</div></td>
                      <td>{acc ? <span style={{fontSize:12,color:"var(--brand)",fontWeight:500}}>{acc.name}</span> : "—"}{acc?.accountNo && <div style={{fontSize:10,color:"var(--text3)",fontFamily:"'Courier New',monospace"}}>{acc.accountNo}</div>}</td>
                      <td>{c.email ? <a href={`mailto:${c.email}`} style={{fontSize:12,color:"var(--blue)",textDecoration:"none"}}>{c.email}</a> : "—"}</td>
                      <td style={{fontSize:12}}>{c.phone || "—"}</td>
                      <td>
                        <div style={{display:"flex",gap:4}}>
                          <button className="icon-btn" onClick={() => openEdit(c)}><Edit2 size={14}/></button>
                          {canDelete && <button className="icon-btn" onClick={() => setConfirm(c.id)}><Trash2 size={14}/></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            )}
            <Pagination {...pg}/>
          </div>
        </div>

        {/* Right: Insights Panel */}
        <div style={{width:260,flexShrink:0}}>
          {/* Department Distribution */}
          <div className="card" style={{padding:16,marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",color:"var(--text3)",letterSpacing:"0.06em",marginBottom:10}}>BY DEPARTMENT</div>
            {deptData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={deptData} cx="50%" cy="50%" innerRadius={25} outerRadius={50} dataKey="value" strokeWidth={2} stroke="white">
                      {deptData.map((s, i) => <Cell key={i} fill={s.color}/>)}
                    </Pie>
                    <Tooltip formatter={(v, name) => [`${v}`, name]}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:4}}>
                  {deptData.slice(0, 6).map(s => (
                    <span key={s.name} style={{fontSize:9,display:"flex",alignItems:"center",gap:2}}>
                      <span style={{width:7,height:7,borderRadius:2,background:s.color,display:"inline-block"}}/>{s.name} ({s.value})
                    </span>
                  ))}
                </div>
              </>
            ) : <div style={{fontSize:12,color:"var(--text3)",textAlign:"center",padding:20}}>No data</div>}
          </div>

          {/* Top Accounts by Contacts */}
          <div className="card" style={{padding:16}}>
            <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",color:"var(--text3)",letterSpacing:"0.06em",marginBottom:10}}>TOP ACCOUNTS</div>
            {(() => {
              const byAcc = {};
              contacts.forEach(c => { if (c.accountId) byAcc[c.accountId] = (byAcc[c.accountId]||0) + 1; });
              return Object.entries(byAcc).sort((a,b) => b[1] - a[1]).slice(0, 6).map(([accId, count]) => {
                const acc = accounts.find(a => a.id === accId);
                return acc ? (
                  <div key={accId} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid var(--border)"}}>
                    <div style={{width:24,height:24,borderRadius:6,background:"#1B6B5A",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:8,fontWeight:700}}>{acc.name?.slice(0,2).toUpperCase()}</div>
                    <div style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:11,fontWeight:500,color:"var(--text1)"}}>{acc.name}</div>
                    <span style={{fontSize:12,fontWeight:800,color:"var(--brand)"}}>{count}</span>
                  </div>
                ) : null;
              });
            })()}
          </div>
        </div>
      </div>

      {/* Contact Detail */}
      {detail && <ContactDetail c={detail} onClose={() => setDetail(null)} onEdit={() => { openEdit(detail); setDetail(null); }} accounts={accounts} opps={opps} activities={activities}/>}

      {/* Add/Edit Modal */}
      {modal && (
        <Modal title={modal.mode === "add" ? "Add Contact" : "Edit Contact"} onClose={() => setModal(null)} footer={<><button className="btn btn-sec" onClick={() => setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}><Check size={14}/>Save Contact</button></>}>
          <div className="form-row"><div className="form-group"><label>Contact ID</label><input value={form.contactId||""} readOnly style={{background:"var(--s1)",fontFamily:"'Courier New',monospace",fontWeight:600,cursor:"default"}}/></div><div className="form-group"><label>Full Name *</label><input value={form.name} onChange={e=>{setForm(f=>({...f,name:e.target.value}));setFormErrors(e=>({...e,name:undefined}));}} placeholder="Full name" style={formErrors.name?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.name}/></div></div>
          <div className="form-row"><div className="form-group"><label>Designation</label><input value={form.designation||""} onChange={e=>setForm(f=>({...f,designation:e.target.value}))} placeholder="VP Cargo, CTO…"/></div><div className="form-group"><label>Department (primary)</label><select value={form.department||""} onChange={e=>setForm(f=>({...f,department:e.target.value}))}><option value="">Select department…</option>{CONTACT_DEPARTMENTS.map(d=><option key={d} value={d}>{d}</option>)}</select></div></div>
          <div className="form-row"><div className="form-group"><label>Account *</label><select value={form.accountId} onChange={e=>{setForm(f=>({...f,accountId:e.target.value}));setFormErrors(e=>({...e,accountId:undefined}));}} style={formErrors.accountId?{borderColor:"#DC2626"}:{}}><option value="">Select account…</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.accountNo ? `${a.accountNo} – ` : ""}{a.name}</option>)}</select><FormError error={formErrors.accountId}/></div><div className="form-group"><label><input type="checkbox" checked={form.primary} onChange={e=>setForm(f=>({...f,primary:e.target.checked}))} style={{marginRight:6}}/>Primary contact for account</label></div></div>
          <div className="form-row"><div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={e=>{setForm(f=>({...f,email:e.target.value}));setFormErrors(e=>({...e,email:undefined}));}} placeholder="email@company.com" style={formErrors.email?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.email}/></div><div className="form-group"><label>Phone</label><input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="+91-98765-00000"/></div></div>
          <div className="form-group">
            <label>Departments (multi-select)</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
              {CONTACT_DEPARTMENTS.map(d => (
                <button key={d} type="button" className="btn btn-xs"
                  style={{background:(form.departments||[]).includes(d)?"#4F46E5":"var(--s3)",color:(form.departments||[]).includes(d)?"white":"var(--text2)",border:"none",cursor:"pointer",fontSize:11}}
                  onClick={() => setForm(f => ({...f, departments:(f.departments||[]).includes(d)?(f.departments||[]).filter(x=>x!==d):[...(f.departments||[]),d]}))}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Products (multi-select)</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
              {PRODUCTS.map(p => (
                <button key={p.id} type="button" className="btn btn-xs"
                  style={{background:(form.products||[]).includes(p.id)?p.color:"var(--s3)",color:(form.products||[]).includes(p.id)?"white":"var(--text2)",border:"none",cursor:"pointer",fontSize:11}}
                  onClick={() => setForm(f => ({...f, products:(f.products||[]).includes(p.id)?(f.products||[]).filter(x=>x!==p.id):[...(f.products||[]),p.id]}))}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Countries (multi-select)</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
              {COUNTRIES.map(ct => (
                <button key={ct} type="button" className="btn btn-xs"
                  style={{background:(form.countries||[]).includes(ct)?"#4F46E5":"var(--s3)",color:(form.countries||[]).includes(ct)?"white":"var(--text2)",border:"none",cursor:"pointer",fontSize:11}}
                  onClick={() => setForm(f => ({...f, countries:(f.countries||[]).includes(ct)?(f.countries||[]).filter(x=>x!==ct):[...(f.countries||[]),ct]}))}>
                  {ct}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
      {confirm && <DeleteConfirm title="Delete Contact" recordLabel={contacts.find(c => c.id === confirm)?.name || "this contact"} onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)}/>}
    </div>
  );
}

export default Contacts;
