import { useState } from "react";
import { Plus, Edit2, Trash2, Check, X, ChevronDown, Package } from "lucide-react";
import { useProducts } from '../contexts/ProductsContext';
import { uid } from '../utils/helpers';
import { Modal, Confirm, HelpTooltip, PageTip } from './shared';

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
            {renderSub&&<input value={val.sub} onChange={e=>setVal(v=>({...v,sub:e.target.value}))} placeholder={renderSub} style={{width:80,padding:"5px 8px",border:"1.5px solid var(--border)",borderRadius:6,fontSize:12,outline:"none"}} onKeyDown={e=>{if(e.key==="Enter")saveAdd();if(e.key==="Escape")cancel();}}/>}
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
      <PageTip
        id="masters-tip-v1"
        title="Masters tip:"
        text="Changes to reference data (stages, priorities, countries, etc.) apply immediately across all dropdowns in the app. The Product Catalogue tab manages product lines and their module/add-on structure."
      />
      <div className="pg-head">
        <div><div className="pg-title">Masters</div><div className="pg-sub">Manage reference data and the product catalogue.</div></div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {[{id:"reference",label:"Reference Data"},{id:"billing",label:"Billing & Commercial"},{id:"products",label:"Product Catalogue"}].map(t=>(
          <button key={t.id} className={`btn btn-sm ${tab===t.id?"btn-primary":"btn-sec"}`} onClick={()=>setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {tab==="reference"&&(
        <div className="masters-grid">
          <MasterSection title="Activity Types" items={masters.activityTypes} onAdd={v=>addItem("activityTypes",v)} onEdit={(id,v)=>editItem("activityTypes",id,v)} onDelete={id=>delItem("activityTypes",id)}/>
          <MasterSection title={<span>Deal Stages <HelpTooltip text="Probability % is used in weighted pipeline forecasting. Won = 100, Lost/Suspended = 0. Set values that reflect your average conversion rate at each stage." width={260}/></span>} items={masters.stages} onAdd={v=>addItem("stages",v)} onEdit={(id,v)=>editItem("stages",id,v)} onDelete={id=>delItem("stages",id)} renderSub="Probability %"/>
          <MasterSection title="Customer Types" items={masters.customerTypes} onAdd={v=>addItem("customerTypes",v)} onEdit={(id,v)=>editItem("customerTypes",id,v)} onDelete={id=>delItem("customerTypes",id)}/>
          <MasterSection title="Countries" items={masters.countries} onAdd={v=>addItem("countries",v)} onEdit={(id,v)=>editItem("countries",id,v)} onDelete={id=>delItem("countries",id)} renderSub="Region"/>
          <MasterSection title="Priorities" items={masters.priorities} onAdd={v=>addItem("priorities",v)} onEdit={(id,v)=>editItem("priorities",id,v)} onDelete={id=>delItem("priorities",id)}/>
          <MasterSection title="Ticket Types" items={masters.ticketTypes} onAdd={v=>addItem("ticketTypes",v)} onEdit={(id,v)=>editItem("ticketTypes",id,v)} onDelete={id=>delItem("ticketTypes",id)}/>
          <MasterSection title="Call Types" items={masters.callTypes||[]} onAdd={v=>addItem("callTypes",v)} onEdit={(id,v)=>editItem("callTypes",id,v)} onDelete={id=>delItem("callTypes",id)}/>
          <MasterSection title="Call Subjects / Objectives" items={masters.callSubjects||[]} onAdd={v=>addItem("callSubjects",v)} onEdit={(id,v)=>editItem("callSubjects",id,v)} onDelete={id=>delItem("callSubjects",id)}/>
        </div>
      )}
      {tab==="billing"&&(
        <div className="masters-grid">
          <MasterSection title="Service Categories" items={masters.serviceCategories||[]} onAdd={v=>addItem("serviceCategories",v)} onEdit={(id,v)=>editItem("serviceCategories",id,v)} onDelete={id=>delItem("serviceCategories",id)}/>
          <MasterSection title="Commercial Models" items={masters.commercialModels||[]} onAdd={v=>addItem("commercialModels",v)} onEdit={(id,v)=>editItem("commercialModels",id,v)} onDelete={id=>delItem("commercialModels",id)}/>
          <MasterSection title="Charge Types" items={masters.chargeTypes||[]} onAdd={v=>addItem("chargeTypes",v)} onEdit={(id,v)=>editItem("chargeTypes",id,v)} onDelete={id=>delItem("chargeTypes",id)}/>
          <MasterSection title="Unit of Measures" items={masters.unitOfMeasures||[]} onAdd={v=>addItem("unitOfMeasures",v)} onEdit={(id,v)=>editItem("unitOfMeasures",id,v)} onDelete={id=>delItem("unitOfMeasures",id)}/>
          <MasterSection title="Rate Types" items={masters.rateTypes||[]} onAdd={v=>addItem("rateTypes",v)} onEdit={(id,v)=>editItem("rateTypes",id,v)} onDelete={id=>delItem("rateTypes",id)}/>
          <MasterSection title="Billing Frequencies" items={masters.billingFrequencies||[]} onAdd={v=>addItem("billingFrequencies",v)} onEdit={(id,v)=>editItem("billingFrequencies",id,v)} onDelete={id=>delItem("billingFrequencies",id)}/>
          <MasterSection title="Payment Terms" items={masters.paymentTerms||[]} onAdd={v=>addItem("paymentTerms",v)} onEdit={(id,v)=>editItem("paymentTerms",id,v)} onDelete={id=>delItem("paymentTerms",id)}/>
          <MasterSection title="Invoice Generation Basis" items={masters.invoiceBasis||[]} onAdd={v=>addItem("invoiceBasis",v)} onEdit={(id,v)=>editItem("invoiceBasis",id,v)} onDelete={id=>delItem("invoiceBasis",id)}/>
          <MasterSection title="Renewal Types" items={masters.renewalTypes||[]} onAdd={v=>addItem("renewalTypes",v)} onEdit={(id,v)=>editItem("renewalTypes",id,v)} onDelete={id=>delItem("renewalTypes",id)}/>
          <MasterSection title="Discount Types" items={masters.discountTypes||[]} onAdd={v=>addItem("discountTypes",v)} onEdit={(id,v)=>editItem("discountTypes",id,v)} onDelete={id=>delItem("discountTypes",id)}/>
          <MasterSection title="GRI Types" items={masters.griTypes||[]} onAdd={v=>addItem("griTypes",v)} onEdit={(id,v)=>editItem("griTypes",id,v)} onDelete={id=>delItem("griTypes",id)}/>
          <MasterSection title="GRI Frequencies" items={masters.griFrequencies||[]} onAdd={v=>addItem("griFrequencies",v)} onEdit={(id,v)=>editItem("griFrequencies",id,v)} onDelete={id=>delItem("griFrequencies",id)}/>
          <MasterSection title="Tax Treatments" items={masters.taxTreatments||[]} onAdd={v=>addItem("taxTreatments",v)} onEdit={(id,v)=>editItem("taxTreatments",id,v)} onDelete={id=>delItem("taxTreatments",id)}/>
          <MasterSection title="Customer Tiers" items={masters.customerTiers||[]} onAdd={v=>addItem("customerTiers",v)} onEdit={(id,v)=>editItem("customerTiers",id,v)} onDelete={id=>delItem("customerTiers",id)}/>
          <MasterSection title="Business Units" items={masters.businessUnits||[]} onAdd={v=>addItem("businessUnits",v)} onEdit={(id,v)=>editItem("businessUnits",id,v)} onDelete={id=>delItem("businessUnits",id)}/>
          <MasterSection title="Collection Buckets" items={masters.collectionBuckets||[]} onAdd={v=>addItem("collectionBuckets",v)} onEdit={(id,v)=>editItem("collectionBuckets",id,v)} onDelete={id=>delItem("collectionBuckets",id)}/>
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

// Preset colors for new products
const PRESET_COLORS = [
  { color:"#2563EB", bg:"#EFF6FF", label:"Blue" },
  { color:"#16A34A", bg:"#F0FDF4", label:"Green" },
  { color:"#7C3AED", bg:"#F5F3FF", label:"Purple" },
  { color:"#D97706", bg:"#FFFBEB", label:"Amber" },
  { color:"#0D9488", bg:"#F0FDFA", label:"Teal" },
  { color:"#DC2626", bg:"#FEF2F2", label:"Red" },
  { color:"#DB2777", bg:"#FDF2F8", label:"Pink" },
  { color:"#EA580C", bg:"#FFF7ED", label:"Orange" },
  { color:"#4F46E5", bg:"#EEF2FF", label:"Indigo" },
  { color:"#0891B2", bg:"#ECFEFF", label:"Cyan" },
  { color:"#65A30D", bg:"#F7FEE7", label:"Lime" },
  { color:"#9333EA", bg:"#FAF5FF", label:"Violet" },
];

function ProductCatalogPage({catalog,setCatalog}) {
  const [expanded,setExpanded]=useState({});
  const [modal,setModal]=useState(null); // {mode, prodId?, mod?}
  const [form,setForm]=useState({name:"",type:"Core",desc:""});
  const [prodForm,setProdForm]=useState({id:"",name:"",desc:"",color:"#2563EB",bg:"#EFF6FF"});
  const [confirm,setConfirm]=useState(null);
  const { prodMap } = useProducts();

  const toggle=id=>setExpanded(e=>({...e,[id]:!e[id]}));

  // ── Module operations ──
  const openAddMod=prodId=>{setForm({name:"",type:"Core",desc:""});setModal({mode:"addmod",prodId});};
  const openEditMod=(prodId,mod)=>{setForm({name:mod.name,type:mod.type,desc:mod.desc});setModal({mode:"editmod",prodId,modId:mod.id});};
  const saveMod=()=>{
    if(!form.name.trim()) return;
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

  // ── Product operations ──
  const openAddProduct=()=>{
    const nextColor = PRESET_COLORS[catalog.length % PRESET_COLORS.length];
    setProdForm({id:"",name:"",desc:"",color:nextColor.color,bg:nextColor.bg});
    setModal({mode:"addprod"});
  };
  const openEditProduct=(p)=>{
    setProdForm({id:p.id,name:p.name,desc:p.desc||"",color:p.color||"#2563EB",bg:p.bg||"#EFF6FF"});
    setModal({mode:"editprod",prodId:p.id});
  };
  const saveProduct=()=>{
    if(!prodForm.name.trim()) return;
    if(modal.mode==="addprod"){
      const newId = prodForm.name.replace(/[^a-zA-Z0-9]/g,"");
      setCatalog(c=>[...c,{
        id: newId || `prod_${uid()}`,
        name: prodForm.name.trim(),
        desc: prodForm.desc.trim(),
        color: prodForm.color,
        bg: prodForm.bg,
        modules:[]
      }]);
    } else {
      setCatalog(c=>c.map(p=>p.id!==modal.prodId?p:{
        ...p,
        name: prodForm.name.trim(),
        desc: prodForm.desc.trim(),
        color: prodForm.color,
        bg: prodForm.bg,
      }));
    }
    setModal(null);
  };
  const delProduct=(prodId)=>{
    setCatalog(c=>c.filter(p=>p.id!==prodId));
    setConfirm(null);
  };

  return (
    <div>
      <div className="pg-head">
        <div>
          <div className="pg-title">Product Catalogue</div>
          <div className="pg-sub">Manage product lines (Lines of Business) and their sub-products, modules, and value-add features.</div>
        </div>
        <button className="btn btn-primary" onClick={openAddProduct}><Plus size={14}/> Add Product / LOB</button>
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
                  <button className="btn btn-sec btn-xs" onClick={e=>{e.stopPropagation();openEditProduct(p);}} title="Edit product details"><Edit2 size={11}/>Edit</button>
                  <button className="icon-btn" onClick={e=>{e.stopPropagation();setConfirm({type:"product",prodId:p.id,name:p.name});}} title="Delete product"><Trash2 size={13} style={{color:"#EF4444"}}/></button>
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
                        <button className="icon-btn" onClick={()=>setConfirm({type:"module",prodId:p.id,modId:m.id,name:m.name})}><Trash2 size={13}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {catalog.length===0&&(
          <div style={{padding:"40px 24px",textAlign:"center",color:"var(--text3)",fontSize:14}}>
            <Package size={40} style={{margin:"0 auto 12px",opacity:0.3}}/>
            <div style={{fontWeight:600,marginBottom:4}}>No products yet</div>
            <div>Click "Add Product / LOB" to create your first line of business.</div>
          </div>
        )}
      </div>

      {/* ── Module Modal ── */}
      {modal&&(modal.mode==="addmod"||modal.mode==="editmod")&&(
        <Modal title={modal.mode==="addmod"?"Add Module / Sub-Product":"Edit Module"} onClose={()=>setModal(null)}
          footer={<><button className="btn btn-sec" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={saveMod}><Check size={14}/>Save Module</button></>}>
          <div style={{background:prodMap[modal.prodId]?.bg||"#f1f5f9",border:`1.5px solid ${(prodMap[modal.prodId]?.color||"#64748b")}22`,borderRadius:8,padding:"8px 12px",marginBottom:16,fontSize:12.5,fontWeight:600,color:prodMap[modal.prodId]?.color||"#64748b"}}>
            Product: {prodMap[modal.prodId]?.name||modal.prodId}
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

      {/* ── Product Add/Edit Modal ── */}
      {modal&&(modal.mode==="addprod"||modal.mode==="editprod")&&(
        <Modal title={modal.mode==="addprod"?"Add New Product / Line of Business":"Edit Product Details"} onClose={()=>setModal(null)}
          footer={<><button className="btn btn-sec" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={saveProduct}><Check size={14}/>{modal.mode==="addprod"?"Create Product":"Save Changes"}</button></>}>
          <div className="form-row full">
            <div className="form-group">
              <label>Product Name *</label>
              <input value={prodForm.name} onChange={e=>setProdForm(f=>({...f,name:e.target.value}))} placeholder="e.g. WiseFleet, iTrack, WiseAir" autoFocus/>
            </div>
          </div>
          <div className="form-row full">
            <div className="form-group">
              <label>Description</label>
              <textarea value={prodForm.desc} onChange={e=>setProdForm(f=>({...f,desc:e.target.value}))} rows={2} placeholder="Brief description of this product line / line of business…"/>
            </div>
          </div>
          <div className="form-group">
            <label>Brand Color</label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>
              {PRESET_COLORS.map(c=>(
                <button key={c.color} type="button" onClick={()=>setProdForm(f=>({...f,color:c.color,bg:c.bg}))}
                  style={{
                    width:36,height:36,borderRadius:10,border:prodForm.color===c.color?"3px solid "+c.color:"2px solid var(--border)",
                    background:c.bg,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",
                    transition:"all 0.15s",transform:prodForm.color===c.color?"scale(1.15)":"scale(1)",
                  }}
                  title={c.label}
                >
                  <div style={{width:16,height:16,borderRadius:6,background:c.color}}/>
                </button>
              ))}
            </div>
          </div>
          {/* Preview */}
          <div style={{marginTop:16,padding:"12px 16px",borderRadius:10,border:"1.5px solid var(--border)",background:"var(--s2)"}}>
            <div style={{fontSize:11,color:"var(--text3)",marginBottom:8,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.5px"}}>Preview</div>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:40,height:40,borderRadius:10,background:prodForm.bg,color:prodForm.color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:14}}>
                {(prodForm.name||"NEW").replace("Wise","").slice(0,3)}
              </div>
              <div>
                <div style={{fontWeight:700,fontSize:14,color:"var(--text1)"}}>{prodForm.name||"Product Name"}</div>
                <div style={{fontSize:12,color:"var(--text3)"}}>{prodForm.desc||"Product description"}</div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Confirm Delete ── */}
      {confirm&&confirm.type==="module"&&<Confirm title="Delete Module" msg={`Remove "${confirm.name}" permanently from this product?`} onConfirm={()=>delMod(confirm.prodId,confirm.modId)} onCancel={()=>setConfirm(null)}/>}
      {confirm&&confirm.type==="product"&&<Confirm title="Delete Product" msg={`Permanently delete "${confirm.name}" and all its modules? This product will be removed from all dropdowns across the application.`} onConfirm={()=>delProduct(confirm.prodId)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}

export default Masters;
