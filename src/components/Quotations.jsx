import { useState, useMemo } from "react";
import { Plus, Search, Edit2, Trash2, Check, Download, FileText, Copy, Send, Eye, TrendingUp, BarChart3, Activity } from "lucide-react";
import { PRODUCTS, PROD_MAP, TEAM, TEAM_MAP, QUOTE_STATUSES, TAX_TYPES, TAX_RATES, QUOTE_VALIDITY, STANDARD_TERMS } from '../data/constants';
import { BLANK_QUOTE, BLANK_QUOTE_ITEM } from '../data/seed';
import { fmt, uid, today, sanitizeObj, hasErrors, softDeleteById } from '../utils/helpers';
import { ProdTag, UserPill, Modal, Confirm, FormError, Empty } from './shared';
import Pagination, { usePagination } from './Pagination';
import { exportCSV } from '../utils/csv';

const SECTORS = ["Manufacturing","Logistics","Technology","Energy","Aviation","Government","Services"];

const SECTOR_MAP_FROM_TYPE = {
  "Airline":"Aviation","Airport":"Aviation","Ground Handler":"Aviation",
  "Freight Forwarder":"Logistics","Customs Broker":"Logistics","Exporter/Importer":"Logistics",
  "Government":"Government"
};

const validateQuote = (f) => {
  const errs = {};
  if (!f.title?.trim()) errs.title = "Quote title is required";
  if (!f.accountId) errs.accountId = "Account is required";
  if (f.items.length === 0) errs.items = "At least one line item is required";
  // Negative-value guards on totals + per-line numeric fields
  for (const k of ["subtotal","tax","discount","total"]) {
    const v = f?.[k];
    if (v != null && v !== "" && Number(v) < 0) errs[k] = "Cannot be negative";
  }
  if (Array.isArray(f.items)) {
    const bad = f.items.find(it => Number(it.qty) < 0 || Number(it.unitPrice) < 0 || Number(it.discount) < 0);
    if (bad) errs.items = "Line item quantity / price / discount cannot be negative";
  }
  return errs;
};

const statusColor = s => ({"Draft":"#94A3B8","Sent":"#3B82F6","Under Review":"#F59E0B","Accepted":"#22C55E","Rejected":"#EF4444","Expired":"#DC2626","Revised":"#8B5CF6"}[s]||"#94A3B8");

const statusLabel = s => ({"Under Review":"NEGOTIATION"}[s]||s.toUpperCase());

const statusBadgeStyle = s => {
  const map = {
    "Accepted":  {background:"#22C55E18",color:"#22C55E"},
    "Under Review":{background:"#F59E0B18",color:"#F59E0B"},
    "Sent":      {background:"#3B82F618",color:"#3B82F6"},
    "Draft":     {background:"#94A3B818",color:"#94A3B8"},
    "Rejected":  {background:"#EF444418",color:"#EF4444"},
    "Expired":   {background:"#DC262618",color:"#DC2626"},
    "Revised":   {background:"#8B5CF618",color:"#8B5CF6"},
  };
  return {fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:5,letterSpacing:"0.5px",textTransform:"uppercase",...(map[s]||{background:"#94A3B818",color:"#94A3B8"})};
};

const genQuoteId = (idx, year) => `#FL-${year}-${String(idx).padStart(3,"0")}`;

const formatINR = (crValue) => {
  const inr = Math.round(crValue * 10000000);
  return inr.toLocaleString('en-IN');
};

const getMonthName = (dateStr) => {
  if (!dateStr) return "—";
  const dt = new Date(dateStr);
  return dt.toLocaleDateString("en-IN",{month:"long"});
};

const CSV_COLS = [
  {label:"Quote #",accessor:q=>q._quoteId||q.id},{label:"Title",accessor:q=>q.title},{label:"Customer",accessor:q=>q._accName||""},
  {label:"Sector",accessor:q=>q._sector||""},{label:"Product",accessor:q=>PROD_MAP[q.product]?.name||q.product},
  {label:"Date Sent",accessor:q=>q.sentDate},{label:"Quote Month",accessor:q=>getMonthName(q.sentDate||q.createdDate)},
  {label:"Order Value (INR)",accessor:q=>formatINR(q.total)},{label:"Prob %",accessor:q=>q._prob||0},
  {label:"Status",accessor:q=>q.status},{label:"Version",accessor:q=>`v${q.version}`},
];

/* ── KPI Card ── */
const KpiCard = ({icon,label,value,sub}) => (
  <div style={{background:"#1B6B5A",borderRadius:12,padding:"20px 24px",flex:1,minWidth:200,color:"#fff"}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
      <div style={{background:"rgba(255,255,255,0.15)",borderRadius:8,padding:6,display:"flex",alignItems:"center",justifyContent:"center"}}>{icon}</div>
      <span style={{fontSize:11,fontWeight:700,letterSpacing:"1px",opacity:0.85}}>{label}</span>
    </div>
    <div style={{fontSize:28,fontWeight:800,fontFamily:"'Outfit',sans-serif",lineHeight:1.1}}>{value}</div>
    <div style={{fontSize:12,marginTop:6,opacity:0.75}}>{sub}</div>
  </div>
);

function Quotations({quotes,setQuotes,accounts,contacts,opps,currentUser,orgUsers,canDelete}) {
  const team = orgUsers?.length ? orgUsers.filter(u=>u.status!=='Inactive') : TEAM;
  const [search,setSearch]=useState("");
  const [statusF,setStatusF]=useState("All");
  const [managerF,setManagerF]=useState("All");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState(BLANK_QUOTE);
  const [detail,setDetail]=useState(null);
  const [confirm,setConfirm]=useState(null);
  const [formErrors,setFormErrors]=useState({});
  const [formTab,setFormTab]=useState("details");

  const enriched=useMemo(()=>quotes.map((q,idx)=>{
    const acc=accounts.find(a=>a.id===q.accountId);
    const opp=opps.find(o=>o.id===q.oppId);
    const yr=q.createdDate?new Date(q.createdDate).getFullYear():2024;
    return {
      ...q,
      _accName:acc?.name||"—",
      _sector:SECTOR_MAP_FROM_TYPE[acc?.type]||acc?.type||"Services",
      _quoteId:genQuoteId(idx+1,yr),
      _prob:opp?.probability||({"Draft":20,"Sent":50,"Under Review":65,"Accepted":100,"Rejected":0,"Expired":0,"Revised":30}[q.status]||0),
      _ownerName:TEAM_MAP[q.owner]?.name||"—",
    };
  }),[quotes,accounts,opps]);

  const filtered=useMemo(()=>{
    let list=[...enriched];
    if(statusF!=="All") list=list.filter(q=>q.status===statusF);
    if(managerF!=="All") list=list.filter(q=>q.owner===managerF);
    if(dateFrom) list=list.filter(q=>(q.sentDate||q.createdDate)>=dateFrom);
    if(dateTo) list=list.filter(q=>(q.sentDate||q.createdDate)<=dateTo);
    if(search) list=list.filter(q=>(q.title+q._accName+q.id+q._quoteId+q._sector).toLowerCase().includes(search.toLowerCase()));
    return list.sort((a,b)=>(b.createdDate||"").localeCompare(a.createdDate||""));
  },[enriched,statusF,managerF,dateFrom,dateTo,search]);

  const pg=usePagination(filtered);

  /* ── KPI computations ── */
  const nonDraftQuotes=enriched.filter(q=>q.status!=="Draft");
  const totalQuoteValue=nonDraftQuotes.reduce((s,q)=>s+q.total,0);
  const sentAndReviewedCount=enriched.filter(q=>["Sent","Under Review","Accepted","Rejected"].includes(q.status)).length;
  const acceptedCount=enriched.filter(q=>q.status==="Accepted").length;
  const conversionRate=sentAndReviewedCount>0?((acceptedCount/sentAndReviewedCount)*100).toFixed(1):0;
  const activeQuotes=enriched.filter(q=>["Sent","Under Review","Draft"].includes(q.status)).length;
  const negotiationCount=enriched.filter(q=>q.status==="Under Review").length;

  // Keep old values for backward compat
  const totalValue=quotes.filter(q=>["Sent","Under Review"].includes(q.status)).reduce((s,q)=>s+q.total,0);
  const acceptedValue=quotes.filter(q=>q.status==="Accepted").reduce((s,q)=>s+q.total,0);

  const recalc=(items,taxType,discount)=>{
    const subtotal=items.reduce((s,i)=>s+i.amount,0);
    const rate=TAX_RATES[taxType]||0;
    const taxAmount=+((subtotal-discount)*rate/100).toFixed(2);
    const total=+(subtotal-discount+taxAmount).toFixed(2);
    return {subtotal,taxAmount,total};
  };

  const openAdd=()=>{
    const id=`QT-${String(quotes.length+1).padStart(3,"0")}`;
    setForm({...BLANK_QUOTE,id,owner:currentUser,createdDate:today,items:[]});
    setFormErrors({});setFormTab("details");setModal({mode:"add"});
  };
  const openEdit=(q)=>{setForm({...q,items:[...q.items.map(i=>({...i}))]});setFormErrors({});setFormTab("details");setModal({mode:"edit"});};
  const duplicate=(q)=>{
    const id=`QT-${String(quotes.length+1).padStart(3,"0")}`;
    setQuotes(p=>[...p,{...q,id,status:"Draft",version:q.version+1,createdDate:today,sentDate:"",expiryDate:"",notes:`Revised from ${q.id}. `+q.notes}]);
  };

  const save=()=>{
    const errs=validateQuote(form);
    if(hasErrors(errs)){setFormErrors(errs);return;}
    const totals=recalc(form.items,form.taxType,form.discount);
    const clean=sanitizeObj({...form,...totals});
    if(modal.mode==="add") setQuotes(p=>[...p,{...clean}]);
    else setQuotes(p=>p.map(q=>q.id===clean.id?{...clean}:q));
    setModal(null);setFormErrors({});setDetail(null);
  };
  const del=(id)=>{setQuotes(p=>softDeleteById(p,id,currentUser));setConfirm(null);setDetail(null);};

  const addItem=()=>{setForm(f=>({...f,items:[...f.items,{...BLANK_QUOTE_ITEM}]}));};
  const updateItem=(idx,field,val)=>{
    setForm(f=>{
      const items=[...f.items];
      items[idx]={...items[idx],[field]:val};
      if(field==="qty"||field==="unitPrice") items[idx].amount=items[idx].qty*items[idx].unitPrice;
      const totals=recalc(items,f.taxType,f.discount);
      return {...f,items,...totals};
    });
  };
  const removeItem=(idx)=>{
    setForm(f=>{
      const items=f.items.filter((_,i)=>i!==idx);
      const totals=recalc(items,f.taxType,f.discount);
      return {...f,items,...totals};
    });
  };

  /* ── Unique managers for filter ── */
  const uniqueManagers=useMemo(()=>{
    const ids=[...new Set(quotes.map(q=>q.owner))];
    return ids.map(id=>({id,name:TEAM_MAP[id]?.name||id}));
  },[quotes]);

  return (
    <div>
      {/* ── KPI Summary Cards ── */}
      <div style={{display:"flex",gap:16,marginBottom:24,flexWrap:"wrap"}}>
        <KpiCard
          icon={<TrendingUp size={18} color="#fff"/>}
          label="TOTAL QUOTE VALUE"
          value={`\u20B9 ${totalQuoteValue.toFixed(1)} L`}
          sub={`+14.2% vs last month`}
        />
        <KpiCard
          icon={<BarChart3 size={18} color="#fff"/>}
          label="AVERAGE CONVERSION RATE"
          value={`${conversionRate}%`}
          sub="Industry leading benchmark"
        />
        <KpiCard
          icon={<Activity size={18} color="#fff"/>}
          label="ACTIVE QUOTES"
          value={String(activeQuotes)}
          sub={`${negotiationCount} awaiting negotiation`}
        />
      </div>

      {/* ── Page Header ── */}
      <div className="pg-head">
        <div>
          <div className="pg-title">Quotations Management</div>
          <div className="pg-sub">Manage and track high-value enterprise proposals across sectors.</div>
        </div>
        <div className="pg-actions">
          <button className="btn btn-sec" onClick={()=>exportCSV(filtered,CSV_COLS,"quotations")}><Download size={14}/>Export</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={14}/>New Quote</button>
        </div>
      </div>

      {/* ── Filters Row ── */}
      <div className="filter-bar" style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          <span style={{fontSize:10,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px"}}>STATUS</span>
          <select value={statusF} onChange={e=>setStatusF(e.target.value)} style={{padding:"6px 10px",borderRadius:6,border:"1px solid var(--border)",fontSize:12,minWidth:140,background:"var(--bg)"}}>
            <option value="All">All Statuses</option>
            {QUOTE_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          <span style={{fontSize:10,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px"}}>ACCOUNT MANAGER</span>
          <select value={managerF} onChange={e=>setManagerF(e.target.value)} style={{padding:"6px 10px",borderRadius:6,border:"1px solid var(--border)",fontSize:12,minWidth:160,background:"var(--bg)"}}>
            <option value="All">All Managers</option>
            {uniqueManagers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          <span style={{fontSize:10,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px"}}>DATE RANGE</span>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{padding:"6px 8px",borderRadius:6,border:"1px solid var(--border)",fontSize:12,background:"var(--bg)"}}/>
            <span style={{fontSize:11,color:"var(--text3)"}}>to</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{padding:"6px 8px",borderRadius:6,border:"1px solid var(--border)",fontSize:12,background:"var(--bg)"}}/>
          </div>
        </div>
        <div style={{marginLeft:"auto"}}>
          <div className="filter-search" style={{maxWidth:220}}><Search size={14} style={{color:"var(--text3)",flexShrink:0}}/><input placeholder="Search quotes..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card" style={{padding:0}}>
        {filtered.length===0?<Empty icon={<FileText size={22}/>} title="No quotations" sub="Create your first quote."/>:(
          <table className="tbl">
            <thead><tr>
              <th>QUOTE ID</th>
              <th>CUSTOMER NAME</th>
              <th>SECTOR</th>
              <th>DATE SENT</th>
              <th>QUOTE MONTH</th>
              <th style={{textAlign:"right"}}>ORDER VALUE (INR)</th>
              <th style={{textAlign:"center"}}>PROB (%)</th>
              <th>STATUS</th>
              <th></th>
            </tr></thead>
            <tbody>{pg.paged.map(q=>(
              <tr key={q.id}>
                <td style={{fontWeight:600,fontSize:13,color:"var(--brand)"}}>{q._quoteId}</td>
                <td><span className="tbl-link" onClick={()=>setDetail(q)}>{q._accName}</span></td>
                <td style={{fontSize:12}}><span style={{background:"var(--s2)",padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:500}}>{q._sector}</span></td>
                <td style={{fontSize:12,color:"var(--text2)"}}>{q.sentDate?fmt.date(q.sentDate):"—"}</td>
                <td style={{fontSize:12,color:"var(--text2)"}}>{getMonthName(q.sentDate||q.createdDate)}</td>
                <td style={{fontFamily:"'Outfit',sans-serif",fontWeight:700,textAlign:"right",fontSize:13}}>{formatINR(q.total)}</td>
                <td style={{textAlign:"center"}}><span style={{fontWeight:600,fontSize:12,color:q._prob>=70?"#22C55E":q._prob>=40?"#F59E0B":"#EF4444"}}>{q._prob}%</span></td>
                <td><span style={statusBadgeStyle(q.status)}>{statusLabel(q.status)}</span></td>
                <td><div style={{display:"flex",gap:4}}>
                  <button className="icon-btn" title="View" onClick={()=>setDetail(q)}><Eye size={14}/></button>
                  <button className="icon-btn" title="Edit" onClick={()=>openEdit(q)}><Edit2 size={14}/></button>
                  <button className="icon-btn" title="Duplicate/Revise" onClick={()=>duplicate(q)}><Copy size={14}/></button>
                  {canDelete&&<button className="icon-btn" title="Delete" onClick={()=>setConfirm(q.id)}><Trash2 size={14}/></button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <Pagination {...pg}/>
      </div>

      {/* Detail Modal */}
      {detail&&(
        <Modal title={`${detail._quoteId} – ${detail.title}`} onClose={()=>setDetail(null)} lg footer={<><button className="btn btn-sec btn-sm" onClick={()=>setDetail(null)}>Close</button><button className="btn btn-primary btn-sm" onClick={()=>{openEdit(detail);setDetail(null);}}><Edit2 size={13}/>Edit</button></>}>
          <div className="dp-grid">
            {[["Quote ID",detail._quoteId],["Account",detail._accName],["Sector",detail._sector],["Product",PROD_MAP[detail.product]?.name||detail.product],["Status",detail.status],["Probability",`${detail._prob}%`],["Version",`v${detail.version}`],["Created",fmt.date(detail.createdDate)],["Sent",detail.sentDate?fmt.date(detail.sentDate):"—"],["Expiry",detail.expiryDate?fmt.date(detail.expiryDate):"—"],["Validity",detail.validity],["Owner",TEAM_MAP[detail.owner]?.name||"—"]].map(([k,v])=><div key={k} className="dp-row"><span className="dp-key">{k}</span><span className="dp-val">{v}</span></div>)}
          </div>
          <div style={{marginTop:16}}><div style={{fontSize:12,fontWeight:700,color:"var(--text3)",marginBottom:8}}>LINE ITEMS</div>
            <table className="tbl"><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
              <tbody>{detail.items.map((item,i)=><tr key={i}><td style={{fontSize:12.5}}>{item.description}</td><td>{item.qty}</td><td>₹{item.unitPrice}L</td><td style={{fontWeight:600}}>₹{item.amount}L</td></tr>)}</tbody>
            </table>
          </div>
          <div style={{marginTop:12,textAlign:"right",fontSize:13}}>
            <div>Subtotal: <strong>₹{detail.subtotal}L</strong></div>
            {detail.discount>0&&<div>Discount: <strong>-₹{detail.discount}L</strong></div>}
            <div>Tax ({detail.taxType}): <strong>₹{detail.taxAmount}L</strong></div>
            <div style={{fontSize:16,fontWeight:700,color:"var(--brand)",marginTop:4}}>Total: ₹{detail.total}L ({formatINR(detail.total)} INR)</div>
          </div>
          {detail.terms&&<div style={{marginTop:14,background:"var(--s2)",padding:"10px 12px",borderRadius:8,borderLeft:"3px solid var(--brand)",fontSize:12,color:"var(--text2)",whiteSpace:"pre-line"}}><strong>Terms:</strong><br/>{detail.terms}</div>}
          {detail.notes&&<div style={{marginTop:8,fontSize:12,color:"var(--text3)"}}><strong>Notes:</strong> {detail.notes}</div>}
        </Modal>
      )}

      {/* Add/Edit Modal */}
      {modal&&(
        <Modal title={modal.mode==="add"?"New Quotation":"Edit Quotation"} onClose={()=>{setModal(null);setFormErrors({});setForm(BLANK_QUOTE);}} lg footer={<><button className="btn btn-sec" onClick={()=>{setModal(null);setFormErrors({});setForm(BLANK_QUOTE);}}>Cancel</button><button className="btn btn-primary" onClick={save}><Check size={14}/>Save Quote</button></>}>
          <div className="modal-tabs">
            {["details","items","terms"].map(t=><div key={t} className={`modal-tab${formTab===t?" active":""}`} onClick={()=>setFormTab(t)}>{t==="details"?"Details":t==="items"?`Items (${form.items.length})`:"Terms"}</div>)}
          </div>

          {formTab==="details"&&(<div>
            <div className="form-row full"><div className="form-group"><label>Quote Title *</label><input value={form.title} onChange={e=>{setForm(f=>({...f,title:e.target.value}));setFormErrors(e=>({...e,title:undefined}));}} placeholder="e.g. WiseHandling Deploy – Colossal Avia" style={formErrors.title?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.title}/></div></div>
            <div className="form-row"><div className="form-group"><label>Account *</label><select value={form.accountId} onChange={e=>{setForm(f=>({...f,accountId:e.target.value}));setFormErrors(e=>({...e,accountId:undefined}));}} style={formErrors.accountId?{borderColor:"#DC2626"}:{}}><option value="">Select...</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><FormError error={formErrors.accountId}/></div>
              <div className="form-group"><label>Contact</label><select value={form.contactId} onChange={e=>setForm(f=>({...f,contactId:e.target.value}))}><option value="">Select...</option>{contacts.filter(c=>!form.accountId||c.accountId===form.accountId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            </div>
            <div className="form-row"><div className="form-group"><label>Opportunity</label><select value={form.oppId} onChange={e=>setForm(f=>({...f,oppId:e.target.value}))}><option value="">None</option>{opps.filter(o=>!form.accountId||o.accountId===form.accountId).map(o=><option key={o.id} value={o.id}>{o.title}</option>)}</select></div>
              <div className="form-group"><label>Product</label><select value={form.product} onChange={e=>setForm(f=>({...f,product:e.target.value}))}>{PRODUCTS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
            </div>
            <div className="form-row three"><div className="form-group"><label>Status</label><select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{QUOTE_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
              <div className="form-group"><label>Validity</label><select value={form.validity} onChange={e=>setForm(f=>({...f,validity:e.target.value}))}>{QUOTE_VALIDITY.map(v=><option key={v}>{v}</option>)}</select></div>
              <div className="form-group"><label>Owner</label><select value={form.owner} onChange={e=>setForm(f=>({...f,owner:e.target.value}))}>{team.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            </div>
            <div className="form-row"><div className="form-group"><label>Sent Date</label><input type="date" value={form.sentDate} onChange={e=>setForm(f=>({...f,sentDate:e.target.value}))}/></div>
              <div className="form-group"><label>Expiry Date</label><input type="date" value={form.expiryDate} onChange={e=>setForm(f=>({...f,expiryDate:e.target.value}))}/></div>
            </div>
            <div className="form-group"><label>Notes</label><textarea rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Internal notes..." style={{width:"100%",resize:"vertical"}}/></div>
          </div>)}

          {formTab==="items"&&(<div>
            <FormError error={formErrors.items}/>
            {form.items.map((item,i)=>(
              <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 60px 80px 80px 30px",gap:8,alignItems:"end",marginBottom:8}}>
                <div className="form-group"><label>{i===0?"Description":""}</label><input value={item.description} onChange={e=>updateItem(i,"description",e.target.value)} placeholder="Line item description"/></div>
                <div className="form-group"><label>{i===0?"Qty":""}</label><input type="number" min={1} value={item.qty} onChange={e=>updateItem(i,"qty",+e.target.value)}/></div>
                <div className="form-group"><label>{i===0?"Price(L)":""}</label><input type="number" min={0} step={0.5} value={item.unitPrice} onChange={e=>updateItem(i,"unitPrice",+e.target.value)}/></div>
                <div className="form-group"><label>{i===0?"Amount":""}</label><input disabled value={`₹${item.amount}`} style={{background:"var(--s2)"}}/></div>
                <button className="icon-btn" style={{marginBottom:4}} onClick={()=>removeItem(i)}><Trash2 size={13}/></button>
              </div>
            ))}
            <button className="btn btn-sec btn-sm" onClick={addItem} style={{marginTop:4}}><Plus size={13}/>Add Line Item</button>
            <div style={{marginTop:16,borderTop:"1px solid var(--border)",paddingTop:12}}>
              <div className="form-row three">
                <div className="form-group"><label>Tax Type</label><select value={form.taxType} onChange={e=>{const t=e.target.value;setForm(f=>{const totals=recalc(f.items,t,f.discount);return{...f,taxType:t,...totals};});}}>{TAX_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                <div className="form-group"><label>Discount (₹L)</label><input type="number" min={0} step={0.5} value={form.discount} onChange={e=>{const d=+e.target.value;setForm(f=>{const totals=recalc(f.items,f.taxType,d);return{...f,discount:d,...totals};});}}/></div>
                <div style={{textAlign:"right",paddingTop:20}}>
                  <div style={{fontSize:12}}>Subtotal: ₹{form.subtotal}L</div>
                  <div style={{fontSize:12}}>Tax: ₹{form.taxAmount}L</div>
                  <div style={{fontSize:16,fontWeight:700,color:"var(--brand)"}}>Total: ₹{form.total}L</div>
                </div>
              </div>
            </div>
          </div>)}

          {formTab==="terms"&&(<div>
            <div className="form-group"><label>Terms & Conditions</label>
              <textarea rows={8} value={form.terms} onChange={e=>setForm(f=>({...f,terms:e.target.value}))} placeholder="Enter terms..." style={{width:"100%",resize:"vertical",fontFamily:"monospace",fontSize:12}}/>
            </div>
            <div style={{marginTop:8}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:6}}>STANDARD TERMS (click to add)</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {STANDARD_TERMS.map((t,i)=><button key={i} className="btn btn-sec btn-xs" style={{fontSize:10,maxWidth:300,textAlign:"left",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}} onClick={()=>setForm(f=>({...f,terms:f.terms?(f.terms+"\n"+t):t}))}>{t.substring(0,50)}...</button>)}
              </div>
            </div>
          </div>)}
        </Modal>
      )}
      {confirm&&<Confirm title="Delete Quote" msg="Remove this quotation permanently?" onConfirm={()=>del(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
export default Quotations;
