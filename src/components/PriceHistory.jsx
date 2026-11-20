// Price history: every change to the Pricing Master, read from
// pricing_master_history (written by a database trigger, see
// supabase/commercial_phase_b_v1.sql). Opened from Masters → Products & Pricing.
import { useState, useEffect } from "react";
import { X, History } from "lucide-react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { priceChangeSummary, SECTION_LABEL } from "../lib/quotation/priceHistory";

const th = { textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--text3)", padding: "7px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td = { padding: "7px 10px", borderBottom: "1px solid var(--border)", fontSize: 12.5, verticalAlign: "top" };

export default function PriceHistory({ orgUsers = [], onClose, load }) {
  const [state, setState] = useState({ phase: "loading", rows: [] });
  const [search, setSearch] = useState("");
  const [only, setOnly] = useState("all");
  useEffect(() => {
    let alive = true;
    const fetchRows = load || (async () => {
      if (!isSupabaseConfigured) return { offline: true, rows: [] };
      const { data, error } = await supabase.from("pricing_master_history").select("*").order("changed_at", { ascending: false }).limit(300);
      return error ? { error: error.message, rows: [] } : { rows: data || [] };
    });
    fetchRows().then((res) => alive && setState({ phase: "ready", ...res })).catch((e) => alive && setState({ phase: "ready", error: String(e?.message || e), rows: [] }));
    return () => { alive = false; };
  }, []);
  const who = (id) => (id ? orgUsers.find((u) => u.id === id)?.name || id : "Outside the app");
  const q = search.trim().toLowerCase();
  const rows = state.rows.filter((r) => (only === "all" || (only === "price") === (r.section === "price"))
    && (!q || `${r.item_code || ""} ${r.item_name || ""} ${SECTION_LABEL[r.section] || r.section}`.toLowerCase().includes(q)));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ width: 980, maxWidth: "97vw", maxHeight: "92vh", overflow: "auto", background: "var(--surface)", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, display: "flex", gap: 8, alignItems: "center" }}><History size={15} /> Price history</div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>Every change to prices and quotation rules: who, when, and what it was before. Kept permanently; it cannot be edited.</div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center", flexWrap: "wrap" }}>
            {[["all", "All changes"], ["price", "Prices"], ["rules", "Rules"]].map(([k, label]) => (
              <button key={k} type="button" className={`btn btn-sm ${only === k ? "btn-primary" : "btn-sec"}`} onClick={() => setOnly(k)}>{label}</button>
            ))}
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code or name" style={{ marginLeft: "auto", width: 240, padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 12.5 }} />
          </div>
          {state.phase === "loading" && <div style={{ padding: 30, textAlign: "center", color: "var(--text3)" }}>Loading…</div>}
          {state.phase === "ready" && state.offline && <div style={{ padding: 24, textAlign: "center", color: "var(--text3)", fontSize: 12.5 }}>Price history is kept in the cloud database; it is not available in offline mode.</div>}
          {state.phase === "ready" && state.error && <div style={{ padding: 16, color: "#B91C1C", fontSize: 12.5 }}>Could not load the history: {state.error}</div>}
          {state.phase === "ready" && !state.error && !state.offline && rows.length === 0 && (
            <div style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: "28px 20px", textAlign: "center", color: "var(--text3)", fontSize: 12.5 }}>
              {state.rows.length ? "Nothing matches." : "No changes recorded yet. History starts from the day this was switched on."}
            </div>
          )}
          {rows.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["When", "Who", "What", "Change"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{new Date(r.changed_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td style={td}>{who(r.changed_by)}</td>
                    <td style={td}>{r.section === "price" ? <><span style={{ fontFamily: "monospace", fontWeight: 700 }}>{r.item_code}</span> {r.item_name}</> : <b>{SECTION_LABEL[r.section] || r.section}</b>}</td>
                    <td style={td}>{priceChangeSummary(r).map((line, i) => <div key={i}>{line}</div>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
