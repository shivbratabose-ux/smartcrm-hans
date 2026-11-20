// Commercial reports: fifteen reports over quotes, agreements, usage,
// invoices and price history (lib/billing/reports.js). Opened from
// Quotations → Reports. Each report can be downloaded as CSV.
import { useState, useEffect, useMemo } from "react";
import { X, Download, BarChart3 } from "lucide-react";
import { REPORTS, runReport, reportCsv, formatCell } from "../lib/billing/reports";
import { loadBilling, billingIsCloud } from "../lib/billing/store";
import { periodOf, addMonths, isPeriod } from "../lib/billing/engine";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

const th = { textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--text3)", padding: "7px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap", position: "sticky", top: 0, background: "var(--surface)" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--border)", fontSize: 12.5, verticalAlign: "top" };
const inp = { padding: "5px 8px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12.5, background: "#fff" };
const NUMERIC = new Set(["num", "inr", "inr2", "pct"]);
// Text columns that may run long wrap; everything else stays on one line.
const LONG = new Set(["reason", "exception", "detail", "names", "milestones", "issues", "state"]);

async function loadHistory() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.from("pricing_master_history").select("*").order("changed_at", { ascending: false }).limit(500);
  return error ? [] : data || [];
}

export default function CommercialReports({ quotes = [], accounts = [], orgUsers = [], priceRows = [], catalog = [], today = "", onClose }) {
  const thisMonth = periodOf(today);
  const [id, setId] = useState(REPORTS[0].id);
  const [from, setFrom] = useState(isPeriod(thisMonth) ? addMonths(thisMonth, -5) : "");
  const [to, setTo] = useState(thisMonth);
  const [data, setData] = useState({ phase: "loading", usage: [], invoices: [], history: [], error: "" });

  useEffect(() => {
    let alive = true;
    Promise.all([loadBilling(), loadHistory()])
      .then(([b, history]) => alive && setData({ phase: "ready", usage: b.usage, invoices: b.invoices, history, error: b.error }))
      .catch((e) => alive && setData({ phase: "ready", usage: [], invoices: [], history: [], error: String(e?.message || e) }));
    return () => { alive = false; };
  }, []);

  const report = useMemo(() => {
    if (data.phase !== "ready" || !isPeriod(from) || !isPeriod(to) || from > to) return null;
    try { return runReport(id, { quotes, usage: data.usage, invoices: data.invoices, history: data.history, priceRows, catalog, accounts, users: orgUsers, from, to, today }); }
    catch (e) { return { error: String(e?.message || e), columns: [], rows: [] }; }
  }, [id, from, to, data, quotes, priceRows, catalog, accounts, orgUsers, today]);

  const download = () => {
    if (!report) return;
    const blob = new Blob(["﻿" + reportCsv(report)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `${id}_${from}_to_${to}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  };
  const groups = [...new Set(REPORTS.map((r) => r.group))];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ width: 1280, maxWidth: "98vw", height: "94vh", display: "flex", flexDirection: "column", background: "var(--surface)", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.25)", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, display: "flex", gap: 8, alignItems: "center" }}><BarChart3 size={15} /> Commercial reports</div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>Committed recurring, variable and one-time revenue are always shown separately{billingIsCloud() ? "" : " · offline mode: this browser's data only"}.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>From <input type="month" value={from} onChange={(e) => setFrom(e.target.value)} style={inp} /></label>
            <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>To <input type="month" value={to} onChange={(e) => setTo(e.target.value)} style={inp} /></label>
            <button className="btn btn-sm btn-sec" disabled={!report || !report.rows.length} onClick={download}><Download size={13} /> CSV</button>
            <button className="icon-btn" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div style={{ display: "flex", minHeight: 0, flex: 1 }}>
          <div style={{ width: 290, flexShrink: 0, borderRight: "1px solid var(--border)", overflowY: "auto", padding: "8px 8px 16px" }}>
            {groups.map((g) => (
              <div key={g}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: "var(--text3)", letterSpacing: ".5px", padding: "10px 8px 4px" }}>{g}</div>
                {REPORTS.filter((r) => r.group === g).map((r) => (
                  <button key={r.id} type="button" onClick={() => setId(r.id)}
                    style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 8px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12.5, lineHeight: 1.3, background: id === r.id ? "var(--brand)" : "transparent", color: id === r.id ? "#fff" : "var(--text)", fontWeight: id === r.id ? 700 : 500 }}>
                    {r.title}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "12px 16px" }}>
            {data.phase === "loading" && <div style={{ padding: 30, textAlign: "center", color: "var(--text3)" }}>Loading…</div>}
            {data.error && <div style={{ fontSize: 12.5, color: "#B91C1C", background: "#FEF2F2", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>Usage and invoices could not be loaded ({data.error}); reports that need them are empty.</div>}
            {data.phase === "ready" && !report && <div style={{ padding: 24, color: "#B45309", fontSize: 12.5 }}>Choose a From month that is not after the To month.</div>}
            {report && (
              <>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{report.title}</div>
                {report.note && <div style={{ fontSize: 12, color: "var(--text3)", margin: "2px 0 10px", maxWidth: 900 }}>{report.note}</div>}
                {report.error && <div style={{ fontSize: 12.5, color: "#B91C1C" }}>This report could not be worked out: {report.error}</div>}
                {!report.error && report.rows.length === 0 ? (
                  <div style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: "28px 20px", textAlign: "center", color: "var(--text3)", fontSize: 12.5 }}>Nothing to show for this period.</div>
                ) : !report.error && (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>{report.columns.map((c) => <th key={c.key} style={{ ...th, textAlign: NUMERIC.has(c.type) ? "right" : "left" }}>{c.label}</th>)}</tr></thead>
                    <tbody>
                      {report.rows.map((row, i) => (
                        <tr key={i}>{report.columns.map((c) => <td key={c.key} style={{ ...td, textAlign: NUMERIC.has(c.type) ? "right" : "left", whiteSpace: LONG.has(c.key) ? "normal" : "nowrap", minWidth: LONG.has(c.key) ? 220 : undefined, color: c.type === "inr" && Number(row[c.key]) < 0 ? "#B91C1C" : undefined }}>{formatCell(row[c.key], c.type)}</td>)}</tr>
                      ))}
                      {report.totals && (
                        <tr>{report.columns.map((c) => <td key={c.key} style={{ ...td, fontWeight: 800, background: "var(--s2)", textAlign: NUMERIC.has(c.type) ? "right" : "left", whiteSpace: NUMERIC.has(c.type) ? "nowrap" : "normal" }}>{formatCell(report.totals[c.key], c.type)}</td>)}</tr>
                      )}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
