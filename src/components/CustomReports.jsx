// ═══════════════════════════════════════════════════════════════════
// Reports → Custom Reports: build your own report by mixing tables.
// Pick a main table (one row per record), add its fields, fields of a
// linked parent (Account › Country) and counts / sums / latest dates of
// linked children (Calls › Count, Documents › Count…). Filter, group,
// chart, sort, export, save. The rules live in lib/reportBuilder.js.
//
// Saved reports are kept per user in this browser (no database change).
// The page's period / team / owner filters apply to the main table.
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Plus, X, ArrowUp, ArrowDown, Download, Save, Copy, Trash2, Table2, SlidersHorizontal, ChevronDown, ChevronUp } from "lucide-react";
import {
  SOURCES, columnOptions, resolveColumn, runReport, toCSV, OPS, NO_VALUE_OPS,
  STARTER_REPORTS, blankReport, display,
} from "../lib/reportBuilder";

const CL = ["#1B6B5A", "#2563EB", "#7C3AED", "#D97706", "#0D9488", "#DC2626", "#F97316", "#22C55E", "#EC4899", "#6366F1", "#14B8A6", "#F43F5E"];
const PAGE_ROWS = 200;
const sel = { padding: "6px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12, background: "#fff", maxWidth: "100%" };
const chipBtn = { border: "none", background: "transparent", padding: 2, cursor: "pointer", display: "inline-flex", color: "var(--text3)", borderRadius: 8 };
const lbl = { fontSize: 10.5, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 };

// Saved reports: per user, this browser only. Storage can be blocked
// (private window) — the panel still works, it just can't remember.
const storeKey = (u) => `smartcrm_custom_reports_v1:${u || "anon"}`;
function loadSaved(u) { try { const v = JSON.parse(localStorage.getItem(storeKey(u)) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } }
function storeSaved(u, list) { try { localStorage.setItem(storeKey(u), JSON.stringify(list)); return true; } catch { return false; } }

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

export default function CustomReports({ data, today, userName, accountName, keepFor, currentUser }) {
  const [saved, setSaved] = useState(() => loadSaved(currentUser));
  useEffect(() => { setSaved(loadSaved(currentUser)); }, [currentUser]);
  const [spec, setSpec] = useState(() => ({ ...STARTER_REPORTS[0], id: "" , fromStarter: STARTER_REPORTS[0].id }));
  const [openId, setOpenId] = useState(STARTER_REPORTS[0].id);
  const [showBuilder, setShowBuilder] = useState(true);
  const [page, setPage] = useState(0);
  const [msg, setMsg] = useState("");

  const ctx = useMemo(() => ({ today, userName, accountName, keep: keepFor(spec.source) }), [today, userName, accountName, keepFor, spec.source]);
  const result = useMemo(() => runReport(spec, data, ctx), [spec, data, ctx]);
  useEffect(() => { setPage(0); }, [spec]);

  const upd = (patch) => setSpec(s => ({ ...s, ...patch }));
  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 2500); };

  // ── Open / new / save ──
  const open = (id) => {
    setOpenId(id);
    if (id === "__new") { setSpec(blankReport("opps")); return; }
    const st = STARTER_REPORTS.find(r => r.id === id);
    if (st) { setSpec({ ...st, id: "", fromStarter: st.id }); return; }
    const mine = saved.find(r => r.id === id);
    if (mine) setSpec({ ...mine });
  };
  const persist = (list) => { setSaved(list); if (!storeSaved(currentUser, list)) flash("This browser blocks saving: the report works but won't be remembered."); };
  const save = (asCopy = false) => {
    const name = (spec.name || "").trim() || "Untitled report";
    const isMine = spec.id && saved.some(r => r.id === spec.id) && !asCopy;
    const id = isMine ? spec.id : `rpt_${Date.now().toString(36)}`;
    const rec = { ...spec, id, name: asCopy && !isMine ? (spec.fromStarter || spec.id ? `${name} (copy)` : name) : name, fromStarter: undefined, savedAt: new Date().toISOString() };
    const list = isMine ? saved.map(r => (r.id === id ? rec : r)) : [...saved, rec];
    persist(list); setSpec(rec); setOpenId(id); flash(isMine ? "Saved." : "Saved to My reports.");
  };
  const remove = () => {
    if (!spec.id || !saved.some(r => r.id === spec.id)) return;
    if (!window.confirm(`Delete "${spec.name}" from My reports?`)) return;
    persist(saved.filter(r => r.id !== spec.id)); open(STARTER_REPORTS[0].id); flash("Deleted.");
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
  const numCols = result.columns.filter(c => c.type === "num");
  const chartKey = spec.chartValue && numCols.some(c => c.id === spec.chartValue) ? spec.chartValue : "count";
  const chartData = (result.groups || []).slice(0, 30).map(g => ({ name: g.label, value: chartKey === "count" ? g.count : g.sums[chartKey] }));

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

  const isSaved = spec.id && saved.some(r => r.id === spec.id);
  const rows = result.rows.slice(page * PAGE_ROWS, (page + 1) * PAGE_ROWS);
  const pages = Math.ceil(result.total / PAGE_ROWS);

  return (
    <div>
      {/* ── Report bar: open / name / save / export ── */}
      <div className="card" style={{ padding: 12, marginBottom: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select style={{ ...sel, minWidth: 220 }} value={openId} onChange={e => open(e.target.value)} title="Open a report">
          <option value="__new">+ New blank report</option>
          {saved.length > 0 && <optgroup label="My reports">{saved.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>}
          <optgroup label="Starter reports">{STARTER_REPORTS.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
        </select>
        <input value={spec.name || ""} onChange={e => upd({ name: e.target.value })} placeholder="Report name"
          style={{ ...sel, flex: "1 1 220px", minWidth: 160 }} />
        <button className="btn btn-sm btn-primary" onClick={() => save(false)} title={isSaved ? "Save changes" : "Save to My reports"}><Save size={13} />{isSaved ? "Save" : "Save to My reports"}</button>
        {isSaved && <button className="btn btn-sm btn-sec" onClick={() => save(true)} title="Save as a new report"><Copy size={13} />Save as copy</button>}
        {isSaved && <button className="btn btn-sm btn-sec" onClick={remove} title="Delete from My reports"><Trash2 size={13} /></button>}
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
              {groupCol?.type === "date" && (
                <select style={sel} value={spec.groupBy.by || "month"} onChange={e => upd({ groupBy: { ...spec.groupBy, by: e.target.value } })}>
                  <option value="month">by month</option><option value="quarter">by quarter (FY)</option><option value="fy">by financial year</option><option value="year">by calendar year</option>
                </select>
              )}
            </div>
            {groupCol && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12 }}>Chart</span>
                <select style={sel} value={spec.chart || "bar"} onChange={e => upd({ chart: e.target.value })}>
                  <option value="bar">Bar</option><option value="pie">Pie</option><option value="none">No chart</option>
                </select>
                <select style={sel} value={chartKey} onChange={e => upd({ chartValue: e.target.value })}>
                  <option value="count">Count of rows</option>
                  {numCols.map(c => <option key={c.id} value={c.id}>Sum of {c.label}</option>)}
                </select>
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
                    {chartKey === "count" ? "Count" : `Sum of ${colLabel(chartKey)}`} by {groupCol?.label}
                    {result.groups.length > 30 && <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text3)" }}> · top 30 of {result.groups.length}</span>}
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    {spec.chart === "pie" ? (
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
              <div className="card" style={{ padding: 0, overflow: "auto", maxHeight: 320 }}>
                <table className="tbl">
                  <thead><tr><th>{groupCol?.label}</th><th style={{ textAlign: "right" }}>Count</th>{numCols.map(c => <th key={c.id} style={{ textAlign: "right" }}>Sum of {c.label}</th>)}</tr></thead>
                  <tbody>
                    {result.groups.map(g => (
                      <tr key={g.key}>
                        <td style={{ fontSize: 12, fontWeight: 600 }}>{g.label}</td>
                        <td style={{ textAlign: "right", fontSize: 12 }}>{g.count}</td>
                        {numCols.map(c => <td key={c.id} style={{ textAlign: "right", fontSize: 12 }}>{g.sums[c.id].toLocaleString("en-IN")}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
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
            Saved reports are kept for you in this browser. The period, team and owner filters at the top of the page apply to the main table; linked counts include every linked record you can see.
          </div>
        </>
      )}
    </div>
  );
}
