import React, { useEffect, useState, useMemo, useRef } from "react";
import { X, Send, FileText, Check, Paperclip, HelpCircle, Lightbulb, ChevronRight, AlertTriangle, RotateCcw } from "lucide-react";
import { PROD_MAP, TEAM_MAP, FILE_TYPES, TEAM, CALL_TYPES, CALL_OBJECTIVES, CALL_OUTCOMES } from "../data/constants";
import { fmt, uid, today, hasErrors } from "../utils/helpers";

// ── Live user registry — updated by SmartCRM whenever orgUsers changes ──
// Allows UserPill to resolve real Supabase users without prop-drilling.
let _liveUsers = [];
export function registerOrgUsers(users) { _liveUsers = users || []; }
function resolveUser(id) {
  if (!id) return null;
  return _liveUsers.find(u => u.id === id) || TEAM_MAP[id] || null;
}

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
  const user = resolveUser(u);
  if (!user) return u ? <span className="u-pill"><span className="u-av" style={{background:"#94A3B8"}}>{String(u).slice(0,2).toUpperCase()}</span><span className="u-name">{u}</span></span> : null;
  const initials = user.initials || user.name?.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() || "?";
  return <span className="u-pill"><span className="u-av">{initials}</span><span className="u-name">{user.name}</span></span>;
}
/**
 * Modal — base dialog used across the app.
 *
 * Opt-in props for floating-window behaviour (added for the Quotations
 * modal whose Items composer is wider than fits in lg, but kept generic
 * so any heavy modal can adopt them):
 *   - size="xl" → ~1100px wide, ~95vw cap
 *   - draggable → grab the title bar to move the modal anywhere on screen
 *   - resizable → drag the bottom-right corner to grow / shrink
 *
 * State is local to the Modal instance; closing & re-opening resets the
 * window back to centered + default size, which matches how desktop
 * apps usually behave for transient dialogs.
 */
export function Modal({title,onClose,children,footer,lg,size,draggable,resizable}) {
  const [pos, setPos] = useState(null);   // {x,y} once user has dragged
  const dragStart = useRef(null);

  useEffect(() => {
    const handleKey = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const onHeadMouseDown = (e) => {
    if (!draggable) return;
    // Don't start a drag from the close button or any interactive child.
    if (e.target.closest("button, input, select, textarea, a")) return;
    const modalEl = e.currentTarget.parentElement;
    const rect = modalEl.getBoundingClientRect();
    dragStart.current = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    const onMove = (ev) => {
      if (!dragStart.current) return;
      // Keep at least 80px of the modal on-screen so the user can always grab it back.
      const x = Math.max(8 - rect.width + 80, Math.min(window.innerWidth - 80, ev.clientX - dragStart.current.offsetX));
      const y = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dragStart.current.offsetY));
      setPos({ x, y });
    };
    const onUp = () => {
      dragStart.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const sizeCls = size === "xl" ? " modal-xl" : (lg ? " modal-lg" : "");
  const floatCls = `${draggable ? " modal-draggable" : ""}${resizable ? " modal-resizable" : ""}${pos ? " modal-floating" : ""}`;
  const modalStyle = pos ? { position:"fixed", top: pos.y, left: pos.x, margin: 0 } : undefined;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className={`modal${sizeCls}${floatCls}`} style={modalStyle}>
        <div className="modal-head" onMouseDown={onHeadMouseDown} title={draggable ? "Drag to move" : undefined}>
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

/**
 * DeleteConfirm — two-step typed confirmation required for destructive deletes.
 * User must type "DELETE" exactly before the confirm button enables.
 * Shows a clear warning that only Admins can reverse the action.
 */
export function DeleteConfirm({title, recordLabel, onConfirm, onCancel}) {
  const [typed, setTyped] = useState("");
  const ready = typed.trim() === "DELETE";
  return (
    <Modal title={title || "Confirm Delete"} onClose={onCancel}
      footer={<>
        <button className="btn btn-sec btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-danger btn-sm" onClick={onConfirm} disabled={!ready}
          style={{opacity: ready ? 1 : 0.45, cursor: ready ? "pointer" : "not-allowed"}}>
          Delete{recordLabel ? ` "${recordLabel}"` : ""}
        </button>
      </>}>
      <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",background:"#FEF3C7",border:"1px solid #F59E0B",borderRadius:8,marginBottom:16}}>
        <AlertTriangle size={16} style={{color:"#D97706",flexShrink:0,marginTop:1}}/>
        <div style={{fontSize:12.5,color:"#92400E",lineHeight:1.5}}>
          <strong>This action can only be reversed by an Admin.</strong><br/>
          The record will be soft-deleted and hidden from all users.
        </div>
      </div>
      <p style={{fontSize:13,color:"var(--text2)",marginBottom:8}}>
        Type <code style={{background:"#F3F4F6",padding:"1px 6px",borderRadius:4,fontWeight:700}}>DELETE</code> to confirm:
      </p>
      <input
        autoFocus
        value={typed}
        onChange={e => setTyped(e.target.value)}
        onKeyDown={e => e.key === "Enter" && ready && onConfirm()}
        placeholder="Type DELETE"
        style={{width:"100%",boxSizing:"border-box",padding:"8px 12px",border:`1.5px solid ${ready?"#EF4444":"var(--border)"}`,borderRadius:8,fontSize:13,fontFamily:"inherit",outline:"none"}}
      />
    </Modal>
  );
}

/**
 * RestoreConfirm — simple confirmation for admin restoring a soft-deleted record.
 */
export function RestoreConfirm({recordLabel, onConfirm, onCancel}) {
  return (
    <Modal title="Restore Record" onClose={onCancel}
      footer={<>
        <button className="btn btn-sec btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" onClick={onConfirm} style={{background:"#0D9488"}}>
          <RotateCcw size={13}/> Restore
        </button>
      </>}>
      <p style={{fontSize:13,color:"var(--text2)"}}>
        Restore <strong>{recordLabel}</strong>? It will become visible to all users again.
      </p>
    </Modal>
  );
}
export function Empty({icon,title,sub,children}) {
  return <div className="empty"><div className="empty-icon">{icon}</div><div className="empty-title">{title}</div><div className="empty-sub">{sub}</div>{children}</div>;
}
export function FormError({error}) {
  if (!error) return null;
  return <div style={{color:"#DC2626",fontSize:11,marginTop:3,fontWeight:500}}>{error}</div>;
}

// ═══════════════════════════════════════════════════════════════════
// HELP TOOLTIP — inline ? icon with hover popover
// Usage: <HelpTooltip text="This is what this field means" />
// ═══════════════════════════════════════════════════════════════════
export function HelpTooltip({ text, width = 240 }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!show) return;
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setShow(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [show]);
  return (
    <span ref={ref} className="help-tooltip-wrap" style={{ position:"relative", display:"inline-flex", alignItems:"center", marginLeft:4 }}>
      <button
        type="button"
        className="help-tooltip-trigger"
        onClick={e => { e.stopPropagation(); setShow(s => !s); }}
        aria-label="Help"
      >
        <HelpCircle size={13} />
      </button>
      {show && (
        <div className="help-tooltip-pop" style={{ width }}>
          <div className="help-tooltip-arrow" />
          {text}
        </div>
      )}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAGE TIP — dismissible contextual tip banner shown once per page
// Usage: <PageTip id="leads-tip-1" icon={...} title="..." text="..." />
// ═══════════════════════════════════════════════════════════════════
const TIPS_KEY = "smartcrm_dismissed_tips";
const getDismissed = () => { try { return JSON.parse(localStorage.getItem(TIPS_KEY) || "[]"); } catch { return []; } };
const dismissTip   = id => {
  const d = getDismissed();
  if (!d.includes(id)) { localStorage.setItem(TIPS_KEY, JSON.stringify([...d, id])); }
};

// ═══════════════════════════════════════════════════════════════════
// TYPEAHEAD SELECT — drop-in replacement for static <select> dropdowns
// where the option list could grow large (Account / Contact / Owner /
// Lead / Opportunity selectors, list-page filters etc.).
//
// Why this exists: the app started with simple <select> + <option>
// lists, which becomes unusable past ~50 options and unviable past
// ~500. This component keeps the same API shape (value / onChange)
// but renders a free-typing input with a filtered suggestion panel,
// keyboard nav, and click-outside dismiss.
//
// API:
//   <TypeaheadSelect
//     value={ownerF}                              // current value (id, name, or "" for cleared)
//     onChange={(val, opt) => setOwnerF(val)}     // fires with selected value (and full option)
//     options={team.map(u => ({ value:u.id, label:u.name, sub:u.role }))}
//     placeholder="Search owners…"
//     allowAll={true}                             // adds an "All" pseudo-option at top
//     allLabel="All Owners"                       // text for the All option
//     allValue="All"                              // value to emit when All is picked
//     size="filter"                               // "filter" (compact) | "form" (default field height)
//     icon={<Search size={14}/>}                  // optional leading icon
//     allowFreeText={false}                       // if true, Enter on no-match emits the typed value
//     maxResults={50}                             // safety cap
//   />
//
// Matching: case-insensitive substring on label + sub. Results are
// ranked so prefix matches sort above mid-string matches; ties broken
// by label length then alphabetical.
// ═══════════════════════════════════════════════════════════════════
export function TypeaheadSelect({
  value, onChange, options = [],
  placeholder = "Search…",
  allowAll = false, allLabel = "All", allValue = "All",
  size = "form", icon, allowFreeText = false, maxResults = 50,
  disabled = false, autoFocus = false, className = "", error = false,
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi]       = useState(0);   // highlighted index in filtered list
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // Resolve the *display* text for the current value.
  // When the dropdown is open we show the user's query instead.
  const selected = useMemo(
    () => options.find(o => String(o.value) === String(value)) || null,
    [options, value]
  );
  const displayValue = open
    ? query
    : (value === allValue && allowAll ? allLabel : (selected?.label ?? ""));

  // Filtered + ranked suggestions.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let pool = options;
    if (q) {
      const scored = [];
      for (const o of options) {
        const lbl = (o.label || "").toLowerCase();
        const sub = (o.sub   || "").toLowerCase();
        const li = lbl.indexOf(q);
        const si = sub.indexOf(q);
        if (li === -1 && si === -1) continue;
        // Score: prefix-on-label = 0, prefix-on-sub = 1,
        // substring-on-label = 2, substring-on-sub = 3.
        // Lower is better.
        const score = li === 0 ? 0 : si === 0 ? 1 : li > 0 ? 2 : 3;
        scored.push({ o, score, lblLen: lbl.length });
      }
      scored.sort((a, b) =>
        a.score - b.score ||
        a.lblLen - b.lblLen ||
        (a.o.label || "").localeCompare(b.o.label || "")
      );
      pool = scored.map(s => s.o);
    }
    return pool.slice(0, maxResults);
  }, [options, query, maxResults]);

  // Reset highlight whenever the visible result set changes.
  useEffect(() => { setHi(0); }, [query, open]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onDown = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const commit = (opt) => {
    onChange?.(opt.value, opt);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const onKey = e => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true); return;
    }
    if (!open) return;
    const list = allowAll
      ? [{ value: allValue, label: allLabel, _all: true }, ...filtered]
      : filtered;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi(i => Math.min(i + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (list[hi]) commit(list[hi]);
      else if (allowFreeText && query.trim()) commit({ value: query.trim(), label: query.trim() });
    }
    else if (e.key === "Escape") { setOpen(false); setQuery(""); inputRef.current?.blur(); }
    else if (e.key === "Tab") { setOpen(false); }
  };

  const clear = () => { onChange?.(allowAll ? allValue : "", null); setQuery(""); inputRef.current?.focus(); };

  // The visible list when the panel is open. We prepend a synthetic
  // "All" row when allowAll is set so users always see it as the first
  // suggestion regardless of query.
  const listForRender = allowAll
    ? [{ value: allValue, label: allLabel, _all: true }, ...filtered]
    : filtered;

  return (
    <div ref={wrapRef} className={`ts-wrap ts-${size} ${error ? "ts-error" : ""} ${className}`} style={{ position: "relative" }}>
      {icon && <span className="ts-icon">{icon}</span>}
      <input
        ref={inputRef}
        type="text"
        className={`ts-input ${icon ? "ts-input-with-icon" : ""}`}
        value={displayValue}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={e => { setQuery(e.target.value); if (!open) setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        autoComplete="off"
        spellCheck="false"
      />
      {!disabled && (selected || (allowAll && value !== allValue && value !== "")) && !open && (
        <button type="button" className="ts-clear" aria-label="Clear" onClick={clear}>×</button>
      )}
      {open && (
        <div className="ts-panel" role="listbox">
          {listForRender.length === 0 ? (
            <div className="ts-empty">
              {allowFreeText && query.trim()
                ? <>Press Enter to use “<b>{query.trim()}</b>”</>
                : "No matches"}
            </div>
          ) : (
            listForRender.map((o, i) => (
              <div
                key={o._all ? "__all" : `${o.value}_${i}`}
                className={`ts-row ${i === hi ? "ts-row-hi" : ""} ${o._all ? "ts-row-all" : ""}`}
                role="option"
                aria-selected={i === hi}
                onMouseEnter={() => setHi(i)}
                onMouseDown={e => { e.preventDefault(); commit(o); }}
              >
                <div className="ts-row-label">{o.label}</div>
                {o.sub && <div className="ts-row-sub">{o.sub}</div>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function PageTip({ id, title, text, link, linkLabel, onLink }) {
  const [visible, setVisible] = useState(() => !getDismissed().includes(id));
  if (!visible) return null;
  return (
    <div className="page-tip">
      <Lightbulb size={16} className="page-tip-icon" />
      <div className="page-tip-body">
        {title && <span className="page-tip-title">{title} </span>}
        <span className="page-tip-text">{text}</span>
        {link && onLink && (
          <button className="page-tip-link" onClick={onLink}>
            {linkLabel || link} <ChevronRight size={11} />
          </button>
        )}
      </div>
      <button className="page-tip-close" onClick={() => { dismissTip(id); setVisible(false); }} aria-label="Dismiss tip">
        <X size={13} />
      </button>
    </div>
  );
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
// ═══════════════════════════════════════════════════════════════════
// INLINE CONTACT FORM (Quick Add Contact)
// ═══════════════════════════════════════════════════════════════════
export function InlineContactForm({ accountId, onSave, onCancel }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", designation: "", department: "" });
  const set = (k,v) => setForm(p => ({...p, [k]: v}));

  return (
    <div style={{ background: "var(--s1)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginTop: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Quick Add Contact</span>
        <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)" }}>&#x2715;</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input placeholder="Full Name *" value={form.name} onChange={e => set("name", e.target.value)} className="f-input" style={{ gridColumn: "1/-1" }} />
        <input placeholder="Email" value={form.email} onChange={e => set("email", e.target.value)} className="f-input" />
        <input placeholder="Phone" value={form.phone} onChange={e => set("phone", e.target.value)} className="f-input" />
        <input placeholder="Designation" value={form.designation} onChange={e => set("designation", e.target.value)} className="f-input" />
        <input placeholder="Department" value={form.department} onChange={e => set("department", e.target.value)} className="f-input" />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <button onClick={onCancel} className="btn btn-ghost" style={{ fontSize: 12, padding: "4px 12px" }}>Cancel</button>
        <button onClick={() => { if (!form.name.trim()) return; onSave({ ...form, accountId }); }} className="btn btn-sm" style={{ fontSize: 12, padding: "4px 12px", background: "var(--brand)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }} disabled={!form.name.trim()}>Add Contact</button>
      </div>
    </div>
  );
}

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

// ═══════════════════════════════════════════════════════════════════
// LOG CALL MODAL (shared across Pipeline, Accounts, Leads)
// ═══════════════════════════════════════════════════════════════════
const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};

export function LogCallModal({ onClose, onSave, accounts, contacts, opps, orgUsers, masters, prefill = {} }) {
  const team = orgUsers?.length ? orgUsers.filter(u => u.status !== "Inactive") : TEAM;
  const callTypes = masters?.callTypes?.length ? masters.callTypes : CALL_TYPES;
  const callSubjects = masters?.callSubjects?.length ? masters.callSubjects : CALL_OBJECTIVES;
  const [form, setForm] = useState({
    callType: "Telephone Call", objective: "General Followup", callDate: today, callTime: nowTime(),
    duration: 15, accountId: "", leadId: "", oppId: "", contactIds: [], participantIds: [],
    notes: "", outcome: "Completed", nextCallDate: "", nextStepDesc: "", createFollowup: false,
    followupTitle: "", followupAssign: "", followupDue: "",
    ...prefill,
  });
  const [errors, setErrors] = useState({});

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: undefined })); };

  const filteredContacts = useMemo(() =>
    form.accountId ? (contacts || []).filter(c => c.accountId === form.accountId) : (contacts || []),
  [contacts, form.accountId]);
  const filteredOpps = useMemo(() =>
    form.accountId ? (opps || []).filter(o => o.accountId === form.accountId) : (opps || []),
  [opps, form.accountId]);

  const acctName = (accounts || []).find(a => a.id === form.accountId)?.name || "";

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
            {callTypes.map(t => { const v = typeof t==="object"?t.name:t; return <option key={v} value={v}>{v}</option>; })}
          </select>
        </div>
        <div className="form-group"><label>Call Subject</label>
          <select value={form.objective} onChange={e => set("objective", e.target.value)}>
            {callSubjects.map(o => { const v = typeof o==="object"?o.name:o; return <option key={v} value={v}>{v}</option>; })}
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
            {(accounts || []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
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
              <input type="checkbox" checked={(form.contactIds||[]).includes(c.id)}
                onChange={() => { const ids = form.contactIds||[]; set("contactIds", ids.includes(c.id) ? ids.filter(x => x !== c.id) : [...ids, c.id]); }}
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
