// Masters → Quotation Rules → Terms & EULA. One "terms set" per group of
// products: which EULA the quotation links to and which Terms & Conditions it
// prints. Logic: lib/quotation/termSets.js.
import { useState } from "react";
import { Plus, Trash2, RotateCcw, Link2, FileText, Copy, Download, AlertTriangle } from "lucide-react";
import {
  resolveTermSets, isBuiltinSet, BUILTIN_TERM_SETS, DEFAULT_TC, TERMS_PLACEHOLDERS, eulaLinkOf, fillTerms, tcLines,
  upsertTermSet, assignProducts, makeDefault, unknownPlaceholders, SMART_CRM_SITE,
} from "../lib/quotation/termSets";

const mono = { fontFamily: "Consolas, 'Courier New', monospace", fontSize: 12, lineHeight: 1.5 };
const chip = (on) => ({ fontSize: 11.5, padding: "3px 9px", borderRadius: 14, cursor: "pointer", border: `1.5px solid ${on ? "var(--brand)" : "var(--border)"}`, background: on ? "var(--brand)" : "#fff", color: on ? "#fff" : "var(--text2)", fontWeight: on ? 700 : 500 });

/** The current MSA & EULA page → plain text the admin can edit (headings and paragraphs, blank-line separated). */
async function loadPublishedEula() {
  const res = await fetch("/legal/msa-eula-icaffe.html", { cache: "no-store" });
  if (!res.ok) throw new Error("Could not load the current MSA & EULA");
  const doc = new DOMParser().parseFromString(await res.text(), "text/html");
  return [...doc.querySelectorAll("main h2, main p:not(.sub):not(.ver)")].map((el) => el.textContent.trim()).filter(Boolean).join("\n\n");
}

export default function QuoteTermsMaster({ masters, setMasters, catalog = [] }) {
  const sets = resolveTermSets(masters);
  const [openId, setOpenId] = useState(sets.find((s) => s.isDefault)?.id || sets[0]?.id);
  const [busy, setBusy] = useState(false);
  const set = sets.find((s) => s.id === openId) || sets[0];
  const products = (catalog || []).filter((p) => p && p.id && p.active !== false);

  const save = (fn) => setMasters((m) => {
    const q = m?.quotation || {};
    return { ...m, quotation: { ...q, termSets: fn(q.termSets || [], resolveTermSets(m)) } };
  });
  const write = (patch) => save((saved, cur) => upsertTermSet(saved, { ...cur.find((s) => s.id === set.id), ...patch }));
  const toggleProduct = (pid) => save((saved, cur) => {
    const me = cur.find((s) => s.id === set.id);
    const ids = me.productIds.includes(pid) ? me.productIds.filter((x) => x !== pid) : [...me.productIds, pid];
    // assignProducts also takes the product out of the set that had it: one set per product.
    return assignProducts(cur, set.id, ids);
  });
  const addSet = () => {
    const id = `t_${Date.now().toString(36)}`;
    const def = sets.find((s) => s.isDefault) || sets[0];
    save((saved) => upsertTermSet(saved, { id, name: "New terms set", productIds: [], isDefault: false, eulaTitle: "Licence terms", eulaMode: "link", eulaUrl: "", eulaBody: "", governing: def.governing, tc: def.tc }));
    setOpenId(id);
  };
  const removeSet = () => {
    if (isBuiltinSet(set.id)) {
      if (!window.confirm(`Reset "${set.name}" to the standard wording and link? Your changes to this set are removed.`)) return;
      save((saved) => saved.filter((s) => s.id !== set.id));
      return;
    }
    if (!window.confirm(`Delete "${set.name}"? Its products go back to the default set.`)) return;
    save((saved, cur) => (set.isDefault ? makeDefault(cur.filter((s) => s.id !== set.id), "hans") : saved.filter((s) => s.id !== set.id)));
    setOpenId("hans");
  };
  const loadEula = async () => {
    if (set.eulaBody.trim() && !window.confirm("Replace the text below with the current published MSA & EULA?")) return;
    setBusy(true);
    try { write({ eulaMode: "text", eulaBody: await loadPublishedEula(), eulaTitle: set.eulaTitle || "Master Services Agreement & EULA" }); }
    catch (e) { window.alert(e.message); }
    setBusy(false);
  };

  const link = eulaLinkOf(set);
  const sampleProduct = products.find((p) => set.productIds.includes(p.id))?.name || (set.id === "orbis" ? "OrbisOne" : "iCAFFE");
  const ctx = { product: sampleProduct, company: "Hans Infomatic Pvt. Ltd.", customer: "Sample Logistics Pvt Ltd", validUntil: "25 November 2026" };
  const lines = tcLines(set, ctx);
  const unknown = unknownPlaceholders(set);
  const ownerOf = (pid) => sets.find((s) => s.productIds.includes(pid));
  const unlisted = products.filter((p) => !ownerOf(p.id));
  const textModeNoBody = set.eulaMode === "text" && !set.eulaBody.trim();

  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--text3)", marginBottom: 10, maxWidth: 900 }}>
        Each product's quotation links to its EULA / terms of use (it is not printed in full) and prints its own Terms and conditions.
        Pick the products for each set; products not in any set use the <b>default</b> set.
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        {sets.map((s) => (
          <button key={s.id} type="button" className={`btn btn-sm ${s.id === set.id ? "btn-primary" : "btn-sec"}`} onClick={() => setOpenId(s.id)}>
            <FileText size={12} />{s.name}{s.isDefault ? " · default" : ""} <span style={{ opacity: 0.7 }}>({s.productIds.length})</span>
          </button>
        ))}
        <button type="button" className="btn btn-sm btn-sec" onClick={addSet}><Plus size={12} />Add terms set</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Set name</label>
              <input value={set.name} onChange={(e) => write({ name: e.target.value })} />
            </div>
            <button type="button" className="btn btn-sm btn-sec" style={{ marginBottom: 12 }} onClick={removeSet} title={isBuiltinSet(set.id) ? "Reset to the standard wording" : "Delete this set"}>
              {isBuiltinSet(set.id) ? <><RotateCcw size={12} />Reset</> : <><Trash2 size={12} />Delete</>}
            </button>
          </div>

          <div className="form-group">
            <label>Products using this set</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {products.map((p) => {
                const owner = ownerOf(p.id);
                const on = owner?.id === set.id;
                return (
                  <button key={p.id} type="button" style={chip(on)} onClick={() => toggleProduct(p.id)}
                    title={on ? "Click to remove" : owner ? `Now in "${owner.name}": click to move here` : "Click to add"}>
                    {p.name}{!on && owner ? ` · ${owner.name.split(" ")[0]}` : ""}
                  </button>
                );
              })}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginTop: 8, fontWeight: 500, cursor: "pointer" }}>
              <input type="checkbox" checked={set.isDefault} disabled={set.isDefault} onChange={() => save((saved, cur) => makeDefault(cur, set.id))} />
              Default set: also used for products not listed in any set{set.isDefault && unlisted.length ? ` (now ${unlisted.length}: ${unlisted.slice(0, 6).map((p) => p.name).join(", ")}${unlisted.length > 6 ? "…" : ""})` : ""}
            </label>
          </div>

          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>EULA / terms of use</div>
            <div className="form-group">
              <label>Name (as printed on the quote)</label>
              <input value={set.eulaTitle} onChange={(e) => write({ eulaTitle: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 12.5, marginBottom: 8 }}>
              <label style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}><input type="radio" checked={set.eulaMode === "link"} onChange={() => write({ eulaMode: "link" })} />Link to a page</label>
              <label style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}><input type="radio" checked={set.eulaMode === "text"} onChange={() => write({ eulaMode: "text" })} />Write it here (the CRM publishes it)</label>
            </div>
            {set.eulaMode === "link" ? (
              <div className="form-group">
                <label>Link</label>
                <input value={set.eulaUrl} placeholder="https://…" onChange={(e) => write({ eulaUrl: e.target.value })} />
                {set.eulaUrl && !/^https:\/\//i.test(set.eulaUrl) && <div style={{ fontSize: 11.5, color: "#B91C1C", marginTop: 4 }}>Use a full https:// link.</div>}
              </div>
            ) : (
              <div className="form-group">
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>EULA text (blank line between paragraphs; numbered headings like "2. Grant of License")</span>
                  <button type="button" className="btn btn-xs btn-sec" disabled={busy} onClick={loadEula}><Download size={11} />Load current MSA &amp; EULA</button>
                </label>
                <textarea rows={14} value={set.eulaBody} onChange={(e) => write({ eulaBody: e.target.value })} style={mono}
                  placeholder={"Paste or write the licence terms here.\n\n1. Definitions\n\n“Customer” means …"} />
              </div>
            )}
            {link ? (
              <div style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <Link2 size={12} /> Quotes link to: <a href={link} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>{link}</a>
                <button type="button" className="icon-btn" title="Copy link" onClick={() => navigator.clipboard?.writeText(link)}><Copy size={12} /></button>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#B45309" }}><AlertTriangle size={12} style={{ verticalAlign: -2 }} /> {textModeNoBody ? "Write the text above, or choose a link." : "Add the link above."} Until then the quote has no EULA link.</div>
            )}
            {textModeNoBody && link && <div style={{ fontSize: 11.5, color: "#B45309", marginTop: 4 }}>No text yet, so quotes keep using the saved link until you add it.</div>}
            {set.eulaMode === "text" && !textModeNoBody && <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 4 }}>The page at this link shows the text saved here, so a change reaches every quote that links to it.</div>}
          </div>

          <div className="form-group">
            <label>Governing terms (printed as the first condition, followed by the link)</label>
            <textarea rows={3} value={set.governing} onChange={(e) => write({ governing: e.target.value })} />
          </div>
          <div className="form-group">
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Terms and conditions: one condition per line</span>
              <button type="button" className="btn btn-xs btn-sec" onClick={() => window.confirm("Replace with the standard Terms and conditions?") && write({ tc: DEFAULT_TC })}><RotateCcw size={11} />Standard text</button>
            </label>
            <textarea rows={12} value={set.tc} onChange={(e) => write({ tc: e.target.value })} style={mono} />
          </div>
          {unknown.length > 0 && <div style={{ fontSize: 12, color: "#B91C1C", marginBottom: 8 }}>Unknown placeholder{unknown.length > 1 ? "s" : ""}: {unknown.map((k) => `{{${k}}}`).join(", ")}</div>}
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4, fontWeight: 700, letterSpacing: ".4px" }}>PLACEHOLDERS — click to copy</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {TERMS_PLACEHOLDERS.map(([k, label]) => (
              <button key={k} type="button" title={label} onClick={() => navigator.clipboard?.writeText(`{{${k}}}`)}
                style={{ fontSize: 11, padding: "2px 8px", borderRadius: 12, border: "1px solid var(--border)", background: "#fff", cursor: "pointer", fontFamily: "Consolas, monospace" }}>
                {`{{${k}}}`} <span style={{ color: "var(--text3)" }}>· {label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6, fontWeight: 700, letterSpacing: ".4px" }}>PREVIEW — as printed on a {sampleProduct} quote</div>
          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", fontSize: 12, maxHeight: 640, overflowY: "auto", color: "#111827" }}>
            <div style={{ fontWeight: 800, color: "#1F2F6B", borderBottom: "2px solid #3DAE49", marginBottom: 6 }}>Terms and conditions</div>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              {(set.governing || link) && <li style={{ padding: "1px 0" }}>Governing terms. {fillTerms(set.governing, ctx)}{link ? <> Read them at <a href={link} target="_blank" rel="noreferrer">{link}</a>.</> : null}</li>}
              {lines.map((l, i) => <li key={i} style={{ padding: "1px 0" }}>{l}</li>)}
            </ol>
            {link && <div style={{ marginTop: 12, paddingTop: 5, borderTop: "1px solid #CBD5E1", fontSize: 11, color: "#64748B" }}><b>Terms:</b> this quotation is subject to the {set.eulaTitle}: {link}</div>}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 6 }}>
            Built-in sets: {BUILTIN_TERM_SETS.map((b) => b.name).join(" and ")}. Public EULA pages live at {SMART_CRM_SITE}/#/terms/…
          </div>
        </div>
      </div>
    </div>
  );
}
