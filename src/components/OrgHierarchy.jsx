import { useState } from "react";
import { Plus, Edit2, Trash2, Check, X, ChevronRight, ChevronDown, Building2, MapPin, Users, Globe, Link2 } from "lucide-react";
import { TEAM, TEAM_MAP, COUNTRIES, PRODUCTS } from '../data/constants';
import { uid } from '../utils/helpers';
import { Modal, Confirm, ProdTag } from './shared';

/* ── Division color mapping for visual differentiation ── */
const DIV_COLORS = {
  "Sales":                 {bg:"#EFF6FF",border:"#3B82F6",icon:"#2563EB"},
  "Marketing":             {bg:"#FEF3C7",border:"#F59E0B",icon:"#D97706"},
  "Customer Success":      {bg:"#F0FDF4",border:"#22C55E",icon:"#16A34A"},
  "Product & Development": {bg:"#F5F3FF",border:"#8B5CF6",icon:"#7C3AED"},
};
const getDivColor = (name) => {
  for (const [key, val] of Object.entries(DIV_COLORS)) {
    if (name?.includes(key)) return val;
  }
  return {bg:"#F8FAFC",border:"#94A3B8",icon:"#64748B"};
};

export default function OrgHierarchy({org,setOrg,users,orgUsers,setOrgUsers,setTeams}) {
  const team = (orgUsers||[]).filter(u=>u.active!==false);
  const [showLegend,setShowLegend]=useState(true);
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
    setOrg(o=>{
      const updated={...o,[level]:o[level].filter(x=>x.id!==id)};
      // Cascading deletes down the hierarchy
      if(level==="markets"){
        const coIds=o.companies.filter(c=>c.marketId===id).map(c=>c.id);
        updated.companies=(updated.companies||o.companies).filter(c=>c.marketId!==id);
        const divIds=o.divisions.filter(d=>coIds.includes(d.companyId)).map(d=>d.id);
        updated.divisions=(updated.divisions||o.divisions).filter(d=>!coIds.includes(d.companyId));
        const brIds=o.branches.filter(b=>divIds.includes(b.divisionId)).map(b=>b.id);
        updated.branches=(updated.branches||o.branches).filter(b=>!divIds.includes(b.divisionId));
        updated.departments=(updated.departments||o.departments).filter(d=>!brIds.includes(d.branchId));
        // Clean user refs
        if(setOrgUsers) setOrgUsers(u=>u.map(usr=>brIds.includes(usr.branchId)?{...usr,branchId:"",deptId:""}:usr));
      }
      if(level==="companies"){
        const divIds=o.divisions.filter(d=>d.companyId===id).map(d=>d.id);
        updated.divisions=(updated.divisions||o.divisions).filter(d=>d.companyId!==id);
        const brIds=o.branches.filter(b=>divIds.includes(b.divisionId)).map(b=>b.id);
        updated.branches=(updated.branches||o.branches).filter(b=>!divIds.includes(b.divisionId));
        updated.departments=(updated.departments||o.departments).filter(d=>!brIds.includes(d.branchId));
        if(setOrgUsers) setOrgUsers(u=>u.map(usr=>brIds.includes(usr.branchId)?{...usr,branchId:"",deptId:""}:usr));
      }
      if(level==="divisions"){
        const brIds=o.branches.filter(b=>b.divisionId===id).map(b=>b.id);
        updated.branches=(updated.branches||o.branches).filter(b=>b.divisionId!==id);
        updated.departments=(updated.departments||o.departments).filter(d=>!brIds.includes(d.branchId));
        if(setOrgUsers) setOrgUsers(u=>u.map(usr=>brIds.includes(usr.branchId)?{...usr,branchId:"",deptId:""}:usr));
      }
      if(level==="branches"){
        updated.departments=(updated.departments||o.departments).filter(d=>d.branchId!==id);
        if(setOrgUsers) setOrgUsers(u=>u.map(usr=>usr.branchId===id?{...usr,branchId:"",deptId:""}:usr));
      }
      if(level==="departments"){
        if(setOrgUsers) setOrgUsers(u=>u.map(usr=>usr.deptId===id?{...usr,deptId:""}:usr));
      }
      return updated;
    });
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

  /* ── Secondary assignment helpers ── */
  const getSecondaryUsers=(branchId,deptId)=>{
    return (orgUsers||[]).filter(u=>u.active!==false && Array.isArray(u.secondaryAssignments) &&
      u.secondaryAssignments.some(a=>a.branchId===branchId || a.deptId===deptId));
  };
  const getSecondaryLabel=(user,branchId,deptId)=>{
    const a=(user.secondaryAssignments||[]).find(a=>a.branchId===branchId || a.deptId===deptId);
    return a?.label||"Secondary Role";
  };

  const SecondaryPill=({user,branchId,deptId})=>(
    <span className="ht-secondary-pill" title={`${user.name} — ${getSecondaryLabel(user,branchId,deptId)} (Dotted-line)`}>
      <Link2 size={9} style={{marginRight:3,opacity:0.6}}/>
      <span className="ht-av ht-av-sec">{user.initials}</span>
      <span style={{opacity:0.7}}>{user.name}</span>
      <span className="ht-sec-label">{getSecondaryLabel(user,branchId,deptId)}</span>
    </span>
  );

  const DeptNode=({dept})=>{
    const head=userById(dept.head);
    const secUsers=getSecondaryUsers(dept.branchId,dept.id);
    return (
      <div className="ht-node ht-leaf">
        <div className="ht-row">
          <span className="ht-icon ht-icon-dept"><Users size={12}/></span>
          <span className="ht-name">{dept.name}</span>
          {dept.headcount&&<span className="ht-count">{dept.headcount}</span>}
          {head&&<HeadPill userId={dept.head}/>}
          <ActionBtns level="departments" item={dept}/>
        </div>
        {secUsers.length>0&&(
          <div className="ht-secondary-row">
            {secUsers.map(u=><SecondaryPill key={u.id} user={u} branchId={dept.branchId} deptId={dept.id}/>)}
          </div>
        )}
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
          {branch.headcount&&<span className="ht-count">{branch.headcount}</span>}
          {branch.head&&<HeadPill userId={branch.head}/>}
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
    const dc=getDivColor(division.name);
    return (
      <div className="ht-node" style={{"--div-bg":dc.bg,"--div-border":dc.border,"--div-icon":dc.icon}}>
        <div className="ht-row ht-clickable ht-row-division" onClick={()=>branches.length>0&&toggle(division.id)}
          style={{borderLeft:`3px solid ${dc.border}`,background:dc.bg}}>
          {branches.length>0?(isOpen?<ChevronDown size={13} className="ht-chevron"/>:<ChevronRight size={13} className="ht-chevron"/>):<span style={{width:13}}/>}
          <span className="ht-icon ht-icon-div" style={{background:dc.border,color:"#fff"}}><Building2 size={12}/></span>
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
          {company.head&&<HeadPill userId={company.head}/>}
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

      {/* Legend */}
      {showLegend&&(
        <div className="ht-legend card" style={{marginBottom:12,padding:"10px 16px",display:"flex",flexWrap:"wrap",gap:16,alignItems:"center",fontSize:12}}>
          <span style={{fontWeight:600,color:"var(--text2)",marginRight:4}}>Legend:</span>
          {Object.entries(DIV_COLORS).map(([name,c])=>(
            <span key={name} style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{width:12,height:12,borderRadius:3,background:c.border,display:"inline-block"}}/>
              <span style={{color:"var(--text2)"}}>{name}</span>
            </span>
          ))}
          <span style={{display:"flex",alignItems:"center",gap:4,borderLeft:"1px solid var(--s3)",paddingLeft:12}}>
            <span style={{width:20,height:2,background:"var(--brand)",display:"inline-block"}}/>
            <span style={{color:"var(--text2)"}}>Primary Role</span>
          </span>
          <span style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{width:20,height:0,borderTop:"2px dashed var(--text3)",display:"inline-block"}}/>
            <span style={{color:"var(--text2)"}}>Secondary Role (Dotted-line)</span>
          </span>
          <button onClick={()=>setShowLegend(false)} style={{marginLeft:"auto",background:"none",border:"none",cursor:"pointer",color:"var(--text3)",fontSize:14}}>×</button>
        </div>
      )}

      {/* Entity header */}
      <div className="ht-entity card" style={{marginBottom:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:10,background:"linear-gradient(135deg,var(--brand) 0%,#1a5c3a 100%)",color:"#fff",borderRadius:8}}>
        <Building2 size={20}/>
        <div>
          <div style={{fontWeight:700,fontSize:15}}>Hans Infomatic Pvt Ltd</div>
          <div style={{fontSize:11,opacity:0.8}}>Logistics Technology · India · Enterprise CRM Hierarchy</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",gap:12,fontSize:11,opacity:0.85}}>
          <span>{(orgUsers||[]).filter(u=>u.active!==false).length} Active Users</span>
          <span>{(orgUsers||[]).filter(u=>(u.secondaryAssignments||[]).length>0).length} Multi-assigned</span>
        </div>
      </div>

      {/* Tree */}
      <div className="ht-tree card">
        {org.markets.map(m=><MarketNode key={m.id} market={m}/>)}
        {org.markets.length===0&&<div style={{padding:20,textAlign:"center",color:"var(--text3)",fontSize:13}}>No markets yet. Click "Add Market" to get started.</div>}
      </div>

      {/* Add/Edit Modal — Enhanced Full-Field Forms */}
      {modal&&(
        <Modal title={`${modal.mode==="add"?"Add":"Edit"} ${modal.level?.replace(/s$/,"").replace(/ie$/,"y")}`} onClose={()=>setModal(null)}
          footer={<><button className="btn btn-sec" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={()=>save(modal.level)}><Check size={14}/>Save</button></>}>
          {/* ── Common: Name ── */}
          <div className="form-row full"><div className="form-group"><label>Name *</label><input value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Enter name…"/></div></div>

          {/* ── MARKET ── */}
          {modal.level==="markets"&&<>
            <div className="form-row">
              <div className="form-group"><label>Region</label><input value={form.region||""} onChange={e=>setForm(f=>({...f,region:e.target.value}))} placeholder="e.g. Asia"/></div>
              <div className="form-group"><label>Head</label><select value={form.head||""} onChange={e=>setForm(f=>({...f,head:e.target.value}))}><option value="">Select…</option>{team.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            </div>
            <div className="form-row full"><div className="form-group"><label>Notes</label><textarea rows={3} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Market-level notes…" style={{width:"100%",resize:"vertical"}}/></div></div>
          </>}

          {/* ── COMPANY ── */}
          {modal.level==="companies"&&<>
            <div className="form-row">
              <div className="form-group"><label>Market</label><select value={form.marketId||""} onChange={e=>setForm(f=>({...f,marketId:e.target.value}))}><option value="">Select…</option>{org.markets.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
              <div className="form-group"><label>Type</label><select value={form.type||"Internal HQ"} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{["Internal HQ","Subsidiary","Partner","Associate"].map(t=><option key={t}>{t}</option>)}</select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Country</label><input value={form.country||""} onChange={e=>setForm(f=>({...f,country:e.target.value}))}/></div>
              <div className="form-group"><label>Reg. No.</label><input value={form.regNo||""} onChange={e=>setForm(f=>({...f,regNo:e.target.value}))}/></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Head</label><select value={form.head||""} onChange={e=>setForm(f=>({...f,head:e.target.value}))}><option value="">Select…</option>{team.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
              <div className="form-group"><label>Phone</label><input value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="+91…"/></div>
            </div>
            <div className="form-row full"><div className="form-group"><label>Notes</label><textarea rows={3} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Company-level notes…" style={{width:"100%",resize:"vertical"}}/></div></div>
          </>}

          {/* ── DIVISION ── */}
          {modal.level==="divisions"&&<>
            <div className="form-row">
              <div className="form-group"><label>Company</label><select value={form.companyId||""} onChange={e=>setForm(f=>({...f,companyId:e.target.value}))}><option value="">Select…</option>{org.companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div className="form-group"><label>Head</label><select value={form.head||""} onChange={e=>setForm(f=>({...f,head:e.target.value}))}><option value="">Select…</option>{team.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            </div>
            <div className="form-row full">
              <div className="form-group">
                <label>Products</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:8,padding:"8px 0"}}>
                  {PRODUCTS.map(p=>{
                    const sel=(form.products||[]).includes(p.id);
                    return (
                      <label key={p.id} style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",padding:"4px 10px",borderRadius:6,border:`1.5px solid ${sel?p.color:"var(--s3)"}`,background:sel?p.bg:"transparent",fontSize:12,transition:"all 0.15s"}}>
                        <input type="checkbox" checked={sel} onChange={()=>setForm(f=>{
                          const cur=f.products||[];
                          return {...f,products:sel?cur.filter(x=>x!==p.id):[...cur,p.id]};
                        })} style={{display:"none"}}/>
                        <span style={{width:10,height:10,borderRadius:3,background:sel?p.color:"var(--s3)",display:"inline-block",transition:"background 0.15s"}}/>
                        <span style={{fontWeight:sel?600:400,color:sel?p.text:"var(--text2)"}}>{p.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="form-row full"><div className="form-group"><label>Notes</label><textarea rows={3} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Division-level notes (goals, KRAs, etc.)…" style={{width:"100%",resize:"vertical"}}/></div></div>
          </>}

          {/* ── BRANCH ── */}
          {modal.level==="branches"&&<>
            <div className="form-row">
              <div className="form-group"><label>Division</label><select value={form.divisionId||""} onChange={e=>setForm(f=>({...f,divisionId:e.target.value}))}><option value="">Select…</option>{org.divisions.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
              <div className="form-group"><label>Type</label><select value={form.type||"Office"} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{["HQ","Office","Remote","Virtual"].map(t=><option key={t}>{t}</option>)}</select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Head</label><select value={form.head||""} onChange={e=>setForm(f=>({...f,head:e.target.value}))}><option value="">Select…</option>{team.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
              <div className="form-group"><label>Headcount</label><input type="number" min={0} value={form.headcount||""} onChange={e=>setForm(f=>({...f,headcount:parseInt(e.target.value)||""}))} placeholder="0"/></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>City</label><input value={form.city||""} onChange={e=>setForm(f=>({...f,city:e.target.value}))}/></div>
              <div className="form-group"><label>Country</label><input value={form.country||""} onChange={e=>setForm(f=>({...f,country:e.target.value}))}/></div>
            </div>
            <div className="form-row full"><div className="form-group"><label>Address</label><input value={form.address||""} onChange={e=>setForm(f=>({...f,address:e.target.value}))} placeholder="Full address…"/></div></div>
            <div className="form-row full"><div className="form-group"><label>Notes</label><textarea rows={3} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Branch-level notes…" style={{width:"100%",resize:"vertical"}}/></div></div>
          </>}

          {/* ── DEPARTMENT ── */}
          {modal.level==="departments"&&<>
            <div className="form-row">
              <div className="form-group"><label>Branch</label><select value={form.branchId||""} onChange={e=>setForm(f=>({...f,branchId:e.target.value}))}><option value="">Select…</option>{org.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
              <div className="form-group"><label>Head</label><select value={form.head||""} onChange={e=>setForm(f=>({...f,head:e.target.value}))}><option value="">Select…</option>{team.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Headcount</label><input type="number" min={0} value={form.headcount||""} onChange={e=>setForm(f=>({...f,headcount:parseInt(e.target.value)||""}))} placeholder="0"/></div>
              <div className="form-group"><label>Status</label><select value={form.status||"Active"} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{["Active","Planned","Archived"].map(s=><option key={s}>{s}</option>)}</select></div>
            </div>
            <div className="form-row full"><div className="form-group"><label>Notes</label><textarea rows={3} value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Department-level notes (scope, KPIs, etc.)…" style={{width:"100%",resize:"vertical"}}/></div></div>
          </>}
        </Modal>
      )}
      {confirm&&<Confirm title="Delete Entry" msg={`Remove "${confirm.name}" and all sub-entries? This cannot be undone.`} onConfirm={()=>del(confirm.level,confirm.id)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
