// Billing plan: versions, amendment builder and approval (Billing module,
// Phase 2). Shown inside Contracts → Agreements for one agreement.
import { useMemo, useState } from "react";
import { Plus, X, Check, AlertTriangle, FileText, RotateCcw } from "lucide-react";
import { Modal } from "./shared";
import { normalizeRole } from "../utils/helpers";
import { billingClassLabel, discountForRate, approvalLevels } from "../lib/quotation/commercial";
import { active, byId } from "../lib/billing/masters";
import { BILLING_FREQUENCIES } from "../data/billingMasters";
import { PLAN_STATUS, DISCOUNT_TYPES, ESCALATION_TYPES, planFromAgreement, newVersion, versionsOf, activeVersion, openVersion, activation,
  approvalRoute, planProblems, monthlyEstimate, versionChanges, planDiscountPct } from "../lib/billing/plans";
import { savePlans, decidePlan } from "../lib/billing/store";

const inr = (v) => "₹" + (Math.round((Number(v) || 0) * 100) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const lbl = { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text3)", margin: "10px 0 4px" };
const chipS = (on) => ({ fontSize: 11, padding: "2px 8px", borderRadius: 10, border: `1px solid ${on ? "var(--brand)" : "var(--border)"}`, background: on ? "var(--brand)" : "white", color: on ? "white" : "var(--text2)", cursor: "pointer" });
const STATUS_COLOR = { active: "#047857", superseded: "#92400E", pending_approval: "#1D4ED8", draft: "#475569", rejected: "#B91C1C", retired: "#475569" };
const fmtDate = (d) => (d ? String(d).slice(0, 10) : "—");
const nowIso = () => new Date().toISOString();
const MGMT = ["admin", "md", "director", "vp_sales_mkt"];

/** Can this user approve or send back this version? Mirrors decide_billing_plan() in the database. */
export function canDecidePlan(plan, { currentUser, role, accountOwnerId, config }) {
  if (!plan || plan.status !== "pending_approval") return false;
  const listed = approvalLevels(config).some((l) => l.userIds.includes(currentUser)) || (config?.approverIds || []).includes(currentUser);
  if (plan.approvalRoute === "owner") return currentUser === accountOwnerId || MGMT.includes(role) || listed;
  const levels = approvalLevels(config);
  const top = levels[levels.length - 1];
  const needsTop = top && plan.approvalRoute === top.label;
  const levelOk = needsTop ? (MGMT.includes(role) || top.userIds.includes(currentUser)) : ([...MGMT, "line_mgr"].includes(role) || listed);
  if (!levelOk) return false;
  return plan.createdBy !== currentUser || ["admin", "md", "director"].includes(role);
}

/** The plan block shown under an agreement. */
export function PlanSection({ quote, plans, setPlans, bm, ctx, account, currentUser, orgUsers, config, canSee }) {
  const a = quote.agreement;
  const stored = versionsOf(plans, a.agreementNo);
  const v1 = useMemo(() => planFromAgreement(quote, ctx), [quote, ctx]);
  const versions = stored.length ? stored : [v1];
  const current = activeVersion(versions, a.agreementNo) || versions[0];
  const open = openVersion(versions, a.agreementNo);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState("");
  const role = normalizeRole(orgUsers.find((u) => u.id === currentUser)?.role);
  const userName = (id) => orgUsers.find((u) => u.id === id)?.name || id || "—";
  const ownerId = account?.owner || "";
  if (!canSee) return null;

  const persist = async (rows) => {
    const { error } = await savePlans(rows);
    if (error) { setMsg(error); return false; }
    setPlans((ps) => { const m = new Map(ps.map((p) => [p.id, p])); rows.forEach((r) => m.set(r.id, r)); return [...m.values()]; });
    return true;
  };
  const amend = async () => {
    setMsg("");
    const draft = newVersion(current, versions, { by: currentUser, at: nowIso() });
    // Version 1 is written the first time a plan is amended.
    const ok = await persist([...(stored.length ? [] : [v1]), draft]);
    if (ok) setEditing(draft);
  };
  const decide = async (p, decision) => {
    const note = decision === "reject" ? window.prompt("Why is it sent back?") : window.prompt("Note for the record (optional)") ?? "";
    if (decision === "reject" && !String(note || "").trim()) return;
    const at = nowIso();
    const local = (decision === "approve" ? activation(versions, p.id, { by: currentUser, at }) : [{ ...p, status: "rejected" }])
      .map((r) => (r.id === p.id ? { ...r, decisionNote: note } : r));
    const { error } = await decidePlan(p.id, decision, note, local);
    if (error) { setMsg(error); return; }
    setPlans((ps) => { const m = new Map(ps.map((x) => [x.id, x])); local.forEach((r) => m.set(r.id, r.id === p.id ? { ...r, decisionNote: note } : r)); return [...m.values()]; });
    setMsg(decision === "approve" ? `Version ${p.version} approved: it takes effect on ${fmtDate(p.effectiveFrom)}.` : `Version ${p.version} sent back.`);
  };

  return (
    <div style={{ marginTop: 16, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--s2)" }}>
        <b style={{ fontSize: 13 }}>Billing plan</b>
        <span style={{ fontSize: 11.5, color: "var(--text3)" }}>Version {current.version} in force since {fmtDate(current.effectiveFrom)}</span>
        <span style={{ marginLeft: "auto" }} />
        {!open && current.status === "active" && <button className="btn btn-primary btn-xs" onClick={amend}><Plus size={11} />Amend the plan</button>}
        {open && ["draft", "rejected"].includes(open.status) && (open.createdBy === currentUser || role === "admin") && <button className="btn btn-primary btn-xs" onClick={() => setEditing(open)}>Continue version {open.version}</button>}
      </div>
      {msg && <div style={{ padding: "6px 12px", fontSize: 12, color: /approved|sent back/i.test(msg) ? "#047857" : "#B91C1C" }}>{msg}</div>}
      <table className="tbl" style={{ margin: 0 }}>
        <thead><tr><th>Version</th><th>Status</th><th>In force</th><th>Why</th><th>Made by</th><th>Approved by</th><th /></tr></thead>
        <tbody>
          {[...versions].reverse().map((p) => {
            const prev = versions.find((x) => x.id === p.supersedesId);
            const changes = versionChanges(prev, p);
            return (
              <tr key={p.id}>
                <td>v{p.version}</td>
                <td><span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[p.status] }}>{PLAN_STATUS[p.status] || p.status}</span>
                  {p.status === "pending_approval" && <div style={{ fontSize: 10.5, color: "var(--text3)" }}>{p.approvalRoute === "owner" ? "Account owner" : p.approvalRoute}</div>}
                  {p.decisionNote && <div style={{ fontSize: 10.5, color: "var(--text3)" }}>“{p.decisionNote}”</div>}</td>
                <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{fmtDate(p.effectiveFrom)}{p.effectiveTo ? ` – ${fmtDate(p.effectiveTo)}` : ""}</td>
                <td style={{ fontSize: 11.5 }}>{p.reason || "—"}{changes.length > 0 && <div style={{ color: "var(--text3)" }}>{changes.slice(0, 4).join(" · ")}{changes.length > 4 ? ` · +${changes.length - 4}` : ""}</div>}</td>
                <td style={{ fontSize: 12 }}>{userName(p.createdBy)}</td>
                <td style={{ fontSize: 12 }}>{p.approvedBy ? `${userName(p.approvedBy)}, ${fmtDate(p.approvedAt)}` : "—"}</td>
                <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                  {canDecidePlan(p, { currentUser, role, accountOwnerId: ownerId, config }) && <>
                    <button className="btn btn-primary btn-xs" onClick={() => decide(p, "approve")}><Check size={11} />Approve</button>{" "}
                    <button className="btn btn-sec btn-xs" onClick={() => decide(p, "reject")}><RotateCcw size={11} />Send back</button>
                  </>}
                  <button className="btn btn-sec btn-xs" style={{ marginLeft: 4 }} onClick={() => setEditing({ ...p, _readOnly: true })}><FileText size={11} />View</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {editing && <PlanBuilder plan={editing} versions={versions} bm={bm} ctx={ctx} account={account} config={config} readOnly={!!editing._readOnly || !["draft", "rejected"].includes(editing.status)}
        onClose={() => setEditing(null)}
        onSave={async (p, submit) => {
          const route = approvalRoute(p, { config, accountOwnerId: ownerId });
          const row = submit ? { ...p, status: "pending_approval", approvalRoute: route.route === "owner" ? "owner" : route.label, submittedBy: currentUser, submittedAt: nowIso() } : p;
          const { _readOnly, ...clean } = row;
          if (await persist([clean])) { setEditing(null); setMsg(submit ? `Version ${p.version} sent to ${route.route === "owner" ? "the account owner" : route.label} for approval.` : `Version ${p.version} saved as a draft.`); }
        }} />}
    </div>
  );
}

const STEPS = ["Products", "Rates", "Fees", "Terms", "Discounts & more", "Review"];

function PlanBuilder({ plan, versions, bm, ctx, account, config, readOnly, onClose, onSave }) {
  const [p, setP] = useState(() => JSON.parse(JSON.stringify(plan)));
  const [step, setStep] = useState(readOnly ? 5 : 0);
  const t = p.terms;
  const setT = (k, v) => setP((x) => ({ ...x, terms: { ...x.terms, [k]: v } }));
  const prev = versions.find((x) => x.id === p.supersedesId);
  const problems = planProblems(p, { ...ctx, m: bm, plans: versions });
  const est = monthlyEstimate(p);
  const route = approvalRoute(p, { config, accountOwnerId: account?.owner || "" });
  const changes = versionChanges(prev, p);
  const ro = readOnly;
  const productName = (id) => (ctx.catalog || []).find((c) => c.id === id)?.name || id;
  const setLine = (i, patch) => setT("lines", t.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const setProduct = (i, patch) => setT("products", t.products.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const feeTypes = active(bm.feeTypes);

  return (
    <Modal size="xl" title={`${ro ? "" : "Amend: "}plan ${p.planNo}, version ${p.version}`} onClose={onClose} footer={<>
      <span style={{ marginRight: "auto", fontSize: 12, color: "var(--text3)" }}>
        Committed {inr(est.committedMonthly)}/month{est.expectedUsage ? ` · usage ≈ ${inr(est.expectedUsage)}/month` : ""}{est.oneTime ? ` · one-time ${inr(est.oneTime)}` : ""}
      </span>
      {step > 0 && <button className="btn btn-sec btn-sm" onClick={() => setStep(step - 1)}>Back</button>}
      {step < STEPS.length - 1 && <button className="btn btn-sec btn-sm" onClick={() => setStep(step + 1)}>Next</button>}
      {!ro && <button className="btn btn-sec btn-sm" onClick={() => onSave(p, false)}>Save draft</button>}
      {!ro && step === STEPS.length - 1 && <button className="btn btn-primary btn-sm" disabled={problems.length > 0 || !String(p.reason || "").trim()} onClick={() => onSave(p, true)}>Send for approval</button>}
    </>}>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {STEPS.map((s, i) => <button key={s} type="button" className={`btn btn-xs ${step === i ? "btn-primary" : "btn-sec"}`} onClick={() => setStep(i)}>{i + 1}. {s}</button>)}
      </div>
      <fieldset disabled={ro} style={{ border: 0, padding: 0, margin: 0 }}>
        {step === 0 && (
          <div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>Only the models, units and modules each product's billing profile allows are offered.</div>
            {(t.products || []).length === 0 && <div style={{ fontSize: 12.5, marginTop: 8 }}>No catalogue products on this plan (services only).</div>}
            {(t.products || []).map((x, i) => {
              const prof = byId(bm.profiles, x.profileId);
              return (
                <div key={x.productId} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginTop: 8 }}>
                  <b>{productName(x.productId)}</b> <span style={{ fontSize: 11.5, color: prof ? "var(--text3)" : "#B45309" }}>{prof ? `profile: ${prof.name} (${prof.status})` : "no billing profile"}</span>
                  {prof && <>
                    <div style={lbl}>Billing model</div>
                    <select value={x.modelId} onChange={(e) => setProduct(i, { modelId: e.target.value })}>{prof.allowedModelIds.map((id) => <option key={id} value={id}>{byId(bm.models, id)?.name || id}</option>)}</select>
                    <div style={lbl}>Units</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{prof.allowedUnitIds.map((u) => { const on = (x.unitIds || []).includes(u); return <button key={u} type="button" style={chipS(on)} onClick={() => setProduct(i, { unitIds: on ? x.unitIds.filter((y) => y !== u) : [...(x.unitIds || []), u] })}>{byId(bm.units, u)?.name || u}</button>; })}</div>
                    {prof.modules.length > 0 && <><div style={lbl}>Modules</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{prof.modules.map((mo) => { const on = (x.modules || []).includes(mo); return <button key={mo} type="button" style={chipS(on)} onClick={() => setProduct(i, { modules: on ? x.modules.filter((y) => y !== mo) : [...(x.modules || []), mo] })}>{mo}</button>; })}</div></>}
                    <div style={lbl}>Sites (comma-separated)</div>
                    <input value={(x.sites || []).join(", ")} onChange={(e) => setProduct(i, { sites: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="e.g. DEL, BOM" style={{ width: "100%" }} />
                  </>}
                </div>
              );
            })}
          </div>
        )}

        {step === 1 && (
          <table className="tbl">
            <thead><tr><th>Component</th><th>Billed as</th><th style={{ textAlign: "right" }}>List rate</th><th style={{ textAlign: "right" }}>Agreed rate</th><th style={{ textAlign: "right" }}>Discount</th><th style={{ textAlign: "right" }}>Qty</th><th style={{ textAlign: "right" }}>Minimum / month</th></tr></thead>
            <tbody>
              {t.lines.map((l, i) => {
                const locked = l.billingClass === "one_time" && p.version > 1;
                return (
                  <tr key={`${l.code}-${i}`}>
                    <td><b>{l.name}</b><div style={{ fontSize: 10.5, color: "var(--text3)" }}>{l.code} · per {l.unit || "unit"}</div></td>
                    <td style={{ fontSize: 12 }}>{billingClassLabel(l.billingClass)}{locked && <div style={{ fontSize: 10.5, color: "var(--text3)" }}>billed by milestone; add one-time changes as a fee</div>}</td>
                    <td style={{ textAlign: "right" }}>{inr(l.listRate)}</td>
                    <td style={{ textAlign: "right" }}>{locked ? inr(l.netRate) : <input type="number" min={0} step="any" value={l.netRate} style={{ width: 100, textAlign: "right" }}
                      onChange={(e) => { const v = Math.max(0, Number(e.target.value) || 0); setLine(i, { netRate: v, discountPct: discountForRate(l.listRate, v) }); }} />}</td>
                    <td style={{ textAlign: "right", fontSize: 12 }}>{Number(l.discountPct) ? `${+Number(l.discountPct).toFixed(2)}%` : "—"}</td>
                    <td style={{ textAlign: "right" }}>{l.billingClass === "subscription" && !locked ? <input type="number" min={0} value={l.qty} style={{ width: 70, textAlign: "right" }} onChange={(e) => setLine(i, { qty: Math.max(0, Number(e.target.value) || 0) })} />
                      : l.billingClass === "transaction" ? <span style={{ color: "var(--text3)" }} title="Expected volume: internal">~{l.qty}</span> : l.qty}</td>
                    <td style={{ textAlign: "right" }}>{l.billingClass === "transaction" ? <input type="number" min={0} value={l.monthlyMinimum || 0} style={{ width: 90, textAlign: "right" }} onChange={(e) => setLine(i, { monthlyMinimum: Math.max(0, Number(e.target.value) || 0) })} /> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {step === 2 && (
          <div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>One-time and recurring fees on top of the components. Amounts in {p.currency}.</div>
            {(t.fees || []).map((f, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
                <select value={f.feeTypeId} onChange={(e) => { const ft = byId(bm.feeTypes, e.target.value); setT("fees", t.fees.map((x, j) => (j === i ? { ...x, feeTypeId: e.target.value, kind: ft?.kind || "one_time" } : x))); }}>
                  <option value="">— Fee type —</option>
                  <optgroup label="One-time">{feeTypes.filter((x) => x.kind === "one_time").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
                  <optgroup label="Recurring">{feeTypes.filter((x) => x.kind === "recurring").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
                </select>
                <select value={f.productId || ""} onChange={(e) => setT("fees", t.fees.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))}>
                  <option value="">Whole plan</option>{(t.products || []).map((x) => <option key={x.productId} value={x.productId}>{productName(x.productId)}</option>)}
                </select>
                <input value={f.amount} placeholder="Amount" style={{ width: 110, textAlign: "right" }} onChange={(e) => setT("fees", t.fees.map((x, j) => (j === i ? { ...x, amount: e.target.value.trim() } : x)))} />
                {f.kind === "recurring" && <select value={f.per || "month"} onChange={(e) => setT("fees", t.fees.map((x, j) => (j === i ? { ...x, per: e.target.value } : x)))}><option value="month">a month</option><option value="year">a year</option></select>}
                {f.kind !== "recurring" && <input value={f.milestone || ""} placeholder="Milestone (e.g. on go-live)" style={{ width: 200 }} onChange={(e) => setT("fees", t.fees.map((x, j) => (j === i ? { ...x, milestone: e.target.value } : x)))} />}
                {!ro && <button type="button" className="icon-btn" onClick={() => setT("fees", t.fees.filter((_, j) => j !== i))}><X size={13} /></button>}
              </div>
            ))}
            {!ro && <button type="button" className="btn btn-sec btn-xs" style={{ marginTop: 8 }} onClick={() => setT("fees", [...(t.fees || []), { feeTypeId: "", kind: "one_time", amount: "", productId: "" }])}><Plus size={11} />Add fee</button>}
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}><label>Takes effect *</label><input type="date" value={p.effectiveFrom} disabled={p.version === 1} onChange={(e) => setP({ ...p, effectiveFrom: e.target.value })} /></div>
              <div className="form-group" style={{ flex: 1 }}><label>Lock-in (months)</label><input type="number" min={0} value={t.term?.lockInMonths ?? ""} onChange={(e) => setT("term", { ...t.term, lockInMonths: e.target.value })} /></div>
              <div className="form-group" style={{ flex: 1 }}><label>Renewal</label><select value={t.term?.renewal?.type || "manual"} onChange={(e) => setT("term", { ...t.term, renewal: { ...t.term?.renewal, type: e.target.value } })}><option value="manual">Manual</option><option value="auto">Automatic</option></select></div>
              <div className="form-group" style={{ flex: 1 }}><label>Notice (days)</label><input type="number" min={0} value={t.term?.renewal?.noticeDays ?? ""} onChange={(e) => setT("term", { ...t.term, renewal: { ...t.term?.renewal, noticeDays: e.target.value } })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}><label>Escalation</label><select value={t.term?.escalation?.type || "none"} onChange={(e) => setT("term", { ...t.term, escalation: { ...t.term?.escalation, type: e.target.value } })}>{ESCALATION_TYPES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
              {t.term?.escalation?.type === "fixed" && <div className="form-group" style={{ flex: 1 }}><label>% a year</label><input value={t.term.escalation.pct || ""} onChange={(e) => setT("term", { ...t.term, escalation: { ...t.term.escalation, pct: e.target.value.trim() } })} /></div>}
              {t.term?.escalation?.type === "index" && <div className="form-group" style={{ flex: 2 }}><label>Index</label><input value={t.term.escalation.index || ""} placeholder="e.g. CPI (India)" onChange={(e) => setT("term", { ...t.term, escalation: { ...t.term.escalation, index: e.target.value } })} /></div>}
            </div>
            {t.term?.escalation?.type === "step" && <div>
              {(t.term.escalation.steps || []).map((s, i) => <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, fontSize: 12 }}>From month <input type="number" min={1} value={s.fromMonth} style={{ width: 60 }} onChange={(e) => setT("term", { ...t.term, escalation: { ...t.term.escalation, steps: t.term.escalation.steps.map((x, j) => (j === i ? { ...x, fromMonth: e.target.value } : x)) } })} /> rates rise <input value={s.pct} style={{ width: 60 }} onChange={(e) => setT("term", { ...t.term, escalation: { ...t.term.escalation, steps: t.term.escalation.steps.map((x, j) => (j === i ? { ...x, pct: e.target.value.trim() } : x)) } })} />%</div>)}
              {!ro && <button type="button" className="btn btn-sec btn-xs" onClick={() => setT("term", { ...t.term, escalation: { ...t.term.escalation, steps: [...(t.term.escalation.steps || []), { fromMonth: 13, pct: "" }] } })}><Plus size={11} />Add step</button>}
            </div>}
            <div className="form-row" style={{ marginTop: 8 }}>
              <div className="form-group" style={{ flex: 1 }}><label>Billing frequency *</label><select value={t.billingTerms?.frequency || "Monthly"} onChange={(e) => setT("billingTerms", { ...t.billingTerms, frequency: e.target.value })}>{BILLING_FREQUENCIES.map((f) => <option key={f}>{f}</option>)}</select></div>
              <div className="form-group" style={{ flex: 1 }}><label>Fixed charges billed *</label><select value={t.billingTerms?.timing || "advance"} onChange={(e) => setT("billingTerms", { ...t.billingTerms, timing: e.target.value })}><option value="advance">In advance</option><option value="arrears">In arrears</option></select></div>
              <div className="form-group" style={{ flex: 1 }}><label>Credit days</label><input type="number" min={0} value={t.billingTerms?.creditDays ?? ""} onChange={(e) => setT("billingTerms", { ...t.billingTerms, creditDays: e.target.value })} /></div>
              <div className="form-group" style={{ flex: 1 }}><label>Currency *</label><select value={p.currency} onChange={(e) => setP({ ...p, currency: e.target.value })}>{bm.currencies.map((c) => <option key={c}>{c}</option>)}</select></div>
            </div>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}><label>Legal entity *</label><select value={p.legalEntity || ""} onChange={(e) => setP({ ...p, legalEntity: e.target.value })}><option value="">— Pick —</option>{active(bm.legalEntities).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
              <div className="form-group" style={{ flex: 2 }}><label>Taxes</label><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{active(bm.taxes).map((x) => { const on = (t.billingTerms?.taxIds || []).includes(x.id); return <button key={x.id} type="button" style={chipS(on)} onClick={() => setT("billingTerms", { ...t.billingTerms, taxIds: on ? t.billingTerms.taxIds.filter((y) => y !== x.id) : [...(t.billingTerms?.taxIds || []), x.id] })}>{x.name}</button>; })}</div></div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <div style={lbl}>Plan discounts</div>
            {(t.discounts || []).map((d, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                <select value={d.type} onChange={(e) => setT("discounts", t.discounts.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))}><option value="">— Type —</option>{DISCOUNT_TYPES.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                <input value={d.pct} placeholder="%" style={{ width: 70, textAlign: "right" }} onChange={(e) => setT("discounts", t.discounts.map((x, j) => (j === i ? { ...x, pct: e.target.value.trim() } : x)))} />%
                <input value={d.note || ""} placeholder="Note" style={{ flex: 1 }} onChange={(e) => setT("discounts", t.discounts.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
                {!ro && <button type="button" className="icon-btn" onClick={() => setT("discounts", t.discounts.filter((_, j) => j !== i))}><X size={13} /></button>}
              </div>
            ))}
            {!ro && <button type="button" className="btn btn-sec btn-xs" onClick={() => setT("discounts", [...(t.discounts || []), { type: "", pct: "", note: "" }])}><Plus size={11} />Add discount</button>}
            {(t.products || []).some((x) => x.modelId === "revenue_share") && <>
              <div style={lbl}>Revenue share</div>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}><label>Share %</label><input value={t.revenueShare?.sharePct ?? ""} onChange={(e) => setT("revenueShare", { ...t.revenueShare, sharePct: e.target.value.trim() })} /></div>
                <div className="form-group" style={{ flex: 1 }}><label>Floor / minimum guarantee</label><input value={t.revenueShare?.floorAmount ?? ""} onChange={(e) => setT("revenueShare", { ...t.revenueShare, floorAmount: e.target.value.trim() })} /></div>
                <div className="form-group" style={{ flex: 1 }}><label>Who collects</label><select value={t.revenueShare?.collector || ""} onChange={(e) => setT("revenueShare", { ...t.revenueShare, collector: e.target.value })}><option value="">— Pick —</option>{active(bm.payerTypes).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
                <div className="form-group" style={{ flex: 1 }}><label>Settlement</label><select value={t.revenueShare?.settlementCycle || ""} onChange={(e) => setT("revenueShare", { ...t.revenueShare, settlementCycle: e.target.value })}><option value="">— Pick —</option>{["Monthly", "Quarterly", "Half-yearly", "Annual"].map((x) => <option key={x}>{x}</option>)}</select></div>
              </div>
            </>}
            <div style={lbl}>SLA credits</div>
            {(t.sla || []).map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, fontSize: 12 }}>
                <input value={s.metric} placeholder="e.g. Uptime" style={{ flex: 1 }} onChange={(e) => setT("sla", t.sla.map((x, j) => (j === i ? { ...x, metric: e.target.value } : x)))} />
                below <input value={s.threshold} placeholder="99.5%" style={{ width: 80 }} onChange={(e) => setT("sla", t.sla.map((x, j) => (j === i ? { ...x, threshold: e.target.value } : x)))} />
                credit <input value={s.creditPct} placeholder="%" style={{ width: 60 }} onChange={(e) => setT("sla", t.sla.map((x, j) => (j === i ? { ...x, creditPct: e.target.value.trim() } : x)))} />% of the month's fee
                {!ro && <button type="button" className="icon-btn" onClick={() => setT("sla", t.sla.filter((_, j) => j !== i))}><X size={13} /></button>}
              </div>
            ))}
            {!ro && <button type="button" className="btn btn-sec btn-xs" onClick={() => setT("sla", [...(t.sla || []), { metric: "", threshold: "", creditPct: "" }])}><Plus size={11} />Add SLA credit</button>}
            <div className="form-row" style={{ marginTop: 8 }}>
              <div className="form-group" style={{ width: 200 }}><label>Late-payment interest (% a year)</label><input value={t.lateInterestPct ?? ""} onChange={(e) => setT("lateInterestPct", e.target.value.trim())} /></div>
              <div className="form-group" style={{ flex: 1 }}><label>Termination terms</label><input value={t.termination || ""} onChange={(e) => setT("termination", e.target.value)} placeholder="e.g. 90 days' notice after the lock-in" /></div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginBottom: 10 }}>
              {[["Fixed recurring", est.fixed], ["Minimums", est.minimums], ["Recurring fees", est.recurringFees], ["Committed / month", est.committedMonthly], ["Usage (expected)", est.expectedUsage], ["One-time", est.oneTime]].map(([k, v]) => (
                <div key={k} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px" }}><div style={{ fontSize: 10.5, color: "var(--text3)" }}>{k}</div><b>{inr(v)}</b></div>
              ))}
            </div>
            {est.planDiscount > 0 && <div style={{ fontSize: 12 }}>Plan discount {est.planDiscount}% applied to committed charges.</div>}
            <div style={{ fontSize: 12.5, margin: "6px 0" }}>Largest effective discount <b>{planDiscountPct(p)}%</b> → approved by <b>{route.route === "owner" ? "the account owner" : route.label}</b>.</div>
            {prev && <div style={{ fontSize: 12 }}><b>Changes from version {prev.version}:</b> {changes.length ? changes.join(" · ") : "none yet"}</div>}
            {!ro && <div className="form-group" style={{ marginTop: 8 }}><label>Why this version? *</label><input value={p.reason || ""} onChange={(e) => setP({ ...p, reason: e.target.value })} placeholder="e.g. Customer added 10 users from February" /></div>}
            {problems.length > 0 && <div style={{ fontSize: 12, color: "#B91C1C", marginTop: 6 }}><AlertTriangle size={12} /> To fix before sending:{problems.map((x) => <div key={x}>· {x}</div>)}</div>}
          </div>
        )}
      </fieldset>
    </Modal>
  );
}
