import { useState, useEffect } from "react";
import { Sparkles, KeyRound, CheckCircle2, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { INIT_USERS } from "../data/constants";
import { DEFAULT_AI_CONFIG, AI_MODELS, AI_FEATURES, getAiStatus } from "../utils/ai";

// ═══════════════════════════════════════════════════════════════════
// AI SETTINGS — admin panel for the optional Claude-powered assistant
// ═══════════════════════════════════════════════════════════════════
// OFF by default. The API key is NEVER entered or stored here — it lives only
// as the server-side ANTHROPIC_API_KEY secret consumed by the ai-claude edge
// function. This panel only flips non-secret feature flags (enable, model,
// per-feature) and reports whether the server key is configured.
//
// Gated to admin / md / director (the same approval tier used elsewhere).

const ADMIN_ROLES = ["admin", "md", "director"];

function roleOf(userId, orgUsers) {
  const u = (orgUsers || []).find(x => x.id === userId) || INIT_USERS.find(x => x.id === userId);
  return u?.role || "viewer";
}

function Switch({ on, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: 42, height: 24, borderRadius: 999, border: "none", cursor: disabled ? "not-allowed" : "pointer",
        background: on ? "var(--brand,#1B6B5A)" : "var(--border,#cbd2d9)", position: "relative",
        transition: "background .15s", opacity: disabled ? 0.5 : 1, flexShrink: 0,
      }}>
      <span style={{
        position: "absolute", top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: "50%",
        background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,.3)",
      }} />
    </button>
  );
}

export default function AiSettings({ aiConfig, onSave, currentUser, orgUsers }) {
  const role = roleOf(currentUser, orgUsers);
  const isAdmin = ADMIN_ROLES.includes(role);

  const mergeCfg = (c) => ({
    ...DEFAULT_AI_CONFIG, ...(c || {}),
    features: { ...DEFAULT_AI_CONFIG.features, ...(c?.features || {}) },
  });

  const [cfg, setCfg] = useState(mergeCfg(aiConfig));
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setCfg(mergeCfg(aiConfig)); /* eslint-disable-next-line */ }, [aiConfig]);

  const checkStatus = async () => {
    setChecking(true);
    const res = await getAiStatus();
    setStatus(res);
    setChecking(false);
  };

  useEffect(() => { if (isAdmin) checkStatus(); /* eslint-disable-next-line */ }, []);

  const persist = async (next) => {
    setCfg(next);
    setSaving(true);
    try { await onSave(next); } finally { setSaving(false); }
  };

  const setEnabled = (v) => persist({ ...cfg, enabled: v });
  const setModel = (m) => persist({ ...cfg, model: m });
  const setFeature = (key, v) => persist({ ...cfg, features: { ...cfg.features, [key]: v } });

  if (!isAdmin) {
    return (
      <div>
        <div className="pg-head">
          <div><div className="pg-title">AI Assistant</div><div className="pg-sub">Claude-powered decision support</div></div>
        </div>
        <div className="card" style={{ padding: 24, maxWidth: 640, display: "flex", gap: 10 }}>
          <AlertTriangle size={18} style={{ color: "var(--warn,#b7791f)", flexShrink: 0 }} />
          <p style={{ margin: 0 }}>AI settings can only be changed by an Admin, MD, or Director. Ask one of them to enable the AI features you need.</p>
        </div>
      </div>
    );
  }

  const keyConfigured = status?.ok ? status.keyConfigured : undefined;
  const statusErr = status && status.ok === false ? status.error : null;

  return (
    <div>
      <div className="pg-head">
        <div>
          <div className="pg-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={18} style={{ color: "var(--brand)" }} /> AI Assistant
          </div>
          <div className="pg-sub">Optional Claude-powered decision support — suggestions only, never automatic actions.{saving ? " · Saving…" : ""}</div>
        </div>
        <div className="pg-actions">
          <button className="btn" onClick={checkStatus} disabled={checking}>
            {checking ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Check status
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 16, maxWidth: 760 }}>

        {/* ── Server key status ─────────────────────────────────── */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
            <KeyRound size={16} /> Anthropic API key (server-side)
          </div>
          <p style={{ margin: "8px 0 0", color: "var(--muted,#667)", fontSize: 13 }}>
            For security the API key is <strong>never entered or stored in the app</strong>. It lives only as a
            server secret on Supabase. An admin sets it once from a terminal:
          </p>
          <pre style={{ background: "#0d1117", color: "#e6edf3", padding: "10px 12px", borderRadius: 8, fontSize: 12, overflowX: "auto", margin: "8px 0" }}>{`supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy ai-claude`}</pre>
          <div style={{ marginTop: 6, fontSize: 13 }}>
            {checking ? (
              <span style={{ color: "var(--muted,#667)", display: "inline-flex", gap: 6, alignItems: "center" }}>
                <Loader2 size={14} className="spin" /> Checking server…
              </span>
            ) : statusErr ? (
              <span style={{ color: "var(--danger,#c0392b)", display: "inline-flex", gap: 6, alignItems: "center" }}>
                <AlertTriangle size={14} /> Couldn’t reach the AI service: {statusErr}
              </span>
            ) : keyConfigured === true ? (
              <span style={{ color: "var(--brand,#1B6B5A)", display: "inline-flex", gap: 6, alignItems: "center" }}>
                <CheckCircle2 size={14} /> API key is configured on the server.
              </span>
            ) : keyConfigured === false ? (
              <span style={{ color: "var(--warn,#b7791f)", display: "inline-flex", gap: 6, alignItems: "center" }}>
                <AlertTriangle size={14} /> No API key set yet. AI calls will fail until you run the commands above.
              </span>
            ) : (
              <span style={{ color: "var(--muted,#667)" }}>Click “Check status” to verify the server key.</span>
            )}
          </div>
        </div>

        {/* ── Master switch ─────────────────────────────────────── */}
        <div className="card" style={{ padding: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600 }}>Enable AI features</div>
            <div style={{ fontSize: 13, color: "var(--muted,#667)", marginTop: 2 }}>
              Off by default. When off, no AI buttons appear anywhere and nothing is ever sent to Claude.
            </div>
          </div>
          <Switch on={!!cfg.enabled} onChange={setEnabled} disabled={saving} />
        </div>

        {/* ── Model + features (only meaningful when enabled) ───── */}
        <div className="card" style={{ padding: 18, opacity: cfg.enabled ? 1 : 0.55 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Model</div>
          <select className="inp" value={cfg.model} onChange={e => setModel(e.target.value)} disabled={!cfg.enabled || saving} style={{ maxWidth: 420 }}>
            {AI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <div style={{ fontSize: 12, color: "var(--muted,#667)", marginTop: 6 }}>
            Opus is the most capable; Haiku is the cheapest for high-volume use. Cost scales with usage.
          </div>

          <div style={{ fontWeight: 600, margin: "18px 0 10px" }}>Features</div>
          <div style={{ display: "grid", gap: 10 }}>
            {AI_FEATURES.map(f => (
              <div key={f.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "8px 0", borderTop: "1px solid var(--border,#eee)" }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{f.label}</div>
                  <div style={{ fontSize: 12.5, color: "var(--muted,#667)", marginTop: 2 }}>{f.desc}</div>
                </div>
                <Switch on={cfg.features?.[f.key] !== false} onChange={v => setFeature(f.key, v)} disabled={!cfg.enabled || saving} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Privacy / governance note ─────────────────────────── */}
        <div className="card" style={{ padding: 18, fontSize: 12.5, color: "var(--muted,#667)" }}>
          <strong style={{ color: "var(--ink,#1a2230)" }}>How your data is used:</strong> when a feature runs, only the
          specific record’s fields (or the document you upload) are sent to Anthropic’s Claude API to generate a
          suggestion. The AI never edits records, sends messages, or makes decisions on its own — a person always
          reviews and chooses what to keep.
        </div>
      </div>
    </div>
  );
}
