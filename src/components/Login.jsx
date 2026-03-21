import { useState } from "react";
import { Mail, Lock, Eye, EyeOff, Shield, ChevronRight } from "lucide-react";
import { CREDS, hashPassword, DEMO_PW_HASH } from "../data/constants";

function Login({onLogin}) {
  const [email,setEmail] = useState("");
  const [pass,setPass]   = useState("");
  const [showPw,setShowPw] = useState(false);
  const [err,setErr]     = useState("");
  const [attempts,setAttempts] = useState(0);

  const handle = () => {
    if(attempts >= 5) { setErr("Too many failed attempts. Please wait and try again."); return; }
    const uid = CREDS[email.toLowerCase()];
    if(!uid)         { setErr("Email not found. Check your login email."); setAttempts(a=>a+1); return; }
    if(hashPassword(pass) !== DEMO_PW_HASH){ setErr("Incorrect password."); setAttempts(a=>a+1); return; }
    setErr(""); setAttempts(0);
    onLogin(uid);
  };

  const s = {
    wrap: {
      display:'flex', minHeight:'100vh', fontFamily:"'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif",
    },
    /* LEFT PANEL */
    left: {
      width:'40%', minWidth:380, background:'linear-gradient(170deg, #0F3D33 0%, #143D32 40%, #1B5A4A 100%)',
      color:'white', display:'flex', flexDirection:'column', justifyContent:'space-between',
      padding:'32px 36px 28px', position:'relative', overflow:'hidden',
    },
    leftOverlay: {
      position:'absolute', top:0, left:0, right:0, bottom:0,
      background:'radial-gradient(ellipse at 20% 80%, rgba(42,138,116,0.25) 0%, transparent 60%)',
      pointerEvents:'none',
    },
    topBar: {
      display:'flex', justifyContent:'space-between', alignItems:'center', position:'relative', zIndex:1,
    },
    statusDot: {
      width:7, height:7, borderRadius:'50%', background:'#4ADE80', display:'inline-block', marginRight:8,
      boxShadow:'0 0 6px rgba(74,222,128,0.6)',
    },
    statusText: {
      fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(255,255,255,0.6)',
      display:'flex', alignItems:'center',
    },
    topLinks: {
      display:'flex', gap:16, fontSize:11, color:'rgba(255,255,255,0.5)', letterSpacing:'0.03em',
    },
    logoSection: {
      position:'relative', zIndex:1,
    },
    logoRow: {
      display:'flex', alignItems:'center', gap:14, marginBottom:20,
    },
    logoIcon: {
      width:48, height:48, background:'rgba(0,0,0,0.35)', borderRadius:14,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:22, fontFamily:"'Outfit',sans-serif", fontWeight:800, color:'white',
      border:'1px solid rgba(255,255,255,0.08)',
    },
    logoTitle: {
      fontFamily:"'Outfit',sans-serif", fontSize:20, fontWeight:700, letterSpacing:'-0.01em',
    },
    logoSub: {
      fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'rgba(255,255,255,0.45)', marginTop:2,
    },
    featureNum: {
      fontFamily:"'Outfit',sans-serif", fontSize:64, fontWeight:800, color:'rgba(255,255,255,0.08)',
      lineHeight:1, marginBottom:4,
    },
    featureTitle: {
      fontFamily:"'Outfit',sans-serif", fontSize:20, fontWeight:600, marginBottom:8,
    },
    featureDesc: {
      fontSize:13, lineHeight:1.7, color:'rgba(255,255,255,0.55)', maxWidth:320,
    },
    bottomSection: {
      position:'relative', zIndex:1,
    },
    brandLine: {
      display:'flex', alignItems:'center', gap:8, marginBottom:12,
    },
    brandSmartCRM: {
      fontFamily:"'Outfit',sans-serif", fontSize:13, fontWeight:700, letterSpacing:'0.06em',
      textTransform:'uppercase',
    },
    brandSep: {
      width:1, height:12, background:'rgba(255,255,255,0.2)', display:'inline-block',
    },
    brandCompany: {
      fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(255,255,255,0.4)',
    },
    footerLinks: {
      fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(255,255,255,0.25)',
      display:'flex', gap:16,
    },

    /* RIGHT PANEL */
    right: {
      flex:1, background:'#FFFFFF', display:'flex', alignItems:'center', justifyContent:'center',
      padding:'40px 60px',
    },
    formWrap: {
      width:'100%', maxWidth:420,
    },
    formTitle: {
      fontFamily:"'Outfit',sans-serif", fontSize:26, fontWeight:700, color:'#0D1F2D', marginBottom:6,
    },
    formSub: {
      fontSize:13, color:'#8BA3B4', marginBottom:28, lineHeight:1.5,
    },
    modulesRow: {
      display:'flex', gap:10, marginBottom:24,
    },
    moduleChip: {
      display:'flex', alignItems:'center', gap:6, padding:'7px 14px',
      background:'#F8FAFB', border:'1.5px solid #E2E9EF', borderRadius:8,
      fontSize:10, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', color:'#4A6070',
    },
    moduleDot: {
      width:6, height:6, borderRadius:'50%',
    },
    authLabel: {
      fontSize:10, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase',
      color:'#8BA3B4', marginBottom:10, display:'block',
    },
    tabRow: {
      display:'flex', marginBottom:24, borderBottom:'2px solid #E2E9EF',
    },
    tab: (active) => ({
      padding:'10px 20px', fontSize:12, fontWeight:600, letterSpacing:'0.03em',
      color: active ? '#0D1F2D' : '#8BA3B4', cursor:'pointer', border:'none', background:'none',
      borderBottom: active ? '2px solid #1B6B5A' : '2px solid transparent',
      marginBottom:-2, fontFamily:'inherit', transition:'all 0.15s',
    }),
    fieldLabel: {
      display:'block', fontSize:11, fontWeight:600, color:'#4A6070', marginBottom:6,
      textTransform:'uppercase', letterSpacing:'0.06em',
    },
    inputWrap: {
      position:'relative', marginBottom:16,
    },
    inputIcon: {
      position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'#8BA3B4',
    },
    input: {
      width:'100%', padding:'12px 44px 12px 42px', border:'1.5px solid #E2E9EF',
      borderRadius:8, fontSize:14, fontFamily:'inherit',
      color:'#0D1F2D', background:'#F8FAFB', outline:'none',
      transition:'border-color 0.15s, background 0.15s',
    },
    eyeBtn: {
      position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
      background:'none', border:'none', cursor:'pointer', color:'#8BA3B4', padding:2,
    },
    forgotLink: {
      position:'absolute', right:40, top:'50%', transform:'translateY(-50%)',
      fontSize:10, fontWeight:700, letterSpacing:'0.06em', color:'#1B6B5A', cursor:'pointer',
      background:'none', border:'none', fontFamily:'inherit',
    },
    errText: {
      fontSize:12, color:'#DC2626', marginTop:-8, marginBottom:12,
    },
    mfaRow: {
      display:'flex', alignItems:'center', gap:8, marginBottom:16, fontSize:12, color:'#4A6070',
    },
    checkbox: {
      accentColor:'#1B6B5A',
    },
    primaryBtn: {
      width:'100%', padding:'14px 20px', background:'#0F3D33', color:'white',
      border:'none', borderRadius:8, fontSize:14, fontWeight:600,
      cursor:'pointer', fontFamily:"'Outfit',sans-serif",
      display:'flex', alignItems:'center', justifyContent:'center', gap:8,
      transition:'background 0.15s', letterSpacing:'0.01em', marginTop:8,
    },
    secondaryBtn: {
      width:'100%', padding:'12px 20px', background:'transparent', color:'#4A6070',
      border:'1.5px solid #E2E9EF', borderRadius:8, fontSize:13, fontWeight:500,
      cursor:'pointer', fontFamily:'inherit', marginTop:10,
      transition:'border-color 0.15s',
    },
    hint: {
      marginTop:20, padding:'12px 14px', background:'#EBF7F4',
      borderRadius:8, fontSize:12, color:'#134D41', lineHeight:1.6,
    },
    secureLine: {
      marginTop:28, textAlign:'center', fontSize:9, letterSpacing:'0.1em',
      textTransform:'uppercase', color:'#C8D4DF',
      display:'flex', alignItems:'center', justifyContent:'center', gap:6,
    },
  };

  return (
    <div style={s.wrap}>
      {/* ── LEFT PANEL ── */}
      <div style={s.left}>
        <div style={s.leftOverlay}/>

        {/* Top bar */}
        <div style={s.topBar}>
          <div style={s.statusText}>
            <span style={s.statusDot}/>
            SYSTEM OPERATIONAL &middot; V4.8.2
          </div>
          <div style={s.topLinks}>
            <span>English (US)</span>
            <span>Support</span>
          </div>
        </div>

        {/* Logo + Feature */}
        <div style={s.logoSection}>
          <div style={s.logoRow}>
            <div style={s.logoIcon}>A</div>
            <div>
              <div style={s.logoTitle}>The Architectural Ledger</div>
              <div style={s.logoSub}>Enterprise Resource Planning & Relationship Management</div>
            </div>
          </div>

          <div style={s.featureNum}>01</div>
          <div style={s.featureTitle}>Precision Data Integration</div>
          <div style={s.featureDesc}>
            Securely manage multi-national corporate accounts with sub-millisecond latency and end-to-end encryption.
          </div>
        </div>

        {/* Bottom branding */}
        <div style={s.bottomSection}>
          <div style={s.brandLine}>
            <span style={s.brandSmartCRM}>SmartCRM</span>
            <span style={s.brandSep}/>
            <span style={s.brandCompany}>Hans Infomatic Pvt. Ltd.</span>
          </div>
          <div style={s.footerLinks}>
            <span>Privacy Policy</span>
            <span>Information Security</span>
            <span>System Disclosure</span>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={s.right}>
        <div style={s.formWrap}>
          <div style={s.formTitle}>Corporate Sign In</div>
          <div style={s.formSub}>Access your enterprise dashboard and global pipeline</div>

          {/* Module chips */}
          <div style={s.modulesRow}>
            <div style={s.moduleChip}>
              <span style={{...s.moduleDot, background:'#2563EB'}}/>
              Azure AD
            </div>
            <div style={s.moduleChip}>
              <span style={{...s.moduleDot, background:'#16A34A'}}/>
              Data
            </div>
            <div style={s.moduleChip}>
              <span style={{...s.moduleDot, background:'#D97706'}}/>
              Module
            </div>
          </div>

          {/* Auth method tabs */}
          <span style={s.authLabel}>Authentication Method</span>
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

          {/* Demo hint */}
          <div style={s.hint}>
            <strong>Demo access:</strong> Use your work email (e.g. shivbrata@hansinfomatic.com) and password <strong>hans@2026</strong>
          </div>

          {/* Secure footer */}
          <div style={s.secureLine}>
            <Shield size={10}/>
            Secure session provided by Hans Infomatic Infrastructure
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
