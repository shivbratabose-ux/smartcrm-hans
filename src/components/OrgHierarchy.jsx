import { useState } from "react";
import { Plus, Edit2, Trash2, Check, X, ChevronRight, ChevronDown, Building2, MapPin, Users, Globe } from "lucide-react";
import { TEAM, TEAM_MAP, COUNTRIES } from '../data/constants';
import { uid } from '../utils/helpers';
import { Modal, Confirm, ProdTag } from './shared';

export default function OrgHierarchy({org,setOrg,users}) {
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [confirm,setConfirm]=useState(null);
  const [expanded,setExpanded]=useState(()=>{
    // Expand all by default
    const ids={};
    org.markets.forEach(m=>ids[m.id]=true);
    org.companies.forEach(c=>ids[c.id]=true);
    org.divisions.forEach(d=>ids[d.id]=true);
    org.branches.forEach(b=>ids[b.id]=true);
    return ids;
  });

  const toggle=(id)=>setExpanded(p=>({...p,[id]:!p[id]}));
  const userById=(id)=>users?.find(u=>u.id===id)||TEAM_MAP[id];

  const TYPE_CLS={HQ:"org-tag-hq",Office:"org-tag-office",Remote:"org-tag-remote",Partner:"org-tag-partner",Subsidiary:"org-tag-sub","Internal HQ":"org-tag-internal"};

  const openAdd=(level,parentKey,parentVal)=>{
    setForm({name:"",type:"Office",...(parentKey?{[parentKey]:parentVal}:{})});
    setModal({mode:"add",level});
  };
  const openEdit=(level,item)=>{
    setForm({...item});
    setModal({mode:"edit",level});
  };
  const save=(level)=>{
    const key=level;
    if(modal.mode==="edit"){
      setOrg(o=>({...o,[key]:o[key].map(x=>x.id===form.id?{...form}:x)}));
    } else {
      const newItem={id:`${level.slice(0,2)}${uid()}`,...form};
      setOrg(o=>({...o,[key]:[...o[key],newItem]}));
    }
    setModal(null);
  };
  const del=(level,id)=>{
    setOrg(o=>({...o,[level]:o[level].filter(x=>x.id!==id)}));
    setConfirm(null);
  };

  // Collapse / Expand all
  const expandAll=()=>{
    const ids={};
    org.markets.forEach(m=>ids[m.id]=true);
    org.companies.forEach(c=>ids[c.id]=true);
    org.divisions.forEach(d=>ids[d.id]=true);
    org.branches.forEach(b=>ids[b.id]=true);
    setExpanded(ids);
  };
  const collapseAll=()=>setExpanded({});

  // ── Tree Node Renderer ──
  const HeadPill=({userId})=>{
    const u=userById(userId);
    if(!u) return null;
    return (
      <span className="ht-head">
        <span className="ht-av">{u.initials}</span>{u.name}
      </span>
    );
  };

  const ActionBtns=({level,item,onAdd})=>(
    <span className="ht-actions">
      {onAdd&&<button className="ht-btn ht-btn-add" onClick={e=>{e.stopPropagation();onAdd();}} title="Add child"><Plus size={11}/></button>}
      <button className="ht-btn" onClick={e=>{e.stopPropagation();openEdit(level,item);}} title="Edit"><Edit2 size={11}/></button>
      <button className="ht-btn ht-btn-del" onClick={e=>{e.stopPropagation();setConfirm({level,id:item.id,name:item.name});}} title="Delete"><Trash2 size={11}/></button>
    </span>
  );

  const DeptNode=({dept})=>{
    const head=userById(dept.head);
    return (
      <div className="ht-node ht-leaf">
        <div className="ht-row">
          <span className="ht-icon ht-icon-dept"><Users size={12}/></span>
          <span className="ht-name">{dept.name}</span>
          {dept.headcount&&<span className="ht-count">{dept.headcount}</span>}
          {head&&<HeadPill userId={dept.head}/>}
          <ActionBtns level="departments" item={dept}/>
        </div>
      </div>
    );
  };

  const BranchNode=({branch})=>{
    const depts=org.departments.filter(d=>d.branchId===branch.id);
    const isOpen=expanded[branch.id];
    return (
      <div className="ht-node">
        <div className="ht-row ht-clickable" onClick={()=>depts.length>0&&toggle(branch.id)}>
          {depts.length>0?(isOpen?<ChevronDown size={13} className="ht-chevron"/>:<ChevronRight size={13} className="ht-chevron"/>):<span style={{width:13}}/>}
          <span className="ht-icon ht-icon-branch"><MapPin size={12}/></span>
          <span className="ht-name">{branch.name}</span>
          {branch.type&&<span className={`org-tag ${TYPE_CLS[branch.type]||"org-tag-office"}`}>{branch.type}</span>}
          {branch.city&&<span className="ht-meta">{branch.city}, {branch.country}</span>}
          <ActionBtns level="branches" item={branch} onAdd={()=>openAdd("departments","branchId",branch.id)}/>
        </div>
        {isOpen&&depts.length>0&&(
          <div className="ht-children">
            {depts.map(d=><DeptNode key={d.id} dept={d}/>)}
          </div>
        )}
      </div>
    );
  };

  const DivisionNode=({division})=>{
    const branches=org.branches.filter(b=>b.divisionId===division.id);
    const isOpen=expanded[division.id];
    const head=userById(division.head);
    return (
      <div className="ht-node">
        <div className="ht-row ht-clickable" onClick={()=>branches.length>0&&toggle(division.id)}>
          {branches.length>0?(isOpen?<ChevronDown size={13} className="ht-chevron"/>:<ChevronRight size={13} className="ht-chevron"/>):<span style={{width:13}}/>}
          <span className="ht-icon ht-icon-div"><Building2 size={12}/></span>
          <span className="ht-name">{division.name}</span>
          {head&&<HeadPill userId={division.head}/>}
          {division.products&&division.products.length>0&&<span className="ht-prods">{division.products.map(p=><ProdTag key={p} pid={p}/>)}</span>}
          <ActionBtns level="divisions" item={division} onAdd={()=>openAdd("branches","divisionId",division.id)}/>
        </div>
        {isOpen&&branches.length>0&&(
          <div className="ht-children">
            {branches.map(b=><BranchNode key={b.id} branch={b}/>)}
          </div>
        )}
      </div>
    );
  };

  const CompanyNode=({company})=>{
    const divisions=org.divisions.filter(d=>d.companyId===company.id);
    const isOpen=expanded[company.id];
    return (
      <div className="ht-node">
        <div className="ht-row ht-clickable" onClick={()=>divisions.length>0&&toggle(company.id)}>
          {divisions.length>0?(isOpen?<ChevronDown size={13} className="ht-chevron"/>:<ChevronRight size={13} className="ht-chevron"/>):<span style={{width:13}}/>}
          <span className="ht-icon ht-icon-co"><Building2 size={12}/></span>
          <span className="ht-name ht-name-bold">{company.name}</span>
          {company.type&&<span className={`org-tag ${TYPE_CLS[company.type]||"org-tag-office"}`}>{company.type}</span>}
          {company.country&&<span className="ht-meta"><Globe size={10}/> {company.country}</span>}
          <ActionBtns level="companies" item={company} onAdd={()=>openAdd("divisions","companyId",company.id)}/>
        </div>
        {isOpen&&divisions.length>0&&(
          <div className="ht-children">
            {divisions.map(d=><DivisionNode key={d.id} division={d}/>)}
          </div>
        )}
      </div>
    );
  };

  const MarketNode=({market})=>{
    const companies=org.companies.filter(c=>c.marketId===market.id);
    const isOpen=expanded[market.id];
    return (
      <div className="ht-node ht-root">
        <div className="ht-row ht-clickable" onClick={()=>companies.length>0&&toggle(market.id)}>
          {companies.length>0?(isOpen?<ChevronDown size={13} className="ht-chevron"/>:<ChevronRight size={13} className="ht-chevron"/>):<span style={{width:13}}/>}
          <span className="ht-icon ht-icon-mkt"><Globe size={12}/></span>
          <span className="ht-name ht-name-bold">{market.name}</span>
          {market.region&&<span className="org-tag" style={{background:"var(--s3)",color:"var(--text2)"}}>{market.region}</span>}
          {market.head&&<HeadPill userId={market.head}/>}
          <ActionBtns level="markets" item={market} onAdd={()=>openAdd("companies","marketId",market.id)}/>
        </div>
        {isOpen&&companies.length>0&&(
          <div className="ht-children">
            {companies.map(c=><CompanyNode key={c.id} company={c}/>)}
          </div>
        )}
      </div>
    );
  };

  // Stats
  const stats=[
    {label:"Markets",val:org.markets.length,color:"var(--brand)"},
    {label:"Companies",val:org.companies.length,color:"var(--blue)"},
    {label:"Divisions",val:org.divisions.length,color:"var(--purple)"},
    {label:"Branches",val:org.branches.length,color:"var(--amber)"},
    {label:"Departments",val:org.departments.length,color:"var(--teal)"},
  ];

  return (
    <div>
      <div className="pg-head">
        <div>
          <div className="pg-title">Organisation Hierarchy</div>
          <div className="pg-sub">Market → Company → Division → Branch → Department</div>
        </div>
        <div className="pg-actions" style={{gap:6}}>
          <button className="btn btn-sm btn-sec" onClick={expandAll}>Expand All</button>
          <button className="btn btn-sm btn-sec" onClick={collapseAll}>Collapse All</button>
          <button className="btn btn-sm btn-primary" onClick={()=>openAdd("markets")}><Plus size={11}/>Add Market</button>
        </div>
      </div>

      {/* Stats row */}
      <div className="ht-stats">
        {stats.map(s=>(
          <div key={s.label} className="ht-stat">
            <div className="ht-stat-val" style={{color:s.color}}>{s.val}</div>
            <div className="ht-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tree */}
      <div className="ht-tree card">
        {org.markets.map(m=><MarketNode key={m.id} market={m}/>)}
        {org.markets.length===0&&<div style={{padding:20,textAlign:"center",color:"var(--text3)",fontSize:13}}>No markets yet. Click "Add Market" to get started.</div>}
      </div>

      {/* Add/Edit Modal */}
      {modal&&(
        <Modal title={`${modal.mode==="add"?"Add":"Edit"} ${modal.level?.replace(/s$/,"").replace(/ie$/,"y")}`} onClose={()=>setModal(null)}
          footer={<><button className="btn btn-sec" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={()=>save(modal.level)}><Check size={14}/>Save</button></>}>
          <div className="form-row full"><div className="form-group"><label>Name *</label><input value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Enter name…"/></div></div>
          {modal.level==="markets"&&<div className="form-row"><div className="form-group"><label>Region</label><input value={form.region||""} onChange={e=>setForm(f=>({...f,region:e.target.value}))} placeholder="e.g. Asia"/></div><div className="form-group"><label>Head</label><select value={form.head||""} onChange={e=>setForm(f=>({...f,head:e.target.value}))}><option value="">Select…</option>{TEAM.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div></div>}
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
