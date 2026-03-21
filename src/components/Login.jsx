import { useState } from "react";
import { Mail, Lock, Eye, EyeOff, Shield, ChevronRight } from "lucide-react";
import { CREDS, hashPassword, DEMO_PW_HASH } from "../data/constants";

function Login({onLogin, orgUsers, userPasswords}) {
  const [email,setEmail] = useState("");
  const [pass,setPass]   = useState("");
  const [showPw,setShowPw] = useState(false);
  const [err,setErr]     = useState("");
  const [attempts,setAttempts] = useState(0);

  const handle = () => {
    if(attempts >= 5) { setErr("Too many failed attempts. Please wait and try again."); return; }
    const emailLower = email.toLowerCase().trim();
    // Check original CREDS (seed users) first
    let uid = CREDS[emailLower];
    // Also check dynamically added users from orgUsers
    if(!uid && orgUsers) {
      const dynUser = orgUsers.find(u => u.email?.toLowerCase() === emailLower && u.active !== false);
      if(dynUser) uid = dynUser.id;
    }
    if(!uid) { setErr("Email not found. Check your login email."); setAttempts(a=>a+1); return; }
    const hashed = hashPassword(pass);
    // Use per-user password from userPasswords state (may have been changed), fall back to DEMO_PW_HASH
    const expectedHash = userPasswords?.[uid] ?? DEMO_PW_HASH;
    if(hashed !== expectedHash) { setErr("Incorrect password."); setAttempts(a=>a+1); return; }
    setErr(""); setAttempts(0);
    onLogin(uid);
  };

  const s = {
    outer: {
      minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:"linear-gradient(135deg,#0A2E26 0%,#0F3D33 40%,#1B6B5A 100%)",
      fontFamily:"'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      padding:20,
    },
    card: {
      background:"#fff", borderRadius:20, padding:"44px 40px 36px",
      width:"100%, maxWidth:420, boxShadow:"0 24px 80px rgba(0,0,0,0.28)",
    },
    logoRow: { display:"flex",alignItems:"center",gap:12,marginBottom:32 },
    logoIcon: {
      width:44,height:44,borderRadius:12,
      background:"linear-gradient(135deg,#0F3D33,#1B6B5A)",
      display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
    },
    logoTitle: { fontSize:20,fontWeight:800,color:"#0A2E26",letterSpacing:"-0.5px" },
    logoSub: { fontSize:11,color:"#7A9FAF",fontWeight:600,letterSpacing:"0.5px",textTransform:"uppercase",marginTop:1 },
    sectionTitle: { fontSize:22,fontWeight:800,color:"#0A2E26",marginBottom:4 },
    sectionSub: { fontSize:13,color:"#7A9FAF",marginBottom:24 },
    tabRow: { display:"flex",gap:4,background:"#F0F4F8",borderRadius:10,padding:4,marginBottom:24 },
    tab: (active) => ({
      flex:1, padding:"8px 0", borderRadius:8, border:"none",
      background: active ? "#fff" : "transparent",
      color: active ? "#0A2E26" : "#7A9FAF",
      fontWeight: active ? 700 : 500,
      fontSize:13,cursor:"pointer",
      boxShadow: active ? "0 1px 4px rgba(0,0,0,0.10)" : "none",
      transition:"all 0.15s",
    }),
    fieldLabel: { fontSize:12,fontWeight:600,color:"#4A6070",marginBottom:6,display:"block" },
    inputWrap: { position:"relative",marginBottom:16 },
    inputIcon: { position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:"#7A9FAF",pointerEvents:"none" },
    input: {
      width:"100%",boxSizing:"border-box",padding:"11px 14px 11px 40px",
      border:"1.5px solid #E2E9EF",borderRadius:10,fontSize:14,
      background:"#F8FAFB",color:"#0A2E26",outline:"none",transition:"all 0.15s",
    },
    forgotLink: {
      position:"absolute",right:38,top:"50%",transform:"translateY(-50%)",
      background:"none",border:"none",color:"#7A9FAF",fontSize:10,fontWeight:700,
      cursor:"pointer",letterSpacing:"0.5px",padding:4,
    },
    eyeBtn: {
      position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
      background:"none",border:"none",color:"#7A9FAF",cursor:"pointer",padding:4,
    },
    errText: { fontSize:12,color:"#DC2626",marginBottom:12,padding:"8px 12px",background:"#FEF2F2",borderRadius:8 },
    mfaRow: { display:"flex",alignItems:"center",gap:8,fontSize:12,color:"#7A9FAF",marginBottom:20 },
    checkbox: { accentColor:"#1B6B5A",width:14,height:14 },
    primaryBtn: {
      width:"100%",padding:"13px 0",borderRadius:11,border:"none",
      background:"#0F3D33",color:"#fff",fontSize:14,fontWeight:700,
      cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
      letterSpacing:"0.2px",transition:"background 0.15s",marginBottom:10,
    },
    secondaryBtn: {
      width:"100%",padding:"12px 0",borderRadius:11,
      border:"1.5px solid #E2E9EF",background:"transparent",
      color:"#4A6070",fontSize:14,fontWeight:500,cursor:"pointer",
      transition:"border-color 0.15s",marginBottom:20,
    },
    hint: {
      fontSize:12, color:"#7A9FAF", textAlign:"center",
      padding:"10px 14px", background:"#F0F8F5",
      borderRadius:8, marginBottom:16, lineHeight:1.6,
    },
    secureLine: {
      display:"flex",alignItems:"center",justifyContent:"center",gap:5,
      fontSize:10,color:"#B0C4CC",letterSpacing:"0.3px",
    },
  };

  return (
    <div style={s.outer}>
      <div style={s.card}>
        {/* Logo */}
        <div style={s.logoRow}>
          <div style={s.logoIcon}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white"/>
              <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={s.logoTitle}>SmartCRM</div>
            <div style={s.logoSub}>Hans Infomatic Pvt. Ltd.</div>
          </div>
        </div>

        <div style={s.sectionTitle}>Welcome back</div>
        <div style={s.sectionSub}>Sign in to your account to continue</div>

        {/* Tab switcher */}
        <div style={s.tabRow}>
          <button style={s.tab(true)}>Simple Login</button>
          <button style={s.tab(false)}>Magic Link</button>
        </div>

        {/* Email field */}
        <label style={s.fieldLabel}>Work Email</label>
        <div style={s.inputWrap}>
          <span style={s.inputIcon}><Mail size={15}/></span>
          <input
            style={s.input}
            type="email"
            placeholder="you@hansinfomatic.com"
            value={email}
            onChange={e=>{setEmail(e.target.value);setErr("");}}
            onKeyDown={e=>e.key==="Enter"&&handle()}
            onFocus={e=>{e.target.style.borderColor='#1B6B5A';e.target.style.background='#fff';}}
            onBlur={e=>{e.target.style.borderColor='#E2E9EF';e.target.style.background='#F8FAFB';}}
          />
        </div>

        {/* Password field */}
        <label style={s.fieldLabel}>Password</label>
        <div style={s.inputWrap}>
          <span style={s.inputIcon}><Lock size={15}/></span>
          <input
            style={{...s.input, paddingRight:90}}
            type={showPw?"text":"password"}
            placeholder="Enter password"
            value={pass}
            onChange={e=>{setPass(e.target.value);setErr("");}}
            onKeyDown={e=>e.key==="Enter"&&handle()}
            onFocus={e=>{e.target.style.borderColor='#1B6B5A';e.target.style.background='#fff';}}
            onBlur={e=>{e.target.style.borderColor='#E2E9EF';e.target.style.background='#F8FAFB';}}
          />
          <button style={s.forgotLink} type="button" tabIndex={-1}>FORGOT?</button>
          <button style={s.eyeBtn} onClick={()=>setShowPw(v=>!v)} type="button">
            {showPw?<EyeOff size={14}/>:<Eye size={14}/>}          
          </button>
        </div>

        {err && <div style={s.errText}>{err}</div>}

        {/* MFA checkbox */}
        <div style={s.mfaRow}>
          <input type="checkbox" style={s.checkbox} defaultChecked/>
          <span>MFA required for this domain</span>
        </div>

        {/* Buttons */}
        <button
          style={s.primaryBtn}
          onClick={handle}
          onMouseEnter={e=>{e.currentTarget.style.background='#1B5A4A';}}
          onMouseLeave={e=>{e.currentTarget.style.background='#0F3D33';}}
        >
          Authenticate System <ChevronRight size={16}/>
        </button>
        <button
          style={s.secondaryBtn}
          onMouseEnter={e=>{e.currentTarget.style.borderColor='#8BA3B4';}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor='#E2E9EF';}}
        >
          Email me a Magic Link
        </button>

        {/* Sign-in instructions — no credentials exposed */}
        <div style={s.hint}>
          Use your registered work email and your assigned password to sign in.
          Contact your administrator if you need access.
        </div>

        {/* Secure footer */}
        <div style={s.secureLine}>
          <Shield size={10}/>
          Secure session provided by Hans Infomatic Infrastructure
        </div>
      </div>
    </div>
  );
}

export default Login;