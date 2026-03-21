import { useState } from "react";
import { Plus, Edit2, Trash2, Check, X, ChevronRight, Building2, MapPin, Network, GitBranch, Users } from "lucide-react";
import { TEAM, TEAM_MAP, COUNTRIES } from '../data/constants';
import { uid } from '../utils/helpers';
import { Modal, Confirm, UserPill, ProdTag } from './shared';

export default function OrgHierarchy({org,setOrg,users}) {
  const [tab,setTab]=useState("tree");
  const [selected,setSelected]=useState({level:null,id:null});
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [confirm,setConfirm]=useState(null);

  const mkt  = (id)=>org.markets.find(m=>m.id===id);
  const co   = (id)=>org.companies.find(c=>c.id===id);
  const div  = (id)=>org.divisions.find(d=>d.id===id);
  const br   = (id)=>org.branches.find(b=>b.id===id);
  const dep  = (id)=>org.departments.find(d=>d.id===id);
  const TYPE_CLS={HQ:"org-tag-hq",Office:"org-tag-office",Remote:"org-tag-remote",Partner:"org-tag-partner",Subsidiary:"org-tag-sub","Internal HQ":"org-tag-internal"};

  const openAdd=(level,parentKey,parentVal)=>{
    setForm({name:"",type:"Office",...(parentKey?{[parentKey]:parentVal}:{})});
    setModal({mode:"add",level});
  };
  const save=(level)=>{
    const key={markets:"markets",companies:"companies",divisions:"divisions",branches:"branches",departments:"departments"}[level];
    const newItem={id:`${level.slice(0,2)}${uid()}`,...form};
    setOrg(o=>({...o,[key]:[...o[key],newItem]}));
    setModal(null);
  };
  const del=(level,id)=>{
    const key={markets:"markets",companies:"companies",divisions:"divisions",branches:"branches",departments:"departments"}[level];
    setOrg(o=>({...o,[key]:o[key].filter(x=>x.id!==id)}));
    setConfirm(null);
  };

  const LEVELS=[
    {key:"markets",   label:"Markets",    parentKey:null,          parentLabel:null},
    {key:"companies", label:"Companies",  parentKey:"marketId",    parentLabel:"Market"},
    {key:"divisions", label:"Divisions",  parentKey:"companyId",   parentLabel:"Company"},
    {key:"branches",  label:"Branches",   parentKey:"divisionId",  parentLabel:"Division"},
    {key:"departments",label:"Departments",parentKey:"branchId",   parentLabel:"Branch"},
  ];

  const getBreadcrumb=()=>{
    if(!selected.id) return [];
    const {level,id}=selected;
    const crumbs=[];
    if(level==="departments"){
      const d=dep(id); if(!d) return [];
      const b=br(d.branchId); if(b){
        const dv=div(b.divisionId); if(dv){
          const c=co(dv.companyId); if(c){
            const m=mkt(c.marketId); if(m) crumbs.push({label:m.name,level:"markets",id:m.id});
            crumbs.push({label:c.name,level:"companies",id:c.id});
          }
          crumbs.push({label:dv.name,level:"divisions",id:dv.id});
        }
        crumbs.push({label:b.name,level:"branches",id:b.id});
      }
      crumbs.push({label:d.name,level:"departments",id:d.id});
    }
    return crumbs;
  };

  const filteredForLevel=(levelKey)=>{
    const {level:selLevel,id:selId}=selected;
    if(!selLevel||!selId) return org[levelKey];
    const parentMap={companies:"markets",divisions:"companies",branches:"divisions",departments:"branches"};
    const parentLevel=parentMap[levelKey];
    if(!parentLevel) return org[levelKey];
    // find if selected is an ancestor
    if(levelKey==="companies"&&selLevel==="markets") return org.companies.filter(c=>c.marketId===selId);
    if(levelKey==="divisions"&&selLevel==="companies") return org.divisions.filter(d=>d.companyId===selId);
    if(levelKey==="branches"&&selLevel==="divisions") return org.branches.filter(b=>b.divisionId===selId);
    if(levelKey==="departments"&&selLevel==="branches") return org.departments.filter(d=>d.branchId===selId);
    return org[levelKey];
  };

  return (
    <div>
      <div className="pg-head">
        <div>
          <div className="pg-title">Organisation Hierarchy</div>
          <div className="pg-sub">Market &rarr; Company &rarr; Division &rarr; Branch &rarr; Department &middot; Click any card to drill down</div>
        </div>
        <div className="pg-actions">
          {["tree","flat"].map(t=><button key={t} className={`btn btn-sm ${tab===t?"btn-primary":"btn-sec"}`} onClick={()=>setTab(t)}>{t==="tree"?"Tree View":"Flat View"}</button>)}
        </div>
      </div>

      {selected.id&&(
        <div className="org-breadcrumb">
          <span className="crumb" onClick={()=>setSelected({level:null,id:null})}>All</span>
          {getBreadcrumb().map((c,i)=>(
            <span key={i} style={{display:"flex",alignItems:"center",gap:6}}>
              <span className="sep">&rsaquo;</span>
              <span className="crumb" onClick={()=>setSelected({level:c.level,id:c.id})}>{c.label}</span>
            </span>
          ))}
        </div>
      )}

      <div className="org-page">
        {LEVELS.map(lv=>{
          const items=tab==="tree"?filteredForLevel(lv.key):org[lv.key];
          return (
            <div key={lv.key}>
              <div className="org-level-label">
                <span>{lv.label}</span>
                <span style={{fontWeight:400,letterSpacing:0}}>{items.length} records</span>
                <button className="btn btn-primary btn-xs" onClick={()=>openAdd(lv.key,lv.parentKey,selected.id||"")}><Plus size={11}/>Add</button>
              </div>
              <div className="org-cards">
                {items.map(item=>{
                  const isSelected=selected.id===item.id;
                  // find parent label
                  let parentName="";
                  if(lv.key==="companies") parentName=mkt(item.marketId)?.name||"";
                  if(lv.key==="divisions") parentName=co(item.companyId)?.name||"";
                  if(lv.key==="branches")  parentName=div(item.divisionId)?.name||"";
                  if(lv.key==="departments") parentName=br(item.branchId)?.name||"";
                  const headUser=users?.find(u=>u.id===item.head)||TEAM_MAP[item.head];

                  return (
                    <div key={item.id} className={`org-card${isSelected?" selected":""}`} onClick={()=>setSelected(isSelected?{level:null,id:null}:{level:lv.key,id:item.id})}>
                      <div className="org-card-head">
                        <div>
                          <div className="org-card-name">{item.name}</div>
                          {parentName&&<div className="org-card-sub">{parentName}</div>}
                        </div>
                        <div style={{display:"flex",gap:4}}>
                          <button className="icon-btn" onClick={e=>{e.stopPropagation();setForm({...item});setModal({mode:"edit",level:lv.key});}}><Edit2 size={13}/></button>
                          <button className="icon-btn" onClick={e=>{e.stopPropagation();setConfirm({level:lv.key,id:item.id,name:item.name});}}><Trash2 size={13}/></button>
                        </div>
                      </div>
                      <div className="org-card-meta">
                        {item.type&&<span className={`org-tag ${TYPE_CLS[item.type]||"org-tag-office"}`}>{item.type}</span>}
                        {item.country&&<span className="org-tag" style={{background:"var(--s3)",color:"var(--text2)"}}>{item.country}</span>}
                        {item.region&&<span className="org-tag" style={{background:"var(--s3)",color:"var(--text2)"}}>{item.region}</span>}
                        {item.city&&<span style={{fontSize:11,color:"var(--text3)"}}>{item.city}</span>}
                        {headUser&&<span className="u-pill"><span className="u-av" style={{width:18,height:18,fontSize:8}}>{headUser.initials}</span><span style={{fontSize:11,color:"var(--text3)"}}>Head: {headUser.name}</span></span>}
                        {item.headcount&&<span style={{fontSize:11,color:"var(--text3)"}}>{item.headcount} members</span>}
                        {item.products&&item.products.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:2}}>{item.products.map(p=><ProdTag key={p} pid={p}/>)}</div>}
                      </div>
                      {item.address&&<div style={{fontSize:11,color:"var(--text3)",marginTop:6,paddingTop:6,borderTop:"1px solid var(--border)"}}><MapPin size={10} style={{verticalAlign:"middle",marginRight:3}}/>{item.address}</div>}
                      {item.notes&&<div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>{item.notes}</div>}
                    </div>
                  );
                })}
                {items.length===0&&<div style={{color:"var(--text3)",fontSize:13,padding:"8px 0"}}>No {lv.label.toLowerCase()} yet.</div>}
              </div>
            </div>
          );
        })}
      </div>

      {modal&&(
        <Modal title={`${modal.mode==="add"?"Add":"Edit"} ${modal.level?.replace(/s$/,"")}`} onClose={()=>setModal(null)}
          footer={<><button className="btn btn-sec" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={()=>save(modal.level)}><Check size={14}/>Save</button></>}>
          <div className="form-row full"><div className="form-group"><label>Name *</label><input value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder={`${modal.level?.replace(/s$/,"")} name…`}/></div></div>
          {modal.level==="markets"&&<div className="form-row"><div className="form-group"><label>Region</label><input value={form.region||""} onChange={e=>setForm(f=>({...f,region:e.target.value}))} placeholder="e.g. South Asia"/></div><div className="form-group"><label>Head</label><select value={form.head||""} onChange={e=>setForm(f=>({...f,head:e.target.value}))}><option value="">Select…</option>{TEAM.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div></div>}
          {modal.level==="companies"&&<>
            <div className="form-row"><div className="form-group"><label>Market</label><select value={form.marketId||""} onChange={e=>setForm(f=>({...f,marketId:e.target.value}))}><option value="">Select…</option>{org.markets.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div><div className="form-group"><label>Type</label><select value={form.type||"Internal HQ"} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{["Internal HQ","Subsidiary","Partner","Associate"].map(t=><option key={t}>{t}</option>)}</select></div></div>
            <div className="form-row"><div className="form-group"><label>Country</label><input value={form.country||""} onChange={e=>setForm(f=>({...f,country:e.target.value}))}/></div><div className="form-group"><label>Reg. No.</label><input value={form.regNo||""} onChange={e=>setForm(f=>({...f,regNo:e.target.value}))}/></div></div>
          </>}
          {modal.level==="divisions"&&<div className="form-row"><div className="form-group"><label>Company</label><select value={form.companyId||""} onChange={e=>setForm(f=>({...f,companyId:e.target.value}))}><option value="">Select…</option>{org.companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="form-group"><label>Head</label><select value={form.head||""} onChange={e=>setForm(f=>({...f,head:e.target.value}))}><option value="">Select…</option>{TEAM.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div></div>}
          {modal.level==="branches"&&<>
            <div className="form-row"><div className="form-group"><label>Division</label><select value={form.divisionId||""} onChange={e=>setForm(f=>({...f,divisionId:e.target.value}))}><option value="">Select…</option>{org.divisions.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div><div className="form-group"><label>Type</label><select value={form.type||"Office"} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{["HQ","Office","Remote","Virtual"].map(t=><option key={t}>{t}</option>)}</select></div></div>
            <div className="form-row"><div className="form-group"><label>City</label><input value={form.city||""} onChange={e=>setForm(f=>({...f,city:e.target.value}))}/></div><div className="form-group"><label>Country</label><input value={form.country||""} onChange={e=>setForm(f=>({...f,country:e.target.value}))}/></div></div>
            <div className="form-row full"><div className="form-group"><label>Address</label><input value={form.address||""} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></div></div>
          </>}
          {modal.level==="departments"&&<div className="form-row"><div className="form-group"><label>Branch</label><select value={form.branchId||""} onChange={e=>setForm(f=>({...f,branchId:e.target.value}))}><option value="">Select…</option>{org.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><div className="form-group"><label>Head</label><select value={form.head||""} onChange={e=>setForm(f=>({...f,head:e.target.value}))}><option value="">Select…</option>{TEAM.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div></div>}
        </Modal>
      )}
      {confirm&&<Confirm title="Delete Entry" msg={`Remove "${confirm.name}" and all sub-entries? This cannot be undone.`} onConfirm={()=>del(confirm.level,confirm.id)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
