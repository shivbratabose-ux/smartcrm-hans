import { useState, useMemo } from "react";
import { Plus, Edit2, Check, X, Trash2, Key, Eye, EyeOff, Copy, RefreshCw, Shield, AlertTriangle, Lock, Unlock, ChevronDown, ChevronRight, Users } from "lucide-react";
import { PRODUCTS, PROD_MAP, TEAM_MAP, ROLES_HIERARCHY, ROLE_MAP, PERMISSIONS, INIT_USERS } from '../data/constants';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { updateUserProfile } from '../lib/db';
import { uid, fmt, today } from '../utils/helpers';
import { Modal, Confirm } from './shared';

function TeamUsers({teams,setTeams,orgUsers,setOrgUsers,org,currentUser,customPermissions,setCustomPermissions}) {
  const [tab,setTab]=useState("teams");
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [confirm,setConfirm]=useState(null);
  // Password management states
  const [pwModal,setPwModal]=useState(null); // {mode:"create"|"reset"|"change", userId, userName}
  const [pwForm,setPwForm]=useState({password:"",confirm:"",current:""});
  const [showPw,setShowPw]=useState({pw:false,confirm:false,current:false});
  const [pwErr,setPwErr]=useState("");
  const [pwSuccess,setPwSuccess]=useState("");
  const [generatedPw,setGeneratedPw]=useState("");
  const [copied,setCopied]=useState(false);
  // Editable permissions state
  const [editingPerms,setEditingPerms]=useState(false);
  const [permEdits,setPermEdits]=useState(()=>{
    const merged={};
    ROLES_HIERARCHY.forEach(r=>{
      merged[r.id]={...(PERMISSIONS[r.id]||{}),...((customPermissions||{})[r.id]||{})};
    });
    return merged;
  });
  // User-level permission overrides modal
  const [userPermModal,setUserPermModal]=useState(null); // {userId, userName, role}
  const [userPermEdits,setUserPermEdits]=useState({});

  // Generate random password
  const generatePassword=()=>{
    const chars="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    let pw="";for(let i=0;i<12;i++) pw+=chars[Math.floor(Math.random()*chars.length)];
    return pw;
  };

  // Password validation
  const validatePassword=(pw)=>{
    const errors=[];
    if(pw.length<8) errors.push("Minimum 8 characters");
    if(!/[A-Z]/.test(pw)) errors.push("At least 1 uppercase letter");
    if(!/[a-z]/.test(pw)) errors.push("At least 1 lowercase letter");
    if(!/[0-9]/.test(pw)) errors.push("At least 1 number");
    return errors;
  };

  // Password strength meter
  const getStrength=(pw)=>{
    if(!pw) return {label:"",color:"#CBD5E1",pct:0};
    let score=0;
    if(pw.length>=8) score++;
    if(pw.length>=12) score++;
    if(/[A-Z]/.test(pw)&&/[a-z]/.test(pw)) score++;
    if(/[0-9]/.test(pw)) score++;
    if(/[^A-Za-z0-9]/.test(pw)) score++;
    if(score<=1) return {label:"Weak",color:"#EF4444",pct:20};
    if(score<=2) return {label:"Fair",color:"#F97316",pct:40};
    if(score<=3) return {label:"Good",color:"#EAB308",pct:60};
    if(score<=4) return {label:"Strong",color:"#22C55E",pct:80};
    return {label:"Excellent",color:"#16A34A",pct:100};
  };

  // Save password (own account only — uses active Supabase session)
  const savePassword=async()=>{
    setPwErr("");setPwSuccess("");
    const {password,confirm:confirmPw}=pwForm;
    const errors=validatePassword(password);
    if(errors.length>0){setPwErr(errors.join(". ")+".");return;}
    if(password!==confirmPw){setPwErr("Passwords do not match.");return;}
    if(!isSupabaseConfigured){setPwErr("Authentication not configured.");return;}
    const {error}=await supabase.auth.updateUser({password});
    if(error){setPwErr(error.message);return;}
    setPwSuccess("Password updated successfully!");
    setTimeout(()=>{setPwModal(null);setPwSuccess("");setPwForm({password:"",confirm:"",current:""});setShowPw({pw:false,confirm:false,current:false});setGeneratedPw("");},1500);
  };

  // Admin reset — sends a password reset email via Supabase Auth
  const sendResetEmail=async(userId)=>{
    const user=orgUsers.find(u=>u.id===userId);
    if(!user?.email){setPwErr("No email on file for this user.");return;}
    if(!isSupabaseConfigured){setPwErr("Authentication not configured.");return;}
    const {error}=await supabase.auth.resetPasswordForEmail(user.email);
    if(error){setPwErr(error.message);return;}
    setPwSuccess(`Reset link sent to ${user.email}`);
    setTimeout(()=>{setPwModal(null);setPwSuccess("");},2000);
  };

  const openAddUser=()=>setModal({mode:"adduser",form:{name:"",email:"",role:"sales_exec",lob:"iCAFFE",branchId:"br1",deptId:"dep1",initials:"",active:true,joinDate:today,password:"",confirmPassword:""}});
  const openEditUser=u=>{setForm({...u});setModal({mode:"edituser"});};
  const saveUser=async()=>{
    if(modal.mode==="adduser"){
      const f=modal.form;
      const newId=`u${uid()}`;
      const newUser={...f,id:newId,password:undefined,confirmPassword:undefined};
      setOrgUsers(p=>[...p,newUser]);
    } else {
      setOrgUsers(p=>p.map(u=>u.id===form.id?{...form}:u));
      // Persist edits (role/branch/dept/lob/active) to Supabase
      if(isSupabaseConfigured){
        await updateUserProfile(form.id, {
          name: form.name, email: form.email, initials: form.initials,
          role: form.role, lob: form.lob, branchId: form.branchId, deptId: form.deptId,
          country: form.country, active: form.active, joinDate: form.joinDate,
        });
      }
    }
    setModal(null);
  };
  const deactivate=async(id)=>{
    const target=orgUsers.find(u=>u.id===id);
    const newActive=!target?.active;
    setOrgUsers(p=>p.map(u=>u.id===id?{...u,active:newActive}:u));
    if(isSupabaseConfigured){
      await updateUserProfile(id, { active: newActive });
    }
  };

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

  const currentUserRole=orgUsers.find(u=>u.id===currentUser)?.role||INIT_USERS.find(u=>u.id===currentUser)?.role||"viewer";
  const canManage=["admin","md","director","line_mgr"].includes(currentUserRole);

  const PERM_MODULES=["accounts","contacts","pipeline","activities","tickets","reports","masters","org","team"];
  const PERM_LABEL={accounts:"Accounts",contacts:"Contacts",pipeline:"Pipeline",activities:"Activities",tickets:"Tickets",reports:"Reports",masters:"Masters",org:"Org",team:"Team"};

  // ── Team Hierarchy: derive reporting tree from org structure ──
  const [hierarchyExpanded,setHierarchyExpanded]=useState(()=>{
    const ids={};
    orgUsers.forEach(u=>ids[u.id]=true);
    return ids;
  });
  const [editingManager,setEditingManager]=useState(null); // userId being edited

  // Build reportsTo from org hierarchy: dept heads → division heads → company/market heads
  const reportsToMap=useMemo(()=>{
    const rmap={};
    // For each user, find their dept, then branch→division→head
    orgUsers.forEach(u=>{
      const dept=org.departments.find(d=>d.id===u.deptId);
      const branch=dept?org.branches.find(b=>b.id===dept.branchId):null;
      const division=branch?org.divisions.find(d=>d.id===branch.divisionId):null;
      // If user IS the dept head, they report to division head
      if(dept&&dept.head===u.id&&division&&division.head&&division.head!==u.id){
        rmap[u.id]=division.head;
      }
      // If user is NOT the dept head, they report to dept head
      else if(dept&&dept.head&&dept.head!==u.id){
        rmap[u.id]=dept.head;
      }
      // If user is division head, they report to market head (through company)
      else if(division&&division.head===u.id){
        const company=org.companies.find(c=>c.id===division.companyId);
        const market=company?org.markets.find(m=>m.id===company.marketId):null;
        if(market&&market.head&&market.head!==u.id) rmap[u.id]=market.head;
      }
      // Apply user-set overrides from orgUsers
      if(u.reportsTo) rmap[u.id]=u.reportsTo;
    });
    return rmap;
  },[orgUsers,org]);

  // Build tree: find roots (no manager, self as manager, or manager no longer exists in orgUsers)
  const activeUserIds = new Set(orgUsers.filter(u=>u.active!==false).map(u=>u.id));
  const getDirectReports=(managerId)=>orgUsers.filter(u=>u.active!==false&&reportsToMap[u.id]===managerId&&u.id!==managerId);
  const roots=orgUsers.filter(u=>{
    if(u.active===false) return false;
    const mgr=reportsToMap[u.id];
    return !mgr || mgr===u.id || !activeUserIds.has(mgr);
  });

  const setManager=async(userId,managerId)=>{
    setOrgUsers(p=>p.map(u=>u.id===userId?{...u,reportsTo:managerId||undefined}:u));
    setEditingManager(null);
    // Persist to Supabase so the hierarchy survives reload
    if(isSupabaseConfigured){
      const {error}=await updateUserProfile(userId, { reportsTo: managerId || null });
      if(error) console.error("Failed to save manager:", error);
    }
  };

  const toggleHierarchy=(id)=>setHierarchyExpanded(p=>({...p,[id]:!p[id]}));

  const HierarchyNode=({user,depth=0})=>{
    const reports=getDirectReports(user.id);
    const isOpen=hierarchyExpanded[user.id];
    const roleInfo=ROLE_MAP[user.role];
    return (
      <div className="th-node">
        <div className="th-row th-clickable" onClick={()=>reports.length>0&&toggleHierarchy(user.id)}>
          {reports.length>0?(isOpen?<ChevronDown size={13} style={{color:"var(--text3)",flexShrink:0}}/>:<ChevronRight size={13} style={{color:"var(--text3)",flexShrink:0}}/>):<span style={{width:13}}/>}
          <div className="th-av" style={{background:roleInfo?roleInfo.color+"18":"var(--brand-bg)",color:roleInfo?.color||"var(--brand)"}}>{user.initials}</div>
          <div className="th-info">
            <div className="th-name">{user.name}</div>
            <div className="th-sub">{user.email}</div>
          </div>
          {roleInfo&&<span className="th-role" style={{background:roleInfo.color+"18",color:roleInfo.color}}>{roleInfo.name}</span>}
          {reports.length>0&&<span className="th-direct">{reports.length} report{reports.length>1?"s":""}</span>}
          {canManage&&(
            <div className="th-actions">
              {editingManager===user.id?(
                <select
                  value={user.reportsTo||reportsToMap[user.id]||""}
                  onChange={e=>{e.stopPropagation();setManager(user.id,e.target.value);}}
                  onClick={e=>e.stopPropagation()}
                  style={{fontSize:11,padding:"3px 6px",borderRadius:6,border:"1px solid var(--border)",cursor:"pointer"}}
                  autoFocus
                  onBlur={()=>setEditingManager(null)}
                >
                  <option value="">No manager (root)</option>
                  {orgUsers.filter(u=>u.id!==user.id&&u.active!==false).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              ):(
                <button className="ht-btn" onClick={e=>{e.stopPropagation();setEditingManager(user.id);}} title="Change manager"><Edit2 size={11}/></button>
              )}
            </div>
          )}
        </div>
        {isOpen&&reports.length>0&&(
          <div className="th-children">
            {reports.map(r=><HierarchyNode key={r.id} user={r} depth={depth+1}/>)}
          </div>
        )}
      </div>
    );
  };

  // Get effective permissions for a role (role-level + custom role overrides)
  const getRolePerms=(role)=>({...(PERMISSIONS[role]||{}),...((customPermissions||{})[role]||{})});

  // Get effective permissions for a user (role + user-level overrides)
  const getUserPerms=(userId,role)=>{
    const base=getRolePerms(role);
    const userOverrides=(customPermissions||{})?.__users?.[userId]||{};
    return {...base,...userOverrides};
  };

  // Save user-level permission overrides
  const saveUserPerms=()=>{
    if(!setCustomPermissions||!userPermModal) return;
    const rolePerms=getRolePerms(userPermModal.role);
    // Only store differences from role defaults
    const diff={};
    PERM_MODULES.forEach(m=>{
      if(userPermEdits[m]!==rolePerms[m]) diff[m]=userPermEdits[m];
    });
    setCustomPermissions(prev=>{
      const updated={...prev};
      if(!updated.__users) updated.__users={};
      if(Object.keys(diff).length>0){
        updated.__users[userPermModal.userId]=diff;
      } else {
        delete updated.__users[userPermModal.userId];
        if(Object.keys(updated.__users).length===0) delete updated.__users;
      }
      return updated;
    });
    setUserPermModal(null);
  };

  // Reset user permissions to role defaults
  const resetUserPerms=()=>{
    if(!setCustomPermissions||!userPermModal) return;
    setCustomPermissions(prev=>{
      const updated={...prev};
      if(updated.__users) {
        delete updated.__users[userPermModal.userId];
        if(Object.keys(updated.__users).length===0) delete updated.__users;
      }
      return updated;
    });
    setUserPermEdits({...getRolePerms(userPermModal.role)});
  };

  // Password strength for add user form
  const addFormPw=modal?.mode==="adduser"?modal.form?.password||"":"";
  const addStrength=getStrength(addFormPw);

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
        {["teams","hierarchy","users","permissions"].map(t=><button key={t} className={`btn btn-sm ${tab===t?"btn-primary":"btn-sec"}`} onClick={()=>setTab(t)}>{t==="hierarchy"?"Hierarchy":t.charAt(0).toUpperCase()+t.slice(1)}</button>)}
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
                    const userRole=INIT_USERS.find(x=>x.id===mid)?.role||orgUsers.find(x=>x.id===mid)?.role||"sales_exec";
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

      {tab==="hierarchy"&&(
        <div>
          <div className="card" style={{marginBottom:16,padding:"12px 16px",background:"var(--brand-bg)",border:"1px solid var(--brand)",fontSize:12,color:"var(--brand-d)",display:"flex",alignItems:"center",gap:8}}>
            <Users size={14}/>
            <span>Reporting hierarchy is derived from the organisation structure. Click the edit icon on any user to reassign their manager.</span>
          </div>
          <div className="card th-tree">
            {roots.length>0?roots.map(u=><HierarchyNode key={u.id} user={u}/>):(
              <div style={{padding:20,textAlign:"center",color:"var(--text3)",fontSize:13}}>No active users found.</div>
            )}
          </div>
        </div>
      )}

      {tab==="users"&&(
        <div className="user-table">
          <table className="tbl">
            <thead><tr><th>User</th><th>Role</th><th>LOB</th><th>Branch</th><th>Dept</th><th>Status</th><th>Join Date</th>{canManage&&<th style={{width:120}}>Actions</th>}</tr></thead>
            <tbody>{orgUsers.map(u=>{
              const roleInfo=ROLE_MAP[u.role];
              const branch=org.branches.find(b=>b.id===u.branchId);
              const dept=org.departments.find(d=>d.id===u.deptId);
              return (
                <tr key={u.id} style={{opacity:u.active?1:0.5}}>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:9}}>
                      <div className="u-av" style={{width:30,height:30,borderRadius:9,fontSize:10.5,background:roleInfo?roleInfo.color+"18":"var(--brand-bg)",color:roleInfo?.color||"var(--brand)"}}>{u.initials}</div>
                      <div>
                        <div style={{fontWeight:600,fontSize:13}}>{u.name}</div>
                        <div style={{fontSize:11,color:"var(--text3)"}}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      {roleInfo&&<span className="user-role-badge" style={{background:roleInfo.color+"18",color:roleInfo.color}}>{roleInfo.name}</span>}
                      {(customPermissions||{})?.__users?.[u.id]&&<span style={{fontSize:9,background:"#FFF7ED",color:"#D97706",padding:"1px 5px",borderRadius:8,fontWeight:700,border:"1px solid #FDE68A"}}>Custom</span>}
                    </div>
                  </td>
                  <td style={{fontSize:12,color:"var(--text2)"}}>{u.lob}</td>
                  <td style={{fontSize:12,color:"var(--text3)"}}>{branch?.name||"\u2014"}</td>
                  <td style={{fontSize:12,color:"var(--text3)"}}>{dept?.name||"\u2014"}</td>
                  <td>{u.active?<span className="badge bs-active">Active</span>:<span className="badge bs-lost">Inactive</span>}</td>
                  <td style={{fontSize:12,color:"var(--text3)"}}>{fmt.date(u.joinDate)}</td>
                  {canManage&&<td>
                    <div style={{display:"flex",gap:4}}>
                      <button className="icon-btn" onClick={()=>openEditUser(u)} title="Edit user"><Edit2 size={13}/></button>
                      <button className="icon-btn" title="User permissions" onClick={()=>{const userOverrides=(customPermissions||{})?.__users?.[u.id]||{};setUserPermEdits({...getRolePerms(u.role),...userOverrides});setUserPermModal({userId:u.id,userName:u.name,role:u.role});}} style={{color:((customPermissions||{})?.__users?.[u.id])?"#D97706":"#0D9488"}}>{((customPermissions||{})?.__users?.[u.id])?<Unlock size={13}/>:<Lock size={13}/>}</button>
                      <button className="icon-btn" title={u.id===currentUser?"Change password":"Send password reset email"} onClick={()=>{if(u.id===currentUser){setPwModal({mode:"change",userId:u.id,userName:u.name});setPwForm({password:"",confirm:"",current:""});setPwErr("");setPwSuccess("");setGeneratedPw("");setShowPw({pw:false,confirm:false,current:false});}else{sendResetEmail(u.id);}}} style={{color:"#7C3AED"}}><Key size={13}/></button>
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
          <div className="card" style={{marginBottom:16,padding:"12px 16px",background:editingPerms?"#EFF6FF":"var(--amber-bg)",border:`1px solid ${editingPerms?"#3B82F6":"var(--amber)"}`,fontSize:13,color:editingPerms?"#1D4ED8":"var(--amber-t)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>{editingPerms?"Click cells to cycle: RW → R → — (no access). Click Save when done.":"Permissions are role-based. Assign a role to a user to control their access. RW = Read & Write · R = Read only · — = No access."}</span>
            {canManage&&(
              <div style={{display:"flex",gap:6}}>
                {editingPerms ? (
                  <>
                    <button className="btn btn-sm btn-sec" onClick={()=>{setEditingPerms(false);const merged={};ROLES_HIERARCHY.forEach(r=>{merged[r.id]={...(PERMISSIONS[r.id]||{}),...((customPermissions||{})[r.id]||{})};});setPermEdits(merged);}}>Cancel</button>
                    <button className="btn btn-sm btn-primary" onClick={()=>{if(setCustomPermissions){const overrides={};ROLES_HIERARCHY.forEach(r=>{const defaults=PERMISSIONS[r.id]||{};const edits=permEdits[r.id]||{};const diff={};PERM_MODULES.forEach(m=>{if(edits[m]!==defaults[m]) diff[m]=edits[m];});if(Object.keys(diff).length>0) overrides[r.id]=diff;});setCustomPermissions(overrides);}setEditingPerms(false);}}><Check size={13}/>Save Permissions</button>
                  </>
                ) : (
                  <button className="btn btn-sm" style={{background:"#1B6B5A",color:"#fff",border:"none",borderRadius:6,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}} onClick={()=>setEditingPerms(true)}><Edit2 size={12}/>Edit Permissions</button>
                )}
              </div>
            )}
          </div>
          <div className="rpt-card" style={{padding:0,overflow:"hidden"}}>
            <table className="perm-table">
              <thead>
                <tr>
                  <th style={{textAlign:"left",width:180}}>Role</th>
                  {PERM_MODULES.map(m=><th key={m}>{PERM_LABEL[m]}</th>)}
                </tr>
              </thead>
              <tbody>
                {ROLES_HIERARCHY.map(r=>{
                  const p=editingPerms ? (permEdits[r.id]||{}) : {...(PERMISSIONS[r.id]||{}),...((customPermissions||{})[r.id]||{})};
                  if(!p&&!editingPerms) return null;
                  return (
                    <tr key={r.id} style={{background:editingPerms?"#FAFBFF":"transparent"}}>
                      <td style={{textAlign:"left"}}>
                        <span className="user-role-badge" style={{background:r.color+"18",color:r.color}}>{r.name}</span>
                        <div style={{fontSize:10.5,color:"var(--text3)",marginTop:2}}>{r.desc}</div>
                      </td>
                      {PERM_MODULES.map(m=>{
                        const val=p[m];
                        const cycle=()=>{
                          if(!editingPerms) return;
                          // Cycle: rw → r → false → rw (for reports: true → false → true)
                          let next;
                          if(m==="reports") next = val===true ? false : true;
                          else if(val==="rw") next="r";
                          else if(val==="r") next=false;
                          else next="rw";
                          setPermEdits(prev=>({...prev,[r.id]:{...(prev[r.id]||{}),[m]:next}}));
                        };
                        const cellStyle=editingPerms?{cursor:"pointer",transition:"all 0.15s",borderRadius:4,userSelect:"none"}:{};
                        const hoverBg=editingPerms?"#E0E7FF":"transparent";
                        return (
                          <td key={m} onClick={cycle}
                            style={cellStyle}
                            onMouseEnter={e=>{if(editingPerms)e.currentTarget.style.background=hoverBg;}}
                            onMouseLeave={e=>{if(editingPerms)e.currentTarget.style.background="transparent";}}>
                            {val==="rw"&&<span className="perm-rw" style={editingPerms?{cursor:"pointer"}:{}}>RW</span>}
                            {val==="r"&&<span className="perm-r" style={editingPerms?{cursor:"pointer"}:{}}>R</span>}
                            {val===true&&<span className="perm-rw" style={editingPerms?{cursor:"pointer"}:{}}>&check;</span>}
                            {(!val||val===false)&&<span className="perm-no" style={editingPerms?{cursor:"pointer",color:"#DC2626"}:{}}>—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {editingPerms&&(
            <div style={{marginTop:12,padding:"10px 14px",background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:8,fontSize:12,color:"#166534"}}>
              <strong>Tip:</strong> Click any cell to change permission level. Changes apply to all users with that role. Admin role always retains full access.
            </div>
          )}
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

      {/* Add/Edit User Modal — with password section for new users */}
      {(modal?.mode==="adduser"||modal?.mode==="edituser")&&(
        <Modal title={modal.mode==="adduser"?"Add User":"Edit User"} onClose={()=>setModal(null)}
          footer={<><button className="btn btn-sec" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-primary" onClick={saveUser}><Check size={14}/>Save User</button></>} lg>
          {(()=>{
            const f=modal.mode==="adduser"?modal.form:form;
            const setF=modal.mode==="adduser"?v=>setModal(m=>({...m,form:{...m.form,...(typeof v==="function"?v(m.form):v)}})):setForm;
            const strength=getStrength(f.password||"");
            return (
              <>
                <div className="form-row"><div className="form-group"><label>Full Name *</label><input value={f.name||""} onChange={e=>setF(prev=>({...prev,name:e.target.value}))} placeholder="Full name"/></div><div className="form-group"><label>Initials</label><input value={f.initials||""} onChange={e=>setF(prev=>({...prev,initials:e.target.value.toUpperCase().slice(0,3)}))} placeholder="e.g. SB" maxLength={3}/></div></div>
                <div className="form-row full"><div className="form-group"><label>Work Email *</label><input type="email" value={f.email||""} onChange={e=>setF(prev=>({...prev,email:e.target.value}))} placeholder="name@hansinfomatic.com"/></div></div>
                <div className="form-row"><div className="form-group"><label>Role *</label><select value={f.role||"sales_exec"} onChange={e=>setF(prev=>({...prev,role:e.target.value}))}>{ROLES_HIERARCHY.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div><div className="form-group"><label>Product Line (LOB)</label><select value={f.lob||"All"} onChange={e=>setF(prev=>({...prev,lob:e.target.value}))}><option>All</option>{PRODUCTS.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div></div>
                <div className="form-row"><div className="form-group"><label>Branch</label><select value={f.branchId||""} onChange={e=>setF(prev=>({...prev,branchId:e.target.value}))}><option value="">Select…</option>{org.branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.country})</option>)}</select></div><div className="form-group"><label>Department</label><select value={f.deptId||""} onChange={e=>setF(prev=>({...prev,deptId:e.target.value}))}><option value="">Select…</option>{org.departments.filter(d=>!f.branchId||d.branchId===f.branchId).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div></div>
                <div className="form-row"><div className="form-group"><label>Join Date</label><input type="date" value={f.joinDate||""} onChange={e=>setF(prev=>({...prev,joinDate:e.target.value}))}/></div></div>

                {/* New users self-register via the Sign Up form; admin assigns role here */}
                {modal.mode==="adduser"&&(
                  <div style={{marginTop:16,padding:"10px 14px",background:"#EFF6FF",borderRadius:8,border:"1px solid #BFDBFE",fontSize:12,color:"#1D4ED8",display:"flex",alignItems:"flex-start",gap:8}}>
                    <Shield size={14} style={{marginTop:1,flexShrink:0}}/>
                    <span>The user will set their own password when they sign up with this email address via the Sign In page.</span>
                  </div>
                )}

                {f.role&&ROLE_MAP[f.role]&&(
                  <div style={{background:ROLE_MAP[f.role].color+"12",border:`1px solid ${ROLE_MAP[f.role].color}22`,borderRadius:8,padding:"10px 14px",fontSize:12.5,color:ROLE_MAP[f.role].color,marginTop:12}}>
                    <strong>{ROLE_MAP[f.role].name}:</strong> {ROLE_MAP[f.role].desc}
                  </div>
                )}
              </>
            );
          })()}
        </Modal>
      )}

      {/* Password Reset / Change Modal */}
      {pwModal&&(
        <Modal title="Change Your Password" onClose={()=>{setPwModal(null);setPwErr("");setPwSuccess("");}}
          footer={<>
            <button className="btn btn-sec" onClick={()=>{setPwModal(null);setPwErr("");setPwSuccess("");}}>Cancel</button>
            <button className="btn btn-primary" onClick={savePassword}><Check size={14}/>Save Password</button>
          </>}>
          <div style={{marginBottom:16}}>

            <div className="form-group" style={{marginBottom:14}}>
              <label>New Password *</label>
              <div style={{position:"relative"}}>
                <input
                  type={showPw.pw?"text":"password"}
                  value={pwForm.password}
                  onChange={e=>{setPwForm(p=>({...p,password:e.target.value}));setPwErr("");}}
                  placeholder="Min 8 characters, mixed case + number"
                  style={{paddingRight:36}}
                />
                <button type="button" onClick={()=>setShowPw(p=>({...p,pw:!p.pw}))} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#8BA3B4",padding:2}}>
                  {showPw.pw?<EyeOff size={14}/>:<Eye size={14}/>}
                </button>
              </div>
              {pwForm.password&&(()=>{
                const s=getStrength(pwForm.password);
                return (
                  <div style={{marginTop:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{flex:1,height:4,borderRadius:2,background:"#E2E9EF",overflow:"hidden"}}>
                        <div style={{width:`${s.pct}%`,height:"100%",background:s.color,borderRadius:2,transition:"all 0.3s"}}/>
                      </div>
                      <span style={{fontSize:10,fontWeight:600,color:s.color}}>{s.label}</span>
                    </div>
                    <div style={{fontSize:10,color:"var(--text3)",marginTop:4}}>
                      {validatePassword(pwForm.password).map((e,i)=><span key={i} style={{color:"#EF4444",marginRight:8}}>• {e}</span>)}
                      {validatePassword(pwForm.password).length===0&&<span style={{color:"#22C55E"}}>✓ All requirements met</span>}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="form-group" style={{marginBottom:14}}>
              <label>Confirm New Password *</label>
              <div style={{position:"relative"}}>
                <input
                  type={showPw.confirm?"text":"password"}
                  value={pwForm.confirm}
                  onChange={e=>{setPwForm(p=>({...p,confirm:e.target.value}));setPwErr("");}}
                  placeholder="Re-enter new password"
                  style={{paddingRight:36}}
                />
                <button type="button" onClick={()=>setShowPw(p=>({...p,confirm:!p.confirm}))} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#8BA3B4",padding:2}}>
                  {showPw.confirm?<EyeOff size={14}/>:<Eye size={14}/>}
                </button>
              </div>
              {pwForm.password&&pwForm.confirm&&pwForm.password!==pwForm.confirm&&(
                <div style={{fontSize:11,color:"#EF4444",marginTop:4,display:"flex",alignItems:"center",gap:4}}>
                  <AlertTriangle size={11}/> Passwords don't match
                </div>
              )}
              {pwForm.password&&pwForm.confirm&&pwForm.password===pwForm.confirm&&pwForm.password.length>=8&&(
                <div style={{fontSize:11,color:"#22C55E",marginTop:4,display:"flex",alignItems:"center",gap:4}}>
                  <Check size={11}/> Passwords match
                </div>
              )}
            </div>

            {/* Generate button */}
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button type="button" onClick={()=>{
                const gp=generatePassword();
                setPwForm(p=>({...p,password:gp,confirm:gp}));
                setGeneratedPw(gp);
                setShowPw(p=>({...p,pw:true,confirm:true}));
                setCopied(false);
              }} style={{fontSize:11,fontWeight:600,color:"#7C3AED",background:"#7C3AED12",border:"1px solid #7C3AED22",borderRadius:6,padding:"6px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                <RefreshCw size={11}/> Generate Strong Password
              </button>
              {generatedPw&&(
                <button type="button" onClick={()=>{navigator.clipboard.writeText(generatedPw);setCopied(true);setTimeout(()=>setCopied(false),2000);}} style={{fontSize:11,fontWeight:600,color:copied?"#22C55E":"#2563EB",background:copied?"#22C55E12":"#2563EB12",border:"1px solid",borderColor:copied?"#22C55E22":"#2563EB22",borderRadius:6,padding:"6px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                  {copied?<><Check size={11}/> Copied!</>:<><Copy size={11}/> Copy Password</>}
                </button>
              )}
            </div>

            {pwErr&&<div style={{marginTop:12,padding:"10px 14px",background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,fontSize:12,color:"#DC2626"}}>{pwErr}</div>}
            {pwSuccess&&<div style={{marginTop:12,padding:"10px 14px",background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:8,fontSize:12,color:"#16A34A",fontWeight:600}}>{pwSuccess}</div>}
          </div>
        </Modal>
      )}

      {/* User Permissions Modal */}
      {userPermModal&&(
        <Modal title={`Permissions — ${userPermModal.userName}`} onClose={()=>setUserPermModal(null)}
          footer={<>
            <button className="btn btn-sec" onClick={()=>setUserPermModal(null)}>Cancel</button>
            <button className="btn btn-sec" onClick={resetUserPerms} style={{color:"#F97316",borderColor:"#F97316"}}><RefreshCw size={13}/>Reset to Role Default</button>
            <button className="btn btn-primary" onClick={saveUserPerms}><Check size={14}/>Save</button>
          </>} lg>
          <div style={{marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <div className="u-av" style={{width:36,height:36,borderRadius:10,fontSize:12}}>{orgUsers.find(u=>u.id===userPermModal.userId)?.initials||"?"}</div>
              <div>
                <div style={{fontWeight:700,fontSize:14}}>{userPermModal.userName}</div>
                <div style={{fontSize:12,color:"var(--text3)"}}>Base role: <span style={{color:ROLE_MAP[userPermModal.role]?.color,fontWeight:600}}>{ROLE_MAP[userPermModal.role]?.name||userPermModal.role}</span></div>
              </div>
            </div>
            <div style={{padding:"10px 14px",background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:8,fontSize:12,color:"#1D4ED8",marginBottom:16}}>
              Click cells to override permissions for this user. <strong>Orange</strong> cells indicate overrides from the role default. Use "Reset to Role Default" to clear all overrides.
            </div>
            <table className="perm-table" style={{width:"100%"}}>
              <thead>
                <tr>
                  <th style={{textAlign:"left",width:120}}>Module</th>
                  <th style={{width:80}}>Role Default</th>
                  <th style={{width:100}}>User Override</th>
                </tr>
              </thead>
              <tbody>
                {PERM_MODULES.map(m=>{
                  const roleVal=getRolePerms(userPermModal.role)[m];
                  const userVal=userPermEdits[m];
                  const isOverridden=userVal!==roleVal;
                  const cycle=()=>{
                    let next;
                    if(m==="reports") next=userVal===true?false:true;
                    else if(userVal==="rw") next="r";
                    else if(userVal==="r") next=false;
                    else next="rw";
                    setUserPermEdits(prev=>({...prev,[m]:next}));
                  };
                  const fmtVal=(v)=>{
                    if(v==="rw") return <span className="perm-rw">RW</span>;
                    if(v==="r") return <span className="perm-r">R</span>;
                    if(v===true) return <span className="perm-rw">&check;</span>;
                    return <span className="perm-no">—</span>;
                  };
                  return (
                    <tr key={m} style={{background:isOverridden?"#FFF7ED":"transparent"}}>
                      <td style={{textAlign:"left",fontWeight:600,fontSize:13}}>{PERM_LABEL[m]}</td>
                      <td style={{textAlign:"center",opacity:0.6}}>{fmtVal(roleVal)}</td>
                      <td style={{textAlign:"center",cursor:"pointer",borderRadius:4}}
                        onClick={cycle}
                        onMouseEnter={e=>e.currentTarget.style.background="#E0E7FF"}
                        onMouseLeave={e=>e.currentTarget.style.background=isOverridden?"#FFF7ED":"transparent"}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                          {fmtVal(userVal)}
                          {isOverridden&&<span style={{fontSize:9,color:"#D97706",fontWeight:700}}>●</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {(customPermissions||{})?.__users?.[userPermModal.userId]&&(
              <div style={{marginTop:12,fontSize:11,color:"#D97706",display:"flex",alignItems:"center",gap:4}}>
                <Unlock size={12}/>This user has {Object.keys((customPermissions||{}).__users[userPermModal.userId]).length} custom permission override(s)
              </div>
            )}
          </div>
        </Modal>
      )}

      {confirm&&<Confirm title={`Delete ${confirm.type}`} msg={`Remove "${confirm.name}" permanently?`} onConfirm={()=>{if(confirm.type==="team") setTeams(p=>p.filter(t=>t.id!==confirm.id));setConfirm(null);}} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}

export default TeamUsers;
