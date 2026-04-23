import { useState } from "react";
import { Plus, Edit2, Trash2, Check, X, ChevronDown, Search } from "lucide-react";
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
    { key:"stages",          title:"Legacy Deal Stages", subKey:"probability", subLabel:"Prob %", subType:"num",
      help:"Probability % is used in weighted pipeline forecasting. Won = 100, Lost = 0." },
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
`;

function Masters({masters,setMasters,catalog,setCatalog,orgUsers=[]}) {
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

      {tab==="products" && <ProductCatalogPage catalog={catalog} setCatalog={setCatalog} orgUsers={orgUsers}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PRODUCT CATALOG PAGE
// ═══════════════════════════════════════════════════════════════════
const MOD_TYPE_CLS={Core:"mod-core","Add-on":"mod-addon",Integration:"mod-integration",Analytics:"mod-analytics",Mobile:"mod-mobile"};

function ProductCatalogPage({catalog,setCatalog,orgUsers=[]}) {
  const [expanded,setExpanded]=useState({});
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({name:"",type:"Core",desc:""});
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
  const openAddMod=prodId=>{setForm({name:"",type:"Core",desc:""});setModal({mode:"addmod",prodId});};
  const openEditMod=(prodId,mod)=>{setForm({name:mod.name,type:mod.type,desc:mod.desc});setModal({mode:"editmod",prodId,modId:mod.id});};
  const saveMod=()=>{
    if(!form.name.trim()) return;
    setCatalog(c=>c.map(p=>{
      if(p.id!==modal.prodId) return p;
      if(modal.mode==="addmod") return {...p,modules:[...p.modules,{id:`m_${uid()}`,name:form.name.trim(),type:form.type,desc:form.desc}]};
      return {...p,modules:p.modules.map(m=>m.id===modal.modId?{...m,name:form.name.trim(),type:form.type,desc:form.desc}:m)};
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
                    <div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>
                      Line Manager: <span style={{fontWeight:600,color:p.lineManagerId?"var(--text1)":"#DC2626"}}>
                        {p.lineManagerId ? (userById[p.lineManagerId]?.name || "Unknown") : "Unassigned"}
                      </span>
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
                  {p.modules.map(m=>(
                    <div key={m.id} className="module-row">
                      <span className={`module-type-tag ${MOD_TYPE_CLS[m.type]||"mod-core"}`}>{m.type}</span>
                      <span className="module-name">{m.name}</span>
                      <span className="module-desc">{m.desc}</span>
                      <div style={{display:"flex",gap:4,flexShrink:0}}>
                        <button className="icon-btn" onClick={()=>openEditMod(p.id,m)}><Edit2 size={13}/></button>
                        <button className="icon-btn" onClick={()=>setConfirm({prodId:p.id,modId:m.id,name:m.name})}><Trash2 size={13}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {(modal?.mode==="addmod"||modal?.mode==="editmod")&&(
        <Modal title={modal.mode==="addmod"?"Add Module / Sub-Product":"Edit Module"} onClose={()=>setModal(null)}
          footer={<><button className="btn btn-sec" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={saveMod}><Check size={14}/>Save Module</button></>}>
          {(()=>{const prod=catalog.find(c=>c.id===modal.prodId)||PROD_MAP[modal.prodId];return prod?(
            <div style={{background:prod.bg,border:`1.5px solid ${prod.color}22`,borderRadius:8,padding:"8px 12px",marginBottom:16,fontSize:12.5,fontWeight:600,color:prod.color}}>
              Product: {prod.name}
            </div>
          ):null;})()}
          <div className="form-row full"><div className="form-group"><label>Module / Feature Name *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Ocean Tracking, OCR Engine, Mobile App"/></div></div>
          <div className="form-row">
            <div className="form-group"><label>Type</label>
              <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                {["Core","Add-on","Integration","Analytics","Mobile"].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group"><label>Description</label><textarea value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} rows={2} placeholder="Brief description of what this module does…"/></div>
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
