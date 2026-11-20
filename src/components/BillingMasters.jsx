// Masters → Billing (Billing module, Phase 1): billing models, units, rate
// structures, fee types, payer types, taxes, currencies and FX, rounding, legal
// entities and product billing profiles. Admin edits; Finance verifies legal
// entities; everyone else reads. Saved to masters.billing (app_settings).
import { useEffect, useMemo, useState } from "react";
import { Plus, Edit2, Copy, Archive, RotateCcw, ShieldCheck, AlertTriangle, X } from "lucide-react";
import { Modal } from "./shared";
import { PERMISSIONS } from "../data/constants";
import { normalizeRole, uid } from "../utils/helpers";
import { companyOf } from "../lib/quotation/company";
import { BILLING_FREQUENCIES, ROUNDING_MODES } from "../data/billingMasters";
import { resolveBillingMasters, withBilling, active, byId, newId, invoiceNoPreview, entityStatus, entityFingerprint, entityProblems,
  profileProblems, profileWarnings, cloneProfile, blankProfile, productsWithoutProfile, fxProblems } from "../lib/billing/masters";
import { loadEntityChecks, saveEntityCheck } from "../lib/billing/store";

const SUBTABS = [
  ["profiles", "Product profiles"], ["entities", "Legal entities"], ["models", "Billing models"], ["units", "Units"],
  ["rateStructures", "Rate structures"], ["feeTypes", "Fee types"], ["payerTypes", "Payer types"], ["taxes", "Taxes"],
  ["fx", "Currencies & FX"], ["rounding", "Rounding"],
];
const chip = (on) => ({ fontSize: 11, padding: "2px 8px", borderRadius: 10, border: `1px solid ${on ? "var(--brand)" : "var(--border)"}`, background: on ? "var(--brand)" : "white", color: on ? "white" : "var(--text2)", cursor: "pointer" });
const lbl = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text3)", margin: "8px 0 4px" };
const today = () => new Date().toISOString().slice(0, 10);

export default function BillingMasters({ masters, setMasters, catalog = [], orgUsers = [], currentUser }) {
  const m = useMemo(() => resolveBillingMasters(masters), [masters]);
  const company = useMemo(() => companyOf(masters?.quotation?.quoteConfig || {}), [masters]);
  const role = normalizeRole(orgUsers.find((u) => u.id === currentUser)?.role);
  const canEdit = PERMISSIONS[role]?.masters === "rw";
  const canVerify = role === "finance";
  const [sub, setSub] = useState("profiles");
  const [checks, setChecks] = useState([]);
  const [checksError, setChecksError] = useState("");
  useEffect(() => { let live = true; loadEntityChecks().then((r) => { if (live) { setChecks(r.checks); setChecksError(r.error); } }); return () => { live = false; }; }, []);
  const save = (key, value) => setMasters((prev) => withBilling(prev, key, value));
  const userName = (id) => orgUsers.find((u) => u.id === id)?.name || id || "—";

  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--text3)", margin: "0 0 10px" }}>
        The options the Billing module works with. Names only are seeded; rates and percentages are entered here. {canEdit ? "" : canVerify ? "You can verify legal entities; an admin edits the rest." : "Read only: an admin edits these."}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {SUBTABS.map(([id, label]) => <button key={id} className={`btn btn-xs ${sub === id ? "btn-primary" : "btn-sec"}`} onClick={() => setSub(id)}>{label}</button>)}
      </div>
      {sub === "profiles" && <Profiles m={m} catalog={catalog} canEdit={canEdit} save={save} checks={checks} company={company} />}
      {sub === "entities" && <Entities m={m} canEdit={canEdit} canVerify={canVerify} save={save} checks={checks} setChecks={setChecks} checksError={checksError} company={company} currentUser={currentUser} userName={userName} />}
      {sub === "models" && <SimpleList title="Billing models" items={m.models} canEdit={canEdit} onSave={(v) => save("models", v)}
        extra={(x) => <span style={{ fontSize: 11, color: "var(--text3)" }}>{(x.classes || []).map((c) => ({ subscription: "fixed recurring", transaction: "variable", one_time: "one-time" }[c] || c)).join(" + ") || "no charge"}</span>} />}
      {sub === "units" && <SimpleList title="Billing units" items={m.units} canEdit={canEdit} onSave={(v) => save("units", v)} groupBy={(x) => m.dimensions.find((d) => d.id === x.dimension)?.name || "Other"}
        newItem={(name, list) => ({ id: newId(name, list), name, dimension: m.dimensions[0]?.id })}
        editExtra={(x, set) => <select value={x.dimension} onChange={(e) => set({ ...x, dimension: e.target.value })} style={{ fontSize: 11.5 }}>{m.dimensions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>} />}
      {sub === "rateStructures" && <SimpleList title="Rate structures" items={m.rateStructures} canEdit={canEdit} onSave={(v) => save("rateStructures", v)}
        extra={(x) => x.engine ? <span style={{ fontSize: 11, color: "#047857" }}>calculated today</span> : <span style={{ fontSize: 11, color: "#B45309" }}>calculation in Phase 3</span>} />}
      {sub === "feeTypes" && <SimpleList title="Fee types" items={m.feeTypes} canEdit={canEdit} onSave={(v) => save("feeTypes", v)} groupBy={(x) => (x.kind === "one_time" ? "One-time" : "Recurring")}
        newItem={(name, list) => ({ id: newId(name, list), name, kind: "one_time" })}
        editExtra={(x, set) => <select value={x.kind} onChange={(e) => set({ ...x, kind: e.target.value })} style={{ fontSize: 11.5 }}><option value="one_time">One-time</option><option value="recurring">Recurring</option></select>} />}
      {sub === "payerTypes" && <SimpleList title="Payer types" items={m.payerTypes} canEdit={canEdit} onSave={(v) => save("payerTypes", v)} />}
      {sub === "taxes" && <SimpleList title="Taxes" items={m.taxes} canEdit={canEdit} onSave={(v) => save("taxes", v)}
        newItem={(name, list) => ({ id: newId(name, list), name, kind: "other", ratePct: null })}
        editExtra={(x, set) => <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5 }}>
          <input value={x.ratePct ?? ""} placeholder="rate" onChange={(e) => set({ ...x, ratePct: e.target.value === "" ? null : e.target.value })} style={{ width: 70, textAlign: "right", borderColor: x.ratePct != null && !/^\d+(\.\d{1,4})?$/.test(String(x.ratePct)) ? "#DC2626" : undefined }} />%</span>}
        extra={(x) => <span style={{ fontSize: 11, color: x.ratePct == null ? "#B45309" : "var(--text2)" }}>{x.ratePct == null ? "rate not set" : `${x.ratePct}%`}</span>}
        note="Quotations keep using the GST rate in Quotation Rules until the rating engine moves to these (Phase 3)." />}
      {sub === "fx" && <Fx m={m} canEdit={canEdit} save={save} />}
      {sub === "rounding" && (
        <div style={{ maxWidth: 520 }}>
          <div style={lbl}>Invoice totals</div>
          {ROUNDING_MODES.map((r) => (
            <label key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, padding: "4px 0" }}>
              <input type="radio" name="rounding" checked={m.rounding === r.id} disabled={!canEdit} onChange={() => save("rounding", r.id)} />{r.name}
            </label>
          ))}
          <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 6 }}>Amounts are calculated in whole paise; this sets how an invoice total is rounded. Applied by the rating engine (Phase 3).</div>
        </div>
      )}
    </div>
  );
}

// ── A list of named options: rename, add, retire / restore ───────────
function SimpleList({ title, items, canEdit, onSave, extra, editExtra, newItem, groupBy, note }) {
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const update = (x) => onSave(items.map((i) => (i.id === x.id ? x : i)));
  const add = () => {
    const name = draft.trim();
    if (!name) return;
    if (items.some((i) => String(i.name).toLowerCase() === name.toLowerCase())) { setErr(`"${name}" is already in ${title.toLowerCase()}.`); return; }
    onSave([...items, newItem ? newItem(name, items) : { id: newId(name, items), name }]);
    setDraft(""); setErr("");
  };
  const groups = groupBy ? [...new Set(items.map(groupBy))] : [null];
  return (
    <div style={{ maxWidth: 760 }}>
      {note && <div style={{ fontSize: 11.5, color: "var(--text3)", marginBottom: 8 }}>{note}</div>}
      {groups.map((g) => (
        <div key={g || "all"}>
          {g && <div style={lbl}>{g}</div>}
          <table className="tbl"><tbody>
            {items.filter((i) => !groupBy || groupBy(i) === g).map((x) => (
              <tr key={x.id} style={{ opacity: x.retired ? 0.5 : 1 }}>
                <td style={{ width: "45%" }}>
                  {canEdit ? <input value={x.name} onChange={(e) => update({ ...x, name: e.target.value })} onBlur={(e) => { if (!e.target.value.trim()) update({ ...x, name: x.id }); }} style={{ width: "100%", fontSize: 12.5 }} />
                    : <span style={{ fontSize: 12.5 }}>{x.name}</span>}
                </td>
                <td>{canEdit && editExtra ? editExtra(x, update) : extra ? extra(x) : null}{canEdit && editExtra && extra ? <span style={{ marginLeft: 8 }}>{extra(x)}</span> : null}</td>
                <td style={{ fontFamily: "monospace", fontSize: 10.5, color: "var(--text3)" }}>{x.id}</td>
                <td style={{ textAlign: "right", width: 90 }}>
                  {x.retired && <span style={{ fontSize: 10.5, color: "var(--text3)", marginRight: 6 }}>retired</span>}
                  {canEdit && <button className="icon-btn" title={x.retired ? "Restore" : "Retire (hidden from pick lists; kept on existing plans)"} onClick={() => update({ ...x, retired: !x.retired })}>{x.retired ? <RotateCcw size={13} /> : <Archive size={13} />}</button>}
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      ))}
      {canEdit && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input value={draft} onChange={(e) => { setDraft(e.target.value); setErr(""); }} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder={`Add to ${title.toLowerCase()}…`} style={{ flex: 1, maxWidth: 320 }} />
          <button className="btn btn-sec btn-sm" onClick={add} disabled={!draft.trim()}><Plus size={13} />Add</button>
        </div>
      )}
      {err && <div style={{ color: "#B91C1C", fontSize: 12, marginTop: 4 }}>{err}</div>}
    </div>
  );
}

// ── Currencies and dated exchange rates ──────────────────────────────
function Fx({ m, canEdit, save }) {
  const [cur, setCur] = useState("");
  const [row, setRow] = useState({ currency: "USD", rateToInr: "", from: today() });
  const problems = fxProblems(row, m.currencies);
  const addCurrency = () => {
    const c = cur.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(c) || m.currencies.includes(c)) return;
    save("currencies", [...m.currencies, c]); setCur("");
  };
  return (
    <div style={{ maxWidth: 640 }}>
      <div style={lbl}>Currencies</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        {m.currencies.map((c) => <span key={c} style={chip(false)}>{c}</span>)}
        {canEdit && <><input value={cur} onChange={(e) => setCur(e.target.value)} placeholder="ISO code, e.g. GBP" maxLength={3} style={{ width: 120 }} />
          <button className="btn btn-sec btn-xs" onClick={addCurrency} disabled={!/^[A-Za-z]{3}$/.test(cur.trim()) || m.currencies.includes(cur.trim().toUpperCase())}><Plus size={12} />Add</button></>}
      </div>
      <div style={lbl}>Exchange rates (₹ per unit, from a date)</div>
      <table className="tbl">
        <thead><tr><th>Currency</th><th style={{ textAlign: "right" }}>₹ per unit</th><th>Effective from</th><th /></tr></thead>
        <tbody>
          {m.fxRates.length === 0 && <tr><td colSpan={4} style={{ color: "var(--text3)", fontSize: 12 }}>No rates entered yet.</td></tr>}
          {[...m.fxRates].sort((a, b) => a.currency.localeCompare(b.currency) || String(b.from).localeCompare(String(a.from))).map((r) => (
            <tr key={`${r.currency}-${r.from}`}><td>{r.currency}</td><td style={{ textAlign: "right" }}>{r.rateToInr}</td><td>{r.from}</td>
              <td style={{ textAlign: "right" }}>{canEdit && <button className="icon-btn" title="Remove this rate" onClick={() => save("fxRates", m.fxRates.filter((x) => x !== r))}><X size={13} /></button>}</td></tr>
          ))}
        </tbody>
      </table>
      {canEdit && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          <select value={row.currency} onChange={(e) => setRow({ ...row, currency: e.target.value })}>{m.currencies.filter((c) => c !== "INR").map((c) => <option key={c}>{c}</option>)}</select>
          <input value={row.rateToInr} onChange={(e) => setRow({ ...row, rateToInr: e.target.value.trim() })} placeholder="e.g. 83.50" style={{ width: 110, textAlign: "right" }} />
          <input type="date" value={row.from} onChange={(e) => setRow({ ...row, from: e.target.value })} />
          <button className="btn btn-sec btn-sm" disabled={problems.length > 0 || m.fxRates.some((x) => x.currency === row.currency && x.from === row.from)}
            onClick={() => { save("fxRates", [...m.fxRates, row]); setRow({ ...row, rateToInr: "" }); }}><Plus size={13} />Add rate</button>
          {row.rateToInr && problems.length > 0 && <span style={{ color: "#B91C1C", fontSize: 11.5 }}>{problems[0]}</span>}
        </div>
      )}
    </div>
  );
}

// ── Legal entities ───────────────────────────────────────────────────
function Entities({ m, canEdit, canVerify, save, checks, setChecks, checksError, company, currentUser, userName }) {
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState("");
  const verify = async (e) => {
    if (!window.confirm(`Confirm that the registration, address and bank details of ${e.name} are correct?`)) return;
    const check = { id: uid(), entityId: e.id, fingerprint: entityFingerprint(e, company), note: "", by: currentUser, at: new Date().toISOString() };
    const { error } = await saveEntityCheck(check);
    if (error) { setMsg(error); return; }
    setChecks((c) => [check, ...c]); setMsg(`${e.name} verified.`);
  };
  const saveEntity = (e) => { const list = m.legalEntities.some((x) => x.id === e.id) ? m.legalEntities.map((x) => (x.id === e.id ? e : x)) : [...m.legalEntities, e]; save("legalEntities", list); setEdit(null); };
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>Each entity has its own invoice series per financial year (April–March), e.g. <b>{invoiceNoPreview("HI", today(), 123)}</b>, at most 16 characters. An admin enters the details; Finance verifies them, and any later change needs verifying again.</div>
      {checksError && <div style={{ color: "#B91C1C", fontSize: 12, marginBottom: 6 }}>Could not load verifications: {checksError}</div>}
      {msg && <div style={{ fontSize: 12, color: "#047857", marginBottom: 6 }}>{msg}</div>}
      <table className="tbl">
        <thead><tr><th>Entity</th><th>Series</th><th>Details</th><th>Finance check</th><th /></tr></thead>
        <tbody>
          {m.legalEntities.map((e) => {
            const st = entityStatus(e, checks, company);
            const probs = entityProblems(e, m.legalEntities, company);
            return (
              <tr key={e.id} style={{ opacity: e.retired ? 0.5 : 1 }}>
                <td><div style={{ fontWeight: 600 }}>{e.name}</div><div style={{ fontSize: 11, color: "var(--text3)" }}>{e.source === "company" ? "Details from Quotation Rules → Company" : e.legalName || ""}</div></td>
                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{e.invoicePrefix ? invoiceNoPreview(e.invoicePrefix, today(), 1) : "—"}</td>
                <td style={{ fontSize: 11.5 }}>{probs.length ? <span style={{ color: "#B45309" }}><AlertTriangle size={11} /> {probs.join(" ")}</span> : <span style={{ color: "#047857" }}>Complete</span>}</td>
                <td style={{ fontSize: 11.5 }}>
                  <span style={{ color: st.verified ? "#047857" : "#B45309", fontWeight: 600 }}>{st.label}</span>
                  {st.check && <div style={{ color: "var(--text3)" }}>{userName(st.check.by)}, {String(st.check.at).slice(0, 10)}</div>}
                </td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {canVerify && !st.verified && !e.retired && <button className="btn btn-sec btn-xs" disabled={probs.length > 0} title={probs.length ? "Complete the details first" : "Record that the details are correct"} onClick={() => verify(e)}><ShieldCheck size={12} />Verify</button>}
                  {canEdit && <button className="icon-btn" title="Edit" onClick={() => setEdit({ ...e })}><Edit2 size={13} /></button>}
                  {canEdit && e.source !== "company" && <button className="icon-btn" title={e.retired ? "Restore" : "Retire"} onClick={() => save("legalEntities", m.legalEntities.map((x) => (x.id === e.id ? { ...x, retired: !x.retired } : x)))}>{e.retired ? <RotateCcw size={13} /> : <Archive size={13} />}</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {canEdit && <button className="btn btn-sec btn-sm" style={{ marginTop: 8 }} onClick={() => setEdit({ id: newId("entity", m.legalEntities), name: "", invoicePrefix: "", source: "own", isNew: true })}><Plus size={13} />Add legal entity</button>}
      {edit && <EntityEditor entity={edit} all={m.legalEntities} company={company} onClose={() => setEdit(null)} onSave={(e) => { const { isNew, ...rest } = e; saveEntity(isNew ? { ...rest, id: newId(rest.name, m.legalEntities) } : rest); }} />}
    </div>
  );
}

function EntityEditor({ entity, all, company, onClose, onSave }) {
  const [e, setE] = useState(entity);
  const probs = entityProblems(e, all, company);
  const F = (k, label, ph = "") => (
    <div className="form-group" style={{ flex: 1 }}><label>{label}</label><input value={e[k] || ""} placeholder={ph} onChange={(ev) => setE({ ...e, [k]: k === "invoicePrefix" || k === "gstin" || k === "pan" || k === "bankIfsc" ? ev.target.value.toUpperCase() : ev.target.value })} /></div>
  );
  return (
    <Modal title={entity.isNew ? "Add legal entity" : `Edit ${entity.name}`} onClose={onClose} footer={<>
      <button className="btn btn-sec btn-sm" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary btn-sm" disabled={!e.name?.trim() || !/^[A-Z0-9]{1,4}$/.test(e.invoicePrefix || "")} onClick={() => onSave(e)}>Save</button>
    </>}>
      {e.source === "company" ? (
        <>
          <div style={{ fontSize: 12.5, color: "var(--text3)", marginBottom: 8 }}>Registration, address and bank details come from Masters → Quotation Rules → Company, so they are kept in one place.</div>
          <div className="form-row">{F("invoicePrefix", "Invoice prefix *", "e.g. HI")}</div>
        </>
      ) : (
        <>
          <div className="form-row">{F("name", "Short name *", "e.g. Carico System")}{F("invoicePrefix", "Invoice prefix *", "1–4 letters")}</div>
          <div className="form-row">{F("legalName", "Registered legal name")}</div>
          <div className="form-row">{F("gstin", "GSTIN *")}{F("pan", "PAN")}{F("state", "State")}</div>
          <div className="form-row">{F("address", "Registered address *")}</div>
          <div className="form-row">{F("bankName", "Bank")}{F("bankAccount", "Account number")}{F("bankIfsc", "IFSC")}</div>
        </>
      )}
      <div style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text2)" }}>Invoices: {e.invoicePrefix ? invoiceNoPreview(e.invoicePrefix, today(), 1) : "—"}</div>
      {probs.length > 0 && <div style={{ fontSize: 12, color: "#B45309", marginTop: 6 }}>{probs.map((p) => <div key={p}>· {p}</div>)}<div style={{ color: "var(--text3)" }}>It can be saved, but Finance can verify it only when complete.</div></div>}
    </Modal>
  );
}

// ── Product billing profiles ─────────────────────────────────────────
function Profiles({ m, catalog, canEdit, save, checks, company }) {
  const [edit, setEdit] = useState(null);
  const [show, setShow] = useState("active");
  const productName = (id) => (id === "_services" ? "Services" : catalog.find((c) => c.id === id)?.name || id || "—");
  const list = m.profiles.filter((p) => (show === "all" ? true : show === "retired" ? p.retired : !p.retired));
  const missing = productsWithoutProfile(catalog, m.profiles);
  const put = (p) => { save("profiles", m.profiles.some((x) => x.id === p.id) ? m.profiles.map((x) => (x.id === p.id ? p : x)) : [...m.profiles, p]); setEdit(null); };
  const modelName = (id) => byId(m.models, id)?.name || id;
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>Defaults that pre-fill a customer's billing plan; any of them can be changed per contract. PROPOSED profiles are for Finance to review.</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {[["active", "In use"], ["retired", "Retired"], ["all", "All"]].map(([k, l]) => <button key={k} className={`btn btn-xs ${show === k ? "btn-primary" : "btn-sec"}`} onClick={() => setShow(k)}>{l}</button>)}
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text3)" }}>{active(m.profiles).filter((p) => p.status === "CONFIRMED").length} confirmed · {active(m.profiles).filter((p) => p.status !== "CONFIRMED").length} proposed</span>
      </div>
      <table className="tbl">
        <thead><tr><th>Profile</th><th>Product</th><th>Status</th><th>Default model</th><th>Billed</th><th>Entity</th><th /></tr></thead>
        <tbody>
          {list.map((p) => {
            const probs = profileProblems(p, m, catalog), warns = profileWarnings(p);
            const ent = byId(m.legalEntities, p.legalEntityId);
            const entOk = ent && entityStatus(ent, checks, company).verified;
            return (
              <tr key={p.id} style={{ opacity: p.retired ? 0.5 : 1 }}>
                <td><div style={{ fontWeight: 600 }}>{p.name}</div>{(probs.length > 0 || warns.length > 0) && <div style={{ fontSize: 10.5, color: probs.length ? "#B91C1C" : "#B45309" }}>{probs.length ? `${probs.length} to fix` : warns[0]}</div>}</td>
                <td style={{ fontSize: 12 }}>{productName(p.productId)}</td>
                <td><span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 8, color: p.status === "CONFIRMED" ? "#047857" : "#92400E", background: p.status === "CONFIRMED" ? "#ECFDF5" : "#FFFBEB" }}>{p.status}</span></td>
                <td style={{ fontSize: 12 }}>{modelName(p.defaultModelId)}{p.allowedModelIds.length > 1 ? <span style={{ color: "var(--text3)" }}> +{p.allowedModelIds.length - 1}</span> : null}</td>
                <td style={{ fontSize: 12 }}>{p.primaryBasis || "—"}</td>
                <td style={{ fontSize: 12 }}>{ent ? <span title={entOk ? "Verified by Finance" : "Not verified by Finance yet"}>{ent.name}{!entOk && <AlertTriangle size={11} color="#B45309" style={{ marginLeft: 4 }} />}</span> : <span style={{ color: "#B45309" }}>not set</span>}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}><div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                  <button className="icon-btn" title={canEdit ? "Edit" : "View"} onClick={() => setEdit({ ...p })}><Edit2 size={13} /></button>
                  {canEdit && <button className="icon-btn" title="Clone" onClick={() => setEdit(cloneProfile(p, m.profiles))}><Copy size={13} /></button>}
                  {canEdit && <button className="icon-btn" title={p.retired ? "Restore" : "Retire"} onClick={() => save("profiles", m.profiles.map((x) => (x.id === p.id ? { ...x, retired: !x.retired } : x)))}>{p.retired ? <RotateCcw size={13} /> : <Archive size={13} />}</button>}
                </div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {missing.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--text2)" }}>
          Products with no billing profile: {canEdit ? missing.map((c) => <button key={c.id} className="btn btn-sec btn-xs" style={{ margin: "2px 4px" }} onClick={() => setEdit(blankProfile(c, m.profiles))}><Plus size={11} />{c.name}</button>) : missing.map((c) => c.name).join(", ")}
        </div>
      )}
      {edit && <ProfileEditor profile={edit} m={m} catalog={catalog} canEdit={canEdit} onClose={() => setEdit(null)} onSave={put} />}
    </div>
  );
}

function Chips({ options, value = [], onChange, disabled, single }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {options.map((o) => {
        const on = value.includes(o.id);
        return <button key={o.id} type="button" disabled={disabled} style={{ ...chip(on), cursor: disabled ? "default" : "pointer" }}
          onClick={() => onChange(single ? [o.id] : on ? value.filter((v) => v !== o.id) : [...value, o.id])}>{o.name}</button>;
      })}
    </div>
  );
}

function ProfileEditor({ profile, m, catalog, canEdit, onClose, onSave }) {
  const [p, setP] = useState(profile);
  const [dim, setDim] = useState("");
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const probs = profileProblems(p, m, catalog), warns = profileWarnings(p);
  const models = active(m.models), fees = active(m.feeTypes);
  const units = active(m.units).filter((u) => !dim || u.dimension === dim);
  const lines = (arr) => (arr || []).join("\n");
  const fromLines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const ro = !canEdit;
  return (
    <Modal title={ro ? p.name : profile.name ? `Profile: ${profile.name}` : "New profile"} size="xl" onClose={onClose} footer={<>
      {probs.length > 0 && !ro && <span style={{ marginRight: "auto", fontSize: 12, color: "#B91C1C" }}>{probs[0]}{probs.length > 1 ? ` (+${probs.length - 1} more)` : ""}</span>}
      <button className="btn btn-sec btn-sm" onClick={onClose}>{ro ? "Close" : "Cancel"}</button>
      {!ro && <button className="btn btn-primary btn-sm" disabled={probs.length > 0} onClick={() => onSave({ ...p, creditDays: p.creditDays == null || p.creditDays === "" ? null : Number(p.creditDays) })}>Save profile</button>}
    </>}>
      <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}><label>Name *</label><input value={p.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div className="form-group" style={{ flex: 2 }}><label>Product *</label>
            <select value={p.productId} onChange={(e) => set("productId", e.target.value)}><option value="">— Pick —</option><option value="_services">Services (all products)</option>{catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="form-group" style={{ flex: 1 }}><label>Status</label><select value={p.status} onChange={(e) => set("status", e.target.value)}><option>CONFIRMED</option><option>PROPOSED</option></select></div>
        </div>
        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}><label>Legal entity</label>
            <select value={p.legalEntityId} onChange={(e) => set("legalEntityId", e.target.value)}><option value="">— Not set —</option>{active(m.legalEntities).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
          <div className="form-group" style={{ flex: 1 }}><label>Currency *</label><select value={p.currency} onChange={(e) => set("currency", e.target.value)}>{m.currencies.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="form-group" style={{ flex: 1 }}><label>Billing frequency *</label><select value={p.frequency} onChange={(e) => set("frequency", e.target.value)}>{BILLING_FREQUENCIES.map((f) => <option key={f}>{f}</option>)}</select></div>
          <div className="form-group" style={{ flex: 1 }}><label>Credit days</label><input type="number" min={0} step={1} value={p.creditDays ?? ""} onChange={(e) => set("creditDays", e.target.value === "" ? null : e.target.value)} /></div>
        </div>
        <div style={lbl}>Taxes</div>
        <Chips options={active(m.taxes)} value={p.taxIds} onChange={(v) => set("taxIds", v)} disabled={ro} />
        <div style={lbl}>Default billing model *</div>
        <select value={p.defaultModelId} onChange={(e) => setP((x) => ({ ...x, defaultModelId: e.target.value, allowedModelIds: [...new Set([e.target.value, ...x.allowedModelIds])] }))}>{models.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <div style={lbl}>Other allowed models</div>
        <Chips options={models.filter((x) => x.id !== p.defaultModelId)} value={p.allowedModelIds} onChange={(v) => set("allowedModelIds", [...new Set([p.defaultModelId, ...v])])} disabled={ro} />
        <div style={lbl}>Primary basis (as it reads on a plan)</div>
        <input value={p.primaryBasis} onChange={(e) => set("primaryBasis", e.target.value)} placeholder="e.g. per flight per airport per month" style={{ width: "100%" }} />
        <div style={{ ...lbl, display: "flex", gap: 8, alignItems: "center" }}>Units <select value={dim} onChange={(e) => setDim(e.target.value)} style={{ fontSize: 11, textTransform: "none" }}><option value="">All dimensions</option>{m.dimensions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>Primary *</div>
        <Chips options={units} value={p.primaryUnitIds} onChange={(v) => setP((x) => ({ ...x, primaryUnitIds: v, allowedUnitIds: [...new Set([...v, ...x.allowedUnitIds])] }))} disabled={ro} />
        <div style={{ fontSize: 11, color: "var(--text3)", margin: "6px 0 4px" }}>Also allowed</div>
        <Chips options={units} value={p.allowedUnitIds} onChange={(v) => set("allowedUnitIds", [...new Set([...p.primaryUnitIds, ...v])])} disabled={ro} />
        <div className="form-row" style={{ marginTop: 8 }}>
          <div className="form-group" style={{ flex: 1 }}><label>Secondary variables (one per line)</label><textarea rows={4} value={lines(p.variables)} onChange={(e) => set("variables", fromLines(e.target.value))} /></div>
          <div className="form-group" style={{ flex: 1 }}><label>Modules (one per line)</label><textarea rows={4} value={lines(p.modules)} onChange={(e) => set("modules", fromLines(e.target.value))} /></div>
        </div>
        <div style={lbl}>One-time fees offered</div>
        <Chips options={fees.filter((f) => f.kind === "one_time")} value={p.oneTimeFeeIds} onChange={(v) => set("oneTimeFeeIds", v)} disabled={ro} />
        <div style={lbl}>Recurring fees offered</div>
        <Chips options={fees.filter((f) => f.kind === "recurring")} value={p.recurringFeeIds} onChange={(v) => set("recurringFeeIds", v)} disabled={ro} />
        <div style={lbl}>Fee lines required by a model</div>
        {(p.requiredFees || []).map((r, i) => (
          <div key={i} style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
            <b>{byId(m.feeTypes, r.feeTypeId)?.name || r.feeTypeId}</b> is required with {(r.modelIds || []).map((id) => byId(m.models, id)?.name || id).join(", ")}
            {!ro && <button type="button" className="icon-btn" onClick={() => set("requiredFees", p.requiredFees.filter((_, j) => j !== i))}><X size={12} /></button>}
          </div>
        ))}
        {!ro && <RequiredFeeAdder models={models.filter((x) => p.allowedModelIds.includes(x.id))} fees={fees} onAdd={(r) => set("requiredFees", [...(p.requiredFees || []), r])} />}
        <div style={lbl}>Flags</div>
        <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!p.flags?.revenueShareStatement} onChange={(e) => set("flags", { ...p.flags, revenueShareStatement: e.target.checked })} />Revenue share statement</label>
        <label style={{ fontSize: 12.5, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!p.flags?.separateCollectionAccount} onChange={(e) => set("flags", { ...p.flags, separateCollectionAccount: e.target.checked })} />Separate collection account</label>
        <div className="form-group" style={{ marginTop: 8 }}><label>Notes</label><textarea rows={2} value={p.notes || ""} onChange={(e) => set("notes", e.target.value)} /></div>
      </fieldset>
      {warns.length > 0 && <div style={{ fontSize: 12, color: "#B45309" }}>{warns.map((w) => <div key={w}>· {w}</div>)}</div>}
      {probs.length > 0 && <div style={{ fontSize: 12, color: "#B91C1C", marginTop: 4 }}>{probs.map((w) => <div key={w}>· {w}</div>)}</div>}
    </Modal>
  );
}

function RequiredFeeAdder({ models, fees, onAdd }) {
  const [model, setModel] = useState("");
  const [fee, setFee] = useState("");
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
      <select value={fee} onChange={(e) => setFee(e.target.value)}><option value="">— Fee —</option>{fees.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
      required with
      <select value={model} onChange={(e) => setModel(e.target.value)}><option value="">— Model —</option>{models.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <button type="button" className="btn btn-sec btn-xs" disabled={!model || !fee} onClick={() => { onAdd({ modelIds: [model], feeTypeId: fee }); setModel(""); setFee(""); }}><Plus size={11} />Add</button>
    </div>
  );
}
