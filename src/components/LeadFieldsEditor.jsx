import { useState, useMemo } from "react";
import { Plus, Trash2, Save, RotateCcw, ChevronDown } from "lucide-react";
import { LEAD_PRODUCT_FIELDS_DEFAULT, LEAD_FIELD_TYPES, normProductKey } from "../data/leadFieldDict";
import { notify } from "../utils/toast";

// ═══════════════════════════════════════════════════════════════════
// LEAD CAPTURE FIELDS EDITOR (Masters)
// ═══════════════════════════════════════════════════════════════════
// Visual editor for the per-product lead-capture field dictionary. Edits are
// kept in local state and committed to masters.leadProductFields on Save (so
// they persist to the cloud via app_settings). Falls back to the code default
// when no override exists.
//
// Field `key` is generated once from the label and kept stable on rename, so
// already-captured lead.productFields data keeps mapping correctly.

const TYPES_NEEDING_OPTIONS = new Set(["dropdown", "multiselect"]);

const keyFromLabel = (label) => {
  const words = String(label || "").replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/);
  if (!words.length) return "field" + Math.random().toString(36).slice(2, 6);
  return words.map((w, i) => i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
};

const clone = (o) => JSON.parse(JSON.stringify(o || {}));

export default function LeadFieldsEditor({ masters, setMasters, catalog = [] }) {
  // Working copy. Starts from the org override if present, else the code default.
  const initial = useMemo(
    () => clone(masters?.leadProductFields && Object.keys(masters.leadProductFields).length ? masters.leadProductFields : LEAD_PRODUCT_FIELDS_DEFAULT),
    [] // eslint-disable-line
  );
  const [dict, setDict] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const productKeys = Object.keys(dict);
  const [sel, setSel] = useState(productKeys[0] || "");
  const [newProd, setNewProd] = useState("");

  const touch = (next) => { setDict(next); setDirty(true); };
  const entry = dict[sel];

  // Products in the catalogue not yet in the dictionary (suggestions to add).
  const catalogSuggestions = (catalog || [])
    .map(p => p.name || p.id)
    .filter(n => n && !Object.keys(dict).some(k => normProductKey(k) === normProductKey(n)));

  const save = () => {
    setMasters(m => ({ ...m, leadProductFields: dict }));
    setDirty(false);
    notify.success("Lead capture fields saved. They apply across the Leads form.");
  };

  const resetAll = () => {
    if (!window.confirm("Reset ALL products to the built-in default field set? Your customisations will be removed.")) return;
    const d = clone(LEAD_PRODUCT_FIELDS_DEFAULT);
    setDict(d); setSel(Object.keys(d)[0] || ""); setDirty(true);
  };
  const resetProduct = () => {
    if (!LEAD_PRODUCT_FIELDS_DEFAULT[sel]) { notify.info("No built-in default for this product."); return; }
    touch({ ...dict, [sel]: clone(LEAD_PRODUCT_FIELDS_DEFAULT[sel]) });
  };

  const addProduct = (name) => {
    const nm = (name || "").trim();
    if (!nm) return;
    if (Object.keys(dict).some(k => normProductKey(k) === normProductKey(nm))) { notify.info(`"${nm}" already exists.`); setSel(Object.keys(dict).find(k => normProductKey(k) === normProductKey(nm))); return; }
    touch({ ...dict, [nm]: { label: nm, fields: [] } });
    setSel(nm); setNewProd("");
  };
  const deleteProduct = () => {
    if (!window.confirm(`Remove the product "${entry?.label || sel}" and its fields from the dictionary? (Existing lead data is not deleted.)`)) return;
    const next = { ...dict }; delete next[sel];
    setDict(next); setDirty(true); setSel(Object.keys(next)[0] || "");
  };

  const updEntry = (patch) => touch({ ...dict, [sel]: { ...entry, ...patch } });
  const updField = (i, patch) => updEntry({ fields: entry.fields.map((f, j) => j === i ? { ...f, ...patch } : f) });
  const addField = () => updEntry({ fields: [...(entry.fields || []), { key: "field" + Math.random().toString(36).slice(2, 6), label: "New Field", type: "text" }] });
  const delField = (i) => updEntry({ fields: entry.fields.filter((_, j) => j !== i) });
  const moveField = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= entry.fields.length) return;
    const arr = [...entry.fields]; [arr[i], arr[j]] = [arr[j], arr[i]]; updEntry({ fields: arr });
  };

  const inp = { fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", width: "100%" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, color: "var(--text2)", maxWidth: 640 }}>
          Define the extra qualifying fields shown on the Leads form for each product. The common A–F fields are always captured; these are the product-specific additions. Mark <strong>Sizing</strong> to feed the auto-score.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sec btn-sm" onClick={resetAll}><RotateCcw size={13} /> Reset all</button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={!dirty}><Save size={13} /> {dirty ? "Save changes" : "Saved"}</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, alignItems: "start" }}>
        {/* Product list */}
        <div className="card" style={{ padding: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>Products</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 360, overflow: "auto" }}>
            {productKeys.map(k => (
              <button key={k} onClick={() => setSel(k)}
                style={{ textAlign: "left", fontSize: 12.5, padding: "6px 8px", borderRadius: 6, border: "none", cursor: "pointer",
                  background: sel === k ? "var(--brand)" : "transparent", color: sel === k ? "#fff" : "var(--text2)" }}>
                {dict[k].label || k} <span style={{ opacity: 0.7, fontSize: 10 }}>({(dict[k].fields || []).length})</span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <input style={inp} list="lf-prod-sugg" placeholder="Add product…" value={newProd}
              onChange={e => setNewProd(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addProduct(newProd); }} />
            <datalist id="lf-prod-sugg">{catalogSuggestions.map(n => <option key={n} value={n} />)}</datalist>
            <button className="btn btn-sec btn-xs" style={{ marginTop: 6, width: "100%" }} onClick={() => addProduct(newProd)}><Plus size={12} /> Add product</button>
          </div>
        </div>

        {/* Field editor for selected product */}
        <div className="card" style={{ padding: 14 }}>
          {!entry ? (
            <div style={{ color: "var(--text3)", fontSize: 13, padding: 20, textAlign: "center" }}>Select or add a product on the left.</div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <input style={{ ...inp, fontWeight: 700, fontSize: 14, maxWidth: 320 }} value={entry.label || ""} onChange={e => updEntry({ label: e.target.value })} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-sec btn-xs" onClick={resetProduct} title="Reset this product to the built-in default"><RotateCcw size={12} /> Reset</button>
                  <button className="icon-btn" onClick={deleteProduct} title="Remove product" style={{ color: "#DC2626" }}><Trash2 size={14} /></button>
                </div>
              </div>

              {/* header */}
              <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1.8fr 56px 56px 70px", gap: 8, fontSize: 10.5, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".04em", padding: "0 2px 6px" }}>
                <span>Field Label</span><span>Type</span><span>Options (; separated)</span><span>Req.</span><span>Sizing</span><span></span>
              </div>
              {(entry.fields || []).map((f, i) => (
                <div key={f.key || i} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1.8fr 56px 56px 70px", gap: 8, alignItems: "center", padding: "4px 2px", borderTop: "1px solid var(--border)" }}>
                  <input style={inp} value={f.label || ""} onChange={e => updField(i, { label: e.target.value })} />
                  <select style={inp} value={f.type || "text"} onChange={e => updField(i, { type: e.target.value })}>
                    {LEAD_FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {TYPES_NEEDING_OPTIONS.has(f.type)
                    ? <input style={inp} placeholder="Option A; Option B; Option C" value={(f.options || []).join("; ")} onChange={e => updField(i, { options: e.target.value.split(";").map(s => s.trim()).filter(Boolean) })} />
                    : <span style={{ fontSize: 11, color: "var(--text3)" }}>—</span>}
                  <input type="checkbox" checked={!!f.required} onChange={e => updField(i, { required: e.target.checked })} style={{ justifySelf: "center" }} />
                  <input type="checkbox" checked={!!f.sizing} onChange={e => updField(i, { sizing: e.target.checked })} style={{ justifySelf: "center" }} title="Feeds the lead auto-score" />
                  <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                    <button className="icon-btn" onClick={() => moveField(i, -1)} title="Move up" style={{ padding: 3 }}>↑</button>
                    <button className="icon-btn" onClick={() => moveField(i, 1)} title="Move down" style={{ padding: 3 }}>↓</button>
                    <button className="icon-btn" onClick={() => delField(i)} title="Delete field" style={{ padding: 3, color: "#DC2626" }}><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
              {(entry.fields || []).length === 0 && <div style={{ fontSize: 12, color: "var(--text3)", padding: "12px 2px" }}>No product-specific fields yet.</div>}
              <button className="btn btn-sec btn-sm" style={{ marginTop: 10 }} onClick={addField}><Plus size={13} /> Add field</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
