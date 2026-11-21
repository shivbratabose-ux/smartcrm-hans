// One product master: a product's items (modules + prices together) and the
// item editor. Used by Masters → Products & Pricing.
import { useState } from "react";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { Modal } from "./shared";
import { uid } from "../utils/helpers";
import { billingClassLabel, billingClassOf } from "../lib/quotation/commercial";
import { itemsOf, itemForm, itemProblems, saveItem, ITEM_TYPES, MODEL_FOR_CLASS } from "../lib/quotation/productItems";
import { saleTerms, oneTimeAllowed, oneTimeTermsFor, oneTimeUnitPrice } from "../lib/quotation/saleTerms";
import { PRICING_MODELS, QUOTE_UNITS } from "../data/quotationMasters";
import { isOneTimeModel } from "../lib/quotation/pricingEngine";
import { BILLING_TYPES, withType, withFrequency, billingWarnings, sectionsOf } from "../lib/quotation/billingTypes";

const inr = (v) => { const x = Math.round((Number(v) || 0) * 100) / 100; return "₹" + x.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(x) ? 0 : 2, maximumFractionDigits: 2 }); };
const chip = (text, color, bg, title) => <span title={title} style={{ fontSize: 10.5, fontWeight: 700, color, background: bg, padding: "2px 7px", borderRadius: 10, whiteSpace: "nowrap" }}>{text}</span>;
const TYPE_COLOR = { Plan: ["#1D4ED8", "#EFF6FF"], Core: ["#047857", "#ECFDF5"], "Add-on": ["#4338CA", "#EEF2FF"], "Subscription add-on": ["#7C3AED", "#F5F3FF"], Integration: ["#B45309", "#FFFBEB"], Service: ["#0F766E", "#F0FDFA"], Implementation: ["#475569", "#F1F5F9"], Licence: ["#9D174D", "#FDF2F8"] };

function priceCell(row) {
  if (!row) return <span style={{ color: "#B45309", fontSize: 12 }}>Not priced</span>;
  if (row.matrixId || row.rateSource === "iCAFFE") return <span style={{ color: "#1D4ED8", fontSize: 12 }}>From rate card</span>;
  if (row.rateSource === "Band") return <span style={{ color: "#1D4ED8", fontSize: 12 }}>By user bands</span>;
  if (row.rateSource === "Slab") return <span style={{ color: "#4338CA", fontSize: 12 }}>Volume slabs</span>;
  if (row.listPrice == null) return <span style={{ color: "#B45309", fontSize: 12 }}>Needs a price</span>;
  return <b style={{ fontSize: 12.5 }}>{inr(row.listPrice)}</b>;
}

/** Items of one product (or of the services / unlinked groups when `product.modules` is empty). */
export function ProductItemsTable({ product, rows, catalog, canEdit, config, onSaveItem, onSetActive, onDeleteModule, onAdvanced, billing = null, onSetBilling, canEditBilling = false }) {
  const [edit, setEdit] = useState(null);
  const items = itemsOf(product, rows, catalog);
  const terms = saleTerms(config);
  // Frequencies offered for this product: the company's allowed ones that the product also allows.
  const freqs = terms.frequencies.filter((f) => f.enabled && (!billing || billing.frequencies.includes(f.id)));
  const licenceOn = !billing || billing.types.includes("licence");
  const warnings = billing ? billingWarnings(billing, items) : [];
  const sections = billing ? sectionsOf(items, billing) : null;
  const renderRow = (it) => {
            const r = it.row, m = it.module;
            const cls = r ? billingClassOf(r) : null;
            const type = r?.itemType || m?.type || (cls === "transaction" ? "Add-on" : cls === "one_time" ? "Implementation" : "Core");
            const [tc, tb] = TYPE_COLOR[type] || TYPE_COLOR.Core;
            const ot = r && licenceOn && oneTimeAllowed(r) && terms.oneTime.enabled ? oneTimeTermsFor(r, terms) : null;
            return (
              <tr key={it.key} style={{ opacity: r && r.active === false ? 0.5 : 1 }}>
                <td>{chip(type, tc, tb)}</td>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{r?.name || m?.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)", maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r?.description || m?.desc || ""}>
                    {r ? <span style={{ fontFamily: "monospace" }}>{r.code}</span> : "module only"}{(r?.description || m?.desc) ? ` · ${r?.description || m?.desc}` : ""}
                  </div>
                </td>
                <td style={{ fontSize: 12, color: cls === "transaction" ? "#4338CA" : undefined }}>{cls ? billingClassLabel(cls) : "—"}</td>
                <td style={{ fontSize: 12 }}>{r?.unit || "—"}{r?.minQty ? <div style={{ fontSize: 10.5, color: "var(--text3)" }}>min {r.minQty}</div> : null}</td>
                <td style={{ textAlign: "right" }}>{priceCell(r)}{cls === "subscription" && r?.listPrice != null && <div style={{ fontSize: 10.5, color: "var(--text3)" }}>a month</div>}</td>
                <td style={{ fontSize: 11 }}>
                  {cls === "subscription" && <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {freqs.length > 0 && chip(`Subscription: ${freqs.map((f) => f.label[0]).join(" / ")}`, "#047857", "#ECFDF5", freqs.map((f) => `${f.label}${f.discountPct ? ` (${f.discountPct}% off)` : ""}`).join(", "))}
                    {ot && chip(`One-time: ${ot.months} mo − ${ot.discountPct}%`, "#9D174D", "#FDF2F8", r.listPrice != null ? `One-time price ${inr(oneTimeUnitPrice(r.listPrice, ot))} per ${r.unit || "unit"} + AMC billed monthly` : "One-time licence + AMC billed monthly")}
                  </div>}
                  {cls === "transaction" && chip("On actual use, monthly", "#4338CA", "#EEF2FF")}
                  {cls === "one_time" && chip(r && r.pricingModel === "One-time Licence" ? "One-time licence + AMC" : "One-time", "#475569", "#F1F5F9")}
                </td>
                <td>{r ? <input type="checkbox" checked={r.active !== false} disabled={!canEdit} onChange={(e) => onSetActive(r.code, e.target.checked)} title={r.active === false ? "Not offered on new quotes" : "Offered on quotes"} /> : null}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="icon-btn" title={canEdit ? (r ? "Edit item" : "Price this module") : "View"} onClick={() => setEdit(it)}><Edit2 size={13} /></button>
                  {canEdit && !r && m && <button className="icon-btn" title="Delete this module" onClick={() => onDeleteModule(m.id, m.name)}><Trash2 size={13} /></button>}
                </td>
              </tr>
            );
  };
  return (
    <div>
      {billing && (
        <div style={{ padding: "8px 10px", background: "#F8FAFC", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: 12.5 }}>
            <b style={{ fontSize: 12 }}>Billing types</b>
            {BILLING_TYPES.map((t) => (
              <label key={t.id} title={t.hint} style={{ display: "inline-flex", gap: 5, alignItems: "center", cursor: canEditBilling ? "pointer" : "default" }}>
                <input type="checkbox" checked={billing.types.includes(t.id)} disabled={!canEditBilling} onChange={(e) => onSetBilling(withType(billing, t.id, e.target.checked))} />{t.label}
              </label>
            ))}
            {!billing.set && <span style={{ fontSize: 11, color: "var(--text3)" }}>(from its items until you set them)</span>}
          </div>
          {billing.types.includes("subscription") && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 12, marginTop: 6 }}>
              <span style={{ color: "var(--text3)" }}>Subscription billed</span>
              {terms.frequencies.map((f) => (
                <label key={f.id} style={{ display: "inline-flex", gap: 4, alignItems: "center", opacity: f.enabled ? 1 : 0.5 }} title={f.enabled ? (f.discountPct ? `${f.discountPct}% off (Quotation Rules)` : "") : "Not allowed in Quotation Rules → How software is sold"}>
                  <input type="checkbox" checked={billing.frequencies.includes(f.id)} disabled={!canEditBilling || !f.enabled} onChange={(e) => onSetBilling(withFrequency(billing, f.id, e.target.checked))} />{f.label}{f.discountPct ? ` (${f.discountPct}% off)` : ""}
                </label>
              ))}
            </div>
          )}
          {warnings.map((w) => <div key={w} style={{ fontSize: 11.5, color: "#B45309", marginTop: 4 }}>{w}</div>)}
        </div>
      )}
      <table className="tbl" style={{ margin: 0 }}>
        <thead><tr><th>Type</th><th>Item</th><th>Billed as</th><th>Unit</th><th style={{ textAlign: "right" }}>List price</th><th>Can be sold as</th><th>Active</th><th /></tr></thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={8} style={{ color: "var(--text3)", fontSize: 12.5 }}>No items yet. Add the first plan, module, add-on or service.</td></tr>}
          {sections ? sections.map((sec) => [
            <tr key={`sec-${sec.id}`}><td colSpan={8} style={{ background: "var(--s2)", padding: "6px 10px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ fontSize: 12, color: sec.allowed ? "var(--text1)" : "#B45309" }}>{sec.label}</b>
                <span style={{ fontSize: 11, color: "var(--text3)" }}>{sec.allowed ? sec.hint : "not a billing type of this product: these items are not offered on quotes"} · {sec.items.length} item{sec.items.length === 1 ? "" : "s"}</span>
                {canEdit && sec.allowed && sec.id !== "unpriced" && <button className="btn btn-sec btn-xs" style={{ marginLeft: "auto" }} onClick={() => setEdit({ key: "new", row: null, module: null, preset: sec.id })}><Plus size={11} />Add {sec.label.toLowerCase()} item</button>}
              </div>
            </td></tr>,
            ...sec.items.map(renderRow),
          ]) : items.map(renderRow)}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 8, padding: "8px 10px", alignItems: "center", flexWrap: "wrap" }}>
        {canEdit && !sections && <button className="btn btn-primary btn-xs" onClick={() => setEdit({ key: "new", row: null, module: null })}><Plus size={11} />Add item</button>}
        {onAdvanced && <button className="btn btn-sec btn-xs" onClick={onAdvanced} title="Slabs, user bands, rate cards, dated, segment and country prices">Advanced pricing</button>}
        <span style={{ fontSize: 11, color: "var(--text3)" }}>An item is what deals pick and what quotes price: a plan, module, add-on (e.g. tracking), service or one-time charge.</span>
      </div>
      {edit && <ItemEditor item={edit.key === "new" ? null : edit} preset={edit.preset} billing={billing} product={product} rows={rows} catalog={catalog} canEdit={canEdit} config={config}
        onClose={() => setEdit(null)} onSave={(f) => { const out = saveItem(f, { item: edit.key === "new" ? null : edit, product, rows, catalog, uid }); onSaveItem(out); setEdit(null); }} />}
    </div>
  );
}

const PRESET = { subscription: { billingClass: "subscription", pricingModel: "SaaS Subscription", unit: "User", type: "Core" }, licence: { billingClass: "one_time", pricingModel: "One-time Licence", unit: "Site", type: "Licence" },
  usage: { billingClass: "transaction", pricingModel: "Per-transaction", unit: "Transaction", type: "Add-on" }, one_time: { billingClass: "one_time", pricingModel: "Implementation", unit: "Fixed", type: "Implementation" } };
function ItemEditor({ item, product, canEdit, config, onClose, onSave, preset, billing }) {
  const [f, setF] = useState(() => ({ ...itemForm(item, product), ...(!item && preset && PRESET[preset] ? PRESET[preset] : {}) }));
  // The ways this product bills (its billing types); an existing item keeps its own even if unticked.
  const allowedClass = (cls) => !billing || (cls === "subscription" ? billing.types.includes("subscription") : cls === "transaction" ? billing.types.includes("usage") : billing.types.includes("one_time") || billing.types.includes("licence")) || item?.row && billingClassOf(item.row) === cls;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const probs = itemProblems(f);
  const terms = saleTerms(config);
  const priced = !item?.row || (item.row.rateSource || "Flat") === "Flat" && !item.row.matrixId;
  const ot = f.billingClass === "subscription" && f.oneTimeAllowed && (!billing || billing.types.includes("licence")) ? oneTimeTermsFor({ otMonths: f.otMonths, otDiscountPct: f.otDiscountPct }, terms) : null;
  const models = PRICING_MODELS.filter((pm) => (f.billingClass === "one_time" ? isOneTimeModel(pm) : !isOneTimeModel(pm) && pm !== "AMC"));
  const F = (k, label, props = {}) => <div className="form-group" style={{ flex: 1 }}><label>{label}</label><input value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} {...props} /></div>;
  return (
    <Modal title={item ? `${canEdit ? "Edit" : "View"}: ${f.name || "item"}` : `Add item to ${product.name}`} size="lg" onClose={onClose} footer={<>
      {probs.length > 0 && canEdit && <span style={{ marginRight: "auto", fontSize: 12, color: "#B91C1C" }}>{probs[0]}</span>}
      <button className="btn btn-sec btn-sm" onClick={onClose}>{canEdit ? "Cancel" : "Close"}</button>
      {canEdit && <button className="btn btn-primary btn-sm" disabled={probs.length > 0} onClick={() => onSave(f)}>Save item</button>}
    </>}>
      <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-row">
          {F("name", "Name *", { placeholder: "e.g. Ocean Container Tracking" })}
          <div className="form-group" style={{ width: 190 }}><label>Type</label><select value={f.type} onChange={(e) => set("type", e.target.value)}>{ITEM_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        </div>
        <div className="form-group"><label>Description (shown on quotes)</label><textarea rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
        <div className="form-row">
          <div className="form-group" style={{ flex: 1 }}><label>Billed as</label>
            <select value={f.billingClass} onChange={(e) => setF((x) => ({ ...x, billingClass: e.target.value, pricingModel: MODEL_FOR_CLASS[e.target.value] }))}>
              {allowedClass("subscription") && <option value="subscription">Fixed recurring (subscription)</option>}{allowedClass("transaction") && <option value="transaction">Variable, on actual use</option>}{allowedClass("one_time") && <option value="one_time">One-time</option>}
            </select></div>
          <div className="form-group" style={{ flex: 1 }}><label>Pricing model</label><select value={f.pricingModel} onChange={(e) => set("pricingModel", e.target.value)}>{models.map((pm) => <option key={pm}>{pm}</option>)}</select></div>
          <div className="form-group" style={{ flex: 1 }}><label>Priced per *</label><select value={f.unit} onChange={(e) => set("unit", e.target.value)}>{[...new Set([f.unit, ...QUOTE_UNITS].filter(Boolean))].map((u) => <option key={u}>{u}</option>)}</select></div>
        </div>
        <div className="form-row">
          {priced ? F("listPrice", f.billingClass === "subscription" ? "List price per month (₹)" : f.billingClass === "transaction" ? `List price per ${f.unit || "unit"} (₹)` : "List price (₹)", { type: "number", min: 0, step: "any" })
            : <div className="form-group" style={{ flex: 1 }}><label>List price</label><div style={{ fontSize: 12, color: "var(--text3)", paddingTop: 6 }}>Priced by {item.row.rateSource === "Slab" ? "volume slabs" : "bands / rate card"}: change it under Advanced pricing.</div></div>}
          {F("minQty", "Minimum quantity", { type: "number", min: 0 })}
          {F("maxDiscountPct", "Max discount % (blank = rule)", { type: "number", min: 0, max: 100 })}
          {F("costPrice", "Cost (₹, internal)", { type: "number", min: 0, step: "any" })}
        </div>
        {f.billingClass === "subscription" && (
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginTop: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 4 }}>Can be sold as</div>
            <div style={{ fontSize: 12 }}>Subscription billed {terms.frequencies.filter((x) => x.enabled).map((x) => `${x.label.toLowerCase()}${x.discountPct ? ` (${x.discountPct}% off)` : ""}`).join(", ")}. <span style={{ color: "var(--text3)" }}>Set in Quotation Rules → How software is sold.</span></div>
            {(!billing || billing.types.includes("licence")) ? <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, marginTop: 6 }}><input type="checkbox" checked={f.oneTimeAllowed} onChange={(e) => set("oneTimeAllowed", e.target.checked)} />Also as a one-time licence with AMC (billed monthly)</label>
              : <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 6 }}>One-time licence is not a billing type of {product.name}: tick it on the product card to offer it.</div>}
            {f.oneTimeAllowed && (!billing || billing.types.includes("licence")) && (
              <div className="form-row" style={{ marginTop: 6 }}>
                {F("otMonths", `Months of the monthly rate (blank = ${terms.oneTime.months})`, { type: "number", min: 1, max: 240 })}
                {F("otDiscountPct", `One-time discount % (blank = ${terms.oneTime.discountPct})`, { type: "number", min: 0, max: 100 })}
                {F("amcPct", `AMC % a year (blank = ${config?.amcDefaultPct ?? 20})`, { type: "number", min: 0, max: 100 })}
              </div>
            )}
            {ot && f.listPrice !== "" && <div style={{ fontSize: 12, color: "#9D174D" }}>One-time: {inr(f.listPrice)} × {ot.months} months{ot.discountPct ? ` − ${ot.discountPct}%` : ""} = <b>{inr(oneTimeUnitPrice(f.listPrice, ot))}</b> per {f.unit || "unit"}, then AMC {f.amcPct === "" ? config?.amcDefaultPct ?? 20 : f.amcPct}% of that a year, billed monthly.</div>}
          </div>
        )}
        {f.billingClass === "one_time" && f.pricingModel === "One-time Licence" && <div className="form-row">{F("amcPct", `AMC % a year (blank = ${config?.amcDefaultPct ?? 20})`, { type: "number", min: 0, max: 100 })}</div>}
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, marginTop: 8 }}><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} />Offered on new quotes</label>
      </fieldset>
    </Modal>
  );
}
