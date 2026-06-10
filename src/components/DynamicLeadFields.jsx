import { PROD_MAP } from "../data/constants";
import { fieldsForProducts, LEAD_PRODUCT_FIELDS_DEFAULT } from "../data/leadFieldDict";

// ═══════════════════════════════════════════════════════════════════
// DYNAMIC LEAD FIELDS — product-specific qualifying questions
// ═══════════════════════════════════════════════════════════════════
// Renders the extra, product-specific lead-capture fields for whichever
// products the lead has selected (see leadFieldDict.js). Uses the SAME
// .form-row / .form-group markup as the rest of the lead form so it matches
// the native look (uppercase labels, identical inputs, subtle section header).
//
// Answers live in lead.productFields[<productKey>][<fieldKey>] — one JSONB blob.
//
// Props: productKeys[], value (productFields obj), onChange(next), dict (optional override)

const isFullWidth = (f) => f.type === "longtext" || f.type === "multiselect";

export default function DynamicLeadFields({ productKeys = [], value = {}, onChange, dict }) {
  const D = dict && Object.keys(dict).length ? dict : LEAD_PRODUCT_FIELDS_DEFAULT;
  const matched = fieldsForProducts(D, productKeys, PROD_MAP);
  if (!matched.length) return null;

  const setField = (pkey, fkey, v) => {
    const cur = value || {};
    onChange({ ...cur, [pkey]: { ...(cur[pkey] || {}), [fkey]: v } });
  };

  const renderInput = (pkey, f) => {
    const v = (value?.[pkey] || {})[f.key];
    switch (f.type) {
      case "longtext":
        return <textarea rows={2} value={v || ""} onChange={e => setField(pkey, f.key, e.target.value)} style={{ minHeight: 56 }} />;
      case "number":
        return <input type="number" value={v ?? ""} onChange={e => setField(pkey, f.key, e.target.value === "" ? "" : +e.target.value)} placeholder="0" />;
      case "date":
        return <input type="date" value={v || ""} onChange={e => setField(pkey, f.key, e.target.value)} />;
      case "rating":
        return (
          <select value={v ?? ""} onChange={e => setField(pkey, f.key, e.target.value === "" ? "" : +e.target.value)}>
            <option value="">—</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        );
      case "dropdown":
        return (
          <select value={v || ""} onChange={e => setField(pkey, f.key, e.target.value)}>
            <option value="">Select…</option>{(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      case "multiselect": {
        const arr = Array.isArray(v) ? v : [];
        const toggle = (opt) => setField(pkey, f.key, arr.includes(opt) ? arr.filter(x => x !== opt) : [...arr, opt]);
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 2 }}>
            {(f.options || []).map(opt => {
              const on = arr.includes(opt);
              return (
                <button type="button" key={opt} onClick={() => toggle(opt)}
                  style={{ fontSize: 11.5, padding: "4px 11px", borderRadius: 20, cursor: "pointer", border: "1px solid",
                    background: on ? "var(--brand)" : "var(--surface)", color: on ? "#fff" : "var(--text2)",
                    borderColor: on ? "var(--brand)" : "var(--border)" }}>
                  {opt}
                </button>
              );
            })}
          </div>
        );
      }
      default:
        return <input value={v || ""} onChange={e => setField(pkey, f.key, e.target.value)} />;
    }
  };

  // Chunk a product's fields into form-rows: full-width fields get their own
  // row; the rest pair up two-per-row — exactly like the native form.
  const toRows = (fields) => {
    const rows = []; let buf = [];
    for (const f of fields || []) {
      if (isFullWidth(f)) { if (buf.length) { rows.push({ full: false, fields: buf }); buf = []; } rows.push({ full: true, fields: [f] }); }
      else { buf.push(f); if (buf.length === 2) { rows.push({ full: false, fields: buf }); buf = []; } }
    }
    if (buf.length) rows.push({ full: false, fields: buf });
    return rows;
  };

  const fieldGroup = (pkey, f) => (
    <div className="form-group" key={f.key}>
      <label>{f.label}{f.required && <span style={{ color: "#DC2626" }}> *</span>}</label>
      {renderInput(pkey, f)}
    </div>
  );

  return (
    <>
      {matched.map(entry => (
        <div key={entry.key} style={{ borderTop: "1px solid var(--border)", marginTop: 14, paddingTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            {entry.label} — Qualifying Details
          </div>
          {toRows(entry.fields).map((row, i) => (
            <div className={`form-row${row.full ? " full" : ""}`} key={i}>
              {row.fields.map(f => fieldGroup(entry.key, f))}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
