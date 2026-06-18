import { useState, useMemo, useCallback, createContext, useContext } from "react";
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
  PRODUCTS, PROD_MAP,
  // STAGES / STAGE_PROB / STAGE_COL are now editable via Masters → Pipeline
  // Stages and live in `masters.stages`. We import the bundled defaults under
  // aliases so the StagesContext provider can fall back to them when the
  // masters slot is missing (fresh state, dev fixture, etc.). Don't reference
  // these directly in render code — use useContext(StagesContext) instead.
  STAGES as DEFAULT_STAGES, STAGE_PROB as DEFAULT_STAGE_PROB, STAGE_COL as DEFAULT_STAGE_COL,
  TEAM, TEAM_MAP,
  COUNTRIES, OPP_SOURCES, HIERARCHY_LEVELS, FORECAST_CATS, OPP_SIZES,
  WIN_REASONS, LOSS_REASONS, LOSS_IMPACT_AREAS, SUSPEND_REASONS, ACT_TYPES, INIT_USERS,
  CALL_TYPES, CALL_OBJECTIVES, CALL_OUTCOMES, TENDER_CATEGORIES, TENDER_PORTALS,
  BID_INSTRUMENT_TYPES, BID_INSTRUMENT_MODES, PREBID_ACTIVITY_TYPES, TENDER_DOC_CATEGORIES,
  BID_INSTRUMENT_STATUSES, BID_QUAL_RATINGS
} from "../data/constants";
import { BLANK_OPP } from "../data/seed";
import { uid, fmt, cmp, sanitizeObj, validateOpp, hasErrors, today, isOverdue, getScopedUserIds, canEditRecord, hasPendingAccessReq } from "../utils/helpers";
import { exportCSV } from "../utils/csv";
import { StatusBadge, ProdTag, UserPill, Modal, Confirm, DeleteConfirm, DeleteWithReasonModal, FormError, NotesThread, FilesList, Empty, LogCallModal, PageTip, TypeaheadSelect, EditLockActions, RecordJourney } from "./shared";
import ProductModulePicker, { validateProductSelection, primaryProductId, normaliseProductSelection } from "./ProductModulePicker";
import DataGrid from "./DataGrid";
import { TenderAiPanel } from "./AiActions";

/* ───────── stages context ─────────
   Pipeline stages were hardcoded in constants.js; they're now editable in
   Masters → Pipeline Stages and live on `masters.stages`. We expose the
   derived maps via Context so the deeply-nested subcomponents
   (StageUpdateModal, BackStageModal, DealDetail) don't need every
   ancestor to thread props.
   The shape provided is identical to the legacy import shape:
       { STAGES, STAGE_PROB, STAGE_COL,
         wonName, lostName,        // resolved by `kind` so logic survives a rename
         openStages, closingNames }
   The provider in Pipeline() builds this from masters.stages, falling back
   to the bundled defaults when the masters slot is empty.                 */
const StagesContext = createContext(null);

// Build the derived maps from a `masters.stages` array (or null/undefined,
// in which case we synthesise from the legacy constants so the app boots
// even on a fresh state).
function buildStagesContext(stagesList) {
  // Fallback: rebuild list-shape from old string-array constants when the
  // masters.stages slot is missing. Once a real user has touched Masters,
  // this branch never runs in production.
  const list = (stagesList && stagesList.length)
    ? stagesList
    : DEFAULT_STAGES.map(s => ({
        id: `_def_${s}`, name: s,
        probability: DEFAULT_STAGE_PROB[s] || 0,
        color: DEFAULT_STAGE_COL[s] || "#94A3B8",
        kind: s === "Won" ? "won" : s === "Lost" ? "lost" : "open",
      }));
  const STAGES = list.map(s => s.name);
  const STAGE_PROB = Object.fromEntries(list.map(s => [s.name, Number(s.probability) || 0]));
  const STAGE_COL = Object.fromEntries(list.map(s => [s.name, s.color || "#94A3B8"]));
  // Resolve closing-stage names by kind so renames don't break forecast /
  // win-rate logic. Falls back to "Won" / "Lost" string names if no stage
  // is flagged (only happens on legacy data prior to this PR).
  const wonStage  = list.find(s => s.kind === "won");
  const lostStage = list.find(s => s.kind === "lost");
  const wonName   = wonStage ? wonStage.name : "Won";
  const lostName  = lostStage ? lostStage.name : "Lost";
  return {
    STAGES, STAGE_PROB, STAGE_COL,
    wonName, lostName,
    closingNames: [wonName, lostName],
    openStages: STAGES.filter(n => n !== wonName && n !== lostName),
    list,
  };
}

/* ───────── constants ───────── */
const HEALTH_CFG = {
  active:   { label: "Active",  color: "#22C55E", bg: "#F0FDF4", border: "#22C55E" },
  "at-risk": { label: "At Risk", color: "#F59E0B", bg: "#FFFBEB", border: "#F59E0B" },
  stalled:  { label: "Stalled", color: "#EF4444", bg: "#FEF2F2", border: "#EF4444" },
  // Closed outcomes — no follow-up expected, so excluded from idle buckets.
  won:      { label: "Won",     color: "#0D9488", bg: "#F0FDFA", border: "#0D9488" },
  lost:     { label: "Lost",    color: "#94A3B8", bg: "#F8FAFC", border: "#CBD5E1" },
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
const getDealHealth = (opp, activities) => {
  // Closed deals (Won / Lost) are done — no follow-up is expected, so they
  // never fall into the activity-idle "at risk" / "stalled" buckets.
  if (opp?.stage === "Won") return "won";
  if (opp?.stage === "Lost") return "lost";
  const oppId = opp?.id;
  const done = (activities || []).filter(a => a.oppId === oppId && a.status === "Completed");
  if (done.length === 0) return "stalled";
  const lastDate = done.sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0]?.date;
  if (!lastDate) return "stalled";
  const days = Math.round((new Date(today) - new Date(lastDate)) / 864e5);
  if (days <= 7) return "active";
  if (days <= 14) return "at-risk";
  return "stalled";
};

const getLastActivity = (oppId, activities) => {
  const done = (activities || []).filter(a => a.oppId === oppId && a.status === "Completed");
  if (done.length === 0) return null;
  return done.sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
};

// Next sequential opportunity number — OPP-<year>-<NNN>, continuing the
// highest existing sequence (same format the bulk importer uses).
const nextOppNo = (opps, year = new Date().getFullYear()) => {
  const maxSeq = (opps || []).reduce((m, o) => {
    const x = o.oppNo && o.oppNo.match(/OPP-\d+-(\d+)/);
    return x ? Math.max(m, parseInt(x[1], 10)) : m;
  }, 0);
  return `OPP-${year}-${String(maxSeq + 1).padStart(3, "0")}`;
};

const getNextAction = (oppId, activities) => {
  const planned = (activities || []).filter(a => a.oppId === oppId && a.status === "Planned");
  if (planned.length === 0) return null;
  return planned.sort((a, b) => (a.date || "").localeCompare(b.date || ""))[0];
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
  // Single context grab — destructure here to avoid stale closure issues.
  const { STAGE_COL, closingNames, wonName: wonStageName, lostName: lostStageName } = useContext(StagesContext);
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
    const isClosingNow = closingNames.includes(toStage);
    if (!isClosingNow) {
      if (!nextDate) e.nextDate = "Next action date is required";
      else if (nextDate <= today) e.nextDate = "Next action date must be in the future";
    }
    if (!outcome) e.outcome = "Outcome is required";
    // Mandatory loss-analysis when closing as Lost — turns the post-mortem
    // into a forced learning loop instead of an afterthought.
    if (toStage === lostStageName) {
      if (!lossPrimary) e.lossPrimary = "Primary loss reason is required";
      if (!lossImprove.trim() || lossImprove.trim().length < 15) e.lossImprove = "Improvement notes (min 15 chars) — what would we do differently?";
    }
    return e;
  };

  const submit = () => {
    const e = validate();
    if (hasErrors(e)) { setErrors(e); return; }
    const payload = { actType, notes: notes.trim(), nextDate, outcome };
    if (toStage === lostStageName) {
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
  // closingNames is [wonName, lostName] resolved by `kind` so renaming
  // "Won" → "Closed Won" still flags the stage as a closing one.
  const isClosing = closingNames.includes(toStage);
  const isLostClose = toStage === lostStageName;
  return (
    <Modal title={isClosing ? `Closing Deal as ${toStage}` : "Stage Update Required"} onClose={onCancel} lg footer={
      <>
        <button className="btn btn-sec" onClick={onCancel}>Cancel</button>
        <button className={isClosing && isLostClose ? "btn btn-danger" : "btn btn-primary"} onClick={submit}>
          <Check size={14} /> {isClosing ? `Confirm Close as ${toStage}` : "Confirm Stage Move"}
        </button>
      </>
    }>
      {isClosing ? (
        <div style={{ background: toStage === wonStageName ? "#D1FAE5" : "#FEE2E2", border: `1px solid ${toStage === wonStageName ? "#10B981" : "#EF4444"}`, borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 12.5, color: toStage === wonStageName ? "#065F46" : "#991B1B", display: "flex", alignItems: "flex-start", gap: 8 }}>
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
      {!isClosing && (
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
      {toStage === lostStageName && (
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
  const { STAGE_COL } = useContext(StagesContext);
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
function DealDetail({ detail, onClose, onEdit, accounts, contacts, notes, files, onAddNote, onAddFile, currentUser, activities, setActivities, opps, setOpps, orgUsers = [], callReports = [], onLogCall }) {
  const { STAGE_COL, STAGES } = useContext(StagesContext);
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
  // Resolve a user id to a real display name. Real users live in orgUsers
  // (Supabase); TEAM_MAP is only the static seed and won't have live ids —
  // hence activity/timeline lines showed a blank name. Fall back gracefully.
  const userName = (id) => (orgUsers || []).find(u => u.id === id)?.name || TEAM_MAP[id]?.name || id || "";

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
  const health = getDealHealth(detail, activities);
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

  // Calls logged against this deal (for the Record Journey timeline).
  const oppCalls = (callReports || []).filter(cr => cr.oppId === detail.id);

  // ── Record Journey events — unified, filterable history of the deal ──
  const journeyEvents = useMemo(() => {
    const d10 = (s) => (s || "").slice(0, 10);
    const evs = [];
    evs.push({
      kind: "created", date: d10(detail.createdDate) || d10(detail.closeDate) || "",
      title: "Opportunity Created",
      subtitle: detail.source ? `Source: ${detail.source}` : "",
      desc: [
        detail.products?.length ? `Products: ${detail.products.map(p => PROD_MAP[p]?.name || p).join(", ")}` : null,
        detail.value ? `Value: ₹${detail.value}L` : null,
        detail.leadId ? "Converted from a lead" : null,
      ].filter(Boolean).join(" · "),
      by: detail.owner || "",
    });
    if (detail.owner) evs.push({
      kind: "assigned", date: d10(detail.createdDate) || "",
      title: `Assigned to ${userName(detail.owner)}`, subtitle: "Sales owner", by: detail.owner,
    });
    (detail.stageHistory || []).forEach(sh => evs.push({
      kind: "stage", date: d10(sh.date), title: `Stage: ${sh.from} → ${sh.to}`,
      subtitle: sh.to, desc: sh.by ? `Changed by ${userName(sh.by)}` : "", by: sh.by || "",
    }));
    oppCalls.forEach(cr => evs.push({
      kind: "call", date: d10(cr.callDate || cr.date),
      title: `${cr.callType || cr.objective || "Call"}${cr.outcome ? ` — ${cr.outcome}` : ""}`,
      subtitle: cr.objective || cr.callType || "", desc: cr.notes || "",
      by: cr.marketingPerson || cr.owner || "", status: cr.outcome || "",
      meta: [cr.duration ? `${cr.duration} min` : null, cr.nextCallDate ? `Next call: ${cr.nextCallDate}` : null].filter(Boolean).join(" · "),
    }));
    oppActs.forEach(a => evs.push({
      kind: a.type === "Follow-up" ? "followup" : "activity", date: d10(a.date || a.createdDate),
      title: a.title || a.type || "Activity", subtitle: a.type || "", desc: a.notes || "",
      by: a.owner || "", status: a.status || "",
    }));
    return evs.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [detail, oppActs, oppCalls]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)",
      display: "flex", justifyContent: "center", alignItems: "stretch",
    }}>
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
                {editableRow("Stage", "stage", "select", STAGES)}
                {editableRow("Value (₹L)", "value", "number")}
                {editableRow("Probability (%)", "probability", "number")}
                {editableRow("Close Date", "closeDate", "date")}
                {/* Static rows */}
                <div className="dp-row">
                  <span className="dp-key">Owner</span>
                  <span className="dp-val" style={{flex:1}}>
                    {editingField === "owner" ? (
                      <span style={{display:"flex",gap:4,alignItems:"center"}}>
                        <select autoFocus value={fieldVal} onChange={e=>saveEdit("owner", e.target.value)}
                          onBlur={cancelEdit} style={iStyle}>
                          {(orgUsers||[]).filter(u=>u.active!==false).map(u=>(
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                        <button onClick={cancelEdit} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text3)",padding:0,fontSize:16,lineHeight:1}}>✕</button>
                      </span>
                    ) : (
                      <span style={{cursor:"pointer",display:"flex",alignItems:"center",gap:4}}
                        onClick={()=>{ setEditingField("owner"); setFieldVal(detail.owner || ""); }} title="Click to reassign owner">
                        {(orgUsers||[]).find(u=>u.id===detail.owner)?.name || TEAM_MAP[detail.owner]?.name || "—"}
                        <Edit2 size={9} style={{color:"var(--text3)",opacity:0.4,flexShrink:0}}/>
                      </span>
                    )}
                  </span>
                </div>
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
                      {fmt.date(item.date)} {item.type === "activity" && item.data.owner ? `\u2022 ${userName(item.data.owner)}` : ""}
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
            <RecordJourney
              events={journeyEvents}
              totalCount={journeyEvents.length}
              orgUsers={orgUsers}
              onLogCall={() => onLogCall({ accountId: detail.accountId, oppId: detail.id, contactIds: detail.primaryContactId ? [detail.primaryContactId] : [] })}
              onLogActivity={() => logQuickActivity("Task")}
              onSetFollowup={() => setActivities(p => [...p, {
                id: `act${uid()}`, type: "Follow-up", status: "Planned", date: today, time: "12:00", duration: 15,
                accountId: detail.accountId, contactId: detail.primaryContactId || "", oppId: detail.id,
                owner: currentUser, title: `Follow-up: ${detail.title}`, notes: "", outcome: "",
              }])}
            />
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
function Pipeline({ opps, setOpps, onDeleteOpp, accounts, contacts, leads, notes, onAddNote, files, onAddFile, currentUser, activities, setActivities, callReports, setCallReports, orgUsers, masters, catalog, onDealWon, canDelete, commLogs=[], onRequestEditAccess, aiConfig }) {
  const canEditOpp = (o) => canEditRecord({ownerId:o?.owner,currentUser,orgUsers,recordType:"opp",recordId:o?.id,commLogs,catalog,recordProductIds:(o?.products&&o.products.length)?o.products:(o?.product?[o.product]:[])});
  const requestAccessOpp = (o) => onRequestEditAccess && onRequestEditAccess("opp", o.id, o.title||o.id||"Opportunity", o.owner);

  // ── Bid Qualification & Approval matrix (Phase 2) ──
  const _myRole = String((orgUsers||[]).find(u=>u.id===currentUser)?.role || "").toLowerCase();
  const BID_QUAL_ITEMS = [
    ["strategicFit","Strategic Fit"],["technicalFit","Technical Fit"],["financialFit","Financial Fit"],
    ["existingRelationship","Existing Relationship"],["competitionAnalysis","Competition"],["resourceAvailability","Resource Availability"],
  ];
  const BID_APPROVAL_MATRIX = [
    { label:"Sales Manager", roles:["line_mgr","bd_lead","country_mgr"] },
    { label:"Vertical Head",  roles:["director","vp_sales_mkt","product_head"] },
    { label:"CEO / MD",       roles:["md","admin"] },
  ];
  const bidCurrentIdx = (chain) => (chain||[]).findIndex(s => s.status === "Pending");
  const bidCanActNow = (chain) => {
    const i = bidCurrentIdx(chain);
    if (i < 0) return false;
    return _myRole === "admin" || BID_APPROVAL_MATRIX[i]?.roles.includes(_myRole);
  };
  const submitBidApproval = () => {
    if (!form.bidDecision) { setFormErrors(e=>({...e,bidDecision:"Pick Bid / No-Bid / Hold first"})); return; }
    if (form.bidDecision !== "Bid") {
      // No-Bid / Hold needs no multi-tier sign-off — record it directly.
      setForm(f=>({...f,bidApprovalStatus:f.bidDecision==="Hold"?"On Hold":"No-Bid Recorded",bidApprovalChain:[]}));
      return;
    }
    setForm(f=>({...f,bidApprovalStatus:"Pending",bidApprovalChain:BID_APPROVAL_MATRIX.map(m=>({label:m.label,status:"Pending",by:"",at:"",note:""}))}));
  };
  const actBidApproval = (approve, note="") => {
    setForm(f=>{
      const chain=[...(f.bidApprovalChain||[])];
      const i=bidCurrentIdx(chain);
      if(i<0) return f;
      chain[i]={...chain[i],status:approve?"Approved":"Rejected",by:currentUser,at:new Date().toISOString(),note};
      let status="Pending";
      if(!approve) status="Rejected";
      else if(i===chain.length-1) status="Approved";
      return {...f,bidApprovalChain:chain,bidApprovalStatus:status};
    });
  };

  // ── Phase 3: generic JSONB-list row helpers (EMD/PBG register, pre-bid log, docs) ──
  const addRow = (key, blank) => setForm(f => ({ ...f, [key]: [...(f[key]||[]), { id: `r${Date.now()}${Math.random().toString(36).slice(2,5)}`, ...blank }] }));
  const updRow = (key, id, patch) => setForm(f => ({ ...f, [key]: (f[key]||[]).map(r => r.id === id ? { ...r, ...patch } : r) }));
  const delRow = (key, id) => setForm(f => ({ ...f, [key]: (f[key]||[]).filter(r => r.id !== id) }));
  // Reference lists are now Masters-driven (Masters → Sales). Aliased to the
  // live constant arrays that registerMasters() splices in place. Instrument
  // STATUS stays a fixed workflow enum (not a customisable reference list).
  const INSTRUMENT_TYPES = BID_INSTRUMENT_TYPES;
  const INSTRUMENT_MODES = BID_INSTRUMENT_MODES;
  const INSTRUMENT_STATUS = BID_INSTRUMENT_STATUSES;
  const PREBID_TYPES = PREBID_ACTIVITY_TYPES;
  // Pipeline stages are now editable in Masters → Pipeline Stages. Build the
  // derived maps once per render — buildStagesContext handles fallback to
  // bundled defaults when masters.stages is missing.
  const stagesCtx = useMemo(() => buildStagesContext(masters?.stages), [masters?.stages]);
  const { STAGES, STAGE_PROB, STAGE_COL, wonName, lostName, closingNames } = stagesCtx;

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
  const [view, setView] = useState("list");
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

  /* Deal health, computed ONCE per (opps, activities) change.
     getDealHealth is otherwise called ~5×/row in the List view (filter,
     sort, KPIs, column render, body) and each call re-scanned all
     activities. Group completed activities by oppId once, then derive
     health per opp — O(activities + opps) instead of O(rows × activities). */
  const healthById = useMemo(() => {
    const byOpp = new Map();
    for (const a of (activities || [])) {
      if (a.status !== "Completed") continue;
      if (!byOpp.has(a.oppId)) byOpp.set(a.oppId, []);
      byOpp.get(a.oppId).push(a);
    }
    const m = new Map();
    for (const o of opps) m.set(o.id, getDealHealth(o, byOpp.get(o.id) || []));
    return m;
  }, [opps, activities]);
  const healthOf = (o) => (o && healthById.has(o.id) ? healthById.get(o.id) : getDealHealth(o, activities));

  /* filtered opps */
  const filtered = useMemo(() => opps.filter(o => {
    if (prodF !== "All" && !o.products.includes(prodF)) return false;
    if (ownerF !== "All" && o.owner !== ownerF) return false;
    if (regionF !== "All" && o.country !== regionF) return false;
    if (stageF !== "All" && o.stage !== stageF) return false;
    if (statusF !== "All") {
      const h = healthById.get(o.id);
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
  }), [opps, prodF, ownerF, regionF, stageF, statusF, searchQ, healthById, accounts]);

  /* KPIs */
  const openDeals = filtered.filter(o => !closingNames.includes(o.stage));
  const totalPipe = openDeals.reduce((s, o) => s + o.value, 0);
  const weighted = openDeals.reduce((s, o) => s + (o.value * (o.probability / 100)), 0);
  const wonCount = filtered.filter(o => o.stage === wonName).length;
  const lostCount = filtered.filter(o => o.stage === lostName).length;
  const winRate = wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : 0;
  const atRiskCount = openDeals.filter(o => healthById.get(o.id) === "at-risk").length;
  const stalledCount = openDeals.filter(o => healthById.get(o.id) === "stalled").length;

  /* form handlers */
  const openAdd = () => { setForm({ ...BLANK_OPP, id: `o${uid()}`, productSelection: [], owner: currentUser || BLANK_OPP.owner }); setFormErrors({}); setModal({ mode: "add" }); };
  const openEdit = o => {
    if (o && o.id && !canEditOpp(o)) { requestAccessOpp(o); return; }
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
    if (modal?.mode === "edit" && !canEditOpp(form)) { setModal(null); setFormErrors({}); return; }
    // Normalise productSelection BEFORE validating so half-filled lines
    // (product picked, no module ticked, no explicit "None") don't block save.
    const normalisedForm = { ...form, productSelection: normaliseProductSelection(form.productSelection) };
    const errs = validateOpp(normalisedForm);
    // When EDITING an existing deal, don't hard-block on Account / Close Date.
    // Many legacy deals were created without them, and routine edits (e.g.
    // reassigning the owner) shouldn't force backfilling those fields. They
    // stay required only when creating a NEW deal, so fresh data stays clean.
    if (modal?.mode === "edit") { delete errs.accountId; delete errs.closeDate; }
    const psErr = validateProductSelection(normalisedForm.productSelection);
    if (psErr) errs.productSelection = psErr;
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    const clean = sanitizeObj(normalisedForm);
    /* duplicate check */
    if (modal.mode === "add") {
      const dup = opps.find(o => o.accountId === clean.accountId && o.products.length > 0 && clean.products.length > 0 && o.products.some(p => clean.products.includes(p)) && o.id !== clean.id);
      if (dup && !window.confirm(`Warning: A deal for this account with overlapping products already exists ("${dup.title}"). Continue?`)) return;
      setOpps(p => [...p, { ...clean, oppNo: clean.oppNo || nextOppNo(p), probability: STAGE_PROB[clean.stage] || clean.probability }]);
    } else {
      const prev = opps.find(o => o.id === clean.id);
      setOpps(p => p.map(o => o.id === clean.id ? { ...clean } : o));
      if (clean.stage === wonName && prev?.stage !== wonName && onDealWon) onDealWon(clean);
    }
    setModal(null); setDetail(null); setFormErrors({});
  };
  const del = (id, meta = {}) => { onDeleteOpp(id, meta); setConfirm(null); setDetail(null); };
  const toggleProd = pid => {
    const pp = form.products.includes(pid) ? form.products.filter(x => x !== pid) : [...form.products, pid];
    setForm(f => ({ ...f, products: pp }));
  };

  /* ── STAGE MOVEMENT (gated) ── */
  const initiateStageMove = (opp, dir) => {
    if (!canEditOpp(opp)) { requestAccessOpp(opp); return; }
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
    if (toStage === wonName && onDealWon) onDealWon(updated);
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
      else if (sortKey === "health") { va = healthById.get(a.id); vb = healthById.get(b.id); }
      else { va = a[sortKey] ?? ""; vb = b[sortKey] ?? ""; }
      if (typeof va === "number") return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [filtered, sortKey, sortDir, accounts, healthById]);

  /* ── ANALYTICS DATA ── */
  // STAGES / closingNames / wonName / lostName resolved from masters (with
  // legacy fallback) — see buildStagesContext at module top.
  // Analytics charts read from `filtered` (not raw `opps`) so they move with
  // the search / product / owner / region / stage / status filters, matching
  // the KPI tiles above them.
  const stageConvData = useMemo(() => STAGES.filter(s => s !== lostName).map(s => ({
    stage: s, count: filtered.filter(o => o.stage === s).length,
  })), [filtered, STAGES, lostName]);

  const winLossData = useMemo(() => [
    { name: wonName, value: filtered.filter(o => o.stage === wonName).length },
    { name: lostName, value: filtered.filter(o => o.stage === lostName).length },
    { name: "Open", value: filtered.filter(o => !closingNames.includes(o.stage)).length },
  ], [filtered, wonName, lostName, closingNames]);

  const forecastData = useMemo(() => {
    const months = {};
    filtered.filter(o => !closingNames.includes(o.stage) && o.closeDate).forEach(o => {
      const m = o.closeDate.slice(0, 7);
      months[m] = (months[m] || 0) + o.value * (o.probability / 100);
    });
    return Object.entries(months).sort().slice(0, 6).map(([m, v]) => ({ month: m, value: +v.toFixed(1) }));
  }, [filtered, closingNames]);

  const activityVsConv = useMemo(() => STAGES.filter(s => !closingNames.includes(s)).map(s => {
    const stageOpps = filtered.filter(o => o.stage === s);
    const avgActs = stageOpps.length > 0
      ? Math.round(stageOpps.reduce((sum, o) => sum + (activities || []).filter(a => a.oppId === o.id && a.status === "Completed").length, 0) / stageOpps.length)
      : 0;
    return { stage: s, avgActivities: avgActs, deals: stageOpps.length };
  }), [filtered, activities, STAGES, closingNames]);

  /* ── MANAGER VIEW: mismatch detection ── */
  // Excludes closed deals (Won/Lost) AND the very first stage in the list
  // (typically "Prospect") since brand-new deals haven't had time to log
  // activity yet. Using STAGES[0] makes this survive a stage rename / reorder.
  const firstStageName = STAGES[0];
  const mismatchDeals = useMemo(() => {
    if (!mgrView) return [];
    return filtered.filter(o => {
      if (closingNames.includes(o.stage) || o.stage === firstStageName) return false;
      const recent = (activities || []).filter(a => a.oppId === o.id && a.status === "Completed" && a.date >= (() => { const d = new Date(today); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })());
      return recent.length === 0;
    });
  }, [filtered, activities, mgrView, closingNames, firstStageName]);

  /* ─────────────────── RENDER ─────────────────── */
  return (
    // StagesContext.Provider feeds the derived STAGES / STAGE_PROB / STAGE_COL
    // maps + closing-stage names (resolved by `kind`) to every subcomponent
    // tree below — including modals rendered as direct children.
    <StagesContext.Provider value={stagesCtx}>
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
        <TypeaheadSelect
          size="filter" allowAll allLabel="All Products" placeholder="Search products…"
          value={prodF} onChange={setProdF}
          options={PRODUCTS.map(p => ({ value: p.id, label: p.name }))}
        />
        <TypeaheadSelect
          size="filter" allowAll allLabel="All Owners" placeholder="Search owners…"
          value={ownerF} onChange={setOwnerF}
          options={team.map(u => ({ value: u.id, label: u.name, sub: u.role }))}
        />
        <TypeaheadSelect
          size="filter" allowAll allLabel="All Regions" placeholder="Search regions…"
          value={regionF} onChange={setRegionF}
          options={COUNTRIES.map(c => ({ value: c, label: c }))}
        />
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
                  const health = healthOf(o);
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
                    const health = healthOf(o);
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
                        {o.stage === wonName && acc?.accountNo && <div style={{ fontSize: 10, fontWeight: 600, color: "#7C3AED", background: "#F5F3FF", padding: "1px 6px", borderRadius: 4, marginBottom: 4, display: "inline-block", marginLeft: 4 }}>Customer: {acc.accountNo}</div>}
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

      {/* ═════════ LIST VIEW ═════════
          Excel-like table powered by DataGrid: per-user column visibility,
          order, width, and saved views are persisted to user_table_views.
          Ordering of columns here defines the *initial* order any user
          sees on first visit; never auto-rearranged after that. */}
      {view === "list" && (() => {
        // Helper for plain text columns — keeps the registry compact.
        const txt = (val) => <span style={{ fontSize: 12 }}>{val || "-"}</span>;
        // Full column registry: every meaningful opp field is opt-in. Different
        // user groups (sales, BD, line mgr, finance) can build their own views
        // from this set; only the columns marked visible:true in DEFAULT_CONFIG
        // show on first visit.
        const PIPELINE_COLUMNS = [
          { key: "title", label: "Deal", defaultWidth: 240, render: o => (
            <>
              <span className="tbl-link" onClick={() => setDetail(o)}>{o.title}</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
                {o.oppNo && <span style={{ fontSize: 10, fontFamily: "'Courier New',monospace", color: "#1B6B5A" }}>{o.oppNo}</span>}
                {(o.products||[]).slice(0, 2).map(p => <ProdTag key={p} pid={p} />)}
              </div>
            </>
          )},
          { key: "oppNo", label: "Opp No.", defaultWidth: 120, render: o => (
            <span style={{fontFamily:"'Courier New',monospace",fontSize:11}}>{o.oppNo || "-"}</span>
          )},
          { key: "account", label: "Account", defaultWidth: 200, render: o => txt(accounts.find(a => a.id === o.accountId)?.name) },
          { key: "stage", label: "Stage", defaultWidth: 140, render: o => <StatusBadge status={o.stage} /> },
          { key: "value", label: "Value", defaultWidth: 100, render: o => (
            <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700 }}>{`₹${o.value || 0}L`}</span>
          )},
          { key: "probability", label: "Prob%", defaultWidth: 80, render: o => (
            <span style={{ fontSize: 12, color: "var(--text3)" }}>{o.probability}%</span>
          )},
          { key: "weightedValue", label: "Weighted ₹L", defaultWidth: 110, sortable: false, render: o => (
            <span style={{ fontFamily: "'Outfit',sans-serif", fontWeight: 700, color: "var(--brand)" }}>
              {`₹${(((o.value||0) * (o.probability||0)) / 100).toFixed(1)}L`}
            </span>
          )},
          { key: "closeDate", label: "Close Date", defaultWidth: 120, render: o => (
            <span style={{ fontSize: 12, color: isOverdue(o.closeDate) ? "#DC2626" : "var(--text3)" }}>{fmt.short(o.closeDate)}</span>
          )},
          { key: "decisionDate", label: "Decision Date", defaultWidth: 120, render: o => txt(fmt.short(o.decisionDate)) },
          { key: "createdDate", label: "Created", defaultWidth: 110, render: o => txt(fmt.short(o.createdDate)) },
          { key: "owner", label: "Owner", defaultWidth: 140, render: o => <UserPill uid={o.owner} /> },
          { key: "health", label: "Status", defaultWidth: 110, render: o => <HealthBadge health={healthOf(o)} /> },
          { key: "lastActivity", label: "Last Activity", defaultWidth: 120, sortable: false, render: o => {
            const lastAct = getLastActivity(o.id, activities);
            return <span style={{ fontSize: 11, color: "var(--text3)" }}>{lastAct ? fmt.short(lastAct.date) : "-"}</span>;
          }},
          { key: "nextAction", label: "Next Action", defaultWidth: 120, sortable: false, render: o => {
            const nextAct = getNextAction(o.id, activities);
            return <span style={{ fontSize: 11, color: "var(--text3)" }}>{nextAct ? fmt.short(nextAct.date) : "-"}</span>;
          }},
          { key: "nextStep", label: "Next Step", defaultWidth: 200, render: o => txt(o.nextStep) },
          { key: "products", label: "Products", defaultWidth: 200, sortable: false, render: o => (
            <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{(o.products||[]).map(p => <ProdTag key={p} pid={p}/>)}</div>
          )},
          { key: "lob", label: "LOB", defaultWidth: 120, render: o => txt(o.lob) },
          { key: "dealSize", label: "Deal Size", defaultWidth: 110, render: o => txt(o.dealSize) },
          { key: "forecastCat", label: "Forecast", defaultWidth: 110, render: o => txt(o.forecastCat) },
          { key: "source", label: "Source", defaultWidth: 130, render: o => txt(o.source) },
          { key: "campaignSource", label: "Campaign", defaultWidth: 140, render: o => txt(o.campaignSource) },
          { key: "country", label: "Country", defaultWidth: 110, render: o => txt(o.country) },
          { key: "territory", label: "Territory", defaultWidth: 130, render: o => txt(o.territory) },
          { key: "hierarchyLevel", label: "Hierarchy", defaultWidth: 130, render: o => txt(o.hierarchyLevel) },
          { key: "currency", label: "Currency", defaultWidth: 90, render: o => txt(o.currency || "INR") },
          { key: "budget", label: "Budget", defaultWidth: 120, render: o => txt(o.budget) },
          { key: "primaryContact", label: "Primary Contact", defaultWidth: 180, sortable: false, render: o => {
            const c = contacts?.find?.(x => x.id === o.primaryContactId);
            return <span style={{fontSize:12}}>{c?.name || "-"}</span>;
          }},
          { key: "secondaryContacts", label: "Other Contacts", defaultWidth: 100, sortable: false, render: o => (
            <span style={{fontSize:11,color:"var(--text3)"}}>{(o.secondaryContactIds||[]).length || "-"}</span>
          )},
          { key: "leadId", label: "Source Lead", defaultWidth: 120, render: o => (
            <span style={{fontFamily:"'Courier New',monospace",fontSize:11}}>{o.leadId || "-"}</span>
          )},
          { key: "competitors", label: "Competitors", defaultWidth: 160, render: o => txt(o.competitors) },
          { key: "lossReason", label: "Loss Reason", defaultWidth: 160, render: o => txt(o.lossReason) },
          { key: "lostToCompetitor", label: "Lost To", defaultWidth: 140, render: o => txt(o.lostToCompetitor) },
          { key: "upsellFlag", label: "Upsell", defaultWidth: 80, render: o => (
            <span style={{fontSize:11,fontWeight:600,color:o.upsellFlag?"#22C55E":"var(--text3)"}}>{o.upsellFlag ? "Yes" : "-"}</span>
          )},
          { key: "notes", label: "Notes", defaultWidth: 240, sortable: false, render: o => (
            <span style={{fontSize:11,color:"var(--text3)"}} title={o.notes || ""}>{(o.notes || "").slice(0, 80) || "-"}</span>
          )},
          // ── Tender columns (hidden by default; enable via Columns) ──
          { key: "isTender", label: "Tender?", defaultWidth: 80, render: o => o.isTender
            ? <span style={{fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:5,background:"#FFF7ED",color:"#B45309",border:"1px solid #FDE68A"}}>TENDER</span> : txt("") },
          { key: "tenderNo", label: "Tender No.", defaultWidth: 160, render: o => <span style={{fontFamily:"'Courier New',monospace",fontSize:11}}>{o.tenderNo || "-"}</span> },
          { key: "tenderAuthority", label: "Authority", defaultWidth: 180, render: o => txt(o.tenderAuthority) },
          { key: "tenderPortal", label: "Portal", defaultWidth: 140, render: o => txt(o.tenderPortal) },
          { key: "submissionDate", label: "Bid Submission", defaultWidth: 130, render: o => o.submissionDate
            ? <span style={{fontSize:12,color: o.submissionDate < today ? "#DC2626" : isOverdue(o.submissionDate) ? "#DC2626" : "var(--text2)"}}>{fmt.short(o.submissionDate)}</span> : txt("") },
          { key: "emdAmount", label: "EMD (₹L)", defaultWidth: 90, render: o => txt(o.emdAmount ? `₹${o.emdAmount}L` : "") },
        ];
        const PIPELINE_DEFAULT_CONFIG = [
          { key: "title", visible: true, width: 240 },
          { key: "oppNo", visible: true, width: 120 },
          { key: "account", visible: true, width: 200 },
          { key: "stage", visible: true, width: 140 },
          { key: "value", visible: true, width: 100 },
          { key: "probability", visible: true, width: 80 },
          { key: "weightedValue", visible: false, width: 110 },
          { key: "closeDate", visible: true, width: 120 },
          { key: "decisionDate", visible: false, width: 120 },
          { key: "createdDate", visible: false, width: 110 },
          { key: "owner", visible: true, width: 140 },
          { key: "health", visible: true, width: 110 },
          { key: "lastActivity", visible: true, width: 120 },
          { key: "nextAction", visible: true, width: 120 },
          { key: "nextStep", visible: false, width: 200 },
          { key: "products", visible: false, width: 200 },
          { key: "lob", visible: false, width: 120 },
          { key: "dealSize", visible: false, width: 110 },
          { key: "forecastCat", visible: false, width: 110 },
          { key: "source", visible: false, width: 130 },
          { key: "campaignSource", visible: false, width: 140 },
          { key: "country", visible: false, width: 110 },
          { key: "territory", visible: false, width: 130 },
          { key: "hierarchyLevel", visible: false, width: 130 },
          { key: "currency", visible: false, width: 90 },
          { key: "budget", visible: false, width: 120 },
          { key: "primaryContact", visible: false, width: 180 },
          { key: "secondaryContacts", visible: false, width: 100 },
          { key: "leadId", visible: false, width: 120 },
          { key: "competitors", visible: false, width: 160 },
          { key: "lossReason", visible: false, width: 160 },
          { key: "lostToCompetitor", visible: false, width: 140 },
          { key: "upsellFlag", visible: false, width: 80 },
          { key: "notes", visible: false, width: 240 },
          { key: "isTender", visible: false, width: 80 },
          { key: "tenderNo", visible: false, width: 160 },
          { key: "tenderAuthority", visible: false, width: 180 },
          { key: "tenderPortal", visible: false, width: 140 },
          { key: "submissionDate", visible: false, width: 130 },
          { key: "emdAmount", visible: false, width: 90 },
        ];
        return (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <DataGrid
              dense
              module="pipeline_list"
              userId={currentUser}
              columns={PIPELINE_COLUMNS}
              defaultColumnConfig={PIPELINE_DEFAULT_CONFIG}
              rows={sorted}
              rowKey={r => r.id}
              sortKey={sortKey} sortDir={sortDir}
              onSort={toggleSort}
              SortIcon={SortIcon}
              emptyState={<Empty icon={<List size={36} />} title="No deals found" sub="Adjust your filters or add a new deal" />}
              rowActions={o => (
                <EditLockActions
                  editable={canEditOpp(o)}
                  pending={hasPendingAccessReq(commLogs, "opp", o.id, currentUser)}
                  onEdit={() => openEdit(o)} onDelete={() => setConfirm(o.id)}
                  onRequest={() => requestAccessOpp(o)} canDelete={canDelete}/>
              )}
            />
          </div>
        );
      })()}

      {/* ═════════ LIST VIEW (LEGACY — disabled, replaced by DataGrid block) ═════════ */}
      {false && (
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
                const health = healthOf(o);
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
              {STAGES.filter(s => !closingNames.includes(s)).map(s => {
                const stageOpps = filtered.filter(o => o.stage === s);
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
          orgUsers={orgUsers} callReports={callReports}
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
        <Modal title={modal.mode === "add" ? "Add Deal" : "Edit Deal"} onClose={() => setModal(null)} size="xl" footer={
          <>
            <button className="btn btn-sec" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}><Check size={14} /> Save Deal</button>
          </>
        }>
          <div className="form-row full">
            <div className="form-group">
              <label>Deal Title *</label>
              <input value={form.title} onChange={e => { setForm(f => ({ ...f, title: e.target.value })); setFormErrors(p => ({ ...p, title: undefined })); }}
                placeholder="e.g. WiseHandling - Colossal Avia Full Deploy" style={formErrors.title ? { borderColor: "#DC2626" } : {}} />
              <FormError error={formErrors.title} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Account *</label>
              <TypeaheadSelect
                value={form.accountId}
                onChange={(id) => { const a = accounts.find(x => x.id === id); setForm(f => ({ ...f, accountId: id, country: a?.country || f.country })); setFormErrors(p => ({ ...p, accountId: undefined })); }}
                options={accounts.map(a => ({ value: a.id, label: a.name, sub: a.country || a.type || "" }))}
                placeholder="Search accounts…"
                error={!!formErrors.accountId}
              />
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
              <TypeaheadSelect
                value={form.owner}
                onChange={(id) => setForm(f => ({ ...f, owner: id }))}
                options={team.map(u => ({ value: u.id, label: u.name, sub: u.role }))}
                placeholder="Search owners…"
              />
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
          {/* ── Tender / Government Bid details ── */}
          <div style={{ marginTop: 6, marginBottom: 8, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 10, background: form.isTender ? "#FFF7ED" : "var(--s1)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={!!form.isTender} onChange={e => setForm(f => ({ ...f, isTender: e.target.checked }))} />
              This is a Government Tender / RFP / Bid
            </label>
            {form.isTender && (
              <div style={{ marginTop: 12 }}>
                <div className="form-row">
                  <div className="form-group"><label>Tender / Bid No.</label><input value={form.tenderNo || ""} onChange={e => setForm(f => ({ ...f, tenderNo: e.target.value }))} placeholder="e.g. GEM/2026/B/123456"/></div>
                  <div className="form-group"><label>Portal / Source</label><select value={form.tenderPortal || ""} onChange={e => setForm(f => ({ ...f, tenderPortal: e.target.value }))}><option value="">Select…</option>{TENDER_PORTALS.map(p => <option key={p}>{p}</option>)}</select></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Authority / Body</label><input value={form.tenderAuthority || ""} onChange={e => setForm(f => ({ ...f, tenderAuthority: e.target.value }))} placeholder="e.g. Airports Authority of India"/></div>
                  <div className="form-group"><label>Department</label><input value={form.tenderDepartment || ""} onChange={e => setForm(f => ({ ...f, tenderDepartment: e.target.value }))} placeholder="e.g. Cargo / IT"/></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Tender Category</label><select value={form.tenderCategory || ""} onChange={e => setForm(f => ({ ...f, tenderCategory: e.target.value }))}><option value="">Select…</option>{TENDER_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
                  <div className="form-group"><label>State</label><input value={form.tenderState || ""} onChange={e => setForm(f => ({ ...f, tenderState: e.target.value }))} placeholder="e.g. Maharashtra"/></div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: "0.05em", margin: "8px 0 4px" }}>Bid Calendar</div>
                <div className="form-row">
                  <div className="form-group"><label>Pre-Bid Date</label><input type="date" value={form.preBidDate || ""} onChange={e => setForm(f => ({ ...f, preBidDate: e.target.value }))}/></div>
                  <div className="form-group"><label>Bid Submission Date</label><input type="date" value={form.submissionDate || ""} onChange={e => setForm(f => ({ ...f, submissionDate: e.target.value }))}/></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Technical Bid Date</label><input type="date" value={form.techBidDate || ""} onChange={e => setForm(f => ({ ...f, techBidDate: e.target.value }))}/></div>
                  <div className="form-group"><label>Financial Bid Date</label><input type="date" value={form.finBidDate || ""} onChange={e => setForm(f => ({ ...f, finBidDate: e.target.value }))}/></div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: "0.05em", margin: "8px 0 4px" }}>EMD / Bid Security &amp; PBG</div>
                <div className="form-row">
                  <div className="form-group"><label>EMD Amount (₹L)</label><input type="number" min={0} value={form.emdAmount || 0} onChange={e => setForm(f => ({ ...f, emdAmount: +e.target.value }))}/></div>
                  <div className="form-group"><label>EMD Valid Till</label><input type="date" value={form.emdValidity || ""} onChange={e => setForm(f => ({ ...f, emdValidity: e.target.value }))}/></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>PBG Amount (₹L)</label><input type="number" min={0} value={form.pbgAmount || 0} onChange={e => setForm(f => ({ ...f, pbgAmount: +e.target.value }))}/></div>
                  <div className="form-group"><label>PBG Valid Till</label><input type="date" value={form.pbgValidity || ""} onChange={e => setForm(f => ({ ...f, pbgValidity: e.target.value }))}/></div>
                </div>
                <div className="form-row full"><div className="form-group"><label>Eligibility Criteria</label><textarea rows={2} value={form.eligibility || ""} onChange={e => setForm(f => ({ ...f, eligibility: e.target.value }))} placeholder="Turnover, past performance, certifications…" style={{ width: "100%", resize: "vertical" }}/></div></div>
                <div className="form-row">
                  <div className="form-group"><label>OEM Requirements</label><textarea rows={2} value={form.oemReqs || ""} onChange={e => setForm(f => ({ ...f, oemReqs: e.target.value }))} placeholder="OEM tie-ups / MAF…" style={{ width: "100%", resize: "vertical" }}/></div>
                  <div className="form-group"><label>Mandatory Requirements</label><textarea rows={2} value={form.mandatoryReqs || ""} onChange={e => setForm(f => ({ ...f, mandatoryReqs: e.target.value }))} placeholder="Must-have compliance items…" style={{ width: "100%", resize: "vertical" }}/></div>
                </div>

                {/* ── AI Assist (Phase 8) — qualification, bid/no-bid, compliance matrix ── */}
                <TenderAiPanel form={form} setForm={setForm} aiConfig={aiConfig} />

                {/* ── Bid Qualification & Decision (Phase 2) ── */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: "0.05em", margin: "10px 0 4px" }}>Bid Qualification</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                  {BID_QUAL_ITEMS.map(([k, lbl]) => (
                    <div key={k} className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: 11 }}>{lbl}</label>
                      <select value={form.bidQualification?.[k] || ""} onChange={e => setForm(f => ({ ...f, bidQualification: { ...(f.bidQualification||{}), [k]: e.target.value } }))}>
                        <option value="">—</option>{BID_QUAL_RATINGS.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                  ))}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: 11 }}>Win Probability %</label>
                    <input type="number" min={0} max={100} value={form.bidQualification?.winProbability ?? ""} onChange={e => setForm(f => ({ ...f, bidQualification: { ...(f.bidQualification||{}), winProbability: e.target.value === "" ? "" : Math.max(0, Math.min(100, +e.target.value)) } }))} placeholder="0–100"/>
                  </div>
                </div>

                {/* Bid / No-Bid / Hold decision */}
                <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Decision:</span>
                  {["Bid", "No Bid", "Hold"].map(d => (
                    <label key={d} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer" }}>
                      <input type="radio" name="bidDecision" checked={form.bidDecision === d} onChange={() => { setForm(f => ({ ...f, bidDecision: d })); setFormErrors(e => ({ ...e, bidDecision: undefined })); }}/>
                      {d}
                    </label>
                  ))}
                  {formErrors.bidDecision && <span style={{ fontSize: 11, color: "#DC2626" }}>{formErrors.bidDecision}</span>}
                </div>
                <div className="form-row full" style={{ marginTop: 8 }}><div className="form-group"><label>Decision Rationale</label><textarea rows={2} value={form.bidDecisionNotes || ""} onChange={e => setForm(f => ({ ...f, bidDecisionNotes: e.target.value }))} placeholder="Why bid / no-bid / hold…" style={{ width: "100%", resize: "vertical" }}/></div></div>

                {/* Approval matrix: Sales Manager → Vertical Head → CEO */}
                <div style={{ marginTop: 8, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "#fff" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Bid Approval</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                      background: form.bidApprovalStatus === "Approved" ? "#DCFCE7" : form.bidApprovalStatus === "Rejected" ? "#FEE2E2" : form.bidApprovalStatus === "Pending" ? "#FEF9C3" : "var(--s2)",
                      color: form.bidApprovalStatus === "Approved" ? "#15803D" : form.bidApprovalStatus === "Rejected" ? "#991B1B" : form.bidApprovalStatus === "Pending" ? "#854D0E" : "var(--text3)" }}>
                      {form.bidApprovalStatus || "Not Submitted"}
                    </span>
                  </div>
                  {(!form.bidApprovalChain || form.bidApprovalChain.length === 0) ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, color: "var(--text3)" }}>
                        {form.bidDecision === "Bid" ? "Submit to route through Sales Manager → Vertical Head → CEO."
                          : form.bidDecision ? `Recorded as ${form.bidDecision}. No multi-tier approval needed.`
                          : "Set a decision, then submit."}
                      </span>
                      <button type="button" className="btn btn-sm btn-primary" style={{ fontSize: 11 }} onClick={submitBidApproval}>
                        {form.bidDecision === "Bid" ? "Submit for Approval" : "Record Decision"}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {form.bidApprovalChain.map((s, i) => {
                          const isCurrent = bidCurrentIdx(form.bidApprovalChain) === i;
                          return (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
                              <span style={{ width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0,
                                background: s.status === "Approved" ? "#22C55E" : s.status === "Rejected" ? "#EF4444" : isCurrent ? "#F59E0B" : "var(--s3)",
                                color: s.status === "Pending" && !isCurrent ? "var(--text3)" : "#fff" }}>{i + 1}</span>
                              <span style={{ fontWeight: 600, minWidth: 110 }}>{s.label}</span>
                              <span style={{ color: s.status === "Approved" ? "#15803D" : s.status === "Rejected" ? "#991B1B" : "var(--text3)" }}>
                                {s.status}{s.by ? ` · ${TEAM_MAP[s.by]?.name || s.by}` : ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {form.bidApprovalStatus === "Pending" && bidCanActNow(form.bidApprovalChain) && (
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                          <button type="button" className="btn btn-sm" style={{ fontSize: 11, background: "#22C55E", color: "#fff", border: "none" }} onClick={() => actBidApproval(true)}>Approve my level</button>
                          <button type="button" className="btn btn-sm" style={{ fontSize: 11, background: "#EF4444", color: "#fff", border: "none" }} onClick={() => actBidApproval(false)}>Reject</button>
                        </div>
                      )}
                      {form.bidApprovalStatus === "Pending" && !bidCanActNow(form.bidApprovalChain) && (
                        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>Awaiting {BID_APPROVAL_MATRIX[bidCurrentIdx(form.bidApprovalChain)]?.label}'s approval.</div>
                      )}
                    </>
                  )}
                </div>

                {/* ── EMD / PBG / Instrument Register (Phase 3) ── */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: "0.05em", margin: "12px 0 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>EMD / PBG / Instrument Register</span>
                  <button type="button" className="btn btn-sec btn-xs" style={{ fontSize: 10 }} onClick={() => addRow("bidInstruments", { type: "EMD / Bid Security", mode: "DD", amount: 0, refNo: "", validTill: "", status: "Pending" })}>+ Add</button>
                </div>
                {(form.bidInstruments || []).length === 0
                  ? <div style={{ fontSize: 11, color: "var(--text3)" }}>No EMD/PBG instruments tracked yet.</div>
                  : (form.bidInstruments || []).map(r => (
                    <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 0.7fr 1fr 1fr 1fr auto", gap: 6, marginBottom: 6, alignItems: "center" }}>
                      <select value={r.type} onChange={e => updRow("bidInstruments", r.id, { type: e.target.value })}>{INSTRUMENT_TYPES.map(t => <option key={t}>{t}</option>)}</select>
                      <select value={r.mode} onChange={e => updRow("bidInstruments", r.id, { mode: e.target.value })}>{INSTRUMENT_MODES.map(t => <option key={t}>{t}</option>)}</select>
                      <input type="number" min={0} value={r.amount} onChange={e => updRow("bidInstruments", r.id, { amount: +e.target.value })} title="₹L" placeholder="₹L"/>
                      <input value={r.refNo} onChange={e => updRow("bidInstruments", r.id, { refNo: e.target.value })} placeholder="Ref / DD no."/>
                      <input type="date" value={r.validTill} onChange={e => updRow("bidInstruments", r.id, { validTill: e.target.value })} title="Valid till"/>
                      <select value={r.status} onChange={e => updRow("bidInstruments", r.id, { status: e.target.value })}>{INSTRUMENT_STATUS.map(t => <option key={t}>{t}</option>)}</select>
                      <button type="button" className="icon-btn" aria-label="Remove" onClick={() => delRow("bidInstruments", r.id)}><Trash2 size={13}/></button>
                    </div>
                  ))}

                {/* ── Pre-Bid Log: queries / clarifications / corrigendum / site visits ── */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: "0.05em", margin: "12px 0 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Pre-Bid Log</span>
                  <button type="button" className="btn btn-sec btn-xs" style={{ fontSize: 10 }} onClick={() => addRow("preBidLog", { type: "Query", date: today, note: "" })}>+ Add</button>
                </div>
                {(form.preBidLog || []).length === 0
                  ? <div style={{ fontSize: 11, color: "var(--text3)" }}>No pre-bid queries, corrigendum or site visits logged.</div>
                  : (form.preBidLog || []).map(r => (
                    <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 3fr auto", gap: 6, marginBottom: 6, alignItems: "center" }}>
                      <select value={r.type} onChange={e => updRow("preBidLog", r.id, { type: e.target.value })}>{PREBID_TYPES.map(t => <option key={t}>{t}</option>)}</select>
                      <input type="date" value={r.date} onChange={e => updRow("preBidLog", r.id, { date: e.target.value })}/>
                      <input value={r.note} onChange={e => updRow("preBidLog", r.id, { note: e.target.value })} placeholder="Query / clarification / MoM / corrigendum detail…"/>
                      <button type="button" className="icon-btn" aria-label="Remove" onClick={() => delRow("preBidLog", r.id)}><Trash2 size={13}/></button>
                    </div>
                  ))}

                {/* ── Tender Document Repository ── */}
                <div style={{ fontSize: 11, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: "0.05em", margin: "12px 0 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Tender Documents</span>
                  <button type="button" className="btn btn-sec btn-xs" style={{ fontSize: 10 }} onClick={() => addRow("tenderDocs", { category: "Technical Bid", name: "", url: "", date: today })}>+ Add</button>
                </div>
                {(form.tenderDocs || []).length === 0
                  ? <div style={{ fontSize: 11, color: "var(--text3)" }}>No documents attached.</div>
                  : (form.tenderDocs || []).map(r => (
                    <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.3fr 1.6fr 1.6fr auto", gap: 6, marginBottom: 6, alignItems: "center" }}>
                      <select value={r.category} onChange={e => updRow("tenderDocs", r.id, { category: e.target.value })}>{TENDER_DOC_CATEGORIES.map(t => <option key={t}>{t}</option>)}</select>
                      <input value={r.name} onChange={e => updRow("tenderDocs", r.id, { name: e.target.value })} placeholder="Document name"/>
                      <input value={r.url} onChange={e => updRow("tenderDocs", r.id, { url: e.target.value })} placeholder="https:// link"/>
                      <button type="button" className="icon-btn" aria-label="Remove" onClick={() => delRow("tenderDocs", r.id)}><Trash2 size={13}/></button>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Win/Loss/Suspend Reasons (conditional) */}
          {form.stage === wonName && (
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
          {form.stage === lostName && (
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
      {confirm && <DeleteWithReasonModal title="Delete Deal" recordLabel={opps.find(o => o.id === confirm)?.title || "this deal"} onConfirm={(meta) => del(confirm, meta)} onCancel={() => setConfirm(null)} />}

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
    </StagesContext.Provider>
  );
}

export default Pipeline;
