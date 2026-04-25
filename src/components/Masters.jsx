import { useState, useMemo } from "react";
import { Plus, Edit2, Trash2, Check, X, ChevronDown, Search, ArrowUp, ArrowDown, GitBranch } from "lucide-react";
import { PROD_MAP } from '../data/constants';
import { uid } from '../utils/helpers';
import { Modal, Confirm, HelpTooltip, PageTip } from './shared';

// ═══════════════════════════════════════════════════════════════════
// MASTERS PAGE — compact, chip-style, grouped into category tabs
// ═══════════════════════════════════════════════════════════════════

// Per-section config: the "sub" column (probability, region, etc.)
const SECTIONS = {
  // ── Sales ───────────────────────────────────────────
  sales: [
    { key:"verticals",       title:"Industries / Verticals" },
    { key:"leadSources",     title:"Lead Sources" },
    { key:"leadTemperatures",title:"Lead Temperatures" },
    { key:"leadStages",      title:"Lead Stages", subKey:"stage", subLabel:"Stage #", subType:"num" },
    { key:"oppPhases",       title:"Opportunity Phases" },
    { key:"oppStages",       title:"Opportunity Stages", subKey:"probability", subLabel:"Prob %", subType:"num" },
    { key:"oppSources",      title:"Opportunity Sources" },
    { key:"oppSizes",        title:"Deal Sizes" },
    { key:"forecastCats",    title:"Forecast Categories" },
    // Pipeline stages get their own dedicated editor (rendered above the
    // chip grid). They support color, probability %, kind (open/won/lost),
    // ordering, and delete-blocked-when-in-use — none of which the chip
    // editor handles. The `stages` master is therefore intentionally NOT
    // in this list; see <PipelineStagesEditor/> below.
    { key:"winReasons",      title:"Win Reasons" },
    { key:"lossReasons",     title:"Loss Reasons" },
    { key:"suspendReasons",  title:"Suspend Reasons" },
    { key:"evaluationStatus",title:"Evaluation Status (Lead Q)" },
    { key:"nextSteps",       title:"Lead Next Steps" },
  ],
  // ── Customer ─────────────────────────────────────────
  customer: [
    { key:"customerTypes",    title:"Customer Types (Business)" },
    { key:"customerLifecycle",title:"Customer Lifecycle Stages" },
    { key:"businessTypes",    title:"Business Types" },
    { key:"staffSizes",       title:"Staff Sizes" },
    { key:"currentSoftware",  title:"Current Software" },
    { key:"painPoints",       title:"Pain Points" },
    { key:"budgetRanges",     title:"Budget Ranges" },
    { key:"decisionMakers",   title:"Decision Makers" },
    { key:"decisionTimelines",title:"Decision Timelines" },
    { key:"hierarchyLevels",  title:"Hierarchy Levels" },
    { key:"countries",        title:"Countries", subKey:"region", subLabel:"Region", subType:"text" },
    { key:"regions",          title:"Regions" },
    { key:"swAge",            title:"Software Age Buckets" },
  ],
  // ── Contact ─────────────────────────────────────────
  contact: [
    { key:"contactRoles",       title:"Contact Roles" },
    { key:"oppContactRoles",    title:"Opportunity Contact Roles" },
    { key:"leadContactRoles",   title:"Lead Contact Roles" },
    { key:"contactDispositions",title:"Contact Dispositions" },
    { key:"contactDepartments", title:"Contact Departments" },
  ],
  // ── Activity ─────────────────────────────────────────
  activity: [
    { key:"activityTypes",   title:"Activity Types" },
    { key:"activityStatuses",title:"Activity Statuses" },
    { key:"callTypes",       title:"Call Types" },
    { key:"callSubjects",    title:"Call Subjects / Objectives" },
    { key:"callOutcomes",    title:"Call Outcomes" },
    { key:"eventTypes",      title:"Calendar Event Types" },
    { key:"eventStatuses",   title:"Calendar Event Statuses" },
    { key:"commTypes",       title:"Communication Types" },
    { key:"commStatuses",    title:"Communication Statuses" },
    { key:"updateCategories",title:"Internal Update Categories" },
    { key:"updateAttachmentTypes",title:"Update Attachment Types" },
    { key:"fileTypes",       title:"File Types" },
  ],
  // ── Support ─────────────────────────────────────────
  support: [
    { key:"ticketTypes",     title:"Ticket Types" },
    { key:"ticketStatuses",  title:"Ticket Statuses" },
    { key:"priorities",      title:"Priorities" },
    { key:"escalationLevels",title:"Escalation Levels" },
    { key:"slaHours",        title:"SLA Hours by Priority", subKey:"hours", subLabel:"Hours", subType:"num",
      help:"Resolution-time target (hours) per priority. Used by SLA-breach reports." },
  ],
  // ── Finance ─────────────────────────────────────────
  finance: [
    { key:"billTerms",         title:"Bill Terms" },
    { key:"billTypes",         title:"Bill Types" },
    { key:"paymentModes",      title:"Payment Modes" },
    { key:"collectionStatuses",title:"Collection Statuses" },
    { key:"ageingBuckets",     title:"Ageing Buckets" },
    { key:"taxTypes",          title:"Tax Types" },
    { key:"contractStatuses",  title:"Contract Statuses" },
    { key:"contractDocTypes",  title:"Contract Doc Types" },
    { key:"approvalChain",     title:"Approval Chain" },
    { key:"quoteStatuses",     title:"Quote Statuses" },
    { key:"quoteValidity",     title:"Quote Validity" },
    { key:"standardTerms",     title:"Standard T&Cs (Quotation Snippets)" },
  ],
  // ── System ─────────────────────────────────────────
  system: [
    { key:"uploadTypes",     title:"Bulk Upload Types" },
  ],
};

const GROUP_TABS = [
  { id:"sales",    label:"Sales" },
  { id:"customer", label:"Customer" },
  { id:"contact",  label:"Contact" },
  { id:"activity", label:"Activity" },
  { id:"support",  label:"Support" },
  { id:"finance",  label:"Finance" },
  { id:"system",   label:"System" },
];

// ── Compact chip-style master section ────────────────────────────
function MasterChipSection({ cfg, items, onAdd, onEdit, onDelete }) {
  const [editId,setEditId]=useState(null);
  const [adding,setAdding]=useState(false);
  const [val,setVal]=useState({ name:"", sub:"" });

  const subKey = cfg.subKey;
  const startEdit = (it) => {
    setVal({ name: it.name, sub: subKey ? (it[subKey]??"") : "" });
    setEditId(it.id); setAdding(false);
  };
  const startAdd = () => { setVal({ name:"", sub:"" }); setAdding(true); setEditId(null); };
  const commit = () => {
    if (!val.name.trim()) { setAdding(false); setEditId(null); return; }
    const extra = subKey ? { [subKey]: cfg.subType==="num" ? (+val.sub||0) : val.sub } : {};
    if (adding) onAdd({ name: val.name.trim(), ...extra });
    else onEdit(editId, { name: val.name.trim(), ...extra });
    setAdding(false); setEditId(null);
  };
  const cancel = () => { setAdding(false); setEditId(null); };

  return (
    <div className="m-sec">
      <div className="m-sec-head">
        <div className="m-sec-title">
          {cfg.title}
          {cfg.help && <HelpTooltip text={cfg.help} width={240}/>}
          <span className="m-sec-count">{items.length}</span>
        </div>
        <button className="m-add-btn" onClick={startAdd} title={`Add to ${cfg.title}`}><Plus size={12}/>Add</button>
      </div>
      <div className="m-chip-wrap">
        {items.map(it => editId===it.id ? (
          <div key={it.id} className="m-chip m-chip-edit">
            <input autoFocus value={val.name} onChange={e=>setVal(v=>({...v,name:e.target.value}))}
              onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape")cancel();}}
              className="m-chip-input" />
            {subKey && (
              <input value={val.sub} onChange={e=>setVal(v=>({...v,sub:e.target.value}))}
                placeholder={cfg.subLabel} className="m-chip-sub"
                onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape")cancel();}} />
            )}
            <button className="m-ico-ok" onClick={commit}><Check size={11}/></button>
            <button className="m-ico-x" onClick={cancel}><X size={11}/></button>
          </div>
        ) : (
          <div key={it.id} className="m-chip" onClick={()=>startEdit(it)}>
            <span className="m-chip-name">{it.name}</span>
            {subKey && it[subKey]!==undefined && it[subKey]!=="" && (
              <span className="m-chip-badge">{it[subKey]}{cfg.subType==="num" && subKey==="probability"?"%":""}</span>
            )}
            <button className="m-chip-del" onClick={e=>{e.stopPropagation();onDelete(it.id);}} title="Delete"><X size={10}/></button>
          </div>
        ))}
        {adding && (
          <div className="m-chip m-chip-edit">
            <input autoFocus value={val.name} onChange={e=>setVal(v=>({...v,name:e.target.value}))}
              placeholder="Name…" className="m-chip-input"
              onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape")cancel();}} />
            {subKey && (
              <input value={val.sub} onChange={e=>setVal(v=>({...v,sub:e.target.value}))}
                placeholder={cfg.subLabel} className="m-chip-sub"
                onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape")cancel();}} />
            )}
            <button className="m-ico-ok" onClick={commit}><Check size={11}/></button>
            <button className="m-ico-x" onClick={cancel}><X size={11}/></button>
          </div>
        )}
        {items.length===0 && !adding && (
          <span className="m-empty">No items yet — click Add to create one</span>
        )}
      </div>
    </div>
  );
}

// Inline CSS so this component works without touching the global CSS bundle
const MASTERS_CSS = `
.m-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:12px}
.m-tab{padding:7px 14px;border-radius:8px;border:1px solid var(--border);background:var(--s1);color:var(--text2);font-size:13px;font-weight:600;cursor:pointer;transition:all 0.15s}
.m-tab:hover{background:var(--brand-bg);color:var(--brand)}
.m-tab.active{background:#1B6B5A;color:#fff;border-color:#1B6B5A}
.m-search-wrap{position:relative;margin-bottom:14px;max-width:380px}
.m-search-wrap svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text3)}
.m-search{width:100%;padding:8px 10px 8px 34px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--s1);outline:none}
.m-search:focus{border-color:var(--brand)}
.m-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
@media(max-width:1100px){.m-grid{grid-template-columns:1fr}}
.m-sec{background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:12px 14px;min-height:60px}
.m-sec-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px}
.m-sec-title{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:var(--text)}
.m-sec-count{font-size:10.5px;font-weight:600;color:var(--text3);background:var(--s2);padding:1px 6px;border-radius:10px;margin-left:4px}
.m-add-btn{display:flex;align-items:center;gap:4px;padding:4px 9px;border-radius:6px;border:1px solid var(--brand);background:var(--brand-bg);color:var(--brand);font-size:11px;font-weight:600;cursor:pointer;transition:all 0.15s}
.m-add-btn:hover{background:var(--brand);color:#fff}
.m-chip-wrap{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.m-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 4px 4px 10px;background:#fff;border:1px solid var(--border);border-radius:16px;font-size:12px;color:var(--text);cursor:pointer;transition:all 0.15s;position:relative}
.m-chip:hover{border-color:var(--brand);background:var(--brand-bg)}
.m-chip-name{font-weight:500}
.m-chip-badge{display:inline-flex;align-items:center;padding:1px 7px;background:var(--brand-bg);color:var(--brand);border-radius:10px;font-size:10.5px;font-weight:700}
.m-chip-del{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:transparent;border:none;color:var(--text3);border-radius:50%;cursor:pointer;transition:all 0.12s;padding:0}
.m-chip:hover .m-chip-del{color:var(--red-t);background:var(--red-bg)}
.m-chip-edit{background:#fff;border-color:var(--brand);padding:2px 4px 2px 6px;gap:4px}
.m-chip-input{border:none;outline:none;background:transparent;font-size:12px;padding:3px 4px;min-width:100px;max-width:160px}
.m-chip-sub{border:none;outline:none;background:var(--s2);font-size:11px;padding:3px 6px;width:70px;border-radius:4px}
.m-ico-ok{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:var(--brand);color:#fff;border:none;border-radius:4px;cursor:pointer}
.m-ico-x{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:var(--s2);color:var(--text3);border:none;border-radius:4px;cursor:pointer}
.m-empty{font-size:11.5px;color:var(--text3);font-style:italic;padding:4px 8px}
.m-group-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:18px}
.m-group-tab{padding:8px 16px;border-radius:8px 8px 0 0;border:none;background:transparent;color:var(--text2);font-size:13.5px;font-weight:600;cursor:pointer;border-bottom:2px solid transparent;transition:all 0.15s}
.m-group-tab:hover{color:var(--brand)}
.m-group-tab.active{color:#1B6B5A;border-bottom-color:#1B6B5A;background:var(--brand-bg)}

/* ── Pipeline Stages editor ── */
.ps-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:18px 20px;margin-bottom:20px;box-shadow:var(--sh-xs)}
.ps-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.ps-title{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:var(--text)}
.ps-sub{font-size:12px;color:var(--text3);margin-bottom:14px}
.ps-table{width:100%;border-collapse:separate;border-spacing:0 4px}
.ps-row{background:var(--s2);border-radius:8px}
.ps-row td{padding:8px 10px;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.ps-row td:first-child{border-left:1px solid var(--border);border-radius:8px 0 0 8px}
.ps-row td:last-child{border-right:1px solid var(--border);border-radius:0 8px 8px 0}
.ps-row.ps-system{background:#FEF7E6}
.ps-name-input{background:transparent;border:1px solid transparent;font-size:13px;font-weight:600;color:var(--text);padding:5px 8px;border-radius:6px;width:100%;outline:none}
.ps-name-input:hover{border-color:var(--border)}
.ps-name-input:focus{border-color:var(--brand);background:#fff}
.ps-prob-input{width:60px;padding:5px 6px;border:1px solid var(--border);border-radius:6px;font-size:12.5px;text-align:right;outline:none}
.ps-prob-input:focus{border-color:var(--brand)}
.ps-color-swatch{width:22px;height:22px;border-radius:6px;border:2px solid #fff;box-shadow:0 0 0 1px var(--border);cursor:pointer;flex-shrink:0}
.ps-color-pop{position:absolute;background:#fff;border:1px solid var(--border);border-radius:8px;padding:6px;box-shadow:var(--sh-md);z-index:10;display:grid;grid-template-columns:repeat(8,1fr);gap:4px}
.ps-color-cell{width:22px;height:22px;border-radius:5px;border:none;cursor:pointer}
.ps-kind{font-size:9.5px;font-weight:700;letter-spacing:0.5px;padding:2px 6px;border-radius:4px;text-transform:uppercase}
.ps-kind.k-open{background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE}
.ps-kind.k-won{background:#ECFDF5;color:#065F46;border:1px solid #A7F3D0}
.ps-kind.k-lost{background:#FEF2F2;color:#991B1B;border:1px solid #FECACA}
.ps-icon-btn{width:24px;height:24px;border-radius:6px;border:1px solid var(--border);background:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:var(--text3)}
.ps-icon-btn:hover:not(:disabled){background:var(--s2);color:var(--text);border-color:var(--border2)}
.ps-icon-btn:disabled{opacity:0.4;cursor:not-allowed}
.ps-icon-btn.ps-del:hover:not(:disabled){background:#FEF2F2;color:#DC2626;border-color:#FCA5A5}
.ps-add-row{display:flex;gap:8px;align-items:center;margin-top:10px}
`;

// Color palette for pipeline stages — 16 distinct, visually-balanced choices
// that play nicely with the kanban / chart colors used elsewhere in the app.
const STAGE_COLOR_PALETTE = [
  "#94A3B8","#3B82F6","#8B5CF6","#F59E0B","#F97316","#22C55E","#EF4444","#0EA5E9",
  "#14B8A6","#EAB308","#EC4899","#A855F7","#F43F5E","#06B6D4","#84CC16","#6366F1",
];

// ═══════════════════════════════════════════════════════════════════
// PIPELINE STAGES EDITOR
// ───────────────────────────────────────────────────────────────────
// Replaces the old chip-grid entry for `masters.stages`. Adds:
//   - Color swatch + 16-color picker pop-out per stage
//   - Probability % field (used in weighted forecast)
//   - Kind badge (Open / Won / Lost) — Won + Lost are reserved system
//     stages, can be RENAMED but not DELETED, and must always exist
//     exactly once each so downstream "is this a closed deal?" checks
//     have something to look up
//   - Up/Down arrows to reorder (drag-and-drop deferred to keep this
//     PR small; arrow buttons cover 95% of the use case)
//   - Delete blocked when any opportunity currently sits at this stage
//     (preserves data integrity — a follow-up could offer a "merge into"
//     selector before deletion)
// ═══════════════════════════════════════════════════════════════════
function PipelineStagesEditor({ stages, setStages, opps }) {
  const [colorPickerFor, setColorPickerFor] = useState(null);   // stage id
  const [addingName, setAddingName] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);            // stage id

  // Count of opps currently at each stage — used to block delete +
  // surface usage hint to the user.
  const usageByStage = useMemo(() => {
    const map = {};
    (opps || []).forEach(o => {
      if (!o.stage) return;
      map[o.stage] = (map[o.stage] || 0) + 1;
    });
    return map;
  }, [opps]);

  // System-stage existence check — UI guarantees we never end up with zero
  // Won or Lost stages by disabling the delete button on the last one of
  // each kind.
  const wonCount = stages.filter(s => s.kind === "won").length;
  const lostCount = stages.filter(s => s.kind === "lost").length;

  const update = (id, patch) => setStages(stages.map(s => s.id === id ? { ...s, ...patch } : s));

  const move = (id, dir) => {
    const idx = stages.findIndex(s => s.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= stages.length) return;
    const copy = [...stages];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    setStages(copy);
  };

  const remove = (id) => {
    const s = stages.find(x => x.id === id);
    if (!s) return;
    // Final guard — UI should already block, but defend in depth.
    if (usageByStage[s.name]) return;
    if (s.kind === "won" && wonCount <= 1) return;
    if (s.kind === "lost" && lostCount <= 1) return;
    setStages(stages.filter(x => x.id !== id));
    setConfirmDel(null);
  };

  const addStage = () => {
    const name = addingName.trim();
    if (!name) return;
    const id = `st_${Date.now().toString(36)}`;
    setStages([
      ...stages,
      { id, name, probability: 50, color: STAGE_COLOR_PALETTE[stages.length % STAGE_COLOR_PALETTE.length], kind: "open" },
    ]);
    setAddingName("");
  };

  return (
    <div className="ps-card">
      <div className="ps-head">
        <div className="ps-title">
          <GitBranch size={16} style={{color:"var(--brand)"}}/>
          Pipeline Stages
          <HelpTooltip text="The list of stages every opportunity moves through. Probability % is used by the weighted forecast (Won = 100, Lost = 0). Kind tags Won / Lost as the closing stages so reports keep working even if you rename them. Delete is blocked while any deal sits at the stage — move those deals first."/>
        </div>
        <span style={{fontSize:11.5,color:"var(--text3)"}}>{stages.length} stages · {(opps || []).length} deals across them</span>
      </div>
      <div className="ps-sub">
        Define your sales process. Reorder with the arrows; click a color swatch to recolor; rename inline. Won &amp; Lost are reserved closing stages — you can rename them but at least one of each must exist.
      </div>

      <table className="ps-table">
        <thead>
          <tr style={{fontSize:10.5,color:"var(--text3)",letterSpacing:"0.4px",textTransform:"uppercase",fontWeight:700}}>
            <th style={{width:36,padding:"6px 10px",textAlign:"center"}}>#</th>
            <th style={{width:36,padding:"6px 10px"}}>Color</th>
            <th style={{padding:"6px 10px",textAlign:"left"}}>Name</th>
            <th style={{width:90,padding:"6px 10px",textAlign:"right"}}>Prob %</th>
            <th style={{width:80,padding:"6px 10px"}}>Kind</th>
            <th style={{width:120,padding:"6px 10px",textAlign:"right"}}>In use</th>
            <th style={{width:130,padding:"6px 10px",textAlign:"right"}}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((s, i) => {
            const inUse = usageByStage[s.name] || 0;
            const isOnlyWon = s.kind === "won" && wonCount <= 1;
            const isOnlyLost = s.kind === "lost" && lostCount <= 1;
            const delBlocked = inUse > 0 || isOnlyWon || isOnlyLost;
            const delTitle = inUse > 0
              ? `${inUse} deal${inUse===1?"":"s"} currently at this stage — move them before deleting`
              : isOnlyWon ? "Can't delete the only Won stage"
              : isOnlyLost ? "Can't delete the only Lost stage"
              : "Delete this stage";

            return (
              <tr key={s.id} className={`ps-row ${s.kind!=="open" ? "ps-system" : ""}`}>
                <td style={{textAlign:"center",fontSize:11,color:"var(--text3)",fontWeight:600}}>{i + 1}</td>
                <td>
                  <div style={{position:"relative"}}>
                    <button
                      type="button"
                      className="ps-color-swatch"
                      style={{background: s.color || "#94A3B8"}}
                      onClick={() => setColorPickerFor(colorPickerFor === s.id ? null : s.id)}
                      aria-label="Change color"
                    />
                    {colorPickerFor === s.id && (
                      <div className="ps-color-pop" onMouseLeave={() => setColorPickerFor(null)}>
                        {STAGE_COLOR_PALETTE.map(c => (
                          <button key={c} type="button" className="ps-color-cell"
                            style={{background:c, outline: c===s.color ? "2px solid #0D1F2D" : "none"}}
                            onClick={() => { update(s.id, { color: c }); setColorPickerFor(null); }}
                            aria-label={c}/>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                <td>
                  <input
                    className="ps-name-input"
                    value={s.name}
                    onChange={e => update(s.id, { name: e.target.value })}
                    placeholder="Stage name"
                  />
                </td>
                <td style={{textAlign:"right"}}>
                  <input
                    className="ps-prob-input"
                    type="number"
                    min={0} max={100} step={5}
                    value={Number(s.probability) || 0}
                    onChange={e => update(s.id, { probability: Math.max(0, Math.min(100, +e.target.value || 0)) })}
                  />
                </td>
                <td>
                  <span className={`ps-kind k-${s.kind || "open"}`}>{s.kind || "open"}</span>
                </td>
                <td style={{textAlign:"right",fontSize:11.5,color: inUse > 0 ? "var(--brand)" : "var(--text3)",fontWeight: inUse > 0 ? 600 : 400}}>
                  {inUse > 0 ? `${inUse} deal${inUse===1?"":"s"}` : "—"}
                </td>
                <td style={{textAlign:"right"}}>
                  <div style={{display:"inline-flex",gap:4}}>
                    <button className="ps-icon-btn" onClick={() => move(s.id, -1)} disabled={i === 0} title="Move up"><ArrowUp size={13}/></button>
                    <button className="ps-icon-btn" onClick={() => move(s.id, +1)} disabled={i === stages.length - 1} title="Move down"><ArrowDown size={13}/></button>
                    <button className="ps-icon-btn ps-del" onClick={() => setConfirmDel(s.id)} disabled={delBlocked} title={delTitle}><Trash2 size={13}/></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="ps-add-row">
        <input
          value={addingName}
          onChange={e => setAddingName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addStage()}
          placeholder="New stage name (e.g. Discovery, Pilot, Contract Sent)"
          style={{flex:1,padding:"7px 10px",border:"1.5px solid var(--border)",borderRadius:6,fontSize:13,outline:"none"}}
        />
        <button className="btn btn-sec btn-sm" onClick={addStage} disabled={!addingName.trim()}>
          <Plus size={13}/>Add Stage
        </button>
      </div>

      {confirmDel && (() => {
        const s = stages.find(x => x.id === confirmDel);
        if (!s) return null;
        return (
          <Confirm
            title={`Delete stage "${s.name}"?`}
            msg="This stage will be removed from the pipeline. Deals can no longer be moved to it. This is reversible — you can re-add a stage with the same name."
            onConfirm={() => remove(s.id)}
            onCancel={() => setConfirmDel(null)}
          />
        );
      })()}
    </div>
  );
}


function Masters({masters,setMasters,catalog,setCatalog,opps=[],orgUsers=[],currentUser=null}) {
  const [tab,setTab]=useState("reference");
  const [group,setGroup]=useState("sales");
  const [search,setSearch]=useState("");

  const mk=(key,val)=>setMasters(m=>({...m,[key]:val}));
  const addItem=(key,val)=>{
    const prefix=key.slice(0,3);
    mk(key,[...(masters[key]||[]),{id:`${prefix}${uid()}`,...val}]);
  };
  const editItem=(key,id,val)=>mk(key,(masters[key]||[]).map(it=>it.id===id?{...it,...val}:it));
  const delItem=(key,id)=>mk(key,(masters[key]||[]).filter(it=>it.id!==id));

  const sections = SECTIONS[group] || [];
  const visible = search.trim()
    ? sections.filter(s => s.title.toLowerCase().includes(search.toLowerCase())
        || (masters[s.key]||[]).some(it => it.name.toLowerCase().includes(search.toLowerCase())))
    : sections;

  // Total count of items across all masters (for the header hint)
  const totalItems = Object.values(masters||{}).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);

  return (
    <div>
      <style dangerouslySetInnerHTML={{__html:MASTERS_CSS}}/>
      <PageTip
        id="masters-tip-v2"
        title="Masters tip:"
        text="Masters drive every dropdown across the app. Edit a chip to rename, click × to remove, or use + Add to create new values. Switch group tabs to find sales, customer, activity, support, and finance reference data."
      />
      <div className="pg-head">
        <div><div className="pg-title">Masters</div><div className="pg-sub">Reference data &amp; product catalogue · {totalItems} items across {Object.keys(SECTIONS).reduce((s,k)=>s+SECTIONS[k].length,0)} masters</div></div>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:18}}>
        {[{id:"reference",label:"Reference Data"},{id:"products",label:"Product Catalogue"}].map(t=>(
          <button key={t.id} className={`btn btn-sm ${tab===t.id?"btn-primary":"btn-sec"}`} onClick={()=>setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab==="reference" && (
        <div>
          {/* Category group tabs */}
          <div className="m-group-tabs">
            {GROUP_TABS.map(g=>(
              <button key={g.id} className={`m-group-tab ${group===g.id?"active":""}`} onClick={()=>setGroup(g.id)}>
                {g.label}
                <span style={{fontSize:10.5,fontWeight:600,color:"var(--text3)",marginLeft:6}}>
                  {SECTIONS[g.id].reduce((s,c)=>s+((masters[c.key]||[]).length),0)}
                </span>
              </button>
            ))}
          </div>

          {/* Search within current group */}
          <div className="m-search-wrap">
            <Search size={14}/>
            <input className="m-search" placeholder={`Search ${group} masters or items…`}
              value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>

          {/* Dedicated editor for pipeline stages — sits at the top of the
              Sales group because it's the highest-leverage master and needs a
              richer UI than the chip grid (color, probability, kind, order,
              usage-blocked delete). */}
          {group === "sales" && (
            <PipelineStagesEditor
              stages={masters.stages || []}
              setStages={(next) => mk("stages", next)}
              opps={opps}
            />
          )}

          <div className="m-grid">
            {visible.map(cfg=>(
              <MasterChipSection key={cfg.key} cfg={cfg} items={masters[cfg.key]||[]}
                onAdd={v=>addItem(cfg.key,v)}
                onEdit={(id,v)=>editItem(cfg.key,id,v)}
                onDelete={id=>delItem(cfg.key,id)}/>
            ))}
            {visible.length===0 && (
              <div style={{gridColumn:"1 / -1",padding:24,textAlign:"center",color:"var(--text3)",fontSize:13}}>
                No masters match “{search}”.
              </div>
            )}
          </div>
        </div>
      )}

      {tab==="products" && <ProductCatalogPage catalog={catalog} setCatalog={setCatalog} orgUsers={orgUsers} currentUser={currentUser}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PRODUCT CATALOG PAGE
// ═══════════════════════════════════════════════════════════════════
const MOD_TYPE_CLS={Core:"mod-core","Add-on":"mod-addon",Integration:"mod-integration",Analytics:"mod-analytics",Mobile:"mod-mobile"};

function ProductCatalogPage({catalog,setCatalog,orgUsers=[],currentUser=null}) {
  // Admin/MD/Director can re-assign a product's Line Manager directly from
  // this page (inline dropdown on each card) without opening the edit modal.
  // Everyone else sees a read-only label. Same allow-list as other admin
  // operations across the app.
  const _myRole = (orgUsers.find(u => u.id === currentUser)?.role || "").toLowerCase();
  // VP Sales & Marketing also gets inline-edit rights here — they're the
  // operational owner of the routing table for their org.
  const isAdmin = ["admin","md","director","vp_sales_mkt"].includes(_myRole);
  const [expanded,setExpanded]=useState({});
  const [modal,setModal]=useState(null);
  // BLANK_MOD: full module shape including the new pricing-logic fields.
  // Keeping a single source of truth for resets / clones so any future field
  // addition only needs to touch this default and the BLANK_QUOTE_ITEM
  // snapshot in seed.js — not every place state is initialised.
  const BLANK_MOD = {
    name:"", type:"Core", desc:"",
    mrp:0, unit:"License", currency:"INR",
    // Pricing-logic master fields (see BLANK_QUOTE_ITEM in seed.js for snapshot semantics).
    // licenseType captures the COMMERCIAL framing the customer signs up for; it's
    // distinct from billingFrequency (cadence) and pricingModel (math). Together
    // they cover SaaS Per-User/Month, Term Licenses, OTD perpetual, and
    // Perpetual + Annual Maintenance — see the dropdown options for the full set.
    licenseType:"", billingFrequency:"", pricingModel:"", gstRate:18, hsnSac:"",
    setupFee:0, griApplicable:"No", griPercentage:0,
    defaultTermMonths:0, minCommitment:0,
  };
  const [form,setForm]=useState(BLANK_MOD);
  const [prodForm,setProdForm]=useState({id:"",name:"",desc:"",color:"#2563EB",bg:"#EFF6FF",lineManagerId:""});
  const [confirm,setConfirm]=useState(null);

  // Eligible "line managers" for product ownership: anyone except plain viewers.
  // We don't gate on role label because real-world Hans Infomatic has the COO
  // (Shivbrata) acting as PM for several products — restricting to role==line_mgr
  // would exclude valid owners. Sorted by name for usability.
  const managerCandidates = (orgUsers||[])
    .filter(u => u.active !== false && u.role !== "viewer")
    .sort((a,b) => (a.name||"").localeCompare(b.name||""));
  const userById = Object.fromEntries((orgUsers||[]).map(u=>[u.id,u]));

  const COLOR_PRESETS=[
    {color:"#2563EB",bg:"#EFF6FF",label:"Blue"},
    {color:"#16A34A",bg:"#F0FDF4",label:"Green"},
    {color:"#7C3AED",bg:"#F5F3FF",label:"Purple"},
    {color:"#D97706",bg:"#FFFBEB",label:"Amber"},
    {color:"#0D9488",bg:"#F0FDFA",label:"Teal"},
    {color:"#DC2626",bg:"#FEF2F2",label:"Red"},
    {color:"#DB2777",bg:"#FDF2F8",label:"Pink"},
    {color:"#0891B2",bg:"#ECFEFF",label:"Cyan"},
    {color:"#65A30D",bg:"#F7FEE7",label:"Lime"},
    {color:"#475569",bg:"#F1F5F9",label:"Slate"},
  ];

  const toggle=id=>setExpanded(e=>({...e,[id]:!e[id]}));
  const openAddMod=prodId=>{setForm({...BLANK_MOD});setModal({mode:"addmod",prodId});};
  const openEditMod=(prodId,mod)=>{
    // Spread BLANK_MOD first so any catalog row missing the new pricing
    // fields (older quotes / pre-migration data) gets sensible defaults
    // instead of `undefined` reaching the inputs.
    setForm({...BLANK_MOD, ...mod});
    setModal({mode:"editmod",prodId,modId:mod.id});
  };
  const saveMod=()=>{
    if(!form.name.trim()) return;
    const payload={
      name:form.name.trim(),
      type:form.type,
      desc:form.desc,
      mrp:Number(form.mrp)||0,
      unit:form.unit||"License",
      currency:form.currency||"INR",
      // Pricing-logic master fields
      licenseType:form.licenseType||"",
      billingFrequency:form.billingFrequency||"",
      pricingModel:form.pricingModel||"",
      gstRate:Number(form.gstRate)||0,
      hsnSac:(form.hsnSac||"").trim(),
      setupFee:Number(form.setupFee)||0,
      griApplicable:form.griApplicable||"No",
      griPercentage:Number(form.griPercentage)||0,
      defaultTermMonths:Number(form.defaultTermMonths)||0,
      minCommitment:Number(form.minCommitment)||0,
    };
    setCatalog(c=>c.map(p=>{
      if(p.id!==modal.prodId) return p;
      if(modal.mode==="addmod") return {...p,modules:[...p.modules,{id:`m_${uid()}`,...payload}]};
      return {...p,modules:p.modules.map(m=>m.id===modal.modId?{...m,...payload}:m)};
    }));
    setModal(null);
  };
  const delMod=(prodId,modId)=>{
    setCatalog(c=>c.map(p=>p.id!==prodId?p:{...p,modules:p.modules.filter(m=>m.id!==modId)}));
    setConfirm(null);
  };

  const openAddProd=()=>{setProdForm({id:"",name:"",desc:"",color:"#2563EB",bg:"#EFF6FF",lineManagerId:""});setModal({mode:"addprod"});};
  const openEditProd=(p)=>{setProdForm({id:p.id,name:p.name,desc:p.desc||"",color:p.color||"#2563EB",bg:p.bg||"#EFF6FF",lineManagerId:p.lineManagerId||""});setModal({mode:"editprod",prodId:p.id});};
  const saveProd=()=>{
    const name=prodForm.name.trim();
    if(!name) return;
    const lineManagerId=prodForm.lineManagerId||"";
    if(modal.mode==="addprod"){
      const baseId=name.replace(/[^A-Za-z0-9]/g,"")||`prod${uid()}`;
      let newId=baseId;
      let n=1;
      while(catalog.some(p=>p.id===newId)) newId=`${baseId}${++n}`;
      setCatalog(c=>[...c,{id:newId,name,desc:prodForm.desc,color:prodForm.color,bg:prodForm.bg,lineManagerId,modules:[]}]);
    } else {
      setCatalog(c=>c.map(p=>p.id===modal.prodId?{...p,name,desc:prodForm.desc,color:prodForm.color,bg:prodForm.bg,lineManagerId}:p));
    }
    setModal(null);
  };
  const delProd=(prodId)=>{
    setCatalog(c=>c.filter(p=>p.id!==prodId));
    setConfirm(null);
  };

  return (
    <div>
      <div className="pg-head">
        <div><div className="pg-title">Product Catalogue</div><div className="pg-sub">Manage product lines and their sub-products, modules, and value-add features.</div></div>
        <div className="pg-actions"><button className="btn btn-primary" onClick={openAddProd}><Plus size={14}/>Add Product</button></div>
      </div>
      <div className="prod-catalog-grid">
        {catalog.map(p=>{
          const isOpen=expanded[p.id];
          const modCounts={};
          p.modules.forEach(m=>{modCounts[m.type]=(modCounts[m.type]||0)+1;});
          return (
            <div key={p.id} className="prod-catalog-card">
              <div className="prod-catalog-head" onClick={()=>toggle(p.id)}>
                <div className="prod-catalog-headleft">
                  <div className="prod-icon" style={{background:p.bg,color:p.color}}>{p.name.replace("Wise","").slice(0,3)}</div>
                  <div>
                    <div className="prod-catalog-name">{p.name}</div>
                    <div className="prod-catalog-desc">{p.desc}</div>
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:4,display:"flex",alignItems:"center",gap:6}}
                         onClick={e=>e.stopPropagation()}>
                      <span>Line Manager:</span>
                      {isAdmin ? (
                        <select
                          value={p.lineManagerId||""}
                          onChange={e=>{
                            const v=e.target.value;
                            setCatalog(c=>c.map(x=>x.id===p.id?{...x,lineManagerId:v}:x));
                          }}
                          style={{fontSize:11,padding:"2px 6px",border:"1px solid var(--border)",borderRadius:4,background:"#fff",fontWeight:600,color:p.lineManagerId?"var(--text1)":"#DC2626",minWidth:160}}
                          title="Reassign this product's Line Manager (admin only)"
                        >
                          <option value="">— Unassigned —</option>
                          {managerCandidates.map(u=>(
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{fontWeight:600,color:p.lineManagerId?"var(--text1)":"#DC2626"}}>
                          {p.lineManagerId ? (userById[p.lineManagerId]?.name || "Unknown") : "Unassigned"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="prod-catalog-stats">
                  <span style={{fontSize:12,color:"var(--text3)"}}>{p.modules.length} modules</span>
                  {Object.entries(modCounts).map(([t,c])=>(
                    <span key={t} className={`module-type-tag ${MOD_TYPE_CLS[t]||"mod-core"}`}>{c} {t}</span>
                  ))}
                  <button className="btn btn-primary btn-xs" onClick={e=>{e.stopPropagation();openAddMod(p.id);}}><Plus size={11}/>Module</button>
                  <button className="icon-btn" title="Edit product" onClick={e=>{e.stopPropagation();openEditProd(p);}}><Edit2 size={13}/></button>
                  <button className="icon-btn" title="Delete product" onClick={e=>{e.stopPropagation();setConfirm({type:"product",prodId:p.id,name:p.name});}}><Trash2 size={13}/></button>
                  <ChevronDown size={16} style={{color:"var(--text3)",transform:isOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}/>
                </div>
              </div>
              {isOpen&&(
                <div className="prod-catalog-body">
                  {p.modules.length===0&&<div style={{padding:"16px 18px",color:"var(--text3)",fontSize:13}}>No modules yet. Add the first module or sub-product above.</div>}
                  {p.modules.map(m=>{
                    const mrp=Number(m.mrp)||0;
                    const cur=m.currency||"INR";
                    const sym=cur==="INR"?"₹":cur==="USD"?"$":cur==="EUR"?"€":cur+" ";
                    const setup=Number(m.setupFee)||0;
                    const griOn=m.griApplicable==="Yes" && Number(m.griPercentage)>0;
                    return (
                    <div key={m.id} className="module-row">
                      <span className={`module-type-tag ${MOD_TYPE_CLS[m.type]||"mod-core"}`}>{m.type}</span>
                      <span className="module-name">{m.name}</span>
                      <span className="module-desc">{m.desc}</span>
                      {/* ── Compact pricing-logic badges ── */}
                      {/* Each badge appears only when the field is actually set, so older modules
                          without pricing data still render clean (just MRP + edit/delete). */}
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center",justifyContent:"flex-end",flexShrink:0}}>
                        {m.licenseType && (
                          <span title="License Type (commercial model)" style={{fontSize:10.5,fontWeight:600,color:"#3730A3",background:"#EEF2FF",border:"1px solid #C7D2FE",padding:"2px 7px",borderRadius:10,whiteSpace:"nowrap"}}>{m.licenseType}</span>
                        )}
                        {m.billingFrequency && (
                          <span title="Billing Frequency" style={{fontSize:10.5,fontWeight:600,color:"#1D4ED8",background:"#EFF6FF",border:"1px solid #BFDBFE",padding:"2px 7px",borderRadius:10,whiteSpace:"nowrap"}}>{m.billingFrequency}</span>
                        )}
                        {griOn && (
                          <span title="Annual GRI (Growth Rate Increase)" style={{fontSize:10.5,fontWeight:600,color:"#92400E",background:"#FFFBEB",border:"1px solid #FDE68A",padding:"2px 7px",borderRadius:10,whiteSpace:"nowrap"}}>GRI {m.griPercentage}%</span>
                        )}
                        {setup>0 && (
                          <span title="One-time setup fee" style={{fontSize:10.5,fontWeight:600,color:"#5B21B6",background:"#EDE9FE",border:"1px solid #DDD6FE",padding:"2px 7px",borderRadius:10,whiteSpace:"nowrap"}}>Setup {sym}{setup.toLocaleString()}</span>
                        )}
                        {Number(m.gstRate)>0 && (
                          <span title="GST rate carried to quote line" style={{fontSize:10.5,fontWeight:600,color:"#0F766E",background:"#F0FDFA",border:"1px solid #99F6E4",padding:"2px 7px",borderRadius:10,whiteSpace:"nowrap"}}>GST {m.gstRate}%</span>
                        )}
                        <span style={{fontSize:11,fontWeight:600,color:mrp>0?"#047857":"#94A3B8",background:mrp>0?"#ECFDF5":"#F1F5F9",border:`1px solid ${mrp>0?"#A7F3D0":"#E2E8F0"}`,padding:"2px 8px",borderRadius:10,whiteSpace:"nowrap"}} title="List price (MRP)">
                          {/* MRP label appends cadence for Per-User pricing so SaaS modules
                              read as "₹X / User / Month" instead of just "₹X / User". For all
                              other pricing models we keep the plain "₹X / Unit" form. */}
                          {mrp>0
                            ? (m.pricingModel==="Per-User" && m.billingFrequency)
                              ? `${sym}${mrp.toLocaleString()} / ${m.unit||"User"} / ${m.billingFrequency}`
                              : `${sym}${mrp.toLocaleString()} / ${m.unit||"License"}`
                            : "No MRP"}
                        </span>
                      </div>
                      <div style={{display:"flex",gap:4,flexShrink:0}}>
                        <button className="icon-btn" onClick={()=>openEditMod(p.id,m)}><Edit2 size={13}/></button>
                        <button className="icon-btn" onClick={()=>setConfirm({prodId:p.id,modId:m.id,name:m.name})}><Trash2 size={13}/></button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {(modal?.mode==="addmod"||modal?.mode==="editmod")&&(
        <Modal title={modal.mode==="addmod"?"Add Module / Sub-Product":"Edit Module"} onClose={()=>setModal(null)}
          size="xl" draggable resizable
          footer={<><button className="btn btn-sec" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={saveMod}><Check size={14}/>Save Module</button></>}>
          {(()=>{const prod=catalog.find(c=>c.id===modal.prodId)||PROD_MAP[modal.prodId];return prod?(
            <div style={{background:prod.bg,border:`1.5px solid ${prod.color}22`,borderRadius:8,padding:"8px 12px",marginBottom:16,fontSize:12.5,fontWeight:600,color:prod.color}}>
              Product: {prod.name}
            </div>
          ):null;})()}

          {/* ── BASICS ── */}
          <details open style={{marginBottom:12,border:"1px solid var(--border)",borderRadius:6}}>
            <summary style={{cursor:"pointer",padding:"8px 12px",background:"var(--s2)",fontSize:11,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px"}}>BASICS</summary>
            <div style={{padding:"10px 12px"}}>
              <div className="form-row full"><div className="form-group"><label>Module / Feature Name *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Ocean Tracking, OCR Engine, Mobile App"/></div></div>
              <div className="form-row three">
                <div className="form-group"><label>Type</label>
                  <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                    {["Core","Add-on","Integration","Analytics","Mobile"].map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Unit
                  <HelpTooltip text="What the MRP is priced per: License, User, Site, Setup (one-time), Year, Month, Transaction."/>
                </label>
                  <select value={form.unit} onChange={e=>setForm(f=>({...f,unit:e.target.value}))}>
                    {["License","User","Site","Setup","Year","Month","Transaction"].map(u=><option key={u}>{u}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Currency</label>
                  <select value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}>
                    {["INR","USD","EUR","GBP","AED","SGD"].map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group"><label>Description</label><textarea value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} rows={2} placeholder="Brief description of what this module does…"/></div>
            </div>
          </details>

          {/* ── PRICING & BILLING ── */}
          <details open style={{marginBottom:12,border:"1px solid var(--border)",borderRadius:6}}>
            <summary style={{cursor:"pointer",padding:"8px 12px",background:"var(--s2)",fontSize:11,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px"}}>PRICING &amp; BILLING</summary>
            <div style={{padding:"10px 12px"}}>
              {/* License Type sits at the top because it's the COMMERCIAL framing
                  the customer signs up for — it informs how the rest of this
                  section should be filled (e.g. Perpetual+AMC means Setup Fee
                  carries the license cost and MRP is the recurring AMC). */}
              <div className="form-row full">
                <div className="form-group"><label>License Type
                  <HelpTooltip text="Commercial model the customer signs up for. SaaS — Per User options are cadence-bound (Month / Quarter / Year) and auto-set Pricing Model = Per-User, Unit = User, and Billing Frequency to match. SaaS Subscription = recurring on the chosen Billing Frequency without per-seat math. Term License = fixed-term contract (1Y/3Y) with renewal. Perpetual (OTD) = one-time payment. Perpetual + AMC = one-time license (Setup Fee) + recurring annual maintenance (MRP)."/>
                </label>
                  <select value={form.licenseType||""} onChange={e=>{
                    const lt=e.target.value;
                    setForm(f=>{
                      const next={...f, licenseType:lt};
                      // Auto-derive dependent fields so the commercial framing
                      // the user picked stays consistent with pricing math &
                      // billing cadence. User can still override afterwards.
                      if(lt==="SaaS — Per User / Month")     return {...next, pricingModel:"Per-User", unit:"User", billingFrequency:"Monthly"};
                      if(lt==="SaaS — Per User / Quarterly") return {...next, pricingModel:"Per-User", unit:"User", billingFrequency:"Quarterly"};
                      if(lt==="SaaS — Per User / Yearly")    return {...next, pricingModel:"Per-User", unit:"User", billingFrequency:"Annual"};
                      if(lt==="Perpetual (OTD)")             return {...next, billingFrequency:"One-time"};
                      if(lt==="Perpetual + AMC")             return {...next, billingFrequency:"Annual"};
                      return next;
                    });
                  }}>
                    <option value="">— Not set —</option>
                    <option value="SaaS Subscription">SaaS Subscription</option>
                    <option value="SaaS — Per User / Month">SaaS — Per User / Month</option>
                    <option value="SaaS — Per User / Quarterly">SaaS — Per User / Quarterly</option>
                    <option value="SaaS — Per User / Yearly">SaaS — Per User / Yearly</option>
                    <option value="Term License">Term License (fixed term + renewal)</option>
                    <option value="Perpetual (OTD)">Perpetual (OTD) — one-time</option>
                    <option value="Perpetual + AMC">Perpetual + Annual Maintenance</option>
                  </select>
                </div>
              </div>
              <div className="form-row three">
                <div className="form-group"><label>MRP / List Price
                  <HelpTooltip text="Master rate (no discount). Quotes auto-populate this when the module is added; the rep then applies a discount in % or absolute amount."/>
                </label>
                  <input type="number" min={0} step={1} value={form.mrp} onChange={e=>setForm(f=>({...f,mrp:+e.target.value}))} placeholder="0"/>
                </div>
                <div className="form-group"><label>Setup Fee
                  <HelpTooltip text="One-time fee charged on top of the recurring MRP. Use for: onboarding / implementation, OR the upfront license cost when License Type is Perpetual + AMC (then MRP carries the recurring annual maintenance). Carried onto the quote line so the proposal PDF can show it separately."/>
                </label>
                  <input type="number" min={0} step={1} value={form.setupFee||0} onChange={e=>setForm(f=>({...f,setupFee:+e.target.value}))} placeholder="0"/>
                </div>
                <div className="form-group"><label>Min Commitment / period
                  <HelpTooltip text="Revenue floor per billing period (Monthly / Quarterly / Annual depending on Frequency). If actual usage falls below this, the customer is still billed the floor. Optional."/>
                </label>
                  <input type="number" min={0} step={1} value={form.minCommitment||0} onChange={e=>setForm(f=>({...f,minCommitment:+e.target.value}))} placeholder="0"/>
                </div>
              </div>
              <div className="form-row three">
                <div className="form-group"><label>Billing Frequency
                  <HelpTooltip text="How often the customer is billed for this module. Drives the invoice scheduler in Contracts and the recurring badge on the quote line."/>
                </label>
                  <select value={form.billingFrequency||""} onChange={e=>setForm(f=>({...f,billingFrequency:e.target.value}))}>
                    <option value="">— Not set —</option>
                    {["One-time","Monthly","Quarterly","Half-Yearly","Annual","Per-Transaction","Usage-based"].map(b=><option key={b}>{b}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Pricing Model
                  <HelpTooltip text="How the line is priced: Flat (fixed regardless of qty), Per-Unit (MRP × qty — the default), Per-Transaction / Volume / Tiered (rate scales with quantity bands)."/>
                </label>
                  <select value={form.pricingModel||""} onChange={e=>setForm(f=>({...f,pricingModel:e.target.value}))}>
                    <option value="">— Not set —</option>
                    {["Flat","Per-Unit","Per-User","Per-Transaction","Tiered","Volume","Usage-based"].map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Default Contract Term
                  <HelpTooltip text="Default term in months when this module is added to a contract (e.g. 12 / 24 / 36). The contract owner can override at signing."/>
                </label>
                  <select value={String(form.defaultTermMonths||0)} onChange={e=>setForm(f=>({...f,defaultTermMonths:+e.target.value}))}>
                    <option value="0">— Not set —</option>
                    <option value="12">12 months</option>
                    <option value="24">24 months</option>
                    <option value="36">36 months</option>
                    <option value="60">60 months</option>
                  </select>
                </div>
              </div>
            </div>
          </details>

          {/* ── TAX & ESCALATION ── */}
          <details open style={{marginBottom:12,border:"1px solid var(--border)",borderRadius:6}}>
            <summary style={{cursor:"pointer",padding:"8px 12px",background:"var(--s2)",fontSize:11,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px"}}>TAX &amp; ANNUAL ESCALATION</summary>
            <div style={{padding:"10px 12px"}}>
              <div className="form-row three">
                <div className="form-group"><label>GST Rate (%)
                  <HelpTooltip text="Per-module GST slab. Snapshot to the quote line. Today the quote-level Tax Mode + Place of Supply still drive the actual CGST/SGST/IGST split — this field is carried for compliance reporting and future per-line GST overrides."/>
                </label>
                  <select value={String(form.gstRate||0)} onChange={e=>setForm(f=>({...f,gstRate:+e.target.value}))}>
                    {[0,5,12,18,28].map(r=><option key={r} value={r}>{r===0?"0% (Exempt / Zero-rated)":`${r}%`}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>HSN / SAC Code
                  <HelpTooltip text="6 or 8-digit HSN (goods) / SAC (services) code printed on the tax invoice and quote PDF. Required for B2B invoicing in India. Optional in masters but recommended."/>
                </label>
                  <input value={form.hsnSac||""} onChange={e=>setForm(f=>({...f,hsnSac:e.target.value}))} placeholder="e.g. 998314"/>
                </div>
              </div>
              <div className="form-row three">
                <div className="form-group"><label>Annual GRI Applicable?
                  <HelpTooltip text="GRI = Growth Rate Increase, the standard SaaS annual price escalation. When Yes, contracts auto-apply the % below at each renewal anniversary."/>
                </label>
                  <select value={form.griApplicable||"No"} onChange={e=>setForm(f=>({...f,griApplicable:e.target.value}))}>
                    <option>No</option>
                    <option>Yes</option>
                  </select>
                </div>
                <div className="form-group"><label>GRI %
                  <HelpTooltip text="Year-on-year price escalation %. Typical SaaS contracts: 3–7%. Only applied when GRI Applicable = Yes."/>
                </label>
                  <input type="number" min={0} max={100} step={0.5} value={form.griPercentage||0} onChange={e=>setForm(f=>({...f,griPercentage:+e.target.value}))} disabled={form.griApplicable!=="Yes"} placeholder="0"/>
                </div>
              </div>
            </div>
          </details>
        </Modal>
      )}
      {(modal?.mode==="addprod"||modal?.mode==="editprod")&&(
        <Modal title={modal.mode==="addprod"?"Add Product Line":"Edit Product Line"} onClose={()=>setModal(null)}
          footer={<><button className="btn btn-sec" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={saveProd}><Check size={14}/>Save Product</button></>}>
          <div className="form-row full"><div className="form-group"><label>Product Name *</label><input autoFocus value={prodForm.name} onChange={e=>setProdForm(f=>({...f,name:e.target.value}))} placeholder="e.g. WiseFleet, iLogistics, CargoOne"/></div></div>
          <div className="form-row full"><div className="form-group"><label>Description</label><input value={prodForm.desc} onChange={e=>setProdForm(f=>({...f,desc:e.target.value}))} placeholder="Brief tagline (e.g. Fleet Management Suite)"/></div></div>
          <div className="form-row full"><div className="form-group">
            <label>Line Manager (Product Owner)
              <HelpTooltip text="Owns this product line. Any lead/opportunity uploaded for this product without an assignee is auto-routed to this person — they then re-assign to a sales rep."/>
            </label>
            <select value={prodForm.lineManagerId} onChange={e=>setProdForm(f=>({...f,lineManagerId:e.target.value}))}>
              <option value="">— Unassigned —</option>
              {managerCandidates.map(u=>(
                <option key={u.id} value={u.id}>{u.name}{u.role?` · ${u.role}`:""}</option>
              ))}
            </select>
          </div></div>
          <div className="form-group" style={{marginBottom:14}}>
            <label>Theme Colour</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:6}}>
              {COLOR_PRESETS.map(c=>(
                <button key={c.color} type="button" onClick={()=>setProdForm(f=>({...f,color:c.color,bg:c.bg}))}
                  style={{padding:"6px 12px",borderRadius:8,border:prodForm.color===c.color?`2px solid ${c.color}`:"1px solid var(--border)",background:c.bg,color:c.color,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                  <span style={{width:12,height:12,borderRadius:3,background:c.color}}/>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{padding:"10px 14px",background:prodForm.bg,border:`1.5px solid ${prodForm.color}33`,borderRadius:8,fontSize:13,color:prodForm.color,fontWeight:600,display:"flex",alignItems:"center",gap:10}}>
            <div className="prod-icon" style={{background:"#fff",color:prodForm.color,border:`1px solid ${prodForm.color}33`}}>{(prodForm.name||"NEW").replace("Wise","").slice(0,3).toUpperCase()}</div>
            <div>
              <div style={{fontSize:13,fontWeight:700}}>{prodForm.name||"Preview"}</div>
              <div style={{fontSize:11,opacity:0.8,fontWeight:500}}>{prodForm.desc||"Tagline preview"}</div>
            </div>
          </div>
        </Modal>
      )}
      {confirm&&confirm.type==="product"&&<Confirm title="Delete Product Line" msg={`Permanently remove "${confirm.name}" and all its modules? This cannot be undone.`} onConfirm={()=>delProd(confirm.prodId)} onCancel={()=>setConfirm(null)}/>}
      {confirm&&!confirm.type&&<Confirm title="Delete Module" msg={`Remove "${confirm.name}" permanently from this product?`} onConfirm={()=>delMod(confirm.prodId,confirm.modId)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}

export default Masters;
