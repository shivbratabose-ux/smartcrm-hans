import { useState } from "react";
import { Plus, Edit2, Trash2, Check, X, ChevronDown } from "lucide-react";
import { PRODUCTS, PROD_MAP } from '../data/constants';
import { uid } from '../utils/helpers';
import { Modal, Confirm } from './shared';

// ═══════════════════════════════════════════════════════════════════
// MASTERS PAGE
// ═══════════════════════════════════════════════════════════════════
function MasterSection({title,items,onAdd,onEdit,onDelete,renderSub}) {
  const [adding,setAdding]=useState(false);
  const [editId,setEditId]=useState(null);
  const [val,setVal]=useState({name:"",sub:""});

  const startAdd=()=>{setVal({name:"",sub:""});setAdding(true);setEditId(null);};
  const startEdit=it=>{setVal({name:it.name,sub:it.sub||it.probability||it.region||""});setEditId(it.id);setAdding(false);};
  const saveAdd=()=>{if(!val.name.trim()) return; onAdd(val); setAdding(false);};
  const saveEdit=()=>{if(!val.name.trim()) return; onEdit(editId,val); setEditId(null);};
  const cancel=()=>{setAdding(false);setEditId(null);};

  return (
    <div className="masters-section">
      <div className="masters-sec-head">
        <div className="masters-sec-title">{title} <span style={{fontSize:11,fontWeight:400,color:"var(--text3)",marginLeft:4}}>{items.length} items</span></div>
        <button className="btn btn-primary btn-xs" onClick={startAdd}><Plus size={11}/>Add</button>
      </div>
      {items.map(it=>(
        <div key={it.id} className="masters-item">
          {editId===it.id?(
            <div style={{flex:1,display:"flex",gap:8,alignItems:"center"}}>
              <input value={val.name} onChange={e=>setVal(v=>({...v,name:e.target.value}))} style={{flex:1,padding:"5px 8px",border:"1.5px solid var(--brand)",borderRadius:6,fontSize:13,outline:"none"}}/>
              {renderSub&&<input value={val.sub} onChange={e=>setVal(v=>({...v,sub:e.target.value}))} placeholder={renderSub} style={{width:80,padding:"5px 8px",border:"1.5px solid var(--border)",borderRadius:6,fontSize:12,outline:"none"}}/>}
              <button className="btn btn-primary btn-xs" onClick={saveEdit}><Check size={11}/></button>
              <button className="btn btn-sec btn-xs" onClick={cancel}><X size={11}/></button>
            </div>
          ):(
            <>
              <div style={{flex:1}}>
                <div className="masters-item-name">{it.name}</div>
                {it.probability!==undefined&&<div className="masters-item-sub">Probability: {it.probability}%</div>}
                {it.region&&<div className="masters-item-sub">{it.region}</div>}
              </div>
              <div className="masters-item-actions">
                <button className="icon-btn" onClick={()=>startEdit(it)}><Edit2 size={13}/></button>
                <button className="icon-btn" onClick={()=>onDelete(it.id)}><Trash2 size={13}/></button>
              </div>
            </>
          )}
        </div>
      ))}
      {adding&&(
        <div className="masters-item" style={{background:"var(--s2)"}}>
          <div style={{flex:1,display:"flex",gap:8,alignItems:"center"}}>
            <input autoFocus value={val.name} onChange={e=>setVal(v=>({...v,name:e.target.value}))} placeholder="Name…" style={{flex:1,padding:"5px 8px",border:"1.5px solid var(--brand)",borderRadius:6,fontSize:13,outline:"none"}} onKeyDown={e=>e.key==="Enter"&&saveAdd()}/>
            {renderSub&&<input value={val.sub} onChange={e=>setVal(v=>({...v,sub:e.target.value}))} placeholder={renderSub} style={{width:80,padding:"5px 8px",border:"1.5px solid var(--border)",borderRadius:6,fontSize:12,outline:"none"}}/>}
            <button className="btn btn-primary btn-xs" onClick={saveAdd}><Check size={11}/>Save</button>
            <button className="btn btn-sec btn-xs" onClick={cancel}><X size={11}/></button>
          </div>
        </div>
      )}
    </div>
  );
}

function Masters({masters,setMasters,catalog,setCatalog}) {
  const [tab,setTab]=useState("reference");
  const mk=(key,val)=>setMasters(m=>({...m,[key]:val}));
  const addItem=(key,val)=>mk(key,[...masters[key],{id:`${key.slice(0,2)}${uid()}`,name:val.name,...(val.sub?{probability:+val.sub||0,region:val.sub}:{})}]);
  const editItem=(key,id,val)=>mk(key,masters[key].map(it=>it.id===id?{...it,name:val.name,...(val.sub?{probability:+val.sub||0,region:val.sub}:{})}:it));
  const delItem=(key,id)=>mk(key,masters[key].filter(it=>it.id!==id));

  return (
    <div>
      <div className="pg-head">
        <div><div className="pg-title">Masters</div><div className="pg-sub">Manage reference data and the product catalogue.</div></div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {[{id:"reference",label:"Reference Data"},{id:"products",label:"Product Catalogue"}].map(t=>(
          <button key={t.id} className={`btn btn-sm ${tab===t.id?"btn-primary":"btn-sec"}`} onClick={()=>setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab==="reference"&&(
        <div className="masters-grid">
          <MasterSection title="Activity Types" items={masters.activityTypes} onAdd={v=>addItem("activityTypes",v)} onEdit={(id,v)=>editItem("activityTypes",id,v)} onDelete={id=>delItem("activityTypes",id)}/>
          <MasterSection title="Deal Stages" items={masters.stages} onAdd={v=>addItem("stages",v)} onEdit={(id,v)=>editItem("stages",id,v)} onDelete={id=>delItem("stages",id)} renderSub="Probability %"/>
          <MasterSection title="Customer Types" items={masters.customerTypes} onAdd={v=>addItem("customerTypes",v)} onEdit={(id,v)=>editItem("customerTypes",id,v)} onDelete={id=>delItem("customerTypes",id)}/>
          <MasterSection title="Countries" items={masters.countries} onAdd={v=>addItem("countries",v)} onEdit={(id,v)=>editItem("countries",id,v)} onDelete={id=>delItem("countries",id)} renderSub="Region"/>
          <MasterSection title="Priorities" items={masters.priorities} onAdd={v=>addItem("priorities",v)} onEdit={(id,v)=>editItem("priorities",id,v)} onDelete={id=>delItem("priorities",id)}/>
          <MasterSection title="Ticket Types" items={masters.ticketTypes} onAdd={v=>addItem("ticketTypes",v)} onEdit={(id,v)=>editItem("ticketTypes",id,v)} onDelete={id=>delItem("ticketTypes",id)}/>
          <MasterSection title="Call Types" items={masters.callTypes||[]} onAdd={v=>addItem("callTypes",v)} onEdit={(id,v)=>editItem("callTypes",id,v)} onDelete={id=>delItem("callTypes",id)}/>
          <MasterSection title="Call Subjects / Objectives" items={masters.callSubjects||[]} onAdd={v=>addItem("callSubjects",v)} onEdit={(id,v)=>editItem("callSubjects",id,v)} onDelete={id=>delItem("callSubjects",id)}/>
        </div>
      )}
      {tab==="products"&&<ProductCatalogPage catalog={catalog} setCatalog={setCatalog}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PRODUCT CATALOG PAGE (inside Masters or standalone)
// ═══════════════════════════════════════════════════════════════════
const MOD_TYPE_CLS={Core:"mod-core","Add-on":"mod-addon",Integration:"mod-integration",Analytics:"mod-analytics",Mobile:"mod-mobile"};

function ProductCatalogPage({catalog,setCatalog}) {
  const [expanded,setExpanded]=useState({});
  const [modal,setModal]=useState(null); // {prodId, mod?}
  const [form,setForm]=useState({name:"",type:"Core",desc:""});
  const [confirm,setConfirm]=useState(null);

  const toggle=id=>setExpanded(e=>({...e,[id]:!e[id]}));
  const openAddMod=prodId=>{setForm({name:"",type:"Core",desc:""});setModal({mode:"addmod",prodId});};
  const openEditMod=(prodId,mod)=>{setForm({name:mod.name,type:mod.type,desc:mod.desc});setModal({mode:"editmod",prodId,modId:mod.id});};
  const saveMod=()=>{
    setCatalog(c=>c.map(p=>{
      if(p.id!==modal.prodId) return p;
      if(modal.mode==="addmod") return {...p,modules:[...p.modules,{id:`m_${uid()}`,name:form.name,type:form.type,desc:form.desc}]};
      return {...p,modules:p.modules.map(m=>m.id===modal.modId?{...m,...form}:m)};
    }));
    setModal(null);
  };
  const delMod=(prodId,modId)=>{
    setCatalog(c=>c.map(p=>p.id!==prodId?p:{...p,modules:p.modules.filter(m=>m.id!==modId)}));
    setConfirm(null);
  };

  return (
    <div>
      <div className="pg-head">
        <div><div className="pg-title">Product Catalogue</div><div className="pg-sub">Manage product lines and their sub-products, modules, and value-add features.</div></div>
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
                  </div>
                </div>
                <div className="prod-catalog-stats">
                  <span style={{fontSize:12,color:"var(--text3)"}}>{p.modules.length} modules</span>
                  {Object.entries(modCounts).map(([t,c])=>(
                    <span key={t} className={`module-type-tag ${MOD_TYPE_CLS[t]||"mod-core"}`}>{c} {t}</span>
                  ))}
                  <button className="btn btn-primary btn-xs" onClick={e=>{e.stopPropagation();openAddMod(p.id);}}><Plus size={11}/>Module</button>
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
      {modal&&(
        <Modal title={modal.mode==="addmod"?"Add Module / Sub-Product":"Edit Module"} onClose={()=>setModal(null)}
          footer={<><button className="btn btn-sec" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={saveMod}><Check size={14}/>Save Module</button></>}>
          <div style={{background:PROD_MAP[modal.prodId]?.bg,border:`1.5px solid ${PROD_MAP[modal.prodId]?.color}22`,borderRadius:8,padding:"8px 12px",marginBottom:16,fontSize:12.5,fontWeight:600,color:PROD_MAP[modal.prodId]?.color}}>
            Product: {PROD_MAP[modal.prodId]?.name}
          </div>
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
      {confirm&&<Confirm title="Delete Module" msg={`Remove "${confirm.name}" permanently from this product?`} onConfirm={()=>delMod(confirm.prodId,confirm.modId)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}

export default Masters;
