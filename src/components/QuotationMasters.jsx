// ═══════════════════════════════════════════════════════════════════
// QuotationMasters — admin editor for the quotation pricing masters
// ═══════════════════════════════════════════════════════════════════
// Phase D of the Quotation Module brief. Edits Config, Product Catalogue
// rates, Pricing Bands, the iCAFFE rate-card matrix, and Terms. Stored
// under masters.quotation and persisted via the existing saveSettings
// (Masters "Push to Cloud" / auto-save) — no new persistence layer, no
// hard-coded rates anywhere else (brief §13).
//
// Role-gated by the caller (admin only). Inline CC03 > CC04 validation
// blocks an invalid rate card (brief §9).
// ═══════════════════════════════════════════════════════════════════

import { useState } from "react";
import { AlertTriangle, RotateCcw, Clock, Plus, Trash2, X } from "lucide-react";
import {
  QUOTE_CONFIG, HANS_CATALOGUE, PRICING_BANDS, ICAFFE_EDITIONS,
  ICAFFE_BAND_LABELS, QUOTE_TERMS,
} from "../data/quotationMasters";
import { validateCcsRule } from "../lib/quotation/pricingEngine";

// Resolve current masters with seeded fallbacks.
export function resolveQuotationMasters(masters) {
  const qm = (masters && masters.quotation) || {};
  return {
    quoteConfig: { ...QUOTE_CONFIG, ...(qm.quoteConfig || {}) },
    catalogue: qm.catalogue && qm.catalogue.length ? qm.catalogue : HANS_CATALOGUE,
    bands: qm.bands && qm.bands.length ? qm.bands : PRICING_BANDS,
    editions: qm.editions && qm.editions.length ? qm.editions : ICAFFE_EDITIONS,
    terms: qm.terms && qm.terms.length ? qm.terms : QUOTE_TERMS,
  };
}

const cell = { padding: "5px 7px", border: "1px solid var(--border)", fontSize: 12 };
const numInput = { width: "100%", border: "none", background: "transparent", fontSize: 12, textAlign: "right", fontFamily: "'Outfit',sans-serif" };

export default function QuotationMasters({ masters, setMasters }) {
  const cur = resolveQuotationMasters(masters);
  const [sub, setSub] = useState("config");
  const [schedFor, setSchedFor] = useState(null); // product code whose rate schedule is open

  // Write a slice back into masters.quotation (merging with current resolved set).
  const writeQ = (patch) => setMasters(m => ({ ...m, quotation: { ...cur, ...(m?.quotation || {}), ...patch } }));

  const setConfig = (key, val) => writeQ({ quoteConfig: { ...cur.quoteConfig, [key]: val } });
  const setCatRow = (code, key, val) => writeQ({ catalogue: cur.catalogue.map(p => p.code === code ? { ...p, [key]: val } : p) });
  const setBandRate = (band, val) => writeQ({ bands: cur.bands.map(b => b.band === band ? { ...b, ratePerUserMonth: val } : b) });
  const setEditionRate = (name, idx, val) => writeQ({ editions: cur.editions.map(e => e.name === name ? { ...e, rates: e.rates.map((r, i) => i === idx ? val : r) } : e) });
  const setBandSchedule = (band, arr) => writeQ({ bands: cur.bands.map(b => b.band === band ? { ...b, rateSchedule: arr } : b) });
  const setEditionSchedule = (name, arr) => writeQ({ editions: cur.editions.map(e => e.name === name ? { ...e, rateSchedule: arr } : e) });
  const setTerm = (key, text) => writeQ({ terms: cur.terms.map(t => t.key === key ? { ...t, text } : t) });

  const ccs = validateCcsRule(cur.catalogue);

  const numOrNull = (v) => v === "" ? null : Number(v);

  // ── Masters health / coverage — surface the gaps centrally instead of
  //    only discovering them when a rep builds a quote. ──
  // A Flat product with listPrice === 0 is a deliberate "inclusive / at
  // actuals" rate, not a gap. Band/iCAFFE products price from their own tabs.
  const flatActive = cur.catalogue.filter(p => p.rateSource === "Flat" && p.active !== false);
  const flatMissing = flatActive.filter(p => p.listPrice == null);
  const bandsTotal = cur.bands.length;
  const bandsFilled = cur.bands.filter(b => b.ratePerUserMonth != null).length;
  const usesBand = cur.catalogue.some(p => p.rateSource === "Band" && p.active !== false);
  const icaffeCells = cur.editions.reduce((s, e) => s + e.rates.length, 0);
  const icaffeFilled = cur.editions.reduce((s, e) => s + e.rates.filter(r => r != null).length, 0);
  // Per-product coverage status (drives the catalogue Status chips).
  const rowStatus = (p) => {
    if (p.rateSource === "Band") return usesBand && bandsFilled < bandsTotal ? { label: "Needs bands", c: "#B45309", bg: "#FFFBEB" } : { label: "From bands", c: "#1E40AF", bg: "#EFF6FF" };
    if (p.rateSource === "iCAFFE") return icaffeFilled < icaffeCells ? { label: "Rate card gaps", c: "#B45309", bg: "#FFFBEB" } : { label: "From rate card", c: "#1E40AF", bg: "#EFF6FF" };
    if (p.listPrice == null) return { label: "Rate missing", c: "#B91C1C", bg: "#FEF2F2" };
    if (Number(p.listPrice) === 0) return { label: "Inclusive", c: "#64748B", bg: "#F1F5F9" };
    return { label: "Priced", c: "#15803D", bg: "#F0FDF4" };
  };
  const healthChip = (label, ok, detail, tab) => (
    <button type="button" onClick={() => tab && setSub(tab)} title={tab ? "Go to tab" : ""}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, border: `1px solid ${ok ? "#A7F3D0" : "#FDE68A"}`, background: ok ? "#F0FDF4" : "#FFFBEB", cursor: tab ? "pointer" : "default", fontSize: 11.5 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: ok ? "#22C55E" : "#F59E0B" }} />
      <span style={{ fontWeight: 700, color: "var(--text2)" }}>{label}</span>
      <span style={{ color: "var(--text3)" }}>{detail}</span>
    </button>
  );

  const SUBS = [
    { id: "config", label: "Config" },
    { id: "catalogue", label: "Catalogue rates" },
    { id: "bands", label: "Pricing Bands" },
    { id: "icaffe", label: "iCAFFE Rate Card" },
    { id: "terms", label: "Terms" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {SUBS.map(s => (
            <button key={s.id} className={`btn btn-xs ${sub === s.id ? "btn-primary" : "btn-sec"}`} onClick={() => setSub(s.id)}>{s.label}</button>
          ))}
        </div>
        <button className="btn btn-sec btn-xs" onClick={() => { if (window.confirm("Reset quotation masters to the workbook defaults?")) setMasters(m => ({ ...m, quotation: undefined })); }}>
          <RotateCcw size={12} /> Reset to defaults
        </button>
      </div>

      {/* ── Masters health / coverage strip ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text3)" }}>Pricing coverage</span>
        {healthChip("Catalogue", flatMissing.length === 0, `${flatActive.length - flatMissing.length}/${flatActive.length} flat rates`, "catalogue")}
        {healthChip("Pricing bands", !usesBand || bandsFilled === bandsTotal, `${bandsFilled}/${bandsTotal} filled`, "bands")}
        {healthChip("iCAFFE rate card", icaffeFilled === icaffeCells, `${icaffeFilled}/${icaffeCells} cells`, "icaffe")}
        {healthChip("CC03 > CC04", ccs.ok, ccs.ok ? "valid" : "invalid", "catalogue")}
      </div>

      {flatMissing.length > 0 && sub !== "catalogue" && (
        <div style={{ fontSize: 12, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
          {flatMissing.length} product{flatMissing.length > 1 ? "s" : ""} need a list price before they can be quoted (e.g. {flatMissing.slice(0, 3).map(p => p.code).join(", ")}{flatMissing.length > 3 ? "…" : ""}). <button type="button" onClick={() => setSub("catalogue")} style={{ background: "none", border: "none", color: "var(--brand)", fontWeight: 700, cursor: "pointer", padding: 0 }}>Open Catalogue rates →</button>
        </div>
      )}

      {!ccs.ok && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FCA5A5", borderRadius: 8, padding: "8px 12px", fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}>
          <AlertTriangle size={15} /> {ccs.error} — fix before pushing to cloud.
        </div>
      )}

      {/* ── Config ── */}
      {sub === "config" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, maxWidth: 720 }}>
          {[
            ["homeState", "Home state (GST pivot)", "text"],
            ["gstRatePct", "GST rate %", "number"],
            ["maxUserDiscountPct", "Max discount % (approval)", "number"],
            ["alrPctOfLicence", "ALR % of licence", "number"],
            ["prepaymentDiscountPctDefault", "Default prepayment %", "number"],
            ["minMarginPct", "Min margin % (0 = off)", "number"],
            ["fx", "FX to INR (divisor)", "number"],
          ].map(([k, label, type]) => (
            <div className="form-group" key={k}>
              <label>{label}</label>
              <input type={type} value={cur.quoteConfig[k]} onChange={e => {
                const v = e.target.value;
                // Don't let an emptied field silently persist as 0 (which would
                // mean 0% GST / 0% discount cap). Keep the prior value when
                // cleared; typing "0" still sets 0 explicitly.
                setConfig(k, type === "number" ? (v === "" ? cur.quoteConfig[k] : Number(v)) : v);
              }} />
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1", fontSize: 11, color: "var(--text3)" }}>
            Quote number format: <code>{cur.quoteConfig.quoteNumberPrefix}</code> + {cur.quoteConfig.quoteNumberSeqWidth}-digit sequence + <code>/YY-YY</code> (fiscal year, Apr–Mar).
          </div>
        </div>
      )}

      {/* ── Catalogue rates ── */}
      {sub === "catalogue" && (
        <div style={{ overflowX: "auto" }}>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>
            Edit list price (Flat models) and per-month floor (PaaS). Band/iCAFFE products price from their own tabs — list price stays blank for them.
          </div>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
            <thead>
              <tr style={{ background: "var(--s2)", textAlign: "left" }}>
                {["Code", "Name", "Model", "Unit", "Rate source", "List price (₹)", "Cost (₹)", "Floor/mo (₹)", "Status", "Active"].map(h => <th key={h} style={{ ...cell, fontSize: 10.5, textTransform: "uppercase", color: "var(--text3)" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {cur.catalogue.map(p => {
                const editablePrice = p.rateSource === "Flat";
                const ccRow = (p.code === "CC03" || p.code === "CC04") && !ccs.ok;
                const st = rowStatus(p);
                const priceMissing = editablePrice && p.listPrice == null && p.active !== false;
                return (
                  <tr key={p.code} style={{ background: ccRow ? "#FEF2F2" : "transparent" }}>
                    <td style={{ ...cell, fontFamily: "monospace", fontWeight: 700 }}>{p.code}</td>
                    <td style={cell}>{p.name}</td>
                    <td style={{ ...cell, color: "var(--text3)" }}>{p.pricingModel}</td>
                    <td style={{ ...cell, color: "var(--text3)" }}>{p.unit}</td>
                    <td style={{ ...cell, color: "var(--text3)" }}>{p.rateSource}</td>
                    <td style={{ ...cell, ...(priceMissing ? { background: "#FEF2F2", boxShadow: "inset 0 0 0 1px #FCA5A5" } : {}) }}>
                      {editablePrice
                        ? <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <input style={numInput} type="number" placeholder={priceMissing ? "enter rate" : ""} value={p.listPrice ?? ""} onChange={e => setCatRow(p.code, "listPrice", numOrNull(e.target.value))} />
                            <button type="button" title="Scheduled rate changes (effective-dated)" onClick={() => setSchedFor({ kind: "flat", key: p.code })}
                              style={{ display: "inline-flex", alignItems: "center", gap: 2, border: "1px solid var(--border)", background: (p.rateSchedule || []).length ? "#EFF6FF" : "transparent", color: (p.rateSchedule || []).length ? "#1E40AF" : "var(--text3)", borderRadius: 5, padding: "1px 5px", cursor: "pointer", fontSize: 10, flexShrink: 0 }}>
                              <Clock size={11} />{(p.rateSchedule || []).length || ""}
                            </button>
                          </span>
                        : <span style={{ color: "var(--text3)", fontSize: 11 }}>— {p.rateSource} —</span>}
                    </td>
                    <td style={cell}>
                      <input style={numInput} type="number" placeholder="—" title="Per-unit cost — drives the margin guardrail" value={p.costPrice ?? ""} onChange={e => setCatRow(p.code, "costPrice", numOrNull(e.target.value))} />
                    </td>
                    <td style={cell}>
                      <input style={numInput} type="number" value={p.minMonthFloor ?? ""} onChange={e => setCatRow(p.code, "minMonthFloor", numOrNull(e.target.value))} />
                    </td>
                    <td style={cell}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, color: st.c, background: st.bg, whiteSpace: "nowrap" }}>{st.label}</span>
                    </td>
                    <td style={{ ...cell, textAlign: "center" }}>
                      <input type="checkbox" checked={p.active !== false} onChange={e => setCatRow(p.code, "active", e.target.checked)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pricing Bands ── */}
      {sub === "bands" && (
        <table style={{ borderCollapse: "collapse", maxWidth: 560 }}>
          <thead>
            <tr style={{ background: "var(--s2)", textAlign: "left" }}>
              {["Band", "From users", "To users", "₹ / user / month", "Schedule"].map(h => <th key={h} style={{ ...cell, fontSize: 10.5, textTransform: "uppercase", color: "var(--text3)" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {cur.bands.map(b => (
              <tr key={b.band}>
                <td style={cell}>{b.band}</td>
                <td style={{ ...cell, textAlign: "right" }}>{b.fromUsers}</td>
                <td style={{ ...cell, textAlign: "right" }}>{b.toUsers}</td>
                <td style={cell}><input style={numInput} type="number" value={b.ratePerUserMonth ?? ""} onChange={e => setBandRate(b.band, numOrNull(e.target.value))} /></td>
                <td style={{ ...cell, textAlign: "center" }}>
                  <button type="button" title="Scheduled rate changes (effective-dated)" onClick={() => setSchedFor({ kind: "band", key: b.band })}
                    style={{ display: "inline-flex", alignItems: "center", gap: 2, border: "1px solid var(--border)", background: (b.rateSchedule || []).length ? "#EFF6FF" : "transparent", color: (b.rateSchedule || []).length ? "#1E40AF" : "var(--text3)", borderRadius: 5, padding: "1px 6px", cursor: "pointer", fontSize: 10 }}>
                    <Clock size={11} />{(b.rateSchedule || []).length || ""}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── iCAFFE matrix ── */}
      {sub === "icaffe" && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "var(--s2)" }}>
                <th style={{ ...cell, textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--text3)" }}>Edition</th>
                {ICAFFE_BAND_LABELS.map(l => <th key={l} style={{ ...cell, fontSize: 10, color: "var(--text3)" }}>{l}</th>)}
                <th style={{ ...cell, fontSize: 10, color: "var(--text3)" }}>Sched</th>
              </tr>
            </thead>
            <tbody>
              {cur.editions.map(e => (
                <tr key={e.name}>
                  <td style={{ ...cell, fontWeight: 600 }}>{e.name}</td>
                  {e.rates.map((r, i) => (
                    <td key={i} style={cell}><input style={numInput} type="number" value={r ?? ""} onChange={ev => setEditionRate(e.name, i, numOrNull(ev.target.value))} /></td>
                  ))}
                  <td style={{ ...cell, textAlign: "center" }}>
                    <button type="button" title="Scheduled rate-row changes (effective-dated)" onClick={() => setSchedFor({ kind: "edition", key: e.name })}
                      style={{ display: "inline-flex", alignItems: "center", gap: 2, border: "1px solid var(--border)", background: (e.rateSchedule || []).length ? "#EFF6FF" : "transparent", color: (e.rateSchedule || []).length ? "#1E40AF" : "var(--text3)", borderRadius: 5, padding: "1px 6px", cursor: "pointer", fontSize: 10 }}>
                      <Clock size={11} />{(e.rateSchedule || []).length || ""}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Terms ── */}
      {sub === "terms" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 720 }}>
          {cur.terms.map(t => (
            <div className="form-group" key={t.key}>
              <label>{t.key}</label>
              <textarea rows={2} value={t.text} onChange={e => setTerm(t.key, e.target.value)} />
            </div>
          ))}
        </div>
      )}

      {/* ── Rate schedule editor (effective-dated rates · Phase 2a) ── */}
      {schedFor && (() => {
        const { kind, key } = schedFor;
        const obj = kind === "flat" ? cur.catalogue.find(x => x.code === key)
          : kind === "band" ? cur.bands.find(b => b.band === key)
          : cur.editions.find(e => e.name === key);
        if (!obj) return null;
        const sched = Array.isArray(obj.rateSchedule) ? obj.rateSchedule : [];
        const setSched = (arr) => kind === "flat" ? setCatRow(key, "rateSchedule", arr)
          : kind === "band" ? setBandSchedule(key, arr) : setEditionSchedule(key, arr);
        const update = (i, patch) => setSched(sched.map((s, idx) => idx === i ? { ...s, ...patch } : s));
        const title = kind === "flat" ? `${obj.code} ${obj.name}` : kind === "band" ? `Band ${obj.band}` : obj.name;
        const blankEntry = kind === "edition"
          ? { effectiveFrom: "", rates: obj.rates.map(() => null) }
          : kind === "band" ? { effectiveFrom: "", ratePerUserMonth: null } : { effectiveFrom: "", listPrice: null };
        const baseLabel = kind === "flat" ? `Base list price ${obj.listPrice ?? "—"}`
          : kind === "band" ? `Base rate ${obj.ratePerUserMonth ?? "—"}/user/mo` : "Base rate-row (per band)";
        const wide = kind === "edition";
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setSchedFor(null)}>
            <div style={{ width: wide ? 900 : 480, maxWidth: "96vw", background: "var(--surface)", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.25)", maxHeight: "90vh", overflow: "auto" }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}><Clock size={15} /> Rate schedule · {title}</div>
                <button className="icon-btn" onClick={() => setSchedFor(null)}><X size={16} /></button>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 10 }}>
                  <b style={{ color: "var(--text1)" }}>{baseLabel}</b> applies until a scheduled date. A quote uses the latest scheduled rate effective on/before its quote date.
                </div>
                {sched.length === 0 && <div style={{ fontSize: 12, color: "var(--text3)", padding: "8px 0" }}>No scheduled changes — the base rate always applies.</div>}
                {sched.map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8, flexWrap: wide ? "wrap" : "nowrap" }}>
                    <div className="form-group" style={{ marginBottom: 0, width: 150 }}>
                      <label style={{ fontSize: 9 }}>Effective from</label>
                      <input type="date" value={s.effectiveFrom || ""} onChange={e => update(i, { effectiveFrom: e.target.value })} />
                    </div>
                    {kind === "flat" && (
                      <div className="form-group" style={{ marginBottom: 0, width: 150 }}><label style={{ fontSize: 9 }}>List price (₹)</label>
                        <input type="number" value={s.listPrice ?? ""} onChange={e => update(i, { listPrice: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                    )}
                    {kind === "band" && (
                      <div className="form-group" style={{ marginBottom: 0, width: 150 }}><label style={{ fontSize: 9 }}>₹ / user / mo</label>
                        <input type="number" value={s.ratePerUserMonth ?? ""} onChange={e => update(i, { ratePerUserMonth: e.target.value === "" ? null : Number(e.target.value) })} /></div>
                    )}
                    {kind === "edition" && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
                        {(s.rates || []).map((rv, ri) => (
                          <div key={ri} style={{ width: 64 }}>
                            <div style={{ fontSize: 8, color: "var(--text3)" }}>{ICAFFE_BAND_LABELS[ri]}</div>
                            <input style={numInput} type="number" value={rv ?? ""} onChange={e => update(i, { rates: s.rates.map((x, xi) => xi === ri ? (e.target.value === "" ? null : Number(e.target.value)) : x) })} />
                          </div>
                        ))}
                      </div>
                    )}
                    <button className="icon-btn" title="Remove" style={{ color: "#DC2626" }} onClick={() => setSched(sched.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>
                  </div>
                ))}
                <button className="btn btn-sec btn-xs" style={{ marginTop: 4 }} onClick={() => setSched([...sched, blankEntry])}><Plus size={12} /> Add scheduled rate</button>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", padding: 12, borderTop: "1px solid var(--border)" }}>
                <button className="btn btn-primary btn-xs" onClick={() => setSchedFor(null)}>Done</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
