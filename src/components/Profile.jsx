import { useState } from "react";
import { Check, X, Edit2, Key, Eye, EyeOff, User, Mail, Briefcase, MapPin, Calendar, Shield } from "lucide-react";
import { ROLE_MAP, INIT_USERS, hashPassword } from '../data/constants';
import { fmt } from '../utils/helpers';

function Profile({currentUser,orgUsers,setOrgUsers,userPasswords,setUserPasswords}) {
  const user=(orgUsers||[]).find(u=>u.id===currentUser)||INIT_USERS.find(u=>u.id===currentUser);
  const roleInfo=ROLE_MAP[user?.role];
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({});
  const [pwMode,setPwMode]=useState(false);
  const [pwForm,setPwForm]=useState({current:"",password:"",confirm:""});
  const [showPw,setShowPw]=useState({current:false,password:false,confirm:false});
  const [pwErr,setPwErr]=useState("");
  const [pwOk,setPwOk]=useState("");
  const [saveOk,setSaveOk]=useState("");

  if(!user) return <div style={{padding:40,textAlign:"center",color:"var(--text3)"}}>User not found</div>;

  const startEdit=()=>{setForm({name:user.name||"",email:user.email||"",initials:user.initials||"",lob:user.lob||""});setEditing(true);setSaveOk("");};
  const cancelEdit=()=>{setEditing(false);setForm({});};
  const saveProfile=()=>{
    if(!form.name?.trim()) return;
    const initials=form.initials||form.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
    setOrgUsers(p=>p.map(u=>u.id===currentUser?{...u,name:form.name.trim(),email:form.email.trim(),initials,lob:form.lob}:u));
    setEditing(false);
    setSaveOk("Profile updated");
    setTimeout(()=>setSaveOk(""),3000);
  };

  const changePw=()=>{
    setPwErr("");setPwOk("");
    if(!pwForm.current){setPwErr("Current password is required");return;}
    if(hashPassword(pwForm.current)!==userPasswords?.[currentUser]){setPwErr("Current password is incorrect");return;}
    if(pwForm.password.length<8){setPwErr("New password must be at least 8 characters");return;}
    if(pwForm.password!==pwForm.confirm){setPwErr("Passwords do not match");return;}
    setUserPasswords(prev=>({...prev,[currentUser]:hashPassword(pwForm.password)}));
    setPwOk("Password changed successfully");
    setPwForm({current:"",password:"",confirm:""});
    setTimeout(()=>{setPwMode(false);setPwOk("");},2000);
  };

  const F=({icon,label,value})=>(
    <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"12px 0",borderBottom:"1px solid var(--border)"}}>
      <div style={{width:32,height:32,borderRadius:8,background:"var(--brand-bg)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{icon}</div>
      <div><div style={{fontSize:11,fontWeight:600,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.5px"}}>{label}</div><div style={{fontSize:14,fontWeight:500,color:"var(--text1)",marginTop:2}}>{value||"—"}</div></div>
    </div>
  );

  const PwInput=({label,field})=>(
    <div style={{marginBottom:12}}>
      <label style={{fontSize:12,fontWeight:600,color:"var(--text2)",display:"block",marginBottom:4}}>{label}</label>
      <div style={{position:"relative"}}>
        <input type={showPw[field]?"text":"password"} value={pwForm[field]} onChange={e=>setPwForm(p=>({...p,[field]:e.target.value}))}
          style={{width:"100%",padding:"8px 36px 8px 12px",border:"1px solid var(--border)",borderRadius:8,fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}
          onKeyDown={e=>e.key==="Enter"&&changePw()}/>
        <button onClick={()=>setShowPw(p=>({...p,[field]:!p[field]}))}
          style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"var(--text3)",padding:0}}>
          {showPw[field]?<EyeOff size={14}/>:<Eye size={14}/>}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{maxWidth:720,margin:"0 auto"}}>
      <div className="pg-header"><div><div className="pg-title">My Profile</div><div className="pg-sub">View and manage your account details</div></div></div>

      {/* Profile Card */}
      <div className="card" style={{padding:0,overflow:"hidden",marginBottom:20}}>
        <div style={{background:"linear-gradient(135deg,var(--brand) 0%,#0D9488 100%)",padding:"32px 28px 20px",position:"relative"}}>
          <div style={{display:"flex",alignItems:"center",gap:16}}>
            <div style={{width:64,height:64,borderRadius:16,background:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:800,color:"white",border:"3px solid rgba(255,255,255,0.3)"}}>{user.initials||"?"}</div>
            <div>
              <div style={{fontSize:22,fontWeight:800,color:"white"}}>{user.name}</div>
              <div style={{fontSize:13,color:"rgba(255,255,255,0.8)",marginTop:2}}>{user.email}</div>
              {roleInfo&&<span style={{display:"inline-block",marginTop:6,fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:8,background:"rgba(255,255,255,0.2)",color:"white"}}>{roleInfo.name}</span>}
            </div>
          </div>
          {!editing&&<button onClick={startEdit} style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.2)",border:"none",borderRadius:8,padding:"6px 14px",color:"white",cursor:"pointer",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>
            <Edit2 size={13}/>Edit Profile
          </button>}
        </div>

        {editing?(
          <div style={{padding:"20px 28px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:"var(--text2)",display:"block",marginBottom:4}}>Full Name *</label>
                <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}
                  style={{width:"100%",padding:"8px 12px",border:"1px solid var(--border)",borderRadius:8,fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:"var(--text2)",display:"block",marginBottom:4}}>Email</label>
                <input value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}
                  style={{width:"100%",padding:"8px 12px",border:"1px solid var(--border)",borderRadius:8,fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:"var(--text2)",display:"block",marginBottom:4}}>Initials</label>
                <input value={form.initials} onChange={e=>setForm(p=>({...p,initials:e.target.value.toUpperCase().slice(0,3)}))} maxLength={3}
                  style={{width:"100%",padding:"8px 12px",border:"1px solid var(--border)",borderRadius:8,fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:"var(--text2)",display:"block",marginBottom:4}}>Line of Business</label>
                <input value={form.lob} onChange={e=>setForm(p=>({...p,lob:e.target.value}))}
                  style={{width:"100%",padding:"8px 12px",border:"1px solid var(--border)",borderRadius:8,fontSize:13,fontFamily:"inherit",boxSizing:"border-box"}}/>
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"}}>
              <button className="btn btn-sec" onClick={cancelEdit}><X size={13}/>Cancel</button>
              <button className="btn btn-primary" onClick={saveProfile}><Check size={14}/>Save Changes</button>
            </div>
          </div>
        ):(
          <div style={{padding:"8px 28px 20px"}}>
            {saveOk&&<div style={{padding:"8px 14px",background:"#ECFDF5",border:"1px solid #A7F3D0",borderRadius:8,fontSize:12,color:"#065F46",marginBottom:12,display:"flex",alignItems:"center",gap:6}}><Check size={14}/>{saveOk}</div>}
            <F icon={<User size={15} style={{color:"var(--brand)"}}/>} label="Full Name" value={user.name}/>
            <F icon={<Mail size={15} style={{color:"var(--brand)"}}/>} label="Email" value={user.email}/>
            <F icon={<Shield size={15} style={{color:roleInfo?.color||"var(--brand)"}}/>} label="Role" value={roleInfo?.name||user.role}/>
            <F icon={<Briefcase size={15} style={{color:"var(--brand)"}}/>} label="Line of Business" value={user.lob}/>
            <F icon={<MapPin size={15} style={{color:"var(--brand)"}}/>} label="Branch" value={user.branchId}/>
            <F icon={<Calendar size={15} style={{color:"var(--brand)"}}/>} label="Join Date" value={fmt.date(user.joinDate)}/>
          </div>
        )}
      </div>

      {/* Change Password */}
      <div className="card" style={{padding:0,overflow:"hidden"}}>
        <div style={{padding:"16px 28px",borderBottom:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Key size={16} style={{color:"var(--brand)"}}/>
            <div style={{fontWeight:700,fontSize:14}}>Security</div>
          </div>
          {!pwMode&&<button className="btn btn-sec" onClick={()=>{setPwMode(true);setPwErr("");setPwOk("");}} style={{fontSize:12}}><Key size={12}/>Change Password</button>}
        </div>
        {pwMode?(
          <div style={{padding:"20px 28px"}}>
            {pwErr&&<div style={{padding:"8px 14px",background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,fontSize:12,color:"#DC2626",marginBottom:12}}>{pwErr}</div>}
            {pwOk&&<div style={{padding:"8px 14px",background:"#ECFDF5",border:"1px solid #A7F3D0",borderRadius:8,fontSize:12,color:"#065F46",marginBottom:12,display:"flex",alignItems:"center",gap:6}}><Check size={14}/>{pwOk}</div>}
            <PwInput label="Current Password" field="current"/>
            <PwInput label="New Password (min 8 characters)" field="password"/>
            <PwInput label="Confirm New Password" field="confirm"/>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
              <button className="btn btn-sec" onClick={()=>{setPwMode(false);setPwForm({current:"",password:"",confirm:""});setPwErr("");}}><X size={13}/>Cancel</button>
              <button className="btn btn-primary" onClick={changePw}><Check size={14}/>Update Password</button>
            </div>
          </div>
        ):(
          <div style={{padding:"16px 28px",fontSize:13,color:"var(--text3)"}}>
            Your password is encrypted and secure. Use the button above to change it.
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;
