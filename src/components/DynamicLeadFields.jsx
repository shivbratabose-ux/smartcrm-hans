import { PROD_MAP } from "../data/constants";
import { fieldsForProducts, LEAD_PRODUCT_FIELDS_DEFAULT } from "../data/leadFieldDict";

// ═══════════════════════════════════════════════════════════════════
// DYNAMIC LEAD FIELDS — product-specific qualifying questions
// ═══════════════════════════════════════════════════════════════════
// Renders the extra, product-specific lead-capture fields for whichever
// products the lead has selected (see leadFieldDict.js). Answers live in
// lead.productFields[<productKey>][<fieldKey>] — a single JSONB blob, so
// nothing is lost and no per-field columns are needed.
//
// Props:
//   productKeys : array of product ids/names the lead selected
//   value       : the lead.productFields object
//   onChange    : (nextProductFields) => void
//   dict        : optional dictionary override (defaults to the code dictionary;
//                 callers can pass an org override from Masters)

const lbl = { fontSize: 11, color: "var(--text3)", fontWeight: 600, marginBottom: 3, display: "block" };

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
    const common = { className: "f-input", style: { width: "100%" } };
    switch (f.type) {
      case "longtext":
        return <textarea {...common} rows={2} value={v || ""} onChange={e => setField(pkey, f.key, e.target.value)} style={{ ...common.style, resize: "vertical" }} />;
      case "number":
        return <input {...common} type="number" value={v ?? ""} onChange={e => setField(pkey, f.key, e.target.value === "" ? "" : +e.target.value)} />;
      case "date":
        return <input {...common} type="date" value={v || ""} onChange={e => setField(pkey, f.key, e.target.value)} />;
      case "rating":
        return (
          <select {...common} value={v ?? ""} onChange={e => setField(pkey, f.key, e.target.value === "" ? "" : +e.target.value)}>
            <option value="">—</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        );
      case "dropdown":
        return (
          <select {...common} value={v || ""} onChange={e => setField(pkey, f.key, e.target.value)}>
            <option value="">Select…</option>{(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      case "multiselect": {
        const arr = Array.isArray(v) ? v : [];
        const toggle = (opt) => setField(pkey, f.key, arr.includes(opt) ? arr.filter(x => x !== opt) : [...arr, opt]);
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {(f.options || []).map(opt => {
              const on = arr.includes(opt);
              return (
                <button type="button" key={opt} onClick={() => toggle(opt)}
                  style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, cursor: "pointer", border: "1px solid",
                    background: on ? "var(--brand)" : "transparent", color: on ? "#fff" : "var(--text2)",
                    borderColor: on ? "var(--brand)" : "var(--border)" }}>
                  {opt}
                </button>
              );
            })}
          </div>
        );
      }
      default: // text
        return <input {...common} value={v || ""} onChange={e => setField(pkey, f.key, e.target.value)} />;
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      {matched.map(entry => (
        <div key={entry.key} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", marginBottom: 10, background: "var(--s1)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--brand)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>
            {entry.label} — qualifying details
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
            {entry.fields.map(f => (
              <div key={f.key} style={{ gridColumn: (f.type === "longtext" || f.type === "multiselect") ? "1/-1" : "auto" }}>
                <label style={lbl}>{f.label}{f.required ? " *" : ""}{f.sizing ? " 📊" : ""}</label>
                {renderInput(entry.key, f)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
