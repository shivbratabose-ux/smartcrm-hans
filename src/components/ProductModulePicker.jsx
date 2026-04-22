// ─── Product + Module Picker ──────────────────────────────────────────────
// Reusable picker that reads the live Product Catalogue (catalog prop) so
// edits in Masters propagate everywhere instantly. Designed to flow through
// Lead → Opportunity → Account → Quote → Contract via a single shape.
//
// Value shape:
//   [
//     { productId: "iCAFFE",    moduleIds: ["m_ic1","m_ic2"], noAddons: false },
//     { productId: "WiseCargo", moduleIds: [],                noAddons: true  },
//   ]
//
// Validation contract (enforced by caller via validateProductSelection):
//   - At least one product line selected
//   - For each selected line: either ≥1 module checked, OR noAddons === true
//     (the explicit "None" choice the user must make to acknowledge there
//      are no add-ons being scoped — prevents accidentally-empty selections)
import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Plus, X } from "lucide-react";

const TYPE_STYLE = {
  "Core":        { bg: "#DCFCE7", fg: "#15803D" },
  "Add-on":      { bg: "#DBEAFE", fg: "#1D4ED8" },
  "Integration": { bg: "#FEF3C7", fg: "#B45309" },
  "Analytics":   { bg: "#F3E8FF", fg: "#7C3AED" },
};

export function validateProductSelection(value) {
  const list = Array.isArray(value) ? value : [];
  if (list.length === 0) return "Select at least one product line";
  for (const entry of list) {
    const mods = entry.moduleIds || [];
    if (mods.length === 0 && !entry.noAddons) {
      return `Pick at least one module for ${entry.productId} — or choose "None" if no add-ons apply`;
    }
  }
  return null;
}

// Convenience: derive the legacy single `product` field (first selected line)
// so existing list/filter/report code that reads lead.product keeps working.
export function primaryProductId(value) {
  return (Array.isArray(value) && value[0]?.productId) || "";
}

// Read-only display of a productSelection — used in detail panes / list rows
// across Accounts, Quotations, Contracts so the data stays consistent with
// what was picked in the form. Falls back gracefully when only legacy
// `products` array is available.
export function ProductSelectionDisplay({ value, catalog, fallbackProducts, compact = false }) {
  const list = Array.isArray(value) && value.length > 0
    ? value
    : (fallbackProducts || []).filter(Boolean).map(productId => ({ productId, moduleIds: [], noAddons: false }));
  if (list.length === 0) return <span style={{ fontSize: 12, color: "var(--text3)" }}>No products selected</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 4 : 8 }}>
      {list.map(entry => {
        const product = (catalog || []).find(p => p.id === entry.productId);
        const name = product?.name || entry.productId;
        const color = product?.color || "var(--text2)";
        const bg = product?.bg || "#F8FAFC";
        const modules = product?.modules || [];
        const picked = entry.moduleIds || [];
        const pickedMods = modules.filter(m => picked.includes(m.id));
        return (
          <div key={entry.productId} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: compact ? 11 : 12, fontWeight: 700, color, background: bg, padding: "2px 8px", borderRadius: 4, alignSelf: "flex-start" }}>
              {name}
              {entry.noAddons && <span style={{ fontSize: 10, color: "var(--text3)", fontWeight: 500 }}>· no add-ons</span>}
              {!entry.noAddons && pickedMods.length > 0 && <span style={{ fontSize: 10, color: "var(--text3)", fontWeight: 500 }}>· {pickedMods.length} module{pickedMods.length === 1 ? "" : "s"}</span>}
            </span>
            {!entry.noAddons && pickedMods.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, paddingLeft: 6 }}>
                {pickedMods.map(m => {
                  const ts = TYPE_STYLE[m.type] || { bg: "#E2E8F0", fg: "#475569" };
                  return (
                    <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, padding: "1px 6px", borderRadius: 3, background: ts.bg, color: ts.fg, fontWeight: 600 }}>
                      <span style={{ fontWeight: 700, opacity: 0.7 }}>{m.type}</span>
                      <span>{m.name}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Flatten productSelection into a CSV-friendly string:
//   "iCAFFE[eSanchit Filing|OCR Engine]; WiseCargo[None]"
export function productSelectionToString(value, catalog) {
  const list = Array.isArray(value) ? value : [];
  if (list.length === 0) return "";
  return list.map(entry => {
    const product = (catalog || []).find(p => p.id === entry.productId);
    const name = product?.name || entry.productId;
    if (entry.noAddons) return `${name}[None]`;
    const mods = (product?.modules || []).filter(m => (entry.moduleIds || []).includes(m.id));
    if (mods.length === 0) return name;
    return `${name}[${mods.map(m => m.name).join("|")}]`;
  }).join("; ");
}

export default function ProductModulePicker({ value, onChange, catalog, error }) {
  const selection = Array.isArray(value) ? value : [];
  const [expanded, setExpanded] = useState(() => {
    const init = {};
    selection.forEach(s => { init[s.productId] = true; });
    return init;
  });
  const [picking, setPicking] = useState(false); // shows the "add product line" chooser

  const selectedIds = new Set(selection.map(s => s.productId));
  const available = (catalog || []).filter(p => !selectedIds.has(p.id));

  const updateEntry = (productId, patch) => {
    onChange(selection.map(e => e.productId === productId ? { ...e, ...patch } : e));
  };
  const addLine = (productId) => {
    onChange([...selection, { productId, moduleIds: [], noAddons: false }]);
    setExpanded(x => ({ ...x, [productId]: true }));
    setPicking(false);
  };
  const removeLine = (productId) => {
    onChange(selection.filter(e => e.productId !== productId));
  };
  const toggleModule = (productId, moduleId) => {
    const entry = selection.find(e => e.productId === productId);
    if (!entry) return;
    const has = (entry.moduleIds || []).includes(moduleId);
    const next = has
      ? entry.moduleIds.filter(m => m !== moduleId)
      : [...(entry.moduleIds || []), moduleId];
    // Picking a module clears the "noAddons" flag — they're mutually exclusive
    updateEntry(productId, { moduleIds: next, noAddons: next.length > 0 ? false : entry.noAddons });
  };
  const toggleNone = (productId) => {
    const entry = selection.find(e => e.productId === productId);
    if (!entry) return;
    // "None" is exclusive with module picks
    updateEntry(productId, { noAddons: !entry.noAddons, moduleIds: entry.noAddons ? entry.moduleIds : [] });
  };

  return (
    <div style={{ border: error ? "1px solid #EF4444" : "1px solid var(--border)", borderRadius: 8, padding: 10, background: "var(--surface, #FFF)" }}>
      {selection.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--text3)", padding: "6px 4px" }}>
          No product lines selected yet.
        </div>
      )}

      {selection.map(entry => {
        const product = (catalog || []).find(p => p.id === entry.productId);
        if (!product) return null;
        const modules = product.modules || [];
        const isOpen = expanded[entry.productId];
        const picked = entry.moduleIds || [];
        const summary = entry.noAddons
          ? "No add-ons"
          : picked.length > 0
            ? `${picked.length} module${picked.length === 1 ? "" : "s"}`
            : "Select modules or choose None";

        return (
          <div key={entry.productId} style={{ border: "1px solid var(--border)", borderRadius: 6, marginBottom: 8, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: product.bg || "#F8FAFC", cursor: "pointer" }}
              onClick={() => setExpanded(x => ({ ...x, [entry.productId]: !x[entry.productId] }))}>
              {isOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
              <span style={{ fontWeight: 700, fontSize: 13, color: product.color || "var(--text)" }}>{product.name}</span>
              <span style={{ fontSize: 11, color: "var(--text3)", flex: 1 }}>{summary}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); removeLine(entry.productId); }}
                aria-label={`Remove ${product.name}`}
                style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--text3)", display: "flex" }}>
                <X size={14}/>
              </button>
            </div>
            {isOpen && (
              <div style={{ padding: "8px 10px", background: "#FFF" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, marginBottom: 8, cursor: "pointer", color: entry.noAddons ? "var(--brand)" : "var(--text2)" }}>
                  <input type="checkbox" checked={!!entry.noAddons} onChange={() => toggleNone(entry.productId)}/>
                  None — no add-ons / modules required
                </label>
                {!entry.noAddons && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {modules.length === 0 && (
                      <div style={{ fontSize: 11, color: "var(--text3)" }}>This product has no modules defined in Masters.</div>
                    )}
                    {modules.map(m => {
                      const checked = picked.includes(m.id);
                      const ts = TYPE_STYLE[m.type] || { bg: "#E2E8F0", fg: "#475569" };
                      return (
                        <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", borderRadius: 4, cursor: "pointer", background: checked ? "#F0F9FF" : "transparent" }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleModule(entry.productId, m.id)}/>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: ts.bg, color: ts.fg }}>{m.type}</span>
                          <span style={{ fontSize: 12, fontWeight: 500 }}>{m.name}</span>
                          {m.desc && <span style={{ fontSize: 11, color: "var(--text3)" }}>— {m.desc}</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {picking ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 4 }}>
          {available.length === 0 && <span style={{ fontSize: 11, color: "var(--text3)" }}>All product lines added.</span>}
          {available.map(p => (
            <button key={p.id} type="button" onClick={() => addLine(p.id)}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--border)", background: p.bg || "#F8FAFC", color: p.color || "var(--text)", cursor: "pointer" }}>
              <Check size={11}/> {p.name}
            </button>
          ))}
          <button type="button" onClick={() => setPicking(false)} className="btn btn-sec btn-xs">Cancel</button>
        </div>
      ) : (
        available.length > 0 && (
          <button type="button" onClick={() => setPicking(true)} className="btn btn-sec btn-xs" style={{ marginTop: 4 }}>
            <Plus size={11}/> Add product line
          </button>
        )
      )}

      {error && <div style={{ fontSize: 11, color: "#DC2626", marginTop: 6 }}>{error}</div>}
    </div>
  );
}
