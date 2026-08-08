// ═══════════════════════════════════════════════════════════════════
// LeadAssignment — dedicated view of who holds which leads, by stage,
// with analytics. Answers "who is assigned to whom and at what stage",
// for the people who route leads. Data is hierarchy-scoped by the caller
// (a rep sees their own; managers see their downline; admin sees all).
// ═══════════════════════════════════════════════════════════════════
import { useMemo, useState, Fragment } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { UserCheck, UserX, CheckCircle, AlertTriangle, ChevronDown, ChevronRight, Users, ArrowRight, X } from "lucide-react";
import { LEAD_STAGES, TEAM_MAP, PRODUCTS, PROD_MAP, REGIONS, TEAM } from "../data/constants";
import { today, toLocalISODate, canEditRecord, withLeadAssignment, buildAssignmentActivity, withAssignerBackfill, buildNotificationUpdate } from "../utils/helpers";
import { notify } from "../utils/toast";

// createdDate cutoff for the date filter (null = all time).
const rangeCutoff = (key) => {
  if (key === "all") return null;
  const d = new Date();
  if (key === "7d") d.setDate(d.getDate() - 7);
  else if (key === "30d") d.setDate(d.getDate() - 30);
  else if (key === "90d") d.setDate(d.getDate() - 90);
  else if (key === "mtd") { d.setDate(1); }
  else if (key === "ytd") { d.setMonth(0, 1); }
  d.setHours(0, 0, 0, 0);
  return toLocalISODate(d);
};

const STAGE_IDS = ["MQL", "SQL", "SAL", "Converted"];
const STAGE_COLOR = { MQL: "#3B82F6", SQL: "#8B5CF6", SAL: "#22C55E", Converted: "#16A34A" };
const STAGE_LABEL = Object.fromEntries(LEAD_STAGES.map(s => [s.id, s.name]));

const Kpi = ({ label, value, sub, color, Icon }) => (
  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", flex: 1, minWidth: 150 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text3)" }}>{label}</div>
      {Icon && <Icon size={16} style={{ color }} />}
    </div>
    <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Outfit',sans-serif", color, marginTop: 4 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{sub}</div>}
  </div>
);

export default function LeadAssignment({ leads = [], setLeads, opps = [], orgUsers = [], currentUser, setPage, commLogs = [], catalog = [], setActivities, setUpdates }) {
  const [expanded, setExpanded] = useState(null); // owner id whose leads are shown
  const [q, setQ] = useState("");
  const [view, setView] = useState("byOwner"); // "byOwner" table | "matrix" (From → To grid)
  const [matrixSel, setMatrixSel] = useState(null); // { from, to } cell being drilled into
  const [productF, setProductF] = useState("All");
  const [regionF, setRegionF] = useState("All");
  const [rangeF, setRangeF] = useState("all");
  const [ownerF, setOwnerF] = useState("All"); // filter to a single owner/assignee
  const team = useMemo(() => (orgUsers && orgUsers.length ? orgUsers.filter(u => u.active !== false && u.status !== "Inactive") : TEAM), [orgUsers]);
  const canEditLead = (l) => canEditRecord({ ownerId: l?.assignedTo, currentUser, orgUsers, recordType: "lead", recordId: l?.id, commLogs, catalog, recordProductIds: l?.product ? [l.product] : [] });
  const reassign = (lead, newOwner) => {
    if (!setLeads || !newOwner || newOwner === lead.assignedTo) return;
    if (!canEditLead(lead)) return;
    // Optional handoff context — travels in the assignment history and the
    // assignee's notification task. Cancel/empty = proceed without a note.
    const note = window.prompt(`Handoff note for ${nameOf(newOwner)} (optional):`, "") || "";
    // Stamp owner + assigner + date and append the audit-trail entry.
    setLeads(p => p.map(x => x.id === lead.id ? withLeadAssignment(x, newOwner, currentUser, note) : x));
    // Synced notification: a Planned follow-up owned by the assignee.
    if (newOwner !== currentUser) {
      const byName = (orgUsers || []).find(u => u.id === currentUser)?.name || TEAM_MAP[currentUser]?.name || "";
      if (setActivities) setActivities(p => [...p, buildAssignmentActivity(lead, newOwner, currentUser, byName, note)]);
      // Bell 🔔 — updates sync now, so the ping reaches the assignee's device.
      if (setUpdates) setUpdates(p => [...p, buildNotificationUpdate(newOwner, currentUser,
        `${byName || "A colleague"} assigned you a lead: ${lead.company || lead.leadId || "Lead"}`,
        `${lead.leadId || ""} · stage ${lead.stage || "—"}${note ? ` — "${note.trim()}"` : ""}`)]);
    }
    notify.success(`${lead.company || lead.leadId || "Lead"} assigned to ${nameOf(newOwner)}${newOwner !== currentUser ? " — they've been notified with a follow-up task" : ""}.`);
  };

  const nameOf = (id) => id === "__unassigned" ? "— Unassigned —" : ((orgUsers || []).find(u => u.id === id)?.name || TEAM_MAP[id]?.name || id);
  const roleOf = (id) => (orgUsers || []).find(u => u.id === id)?.role || TEAM_MAP[id]?.role || "";
  const oppById = useMemo(() => Object.fromEntries((opps || []).map(o => [o.id, o])), [opps]);
  const oppStageOf = (l) => { const id = (l.convertedOppIds || [])[0]; const o = id ? oppById[id] : null; return o && !o.isDeleted ? (o.stage || "") : ""; };

  const live = useMemo(() => {
    const cut = rangeCutoff(rangeF);
    return (leads || []).filter(l => {
      if (l.isDeleted) return false;
      if (productF !== "All" && l.product !== productF) return false;
      if (regionF !== "All" && l.region !== regionF) return false;
      if (ownerF !== "All" && (l.assignedTo || "__unassigned") !== ownerF) return false;
      if (cut && (l.createdDate || "") < cut) return false;
      return true;
    });
  }, [leads, productF, regionF, rangeF, ownerF]);
  // Owners present in the data (for the filter dropdown), sorted by name.
  const ownerOptions = useMemo(() => {
    const ids = [...new Set((leads || []).filter(l => !l.isDeleted).map(l => l.assignedTo || "__unassigned"))];
    return ids.map(id => ({ id, name: id === "__unassigned" ? "— Unassigned —" : ((orgUsers || []).find(u => u.id === id)?.name || TEAM_MAP[id]?.name || id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [leads, orgUsers]);
  const isOverdue = (l) => l.nextCall && l.nextCall < today && !["NA", "Converted"].includes(l.stage);

  const byOwner = useMemo(() => {
    const by = {};
    live.forEach(l => {
      const o = l.assignedTo || "__unassigned";
      if (!by[o]) by[o] = { owner: o, MQL: 0, SQL: 0, SAL: 0, Converted: 0, total: 0, overdue: 0, leads: [] };
      if (STAGE_IDS.includes(l.stage)) by[o][l.stage]++;
      by[o].total++;
      if (isOverdue(l)) by[o].overdue++;
      by[o].leads.push(l);
    });
    return Object.values(by).sort((a, b) => b.total - a.total);
  }, [live]);

  const rows = useMemo(() => q.trim() ? byOwner.filter(r => nameOf(r.owner).toLowerCase().includes(q.toLowerCase())) : byOwner, [byOwner, q]);

  // From → To assignment matrix: rows = recipient (To), columns = assigner
  // (From), cell = the leads assigned by From currently sitting with To.
  // Counts the CURRENT assignment (assignedBy → assignedTo) per lead, so the
  // grand total always equals the number of leads in view. "__none" column
  // catches legacy leads with no recorded assigner.
  const matrix = useMemo(() => {
    const cells = {}; // "from|to" → leads[]
    const fromSet = new Set(), toSet = new Set();
    live.forEach(l => {
      const to = l.assignedTo || "__unassigned";
      const from = l.assignedBy || "__none";
      fromSet.add(from); toSet.add(to);
      (cells[`${from}|${to}`] = cells[`${from}|${to}`] || []).push(l);
    });
    const byName = (a, b) => nameOf(a).localeCompare(nameOf(b));
    return { cells, fromList: [...fromSet].sort(byName), toList: [...toSet].sort(byName) };
  }, [live]);
  const matrixLabel = (id) => id === "__none" ? "(not recorded)" : id === "__unassigned" ? "— Unassigned —" : nameOf(id);
  const matrixSelLeads = matrixSel ? (matrix.cells[`${matrixSel.from}|${matrixSel.to}`] || []) : [];

  const totals = useMemo(() => {
    const assigned = live.filter(l => l.assignedTo).length;
    return {
      total: live.length,
      unassigned: live.length - assigned,
      owners: byOwner.filter(r => r.owner !== "__unassigned").length,
      converted: live.filter(l => l.stage === "Converted").length,
      overdue: live.filter(isOverdue).length,
    };
  }, [live, byOwner]);

  const chartData = useMemo(() => byOwner.filter(r => r.total > 0 && r.owner !== "__unassigned").slice(0, 15)
    .map(r => ({ name: (nameOf(r.owner) || "").split(" ")[0], MQL: r.MQL, SQL: r.SQL, SAL: r.SAL, Converted: r.Converted })), [byOwner]);

  const stageBadge = (stage) => {
    const c = STAGE_COLOR[stage] || "#64748B";
    return <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 4, color: c, background: c + "1A", whiteSpace: "nowrap" }}>{stage || "—"}</span>;
  };

  return (
    <div>
      <div className="pg-head">
        <div>
          <div className="pg-title">Lead Assignment</div>
          <div className="pg-sub">Who holds which leads, by stage — {totals.total} leads across {totals.owners} owner{totals.owners === 1 ? "" : "s"}</div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Kpi label="Total Leads" value={totals.total} sub="in your view" color="#1B6B5A" Icon={Users} />
        <Kpi label="Owners" value={totals.owners} sub="with ≥1 lead" color="#2563EB" Icon={UserCheck} />
        <Kpi label="Unassigned" value={totals.unassigned} sub={totals.unassigned ? "need an owner" : "all assigned"} color={totals.unassigned ? "#DC2626" : "#22C55E"} Icon={UserX} />
        <Kpi label="Converted" value={totals.converted} sub="to opportunity" color="#16A34A" Icon={CheckCircle} />
        <Kpi label="Overdue Follow-ups" value={totals.overdue} sub="past next-call date" color={totals.overdue ? "#DC2626" : "#22C55E"} Icon={AlertTriangle} />
      </div>

      {/* Filters */}
      <div className="filter-bar" style={{ flexWrap: "wrap", marginBottom: 16 }}>
        <select className="filter-select" value={productF} onChange={e => setProductF(e.target.value)}>
          <option value="All">All Products</option>
          {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="filter-select" value={regionF} onChange={e => setRegionF(e.target.value)}>
          <option value="All">All Regions</option>
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="filter-select" value={ownerF} onChange={e => setOwnerF(e.target.value)} title="Filter to a single owner / assignee">
          <option value="All">All Owners (Assignees)</option>
          {ownerOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select className="filter-select" value={rangeF} onChange={e => setRangeF(e.target.value)} title="Filter by lead created date">
          <option value="all">All Time</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="90d">Last 90 Days</option>
          <option value="mtd">Month to Date</option>
          <option value="ytd">Year to Date</option>
        </select>
        {(productF !== "All" || regionF !== "All" || rangeF !== "all" || ownerF !== "All") && (
          <button className="btn btn-sec btn-xs" onClick={() => { setProductF("All"); setRegionF("All"); setRangeF("all"); setOwnerF("All"); }}>Clear</button>
        )}
      </div>

      {/* Chart: leads per owner, stacked by stage */}
      {chartData.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">Leads per owner (by stage)</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} barSize={26}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} interval={0} angle={chartData.length > 8 ? -30 : 0} textAnchor={chartData.length > 8 ? "end" : "middle"} height={chartData.length > 8 ? 60 : 30} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {STAGE_IDS.map(s => <Bar key={s} dataKey={s} stackId="a" fill={STAGE_COLOR[s]} name={STAGE_LABEL[s] || s} radius={s === "Converted" ? [4, 4, 0, 0] : 0} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-owner table (expandable) / From → To matrix */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text1)" }}>Assignment breakdown</div>
          <div style={{ display: "flex", gap: 0, border: "1.5px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
            <button onClick={() => setView("byOwner")} style={{ fontSize: 11, padding: "4px 12px", fontWeight: 600, cursor: "pointer", border: "none", background: view === "byOwner" ? "var(--brand)" : "#fff", color: view === "byOwner" ? "#fff" : "var(--text2)" }}>By owner</button>
            <button onClick={() => { setView("matrix"); setMatrixSel(null); }} style={{ fontSize: 11, padding: "4px 12px", fontWeight: 600, cursor: "pointer", border: "none", background: view === "matrix" ? "var(--brand)" : "#fff", color: view === "matrix" ? "#fff" : "var(--text2)" }}>From → To matrix</button>
          </div>
          {view === "byOwner" && <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search owner…" style={{ marginLeft: "auto", fontSize: 12, padding: "5px 10px", border: "1px solid var(--border)", borderRadius: 8, width: 200 }} />}
        </div>

        {/* ── From → To matrix: rows = recipient, columns = assigner. Click a
            count to open the exact leads behind it. ── */}
        {view === "matrix" && (
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={{ whiteSpace: "nowrap" }}>To \ From</th>
                  {matrix.fromList.map(f => <th key={f} style={{ textAlign: "right", whiteSpace: "nowrap" }}>{matrixLabel(f)}</th>)}
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {matrix.toList.length === 0 && <tr><td colSpan={matrix.fromList.length + 2} style={{ textAlign: "center", color: "var(--text3)", padding: 20 }}>No leads in your view.</td></tr>}
                {matrix.toList.map(t => {
                  const rowTotal = matrix.fromList.reduce((s, f) => s + (matrix.cells[`${f}|${t}`]?.length || 0), 0);
                  return (
                    <tr key={t}>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{matrixLabel(t)}</td>
                      {matrix.fromList.map(f => {
                        const n = matrix.cells[`${f}|${t}`]?.length || 0;
                        const sel = matrixSel && matrixSel.from === f && matrixSel.to === t;
                        return (
                          <td key={f} style={{ textAlign: "right" }}>
                            {n > 0 ? (
                              <button onClick={() => setMatrixSel(sel ? null : { from: f, to: t })}
                                title={`${n} lead${n > 1 ? "s" : ""} assigned by ${matrixLabel(f)} to ${matrixLabel(t)} — click to view`}
                                style={{ fontSize: 12.5, fontWeight: 700, padding: "2px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: sel ? "var(--brand)" : "var(--brand-bg, #E8F5F1)", color: sel ? "#fff" : "var(--brand)" }}>
                                {n}
                              </button>
                            ) : <span style={{ color: "var(--text3)" }}>–</span>}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: "right", fontWeight: 700 }}>{rowTotal}</td>
                    </tr>
                  );
                })}
                {matrix.toList.length > 0 && (
                  <tr style={{ background: "var(--s2)" }}>
                    <td style={{ fontWeight: 700 }}>Total</td>
                    {matrix.fromList.map(f => <td key={f} style={{ textAlign: "right", fontWeight: 700 }}>{matrix.toList.reduce((s, t) => s + (matrix.cells[`${f}|${t}`]?.length || 0), 0)}</td>)}
                    <td style={{ textAlign: "right", fontWeight: 800 }}>{live.length}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Drill-down: the leads behind the clicked cell */}
            {matrixSel && (
              <div style={{ borderTop: "1px solid var(--border)", background: "var(--s2)" }}>
                <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: "var(--text1)" }}>
                  {matrixLabel(matrixSel.from)} <ArrowRight size={13} /> {matrixLabel(matrixSel.to)}
                  <span style={{ fontWeight: 400, color: "var(--text3)" }}>({matrixSelLeads.length} lead{matrixSelLeads.length === 1 ? "" : "s"})</span>
                  <button onClick={() => setMatrixSel(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text3)" }}><X size={15} /></button>
                </div>
                <table className="tbl" style={{ width: "100%", margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ fontSize: 10.5 }}>Lead</th>
                      <th style={{ fontSize: 10.5 }}>Company</th>
                      <th style={{ fontSize: 10.5 }}>Lead Stage</th>
                      <th style={{ fontSize: 10.5 }}>Opp Stage</th>
                      <th style={{ fontSize: 10.5 }}>Assigned date</th>
                      <th style={{ fontSize: 10.5 }}>Next Call</th>
                      <th style={{ fontSize: 10.5 }} title="Backfill who routed this lead — owner unchanged, no notifications">Set assigner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrixSelLeads.map(l => (
                      <tr key={l.id}>
                        <td style={{ fontFamily: "monospace", fontSize: 11, cursor: setPage ? "pointer" : "default" }} onClick={() => setPage && setPage("leads")} title={setPage ? "Open Leads" : ""}>{l.leadId || l.id}</td>
                        <td style={{ fontSize: 12 }}>{l.company || "-"}</td>
                        <td>{stageBadge(l.stage)}</td>
                        <td>{oppStageOf(l) ? stageBadge(oppStageOf(l)) : <span style={{ color: "var(--text3)", fontSize: 11 }}>-</span>}</td>
                        <td style={{ fontSize: 11, color: "var(--text3)" }}>{l.assignedAt || l.createdDate || "-"}</td>
                        <td style={{ fontSize: 11, color: isOverdue(l) ? "#DC2626" : "var(--text3)", fontWeight: isOverdue(l) ? 700 : 400 }}>{l.nextCall || "-"}</td>
                        <td onClick={e => e.stopPropagation()}>
                          {setLeads && canEditLead(l) ? (
                            <select value={l.assignedBy || ""} onChange={e => { const a = e.target.value; if (!a) return; setLeads(p => p.map(x => x.id === l.id ? withAssignerBackfill(x, a) : x)); notify.success(`Assigner recorded for ${l.company || l.leadId} (backfill).`); }}
                              style={{ fontSize: 11, padding: "3px 6px", border: "1px solid var(--border)", borderRadius: 6, maxWidth: 150 }}
                              title="Backfill who assigned this lead (owner unchanged, no notification)">
                              <option value="">— pick assigner —</option>
                              {team.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                          ) : (
                            <span style={{ fontSize: 11, color: "var(--text3)" }}>{l.assignedBy ? matrixLabel(l.assignedBy) : "-"}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {view === "byOwner" && (
        <div style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Owner (Sales Person)</th>
                <th style={{ textAlign: "right" }}>MQL</th>
                <th style={{ textAlign: "right" }}>SQL</th>
                <th style={{ textAlign: "right" }}>SAL</th>
                <th style={{ textAlign: "right" }}>Converted</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>Overdue</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--text3)", padding: 20 }}>No leads in your view.</td></tr>}
              {rows.map(r => (
                <Fragment key={r.owner}>
                  <tr style={{ cursor: "pointer" }} onClick={() => setExpanded(e => e === r.owner ? null : r.owner)}>
                    <td style={{ fontWeight: 600 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {expanded === r.owner ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {nameOf(r.owner)}
                        {roleOf(r.owner) && <span style={{ fontSize: 10, color: "var(--text3)", fontWeight: 400 }}>· {roleOf(r.owner)}</span>}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>{r.MQL || "-"}</td>
                    <td style={{ textAlign: "right" }}>{r.SQL || "-"}</td>
                    <td style={{ textAlign: "right" }}>{r.SAL || "-"}</td>
                    <td style={{ textAlign: "right", color: "#15803D", fontWeight: 600 }}>{r.Converted || "-"}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{r.total}</td>
                    <td style={{ textAlign: "right", color: r.overdue ? "#DC2626" : "var(--text3)", fontWeight: r.overdue ? 700 : 400 }}>{r.overdue || "-"}</td>
                  </tr>
                  {expanded === r.owner && (
                    <tr>
                      <td colSpan={7} style={{ padding: 0, background: "var(--s2)" }}>
                        <table className="tbl" style={{ width: "100%", margin: 0 }}>
                          <thead>
                            <tr>
                              <th style={{ fontSize: 10.5 }}>Lead</th>
                              <th style={{ fontSize: 10.5 }}>Company</th>
                              <th style={{ fontSize: 10.5 }}>Lead Stage</th>
                              <th style={{ fontSize: 10.5 }}>Opp Stage</th>
                              <th style={{ fontSize: 10.5 }}>Assigned By</th>
                              <th style={{ fontSize: 10.5 }}>Assigned date</th>
                              <th style={{ fontSize: 10.5 }}>Reassign owner</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.leads.map(l => (
                              <tr key={l.id}>
                                <td style={{ fontFamily: "monospace", fontSize: 11, cursor: setPage ? "pointer" : "default" }} onClick={() => setPage && setPage("leads")} title={setPage ? "Open Leads" : ""}>{l.leadId || l.id}</td>
                                <td style={{ fontSize: 12 }}>{l.company || "-"}</td>
                                <td>{stageBadge(l.stage)}</td>
                                <td>{oppStageOf(l) ? stageBadge(oppStageOf(l)) : <span style={{ color: "var(--text3)", fontSize: 11 }}>-</span>}</td>
                                <td style={{ fontSize: 12 }}>{l.assignedBy ? nameOf(l.assignedBy) : <span style={{ color: "var(--text3)" }}>-</span>}</td>
                                <td style={{ fontSize: 11, color: "var(--text3)" }}>{l.assignedAt || l.createdDate || "-"}</td>
                                <td onClick={e => e.stopPropagation()}>
                                  {canEditLead(l) ? (
                                    <select value={l.assignedTo || ""} onChange={e => reassign(l, e.target.value)}
                                      style={{ fontSize: 11, padding: "3px 6px", border: "1px solid var(--border)", borderRadius: 6, maxWidth: 150 }}
                                      title="Reassign this lead to another owner">
                                      {!l.assignedTo && <option value="">— Unassigned —</option>}
                                      {team.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                  ) : (
                                    <span style={{ fontSize: 11, color: "var(--text3)" }} title="You can only reassign your own / your team's leads">{nameOf(l.assignedTo) || "—"}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  );
}
