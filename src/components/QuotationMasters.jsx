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
import { AlertTriangle, RotateCcw } from "lucide-react";
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

  // Write a slice back into masters.quotation (merging with current resolved set).
  const writeQ = (patch) => setMasters(m => ({ ...m, quotation: { ...cur, ...(m?.quotation || {}), ...patch } }));

  const setConfig = (key, val) => writeQ({ quoteConfig: { ...cur.quoteConfig, [key]: val } });
  const setCatRow = (code, key, val) => writeQ({ catalogue: cur.catalogue.map(p => p.code === code ? { ...p, [key]: val } : p) });
  const setBandRate = (band, val) => writeQ({ bands: cur.bands.map(b => b.band === band ? { ...b, ratePerUserMonth: val } : b) });
  const setEditionRate = (name, idx, val) => writeQ({ editions: cur.editions.map(e => e.name === name ? { ...e, rates: e.rates.map((r, i) => i === idx ? val : r) } : e) });
  const setTerm = (key, text) => writeQ({ terms: cur.terms.map(t => t.key === key ? { ...t, text } : t) });

  const ccs = validateCcsRule(cur.catalogue);

  const numOrNull = (v) => v === "" ? null : Number(v);

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
                {["Code", "Name", "Model", "Unit", "Rate source", "List price (₹)", "Floor/mo (₹)", "Active"].map(h => <th key={h} style={{ ...cell, fontSize: 10.5, textTransform: "uppercase", color: "var(--text3)" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {cur.catalogue.map(p => {
                const editablePrice = p.rateSource === "Flat";
                const ccRow = (p.code === "CC03" || p.code === "CC04") && !ccs.ok;
                return (
                  <tr key={p.code} style={{ background: ccRow ? "#FEF2F2" : "transparent" }}>
                    <td style={{ ...cell, fontFamily: "monospace", fontWeight: 700 }}>{p.code}</td>
                    <td style={cell}>{p.name}</td>
                    <td style={{ ...cell, color: "var(--text3)" }}>{p.pricingModel}</td>
                    <td style={{ ...cell, color: "var(--text3)" }}>{p.unit}</td>
                    <td style={{ ...cell, color: "var(--text3)" }}>{p.rateSource}</td>
                    <td style={cell}>
                      {editablePrice
                        ? <input style={numInput} type="number" value={p.listPrice ?? ""} onChange={e => setCatRow(p.code, "listPrice", numOrNull(e.target.value))} />
                        : <span style={{ color: "var(--text3)", fontSize: 11 }}>— {p.rateSource} —</span>}
                    </td>
                    <td style={cell}>
                      <input style={numInput} type="number" value={p.minMonthFloor ?? ""} onChange={e => setCatRow(p.code, "minMonthFloor", numOrNull(e.target.value))} />
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
              {["Band", "From users", "To users", "₹ / user / month"].map(h => <th key={h} style={{ ...cell, fontSize: 10.5, textTransform: "uppercase", color: "var(--text3)" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {cur.bands.map(b => (
              <tr key={b.band}>
                <td style={cell}>{b.band}</td>
                <td style={{ ...cell, textAlign: "right" }}>{b.fromUsers}</td>
                <td style={{ ...cell, textAlign: "right" }}>{b.toUsers}</td>
                <td style={cell}><input style={numInput} type="number" value={b.ratePerUserMonth ?? ""} onChange={e => setBandRate(b.band, numOrNull(e.target.value))} /></td>
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
              </tr>
            </thead>
            <tbody>
              {cur.editions.map(e => (
                <tr key={e.name}>
                  <td style={{ ...cell, fontWeight: 600 }}>{e.name}</td>
                  {e.rates.map((r, i) => (
                    <td key={i} style={cell}><input style={numInput} type="number" value={r ?? ""} onChange={ev => setEditionRate(e.name, i, numOrNull(ev.target.value))} /></td>
                  ))}
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
    </div>
  );
}
