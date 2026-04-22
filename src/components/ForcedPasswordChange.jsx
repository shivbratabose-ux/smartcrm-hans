import { useState } from "react";
import { Lock, Eye, EyeOff, Shield, AlertTriangle, Check } from "lucide-react";
import { supabase } from "../lib/supabase";

// Shown to users whose `must_change_password` flag is set after sign-in.
// Two failure modes:
//   - Within the 24h window: user MUST set a new password to continue.
//   - Past the 24h window:   we sign them out and tell them to ask admin.
//
// Once the new password is accepted by Supabase Auth, we call the
// clear_password_change_flag() RPC (server-keyed off the auth user) so the
// flag can never be cleared by anyone except the user themselves.
function ForcedPasswordChange({ userName, expiresAt, onDone, onSignOut }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const expired = expiresAt ? new Date(expiresAt) < new Date() : false;

  const validate = (p) => {
    const errs = [];
    if (p.length < 8) errs.push("Minimum 8 characters");
    if (!/[A-Z]/.test(p)) errs.push("At least 1 uppercase letter");
    if (!/[a-z]/.test(p)) errs.push("At least 1 lowercase letter");
    if (!/[0-9]/.test(p)) errs.push("At least 1 number");
    return errs;
  };

  const handleSave = async () => {
    setErr("");
    const issues = validate(pw);
    if (issues.length > 0) { setErr(issues.join(". ") + "."); return; }
    if (pw !== confirm) { setErr("Passwords do not match."); return; }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { setErr(error.message); setSaving(false); return; }
    // Clear the must-change flag (server-keyed off the caller's auth id)
    const { error: rpcErr } = await supabase.rpc("clear_password_change_flag");
    if (rpcErr) {
      // Password changed but flag persisted. Tell the user, log it, and
      // still let them proceed — onDone will refetch the user row.
      console.warn("clear_password_change_flag failed:", rpcErr.message);
    }
    setSuccess(true);
    setSaving(false);
    setTimeout(() => onDone?.(), 1200);
  };

  const hoursLeft = expiresAt
    ? Math.max(0, Math.round((new Date(expiresAt) - new Date()) / (1000 * 60 * 60)))
    : null;

  const s = {
    outer: {
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg,#0A2E26 0%,#0F3D33 40%,#1B6B5A 100%)",
      fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      padding: 20,
    },
    card: {
      background: "#fff", borderRadius: 20, padding: "40px 36px",
      width: "100%", maxWidth: 460, boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
    },
    title: { fontSize: 22, fontWeight: 800, color: "#0A2E26", marginBottom: 6 },
    sub: { fontSize: 13, color: "#7A9FAF", marginBottom: 20 },
    label: { fontSize: 12, fontWeight: 600, color: "#4A6070", marginBottom: 6, display: "block" },
    inputWrap: { position: "relative", marginBottom: 14 },
    icon: { position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "#7A9FAF" },
    input: {
      width: "100%", boxSizing: "border-box", padding: "11px 14px 11px 40px",
      border: "1.5px solid #E2E9EF", borderRadius: 10, fontSize: 14,
      background: "#F8FAFB", color: "#0A2E26", outline: "none",
    },
    eyeBtn: {
      position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
      background: "none", border: "none", color: "#7A9FAF", cursor: "pointer", padding: 4,
    },
    err: { fontSize: 12, color: "#DC2626", marginBottom: 12, padding: "8px 12px", background: "#FEF2F2", borderRadius: 8 },
    ok:  { fontSize: 12, color: "#16A34A", marginBottom: 12, padding: "8px 12px", background: "#F0FDF4", borderRadius: 8, display: "flex", alignItems: "center", gap: 6 },
    banner: {
      display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px",
      background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 10,
      marginBottom: 18, fontSize: 12, color: "#92400E", lineHeight: 1.5,
    },
    bannerExpired: {
      display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px",
      background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 10,
      marginBottom: 18, fontSize: 12, color: "#991B1B", lineHeight: 1.5,
    },
    primary: {
      width: "100%", padding: "13px 0", borderRadius: 11, border: "none",
      background: "#0F3D33", color: "#fff", fontSize: 14, fontWeight: 700,
      cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    },
    secondary: {
      width: "100%", padding: "11px 0", borderRadius: 11, border: "1.5px solid #E2E9EF",
      background: "#fff", color: "#4A6070", fontSize: 13, fontWeight: 600,
      cursor: "pointer", marginTop: 10,
    },
  };

  if (expired) {
    return (
      <div style={s.outer}>
        <div style={s.card}>
          <div style={s.title}>Temporary Access Expired</div>
          <div style={s.sub}>Hi {userName}, the 24-hour window for your password reset has passed.</div>
          <div style={s.bannerExpired}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Please ask your administrator to send a fresh password reset link.
              For your security, you can't continue with the expired temporary access.
            </span>
          </div>
          <button style={s.primary} onClick={onSignOut}>
            <Shield size={15} /> Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={s.outer}>
      <div style={s.card}>
        <div style={s.title}>Set a new password</div>
        <div style={s.sub}>Hi {userName}, your administrator reset your password. Choose a new one to continue.</div>

        <div style={s.banner}>
          <Lock size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Required before you can use SmartCRM.</strong>{" "}
            {hoursLeft != null && hoursLeft > 0
              ? `Your temporary access is valid for ~${hoursLeft} more hour${hoursLeft === 1 ? "" : "s"}.`
              : "Please set your new password now."}
          </span>
        </div>

        <label style={s.label}>New password</label>
        <div style={s.inputWrap}>
          <span style={s.icon}><Lock size={15} /></span>
          <input
            style={{ ...s.input, paddingRight: 44 }}
            type={showPw ? "text" : "password"}
            placeholder="At least 8 chars, mixed case + a number"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button style={s.eyeBtn} onClick={() => setShowPw(v => !v)} type="button">
            {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        <label style={s.label}>Confirm new password</label>
        <div style={s.inputWrap}>
          <span style={s.icon}><Lock size={15} /></span>
          <input
            style={s.input}
            type={showPw ? "text" : "password"}
            placeholder="Re-enter your new password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setErr(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
        </div>

        {err && <div style={s.err}>{err}</div>}
        {success && <div style={s.ok}><Check size={14} /> Password updated! Loading SmartCRM…</div>}

        <button style={s.primary} onClick={handleSave} disabled={saving || success}>
          {saving ? "Saving…" : success ? "Done" : <><Lock size={15} /> Update password</>}
        </button>
        <button style={s.secondary} onClick={onSignOut} disabled={saving || success}>
          Sign out instead
        </button>
      </div>
    </div>
  );
}

export default ForcedPasswordChange;
