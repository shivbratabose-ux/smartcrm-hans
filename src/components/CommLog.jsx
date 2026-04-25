import { useState, useMemo } from "react";
import { Plus, Search, Edit2, Trash2, Check, Download, Mail, MessageSquare, Send, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { TEAM, TEAM_MAP, COMM_TYPES, COMM_STATUSES } from '../data/constants';
import { BLANK_COMM_LOG } from '../data/seed';
import { fmt, uid, today, sanitizeObj, hasErrors, softDeleteById } from '../utils/helpers';
import { UserPill, Modal, Confirm, FormError, Empty, TypeaheadSelect } from './shared';
import Pagination, { usePagination } from './Pagination';
import { exportCSV } from '../utils/csv';

const TYPE_ICON={"Email Sent":<ArrowUpRight size={13}/>,"Email Received":<ArrowDownLeft size={13}/>,"WhatsApp Sent":<Send size={13}/>,"WhatsApp Received":<ArrowDownLeft size={13}/>,"SMS Sent":<Send size={13}/>,"SMS Received":<ArrowDownLeft size={13}/>,"Letter Sent":<Mail size={13}/>};
const TYPE_COL={"Email Sent":"var(--blue)","Email Received":"var(--green)","WhatsApp Sent":"#25D366","WhatsApp Received":"#128C7E","SMS Sent":"var(--amber)","SMS Received":"var(--orange)","Letter Sent":"var(--purple)"};

const CSV_COLS = [
  {label:"Type",accessor:c=>c.type},{label:"Subject",accessor:c=>c.subject},{label:"From",accessor:c=>c.from},
  {label:"To",accessor:c=>c.to},{label:"Date",accessor:c=>c.date},{label:"Status",accessor:c=>c.status},
  {label:"Account",accessor:c=>c._accName||""},{label:"Owner",accessor:c=>TEAM_MAP[c.owner]?.name||""},
];

function CommLog({commLogs,setCommLogs,accounts,contacts,opps,currentUser,canDelete}) {
  const [search,setSearch]=useState("");
  const [typeF,setTypeF]=useState("All");
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState(BLANK_COMM_LOG);
  const [detail,setDetail]=useState(null);
  const [confirm,setConfirm]=useState(null);
  const [formErrors,setFormErrors]=useState({});

  const enriched=useMemo(()=>commLogs.map(c=>({...c,_accName:accounts.find(a=>a.id===c.accountId)?.name||"—"})),[commLogs,accounts]);
  const filtered=useMemo(()=>{
    let list=[...enriched];
    if(typeF!=="All") list=list.filter(c=>c.type===typeF);
    if(search) list=list.filter(c=>(c.subject+c.from+c.to+c.body).toLowerCase().includes(search.toLowerCase()));
    return list.sort((a,b)=>b.date.localeCompare(a.date));
  },[enriched,typeF,search]);

  const pg=usePagination(filtered);
  const emailCount=commLogs.filter(c=>c.type.includes("Email")).length;
  const waCount=commLogs.filter(c=>c.type.includes("WhatsApp")).length;

  const openAdd=(type)=>{
    const user=TEAM_MAP[currentUser];
    setForm({...BLANK_COMM_LOG,id:`cm${uid()}`,type:type||"Email Sent",from:user?.email||"",date:today+" "+new Date().toTimeString().slice(0,5),owner:currentUser});
    setFormErrors({});setModal({mode:"add"});
  };
  const openEdit=(c)=>{setForm({...c});setFormErrors({});setModal({mode:"edit"});};
  const save=()=>{
    const errs={};
    if(!form.subject?.trim()) errs.subject="Subject is required";
    if(!form.to?.trim()) errs.to="Recipient is required";
    if(hasErrors(errs)){setFormErrors(errs);return;}
    const clean=sanitizeObj(form);
    if(modal.mode==="add") setCommLogs(p=>[...p,{...clean}]);
    else setCommLogs(p=>p.map(c=>c.id===clean.id?{...clean}:c));
    setModal(null);setFormErrors({});
  };
  const del=(id)=>{setCommLogs(p=>softDeleteById(p,id,currentUser));setConfirm(null);setDetail(null);};

  return (
    <div>
      <div className="pg-head">
        <div><div className="pg-title">Communications</div>
          <div className="pg-sub">{commLogs.length} total · {emailCount} emails · {waCount} WhatsApp</div>
        </div>
        <div className="pg-actions">
          <button className="btn btn-sec" onClick={()=>exportCSV(filtered,CSV_COLS,"communications")}><Download size={14}/>Export</button>
          <button className="btn btn-blue" onClick={()=>openAdd("Email Sent")}><Mail size={14}/>Log Email</button>
          <button className="btn btn-green" onClick={()=>openAdd("WhatsApp Sent")}><MessageSquare size={14}/>Log WhatsApp</button>
        </div>
      </div>

      <div className="filter-bar">
        <select className="filter-select" value={typeF} onChange={e=>setTypeF(e.target.value)}>
          <option value="All">All Types</option>
          {COMM_TYPES.map(t=><option key={t}>{t}</option>)}
        </select>
        <div className="filter-search" style={{maxWidth:280}}><Search size={14} style={{color:"var(--text3)",flexShrink:0}}/><input placeholder="Search subject, from, to..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
      </div>

      <div className="card" style={{padding:0}}>
        {filtered.length===0?<Empty icon={<Mail size={22}/>} title="No communications" sub="Log your first email or WhatsApp message."/>:(
          <table className="tbl">
            <thead><tr><th style={{width:32}}></th><th>Type</th><th>Subject</th><th>From / To</th><th>Account</th><th>Date</th><th>Status</th><th>Owner</th><th></th></tr></thead>
            <tbody>{pg.paged.map(c=>{
              const col=TYPE_COL[c.type]||"var(--text3)";
              const isInbound=c.type.includes("Received");
              return <tr key={c.id}>
                <td style={{color:col}}>{TYPE_ICON[c.type]}</td>
                <td><span style={{fontSize:11,fontWeight:600,padding:"2px 7px",borderRadius:5,background:col+"18",color:col}}>{c.type}</span></td>
                <td><span className="tbl-link" onClick={()=>setDetail(c)} style={{fontWeight:600,fontSize:12.5}}>{c.subject}</span></td>
                <td style={{fontSize:12}}>
                  <div>{isInbound?"From":"To"}: <strong>{isInbound?c.from:c.to}</strong></div>
                </td>
                <td style={{fontSize:12}}>{c._accName}</td>
                <td style={{fontSize:12,color:"var(--text3)"}}>{c.date}</td>
                <td><span className={`badge ${c.status==="Delivered"||c.status==="Read"?"bs-active":c.status==="Bounced"||c.status==="Failed"?"bs-lost":"bs-planned"}`}>{c.status}</span></td>
                <td><UserPill uid={c.owner}/></td>
                <td><div style={{display:"flex",gap:4}}><button className="icon-btn" aria-label="Edit" onClick={()=>openEdit(c)}><Edit2 size={14}/></button>{canDelete&&<button className="icon-btn" aria-label="Delete" onClick={()=>setConfirm(c.id)}><Trash2 size={14}/></button>}</div></td>
              </tr>;
            })}</tbody>
          </table>
        )}
        <Pagination {...pg}/>
      </div>

      {detail&&(
        <Modal title={detail.subject} onClose={()=>setDetail(null)} lg footer={<button className="btn btn-sec btn-sm" onClick={()=>setDetail(null)}>Close</button>}>
          <div className="dp-grid">
            {[["Type",detail.type],["From",detail.from],["To",detail.to],["Date",detail.date],["Status",detail.status],["Account",detail._accName],["Owner",TEAM_MAP[detail.owner]?.name||"—"]].map(([k,v])=><div key={k} className="dp-row"><span className="dp-key">{k}</span><span className="dp-val">{v}</span></div>)}
          </div>
          {detail.body&&<div style={{marginTop:14,background:"var(--s2)",padding:"12px 14px",borderRadius:8,fontSize:13,color:"var(--text2)",lineHeight:1.6,whiteSpace:"pre-line"}}>{detail.body}</div>}
        </Modal>
      )}

      {modal&&(
        <Modal title={modal.mode==="add"?"Log Communication":"Edit Communication"} onClose={()=>{setModal(null);setFormErrors({});setForm(BLANK_COMM_LOG);}} lg footer={<><button className="btn btn-sec" onClick={()=>{setModal(null);setFormErrors({});setForm(BLANK_COMM_LOG);}}>Cancel</button><button className="btn btn-primary" onClick={save}><Check size={14}/>Save</button></>}>
          <div className="form-row">
            <div className="form-group"><label>Type</label><select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{COMM_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
            <div className="form-group"><label>Status</label><select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{COMM_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
          </div>
          <div className="form-row full"><div className="form-group"><label>Subject *</label><input value={form.subject} onChange={e=>{setForm(f=>({...f,subject:e.target.value}));setFormErrors(e=>({...e,subject:undefined}));}} placeholder="Email subject or message topic" style={formErrors.subject?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.subject}/></div></div>
          <div className="form-row">
            <div className="form-group"><label>From</label><input value={form.from} onChange={e=>setForm(f=>({...f,from:e.target.value}))} placeholder="sender@email.com"/></div>
            <div className="form-group"><label>To *</label><input value={form.to} onChange={e=>{setForm(f=>({...f,to:e.target.value}));setFormErrors(e=>({...e,to:undefined}));}} placeholder="recipient@email.com" style={formErrors.to?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.to}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Account</label>
              <TypeaheadSelect
                value={form.accountId}
                onChange={(id) => setForm(f => ({...f, accountId: id}))}
                options={accounts.map(a => ({ value: a.id, label: a.name, sub: a.country || a.type || "" }))}
                placeholder="Search accounts…"
              />
            </div>
            <div className="form-group"><label>Contact</label>
              <TypeaheadSelect
                value={form.contactId}
                onChange={(id) => setForm(f => ({...f, contactId: id}))}
                options={contacts.filter(c => !form.accountId || c.accountId === form.accountId).map(c => ({ value: c.id, label: c.name, sub: c.designation || c.role || "" }))}
                placeholder="Search contacts…"
              />
            </div>
          </div>
          <div className="form-group"><label>Date & Time</label><input value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} placeholder="2026-03-21 10:30"/></div>
          <div className="form-group"><label>Message Body</label><textarea rows={5} value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} placeholder="Full message content..." style={{width:"100%",resize:"vertical"}}/></div>
        </Modal>
      )}
      {confirm&&<Confirm title="Delete Communication" msg="Remove this log?" onConfirm={()=>del(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
export default CommLog;
