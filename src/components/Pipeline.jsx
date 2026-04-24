import { useState, useMemo, useCallback } from "react";
import {
  Plus, ChevronLeft, ChevronRight, Edit2, Trash2, Check, X,
  BarChart3, List, Kanban, Clock, AlertTriangle, TrendingUp,
  Phone, Users, FileText, Calendar, MessageSquare, Eye,
  ArrowRight, ArrowLeft, GripVertical, Activity, Target,
  ChevronDown, Filter, Search, Download, Flag, Shield
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid
} from "recharts";
import {
  PRODUCTS, PROD_MAP, STAGES, STAGE_PROB, STAGE_COL, TEAM, TEAM_MAP,
  COUNTRIES, OPP_SOURCES, HIERARCHY_LEVELS, FORECAST_CATS, OPP_SIZES,
  WIN_REASONS, LOSS_REASONS, LOSS_IMPACT_AREAS, SUSPEND_REASONS, ACT_TYPES, INIT_USERS,
  CALL_TYPES, CALL_OBJECTIVES, CALL_OUTCOMES
} from "../data/constants";
import { BLANK_OPP } from "../data/seed";
import { uid, fmt, cmp, sanitizeObj, validateOpp, hasErrors, today, isOverdue, getScopedUserIds } from "../utils/helpers";
import { exportCSV } from "../utils/csv";
import { StatusBadge, ProdTag, UserPill, Modal, Confirm, DeleteConfirm, FormError, NotesThread, FilesList, Empty, LogCallModal, PageTip } from "./shared";
import ProductModulePicker, { validateProductSelection, primaryProductId } from "./ProductModulePicker";

/* ───────── constants ───────── */
const HEALTH_CFG = {
  active:   { label: "Active",  color: "#22C55E", bg: "#F0FDF4", border: "#22C55E" },
  "at-risk": { label: "At Risk", color: "#F59E0B", bg: "#FFFBEB", border: "#F59E0B" },
  stalled:  { label: "Stalled", color: "#EF4444", bg: "#FEF2F2", border: "#EF4444" },
};
const MGR_ROLES = ["line_mgr", "bd_lead", "country_mgr", "admin", "md", "director"];
const OUTCOME_OPTS = ["Positive", "Neutral", "Negative"];
const VIEWS = [
  { id: "kanban", label: "Kanban", icon: Kanban },
  { id: "list", label: "List", icon: List },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];
const PIE_COLORS = ["#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#8B5CF6", "#F97316", "#94A3B8"];

/* ───────── helpers ───────── */
const getDealHealth = (oppId, activities) => {
  const done = (activities || []).filter(a => a.oppId === oppId && a.status === "Completed");
  if (done.length === 0) return "stalled";
  const lastDate = done.sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
  if (!lastDate) return "stalled";
  const days = Math.round((new Date(today) - new Date(lastDate)) / 864e5);
  if (days <= 7) return "active";
  if (days <= 14) return "at-risk";
  return "stalled";
};

const getLastActivity = (oppId, activities) => {
  const done = (activities || []).filter(a => a.oppId === oppId && a.status === "Completed");
  if (done.length === 0) return null;
  return done.sort((a, b) => b.date.localeCompare(a.date))[0];
};

const getNextAction = (oppId, activities) => {
  const planned = (activities || []).filter(a => a.oppId === oppId && a.status === "Planned");
  if (planned.length === 0) return null;
  return planned.sort((a, b) => a.date.localeCompare(b.date))[0];
};

function HealthBadge({ health }) {
  const cfg = HEALTH_CFG[health] || HEALTH_CFG.stalled;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
      padding: "2px 8px", borderRadius: 10, background: cfg.bg, color: cfg.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color }} />
      {cfg.label}
    </span>
  );
}

function SortIcon({ col, sortKey, sortDir }) {
  if (col !== sortKey) return <ChevronDown size={12} style={{ opacity: 0.3 }} />;
  return <ChevronDown size={12} style={{ transform: sortDir === "asc" ? "rotate(180deg)" : "none", opacity: 0.8 }} />;
}

function KpiCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div style={{
      background: "#1B6B5A", borderRadius: 12, padding: "16px 20px", minWidth: 150, flex: 1,
      color: "white", display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
        {Icon && <Icon size={16} style={{ opacity: 0.6 }} />}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Outfit',sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, opacity: 0.7 }}>{sub}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   STAGE UPDATE MODAL — gates every stage advancement
   ═══════════════════════════════════════════════════════ */
function StageUpdateModal({ opp, fromStage, toStage, onConfirm, onCancel, accounts }) {
  const [actType, setActType] = useState("");
  const [notes, setNotes] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [outcome, setOutcome] = useState("");
  const [errors, setErrors] = useState({});

  // ── Loss-analysis fields (only used when toStage === "Lost") ──
  // Pre-seeded from the opp so re-opening the modal preserves prior input.
  // These map 1:1 to the BLANK_OPP loss-* fields in seed.js — keeping the
  // shape identical lets confirmAdvance just spread them onto the opp.
  const [lossPrimary,   setLossPrimary]   = useState(opp.lossReason || "");
  const [lossSecondary, setLossSecondary] = useState(opp.lossReasonSecondary || "");
  const [lostTo,        setLostTo]        = useState(opp.lostToCompetitor || opp.competitors || "");
  const [lossImpacts,   setLossImpacts]   = useState(Array.isArray(opp.lossImpactAreas) ? opp.lossImpactAreas : []);
  const [lossMgmt,      setLossMgmt]      = useState(opp.lossMgmtFeedback || "");
  const [lossImprove,   setLossImprove]   = useState(opp.lossImprovementNotes || "");
  const toggleImpact = (tag) => setLossImpacts(prev => prev.includes(tag) ? prev.filter(x=>x!==tag) : [...prev, tag]);

  const validate = () => {
    const e = {};
    if (!actType) e.actType = "Activity type is required";
    if (!notes.trim() || notes.trim().length < 20) e.notes = "Notes must be at least 20 characters — describe what was discussed, client response, objections, next steps";
    // Next action date is meaningless for closed deals — only require it for active stages.
    const isClosingNow = toStage === "Won" || toStage === "Lost";
    if (!isClosingNow) {
      if (!nextDate) e.nextDate = "Next action date is required";
      else if (nextDate <= today) e.nextDate = "Next action date must be in the future";
    }
    if (!outcome) e.outcome = "Outcome is required";
    // Mandatory loss-analysis when closing as Lost — turns the post-mortem
    // into a forced learning loop instead of an afterthought.
    if (toStage === "Lost") {
      if (!lossPrimary) e.lossPrimary = "Primary loss reason is required";
      if (!lossImprove.trim() || lossImprove.trim().length < 15) e.lossImprove = "Improvement notes (min 15 chars) — what would we do differently?";
    }
    return e;
  };

  const submit = () => {
    const e = validate();
    if (hasErrors(e)) { setErrors(e); return; }
    const payload = { actType, notes: notes.trim(), nextDate, outcome };
    if (toStage === "Lost") {
      payload.lossFields = {
        lossReason: lossPrimary,
        lossReasonSecondary: lossSecondary,
        lostToCompetitor: lostTo.trim(),
        lossImpactAreas: lossImpacts,
        lossMgmtFeedback: lossMgmt.trim(),
        lossImprovementNotes: lossImprove.trim(),
        lossClosedAt: today,
      };
    }
    onConfirm(payload);
  };

  const acc = accounts.find(a => a.id === opp.accountId);
  const isClosing = toStage === "Won" || toStage === "Lost";
  return (
    <Modal title={isClosing ? `Closing Deal as ${toStage}` : "Stage Update Required"} onClose={onCancel} lg footer={
      <>
        <button className="btn btn-sec" onClick={onCancel}>Cancel</button>
        <button className={isClosing && toStage === "Lost" ? "btn btn-danger" : "btn btn-primary"} onClick={submit}>
          <Check size={14} /> {isClosing ? `Confirm Close as ${toStage}` : "Confirm Stage Move"}
        </button>
      </>
    }>
      {isClosing ? (
        <div style={{ background: toStage === "Won" ? "#D1FAE5" : "#FEE2E2", border: `1px solid ${toStage === "Won" ? "#10B981" : "#EF4444"}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 12.5, color: toStage === "Won" ? "#065F46" : "#991B1B", display: "flex", alignItems: "flex-start", gap: 8 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>This will close the deal as {toStage}.</strong> The opportunity will be removed from the active pipeline. Capture the reason and outcome in the notes below — this becomes part of the permanent record.
          </div>
        </div>
      ) : (
        <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#92400E", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={16} />
          Stage update requires a call/activity update with notes and next action.
        </div>
      )}
      <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "center" }}>
        <span style={{ padding: "4px 12px", borderRadius: 6, background: STAGE_COL[fromStage], color: "white", fontSize: 12, fontWeight: 600 }}>{fromStage}</span>
        <ArrowRight size={16} style={{ color: "var(--text3)" }} />
        <span style={{ padding: "4px 12px", borderRadius: 6, background: STAGE_COL[toStage], color: "white", fontSize: 12, fontWeight: 600 }}>{toStage}</span>
      </div>
      <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 16 }}>
        <strong>{opp.title}</strong> {acc ? `(${acc.name})` : ""}
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Activity Type *</label>
          <select value={actType} onChange={e => { setActType(e.target.value); setErrors(p => ({ ...p, actType: undefined })); }}
            style={errors.actType ? { borderColor: "#DC2626" } : {}}>
            <option value="">Select type...</option>
            {ACT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <FormError error={errors.actType} />
        </div>
        <div className="form-group">
          <label>Outcome *</label>
          <select value={outcome} onChange={e => { setOutcome(e.target.value); setErrors(p => ({ ...p, outcome: undefined })); }}
            style={errors.outcome ? { borderColor: "#DC2626" } : {}}>
            <option value="">Select outcome...</option>
            {OUTCOME_OPTS.map(o => <option key={o}>{o}</option>)}
          </select>
          <FormError error={errors.outcome} />
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label>Notes * <span style={{ fontWeight: 400, color: "var(--text3)" }}>(min 20 chars — what was discussed, client response, objections, next steps)</span></label>
        <textarea value={notes} onChange={e => { setNotes(e.target.value); setErrors(p => ({ ...p, notes: undefined })); }}
          rows={4} placeholder="Describe the activity, client response, objections raised, and agreed next steps..."
          style={errors.notes ? { borderColor: "#DC2626" } : {}} />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <FormError error={errors.notes} />
          <span style={{ fontSize: 10, color: notes.length >= 20 ? "#22C55E" : "var(--text3)" }}>{notes.length}/20+</span>
        </div>
      </div>
      {!(toStage === "Won" || toStage === "Lost") && (
        <div className="form-row">
          <div className="form-group">
            <label>Next Action Date *</label>
            <input type="date" value={nextDate} min={today}
              onChange={e => { setNextDate(e.target.value); setErrors(p => ({ ...p, nextDate: undefined })); }}
              style={errors.nextDate ? { borderColor: "#DC2626" } : {}} />
            <FormError error={errors.nextDate} />
          </div>
        </div>
      )}

      {/* ── Loss-analysis post-mortem (only on Lost) ────────────────
          Forced learning loop: every lost deal must capture primary
          reason + improvement notes before the system accepts the close.
          Secondary reason, competitor name, impact tags, and management
          feedback are optional but encouraged for the deep dive. */}
      {toStage === "Lost" && (
        <div style={{ marginTop:18, paddingTop:16, borderTop:"1px dashed var(--border)" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#991B1B", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
            <AlertTriangle size={14} /> Loss Analysis — Post-Mortem
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Primary Loss Reason *</label>
              <select value={lossPrimary} onChange={e => { setLossPrimary(e.target.value); setErrors(p => ({ ...p, lossPrimary: undefined })); }}
                style={errors.lossPrimary ? { borderColor:"#DC2626" } : {}}>
                <option value="">Select primary reason...</option>
                {LOSS_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <FormError error={errors.lossPrimary} />
            </div>
            <div className="form-group">
              <label>Secondary Loss Reason</label>
              <select value={lossSecondary} onChange={e => setLossSecondary(e.target.value)}>
                <option value="">— None —</option>
                {LOSS_REASONS.filter(r => r !== lossPrimary).map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Lost To Competitor</label>
              <input value={lostTo} onChange={e => setLostTo(e.target.value)} placeholder="Competitor name (if known)" />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom:12 }}>
            <label>Impact Areas <span style={{ fontWeight:400, color:"var(--text3)" }}>(tap all that apply)</span></label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:6 }}>
              {LOSS_IMPACT_AREAS.map(tag => {
                const active = lossImpacts.includes(tag);
                return (
                  <button key={tag} type="button" onClick={() => toggleImpact(tag)}
                    style={{ padding:"4px 10px", borderRadius:14, border:`1px solid ${active?"#DC2626":"var(--border)"}`,
                             background: active ? "#FEE2E2" : "white", color: active ? "#991B1B" : "var(--text2)",
                             fontSize:11, fontWeight:600, cursor:"pointer" }}>
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="form-group" style={{ marginBottom:12 }}>
            <label>Management Feedback <span style={{ fontWeight:400, color:"var(--text3)" }}>(optional)</span></label>
            <textarea value={lossMgmt} onChange={e => setLossMgmt(e.target.value)} rows={2}
              placeholder="Anything leadership flagged about this deal..." />
          </div>
          <div className="form-group">
            <label>Improvement Notes * <span style={{ fontWeight:400, color:"var(--text3)" }}>(min 15 chars — what would we do differently next time?)</span></label>
            <textarea value={lossImprove} onChange={e => { setLossImprove(e.target.value); setErrors(p => ({ ...p, lossImprove: undefined })); }}
              rows={2} placeholder="What we'd change in qualification, pricing, follow-up, demo, etc."
              style={errors.lossImprove ? { borderColor:"#DC2626" } : {}} />
            <FormError error={errors.lossImprove} />
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════
   BACK STAGE MODAL — simpler, just a comment
   ═══════════════════════════════════════════════════════ */
function BackStageModal({ opp, fromStage, toStage, onConfirm, onCancel }) {
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    if (!comment.trim() || comment.trim().length < 10) { setError("Please provide a reason (min 10 chars)"); return; }
    onConfirm(comment.trim());
  };
  return (
    <Modal title="Move Stage Back" onClose={onCancel} footer={
      <>
        <button className="btn btn-sec" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={submit}><Check size={14} /> Confirm</button>
      </>
    }>
      <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "center" }}>
        <span style={{ padding: "4px 12px", borderRadius: 6, background: STAGE_COL[fromStage], color: "white", fontSize: 12, fontWeight: 600 }}>{fromStage}</span>
        <ArrowLeft size={16} style={{ color: "var(--text3)" }} />
        <span style={{ padding: "4px 12px", borderRadius: 6, background: STAGE_COL[toStage], color: "white", fontSize: 12, fontWeight: 600 }}>{toStage}</span>
      </div>
      <div className="form-group">
        <label>Reason for moving back *</label>
        <textarea value={comment} onChange={e => { setComment(e.target.value); setError(""); }}
          rows={3} placeholder="Why is this deal moving back?" style={error ? { borderColor: "#DC2626" } : {}} />
        <FormError error={error} />
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════
   QUICK UPDATE POPOVER
   ═══════════════════════════════════════════════════════ */
function QuickUpdatePopover({ opp, onSave, onClose }) {
  const [actType, setActType] = useState("Call");
  const [qNotes, setQNotes] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [error, setError] = useState("");
  const submit = () => {
    if (!qNotes.trim()) { setError("Notes required"); return; }
    onSave({ actType, notes: qNotes.trim(), nextDate });
  };
  return (
    <div onClick={e => e.stopPropagation()} style={{
      position: "absolute", top: "100%", right: 0, zIndex: 100, background: "white",
      border: "1px solid var(--border)", borderRadius: 10, padding: 14, width: 280,
      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Quick Update</span>
        <button className="icon-btn" onClick={onClose}><X size={14} /></button>
      </div>
      <select value={actType} onChange={e => setActType(e.target.value)}
        style={{ width: "100%", marginBottom: 8, fontSize: 12, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)" }}>
        {ACT_TYPES.map(t => <option key={t}>{t}</option>)}
      </select>
      <textarea value={qNotes} onChange={e => { setQNotes(e.target.value); setError(""); }}
        rows={2} placeholder="Quick notes..." style={{
          width: "100%", marginBottom: 8, fontSize: 12, padding: "6px 8px", borderRadius: 6,
          border: `1px solid ${error ? "#DC2626" : "var(--border)"}`, resize: "vertical",
        }} />
      <input type="date" value={nextDate} min={today} onChange={e => setNextDate(e.target.value)}
        style={{ width: "100%", marginBottom: 10, fontSize: 12, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)" }} />
      {error && <div style={{ color: "#DC2626", fontSize: 11, marginBottom: 6 }}>{error}</div>}
      <button className="btn btn-primary btn-sm" style={{ width: "100%" }} onClick={submit}>Save Update</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   DEAL DETAIL (Enhanced)
   ═══════════════════════════════════════════════════════ */
function DealDetail({ detail, onClose, onEdit, accounts, contacts, notes, files, onAddNote, onAddFile, currentUser, activities, setActivities, opps, setOpps, onLogCall }) {
  const [tab, setTab] = useState("overview");

  // ── Inline field editing ──
  const [editingField, setEditingField] = useState(null);
  const [fieldVal, setFieldVal] = useState("");
  const startEdit = (f) => { setEditingField(f); setFieldVal(detail[f] ?? ""); };
  const saveEdit = (f, v) => {
    const val = v !== undefined ? v : fieldVal;
    if (setOpps) setOpps(prev => prev.map(o => o.id === detail.id ? { ...o, [f]: val } : o));
    setEditingField(null); setFieldVal("");
  };
  const cancelEdit = () => { setEditingField(null); setFieldVal(""); };
  const iStyle = { fontSize:12, padding:"3px 7px", borderRadius:5, border:"1px solid var(--brand)", outline:"none", width:"100%", boxSizing:"border-box" };

  const editableRow = (key, field, type, options) => {
    const isEditing = editingField === field;
    let display;
    if (field === "value") display = fmt.inr(detail.value);
    else if (field === "probability") display = fmt.pct(detail.probability);
    else if (field === "closeDate") display = fmt.date(detail.closeDate);
    else if (field === "stage") display = detail.stage;
    else display = detail[field] || "—";

    return (
      <div className="dp-row" key={key}>
        <span className="dp-key">{key}</span>
        <span className="dp-val" style={{flex:1}}>
          {isEditing ? (
            <span style={{display:"flex",gap:4,alignItems:"center"}}>
              {type === "select" ? (
                <select autoFocus value={fieldVal} onChange={e=>setFieldVal(e.target.value)}
                  onBlur={()=>saveEdit(field)} style={iStyle}>
                  {(options||[]).map(o=><option key={o}>{o}</option>)}
                </select>
              ) : (
                <input type={type || "text"} autoFocus value={fieldVal}
                  onChange={e => setFieldVal(type==="number" ? +e.target.value : e.target.value)}
                  onBlur={()=>saveEdit(field, type==="number" ? +fieldVal : fieldVal)}
                  onKeyDown={e=>{if(e.key==="Enter")saveEdit(field, type==="number" ? +fieldVal : fieldVal); if(e.key==="Escape")cancelEdit();}}
                  style={{...iStyle, maxWidth:160}} min={type==="number"?0:undefined} step={field==="probability"?1:0.01}/>
              )}
              <button onClick={cancelEdit} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text3)",padding:0,fontSize:16,lineHeight:1}}>✕</button>
            </span>
          ) : (
            <span style={{cursor:"pointer",display:"flex",alignItems:"center",gap:4}} onClick={()=>startEdit(field)}
              title="Click to edit">
              {field === "stage" ? <StatusBadge status={display}/> : display}
              <Edit2 size={9} style={{color:"var(--text3)",opacity:0.4,flexShrink:0}}/>
            </span>
          )}
        </span>
      </div>
    );
  };
  const oppNotes = notes.filter(n => n.recordType === "opp" && n.recordId === detail.id);
  const oppFiles = files.filter(f => f.linkedTo.some(l => l.type === "opp" && l.id === detail.id));
  const oppActs = (activities || []).filter(a => a.oppId === detail.id).sort((a, b) => (b.date||"").localeCompare(a.date||""));
  const acc = accounts.find(a => a.id === detail.accountId);
  const primaryContact = (contacts || []).find(c => c.id === detail.primaryContactId);
  const secondaryContacts = (detail.secondaryContactIds || []).map(cid => (contacts || []).find(c => c.id === cid)).filter(Boolean);
  const health = getDealHealth(detail.id, activities);
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "timeline", label: "Timeline" },
    { id: "activities", label: `Activities (${oppActs.length})` },
    { id: "notes", label: `Notes (${oppNotes.length})` },
    { id: "files", label: `Files (${oppFiles.length})` },
  ];

  const logQuickActivity = (type) => {
    const act = {
      id: `act${uid()}`, type, status: "Completed", date: today, time: "12:00", duration: 15,
      accountId: detail.accountId, contactId: detail.primaryContactId || "", oppId: detail.id,
      owner: currentUser, title: `${type} — ${detail.title}`, notes: "", outcome: "",
    };
    setActivities(p => [...p, act]);
  };

  /* build timeline from activities + notes */
  const timeline = useMemo(() => {
    const items = [];
    oppActs.forEach(a => items.push({ date: a.date, type: "activity", data: a }));
    oppNotes.forEach(n => items.push({ date: n.date?.slice(0, 10) || today, type: "note", data: n }));
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [oppActs, oppNotes]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)",
      display: "flex", justifyContent: "center", alignItems: "stretch",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: "90%", maxWidth: 900, background: "white", borderRadius: 16, margin: "24px 0",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)", background: "var(--s1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 18, fontWeight: 800 }}>{detail.title}</span>
                {detail.oppId && <span style={{ fontSize: 11, fontFamily: "'Courier New',monospace", color: "#1B6B5A", background: "#F0FDF4", padding: "2px 8px", borderRadius: 4 }}>{detail.oppId}</span>}
                <HealthBadge health={health} />
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, color: "var(--text2)" }}>
                <span style={{ padding: "3px 10px", borderRadius: 6, background: STAGE_COL[detail.stage], color: "white", fontSize: 11, fontWeight: 600 }}>{detail.stage}</span>
                <span style={{ fontWeight: 700, fontFamily: "'Outfit',sans-serif" }}>{fmt.inr(detail.value)}</span>
                {acc && <span>{acc.name}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button className="btn btn-xs btn-sec" onClick={() => onLogCall({ accountId: detail.accountId, oppId: detail.id, contactIds: detail.primaryContactId ? [detail.primaryContactId] : [] })}><Phone size={12} /> Log Call</button>
              <button className="btn btn-xs btn-sec" onClick={() => logQuickActivity("Meeting")}><Users size={12} /> Log Meeting</button>
              <button className="btn btn-xs btn-primary" onClick={onEdit}><Edit2 size={12} /> Edit</button>
              <button className="icon-btn" onClick={onClose}><X size={18} /></button>
            </div>
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", padding: "0 24px" }}>
          {tabs.map(t => (
            <div key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "10px 16px", fontSize: 13, fontWeight: tab === t.id ? 700 : 500, cursor: "pointer",
              color: tab === t.id ? "#1B6B5A" : "var(--text3)",
              borderBottom: tab === t.id ? "2px solid #1B6B5A" : "2px solid transparent",
            }}>{t.label}</div>
          ))}
        </div>
        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {tab === "overview" && (
            <div>
              <div className="dp-grid">
                {/* Static rows */}
                <div className="dp-row"><span className="dp-key">Account</span><span className="dp-val">{acc?.name || "—"}</span></div>
                <div className="dp-row"><span className="dp-key">Health</span><span className="dp-val"><HealthBadge health={health}/></span></div>
                {/* Editable rows */}
                {editableRow("Stage", "stage", "select", ["Prospect","Qualified","Demo","Proposal","Negotiation","Won","Lost"])}
                {editableRow("Value (₹L)", "value", "number")}
                {editableRow("Probability (%)", "probability", "number")}
                {editableRow("Close Date", "closeDate", "date")}
                {/* Static rows */}
                <div className="dp-row"><span className="dp-key">Owner</span><span className="dp-val">{TEAM_MAP[detail.owner]?.name || "—"}</span></div>
                <div className="dp-row"><span className="dp-key">Source</span><span className="dp-val">{detail.source || "—"}</span></div>
                <div className="dp-row"><span className="dp-key">Primary Contact</span><span className="dp-val">{primaryContact?.name || "—"}</span></div>
                <div className="dp-row"><span className="dp-key">Hierarchy Level</span><span className="dp-val">{detail.hierarchyLevel || "—"}</span></div>
                <div className="dp-row"><span className="dp-key">Country</span><span className="dp-val">{detail.country || "—"}</span></div>
                <div className="dp-row"><span className="dp-key">Forecast</span><span className="dp-val">{detail.forecastCat || "—"}</span></div>
                <div className="dp-row"><span className="dp-key">Deal Size</span><span className="dp-val">{detail.dealSize || "—"}</span></div>
              </div>
              {secondaryContacts.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Secondary Contacts</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {secondaryContacts.map(c => <span key={c.id} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "#E0E7FF", color: "#3730A3" }}>{c.name}{c.designation ? " \u2013 " + c.designation : ""}</span>)}
                  </div>
                </div>
              )}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Products</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{detail.products.map(p => <ProdTag key={p} pid={p} />)}</div>
              </div>
              {/* Upsell / Cross-sell visibility */}
              {(() => {
                const currentProducts = detail.products || [];
                const crossSellProducts = PRODUCTS.filter(p => !currentProducts.includes(p.id));
                return (
                  <div style={{ marginTop: 14, background: "#FFFBEB", border: "1px solid #FDE68A", padding: "10px 12px", borderRadius: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E", letterSpacing: "0.06em" }}>UPSELL / CROSS-SELL OPPORTUNITY</div>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#92400E", cursor: "pointer" }}>
                        <input type="checkbox" checked={!!detail.upsellFlag}
                          onChange={e => setOpps && setOpps(prev => prev.map(o => o.id === detail.id ? { ...o, upsellFlag: e.target.checked } : o))} />
                        Flag for Upsell
                      </label>
                    </div>
                    {crossSellProducts.length > 0 ? (
                      <div>
                        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>Products this account doesn't have yet:</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {crossSellProducts.map(p => <ProdTag key={p.id} pid={p.id} />)}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--text3)", fontStyle: "italic" }}>This account already owns the full product suite.</div>
                    )}
                    <div style={{ marginTop: 8 }}>
                      {editingField === "crossSellNotes" ? (
                        <textarea autoFocus rows={2} value={fieldVal}
                          onChange={e => setFieldVal(e.target.value)}
                          onBlur={() => saveEdit("crossSellNotes")}
                          style={{ width: "100%", fontSize: 12, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--brand)", outline: "none", resize: "vertical" }}
                          placeholder="Cross-sell strategy / customer interest..." />
                      ) : (
                        <div onClick={() => startEdit("crossSellNotes")}
                          style={{ fontSize: 12, color: detail.crossSellNotes ? "var(--text2)" : "var(--text3)", cursor: "pointer", padding: "4px 0", fontStyle: detail.crossSellNotes ? "normal" : "italic" }}
                          title="Click to edit">
                          {detail.crossSellNotes || "+ Add cross-sell notes..."}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              {detail.leadId && <div style={{ marginTop: 10, fontSize: 12, color: "var(--text3)" }}>Lead Reference: <span style={{ fontFamily: "'Courier New',monospace", fontWeight: 600 }}>{detail.leadId}</span></div>}
              {detail.notes && <div style={{ marginTop: 14, background: "var(--s2)", padding: "10px 12px", borderRadius: 8, borderLeft: "3px solid var(--brand)", fontSize: 13, color: "var(--text2)" }}>{detail.notes}</div>}
              {detail.winReason && <div style={{ marginTop: 10, fontSize: 12 }}><strong>Win Reason:</strong> {detail.winReason}</div>}
              {detail.lossReason && <div style={{ marginTop: 10, fontSize: 12 }}><strong>Loss Reason:</strong> {detail.lossReason}</div>}
            </div>
          )}
          {tab === "timeline" && (
            <div>
              {timeline.length === 0 && <div style={{ color: "var(--text3)", fontSize: 13, padding: "20px 0" }}>No timeline events yet.</div>}
              {timeline.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 14, marginBottom: 16, position: "relative" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 28 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      background: item.type === "activity" ? "#EFF6FF" : "#F0FDF4",
                    }}>
                      {item.type === "activity" ? <Activity size={13} style={{ color: "#3B82F6" }} /> : <MessageSquare size={13} style={{ color: "#22C55E" }} />}
                    </div>
                    {i < timeline.length - 1 && <div style={{ width: 2, flex: 1, background: "var(--border)", marginTop: 4 }} />}
                  </div>
                  <div style={{ flex: 1, paddingBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{item.type === "activity" ? item.data.title : "Note added"}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                      {fmt.date(item.date)} {item.type === "activity" && item.data.owner ? `\u2022 ${TEAM_MAP[item.data.owner]?.name || ""}` : ""}
                      {item.type === "activity" && item.data.outcome ? ` \u2022 ${item.data.outcome}` : ""}
                    </div>
                    {(item.type === "activity" ? item.data.notes : item.data.text) && (
                      <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 4, background: "var(--s1)", padding: "6px 10px", borderRadius: 6 }}>
                        {item.type === "activity" ? item.data.notes : item.data.text}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === "activities" && (
            <div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <button className="btn btn-xs btn-sec" onClick={() => onLogCall({ accountId: detail.accountId, oppId: detail.id, contactIds: detail.primaryContactId ? [detail.primaryContactId] : [] })}>
                  <Phone size={12} /> Log Call
                </button>
              </div>
              {oppActs.length === 0 && <div style={{ color: "var(--text3)", fontSize: 13, padding: "20px 0" }}>No activities logged for this deal.</div>}
              {oppActs.map(a => (
                <div key={a.id} style={{
                  padding: "10px 14px", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 8,
                  borderLeft: `3px solid ${a.status === "Completed" ? "#22C55E" : a.status === "Planned" ? "#3B82F6" : "#94A3B8"}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</span>
                    <StatusBadge status={a.status} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>
                    {a.type} \u2022 {fmt.date(a.date)} \u2022 {TEAM_MAP[a.owner]?.name || ""} {a.outcome ? `\u2022 ${a.outcome}` : ""}
                  </div>
                  {a.notes && <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 6 }}>{a.notes}</div>}
                </div>
              ))}
            </div>
          )}
          {tab === "notes" && <NotesThread notes={oppNotes} currentUser={currentUser} onAdd={text => onAddNote({ id: `n${uid()}`, recordType: "opp", recordId: detail.id, author: currentUser, date: new Date().toISOString().slice(0, 16).replace("T", " "), text })} />}
          {tab === "files" && <FilesList files={oppFiles} currentUser={currentUser} onAdd={f => onAddFile({ ...f, linkedTo: [{ type: "opp", id: detail.id }] })} />}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PIPELINE (main component)
   ═══════════════════════════════════════════════════════ */
function Pipeline({ opps, setOpps, onDeleteOpp, accounts, contacts, leads, notes, onAddNote, files, onAddFile, currentUser, activities, setActivities, callReports, setCallReports, orgUsers, masters, catalog, onDealWon, canDelete }) {
  const _pipelineScopedIds = useMemo(() => getScopedUserIds(currentUser, orgUsers), [currentUser, orgUsers]);
  const team = useMemo(() => {
    const all = orgUsers?.length ? orgUsers.filter(u => u.status !== 'Inactive') : TEAM;
    return all.filter(u => _pipelineScopedIds.has(u.id));
  }, [orgUsers, _pipelineScopedIds]);
  const teamMap = useMemo(() => {
    const all = orgUsers?.length ? orgUsers.filter(u => u.status !== 'Inactive') : TEAM;
    return Object.fromEntries(all.map(u => [u.id, u]));
  }, [orgUsers]);
  const CSV_COLS = [
    {label:"oppNo",           accessor:o=>o.oppNo||""},
    {label:"title",           accessor:o=>o.title||""},
    {label:"accountId",       accessor:o=>accounts.find(a=>a.id===o.accountId)?.accountNo||o.accountId||""},
    {label:"stage",           accessor:o=>o.stage||""},
    {label:"value",           accessor:o=>o.value||0},
    {label:"probability",     accessor:o=>o.probability||0},
    {label:"closeDate",       accessor:o=>o.closeDate||""},
    {label:"source",          accessor:o=>o.source||""},
    {label:"country",         accessor:o=>o.country||""},
    {label:"lob",             accessor:o=>o.lob||""},
    {label:"products",        accessor:o=>(o.products||[]).join(";")},
    {label:"hierarchyLevel",  accessor:o=>o.hierarchyLevel||""},
    {label:"dealSize",        accessor:o=>o.dealSize||""},
    {label:"forecastCat",     accessor:o=>o.forecastCat||""},
    {label:"currency",        accessor:o=>o.currency||"INR"},
    {label:"competitors",     accessor:o=>o.competitors||""},
    {label:"lossReason",      accessor:o=>o.lossReason||""},
    {label:"nextStep",        accessor:o=>o.nextStep||""},
    {label:"decisionDate",    accessor:o=>o.decisionDate||""},
    {label:"budget",          accessor:o=>o.budget||""},
    {label:"territory",       accessor:o=>o.territory||""},
    {label:"campaignSource",  accessor:o=>o.campaignSource||""},
    {label:"owner",           accessor:o=>teamMap[o.owner]?.name||o.owner||""},
    {label:"notes",           accessor:o=>o.notes||""},
  ];
  const [view, setView] = useState("kanban");
  const [prodF, setProdF] = useState("All");
  const [ownerF, setOwnerF] = useState("All");
  const [regionF, setRegionF] = useState("All");
  const [stageF, setStageF] = useState("All");
  const [statusF, setStatusF] = useState("All");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK_OPP);
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [stageModal, setStageModal] = useState(null);
  const [backModal, setBackModal] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [quickUpdate, setQuickUpdate] = useState(null);
  const [mgrView, setMgrView] = useState(false);
  const [sortKey, setSortKey] = useState("title");
  const [sortDir, setSortDir] = useState("asc");
  const [searchQ, setSearchQ] = useState("");
  const [logCallPrefill, setLogCallPrefill] = useState(null); // null = closed, object = open with prefill

  const curUser = INIT_USERS.find(u => u.id === currentUser);

  /* ── Save call report handler ── */
  const handleSaveCall = useCallback((callForm) => {
    const clean = sanitizeObj(callForm);
    const callReport = {
      id: `cr${uid()}`,
      company: accounts.find(a => a.id === clean.accountId)?.name || "",
      marketingPerson: currentUser,
      callType: clean.callType,
      callDate: clean.callDate,
      notes: clean.notes,
      nextCallDate: clean.nextCallDate,
      objective: clean.objective,
      outcome: clean.outcome,
      duration: clean.duration,
      accountId: clean.accountId,
      contactId: clean.contactIds?.[0] || "",
      oppId: clean.oppId,
      contactIds: clean.contactIds,
      participantIds: clean.participantIds,
      callTime: clean.callTime,
      leadId: clean.leadId || "",
      nextStepDesc: clean.nextStepDesc,
    };
    setCallReports(p => [...p, callReport]);

    if (clean.createFollowup) {
      const acctName = accounts.find(a => a.id === clean.accountId)?.name || "";
      const followup = {
        id: `act${uid()}`,
        title: clean.followupTitle || `Follow-up: ${acctName}`,
        type: "Call",
        status: "Planned",
        date: clean.followupDue || clean.nextCallDate || today,
        accountId: clean.accountId,
        contactId: clean.contactIds?.[0] || "",
        oppId: clean.oppId,
        owner: clean.followupAssign || currentUser,
        notes: `Follow-up from call on ${clean.callDate}`,
      };
      setActivities(p => [...p, followup]);
    }
  }, [accounts, currentUser, setCallReports, setActivities]);
  const isManager = curUser && MGR_ROLES.includes(curUser.role);

  /* filtered opps */
  const filtered = useMemo(() => opps.filter(o => {
    if (prodF !== "All" && !o.products.includes(prodF)) return false;
    if (ownerF !== "All" && o.owner !== ownerF) return false;
    if (regionF !== "All" && o.country !== regionF) return false;
    if (stageF !== "All" && o.stage !== stageF) return false;
    if (statusF !== "All") {
      const h = getDealHealth(o.id, activities);
      if (statusF === "Active" && h !== "active") return false;
      if (statusF === "At Risk" && h !== "at-risk") return false;
      if (statusF === "Stalled" && h !== "stalled") return false;
    }
    if (searchQ) {
      const q = searchQ.toLowerCase();
      const acc = accounts.find(a => a.id === o.accountId);
      if (!o.title.toLowerCase().includes(q) && !(acc?.name || "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [opps, prodF, ownerF, regionF, stageF, statusF, searchQ, activities, accounts]);

  /* KPIs */
  const openDeals = filtered.filter(o => !["Won", "Lost"].includes(o.stage));
  const totalPipe = openDeals.reduce((s, o) => s + o.value, 0);
  const weighted = openDeals.reduce((s, o) => s + (o.value * (o.probability / 100)), 0);
  const wonCount = filtered.filter(o => o.stage === "Won").length;
  const lostCount = filtered.filter(o => o.stage === "Lost").length;
  const winRate = wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0;
  const atRiskCount = openDeals.filter(o => getDealHealth(o.id, activities) === "at-risk").length;
  const stalledCount = openDeals.filter(o => getDealHealth(o.id, activities) === "stalled").length;

  /* form handlers */
  const openAdd = () => { setForm({ ...BLANK_OPP, id: `o${uid()}`, productSelection: [], owner: currentUser || BLANK_OPP.owner }); setFormErrors({}); setModal({ mode: "add" }); };
  const openEdit = o => {
    // Backfill productSelection from legacy `products` array if missing,
    // so deals created before the picker shipped still load editable.
    const seeded = (Array.isArray(o.productSelection) && o.productSelection.length > 0)
      ? o.productSelection
      : (o.products || []).filter(Boolean).map(productId => ({ productId, moduleIds: [], noAddons: false }));
    setForm({ ...o, products: [...(o.products || [])], productSelection: seeded });
    setFormErrors({});
    setModal({ mode: "edit" });
  };
  const save = () => {
    const errs = validateOpp(form);
    const psErr = validateProductSelection(form.productSelection);
    if (psErr) errs.productSelection = psErr;
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    const clean = sanitizeObj(form);
    /* duplicate check */
    if (modal.mode === "add") {
      const dup = opps.find(o => o.accountId === clean.accountId && o.products.length > 0 && clean.products.length > 0 && o.products.some(p => clean.products.includes(p)) && o.id !== clean.id);
      if (dup && !window.confirm(`Warning: A deal for this account with overlapping products already exists ("${dup.title}"). Continue?`)) return;
      setOpps(p => [...p, { ...clean, probability: STAGE_PROB[clean.stage] || clean.probability }]);
    } else {
      const prev = opps.find(o => o.id === clean.id);
      setOpps(p => p.map(o => o.id === clean.id ? { ...clean } : o));
      if (clean.stage === "Won" && prev?.stage !== "Won" && onDealWon) onDealWon(clean);
    }
    setModal(null); setDetail(null); setFormErrors({});
  };
  const del = id => { onDeleteOpp(id); setConfirm(null); setDetail(null); };
  const toggleProd = pid => {
    const pp = form.products.includes(pid) ? form.products.filter(x => x !== pid) : [...form.products, pid];
    setForm(f => ({ ...f, products: pp }));
  };

  /* ── STAGE MOVEMENT (gated) ── */
  const initiateStageMove = (opp, dir) => {
    const idx = STAGES.indexOf(opp.stage);
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= STAGES.length) return;
    const toStage = STAGES[newIdx];
    if (dir > 0) {
      setStageModal({ opp, fromStage: opp.stage, toStage });
    } else {
      setBackModal({ opp, fromStage: opp.stage, toStage });
    }
  };

  const confirmAdvance = ({ actType, notes: actNotes, nextDate, outcome, lossFields }) => {
    const { opp, toStage } = stageModal;
    /* create activity */
    const newAct = {
      id: `act${uid()}`, type: actType, status: "Completed", date: today, time: new Date().toTimeString().slice(0, 5),
      duration: 30, accountId: opp.accountId, contactId: opp.primaryContactId || "", oppId: opp.id,
      owner: currentUser, title: `Stage Update: ${opp.stage} \u2192 ${toStage}`, notes: actNotes, outcome,
    };
    setActivities(p => [...p, newAct]);
    /* create planned follow-up */
    if (nextDate) {
      const followUp = {
        id: `act${uid()}`, type: actType, status: "Planned", date: nextDate, time: "10:00",
        duration: 30, accountId: opp.accountId, contactId: opp.primaryContactId || "", oppId: opp.id,
        owner: currentUser, title: `Follow-up: ${toStage} \u2014 ${opp.title}`, notes: "", outcome: "",
      };
      setActivities(p => [...p, followUp]);
    }
    /* move stage — merge loss-analysis fields when closing as Lost so the
       post-mortem becomes part of the permanent record (used by Reports
       to slice loss patterns by reason / competitor / impact area). */
    const updated = {
      ...opp,
      stage: toStage,
      probability: STAGE_PROB[toStage],
      ...(lossFields || {}),
    };
    setOpps(p => p.map(o => o.id === opp.id ? updated : o));
    if (toStage === "Won" && onDealWon) onDealWon(updated);
    setStageModal(null);
  };

  const confirmBack = (comment) => {
    const { opp, toStage } = backModal;
    const newAct = {
      id: `act${uid()}`, type: "Call", status: "Completed", date: today, time: new Date().toTimeString().slice(0, 5),
      duration: 15, accountId: opp.accountId, contactId: opp.primaryContactId || "", oppId: opp.id,
      owner: currentUser, title: `Stage Moved Back: ${opp.stage} \u2192 ${toStage}`, notes: comment, outcome: "Neutral",
    };
    setActivities(p => [...p, newAct]);
    setOpps(p => p.map(o => o.id === opp.id ? { ...o, stage: toStage, probability: STAGE_PROB[toStage] } : o));
    setBackModal(null);
  };

  /* ── DRAG & DROP ── */
  const onDragStart = (e, oppId) => { setDragId(oppId); e.dataTransfer.effectAllowed = "move"; };
  const onDragEnd = () => { setDragId(null); setDragOver(null); };
  const onDragOverCol = (e, stage) => { e.preventDefault(); setDragOver(stage); };
  const onDragLeaveCol = () => setDragOver(null);
  const onDropCol = (e, targetStage) => {
    e.preventDefault(); setDragOver(null);
    if (!dragId) return;
    const opp = opps.find(o => o.id === dragId);
    if (!opp || opp.stage === targetStage) { setDragId(null); return; }
    const fromIdx = STAGES.indexOf(opp.stage);
    const toIdx = STAGES.indexOf(targetStage);
    setDragId(null);
    if (toIdx > fromIdx) {
      setStageModal({ opp, fromStage: opp.stage, toStage: targetStage });
    } else {
      setBackModal({ opp, fromStage: opp.stage, toStage: targetStage });
    }
  };

  /* ── QUICK UPDATE ── */
  const handleQuickSave = (opp, { actType, notes: qNotes, nextDate }) => {
    const newAct = {
      id: `act${uid()}`, type: actType, status: "Completed", date: today, time: new Date().toTimeString().slice(0, 5),
      duration: 15, accountId: opp.accountId, contactId: opp.primaryContactId || "", oppId: opp.id,
      owner: currentUser, title: `${actType} \u2014 ${opp.title}`, notes: qNotes, outcome: "",
    };
    setActivities(p => [...p, newAct]);
    if (nextDate) {
      const followUp = {
        id: `act${uid()}`, type: actType, status: "Planned", date: nextDate, time: "10:00",
        duration: 30, accountId: opp.accountId, contactId: opp.primaryContactId || "", oppId: opp.id,
        owner: currentUser, title: `Follow-up \u2014 ${opp.title}`, notes: "", outcome: "",
      };
      setActivities(p => [...p, followUp]);
    }
    setQuickUpdate(null);
  };

  /* ── SORT (list) ── */
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va, vb;
      if (sortKey === "account") { va = accounts.find(x => x.id === a.accountId)?.name || ""; vb = accounts.find(x => x.id === b.accountId)?.name || ""; }
      else if (sortKey === "health") { va = getDealHealth(a.id, activities); vb = getDealHealth(b.id, activities); }
      else { va = a[sortKey] ?? ""; vb = b[sortKey] ?? ""; }
      if (typeof va === "number") return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [filtered, sortKey, sortDir, accounts, activities]);

  /* ── ANALYTICS DATA ── */
  const stageConvData = useMemo(() => STAGES.filter(s => s !== "Lost").map(s => ({
    stage: s, count: opps.filter(o => o.stage === s).length,
  })), [opps]);

  const winLossData = useMemo(() => [
    { name: "Won", value: opps.filter(o => o.stage === "Won").length },
    { name: "Lost", value: opps.filter(o => o.stage === "Lost").length },
    { name: "Open", value: opps.filter(o => !["Won", "Lost"].includes(o.stage)).length },
  ], [opps]);

  const forecastData = useMemo(() => {
    const months = {};
    opps.filter(o => !["Won", "Lost"].includes(o.stage) && o.closeDate).forEach(o => {
      const m = o.closeDate.slice(0, 7);
      months[m] = (months[m] || 0) + o.value * (o.probability / 100);
    });
    return Object.entries(months).sort().slice(0, 6).map(([m, v]) => ({ month: m, value: +v.toFixed(1) }));
  }, [opps]);

  const activityVsConv = useMemo(() => STAGES.filter(s => !["Won", "Lost"].includes(s)).map(s => {
    const stageOpps = opps.filter(o => o.stage === s);
    const avgActs = stageOpps.length > 0
      ? Math.round(stageOpps.reduce((sum, o) => sum + (activities || []).filter(a => a.oppId === o.id && a.status === "Completed").length, 0) / stageOpps.length)
      : 0;
    return { stage: s, avgActivities: avgActs, deals: stageOpps.length };
  }), [opps, activities]);

  /* ── MANAGER VIEW: mismatch detection ── */
  const mismatchDeals = useMemo(() => {
    if (!mgrView) return [];
    return opps.filter(o => {
      if (["Won", "Lost", "Prospect"].includes(o.stage)) return false;
      const recent = (activities || []).filter(a => a.oppId === o.id && a.status === "Completed" && a.date >= (() => { const d = new Date(today); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })());
      return recent.length === 0;
    });
  }, [opps, activities, mgrView]);

  /* ─────────────────── RENDER ─────────────────── */
  return (
    <div>
      <PageTip
        id="pipeline-tip-v1"
        title="Pipeline tip:"
        text="Click any deal card to open its detail. Value, stage, probability, and close date are all editable inline inside the panel. Drag cards between columns in Board view to advance a stage."
      />
      {/* PAGE HEADER */}
      <div className="pg-head">
        <div>
          <div className="pg-title">Pipeline</div>
          <div className="pg-sub">{openDeals.length} open deals • {filtered.length} total filtered</div>
        </div>
        <div className="pg-actions">
          {isManager && (
            <button className={`btn btn-xs ${mgrView ? "btn-primary" : "btn-sec"}`} onClick={() => setMgrView(v => !v)}>
              <Shield size={13} /> Manager View
            </button>
          )}
          <div style={{ display: "flex", gap: 4, background: "var(--s2)", border: "1px solid var(--border)", borderRadius: 8, padding: 3 }}>
            {VIEWS.map(v => (
              <button key={v.id} className={`btn btn-xs ${view === v.id ? "btn-primary" : "btn-sec"}`}
                style={{ border: "none" }} onClick={() => setView(v.id)}>
                <v.icon size={13} /> {v.label}
              </button>
            ))}
          </div>
          <button className="btn btn-sec" onClick={() => exportCSV(filtered, CSV_COLS, "pipeline")}><Download size={14}/>Export</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={14} /> Add Deal</button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <KpiCard label="Total Pipeline" value={`\u20B9${totalPipe.toFixed(1)}L`} icon={Target} sub={`${openDeals.length} open deals`} />
        <KpiCard label="Weighted Pipeline" value={`\u20B9${weighted.toFixed(1)}L`} icon={TrendingUp} />
        <KpiCard label="Win Rate" value={`${winRate}%`} icon={Check} sub={`${wonCount}W / ${lostCount}L`} />
        <KpiCard label="At Risk" value={atRiskCount} icon={AlertTriangle} sub="7-14 days idle" />
        <KpiCard label="Stalled" value={stalledCount} icon={Clock} sub=">14 days idle" />
      </div>

      {/* FILTERS */}
      <div className="filter-bar" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <div style={{ position: "relative", flex: "0 0 200px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text3)" }} />
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search deals..."
            style={{ paddingLeft: 30, fontSize: 12, width: "100%", height: 34, borderRadius: 8, border: "1px solid var(--border)" }} />
        </div>
        <select className="filter-select" value={prodF} onChange={e => setProdF(e.target.value)}>
          <option value="All">All Products</option>
          {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="filter-select" value={ownerF} onChange={e => setOwnerF(e.target.value)}>
          <option value="All">All Owners</option>
          {team.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="filter-select" value={regionF} onChange={e => setRegionF(e.target.value)}>
          <option value="All">All Regions</option>
          {COUNTRIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="filter-select" value={stageF} onChange={e => setStageF(e.target.value)}>
          <option value="All">All Stages</option>
          {STAGES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={statusF} onChange={e => setStatusF(e.target.value)}>
          <option value="All">All Statuses</option>
          <option>Active</option><option>At Risk</option><option>Stalled</option>
        </select>
      </div>

      {/* ── MANAGER VIEW PANEL ── */}
      {mgrView && isManager && (
        <div style={{
          background: "#FEF3C7", border: "1px solid #F59E0B", borderRadius: 12, padding: 16, marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Shield size={16} style={{ color: "#92400E" }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: "#92400E" }}>Manager Visibility Panel</span>
          </div>
          {mismatchDeals.length === 0 ? (
            <div style={{ fontSize: 12, color: "#92400E" }}>No stage/activity mismatches detected. All deals have recent activity.</div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: "#92400E", marginBottom: 8 }}>
                <AlertTriangle size={13} style={{ verticalAlign: "middle" }} /> {mismatchDeals.length} deal(s) advanced without recent activity (no completed activity in 7 days):
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {mismatchDeals.slice(0, 8).map(o => {
                  const acc = accounts.find(a => a.id === o.accountId);
                  const health = getDealHealth(o.id, activities);
                  return (
                    <div key={o.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: "white", padding: "8px 12px", borderRadius: 8, fontSize: 12,
                    }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{o.title}</span>
                        {o.oppId && <span style={{ fontSize: 10, fontFamily: "'Courier New',monospace", color: "#1B6B5A", marginLeft: 6 }}>{o.oppId}</span>}
                        <span style={{ color: "var(--text3)", marginLeft: 8 }}>{acc?.name}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <StatusBadge status={o.stage} />
                        <HealthBadge health={health} />
                        <button className="btn btn-xs btn-sec" onClick={() => { setBackModal({ opp: o, fromStage: o.stage, toStage: STAGES[Math.max(0, STAGES.indexOf(o.stage) - 1)] }); }}>
                          <Flag size={11} /> Send Back
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═════════ KANBAN VIEW ═════════ */}
      {view === "kanban" && (
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 12, minHeight: 400 }}>
          {STAGES.map(s => {
            const cols = filtered.filter(o => o.stage === s);
            const isDragTarget = dragOver === s;
            return (
              <div key={s}
                onDragOver={e => onDragOverCol(e, s)} onDragLeave={onDragLeaveCol}
                onDrop={e => onDropCol(e, s)}
                style={{
                  flex: "0 0 240px", background: isDragTarget ? "#F0FDF4" : "var(--s1)",
                  borderRadius: 12, padding: 10, display: "flex", flexDirection: "column",
                  border: isDragTarget ? "2px dashed #22C55E" : "1px solid var(--border)",
                  transition: "border 0.15s, background 0.15s",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: STAGE_COL[s] }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: STAGE_COL[s] }}>{s}</span>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, background: "var(--s3)", borderRadius: 10,
                    padding: "1px 8px", color: "var(--text3)",
                  }}>{cols.length}</span>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
                  {cols.map(o => {
                    const acc = accounts.find(a => a.id === o.accountId);
                    const health = getDealHealth(o.id, activities);
                    const lastAct = getLastActivity(o.id, activities);
                    const nextAct = getNextAction(o.id, activities);
                    const hCfg = HEALTH_CFG[health];
                    const isDragging = dragId === o.id;
                    return (
                      <div key={o.id} draggable
                        onDragStart={e => onDragStart(e, o.id)} onDragEnd={onDragEnd}
                        onClick={() => setDetail(o)}
                        style={{
                          background: "white", borderRadius: 10, padding: "10px 12px",
                          border: "1px solid var(--border)", cursor: "grab",
                          borderLeft: `3px solid ${hCfg.border}`,
                          opacity: isDragging ? 0.5 : 1, transition: "opacity 0.15s, box-shadow 0.15s",
                          boxShadow: isDragging ? "0 4px 12px rgba(0,0,0,0.15)" : "none",
                          position: "relative",
                        }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, flex: 1 }}>{o.title}</div>
                          <HealthBadge health={health} />
                        </div>
                        {o.oppId && <div style={{ fontSize: 10, fontFamily: "'Courier New',monospace", color: "#1B6B5A", background: "#F0FDF4", padding: "1px 6px", borderRadius: 4, marginBottom: 4, display: "inline-block" }}>{o.oppId}</div>}
                        {o.stage === "Won" && acc?.accountNo && <div style={{ fontSize: 10, fontWeight: 600, color: "#7C3AED", background: "#F5F3FF", padding: "1px 6px", borderRadius: 4, marginBottom: 4, display: "inline-block", marginLeft: 4 }}>Customer: {acc.accountNo}</div>}
                        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>{acc?.name}</div>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
                          {o.products.slice(0, 2).map(p => <ProdTag key={p} pid={p} />)}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Outfit',sans-serif", color: "var(--text1)" }}>₹{o.value}L</span>
                          <span style={{ fontSize: 11, color: "var(--text3)" }}>{o.probability}%</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <UserPill uid={o.owner} />
                          <span style={{ fontSize: 10, color: "var(--text3)" }}>{fmt.short(o.closeDate)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text3)", marginBottom: 6 }}>
                          <span>Last: {lastAct ? fmt.short(lastAct.date) : "\u2014"}</span>
                          <span>Next: {nextAct ? fmt.short(nextAct.date) : "\u2014"}</span>
                        </div>
                        <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => initiateStageMove(o, -1)} style={{
                            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 2,
                            fontSize: 10, fontWeight: 600, padding: "4px 0", borderRadius: 6, border: "1px solid var(--border)",
                            background: "var(--s1)", color: "var(--text3)", cursor: "pointer",
                          }}><ChevronLeft size={10} />Back</button>
                          <button onClick={() => setLogCallPrefill({ accountId: o.accountId, oppId: o.id, contactIds: o.primaryContactId ? [o.primaryContactId] : [] })} style={{
                            flex: 0, display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, fontWeight: 600, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)",
                            background: "var(--s1)", color: "#1B6B5A", cursor: "pointer",
                          }} title="Log Call"><Phone size={10} /></button>
                          <button onClick={() => { setQuickUpdate(quickUpdate === o.id ? null : o.id); }} style={{
                            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 2,
                            fontSize: 10, fontWeight: 600, padding: "4px 0", borderRadius: 6, border: "1px solid var(--border)",
                            background: "var(--s1)", color: "#1B6B5A", cursor: "pointer",
                          }}><Activity size={10} />Update</button>
                          <button onClick={() => initiateStageMove(o, 1)} style={{
                            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 2,
                            fontSize: 10, fontWeight: 600, padding: "4px 0", borderRadius: 6, border: "1px solid #1B6B5A",
                            background: "#1B6B5A", color: "white", cursor: "pointer",
                          }}>Advance<ChevronRight size={10} /></button>
                        </div>
                        {quickUpdate === o.id && (
                          <QuickUpdatePopover opp={o} onClose={() => setQuickUpdate(null)}
                            onSave={data => handleQuickSave(o, data)} />
                        )}
                      </div>
                    );
                  })}
                  {cols.length === 0 && (
                    <div style={{ fontSize: 11, color: "var(--text3)", textAlign: "center", padding: "20px 0" }}>No deals</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═════════ LIST VIEW ═════════ */}
      {view === "list" && (
        <div className="card" style={{ padding: 0, overflow: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                {[
                  { key: "title", label: "Deal" }, { key: "account", label: "Account" },
                  { key: "stage", label: "Stage" }, { key: "value", label: "Value" },
                  { key: "probability", label: "Prob%" }, { key: "closeDate", label: "Close Date" },
                  { key: "owner", label: "Owner" }, { key: "health", label: "Status" },
                ].map(c => (
                  <th key={c.key} style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort(c.key)}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {c.label} <SortIcon col={c.key} sortKey={sortKey} sortDir={sortDir} />
                    </span>
                  </th>
                ))}
                <th>Last Activity</th>
                <th>Next Action</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(o => {
                const acc = accounts.find(a => a.id === o.accountId);
                const health = getDealHealth(o.id, activities);
                const lastAct = getLastActivity(o.id, activities);
                const nextAct = getNextAction(o.id, activities);
                return (
                  <tr key={o.id}>
                    <td>
                      <span className="tbl-link" onClick={() => setDetail(o)}>{o.title}</span>
                      {o.oppId && <div style={{ fontSize: 10, fontFamily: "'Courier New',monospace", color: "#1B6B5A", marginTop: 2 }}>{o.oppId}</div>}
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>{o.products.slice(0, 2).map(p => <ProdTag key={p} pid={p} />)}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>{acc?.name || "\u2014"}</td>
                    <td><StatusBadge status={o.stage} /></td>
                    <td style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700 }}>₹{o.value}L</td>
                    <td style={{ fontSize: 12, color: "var(--text3)" }}>{o.probability}%</td>
                    <td style={{ fontSize: 12, color: isOverdue(o.closeDate) ? "#DC2626" : "var(--text3)" }}>{fmt.short(o.closeDate)}</td>
                    <td><UserPill uid={o.owner} /></td>
                    <td><HealthBadge health={health} /></td>
                    <td style={{ fontSize: 11, color: "var(--text3)" }}>{lastAct ? fmt.short(lastAct.date) : "\u2014"}</td>
                    <td style={{ fontSize: 11, color: "var(--text3)" }}>{nextAct ? fmt.short(nextAct.date) : "\u2014"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="icon-btn" aria-label="Edit" onClick={() => openEdit(o)}><Edit2 size={14} /></button>
                        {canDelete && <button className="icon-btn" aria-label="Delete" onClick={() => setConfirm(o.id)}><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sorted.length === 0 && <Empty icon={<List size={36} />} title="No deals found" sub="Adjust your filters or add a new deal" />}
        </div>
      )}

      {/* ═════════ ANALYTICS VIEW ═════════ */}
      {view === "analytics" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Stage-wise distribution */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Deals by Stage</div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stageConvData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {stageConvData.map((d, i) => <Cell key={i} fill={STAGE_COL[d.stage] || "#94A3B8"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Win/Loss pie */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Win / Loss / Open</div>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={winLossData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
                  {winLossData.map((d, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Weighted forecast by month */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Weighted Forecast by Month (₹L)</div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={forecastData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="value" fill="#1B6B5A" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Activity vs Stage */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Avg Activities per Stage</div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={activityVsConv}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="avgActivities" fill="#8B5CF6" radius={[6, 6, 0, 0]} name="Avg Activities" />
                <Bar dataKey="deals" fill="#3B82F6" radius={[6, 6, 0, 0]} name="Deal Count" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Deal velocity */}
          <div className="card" style={{ padding: 20, gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Deal Velocity Metrics</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
              {STAGES.filter(s => !["Won", "Lost"].includes(s)).map(s => {
                const stageOpps = opps.filter(o => o.stage === s);
                const totalVal = stageOpps.reduce((sum, o) => sum + o.value, 0);
                const avgProb = stageOpps.length > 0 ? Math.round(stageOpps.reduce((sum, o) => sum + o.probability, 0) / stageOpps.length) : 0;
                return (
                  <div key={s} style={{
                    background: "var(--s1)", borderRadius: 10, padding: "14px 16px",
                    borderTop: `3px solid ${STAGE_COL[s]}`,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: STAGE_COL[s], marginBottom: 6 }}>{s}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Outfit',sans-serif" }}>{stageOpps.length}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>₹{totalVal.toFixed(1)}L • {avgProb}% avg prob</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═════════ DEAL DETAIL ═════════ */}
      {detail && (
        <DealDetail
          detail={opps.find(o => o.id === detail.id) || detail} onClose={() => setDetail(null)}
          onEdit={() => { openEdit(opps.find(o => o.id === detail.id) || detail); setDetail(null); }}
          accounts={accounts} contacts={contacts} notes={notes} files={files}
          onAddNote={onAddNote} onAddFile={onAddFile} currentUser={currentUser}
          activities={activities} setActivities={setActivities} opps={opps} setOpps={setOpps}
          onLogCall={(prefill) => { setDetail(null); setLogCallPrefill(prefill); }}
        />
      )}

      {/* ═════════ STAGE UPDATE MODAL ═════════ */}
      {stageModal && (
        <StageUpdateModal
          opp={stageModal.opp} fromStage={stageModal.fromStage} toStage={stageModal.toStage}
          onConfirm={confirmAdvance} onCancel={() => setStageModal(null)} accounts={accounts}
        />
      )}
      {backModal && (
        <BackStageModal
          opp={backModal.opp} fromStage={backModal.fromStage} toStage={backModal.toStage}
          onConfirm={confirmBack} onCancel={() => setBackModal(null)}
        />
      )}

      {/* ═════════ ADD/EDIT MODAL ═════════ */}
      {modal && (
        <Modal title={modal.mode === "add" ? "Add Deal" : "Edit Deal"} onClose={() => setModal(null)} lg footer={
          <>
            <button className="btn btn-sec" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}><Check size={14} /> Save Deal</button>
          </>
        }>
          <div className="form-row full">
            <div className="form-group">
              <label>Deal Title *</label>
              <input value={form.title} onChange={e => { setForm(f => ({ ...f, title: e.target.value })); setFormErrors(p => ({ ...p, title: undefined })); }}
                placeholder="e.g. WiseHandling \u2013 Colossal Avia Full Deploy" style={formErrors.title ? { borderColor: "#DC2626" } : {}} />
              <FormError error={formErrors.title} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Account *</label>
              <select value={form.accountId} onChange={e => { const a = accounts.find(x => x.id === e.target.value); setForm(f => ({ ...f, accountId: e.target.value, country: a?.country || f.country })); setFormErrors(p => ({ ...p, accountId: undefined })); }}
                style={formErrors.accountId ? { borderColor: "#DC2626" } : {}}>
                <option value="">Select account…</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <FormError error={formErrors.accountId} />
            </div>
            <div className="form-group">
              <label>Stage</label>
              <select value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value, probability: STAGE_PROB[e.target.value] || f.probability }))}>
                {STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Opportunity Source</label>
              <select value={form.source || "New Lead"} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                {OPP_SOURCES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Hierarchy Level</label>
              <select value={form.hierarchyLevel || "Parent Company"} onChange={e => setForm(f => ({ ...f, hierarchyLevel: e.target.value }))}>
                {HIERARCHY_LEVELS.map(h => <option key={h}>{h}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Value (₹L)</label>
              <input type="number" min="0" value={form.value} onChange={e => setForm(f => ({ ...f, value: +e.target.value }))} />
              <FormError error={formErrors.value} />
            </div>
            <div className="form-group">
              <label>Close Date *</label>
              <input type="date" value={form.closeDate} onChange={e => { setForm(f => ({ ...f, closeDate: e.target.value })); setFormErrors(p => ({ ...p, closeDate: undefined })); }}
                style={formErrors.closeDate ? { borderColor: "#DC2626" } : {}} />
              <FormError error={formErrors.closeDate} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Owner</label>
              <select value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}>
                {team.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Country</label>
              <select value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}>
                {COUNTRIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Forecast Category</label>
              <select value={form.forecastCat || "Not Applicable"} onChange={e => setForm(f => ({ ...f, forecastCat: e.target.value }))}>
                {FORECAST_CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Deal Size</label>
              <select value={form.dealSize || "Medium"} onChange={e => setForm(f => ({ ...f, dealSize: e.target.value }))}>
                {OPP_SIZES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Primary Contact</label>
              <select value={form.primaryContactId || ""} onChange={e => setForm(f => ({ ...f, primaryContactId: e.target.value }))}>
                <option value="">Select contact…</option>
                {(contacts || []).filter(c => !form.accountId || c.accountId === form.accountId).map(c => <option key={c.id} value={c.id}>{c.name}{c.designation ? " \u2013 " + c.designation : ""}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Lead Reference</label>
              <select value={form.leadId || ""} onChange={e => setForm(f => ({ ...f, leadId: e.target.value }))}>
                <option value="">None</option>
                {(leads || []).map(l => <option key={l.id} value={l.id}>{l.leadId} \u2013 {l.company}</option>)}
              </select>
            </div>
          </div>
          {/* Win/Loss/Suspend Reasons (conditional) */}
          {form.stage === "Won" && (
            <div className="form-row">
              <div className="form-group">
                <label>Win Reason</label>
                <select value={form.winReason || ""} onChange={e => setForm(f => ({ ...f, winReason: e.target.value }))}>
                  <option value="">Select reason…</option>
                  {WIN_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
          )}
          {form.stage === "Lost" && (
            <div className="form-row">
              <div className="form-group">
                <label>Loss Reason</label>
                <select value={form.lossReason || ""} onChange={e => setForm(f => ({ ...f, lossReason: e.target.value }))}>
                  <option value="">Select reason…</option>
                  {LOSS_REASONS.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Products & Modules <span style={{color:"#DC2626"}}>*</span></label>
            <ProductModulePicker
              catalog={catalog || []}
              value={form.productSelection || []}
              error={formErrors.productSelection}
              onChange={(next) => {
                setForm(f => ({
                  ...f,
                  productSelection: next,
                  // Keep legacy `products` array in sync so filters/CSV/duplicate-check keep working
                  products: next.map(e => e.productId),
                }));
                setFormErrors(e => ({ ...e, productSelection: undefined }));
              }}
            />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Deal context, strategy notes…" />
          </div>
        </Modal>
      )}

      {/* ═════════ CONFIRM DELETE ═════════ */}
      {confirm && <DeleteConfirm title="Delete Deal" recordLabel={opps.find(o => o.id === confirm)?.title || "this deal"} onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)} />}

      {/* ═════════ LOG CALL MODAL ═════════ */}
      {logCallPrefill && (
        <LogCallModal
          onClose={() => setLogCallPrefill(null)}
          onSave={handleSaveCall}
          accounts={accounts} contacts={contacts} opps={opps} orgUsers={orgUsers} masters={masters}
          prefill={logCallPrefill}
        />
      )}
    </div>
  );
}

export default Pipeline;
