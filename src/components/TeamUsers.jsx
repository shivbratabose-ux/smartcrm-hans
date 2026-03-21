import { useState } from "react";
import { Plus, Edit2, Check, X, Trash2 } from "lucide-react";
import { PRODUCTS, PROD_MAP, TEAM_MAP, ROLES_HIERARCHY, ROLE_MAP, PERMISSIONS, INIT_USERS } from '../data/constants';
import { uid, fmt, today } from '../utils/helpers';
import { Modal, Confirm } from './shared';

function TeamUsers({teams,setTeams,orgUsers,setOrgUsers,org,currentUser}) {
  const [tab,setTab]=useState("teams");
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [confirm,setConfirm]=useState(null);

  const openAddUser=()=>setModal({mode:"adduser",form:{name:"",email:"",role:"sales_exec",lob:"iCAFFE",branchId:"br1",deptId:"dep1",initials:"",active:true,joinDate:today}});
  const openEditUser=u=>{setForm({...u});setModal({mode:"edituser"});};
  const saveUser=()=>{
    if(modal.mode==="adduser") setOrgUsers(p=>[...p,{...modal.form,id:`u${uid()}`}]);
    else setOrgUsers(p=>p.map(u=>u.id===form.id?{...form}:u));
    setModal(null);
  };
  const deactivate=id=>setOrgUsers(p=>p.map(u=>u.id===id?{...u,active:!u.active}:u));

  const openAddTeam=()=>{setForm({name:"",productId:"",lead:"u1",members:[],desc:""});setModal({mode:"addteam"});};
  const saveTeam=()=>{
    if(modal.mode==="addteam") setTeams(p=>[...p,{id:`t${uid()}`,...form}]);
    else setTeams(p=>p.map(t=>t.id===form.id?{...form}:t));
    setModal(null);
  };
  const toggleMember=id=>{
    const mm=form.members||[];
    setForm(f=>({...f,members:mm.includes(id)?mm.filter(x=>x!==id):[...mm,id]}));
  };

  const currentUserRole=INIT_USERS.find(u=>u.id===currentUser)?.role||"viewer";
  const canManage=["admin","md","director","line_mgr"].includes(currentUserRole);

  const PERM_MODULES=["accounts","contacts","pipeline","activities","tickets","reports","masters","org","team"];
  const PERM_LABEL={accounts:"Accounts",contacts:"Contacts",pipeline:"Pipeline",activities:"Activities",tickets:"Tickets",reports:"Reports",masters:"Masters",org:"Org",team:"Team"};

  return (
    <div>
      <div className="pg-head">
        <div><div className="pg-title">Team & Users</div><div className="pg-sub">Manage teams, user roles, and access permissions</div></div>
        <div className="pg-actions">
          {canManage&&tab==="teams"&&<button className="btn btn-primary" onClick={openAddTeam}><Plus size={14}/>Add Team</button>}
          {canManage&&tab==="users"&&<button className="btn btn-primary" onClick={openAddUser}><Plus size={14}/>Add User</button>}
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {["teams","users","permissions"].map(t=><button key={t} className={`btn btn-sm ${tab===t?"btn-primary":"btn-sec"}`} onClick={()=>setTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>)}
      </div>

      {tab==="teams"&&(
        <div>
          <div className="team-grid">
            {teams.map(t=>{
              const prod=PROD_MAP[t.productId];
              const lead=TEAM_MAP[t.lead]||orgUsers.find(u=>u.id===t.lead);
              return (
                <div key={t.id} className="team-card">
                  <div className="team-card-head">
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        {prod&&<span className="prod-tag" style={{background:prod.bg,color:prod.text}}>{prod.name}</span>}
                        <div className="team-card-name">{t.name}</div>
                      </div>
                      <div className="team-card-desc">{t.desc}</div>
                    </div>
                    {canManage&&<div style={{display:"flex",gap:4}}>
                      <button className="icon-btn" onClick={()=>{setForm({...t,members:[...t.members]});setModal({mode:"editteam"});}}><Edit2 size={13}/></button>
                      <button className="icon-btn" onClick={()=>setConfirm({type:"team",id:t.id,name:t.name})}><Trash2 size={13}/></button>
                    </div>}
                  </div>
                  {lead&&(
                    <div className="team-member-row" style={{background:"var(--brand-bg)",borderTop:"1px solid var(--brand-glow)"}}>
                      <div className="u-av" style={{width:28,height:28,borderRadius:8,fontSize:10}}>{lead.initials}</div>
                      <div style={{flex:1}}><div style={{fontSize:12.5,fontWeight:600,color:"var(--text)"}}>{lead.name}</div><div style={{fontSize:11,color:"var(--brand)"}}>Team Lead</div></div>
                    </div>
                  )}
                  {t.members.filter(m=>m!==t.lead).map(mid=>{
                    const u=TEAM_MAP[mid]||orgUsers.find(x=>x.id===mid);
                    if(!u) return null;
                    const userRole=INIT_USERS.find(x=>x.id===mid)?.role||"sales_exec";
                    const roleInfo=ROLE_MAP[userRole];
                    return (
                      <div key={mid} className="team-member-row">
                        <div className="u-av" style={{width:28,height:28,borderRadius:8,fontSize:10}}>{u.initials}</div>
                        <div style={{flex:1}}><div style={{fontSize:12.5,fontWeight:500}}>{u.name}</div><div style={{fontSize:11,color:"var(--text3)"}}>{u.role||u.lob}</div></div>
                        {roleInfo&&<span className="role-badge" style={{background:roleInfo.color+"18",color:roleInfo.color}}>{roleInfo.name}</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab==="users"&&(
        <div className="user-table">
          <table className="tbl">
            <thead><tr><th>User</th><th>Role</th><th>LOB</th><th>Branch</th><th>Dept</th><th>Status</th><th>Join Date</th>{canManage&&<th></th>}</tr></thead>
            <tbody>{orgUsers.map(u=>{
              const roleInfo=ROLE_MAP[u.role];
              const branch=org.branches.find(b=>b.id===u.branchId);
              const dept=org.departments.find(d=>d.id===u.deptId);
              return (
                <tr key={u.id} style={{opacity:u.active?1:0.5}}>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:9}}>
                      <div className="u-av" style={{width:30,height:30,borderRadius:9,fontSize:10.5,background:roleInfo?roleInfo.color+"18":"var(--brand-bg)",color:roleInfo?.color||"var(--brand)"}}>{u.initials}</div>
                      <div><div style={{fontWeight:600,fontSize:13}}>{u.name}</div><div style={{fontSize:11,color:"var(--text3)"}}>{u.email}</div></div>
                    </div>
                  </td>
                  <td>{roleInfo&&<span className="user-role-badge" style={{background:roleInfo.color+"18",color:roleInfo.color}}>{roleInfo.name}</span>}</td>
                  <td style={{fontSize:12,color:"var(--text2)"}}>{u.lob}</td>
                  <td style={{fontSize:12,color:"var(--text3)"}}>{branch?.name||"—"}</td>
                  <td style={{fontSize:12,color:"var(--text3)"}}>{dept?.name||"—"}</td>
                  <td>{u.active?<span className="badge bs-active">Active</span>:<span className="badge bs-lost">Inactive</span>}</td>
                  <td style={{fontSize:12,color:"var(--text3)"}}>{fmt.date(u.joinDate)}</td>
                  {canManage&&<td>
                    <div style={{display:"flex",gap:4}}>
                      <button className="icon-btn" onClick={()=>openEditUser(u)}><Edit2 size={13}/></button>
                      <button className="icon-btn" title={u.active?"Deactivate":"Activate"} onClick={()=>deactivate(u.id)} style={{color:u.active?"var(--amber)":"var(--green)"}}>{u.active?<X size={13}/>:<Check size={13}/>}</button>
                    </div>
                  </td>}
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      {tab==="permissions"&&(
        <div>
          <div className="card" style={{marginBottom:16,padding:"12px 16px",background:"var(--amber-bg)",border:"1px solid var(--amber)",fontSize:13,color:"var(--amber-t)"}}>
            Permissions are role-based. Assign a role to a user to control their access. RW = Read & Write &middot; R = Read only &middot; -- = No access.
          </div>
          <div className="rpt-card" style={{padding:0,overflow:"hidden"}}>
            <table className="perm-table">
              <thead>
                <tr>
                  <th style={{textAlign:"left",width:160}}>Role</th>
                  {PERM_MODULES.map(m=><th key={m}>{PERM_LABEL[m]}</th>)}
                </tr>
              </thead>
              <tbody>
                {ROLES_HIERARCHY.map(r=>{
                  const p=PERMISSIONS[r.id];
                  if(!p) return null;
                  return (
                    <tr key={r.id}>
                      <td style={{textAlign:"left"}}>
                        <span className="user-role-badge" style={{background:r.color+"18",color:r.color}}>{r.name}</span>
                        <div style={{fontSize:10.5,color:"var(--text3)",marginTop:2}}>{r.desc}</div>
                      </td>
                      {PERM_MODULES.map(m=>(
                        <td key={m}>
                          {p[m]==="rw"&&<span className="perm-rw">RW</span>}
                          {p[m]==="r"&&<span className="perm-r">R</span>}
                          {p[m]===true&&<span className="perm-rw">&check;</span>}
                          {(!p[m]||p[m]===false)&&<span className="perm-no">-</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Team Modal */}
      {(modal?.mode==="addteam"||modal?.mode==="editteam")&&(
        <Modal title={modal.mode==="addteam"?"New Team":"Edit Team"} onClose={()=>setModal(null)}
          footer={<><button className="btn btn-sec" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={saveTeam}><Check size={14}/>Save Team</button></>}>
          <div className="form-row"><div className="form-group"><label>Team Name *</label><input value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. WiseCargo – India Team"/></div><div className="form-group"><label>Product Line</label><select value={form.productId||""} onChange={e=>setForm(f=>({...f,productId:e.target.value}))}><option value="">Cross-product / All</option>{PRODUCTS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div></div>
          <div className="form-row"><div className="form-group"><label>Team Lead</label><select value={form.lead||""} onChange={e=>setForm(f=>({...f,lead:e.target.value}))}><option value="">Select…</option>{orgUsers.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div></div>
          <div className="form-group" style={{marginBottom:14}}><label>Description</label><input value={form.desc||""} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} placeholder="Team focus area…"/></div>
          <div className="form-group"><label>Members</label>
            <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:6,maxHeight:200,overflowY:"auto"}}>
              {orgUsers.map(u=>(
                <label key={u.id} style={{display:"flex",alignItems:"center",gap:9,padding:"6px 10px",borderRadius:6,background:(form.members||[]).includes(u.id)?"var(--brand-bg)":"var(--s2)",cursor:"pointer",border:"1px solid",borderColor:(form.members||[]).includes(u.id)?"var(--brand)":"var(--border)"}}>
                  <input type="checkbox" checked={(form.members||[]).includes(u.id)} onChange={()=>toggleMember(u.id)} style={{flexShrink:0}}/>
                  <div className="u-av" style={{width:24,height:24,borderRadius:6,fontSize:9}}>{u.initials}</div>
                  <span style={{fontSize:13}}>{u.name}</span>
                  <span style={{fontSize:11,color:"var(--text3)",marginLeft:"auto"}}>{u.lob}</span>
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* User Modal */}
      {(modal?.mode==="adduser"||modal?.mode==="edituser")&&(
        <Modal title={modal.mode==="adduser"?"Add User":"Edit User"} onClose={()=>setModal(null)}
          footer={<><button className="btn btn-sec" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={saveUser}><Check size={14}/>Save User</button></>} lg>
          {(()=>{
            const f=modal.mode==="adduser"?modal.form:form;
            const setF=modal.mode==="adduser"?v=>setModal(m=>({...m,form:{...m.form,...(typeof v==="function"?v(m.form):v)}})):setForm;
            return (
              <>
                <div className="form-row"><div className="form-group"><label>Full Name *</label><input value={f.name||""} onChange={e=>setF(prev=>({...prev,name:e.target.value}))} placeholder="Full name"/></div><div className="form-group"><label>Initials</label><input value={f.initials||""} onChange={e=>setF(prev=>({...prev,initials:e.target.value.toUpperCase().slice(0,3)}))} placeholder="e.g. SB" maxLength={3}/></div></div>
                <div className="form-row full"><div className="form-group"><label>Work Email *</label><input type="email" value={f.email||""} onChange={e=>setF(prev=>({...prev,email:e.target.value}))} placeholder="name@hansinfomatic.com"/></div></div>
                <div className="form-row"><div className="form-group"><label>Role *</label><select value={f.role||"sales_exec"} onChange={e=>setF(prev=>({...prev,role:e.target.value}))}>{ROLES_HIERARCHY.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div><div className="form-group"><label>Product Line (LOB)</label><select value={f.lob||"All"} onChange={e=>setF(prev=>({...prev,lob:e.target.value}))}><option>All</option>{PRODUCTS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div></div>
                <div className="form-row"><div className="form-group"><label>Branch</label><select value={f.branchId||""} onChange={e=>setF(prev=>({...prev,branchId:e.target.value}))}><option value="">Select…</option>{org.branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.country})</option>)}</select></div><div className="form-group"><label>Department</label><select value={f.deptId||""} onChange={e=>setF(prev=>({...prev,deptId:e.target.value}))}><option value="">Select…</option>{org.departments.filter(d=>!f.branchId||d.branchId===f.branchId).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div></div>
                <div className="form-row"><div className="form-group"><label>Join Date</label><input type="date" value={f.joinDate||""} onChange={e=>setF(prev=>({...prev,joinDate:e.target.value}))}/></div></div>
                {f.role&&ROLE_MAP[f.role]&&(
                  <div style={{background:ROLE_MAP[f.role].color+"12",border:`1px solid ${ROLE_MAP[f.role].color}22`,borderRadius:8,padding:"10px 14px",fontSize:12.5,color:ROLE_MAP[f.role].color,marginTop:4}}>
                    <strong>{ROLE_MAP[f.role].name}:</strong> {ROLE_MAP[f.role].desc}
                  </div>
                )}
              </>
            );
          })()}
        </Modal>
      )}

      {confirm&&<Confirm title={`Delete ${confirm.type}`} msg={`Remove "${confirm.name}" permanently?`} onConfirm={()=>{if(confirm.type==="team") setTeams(p=>p.filter(t=>t.id!==confirm.id));setConfirm(null);}} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}

export default TeamUsers;
