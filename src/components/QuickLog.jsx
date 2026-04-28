import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Plus, X, Phone, CheckSquare, FileText, Check, Search, Clock, Calendar } from "lucide-react";
import { CALL_TYPES, CALL_OBJECTIVES, CALL_OUTCOMES, ACT_TYPES, ACT_STATUS, TEAM } from "../data/constants";
import { uid, today, sanitizeObj, hasErrors } from "../utils/helpers";
import { Modal, FormError, TypeaheadSelect } from "./shared";

// ═══════════════════════════════════════════════════════════════════
// QUICK LOG — Universal floating action button + modal
// ═══════════════════════════════════════════════════════════════════

const TASK_TYPES = ["Follow-up Call","Send Document","Internal Review","Demo Setup","Proposal","Meeting","Other"];
const PRIORITIES = ["High","Medium","Low"];
const TASK_STATUSES = ["Open","In Progress"];
const ACTIVITY_STATUSES = ["Planned","Completed"];

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};

const BLANK_CALL = {
  callType:"Telephone Call", objective:"General Followup", callDate:today, callTime:nowTime(),
  duration:15, accountId:"", leadId:"", oppId:"", contactIds:[], participantIds:[],
  notes:"", outcome:"Completed", nextCallDate:"", nextStepDesc:"", createFollowup:false,
  followupTitle:"", followupAssign:"", followupDue:"",
};
const BLANK_TASK = {
  title:"", taskType:"Follow-up Call", priority:"Medium", dueDate:"", assignTo:"",
  accountId:"", oppId:"", contactId:"", description:"", status:"Open",
};
const BLANK_ACTIVITY = {
  type:"Call", title:"", date:today, time:nowTime(), duration:30,
  accountId:"", contactId:"", oppId:"", owner:"", notes:"", status:"Planned",
};

// ── Multi-Select Checkbox List ──────────────────────────────────
function CheckboxList({ items, selected, onChange, labelFn, searchPlaceholder, maxHeight = 150 }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q) return items;
    const lq = q.toLowerCase();
    return items.filter(it => labelFn(it).toLowerCase().includes(lq));
  }, [items, q, labelFn]);

  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };

  return (
    <div>
      {/* Selected pills */}
      {selected.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:6 }}>
          {selected.map(id => {
            const it = items.find(x => x.id === id);
            if (!it) return null;
            return (
              <span key={id} style={{
                display:"inline-flex", alignItems:"center", gap:3, fontSize:11, fontWeight:600,
                background:"var(--brand-bg,#E8F5F0)", color:"var(--brand)", padding:"2px 8px 2px 6px",
                borderRadius:12, border:"1px solid var(--brand)"
              }}>
                {labelFn(it)}
                <X size={10} style={{ cursor:"pointer", marginLeft:2 }} onClick={() => toggle(id)} />
              </span>
            );
          })}
        </div>
      )}
      {/* Search */}
      <div style={{
        display:"flex", alignItems:"center", gap:6, padding:"5px 8px", borderRadius:6,
        border:"1px solid var(--border)", background:"var(--s2)", marginBottom:4
      }}>
        <Search size={12} style={{ color:"var(--text3)", flexShrink:0 }} />
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder={searchPlaceholder || "Search..."}
          style={{ border:"none", background:"transparent", outline:"none", fontSize:12, width:"100%", color:"var(--text)" }}
        />
      </div>
      {/* Checkbox list */}
      <div style={{
        maxHeight, overflowY:"auto", border:"1px solid var(--border)", borderRadius:6,
        background:"white", padding:4
      }}>
        {filtered.length === 0 && (
          <div style={{ fontSize:11, color:"var(--text3)", padding:8, textAlign:"center" }}>No results</div>
        )}
        {filtered.map(it => (
          <label key={it.id} style={{
            display:"flex", alignItems:"center", gap:6, padding:"4px 8px", cursor:"pointer",
            borderRadius:4, fontSize:12, color:"var(--text)"
          }}
            onMouseEnter={e => e.currentTarget.style.background = "var(--s2)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <input type="checkbox" checked={selected.includes(it.id)} onChange={() => toggle(it.id)}
              style={{ accentColor:"var(--brand)" }} />
            <span>{labelFn(it)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Call Form Tab ────────────────────────────────────────────────
function CallForm({ form, setForm, errors, setErrors, accounts, contacts, opps, leads, orgUsers, masters }) {
  const team = orgUsers?.length ? orgUsers.filter(u => u.status !== "Inactive") : TEAM;
  const callTypes = masters?.callTypes?.length ? masters.callTypes : CALL_TYPES;
  const callSubjects = masters?.callSubjects?.length ? masters.callSubjects : CALL_OBJECTIVES;

  const filteredContacts = useMemo(() =>
    form.accountId ? contacts.filter(c => c.accountId === form.accountId) : contacts,
  [contacts, form.accountId]);
  const filteredLeads = useMemo(() =>
    form.accountId ? leads.filter(l => l.accountId === form.accountId) : leads,
  [leads, form.accountId]);
  const filteredOpps = useMemo(() =>
    form.accountId ? opps.filter(o => o.accountId === form.accountId) : opps,
  [opps, form.accountId]);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: undefined })); };
  const acctName = accounts.find(a => a.id === form.accountId)?.name || "";

  return (
    <div>
      <div className="form-row">
        <div className="form-group"><label>Call Type</label>
          <select value={form.callType} onChange={e => set("callType", e.target.value)}>
            {callTypes.map(t => { const v = typeof t === "object" ? t.name : t; return <option key={v} value={v}>{v}</option>; })}
          </select>
        </div>
        <div className="form-group"><label>Call Subject</label>
          <select value={form.objective} onChange={e => set("objective", e.target.value)}>
            {callSubjects.map(o => { const v = typeof o === "object" ? o.name : o; return <option key={v} value={v}>{v}</option>; })}
          </select>
        </div>
      </div>
      <div className="form-row three">
        <div className="form-group"><label>Date *</label>
          <input type="date" value={form.callDate} onChange={e => set("callDate", e.target.value)}
            style={errors.callDate ? { borderColor:"#DC2626" } : {}} />
          <FormError error={errors.callDate} />
        </div>
        <div className="form-group"><label>Time</label>
          <input type="time" value={form.callTime} onChange={e => set("callTime", e.target.value)} />
        </div>
        <div className="form-group"><label>Duration (min)</label>
          <input type="number" min={0} step={5} value={form.duration}
            onChange={e => set("duration", +e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Company / Account</label>
          <TypeaheadSelect
            value={form.accountId}
            onChange={(id) => set("accountId", id)}
            options={accounts.map(a => ({ value: a.id, label: a.name, sub: a.country || a.type || "" }))}
            placeholder="Search accounts…"
          />
        </div>
        <div className="form-group"><label>Lead</label>
          <TypeaheadSelect
            value={form.leadId}
            onChange={(id) => set("leadId", id)}
            options={filteredLeads.map(l => ({ value: l.id, label: l.company || l.contact || l.id, sub: l.contact || "" }))}
            placeholder="Search leads…"
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Opportunity</label>
          <TypeaheadSelect
            value={form.oppId}
            onChange={(id) => set("oppId", id)}
            options={filteredOpps.map(o => ({ value: o.id, label: o.title }))}
            placeholder="Search opportunities…"
          />
        </div>
        <div className="form-group"><label>Outcome</label>
          <select value={form.outcome} onChange={e => set("outcome", e.target.value)}>
            {CALL_OUTCOMES.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
      </div>

      {/* Multi-select contacts */}
      <div className="form-group" style={{ marginBottom:12 }}>
        <label>Contacts</label>
        <CheckboxList
          items={filteredContacts}
          selected={form.contactIds}
          onChange={v => set("contactIds", v)}
          labelFn={c => `${c.name}${c.designation ? ` (${c.designation})` : ""}${c.accountId ? `, ${accounts.find(a=>a.id===c.accountId)?.name||""}` : ""}`}
          searchPlaceholder="Search contacts..."
        />
      </div>

      {/* Multi-select our participants */}
      <div className="form-group" style={{ marginBottom:12 }}>
        <label>Our Participants</label>
        <CheckboxList
          items={team}
          selected={form.participantIds}
          onChange={v => set("participantIds", v)}
          labelFn={u => `${u.name}${u.role ? ` (${u.role})` : ""}`}
          searchPlaceholder="Search team members..."
        />
      </div>

      <div className="form-group">
        <label>Discussion Notes * <span style={{ fontSize:10, color:"var(--text3)", fontWeight:400 }}>(min 10 chars)</span></label>
        <textarea rows={3} value={form.notes}
          onChange={e => set("notes", e.target.value)}
          placeholder="Discussion summary, objections, decisions, and next steps..."
          style={{ ...(errors.notes ? { borderColor:"#DC2626" } : {}), width:"100%", resize:"vertical" }} />
        <FormError error={errors.notes} />
      </div>

      <div className="form-row">
        <div className="form-group"><label>Next Step / Follow-up Date</label>
          <input type="date" value={form.nextCallDate} onChange={e => set("nextCallDate", e.target.value)} />
        </div>
        <div className="form-group"><label>Next Step Description</label>
          <input value={form.nextStepDesc} onChange={e => set("nextStepDesc", e.target.value)}
            placeholder="e.g. Send proposal, Schedule demo..." />
        </div>
      </div>

      {/* Create follow-up task */}
      <div style={{
        marginTop:10, padding:12, borderRadius:8, border:"1px solid var(--border)",
        background:"var(--s2)"
      }}>
        <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer", fontSize:13, fontWeight:600 }}>
          <input type="checkbox" checked={form.createFollowup}
            onChange={e => set("createFollowup", e.target.checked)}
            style={{ accentColor:"var(--brand)" }} />
          Create Follow-up Task
        </label>
        {form.createFollowup && (
          <div style={{ marginTop:10 }}>
            <div className="form-row">
              <div className="form-group"><label>Task Title</label>
                <input value={form.followupTitle || `Follow-up: ${acctName}`}
                  onChange={e => set("followupTitle", e.target.value)}
                  placeholder="Follow-up task title" />
              </div>
              <div className="form-group"><label>Assign To</label>
                <TypeaheadSelect
                  value={form.followupAssign}
                  onChange={(id) => set("followupAssign", id)}
                  options={team.map(u => ({ value: u.id, label: u.name, sub: u.role }))}
                  placeholder="Search team…"
                />
              </div>
            </div>
            <div className="form-group"><label>Due Date</label>
              <input type="date" value={form.followupDue || form.nextCallDate}
                onChange={e => set("followupDue", e.target.value)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Task Form Tab ───────────────────────────────────────────────
function TaskForm({ form, setForm, errors, setErrors, accounts, contacts, opps, orgUsers }) {
  const team = orgUsers?.length ? orgUsers.filter(u => u.status !== "Inactive") : TEAM;
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: undefined })); };

  return (
    <div>
      <div className="form-group">
        <label>Title *</label>
        <input value={form.title} onChange={e => set("title", e.target.value)}
          placeholder="Task title" style={errors.title ? { borderColor:"#DC2626" } : {}} />
        <FormError error={errors.title} />
      </div>
      <div className="form-row three">
        <div className="form-group"><label>Type</label>
          <select value={form.taskType} onChange={e => set("taskType", e.target.value)}>
            {TASK_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Priority</label>
          <select value={form.priority} onChange={e => set("priority", e.target.value)}>
            {PRIORITIES.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Status</label>
          <select value={form.status} onChange={e => set("status", e.target.value)}>
            {TASK_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Due Date *</label>
          <input type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)}
            style={errors.dueDate ? { borderColor:"#DC2626" } : {}} />
          <FormError error={errors.dueDate} />
        </div>
        <div className="form-group"><label>Assign To</label>
          <TypeaheadSelect
            value={form.assignTo}
            onChange={(id) => set("assignTo", id)}
            options={team.map(u => ({ value: u.id, label: u.name, sub: u.role }))}
            placeholder="Search team…"
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Related Account</label>
          <TypeaheadSelect
            value={form.accountId}
            onChange={(id) => set("accountId", id)}
            options={accounts.map(a => ({ value: a.id, label: a.name, sub: a.country || a.type || "" }))}
            placeholder="Search accounts…"
          />
        </div>
        <div className="form-group"><label>Related Opportunity</label>
          <TypeaheadSelect
            value={form.oppId}
            onChange={(id) => set("oppId", id)}
            options={(form.accountId ? opps.filter(o => o.accountId === form.accountId) : opps).map(o => ({ value: o.id, label: o.title }))}
            placeholder="Search opportunities…"
          />
        </div>
      </div>
      <div className="form-group"><label>Related Contact</label>
        <select value={form.contactId} onChange={e => set("contactId", e.target.value)}>
          <option value="">-- None --</option>
          {(form.accountId ? contacts.filter(c => c.accountId === form.accountId) : contacts).map(c =>
            <option key={c.id} value={c.id}>{c.name}</option>
          )}
        </select>
      </div>
      <div className="form-group">
        <label>Description</label>
        <textarea rows={3} value={form.description} onChange={e => set("description", e.target.value)}
          placeholder="Task details..." style={{ width:"100%", resize:"vertical" }} />
      </div>
    </div>
  );
}

// ── Activity Form Tab ───────────────────────────────────────────
function ActivityForm({ form, setForm, errors, setErrors, accounts, contacts, opps, orgUsers, masters }) {
  const team = orgUsers?.length ? orgUsers.filter(u => u.status !== "Inactive") : TEAM;
  const actTypes = masters?.actTypes?.length ? masters.actTypes : ACT_TYPES;
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: undefined })); };

  return (
    <div>
      <div className="form-row">
        <div className="form-group"><label>Type</label>
          <select value={form.type} onChange={e => set("type", e.target.value)}>
            {actTypes.map(t => { const v = typeof t === "object" ? t.name : t; return <option key={v} value={v}>{v}</option>; })}
          </select>
        </div>
        <div className="form-group"><label>Title *</label>
          <input value={form.title} onChange={e => set("title", e.target.value)}
            placeholder="Activity title" style={errors.title ? { borderColor:"#DC2626" } : {}} />
          <FormError error={errors.title} />
        </div>
      </div>
      <div className="form-row three">
        <div className="form-group"><label>Date *</label>
          <input type="date" value={form.date} onChange={e => set("date", e.target.value)}
            style={errors.date ? { borderColor:"#DC2626" } : {}} />
          <FormError error={errors.date} />
        </div>
        <div className="form-group"><label>Time</label>
          <input type="time" value={form.time} onChange={e => set("time", e.target.value)} />
        </div>
        <div className="form-group"><label>Duration (min)</label>
          <input type="number" min={0} step={5} value={form.duration}
            onChange={e => set("duration", +e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Account</label>
          <TypeaheadSelect
            value={form.accountId}
            onChange={(id) => set("accountId", id)}
            options={accounts.map(a => ({ value: a.id, label: a.name, sub: a.country || a.type || "" }))}
            placeholder="Search accounts…"
          />
        </div>
        <div className="form-group"><label>Contact</label>
          <TypeaheadSelect
            value={form.contactId}
            onChange={(id) => set("contactId", id)}
            options={(form.accountId ? contacts.filter(c => c.accountId === form.accountId) : contacts).map(c => ({ value: c.id, label: c.name, sub: c.designation || c.role || "" }))}
            placeholder="Search contacts…"
          />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Opportunity</label>
          <TypeaheadSelect
            value={form.oppId}
            onChange={(id) => set("oppId", id)}
            options={(form.accountId ? opps.filter(o => o.accountId === form.accountId) : opps).map(o => ({ value: o.id, label: o.title }))}
            placeholder="Search opportunities…"
          />
        </div>
        <div className="form-group"><label>Owner / Assignee</label>
          <TypeaheadSelect
            value={form.owner}
            onChange={(id) => set("owner", id)}
            options={team.map(u => ({ value: u.id, label: u.name, sub: u.role }))}
            placeholder="Search team…"
          />
        </div>
      </div>
      <div className="form-group">
        <label>Notes</label>
        <textarea rows={3} value={form.notes} onChange={e => set("notes", e.target.value)}
          placeholder="Activity notes..." style={{ width:"100%", resize:"vertical" }} />
      </div>
      <div className="form-group"><label>Status</label>
        <select value={form.status} onChange={e => set("status", e.target.value)}>
          {ACTIVITY_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════
const validateCall = (f) => {
  const errs = {};
  if (!f.callDate) errs.callDate = "Call date is required";
  if (!f.notes?.trim()) errs.notes = "Discussion notes are required";
  else if (f.notes.trim().length < 10) errs.notes = "Notes must be at least 10 characters";
  return errs;
};
const validateTask = (f) => {
  const errs = {};
  if (!f.title?.trim()) errs.title = "Task title is required";
  if (!f.dueDate) errs.dueDate = "Due date is required";
  return errs;
};
const validateActivityForm = (f) => {
  const errs = {};
  if (!f.title?.trim()) errs.title = "Activity title is required";
  if (!f.date) errs.date = "Date is required";
  return errs;
};

// ═══════════════════════════════════════════════════════════════════
// SPEED DIAL OPTIONS
// ═══════════════════════════════════════════════════════════════════
const DIAL_OPTIONS = [
  { key:"call",     icon:<Phone size={16}/>,       label:"Log Call",                emoji:"\uD83D\uDCDE" },
  { key:"task",     icon:<CheckSquare size={16}/>,  label:"Log Task",                emoji:"\u2705" },
  { key:"activity", icon:<FileText size={16}/>,     label:"Log Activity/Interaction", emoji:"\uD83D\uDCDD" },
];

const TABS = [
  { key:"call",     label:"Call" },
  { key:"task",     label:"Task" },
  { key:"activity", label:"Activity" },
];

// ═══════════════════════════════════════════════════════════════════
// MAIN: QuickLogFAB
// ═══════════════════════════════════════════════════════════════════
export default function QuickLogFAB({
  accounts = [], contacts = [], opps = [], leads = [], orgUsers = [], currentUser,
  callReports, setCallReports, activities, setActivities, masters, onClose,
}) {
  const [open, setOpen] = useState(false);        // speed-dial open
  const [mode, setMode] = useState(null);          // 'call' | 'task' | 'activity'
  const [tab, setTab] = useState("call");
  const [callForm, setCallForm] = useState({ ...BLANK_CALL });
  const [taskForm, setTaskForm] = useState({ ...BLANK_TASK, assignTo: currentUser });
  const [actForm, setActForm] = useState({ ...BLANK_ACTIVITY, owner: currentUser });
  const [errors, setErrors] = useState({});
  const fabRef = useRef(null);

  // ── Draggable FAB position ────────────────────────────────────────
  // Users complained the bottom-right FAB sometimes covered row icons
  // (edit / delete / etc.) — visible in the AMS catalog screenshot
  // where the green + button sits over the Consol AMS row's actions.
  // Solution: let the user drag the FAB anywhere on the screen.
  //
  // Behaviour:
  //   - Position persists across reloads via localStorage
  //   - Drag is movement-threshold-based (>5px from mousedown) so a
  //     plain click still opens the speed dial as before
  //   - Position is clamped to the viewport on every move + on window
  //     resize so the button can never get stranded off-screen
  //   - Double-click resets the FAB back to its default bottom-right
  //     dock position (clears the saved override)
  //
  // pos === null   → default bottom:24, right:24 (CSS anchored)
  // pos === {l,t}  → fixed top/left in pixels
  const [pos, setPos] = useState(() => {
    try {
      const saved = localStorage.getItem("smartcrm.fabPos");
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (typeof parsed?.left === "number" && typeof parsed?.top === "number") return parsed;
    } catch { /* invalid JSON — ignore */ }
    return null;
  });
  const dragStateRef = useRef(null);
  // Tracks whether the most recent pointer interaction was a drag, so
  // the click handler can suppress the speed-dial toggle when the user
  // intended to move (not click). Reset on next pointerdown.
  const justDraggedRef = useRef(false);

  // Clamp helper — keeps the 56x56 FAB fully visible with an 8px margin.
  const clampPos = (p) => {
    const W = window.innerWidth, H = window.innerHeight;
    return {
      left: Math.max(8, Math.min(W - 64, p.left)),
      top:  Math.max(8, Math.min(H - 64, p.top)),
    };
  };

  // Re-clamp if window shrinks below the saved position.
  useEffect(() => {
    if (!pos) return;
    const onResize = () => setPos(prev => prev ? clampPos(prev) : prev);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos]);

  const onFabPointerDown = (e) => {
    // Don't start a drag from the speed-dial child buttons or backdrop.
    if (e.target.closest("[data-fab-dial-child]")) return;
    // Only drag with primary button (left mouse / touch).
    if (e.button != null && e.button !== 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    dragStateRef.current = {
      startX: e.clientX, startY: e.clientY,
      originLeft: rect.left, originTop: rect.top,
      dragging: false,
    };
    justDraggedRef.current = false;

    const onMove = (ev) => {
      const s = dragStateRef.current;
      if (!s) return;
      const dx = ev.clientX - s.startX;
      const dy = ev.clientY - s.startY;
      if (!s.dragging && Math.hypot(dx, dy) < 5) return;
      s.dragging = true;
      ev.preventDefault();
      setPos(clampPos({ left: s.originLeft + dx, top: s.originTop + dy }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const s = dragStateRef.current;
      dragStateRef.current = null;
      if (s?.dragging) {
        justDraggedRef.current = true;
        // Persist the latest position. setPos may have already run, but
        // we re-read from React via a callback to be sure we save the
        // committed value, not the closure's stale snapshot.
        setPos(p => {
          if (p) {
            try { localStorage.setItem("smartcrm.fabPos", JSON.stringify(p)); } catch {}
          }
          return p;
        });
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Double-click on the FAB resets it back to the default bottom-right
  // dock and clears the saved override. Useful if a user drags the
  // button somewhere awkward and wants to undo without finger-precision.
  const onFabDoubleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPos(null);
    try { localStorage.removeItem("smartcrm.fabPos"); } catch {}
  };

  // Close speed-dial on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (fabRef.current && !fabRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const openMode = (m) => {
    setMode(m);
    setTab(m);
    setOpen(false);
    setErrors({});
    // Reset forms
    setCallForm({ ...BLANK_CALL, callTime: nowTime() });
    setTaskForm({ ...BLANK_TASK, assignTo: currentUser });
    setActForm({ ...BLANK_ACTIVITY, owner: currentUser, date: today, time: nowTime() });
  };

  const closeModal = () => {
    setMode(null);
    setErrors({});
    onClose?.();
  };

  const save = () => {
    if (tab === "call") {
      const errs = validateCall(callForm);
      if (hasErrors(errs)) { setErrors(errs); return; }
      const clean = sanitizeObj(callForm);
      const callReport = {
        id: `cr${uid()}`,
        leadName: "",
        company: accounts.find(a => a.id === clean.accountId)?.name || "",
        marketingPerson: currentUser,
        leadStage: "MQL",
        callType: clean.callType,
        product: "",
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
        leadId: clean.leadId,
        nextStepDesc: clean.nextStepDesc,
      };
      setCallReports(p => [...p, callReport]);

      // Create follow-up task as activity if checked
      if (clean.createFollowup) {
        const acctName = accounts.find(a => a.id === clean.accountId)?.name || "";
        const followup = {
          id: `act${uid()}`,
          title: clean.followupTitle || `Follow-up: ${acctName}`,
          type: "Call",
          status: "Planned",
          date: clean.followupDue || clean.nextCallDate || today,
          time: "",
          duration: 30,
          accountId: clean.accountId,
          contactId: clean.contactIds?.[0] || "",
          oppId: clean.oppId,
          owner: clean.followupAssign || currentUser,
          notes: `Follow-up from call on ${clean.callDate}. ${clean.nextStepDesc || ""}`.trim(),
          outcome: "",
          files: [],
        };
        setActivities(p => [...p, followup]);
      }
    } else if (tab === "task") {
      const errs = validateTask(taskForm);
      if (hasErrors(errs)) { setErrors(errs); return; }
      const clean = sanitizeObj(taskForm);
      const activity = {
        id: `act${uid()}`,
        title: clean.title,
        type: clean.taskType === "Follow-up Call" ? "Call" :
              clean.taskType === "Demo Setup" ? "Demo" :
              clean.taskType === "Meeting" ? "Meeting" : "Call",
        status: "Planned",
        date: clean.dueDate,
        time: "",
        duration: 30,
        accountId: clean.accountId,
        contactId: clean.contactId,
        oppId: clean.oppId,
        owner: clean.assignTo || currentUser,
        notes: clean.description,
        outcome: "",
        files: [],
        priority: clean.priority,
        taskType: clean.taskType,
        taskStatus: clean.status,
      };
      setActivities(p => [...p, activity]);
    } else if (tab === "activity") {
      const errs = validateActivityForm(actForm);
      if (hasErrors(errs)) { setErrors(errs); return; }
      const clean = sanitizeObj(actForm);
      const activity = {
        id: `act${uid()}`,
        title: clean.title,
        type: clean.type,
        status: clean.status,
        date: clean.date,
        time: clean.time,
        duration: clean.duration,
        accountId: clean.accountId,
        contactId: clean.contactId,
        oppId: clean.oppId,
        owner: clean.owner || currentUser,
        notes: clean.notes,
        outcome: "",
        files: [],
      };
      setActivities(p => [...p, activity]);
    }
    closeModal();
  };

  // ── FAB Styles ──
  // Cursor is `grab` so the user discovers it's draggable. When pos !== null
  // we honour the saved position; otherwise we fall back to the default
  // bottom-right dock via `bottom`/`right` shorthand. The transition is
  // disabled while dragging so the FAB tracks the cursor 1:1.
  const fabStyle = {
    position:"fixed", zIndex:9999,
    width:56, height:56, borderRadius:"50%", border:"none",
    cursor: dragStateRef.current?.dragging ? "grabbing" : "grab",
    background:"var(--brand,#1B4D3E)", color:"white", display:"flex", alignItems:"center", justifyContent:"center",
    boxShadow:"0 4px 14px rgba(27,77,62,0.4)",
    transition: dragStateRef.current?.dragging ? "none" : "transform 0.2s, box-shadow 0.2s",
    fontSize:28, fontWeight:300, lineHeight:1,
    touchAction:"none",   // prevent mobile scroll while dragging the FAB
  };
  const fabHoverStyle = open
    ? { transform:"rotate(45deg)", boxShadow:"0 6px 20px rgba(27,77,62,0.5)" }
    : {};

  const dialStyle = (i) => ({
    position:"absolute", bottom: 68 + i * 52, right:0,
    display:"flex", alignItems:"center", gap:10,
    opacity: open ? 1 : 0,
    transform: open ? "scale(1) translateY(0)" : "scale(0.5) translateY(10px)",
    transition:`all 0.2s ease ${i * 0.05}s`,
    pointerEvents: open ? "auto" : "none",
  });

  const dialBtnStyle = {
    width:44, height:44, borderRadius:"50%", border:"none", cursor:"pointer",
    background:"white", color:"var(--brand,#1B4D3E)", display:"flex", alignItems:"center", justifyContent:"center",
    boxShadow:"0 2px 10px rgba(0,0,0,0.15)", transition:"transform 0.15s, background 0.15s",
  };

  const dialLabelStyle = {
    background:"var(--brand,#1B4D3E)", color:"white", fontSize:12, fontWeight:600,
    padding:"5px 12px", borderRadius:6, whiteSpace:"nowrap",
    boxShadow:"0 2px 8px rgba(0,0,0,0.12)",
  };

  // ── Tab Styles ──
  const tabStyle = (active) => ({
    padding:"8px 20px", cursor:"pointer", fontSize:13, fontWeight:active ? 700 : 500,
    color: active ? "var(--brand,#1B4D3E)" : "var(--text3,#94A3B8)",
    borderBottom: active ? "2px solid var(--brand,#1B4D3E)" : "2px solid transparent",
    transition:"all 0.15s",
  });

  return (
    <>
      {/* FAB + Speed Dial — hide when modal is open.
          Container uses `pos` (top/left in px) when the user has dragged
          it, otherwise the default bottom-right dock anchor. */}
      {!mode && <div
        ref={fabRef}
        style={pos
          ? { position:"fixed", top: pos.top, left: pos.left, zIndex:9999 }
          : { position:"fixed", bottom:24, right:24, zIndex:9999 }}
      >
        {/* Backdrop when speed dial open */}
        {open && (
          <div style={{
            position:"fixed", inset:0, background:"rgba(0,0,0,0.08)", zIndex:-1
          }} onClick={() => setOpen(false)} />
        )}

        {/* Speed dial options.
            data-fab-dial-child marks them as "don't start a drag from
            here" — the pointerdown handler ignores events on these
            child buttons so the user can still tap them normally. */}
        {DIAL_OPTIONS.map((opt, i) => (
          <div key={opt.key} style={dialStyle(i)} data-fab-dial-child>
            <span style={dialLabelStyle} data-fab-dial-child>{opt.emoji} {opt.label}</span>
            <button
              data-fab-dial-child
              style={dialBtnStyle}
              onClick={() => openMode(opt.key)}
              onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.background = "var(--brand-bg,#E8F5F0)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.background = "white"; }}
            >
              {opt.icon}
            </button>
          </div>
        ))}

        {/* Main FAB button.
            onPointerDown starts the threshold-based drag. If the pointer
            moves >5px before release, justDraggedRef is set true and the
            click handler short-circuits so the speed dial doesn't toggle
            after a drag. Double-click resets to default position. */}
        <button
          style={{ ...fabStyle, ...fabHoverStyle }}
          onPointerDown={onFabPointerDown}
          onClick={() => {
            if (justDraggedRef.current) {
              justDraggedRef.current = false;
              return;
            }
            setOpen(o => !o);
          }}
          onDoubleClick={onFabDoubleClick}
          onMouseEnter={e => { if (!open && !dragStateRef.current?.dragging) e.currentTarget.style.transform = "scale(1.08)"; }}
          onMouseLeave={e => { if (!open && !dragStateRef.current?.dragging) e.currentTarget.style.transform = "scale(1)"; }}
          aria-label="Quick Log (drag to move, double-click to reset position)"
          title="Drag to move · double-click to reset"
        >
          <Plus size={26} style={{ transition:"transform 0.2s" }} />
        </button>
      </div>}

      {/* Modal */}
      {mode && (
        <Modal title="Quick Log" onClose={closeModal} lg
          footer={<>
            <button className="btn btn-sec" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" onClick={save}><Check size={14} />Save</button>
          </>}
        >
          {/* Tabs */}
          <div style={{
            display:"flex", borderBottom:"1px solid var(--border,#E2E8F0)", marginBottom:16, gap:0
          }}>
            {TABS.map(t => (
              <div key={t.key} style={tabStyle(tab === t.key)} onClick={() => { setTab(t.key); setErrors({}); }}>
                {t.label}
              </div>
            ))}
          </div>

          {/* Tab content */}
          {tab === "call" && (
            <CallForm
              form={callForm} setForm={setCallForm} errors={errors} setErrors={setErrors}
              accounts={accounts} contacts={contacts} opps={opps} leads={leads}
              orgUsers={orgUsers} masters={masters}
            />
          )}
          {tab === "task" && (
            <TaskForm
              form={taskForm} setForm={setTaskForm} errors={errors} setErrors={setErrors}
              accounts={accounts} contacts={contacts} opps={opps} orgUsers={orgUsers}
            />
          )}
          {tab === "activity" && (
            <ActivityForm
              form={actForm} setForm={setActForm} errors={errors} setErrors={setErrors}
              accounts={accounts} contacts={contacts} opps={opps} orgUsers={orgUsers} masters={masters}
            />
          )}
        </Modal>
      )}
    </>
  );
}
