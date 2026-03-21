import React, { useEffect, useState } from "react";
import { X, Send, FileText, Check, Paperclip } from "lucide-react";
import { PROD_MAP, TEAM_MAP, FILE_TYPES } from "../data/constants";
import { fmt, uid, today } from "../utils/helpers";

export function StatusBadge({status}) {
  const s = (status||"").toLowerCase().replace(/\s+/g,"-");
  const cls = {
    "active":"bs-active","won":"bs-won","prospect":"bs-prospect",
    "negotiation":"bs-negotiation","proposal":"bs-proposal",
    "demo":"bs-demo","qualified":"bs-demo","lost":"bs-lost",
    "in-progress":"bs-pending","pending-qa":"bs-review",
    "pending-customer":"bs-review","resolved":"bs-active",
    "closed":"bs-closed","open":"bs-prospect",
    "planned":"bs-planned","completed":"bs-completed","cancelled":"bs-cancelled",
  }[s]||"bs-closed";
  return <span className={`badge ${cls}`}>{status}</span>;
}
export function PriorityBadge({priority}) {
  const cls={Critical:"bp-critical",High:"bp-high",Medium:"bp-medium",Low:"bp-low"}[priority]||"bp-low";
  return <span className={`badge-pill ${cls}`}>{priority}</span>;
}
export function ProdTag({pid}) {
  const p=PROD_MAP[pid];
  if(!p) return <span className="badge-pill" style={{background:"#F3F5F7",color:"#4A6070"}}>{pid}</span>;
  return <span className="prod-tag" style={{background:p.bg,color:p.text}}>{p.name}</span>;
}
export function UserPill({uid:u}) {
  const user=TEAM_MAP[u]; if(!user) return null;
  return <span className="u-pill"><span className="u-av">{user.initials}</span><span className="u-name">{user.name}</span></span>;
}
export function Modal({title,onClose,children,footer,lg}) {
  useEffect(() => {
    const handleKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className={`modal${lg?" modal-lg":""}`}>
        <div className="modal-head">
          <div className="modal-title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18}/></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer&&<div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
export function Confirm({title,msg,onConfirm,onCancel}) {
  return (
    <Modal title={title} onClose={onCancel} footer={<><button className="btn btn-sec btn-sm" onClick={onCancel}>Cancel</button><button className="btn btn-danger btn-sm" onClick={onConfirm}>Delete</button></>}>
      <p style={{color:"var(--text2)",fontSize:13}}>{msg}</p>
    </Modal>
  );
}
export function Empty({icon,title,sub}) {
  return <div className="empty"><div className="empty-icon">{icon}</div><div className="empty-title">{title}</div><div className="empty-sub">{sub}</div></div>;
}
export function FormError({error}) {
  if (!error) return null;
  return <div style={{color:"#DC2626",fontSize:11,marginTop:3,fontWeight:500}}>{error}</div>;
}

// ═══════════════════════════════════════════════════════════════════
// NOTES THREAD (reusable on Account/Opp detail)
// ═══════════════════════════════════════════════════════════════════
export function NotesThread({notes,onAdd,currentUser}) {
  const [text,setText] = useState("");
  const add = () => {
    if(!text.trim()) return;
    onAdd(text.trim());
    setText("");
  };
  return (
    <div>
      {notes.length===0 && <div style={{color:"var(--text3)",fontSize:13,padding:"12px 0"}}>No notes yet. Add the first note below.</div>}
      <div className="notes-thread">
        {[...notes].sort((a,b)=>b.date.localeCompare(a.date)).map(n=>{
          const u=TEAM_MAP[n.author];
          return (
            <div key={n.id} className="note-item">
              <div className="note-av">{u?.initials||"?"}</div>
              <div className="note-bubble">
                <div className="note-head">
                  <span className="note-author">{u?.name||"Unknown"}</span>
                  <span className="note-date">{n.date}</span>
                </div>
                <div className="note-text">{n.text}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="note-compose">
        <div className="note-av" style={{marginTop:4}}>{TEAM_MAP[currentUser]?.initials||"?"}</div>
        <div className="note-input-wrap">
          <textarea className="note-input" rows={2} placeholder="Add a note, update, or internal comment…"
            value={text} onChange={e=>setText(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter"&&e.ctrlKey) add(); }}/>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:6}}>
            <button className="btn btn-primary btn-sm" onClick={add}><Send size={12}/>Add Note</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FILES LIST (reusable on Account/Opp/Activity detail)
// ═══════════════════════════════════════════════════════════════════
export function FilesList({files,onAdd,currentUser}) {
  const [form,setForm] = useState({name:"",type:"PDF",size:""});
  const [adding,setAdding] = useState(false);
  const add = () => {
    if(!form.name.trim()) return;
    onAdd({...form,id:`fi${uid()}`,uploadedBy:currentUser,date:today,linkedTo:[]});
    setForm({name:"",type:"PDF",size:""}); setAdding(false);
  };
  const TYPE_COL = {PDF:"#DC2626",Excel:"#16A34A",Word:"#2563EB",PPT:"#EA580C",Image:"#7C3AED",CSV:"#0D9488",Zip:"#D97706",Other:"#64748B"};
  return (
    <div>
      {files.length===0&&!adding && <div style={{color:"var(--text3)",fontSize:13,padding:"8px 0"}}>No files attached. Upload the first document below.</div>}
      <div className="files-list">
        {files.map(f=>(
          <div key={f.id} className="file-item">
            <div className="file-icon" style={{background:TYPE_COL[f.type]+"18",color:TYPE_COL[f.type]||"var(--brand)"}}><FileText size={16}/></div>
            <div style={{flex:1,minWidth:0}}>
              <div className="file-name">{f.name}</div>
              <div className="file-meta">
                <span>{f.type}</span><span>{f.size}</span>
                <span>{TEAM_MAP[f.uploadedBy]?.name}</span><span>{fmt.date(f.date)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      {adding ? (
        <div style={{marginTop:14,background:"var(--s2)",borderRadius:8,padding:14,border:"1px solid var(--border)"}}>
          <div className="form-row three" style={{marginBottom:10}}>
            <div className="form-group" style={{gridColumn:"span 2"}}>
              <label>File Name *</label>
              <input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Proposal_Colossal_v3.pdf"/>
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                {FILE_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row" style={{marginBottom:0}}>
            <div className="form-group">
              <label>Size</label>
              <input value={form.size} onChange={e=>setForm(f=>({...f,size:e.target.value}))} placeholder="e.g. 2.4 MB"/>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:12,justifyContent:"flex-end"}}>
            <button className="btn btn-sec btn-sm" onClick={()=>setAdding(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={add}><Check size={12}/>Attach File</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-sec btn-sm" style={{marginTop:14}} onClick={()=>setAdding(true)}><Paperclip size={13}/>Attach File</button>
      )}
    </div>
  );
}
