import { useState, useMemo } from "react";
import { Plus, Search, Edit2, Trash2, Check, Briefcase, AlertTriangle, TrendingUp, Calendar, CheckCircle2 } from "lucide-react";
import { PROJECT_PHASES, PROJECT_TEAM_ROLES, TEAM, TEAM_MAP, PROD_MAP } from "../data/constants";
import { BLANK_PROJECT } from "../data/seed";
import { uid, fmt, today, sanitizeObj, hasErrors, softDeleteById } from "../utils/helpers";
import { Modal, Confirm, Empty, FormError, UserPill, StatusBadge, TypeaheadSelect, PageTip } from "./shared";
import Pagination, { usePagination } from "./Pagination";

const PHASE_COL = {
  "Requirement Gathering":"#3B82F6","Gap Analysis":"#6366F1","Design":"#8B5CF6",
  "Development":"#F59E0B","UAT":"#0D9488","Go-Live":"#22C55E","Hypercare":"#16A34A",
  "Closed":"#64748B","On Hold":"#EF4444",
};
// Project team roles are Masters-driven (Masters → Support → Project Team Roles);
// aliased to the live constant array that registerMasters() splices in place.
const TEAM_ROLES = PROJECT_TEAM_ROLES;
const MS_STATUS = ["Pending","In Progress","Done","Delayed"]; // fixed workflow enum

// Health from progress vs go-live target
const projectHealth = (p) => {
  if (p.status === "Closed") return { label: "Completed", color: "#16A34A" };
  if (p.status === "On Hold") return { label: "On Hold", color: "#EF4444" };
  if (p.goLiveTarget && p.goLiveTarget < today && (p.progress || 0) < 100) return { label: "Delayed", color: "#DC2626" };
  // At risk: target within 30 days but progress lagging
  if (p.goLiveTarget) {
    const days = Math.round((new Date(p.goLiveTarget) - new Date(today)) / 864e5);
    if (days >= 0 && days <= 30 && (p.progress || 0) < 70) return { label: "At Risk", color: "#F59E0B" };
  }
  return { label: "On Track", color: "#16A34A" };
};

function Projects({ projects, setProjects, accounts, opps = [], contracts = [], currentUser, orgUsers, canDelete, catalog = [] }) {
  const team = orgUsers?.length ? orgUsers.filter(u => u.status !== "Inactive") : TEAM;
  const [statusF, setStatusF] = useState("All");
  const [ownerF, setOwnerF] = useState("All");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK_PROJECT);
  const [formErrors, setFormErrors] = useState({});
  const [confirm, setConfirm] = useState(null);

  const enriched = useMemo(() => projects.filter(p => !p.isDeleted).map(p => ({
    ...p,
    _accName: accounts.find(a => a.id === p.accountId)?.name || "—",
    _health: projectHealth(p),
  })), [projects, accounts]);

  const filtered = useMemo(() => enriched.filter(p => {
    if (statusF !== "All" && p.status !== statusF) return false;
    if (ownerF !== "All" && p.owner !== ownerF) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!((p.name || "") + (p._accName || "") + (p.projectNo || "")).toLowerCase().includes(q)) return false;
    }
    return true;
  }).sort((a, b) => (b.createdDate || "").localeCompare(a.createdDate || "")), [enriched, statusF, ownerF, search]);

  const pg = usePagination(filtered);

  // KPIs
  const active = enriched.filter(p => !["Closed"].includes(p.status));
  const delayed = enriched.filter(p => p._health.label === "Delayed").length;
  const atRisk = enriched.filter(p => p._health.label === "At Risk").length;
  const avgProgress = active.length ? Math.round(active.reduce((s, p) => s + (+p.progress || 0), 0) / active.length) : 0;

  const nextProjectNo = () => {
    const yr = new Date(today).getFullYear();
    const n = projects.reduce((m, p) => { const x = p.projectNo?.match(/PRJ-\d{4}-(\d+)/); return x ? Math.max(m, +x[1]) : m; }, 0) + 1;
    return `PRJ-${yr}-${String(n).padStart(3, "0")}`;
  };
  const openAdd = () => { setForm({ ...BLANK_PROJECT, id: `prj${uid()}`, projectNo: nextProjectNo(), owner: currentUser || "u1", startDate: today, createdDate: today, milestones: [], team: [] }); setFormErrors({}); setModal({ mode: "add" }); };
  const openEdit = (p) => { setForm({ ...p, milestones: [...(p.milestones || [])], team: [...(p.team || [])] }); setFormErrors({}); setModal({ mode: "edit" }); };
  const save = () => {
    const errs = {};
    if (!form.name?.trim()) errs.name = "Project name is required";
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    const clean = sanitizeObj(form);
    if (modal.mode === "add") setProjects(p => [...p, { ...clean }]);
    else setProjects(p => p.map(x => x.id === clean.id ? { ...clean } : x));
    setModal(null); setFormErrors({});
  };
  const del = (id) => { setProjects(p => softDeleteById(p, id, currentUser)); setConfirm(null); };

  // milestone / team row helpers
  const addMs = () => setForm(f => ({ ...f, milestones: [...(f.milestones || []), { id: `m${Date.now()}`, name: "", due: "", status: "Pending" }] }));
  const updMs = (id, patch) => setForm(f => ({ ...f, milestones: (f.milestones || []).map(m => m.id === id ? { ...m, ...patch } : m) }));
  const delMs = (id) => setForm(f => ({ ...f, milestones: (f.milestones || []).filter(m => m.id !== id) }));
  const addTm = () => setForm(f => ({ ...f, team: [...(f.team || []), { userId: "", role: "Developer" }] }));
  const updTm = (i, patch) => setForm(f => ({ ...f, team: (f.team || []).map((t, j) => j === i ? { ...t, ...patch } : t) }));
  const delTm = (i) => setForm(f => ({ ...f, team: (f.team || []).filter((_, j) => j !== i) }));

  const KPI = ({ label, value, sub, color }) => (
    <div style={{ background: "#1B6B5A", borderRadius: 10, padding: "12px 16px", color: "white", flex: 1 }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Outfit',sans-serif", marginTop: 2, color: color || "white" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, opacity: 0.75 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <PageTip id="projects-tip-v1" title="Projects:" text="Delivery projects are auto-created when a deal/tender is Won. Track phase, progress, milestones and go-live here. Update progress as the project moves from Requirements → UAT → Go-Live → Hypercare." />
      <div className="pg-head">
        <div>
          <div className="pg-title">Projects</div>
          <div className="pg-sub">{enriched.length} total · {active.length} active{delayed > 0 ? ` · ${delayed} delayed` : ""}</div>
        </div>
        <div className="pg-actions">
          <button className="btn btn-primary" onClick={openAdd}><Plus size={14}/>New Project</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <KPI label="Active Projects" value={active.length} sub="In delivery" />
        <KPI label="Avg Progress" value={`${avgProgress}%`} sub="Across active" />
        <KPI label="Delayed" value={delayed} sub="Past go-live target" color={delayed > 0 ? "#FCA5A5" : "white"} />
        <KPI label="At Risk" value={atRisk} sub="Tight timeline" color={atRisk > 0 ? "#FDE68A" : "white"} />
      </div>

      {/* Filters */}
      <div className="filter-bar" style={{ flexWrap: "wrap" }}>
        <div className="filter-search" style={{ maxWidth: 260 }}><Search size={14} style={{ color: "var(--text3)", flexShrink: 0 }}/><input placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)}/></div>
        <select className="filter-select" value={statusF} onChange={e => setStatusF(e.target.value)}><option>All</option>{PROJECT_PHASES.map(s => <option key={s}>{s}</option>)}</select>
        <TypeaheadSelect size="filter" allowAll allLabel="All Owners" placeholder="Search owners…" value={ownerF} onChange={setOwnerF} options={team.map(u => ({ value: u.id, label: u.name, sub: u.role }))}/>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {filtered.length === 0 ? <Empty icon={<Briefcase size={22}/>} title="No projects yet" sub="Projects are created automatically when a deal is Won, or add one manually."/> : (
          <table className="tbl tbl-dense">
            <thead><tr><th>Project</th><th>Account</th><th>Phase</th><th>Progress</th><th>Health</th><th>Go-Live Target</th><th>Owner</th><th></th></tr></thead>
            <tbody>{pg.paged.map(p => (
              <tr key={p.id}>
                <td>
                  <span className="tbl-link" style={{ fontWeight: 600 }} onClick={() => openEdit(p)}>{p.name}</span>
                  {p.projectNo && <div style={{ fontSize: 10, fontFamily: "'Courier New',monospace", color: "var(--text3)" }}>{p.projectNo}</div>}
                </td>
                <td style={{ fontSize: 12 }}>{p._accName}</td>
                <td><span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: (PHASE_COL[p.status] || "#64748B") + "18", color: PHASE_COL[p.status] || "#64748B" }}>{p.status}</span></td>
                <td style={{ minWidth: 110 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, height: 6, background: "var(--s3)", borderRadius: 3, overflow: "hidden", minWidth: 50 }}>
                      <div style={{ width: `${Math.min(100, +p.progress || 0)}%`, height: "100%", background: (+p.progress || 0) >= 100 ? "#22C55E" : "#1B6B5A" }}/>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, minWidth: 30 }}>{+p.progress || 0}%</span>
                  </div>
                </td>
                <td><span style={{ fontSize: 11, fontWeight: 600, color: p._health.color }}>{p._health.label}</span></td>
                <td style={{ fontSize: 12, color: p._health.label === "Delayed" ? "#DC2626" : "var(--text3)" }}>{p.goLiveTarget ? fmt.short(p.goLiveTarget) : "—"}</td>
                <td><UserPill uid={p.owner}/></td>
                <td><div style={{ display: "flex", gap: 4 }}>
                  <button className="icon-btn" aria-label="Edit" onClick={() => openEdit(p)}><Edit2 size={14}/></button>
                  {canDelete && <button className="icon-btn" aria-label="Delete" onClick={() => setConfirm(p.id)}><Trash2 size={14}/></button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <Pagination {...pg}/>
      </div>

      {modal && (
        <Modal title={modal.mode === "add" ? "New Project" : "Edit Project"} onClose={() => { setModal(null); setFormErrors({}); }} size="xl"
          footer={<><button className="btn btn-sec" onClick={() => { setModal(null); setFormErrors({}); }}>Cancel</button><button className="btn btn-primary" onClick={save}><Check size={14}/>Save Project</button></>}>
          {form.projectNo && <div style={{ display: "flex", gap: 10, marginBottom: 12, padding: "8px 12px", background: "var(--s2)", borderRadius: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)" }}>Project No.</span>
            <span style={{ fontFamily: "'Courier New',monospace", fontSize: 13, fontWeight: 700, color: "var(--brand)" }}>{form.projectNo}</span>
            {form.oppId && <span style={{ fontSize: 10, color: "var(--text3)", marginLeft: "auto" }}>From won deal</span>}
          </div>}
          <div className="form-row full"><div className="form-group"><label>Project Name *</label><input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setFormErrors(e => ({ ...e, name: undefined })); }} placeholder="e.g. AAI Cargo Community System — Phase 1" style={formErrors.name ? { borderColor: "#DC2626" } : {}}/><FormError error={formErrors.name}/></div></div>
          <div className="form-row">
            <div className="form-group"><label>Account</label>
              <TypeaheadSelect value={form.accountId} onChange={id => setForm(f => ({ ...f, accountId: id }))} options={accounts.map(a => ({ value: a.id, label: a.name, sub: a.country || a.type || "" }))} placeholder="Search accounts…"/>
            </div>
            <div className="form-group"><label>Owner / Delivery Manager</label>
              <select value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}>{team.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Phase</label><select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>{PROJECT_PHASES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div className="form-group"><label>Progress: {form.progress || 0}%</label><input type="range" min={0} max={100} step={5} value={form.progress || 0} onChange={e => setForm(f => ({ ...f, progress: +e.target.value }))} style={{ width: "100%" }}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Start Date</label><input type="date" value={form.startDate || ""} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}/></div>
            <div className="form-group"><label>Go-Live Target</label><input type="date" value={form.goLiveTarget || ""} onChange={e => setForm(f => ({ ...f, goLiveTarget: e.target.value }))}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Go-Live Actual</label><input type="date" value={form.goLiveActual || ""} onChange={e => setForm(f => ({ ...f, goLiveActual: e.target.value }))}/></div>
            <div className="form-group"><label>Project Value (₹L)</label><input type="number" min={0} value={form.value || 0} onChange={e => setForm(f => ({ ...f, value: +e.target.value }))}/></div>
          </div>
          <div className="form-row full"><div className="form-group"><label>Scope</label><textarea rows={2} value={form.scope || ""} onChange={e => setForm(f => ({ ...f, scope: e.target.value }))} placeholder="Project scope summary…" style={{ width: "100%", resize: "vertical" }}/></div></div>
          <div className="form-row">
            <div className="form-group"><label>Deliverables</label><textarea rows={2} value={form.deliverables || ""} onChange={e => setForm(f => ({ ...f, deliverables: e.target.value }))} style={{ width: "100%", resize: "vertical" }}/></div>
            <div className="form-group"><label>Risks</label><textarea rows={2} value={form.risks || ""} onChange={e => setForm(f => ({ ...f, risks: e.target.value }))} style={{ width: "100%", resize: "vertical" }}/></div>
          </div>

          {/* Milestones */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "12px 0 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Milestones</span>
            <button type="button" className="btn btn-sec btn-xs" style={{ fontSize: 10 }} onClick={addMs}><Plus size={11}/>Add</button>
          </div>
          {(form.milestones || []).length === 0 ? <div style={{ fontSize: 11, color: "var(--text3)" }}>No milestones.</div> : (form.milestones || []).map(m => (
            <div key={m.id} style={{ display: "grid", gridTemplateColumns: "2.5fr 1fr 1fr auto", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <input value={m.name} onChange={e => updMs(m.id, { name: e.target.value })} placeholder="Milestone"/>
              <input type="date" value={m.due || ""} onChange={e => updMs(m.id, { due: e.target.value })}/>
              <select value={m.status} onChange={e => updMs(m.id, { status: e.target.value })}>{MS_STATUS.map(s => <option key={s}>{s}</option>)}</select>
              <button type="button" className="icon-btn" aria-label="Remove" onClick={() => delMs(m.id)}><Trash2 size={13}/></button>
            </div>
          ))}

          {/* Team */}
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "12px 0 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Delivery Team</span>
            <button type="button" className="btn btn-sec btn-xs" style={{ fontSize: 10 }} onClick={addTm}><Plus size={11}/>Add</button>
          </div>
          {(form.team || []).length === 0 ? <div style={{ fontSize: 11, color: "var(--text3)" }}>No team members assigned.</div> : (form.team || []).map((t, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 2fr auto", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <select value={t.userId} onChange={e => updTm(i, { userId: e.target.value })}><option value="">Select…</option>{team.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              <select value={t.role} onChange={e => updTm(i, { role: e.target.value })}>{TEAM_ROLES.map(r => <option key={r}>{r}</option>)}</select>
              <button type="button" className="icon-btn" aria-label="Remove" onClick={() => delTm(i)}><Trash2 size={13}/></button>
            </div>
          ))}
        </Modal>
      )}
      {confirm && <Confirm title="Delete Project" msg="Move this project to Trash?" onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)}/>}
    </div>
  );
}
export default Projects;
