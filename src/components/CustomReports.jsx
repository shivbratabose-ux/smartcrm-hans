// ═══════════════════════════════════════════════════════════════════
// Reports → Custom Reports: build your own report by mixing tables.
// Pick a main table (one row per record), add its fields, fields of a
// linked parent (Account › Country) and counts / sums / latest dates of
// linked children (Calls › Count, Documents › Count…). Filter, group,
// chart, sort, export, save. The rules live in lib/reportBuilder.js.
//
// Saved reports live in the cloud (saved_reports, lib/reportStore.js):
// your own, plus colleagues' reports they shared with the team (read-only:
// "Save as copy" to change one). A report holds no data — whoever opens it
// sees only their own visible records. Offline it falls back to the browser.
// The page's period / team / owner filters apply to the main table.
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Plus, X, ArrowUp, ArrowDown, Download, Save, Copy, Trash2, Table2, SlidersHorizontal, ChevronDown, ChevronUp, Users, RefreshCw } from "lucide-react";
import {
  SOURCES, columnOptions, resolveColumn, runReport, toCSV, OPS, NO_VALUE_OPS,
  STARTER_REPORTS, STARTER_CATEGORIES, blankReport, display, measure,
} from "../lib/reportBuilder";
import { loadReports, saveReport, deleteReport } from "../lib/reportStore";

const CL = ["#1B6B5A", "#2563EB", "#7C3AED", "#D97706", "#0D9488", "#DC2626", "#F97316", "#22C55E", "#EC4899", "#6366F1", "#14B8A6", "#F43F5E"];
const PAGE_ROWS = 200;
const sel = { padding: "6px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, background: "#fff", maxWidth: "100%" };
const chipBtn = { border: "none", background: "transparent", padding: 2, cursor: "pointer", display: "inline-flex", color: "var(--text3)", borderRadius: 8 };
const lbl = { fontSize: 10.5, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 };


const num = (v) => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 });
// Days and ages are averaged in summaries; money and counts are summed.
const measureLabel = (c) => (c.summary === "avg" ? `Average ${c.label}` : `Sum of ${c.label}`);
function DateBy({ value, onChange }) {
  return (
    <select style={sel} value={value || "month"} onChange={e => onChange(e.target.value)}>
      <option value="month">by month</option><option value="quarter">by quarter (FY)</option><option value="fy">by financial year</option><option value="year">by calendar year</option>
    </select>
  );
}

function ColumnPicker({ source, value, onChange, placeholder = "+ Add column…", exclude = [] }) {
  const groups = useMemo(() => columnOptions(source), [source]);
  return (
    <select style={sel} value={value || ""} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {groups.map(g => (
        <optgroup key={g.group} label={g.group}>
          {g.options.filter(o => !exclude.includes(o.id)).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export default function CustomReports({ data, today, userName, accountName, keepFor, currentUser, isWon, isLost }) {
  // ── Saved reports (cloud, or this browser when offline) ──
  const [saved, setSaved] = useState([]);
  const [cloud, setCloud] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setLoading(true);
    const r = await loadReports(currentUser);
    setSaved(r.reports); setCloud(r.cloud); setLoading(false);
    if (r.error) flash(`Couldn't load saved reports: ${r.error}`);
    else if (r.moved) flash(`Moved ${r.moved} report${r.moved === 1 ? "" : "s"} saved in this browser to the cloud.`);
  };
  useEffect(() => { refresh(); }, [currentUser]);   // eslint-disable-line react-hooks/exhaustive-deps
  const mine = saved.filter(r => r.ownerId === currentUser);
  const sharedWithMe = saved.filter(r => r.ownerId !== currentUser && r.shared);
  const [spec, setSpec] = useState(() => ({ ...STARTER_REPORTS[0], id: "" , fromStarter: STARTER_REPORTS[0].id }));
  const [openId, setOpenId] = useState(STARTER_REPORTS[0].id);
  const [showBuilder, setShowBuilder] = useState(true);
  const [page, setPage] = useState(0);
  const [msg, setMsg] = useState("");

  const ctx = useMemo(() => ({ today, userName, accountName, isWon, isLost, keep: keepFor(spec.source) }), [today, userName, accountName, isWon, isLost, keepFor, spec.source]);
  const result = useMemo(() => runReport(spec, data, ctx), [spec, data, ctx]);
  useEffect(() => { setPage(0); }, [spec]);

  const upd = (patch) => setSpec(s => ({ ...s, ...patch }));
  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 4000); };

  // ── Open / new / save ──
  const open = (id) => {
    setOpenId(id);
    if (id === "__new") { setSpec(blankReport("opps")); return; }
    const st = STARTER_REPORTS.find(r => r.id === id);
    if (st) { setSpec({ ...st, id: "", fromStarter: st.id }); return; }
    const found = saved.find(r => r.id === id);
    if (found) setSpec({ ...found });
  };
  // Save my report (or save someone else's / a starter as my own copy).
  const save = async (asCopy = false) => {
    if (busy) return;
    const name = (spec.name || "").trim() || "Untitled report";
    const isMine = !!spec.id && mine.some(r => r.id === spec.id) && !asCopy;
    const id = isMine ? spec.id : `rpt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const copyName = asCopy && spec.id ? `${name} (copy)` : name;
    const rec = { ...spec, id, name: isMine ? name : copyName, shared: isMine ? !!spec.shared : false, ownerId: currentUser, fromStarter: undefined };
    setBusy(true);
    const { error } = await saveReport(rec, currentUser, cloud);
    setBusy(false);
    if (error) { flash(`Couldn't save: ${error}`); return; }
    setSaved(list => (isMine ? list.map(r => (r.id === id ? rec : r)) : [...list, rec]).sort((a, b) => a.name.localeCompare(b.name)));
    setSpec(rec); setOpenId(id);
    flash(isMine ? "Saved." : "Saved to My reports.");
  };
  const toggleShare = async (on) => {
    if (!isMine || busy) return;
    const rec = { ...spec, shared: on };
    setBusy(true);
    const { error } = await saveReport(rec, currentUser, cloud);
    setBusy(false);
    if (error) { flash(`Couldn't update sharing: ${error}`); return; }
    setSpec(rec); setSaved(list => list.map(r => (r.id === rec.id ? { ...r, shared: on } : r)));
    flash(on ? "Shared with the team: everyone can open it (read-only) and sees only their own data." : "No longer shared.");
  };
  const remove = async () => {
    if (!isMine || busy) return;
    if (!window.confirm(`Delete "${spec.name}"?${spec.shared ? " It is shared, so it will disappear for the team too." : ""}`)) return;
    setBusy(true);
    const { error } = await deleteReport(spec.id, currentUser, cloud);
    setBusy(false);
    if (error) { flash(`Couldn't delete: ${error}`); return; }
    setSaved(list => list.filter(r => r.id !== spec.id)); open(STARTER_REPORTS[0].id); flash("Deleted.");
  };
  const exportCSV = () => {
    const blob = new Blob(["﻿" + toCSV(result)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(spec.name || "custom-report").replace(/[^\w-]+/g, "_").slice(0, 60)}_${today}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ── Builder actions ──
  const setSource = (src) => setSpec(s => ({ ...blankReport(src), name: s.name, id: s.id }));
  const addCol = (id) => id && !spec.columns.includes(id) && upd({ columns: [...spec.columns, id] });
  const moveCol = (i, d) => { const c = [...spec.columns]; const j = i + d; if (j < 0 || j >= c.length) return; [c[i], c[j]] = [c[j], c[i]]; upd({ columns: c }); };
  const dropCol = (i) => upd({ columns: spec.columns.filter((_, k) => k !== i) });
  const setFilter = (i, patch) => upd({ filters: spec.filters.map((f, k) => (k === i ? { ...f, ...patch } : f)) });
  const sortBy = (col) => upd({ sort: { col, dir: spec.sort?.col === col && spec.sort.dir === "asc" ? "desc" : "asc" } });

  const colLabel = (id) => resolveColumn(spec.source, id)?.label || id;
  const groupCol = spec.groupBy?.col ? resolveColumn(spec.source, spec.groupBy.col) : null;
  const group2Col = groupCol && spec.groupBy2?.col ? resolveColumn(spec.source, spec.groupBy2.col) : null;
  const matrix = !!(groupCol && group2Col && result.groups2);
  const numCols = result.columns.filter(c => c.type === "num");
  const chartKey = spec.chartValue && numCols.some(c => c.id === spec.chartValue) ? spec.chartValue : "count";
  const chartCol = chartKey === "count" ? null : numCols.find(c => c.id === chartKey);
  const chartData = (result.groups || []).slice(0, 30).map(g => ({ name: g.label, value: measure(g, chartCol || "count") }));
  // Matrix: the most common 12 second-level values become columns.
  const cols2 = (result.groups2 || []).slice(0, 12);
  const stackData = (result.groups || []).slice(0, 30).map(g => ({ name: g.label, ...Object.fromEntries(cols2.map(k => [k.key, g.cells[k.key] ? measure(g.cells[k.key], chartCol || "count") : 0])) }));

  // Distinct values to suggest in a filter box (first 60).
  const suggestions = (colId) => {
    const c = resolveColumn(spec.source, colId);
    if (!c || ["num", "date"].includes(c.type)) return [];
    const set = new Set();
    for (const r of (data[SOURCES[spec.source].list] || [])) {
      if (r.isDeleted) continue;
      const v = c.get(r, data, ctx);
      (Array.isArray(v) ? v : [v]).forEach(x => { const t = display(c.type === "userlist" ? "user" : c.type === "list" ? "text" : c.type, x, ctx); if (t) set.add(t); });
      if (set.size >= 60) break;
    }
    return [...set].sort();
  };

  const isMine = !!spec.id && mine.some(r => r.id === spec.id);
  const isShared = !!spec.id && sharedWithMe.some(r => r.id === spec.id);
  const rows = result.rows.slice(page * PAGE_ROWS, (page + 1) * PAGE_ROWS);
  const pages = Math.ceil(result.total / PAGE_ROWS);

  return (
    <div>
      {/* ── Report bar: open / name / save / export ── */}
      <div className="card" style={{ padding: 12, marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select style={{ ...sel, minWidth: 220 }} value={openId} onChange={e => open(e.target.value)} title="Open a report">
          <option value="__new">+ New blank report</option>
          {mine.length > 0 && <optgroup label="My reports">{mine.map(r => <option key={r.id} value={r.id}>{r.name}{r.shared ? " (shared)" : ""}</option>)}</optgroup>}
          {sharedWithMe.length > 0 && <optgroup label="Shared with team">{sharedWithMe.map(r => <option key={r.id} value={r.id}>{r.name} · by {userName(r.ownerId)}</option>)}</optgroup>}
          {STARTER_CATEGORIES.map(cat => (
            <optgroup key={cat} label={`Starter · ${cat}`}>{STARTER_REPORTS.filter(r => r.category === cat).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
          ))}
        </select>
        <input value={spec.name || ""} onChange={e => upd({ name: e.target.value })} placeholder="Report name"
          style={{ ...sel, flex: "1 1 220px", minWidth: 160 }} />
        {isShared ? (
          <>
            <span style={{ fontSize: 11.5, color: "var(--text3)", display: "inline-flex", alignItems: "center", gap: 4 }}><Users size={13} />Shared by {userName(spec.ownerId)} · read-only</span>
            <button className="btn btn-sm btn-primary" onClick={() => save(true)} disabled={busy} title="Save your own copy to change it"><Copy size={13} />Save as my copy</button>
          </>
        ) : (
          <button className="btn btn-sm btn-primary" onClick={() => save(false)} disabled={busy} title={isMine ? "Save changes" : "Save to My reports"}><Save size={13} />{isMine ? "Save" : "Save to My reports"}</button>
        )}
        {isMine && <button className="btn btn-sm btn-sec" onClick={() => save(true)} disabled={busy} title="Save as a new report"><Copy size={13} />Save as copy</button>}
        {isMine && cloud && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, cursor: "pointer", padding: "4px 8px", borderRadius: 8, border: "1px solid var(--border)", background: spec.shared ? "#E6F2EE" : "#fff" }}
            title="Everyone in the CRM can open this report (read-only). Each person sees only the records they're allowed to see.">
            <input type="checkbox" checked={!!spec.shared} disabled={busy} onChange={e => toggleShare(e.target.checked)} />
            <Users size={13} />Share with team
          </label>
        )}
        {isMine && <button className="btn btn-sm btn-sec" onClick={remove} disabled={busy} title="Delete this report"><Trash2 size={13} /></button>}
        {cloud && <button className="btn btn-sm btn-sec" onClick={refresh} disabled={loading} title="Reload saved and shared reports"><RefreshCw size={13} /></button>}
        <button className="btn btn-sm btn-sec" onClick={exportCSV} disabled={!result.total}><Download size={13} />Export CSV</button>
        <button className="btn btn-sm btn-sec" onClick={() => setShowBuilder(v => !v)} style={{ marginLeft: "auto" }}>
          <SlidersHorizontal size={13} />{showBuilder ? "Hide builder" : "Edit report"}{showBuilder ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        {msg && <span style={{ fontSize: 11.5, color: "var(--brand)", fontWeight: 600, width: "100%" }}>{msg}</span>}
      </div>

      {/* ── Builder ── */}
      {showBuilder && (
        <div className="card" style={{ padding: 14, marginBottom: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 18 }}>
          <div>
            <div style={lbl}>1 · Main table (one row each)</div>
            <select style={{ ...sel, width: "100%" }} value={spec.source} onChange={e => setSource(e.target.value)}>
              {Object.entries(SOURCES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
            <div style={{ ...lbl, marginTop: 14 }}>2 · Columns</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
              {spec.columns.map((id, i) => (
                <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11.5, padding: "3px 4px 3px 8px", borderRadius: 14,
                  background: id.startsWith("f:") ? "var(--s2)" : "#E6F2EE", border: `1px solid ${id.startsWith("f:") ? "var(--border)" : "#B7DACD"}`, maxWidth: "100%" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }} title={colLabel(id)}>{colLabel(id)}</span>
                  <button style={chipBtn} aria-label="Move left" title="Move left" onClick={() => moveCol(i, -1)} disabled={i === 0}><ArrowUp size={11} style={{ transform: "rotate(-90deg)" }} /></button>
                  <button style={chipBtn} aria-label="Move right" title="Move right" onClick={() => moveCol(i, 1)} disabled={i === spec.columns.length - 1}><ArrowDown size={11} style={{ transform: "rotate(-90deg)" }} /></button>
                  <button style={chipBtn} aria-label="Remove column" title="Remove" onClick={() => dropCol(i)}><X size={11} /></button>
                </span>
              ))}
              {spec.columns.length === 0 && <div style={{ fontSize: 12, color: "var(--text3)" }}>No columns yet.</div>}
            </div>
            <ColumnPicker source={spec.source} value="" onChange={addCol} exclude={spec.columns} />
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>
              Mix tables: "(linked)" columns pull from a parent (e.g. Account › Country) or count / total linked records (e.g. Calls › Count) against each row.
            </div>
          </div>

          <div>
            <div style={lbl}>3 · Filters</div>
            {spec.filters.map((f, i) => {
              const sug = suggestions(f.col);
              return (
                <div key={i} style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6, alignItems: "center" }}>
                  <ColumnPicker source={spec.source} value={f.col} onChange={v => setFilter(i, { col: v })} placeholder="Column…" />
                  <select style={sel} value={f.op} onChange={e => setFilter(i, { op: e.target.value })}>
                    {OPS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                  {!NO_VALUE_OPS.has(f.op) && (
                    <>
                      <input style={{ ...sel, width: 140 }} value={f.value ?? ""} list={`sug_${i}`}
                        type={["before", "after"].includes(f.op) ? "date" : "text"}
                        placeholder={["any", "none"].includes(f.op) ? "a, b, c" : ["lastDays", "nextDays"].includes(f.op) ? "days" : "value"}
                        onChange={e => setFilter(i, { value: e.target.value })} />
                      {sug.length > 0 && <datalist id={`sug_${i}`}>{sug.map(s => <option key={s} value={s} />)}</datalist>}
                    </>
                  )}
                  <button className="icon-btn" aria-label="Remove filter" onClick={() => upd({ filters: spec.filters.filter((_, k) => k !== i) })}><X size={12} /></button>
                </div>
              );
            })}
            <button className="btn btn-xs btn-sec" onClick={() => upd({ filters: [...spec.filters, { col: spec.columns[0] || "", op: "is", value: "" }] })}><Plus size={12} />Add filter</button>

            <div style={{ ...lbl, marginTop: 16 }}>4 · Group, chart & sort</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 12 }}>Group by</span>
              <select style={sel} value={spec.groupBy?.col || ""} onChange={e => upd({ groupBy: { col: e.target.value, by: spec.groupBy?.by || "month" } })}>
                <option value="">No grouping</option>
                {spec.columns.map(id => <option key={id} value={id}>{colLabel(id)}</option>)}
              </select>
              {groupCol?.type === "date" && <DateBy value={spec.groupBy.by} onChange={by => upd({ groupBy: { ...spec.groupBy, by } })} />}
            </div>
            {groupCol && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12 }}>Then by</span>
                <select style={sel} value={spec.groupBy2?.col || ""} onChange={e => upd({ groupBy2: { col: e.target.value, by: spec.groupBy2?.by || "month" } })} title="A second grouping turns the summary into a matrix (e.g. Owner × Stage)">
                  <option value="">Nothing (simple summary)</option>
                  {spec.columns.filter(id => id !== spec.groupBy.col).map(id => <option key={id} value={id}>{colLabel(id)}</option>)}
                </select>
                {group2Col?.type === "date" && <DateBy value={spec.groupBy2.by} onChange={by => upd({ groupBy2: { ...spec.groupBy2, by } })} />}
              </div>
            )}
            {groupCol && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12 }}>{matrix ? "Show" : "Chart"}</span>
                {!matrix && (
                  <select style={sel} value={spec.chart || "bar"} onChange={e => upd({ chart: e.target.value })}>
                    <option value="bar">Bar</option><option value="pie">Pie</option><option value="none">No chart</option>
                  </select>
                )}
                <select style={sel} value={chartKey} onChange={e => upd({ chartValue: e.target.value })}>
                  <option value="count">Count of rows</option>
                  {numCols.map(c => <option key={c.id} value={c.id}>{measureLabel(c)}</option>)}
                </select>
                {matrix && (
                  <select style={sel} value={spec.chart === "none" ? "none" : "bar"} onChange={e => upd({ chart: e.target.value })}>
                    <option value="bar">Stacked bar chart</option><option value="none">No chart</option>
                  </select>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12 }}>Sort by</span>
              <select style={sel} value={spec.sort?.col || ""} onChange={e => upd({ sort: { col: e.target.value, dir: spec.sort?.dir || "asc" } })}>
                <option value="">None</option>
                {spec.columns.map(id => <option key={id} value={id}>{colLabel(id)}</option>)}
              </select>
              <select style={sel} value={spec.sort?.dir || "asc"} onChange={e => upd({ sort: { ...spec.sort, dir: e.target.value } })}>
                <option value="asc">Ascending</option><option value="desc">Descending</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── Results ── */}
      {result.error ? <div className="card" style={{ padding: 20, color: "var(--text3)" }}>{result.error}</div> : (
        <>
          {result.groups && (
            <div style={{ display: "grid", gridTemplateColumns: spec.chart === "none" ? "1fr" : "repeat(auto-fit,minmax(320px,1fr))", gap: 12, marginBottom: 12 }}>
              {spec.chart !== "none" && chartData.length > 0 && (
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                    {chartCol ? measureLabel(chartCol) : "Count"} by {groupCol?.label}{matrix ? ` and ${group2Col?.label}` : ""}
                    {result.groups.length > 30 && <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text3)" }}> · top 30 of {result.groups.length}</span>}
                  </div>
                  <ResponsiveContainer width="100%" height={matrix ? 300 : 260}>
                    {matrix ? (
                      <BarChart data={stackData} margin={{ left: 0, right: 8, bottom: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={stackData.length > 6 ? -30 : 0} textAnchor={stackData.length > 6 ? "end" : "middle"} height={stackData.length > 6 ? 60 : 30} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={v => Number(v).toLocaleString("en-IN")} /><Legend wrapperStyle={{ fontSize: 11 }} />
                        {cols2.map((k, i) => <Bar key={k.key} dataKey={k.key} name={k.label} stackId="m" fill={CL[i % CL.length]} isAnimationActive={false} />)}
                      </BarChart>
                    ) : spec.chart === "pie" ? (
                      <PieChart>
                        <Pie data={chartData} dataKey="value" nameKey="name" outerRadius={90} isAnimationActive={false}>
                          {chartData.map((_, i) => <Cell key={i} fill={CL[i % CL.length]} />)}
                        </Pie>
                        <Tooltip formatter={v => Number(v).toLocaleString("en-IN")} /><Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    ) : (
                      <BarChart data={chartData} margin={{ left: 0, right: 8, bottom: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={chartData.length > 6 ? -30 : 0} textAnchor={chartData.length > 6 ? "end" : "middle"} height={chartData.length > 6 ? 60 : 30} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={v => Number(v).toLocaleString("en-IN")} />
                        <Bar dataKey="value" fill="#1B6B5A" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              )}
              <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: matrix ? 420 : 320 }}>
                {matrix ? (
                  <table className="tbl">
                    <thead><tr>
                      <th style={{ whiteSpace: "nowrap" }}>{groupCol?.label} ↓ · {group2Col?.label} →</th>
                      {cols2.map(k => <th key={k.key} style={{ textAlign: "right", whiteSpace: "nowrap" }}>{k.label}</th>)}
                      <th style={{ textAlign: "right" }}>Total</th>
                    </tr></thead>
                    <tbody>
                      {result.groups.map(g => (
                        <tr key={g.key}>
                          <td style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{g.label}</td>
                          {cols2.map(k => <td key={k.key} style={{ textAlign: "right", fontSize: 12, color: g.cells[k.key] ? undefined : "var(--text3)" }}>{g.cells[k.key] ? num(measure(g.cells[k.key], chartCol || "count")) : "—"}</td>)}
                          <td style={{ textAlign: "right", fontSize: 12, fontWeight: 700 }}>{num(measure(g, chartCol || "count"))}</td>
                        </tr>
                      ))}
                    </tbody>
                    {(!chartCol || chartCol.summary !== "avg") && (
                      <tfoot><tr>
                        <td style={{ fontSize: 12, fontWeight: 700, borderTop: "2px solid var(--border)" }}>Total</td>
                        {cols2.map(k => <td key={k.key} style={{ textAlign: "right", fontSize: 12, fontWeight: 700, borderTop: "2px solid var(--border)" }}>{num(result.groups.reduce((s, g) => s + (g.cells[k.key] ? measure(g.cells[k.key], chartCol || "count") : 0), 0))}</td>)}
                        <td style={{ textAlign: "right", fontSize: 12, fontWeight: 700, borderTop: "2px solid var(--border)" }}>{num(result.groups.reduce((s, g) => s + measure(g, chartCol || "count"), 0))}</td>
                      </tr></tfoot>
                    )}
                  </table>
                ) : (
                  <table className="tbl">
                    <thead><tr><th>{groupCol?.label}</th><th style={{ textAlign: "right" }}>Count</th>{numCols.map(c => <th key={c.id} style={{ textAlign: "right" }}>{measureLabel(c)}</th>)}</tr></thead>
                    <tbody>
                      {result.groups.map(g => (
                        <tr key={g.key}>
                          <td style={{ fontSize: 12, fontWeight: 600 }}>{g.label}</td>
                          <td style={{ textAlign: "right", fontSize: 12 }}>{g.count}</td>
                          {numCols.map(c => <td key={c.id} style={{ textAlign: "right", fontSize: 12 }}>{num(measure(g, c))}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Table2 size={15} style={{ color: "var(--brand)" }} /> {spec.name || "Untitled report"}
              <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text3)" }}>{result.total} {SOURCES[spec.source].label.toLowerCase()}</span>
              {pages > 1 && (
                <span style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center", fontSize: 11, fontWeight: 400 }}>
                  <button className="btn btn-xs btn-sec" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
                  {page * PAGE_ROWS + 1}–{Math.min((page + 1) * PAGE_ROWS, result.total)} of {result.total}
                  <button className="btn btn-xs btn-sec" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
                </span>
              )}
            </div>
            {result.columns.length === 0 ? <div style={{ padding: 20, fontSize: 12, color: "var(--text3)" }}>Add columns to see the report.</div>
              : result.total === 0 ? <div style={{ padding: 20, fontSize: 12, color: "var(--text3)" }}>No records match. Check the filters above and the period / team / owner filters at the top of the page.</div>
              : (
                <div style={{ overflow: "auto", maxHeight: 560 }}>
                  <table className="tbl">
                    <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                      <tr>{result.columns.map(c => (
                        <th key={c.id} onClick={() => sortBy(c.id)} style={{ cursor: "pointer", whiteSpace: "nowrap", textAlign: c.type === "num" ? "right" : "left" }} title="Sort">
                          {c.label}{spec.sort?.col === c.id ? (spec.sort.dir === "desc" ? " ↓" : " ↑") : ""}
                        </th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.rec.id}>
                          {result.columns.map(c => (
                            <td key={c.id} style={{ fontSize: 12, textAlign: c.type === "num" ? "right" : "left", fontWeight: c.id.startsWith("a:") ? 600 : 400, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.shown[c.id]}>
                              {r.shown[c.id] || <span style={{ color: "var(--text3)" }}>—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    {numCols.length > 0 && (
                      <tfoot>
                        <tr>{result.columns.map((c, i) => (
                          <td key={c.id} style={{ fontSize: 12, fontWeight: 700, textAlign: c.type === "num" ? "right" : "left", borderTop: "2px solid var(--border)" }}>
                            {c.type === "num" ? result.rows.reduce((s, r) => s + (Number(r.values[c.id]) || 0), 0).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : i === 0 ? "Total" : ""}
                          </td>
                        ))}</tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
          </div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 8 }}>
            {cloud ? "Saved reports are kept in the cloud. A shared report shows each person only the records they can see." : "Saved reports are kept in this browser."} The period, team and owner filters at the top of the page apply to the main table; linked counts include every linked record you can see.
          </div>
        </>
      )}
    </div>
  );
}
