import { useState, useMemo } from "react";
import { Plus, Search, Edit2, Trash2, Check, Bug, Clock, AlertCircle, Download } from "lucide-react";
import { PRODUCTS, PROD_MAP, TICKET_TYPES, TICKET_STATUSES, PRIORITIES, TEAM, TEAM_MAP } from '../data/constants';
import { BLANK_TKT } from '../data/seed';
import { uid, fmt, today, isOverdue, sanitizeObj, validateTicket, hasErrors, softDeleteById } from '../utils/helpers';
import { StatusBadge, PriorityBadge, ProdTag, UserPill, Modal, Confirm, FormError } from './shared';
import Pagination, { usePagination } from './Pagination';
import BulkActions, { useBulkSelect } from './BulkActions';
import { exportCSV } from '../utils/csv';

function Tickets({tickets,setTickets,accounts,orgUsers,currentUser}) {
  const team = orgUsers?.length ? orgUsers.filter(u => u.status !== 'Inactive') : TEAM;
  const [tabS,setTabS]=useState("Open");
  const [search,setSearch]=useState("");
  const [prodF,setProdF]=useState("All");
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState(BLANK_TKT);
  const [detail,setDetail]=useState(null);
  const [confirm,setConfirm]=useState(null);
  const [formErrors,setFormErrors]=useState({});

  const STATUS_GROUPS={Open:["Open"],Active:["In Progress","Pending QA","Pending Customer"],Resolved:["Resolved","Closed"]};
  const inTab=s=>STATUS_GROUPS[tabS]?.includes(s)||tabS==="All";

  const filtered=useMemo(()=>[...tickets].filter(t=>{
    if(!inTab(t.status)) return false;
    if(prodF!=="All"&&t.product!==prodF) return false;
    if(search&&!t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a,b)=>{
    const po={Critical:0,High:1,Medium:2,Low:3};
    return (po[a.priority]||4)-(po[b.priority]||4);
  }),[tickets,tabS,prodF,search]);

  const openAdd=()=>{setForm({...BLANK_TKT,id:`TK-${String(tickets.length+1).padStart(3,"0")}`});setFormErrors({});setModal({mode:"add"});};
  const save=()=>{
    const errs = validateTicket(form);
    if(hasErrors(errs)){ setFormErrors(errs); return; }
    const clean = sanitizeObj(form);
    if(modal.mode==="add") setTickets(p=>[...p,{...clean,created:today}]);
    else setTickets(p=>p.map(t=>t.id===clean.id?{...clean}:t));
    setModal(null);setDetail(null);setFormErrors({});
  };
  const del=id=>{setTickets(p=>softDeleteById(p,id,currentUser));setConfirm(null);setDetail(null);};
  const OPEN=tickets.filter(t=>!["Resolved","Closed"].includes(t.status)).length;
  const pg = usePagination(filtered);
  const bulk = useBulkSelect(filtered);

  const CSV_COLS = [
    {label:"ticketNo",       accessor:t=>t.ticketNo||t.id||""},
    {label:"title",          accessor:t=>t.title},
    {label:"accountId",      accessor:t=>t.accountId||""},
    {label:"product",        accessor:t=>t.product},
    {label:"type",           accessor:t=>t.type},
    {label:"category",       accessor:t=>t.category||""},
    {label:"priority",       accessor:t=>t.priority},
    {label:"severity",       accessor:t=>t.severity||""},
    {label:"status",         accessor:t=>t.status},
    {label:"description",    accessor:t=>t.description||""},
    {label:"reportedBy",     accessor:t=>t.reportedBy||""},
    {label:"reportedDate",   accessor:t=>t.reportedDate||""},
    {label:"environment",    accessor:t=>t.environment||""},
    {label:"affectedModule", accessor:t=>t.affectedModule||""},
    {label:"assigned",       accessor:t=>t.assigned||""},
    {label:"sla",            accessor:t=>t.sla||""},
    {label:"resolvedDate",   accessor:t=>t.resolvedDate||""},
    {label:"internalNotes",  accessor:t=>t.internalNotes||""},
    {label:"tags",           accessor:t=>t.tags||""},
  ];

  return (
    <div>
      <div className="pg-head">
        <div><div className="pg-title">Support Tickets</div><div className="pg-sub">{OPEN} open · {tickets.filter(t=>t.priority==="Critical"&&!["Resolved","Closed"].includes(t.status)).length} critical</div></div>
        <div className="pg-actions"><button className="btn btn-sec" onClick={()=>exportCSV(filtered,CSV_COLS,"tickets")}><Download size={14}/>Export</button><button className="btn btn-primary" onClick={openAdd}><Plus size={14}/>New Ticket</button></div>
      </div>
      <div className="filter-bar">
        {["All","Open","Active","Resolved"].map(t=><button key={t} className={`btn btn-sm ${tabS===t?"btn-primary":"btn-sec"}`} onClick={()=>setTabS(t)}>{t}</button>)}
        <div className="filter-search" style={{maxWidth:220}}><Search size={14} style={{color:"var(--text3)",flexShrink:0}}/><input placeholder="Search tickets…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <select className="filter-select" value={prodF} onChange={e=>setProdF(e.target.value)}><option>All</option>{PRODUCTS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      <BulkActions count={bulk.count} onClear={bulk.clear}
        onDelete={()=>setConfirm({bulk:true,ids:[...bulk.selected]})}
        onExport={()=>exportCSV(tickets.filter(t=>bulk.isSelected(t.id)),CSV_COLS,"tickets")}/>
      <div className="card" style={{padding:0}}>
        <table className="tbl">
          <thead><tr><th style={{width:36}}><input type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll}/></th><th>Ticket</th><th>Product</th><th>Type</th><th>Priority</th><th>Status</th><th>Assigned</th><th>SLA</th><th></th></tr></thead>
          <tbody>{pg.paged.map(t=>{
            const overdue=t.sla&&t.sla<today&&!["Resolved","Closed"].includes(t.status);
            return (
              <tr key={t.id}>
                <td><input type="checkbox" checked={bulk.isSelected(t.id)} onChange={()=>bulk.toggle(t.id)}/></td>
                <td><span className="tbl-link" onClick={()=>setDetail(t)}>{t.id}</span><div style={{fontSize:12,color:"var(--text2)",maxWidth:300}}>{t.title}</div></td>
                <td><ProdTag pid={t.product}/></td>
                <td style={{fontSize:11.5,color:"var(--text3)"}}>{t.type}</td>
                <td><PriorityBadge priority={t.priority}/></td>
                <td><StatusBadge status={t.status}/></td>
                <td><UserPill uid={t.assigned}/></td>
                <td style={{fontSize:12,color:overdue?"var(--red)":"var(--text3)",fontWeight:overdue?700:400}}>{fmt.date(t.sla)}{overdue&&" ⚠"}</td>
                <td><div style={{display:"flex",gap:4}}><button className="icon-btn" onClick={()=>{setForm({...t});setModal({mode:"edit"});}}><Edit2 size={14}/></button><button className="icon-btn" onClick={()=>setConfirm(t.id)}><Trash2 size={14}/></button></div></td>
              </tr>
            );
          })}</tbody>
        </table>
        <Pagination {...pg} />
      </div>
      {detail&&(
        <Modal title={`${detail.id} – ${detail.title}`} onClose={()=>setDetail(null)} lg footer={<><button className="btn btn-sec btn-sm" onClick={()=>setDetail(null)}>Close</button><button className="btn btn-primary btn-sm" onClick={()=>{setForm({...detail});setModal({mode:"edit"});setDetail(null);}}><Edit2 size={13}/>Edit</button></>}>
          <div className="dp-grid">
            {[["Product",<ProdTag pid={detail.product}/>],["Priority",<PriorityBadge priority={detail.priority}/>],["Status",<StatusBadge status={detail.status}/>],["Type",detail.type],["Assigned",TEAM_MAP[detail.assigned]?.name||"—"],["SLA",fmt.date(detail.sla)],["Created",fmt.date(detail.created)],["Account",accounts.find(a=>a.id===detail.accountId)?.name||"—"]].map(([k,v])=><div key={k} className="dp-row"><span className="dp-key">{k}</span><span className="dp-val">{v}</span></div>)}
          </div>
          {detail.description&&<div style={{marginTop:14,background:"var(--s2)",padding:"12px 14px",borderRadius:8,fontSize:13,color:"var(--text2)",lineHeight:1.6}}>{detail.description}</div>}
        </Modal>
      )}
      {modal&&(
        <Modal title={modal.mode==="add"?"New Ticket":"Edit Ticket"} onClose={()=>setModal(null)} lg footer={<><button className="btn btn-sec" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={save}><Check size={14}/>Save Ticket</button></>}>
          <div className="form-row full"><div className="form-group"><label>Title *</label><input value={form.title} onChange={e=>{setForm(f=>({...f,title:e.target.value}));setFormErrors(e=>({...e,title:undefined}));}} placeholder="Brief description of the issue or request" style={formErrors.title?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.title}/></div></div>
          <div className="form-row"><div className="form-group"><label>Account *</label><select value={form.accountId} onChange={e=>{setForm(f=>({...f,accountId:e.target.value}));setFormErrors(e=>({...e,accountId:undefined}));}} style={formErrors.accountId?{borderColor:"#DC2626"}:{}}><option value="">Select account…</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><FormError error={formErrors.accountId}/></div><div className="form-group"><label>Product</label><select value={form.product} onChange={e=>setForm(f=>({...f,product:e.target.value}))}>{PRODUCTS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div></div>
          <div className="form-row"><div className="form-group"><label>Type</label><select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{TICKET_TYPES.map(t=><option key={t}>{t}</option>)}</select></div><div className="form-group"><label>Priority</label><select value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select></div></div>
          <div className="form-row"><div className="form-group"><label>Status</label><select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{TICKET_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div><div className="form-group"><label>Assigned To</label><select value={form.assigned} onChange={e=>setForm(f=>({...f,assigned:e.target.value}))}>{team.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div></div>
          <div className="form-row"><div className="form-group"><label>SLA Date</label><input type="date" value={form.sla} onChange={e=>setForm(f=>({...f,sla:e.target.value}))}/></div></div>
          <div className="form-group"><label>Description *</label><textarea value={form.description} onChange={e=>{setForm(f=>({...f,description:e.target.value}));setFormErrors(e=>({...e,description:undefined}));}} rows={4} placeholder="Detailed description, reproduction steps, impact…" style={formErrors.description?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.description}/></div>
        </Modal>
      )}
      {confirm&&typeof confirm==="object"&&confirm.bulk&&(
        <Confirm title="Delete Tickets" msg={`Remove ${confirm.ids.length} ticket${confirm.ids.length>1?"s":""}?`}
          onConfirm={()=>{ confirm.ids.forEach(id=>setTickets(p=>softDeleteById(p,id,currentUser))); bulk.clear(); setConfirm(null); }}
          onCancel={()=>setConfirm(null)}/>
      )}
      {confirm&&typeof confirm!=="object"&&<Confirm title="Delete Ticket" msg="Remove this ticket permanently?" onConfirm={()=>del(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}

export default Tickets;
