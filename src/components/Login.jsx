import { useState } from "react";
import { Mail, Lock, Eye, EyeOff, Shield, ChevronRight, UserPlus, LogIn, User, Briefcase, ArrowLeft } from "lucide-react";
import { CREDS, hashPassword, DEMO_PW_HASH, TEAM, ROLES_HIERARCHY } from "../data/constants";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

function Login({onLogin, orgUsers, userPasswords}) {
  const [mode,setMode] = useState("login"); // login | signup | forgot
  const [email,setEmail] = useState("");
  const [pass,setPass]   = useState("");
  const [confirmPass,setConfirmPass] = useState("");
  const [name,setName]   = useState("");
  const [showPw,setShowPw] = useState(false);
  const [err,setErr]     = useState("");
  const [success,setSuccess] = useState("");
  const [attempts,setAttempts] = useState(0);
  const [loading,setLoading] = useState(false);

  // ── Supabase Sign In ──
  const handleSupabaseLogin = async () => {
    setLoading(true); setErr(""); setSuccess("");
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.toLowerCase().trim(), password: pass });
    if (error) { setErr(error.message); setLoading(false); setAttempts(a=>a+1); return; }
    // Get CRM user profile
    const { data: profile } = await supabase.from("users").select("*").eq("auth_user_id", data.user.id).single();
    if (profile) {
      setLoading(false);
      onLogin(profile.id);
    } else {
      // Auth user exists but no CRM profile — check by email
      const { data: profileByEmail } = await supabase.from("users").select("*").eq("email", email.toLowerCase().trim()).single();
      if (profileByEmail) {
        // Link auth user to existing CRM profile
        await supabase.from("users").update({ auth_user_id: data.user.id }).eq("id", profileByEmail.id);
        setLoading(false);
        onLogin(profileByEmail.id);
      } else {
        setErr("Account exists but no CRM profile found. Contact your administrator.");
        setLoading(false);
      }
    }
  };

  // ── Supabase Sign Up ──
  const handleSupabaseSignup = async () => {
    if (!name.trim()) { setErr("Full name is required."); return; }
    if (!email.trim()) { setErr("Work email is required."); return; }
    if (pass.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (pass !== confirmPass) { setErr("Passwords don't match."); return; }

    setLoading(true); setErr(""); setSuccess("");
    const emailLower = email.toLowerCase().trim();

    // Check if CRM user profile already exists for this email
    const { data: existing } = await supabase.from("users").select("id").eq("email", emailLower).single();

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: emailLower,
      password: pass,
      options: { data: { name: name.trim() } }
    });
    if (authError) { setErr(authError.message); setLoading(false); return; }

    if (existing) {
      // Link existing CRM profile to new auth user
      await supabase.from("users").update({ auth_user_id: authData.user.id }).eq("id", existing.id);
    } else {
      // Create new CRM user profile
      const initials = name.trim().split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
      const newId = `u_${Date.now().toString(36)}`;
      await supabase.from("users").insert({
        id: newId,
        name: name.trim(),
        email: emailLower,
        initials,
        role: "sales_exec",
        lob: "All",
        country: "India",
        active: true,
        join_date: new Date().toISOString().slice(0,10),
        auth_user_id: authData.user.id,
      });
    }

    setLoading(false);
    setSuccess("Account created! You can now sign in.");
    setMode("login");
    setPass(""); setConfirmPass("");
  };

  // ── Supabase Forgot Password ──
  const handleForgot = async () => {
    if (!email.trim()) { setErr("Enter your email address first."); return; }
    setLoading(true); setErr("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim());
    if (error) { setErr(error.message); setLoading(false); return; }
    setSuccess("Password reset link sent to your email. Check your inbox.");
    setLoading(false);
  };

  // ── localStorage fallback login ──
  const handleLocalLogin = () => {
    if(attempts >= 5) { setErr("Too many failed attempts. Please wait and try again."); return; }
    const emailLower = email.toLowerCase().trim();
    let uid = CREDS[emailLower];
    if(!uid && orgUsers) {
      const dynUser = orgUsers.find(u => u.email?.toLowerCase() === emailLower && u.active !== false);
      if(dynUser) uid = dynUser.id;
    }
    if(!uid) { setErr("Email not found. Check your login email."); setAttempts(a=>a+1); return; }
    const hashed = hashPassword(pass);
    const expectedHash = userPasswords?.[uid] ?? DEMO_PW_HASH;
    if(hashed !== expectedHash) { setErr("Incorrect password."); setAttempts(a=>a+1); return; }
    setErr(""); setAttempts(0);
    onLogin(uid);
  };

  const handle = () => {
    if (isSupabaseConfigured) {
      if (mode === "signup") handleSupabaseSignup();
      else if (mode === "forgot") handleForgot();
      else handleSupabaseLogin();
    } else {
      handleLocalLogin();
    }
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
      width:"100%", maxWidth:420, boxShadow:"0 24px 80px rgba(0,0,0,0.28)",
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
      transition:"all 0.15s",display:"flex",alignItems:"center",justifyContent:"center",gap:5,
    }),
    fieldLabel: { fontSize:12,fontWeight:600,color:"#4A6070",marginBottom:6,display:"block" },
    inputWrap: { position:"relative",marginBottom:16 },
    inputIcon: { position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",color:"#7A9FAF",pointerEvents:"none" },
    input: {
      width:"100%",boxSizing:"border-box",padding:"11px 14px 11px 40px",
      border:"1.5px solid #E2E9EF",borderRadius:10,fontSize:14,
      background:"#F8FAFB",color:"#0A2E26",outline:"none",transition:"all 0.15s",
    },
    eyeBtn: {
      position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",
      background:"none",border:"none",color:"#7A9FAF",cursor:"pointer",padding:4,
    },
    errText: { fontSize:12,color:"#DC2626",marginBottom:12,padding:"8px 12px",background:"#FEF2F2",borderRadius:8 },
    successText: { fontSize:12,color:"#16A34A",marginBottom:12,padding:"8px 12px",background:"#F0FDF4",borderRadius:8 },
    primaryBtn: {
      width:"100%",padding:"13px 0",borderRadius:11,border:"none",
      background:"#0F3D33",color:"#fff",fontSize:14,fontWeight:700,
      cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1,
      display:"flex",alignItems:"center",justifyContent:"center",gap:8,
      letterSpacing:"0.2px",transition:"background 0.15s",marginBottom:10,
    },
    switchLink: {
      fontSize:13,color:"#1B6B5A",textAlign:"center",cursor:"pointer",fontWeight:600,
      marginTop:12,marginBottom:16,
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

  const focusStyle = (e) => {e.target.style.borderColor='#1B6B5A';e.target.style.background='#fff';};
  const blurStyle = (e) => {e.target.style.borderColor='#E2E9EF';e.target.style.background='#F8FAFB';};

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

        <div style={s.sectionTitle}>
          {mode==="login" ? "Welcome back" : mode==="signup" ? "Create Account" : "Reset Password"}
        </div>
        <div style={s.sectionSub}>
          {mode==="login" ? "Sign in to your account to continue" : mode==="signup" ? "Set up your SmartCRM account" : "We'll send you a reset link"}
        </div>

        {/* Tab switcher — only show for Supabase mode */}
        {isSupabaseConfigured ? (
          <div style={s.tabRow}>
            <button style={s.tab(mode==="login")} onClick={()=>{setMode("login");setErr("");setSuccess("");}}>
              <LogIn size={14}/>Sign In
            </button>
            <button style={s.tab(mode==="signup")} onClick={()=>{setMode("signup");setErr("");setSuccess("");}}>
              <UserPlus size={14}/>Sign Up
            </button>
          </div>
        ) : (
          <div style={s.tabRow}>
            <button style={s.tab(true)}>Simple Login</button>
            <button style={s.tab(false)}>Magic Link</button>
          </div>
        )}

        {/* Back link for forgot mode */}
        {mode==="forgot" && (
          <button onClick={()=>{setMode("login");setErr("");setSuccess("");}}
            style={{background:"none",border:"none",color:"#1B6B5A",fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4,marginBottom:16,padding:0}}>
            <ArrowLeft size={14}/> Back to Sign In
          </button>
        )}

        {/* Name field — signup only */}
        {mode==="signup" && (
          <>
            <label style={s.fieldLabel}>Full Name</label>
            <div style={s.inputWrap}>
              <span style={s.inputIcon}><User size={15}/></span>
              <input style={s.input} type="text" placeholder="John Doe" value={name}
                onChange={e=>{setName(e.target.value);setErr("");}}
                onKeyDown={e=>e.key==="Enter"&&handle()} onFocus={focusStyle} onBlur={blurStyle}/>
            </div>
          </>
        )}

        {/* Email field */}
        <label style={s.fieldLabel}>Work Email</label>
        <div style={s.inputWrap}>
          <span style={s.inputIcon}><Mail size={15}/></span>
          <input style={s.input} type="email" placeholder="you@hansinfomatic.com" value={email}
            onChange={e=>{setEmail(e.target.value);setErr("");setSuccess("");}}
            onKeyDown={e=>e.key==="Enter"&&handle()} onFocus={focusStyle} onBlur={blurStyle}/>
        </div>

        {/* Password field — not for forgot mode */}
        {mode!=="forgot" && (
          <>
            <label style={s.fieldLabel}>Password</label>
            <div style={s.inputWrap}>
              <span style={s.inputIcon}><Lock size={15}/></span>
              <input style={{...s.input, paddingRight:44}} type={showPw?"text":"password"}
                placeholder={mode==="signup"?"Create a strong password":"Enter password"} value={pass}
                onChange={e=>{setPass(e.target.value);setErr("");}}
                onKeyDown={e=>e.key==="Enter"&&(mode==="signup"?null:handle())} onFocus={focusStyle} onBlur={blurStyle}/>
              <button style={s.eyeBtn} onClick={()=>setShowPw(v=>!v)} type="button">
                {showPw?<EyeOff size={14}/>:<Eye size={14}/>}
              </button>
            </div>
          </>
        )}

        {/* Confirm password — signup only */}
        {mode==="signup" && (
          <>
            <label style={s.fieldLabel}>Confirm Password</label>
            <div style={s.inputWrap}>
              <span style={s.inputIcon}><Lock size={15}/></span>
              <input style={{...s.input, paddingRight:44}} type={showPw?"text":"password"}
                placeholder="Confirm your password" value={confirmPass}
                onChange={e=>{setConfirmPass(e.target.value);setErr("");}}
                onKeyDown={e=>e.key==="Enter"&&handle()} onFocus={focusStyle} onBlur={blurStyle}/>
            </div>
            {pass && (
              <div style={{marginBottom:16,marginTop:-8}}>
                <div style={{display:"flex",gap:4,marginBottom:4}}>
                  {[1,2,3,4].map(i=>(
                    <div key={i} style={{flex:1,height:3,borderRadius:2,background:
                      pass.length>=8&&/[A-Z]/.test(pass)&&/[0-9]/.test(pass)&&/[^A-Za-z0-9]/.test(pass) ? "#22C55E" :
                      pass.length>=6&&(/[A-Z]/.test(pass)||/[0-9]/.test(pass)) ? (i<=3?"#F59E0B":"#E2E9EF") :
                      pass.length>=4 ? (i<=2?"#F97316":"#E2E9EF") : (i<=1?"#DC2626":"#E2E9EF")
                    }}/>
                  ))}
                </div>
                <div style={{fontSize:10,color:"#7A9FAF"}}>
                  {pass.length<6?"Too short (min 6)":pass.length>=8&&/[A-Z]/.test(pass)&&/[0-9]/.test(pass)?"Strong":"Moderate — add uppercase, numbers, symbols"}
                </div>
              </div>
            )}
          </>
        )}

        {err && <div style={s.errText}>{err}</div>}
        {success && <div style={s.successText}>{success}</div>}

        {/* Primary action button */}
        <button style={s.primaryBtn} onClick={handle} disabled={loading}
          onMouseEnter={e=>{if(!loading)e.currentTarget.style.background='#1B5A4A';}}
          onMouseLeave={e=>{e.currentTarget.style.background='#0F3D33';}}>
          {loading ? "Please wait..." : mode==="login" ? <><LogIn size={16}/>Sign In</> : mode==="signup" ? <><UserPlus size={16}/>Create Account</> : <><Mail size={16}/>Send Reset Link</>}
        </button>

        {/* Forgot password link — login mode only with Supabase */}
        {isSupabaseConfigured && mode==="login" && (
          <div style={s.switchLink} onClick={()=>{setMode("forgot");setErr("");setSuccess("");}}>
            Forgot your password?
          </div>
        )}

        {/* Hint */}
        <div style={s.hint}>
          {mode==="signup"
            ? "Your account will be created with default Sales Executive access. Your admin can update your role and permissions."
            : "Use your registered work email and password to sign in. Contact your administrator if you need access."
          }
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
