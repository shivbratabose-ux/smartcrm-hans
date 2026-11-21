// Billing: monthly invoices from customer agreements and actual usage.
// Opened from the menu: Post-sales → Billing (Accounts, Finance and managers).
//   Invoice run  what is due for the month, per agreement, with the working
//   Usage        enter / paste / approve / correct actual consumption
//   Invoices     final invoices and credit notes
// All figures come from lib/billing/engine.js; data from lib/billing/store.js.
import { useState, useEffect, useMemo } from "react";
import { X, AlertTriangle, Check, Plus, Upload, FileText, RotateCcw, Download } from "lucide-react";
import { statementCsv, SHARE_MODES } from "../lib/billing/revenueShare";
import {
  billingRun, expectedUsage, reconcileUsage, correctUsage, parseUsageRows, matchUsageRows, finaliseProblems, finalise, milestoneInvoice,
  creditNote, netOfCredits, collectionFromInvoice, billingSettings, periodOf, periodLabel, addMonths, isPeriod, FREQUENCY_MONTHS,
} from "../lib/billing/engine";
import { loadBilling, saveUsage, saveInvoice, billingIsCloud } from "../lib/billing/store";

const inr = (v) => `${Number(v) < 0 ? "− " : ""}₹${Math.abs(Math.round(Number(v) || 0)).toLocaleString("en-IN")}`;
const th = { textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--text3)", padding: "6px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td = { padding: "6px 10px", borderBottom: "1px solid var(--border)", fontSize: 12.5, verticalAlign: "top" };
const inp = { padding: "5px 8px", border: "1.5px solid var(--border)", borderRadius: 6, fontSize: 12.5, background: "#fff" };
const LEVEL = { blocking: ["#B91C1C", "#FEF2F2"], warning: ["#92400E", "#FFFBEB"], info: ["#475569", "#F1F5F9"] };
const uid = () => `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function Issues({ issues }) {
  if (!issues?.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "6px 0" }}>
      {issues.map((i, k) => { const [c, bg] = LEVEL[i.level] || LEVEL.info; return (
        <div key={k} style={{ fontSize: 12, color: c, background: bg, borderRadius: 6, padding: "4px 8px" }}>
          {i.level === "blocking" ? <AlertTriangle size={12} style={{ verticalAlign: -2 }} /> : null} {i.message}
        </div>); })}
    </div>
  );
}

/** One invoice, with the working per line. */
function InvoiceView({ inv }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr>{["#", "Line", "Qty", "Rate", "Amount"].map((h) => <th key={h} style={{ ...th, textAlign: h === "#" || h === "Line" ? "left" : "right" }}>{h}</th>)}</tr></thead>
      <tbody>
        {inv.lines.map((l) => (
          <tr key={l.lineNo}>
            <td style={td}>{l.lineNo}</td>
            <td style={td}>
              <b>{l.description}</b>
              <div style={{ fontSize: 11.5, color: "var(--text3)" }}>
                {l.calc?.basis}
                {(l.calc?.months || []).map((m) => (
                  <div key={m.period}>
                    {periodLabel(m.period)}: {l.billingClass === "transaction"
                      ? <>{Number(m.qty).toLocaleString("en-IN")} {l.unit}{m.slab ? ` · slab ${m.slab}` : ""} → {inr(m.usage)}{m.minimumApplied ? ` · minimum ${inr(m.minimum)} applies` : ""}{m.factor !== 1 ? ` · escalation ×${m.factor}` : ""}{m.differential ? ` · fixed fee ${inr(m.differential.fixed)} ${m.differential.adjustment >= 0 ? "+" : "−"} ${m.differential.sharePct}% of the difference ${inr(Math.abs(m.differential.adjustment))}` : ""} = <b>{inr(m.amount)}</b>{m.missing ? <span style={{ color: "#B91C1C" }}> · usage missing</span> : null}</>
                      : <>{inr(l.calc.monthly)} a month{m.fraction < 1 ? ` × ${(m.fraction * 100).toFixed(1)}% of the month` : ""}{m.factor !== 1 ? ` × ${m.factor} escalation` : ""} = <b>{inr(m.amount)}</b></>}
                  </div>
                ))}
              </div>
            </td>
            <td style={{ ...td, textAlign: "right" }}>{l.qty ? Number(l.qty).toLocaleString("en-IN") : ""}</td>
            <td style={{ ...td, textAlign: "right" }}>{l.rate ? `₹${Number(l.rate).toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(Math.round(Number(l.rate) * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 })}` : ""}</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{inr(l.amount)}</td>
          </tr>
        ))}
        <tr><td style={td} colSpan={4} align="right">Taxable value</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{inr(inv.taxable)}</td></tr>
        {inv.igst ? <tr><td style={td} colSpan={4} align="right">IGST {inv.gstPct}%</td><td style={{ ...td, textAlign: "right" }}>{inr(inv.igst)}</td></tr>
          : <><tr><td style={td} colSpan={4} align="right">CGST {inv.gstPct / 2}%</td><td style={{ ...td, textAlign: "right" }}>{inr(inv.cgst)}</td></tr>
            <tr><td style={td} colSpan={4} align="right">SGST {inv.gstPct / 2}%</td><td style={{ ...td, textAlign: "right" }}>{inr(inv.sgst)}</td></tr></>}
        <tr><td style={{ ...td, fontWeight: 800 }} colSpan={4} align="right">Total payable</td><td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{inr(inv.total)}</td></tr>
      </tbody>
    </table>
  );
}

/** Download a revenue share statement as CSV (opens in Excel). */
function downloadStatement(st) {
  const blob = new Blob(["﻿" + statementCsv(st)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${st.statementNo.replace(/[\\/]/g, "-")}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * A monthly revenue share statement (trade-billed lines, WiseCCS TRS): not an
 * invoice. Hans has billed the trade; the customer invoices its share.
 */
export function StatementView({ st }) {
  const blocked = st.issues.some((i) => i.level === "blocking");
  const pct = (v) => `${+Number(v).toFixed(2)}%`;
  return (
    <div style={{ border: "1px solid #99F6E4", borderRadius: 8, padding: "8px 10px", marginBottom: 10, background: "#F0FDFA" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
        <div style={{ fontSize: 12.5 }}><FileText size={12} style={{ verticalAlign: -2 }} /> <b style={{ fontFamily: "monospace" }}>{st.statementNo}</b> <span style={{ color: "var(--text3)" }}>· revenue share statement · {SHARE_MODES[st.mode]}{st.modeOverridden ? " (set on this agreement)" : ""}</span></div>
        <button className="btn btn-sm btn-sec" disabled={blocked} title={blocked ? "Approve the month's counts first" : "Download for Excel"} onClick={() => downloadStatement(st)}><Download size={12} /> Statement (Excel)</button>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text3)", marginBottom: 6 }}>Billed by Hans Infomatic to the trade; nothing is invoiced to {st.customer || "the customer"}. {st.customer || "The customer"} invoices its share below, payable within {st.paymentDays} days of receipt of its invoice.</div>
      <Issues issues={st.issues} />
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6 }}>
        <thead><tr>{["Transaction", "Count", "Rate", "Gross"].map((h) => <th key={h} style={{ ...th, textAlign: h === "Transaction" ? "left" : "right" }}>{h}</th>)}</tr></thead>
        <tbody>
          {st.lines.map((l) => (
            <tr key={l.code}>
              <td style={td}>{l.name} <span style={{ fontFamily: "monospace", color: "var(--text3)", fontSize: 11 }}>{l.code}</span>{l.missing ? <span style={{ color: "#B91C1C" }}> · count missing</span> : null}</td>
              <td style={{ ...td, textAlign: "right" }}>{Number(l.qty).toLocaleString("en-IN")}</td>
              <td style={{ ...td, textAlign: "right" }}>₹{Number(l.rate).toLocaleString("en-IN")}</td>
              <td style={{ ...td, textAlign: "right" }}>{inr(l.gross)}</td>
            </tr>
          ))}
          <tr><td style={{ ...td, fontWeight: 700 }}>Total</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{Number(st.count).toLocaleString("en-IN")}</td><td style={td}></td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{inr(st.gross)}</td></tr>
        </tbody>
      </table>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{["Slab (combined count)", "Count", "Gross", "Hans %", "Hans", st.customer || "Customer"].map((h) => <th key={h} style={{ ...th, textAlign: h.startsWith("Slab") ? "left" : "right" }}>{h}</th>)}</tr></thead>
        <tbody>
          {st.bands.map((b) => (
            <tr key={b.label}>
              <td style={td}>{b.label}</td>
              <td style={{ ...td, textAlign: "right" }}>{Number(b.count).toLocaleString("en-IN")}</td>
              <td style={{ ...td, textAlign: "right" }}>{inr(b.gross)}</td>
              <td style={{ ...td, textAlign: "right" }}>{pct(b.hansPct)}</td>
              <td style={{ ...td, textAlign: "right" }}>{inr(b.hans)}</td>
              <td style={{ ...td, textAlign: "right" }}>{inr(b.operator)}</td>
            </tr>
          ))}
          <tr>
            <td style={{ ...td, fontWeight: 800 }}>Total{st.count ? ` (Hans ${pct(st.hansPct)} overall)` : ""}</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{Number(st.count).toLocaleString("en-IN")}</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{inr(st.gross)}</td><td style={td}></td>
            <td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{inr(st.hans)}</td>
            <td style={{ ...td, textAlign: "right", fontWeight: 800, color: "#0F766E" }}>{inr(st.operator)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function BillingPanel({ quotes = [], setQuotes, accounts = [], setCollections, config = {}, currentUser = "", orgUsers = [], today = "", onClose, onOpenQuote }) {
  const [tab, setTab] = useState("run");
  const [period, setPeriod] = useState(periodOf(today) ? addMonths(periodOf(today), -1) : "");
  const [data, setData] = useState({ phase: "loading", usage: [], invoices: [], error: "" });
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [paste, setPaste] = useState("");
  const [checked, setChecked] = useState(null);
  const [openInv, setOpenInv] = useState(null);

  useEffect(() => { let alive = true; loadBilling().then((d) => alive && setData({ phase: "ready", ...d })).catch((e) => alive && setData({ phase: "ready", usage: [], invoices: [], error: String(e?.message || e) })); return () => { alive = false; }; }, []);

  const accName = (id, fallback) => accounts.find((a) => a.id === id)?.name || fallback || "—";
  const userName = (id) => orgUsers.find((u) => u.id === id)?.name || id || "";
  const now = () => new Date().toISOString();
  const run = useMemo(() => (isPeriod(period) ? billingRun({ quotes, period, usageRecords: data.usage, invoices: data.invoices, config }) : []), [quotes, period, data.usage, data.invoices, config]);
  const usageLines = useMemo(() => (isPeriod(period) ? expectedUsage(quotes, period) : []), [quotes, period]);

  // ── mutations ──
  const putUsage = async (records) => {
    setBusy("usage"); setMsg(null);
    const { error } = await saveUsage(records);
    setBusy("");
    if (error) { setMsg({ bad: true, text: error }); return false; }
    setData((d) => { const byId = new Map(d.usage.map((r) => [r.id, r])); records.forEach((r) => byId.set(r.id, r)); return { ...d, usage: [...byId.values()] }; });
    return true;
  };
  const addUsage = (quote, line, quantity, externalRef, note) => putUsage([{ id: uid(), quoteId: quote.id, accountId: quote.agreement.accountId || quote.accountId || "", lineCode: line.code, period, quantity: Number(quantity) || 0, externalRef: String(externalRef || "").trim(), source: "manual", status: "draft", correctsId: "", note: note || "", enteredBy: currentUser, enteredAt: now(), approvedBy: "", approvedAt: "" }]);
  const approve = (records) => putUsage(records.map((r) => ({ ...r, status: "approved", approvedBy: currentUser, approvedAt: now() })));
  const voidRec = (r) => window.confirm(`Void this entry of ${r.quantity}? It stays on record but is no longer counted.`) && putUsage([{ ...r, status: "void", voidedBy: currentUser, voidedAt: now() }]);
  const correct = (r) => {
    const v = window.prompt(`Correct the quantity (now ${r.quantity}). The current entry is kept as void.`, String(r.quantity));
    if (v === null || v.trim() === "" || !Number.isFinite(Number(v)) || Number(v) < 0) return;
    const { voided, correction } = correctUsage(r, Number(v), { by: currentUser, at: now(), id: uid(), note: "Correction" });
    putUsage([voided, correction]);
  };

  const postInvoice = async (preview, extraWarnings = []) => {
    const problems = finaliseProblems(preview, data.invoices);
    if (problems.length) { setMsg({ bad: true, text: problems.join(" ") }); return; }
    const warnings = [...(preview.issues || []).filter((i) => i.level === "warning").map((i) => i.message), ...extraWarnings];
    if (!window.confirm(`${warnings.length ? `Please check first:\n• ${warnings.join("\n• ")}\n\n` : ""}Finalise ${preview.invoiceNo} for ${inr(preview.total)} and post it to Collections? A final invoice cannot be edited; a correction is a credit note.`)) return;
    const quote = quotes.find((q) => q.id === preview.quoteId);
    const col = collectionFromInvoice(preview, { today, by: currentUser, creditDays: quote?.creditDays, contractId: quote?.contractId || "", legalName: quote?.legalName || "", gstin: quote?.gstin || "" });
    const final = { ...finalise(preview, { by: currentUser, at: now() }), collectionId: col.id };
    setBusy(preview.id); setMsg(null);
    const { error } = await saveInvoice(final);
    setBusy("");
    if (error) { setMsg({ bad: true, text: error }); return; }
    setData((d) => ({ ...d, invoices: [final, ...d.invoices] }));
    if (setCollections) setCollections((p) => (p.some((c) => c.id === col.id) ? p : [...p, col]));
    setMsg({ text: `${final.invoiceNo} is final and posted to Collections.` });
  };
  const raiseMilestone = (quote, index) => { const p = milestoneInvoice(quote, index, periodOf(today) || period, { invoices: data.invoices, config }); if (p) postInvoice(p); };
  const raiseCredit = async (inv) => {
    const amt = window.prompt(`Credit note against ${inv.invoiceNo} (taxable ${inr(inv.taxable)}).\nTaxable amount to credit (leave blank for the whole invoice):`, "");
    if (amt === null) return;
    if (amt.trim() !== "" && (!Number.isFinite(Number(amt)) || Number(amt) <= 0 || Number(amt) > inv.taxable)) { setMsg({ bad: true, text: "The credit must be more than 0 and not more than the invoice's taxable value." }); return; }
    const reason = window.prompt("Reason for the credit note (required):", "");
    if (!reason || !reason.trim()) { setMsg({ bad: true, text: "A credit note needs a reason." }); return; }
    const seq = data.invoices.filter((i) => i.creditOf === inv.id).length + 1;
    const cn = creditNote(inv, { amount: amt.trim() === "" ? null : Number(amt), reason: reason.trim(), by: currentUser, at: now(), seq });
    setBusy(inv.id);
    const { error } = await saveInvoice(cn);
    setBusy("");
    if (error) { setMsg({ bad: true, text: error }); return; }
    setData((d) => ({ ...d, invoices: [cn, ...d.invoices] }));
    if (setCollections) setCollections((p) => p.map((c) => (c.id === inv.collectionId ? { ...c, remarks: `${c.remarks || ""} Credit note ${cn.invoiceNo}: ${inr(cn.total)} (${reason.trim()}).`.trim() } : c)));
    setMsg({ text: `${cn.invoiceNo} recorded. The Collections entry carries a note; adjust the amount received there.` });
  };
  const setBilling = (quote, patch) => setQuotes && setQuotes((p) => p.map((q) => (q.id === quote.id ? { ...q, agreement: { ...q.agreement, billing: { ...(q.agreement.billing || {}), ...patch } } } : q)));

  const checkPaste = () => {
    const parsed = parseUsageRows(paste);
    const matched = matchUsageRows(parsed.rows, quotes, data.usage, { by: currentUser, at: now(), idOf: () => uid() });
    setChecked({ ...matched, errors: parsed.errors });
  };
  const importPaste = async () => { if (checked?.records.length && await putUsage(checked.records)) { setMsg({ text: `${checked.records.length} usage ${checked.records.length > 1 ? "entries" : "entry"} imported as drafts. Approve them below.` }); setPaste(""); setChecked(null); } };

  const tabBtn = (k, label) => <button key={k} type="button" className={`btn btn-sm ${tab === k ? "btn-primary" : "btn-sec"}`} onClick={() => setTab(k)}>{label}</button>;
  const finals = data.invoices.filter((i) => i.type !== "credit");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ width: 1180, maxWidth: "98vw", height: "94vh", overflow: "auto", background: "var(--surface)", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--surface)", zIndex: 2 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>Billing</div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>Invoices worked out from each customer's agreement and their actual usage{billingIsCloud() ? "" : " · offline mode: saved in this browser only"}.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {tabBtn("run", "Invoice run")}{tabBtn("usage", "Usage")}{tabBtn("invoices", `Invoices (${data.invoices.length})`)}
            {tab !== "invoices" && <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>Month <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} style={inp} /></label>}
            <button className="icon-btn" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div style={{ padding: 16 }}>
          {data.phase === "loading" && <div style={{ padding: 30, textAlign: "center", color: "var(--text3)" }}>Loading…</div>}
          {data.error && <div style={{ fontSize: 12.5, color: "#B91C1C", background: "#FEF2F2", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>Could not load billing data: {data.error}</div>}
          {msg && <div style={{ fontSize: 12.5, color: msg.bad ? "#B91C1C" : "#065F46", background: msg.bad ? "#FEF2F2" : "#ECFDF5", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>{msg.text}</div>}

          {/* ── Invoice run ── */}
          {data.phase === "ready" && tab === "run" && (
            run.length === 0 ? (
              <div style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: "28px 20px", textAlign: "center", color: "var(--text3)", fontSize: 12.5 }}>
                Nothing to bill for {isPeriod(period) ? periodLabel(period) : "this month"}. Agreements appear here once a customer has accepted a quotation and its term covers the month.
              </div>
            ) : run.map(({ quote, agreement: a, previews, finalInvoices, milestones, statements = [] }) => {
              const s = billingSettings(a);
              return (
                <div key={quote.id} style={{ border: "1px solid var(--border)", borderRadius: 10, marginBottom: 14, overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", background: "var(--s2)", padding: "8px 12px" }}>
                    <div><b>{accName(a.accountId, a.customer)}</b> <span style={{ fontFamily: "monospace", color: "var(--text3)", fontSize: 12 }}>· {a.agreementNo}</span>
                      {onOpenQuote && a.quoteId && <button className="btn btn-sec btn-xs" style={{ marginLeft: 8 }} title="Open the accepted quotation (read only)" onClick={() => onOpenQuote(a.quoteId)}><FileText size={11} />Open quote</button>}</div>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 11.5 }}>
                      <label>Subscription <select style={inp} value={s.subscriptionFrequency} onChange={(e) => setBilling(quote, { subscriptionFrequency: e.target.value })}>{Object.keys(FREQUENCY_MONTHS).map((f) => <option key={f}>{f}</option>)}</select></label>
                      <label>Usage <select style={inp} value={s.usageFrequency} onChange={(e) => setBilling(quote, { usageFrequency: e.target.value })}>{Object.keys(FREQUENCY_MONTHS).map((f) => <option key={f}>{f}</option>)}</select></label>
                      <label style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={s.separateUsageInvoice} onChange={(e) => setBilling(quote, { separateUsageInvoice: e.target.checked })} />Separate usage invoice</label>
                      <label style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={s.prorate} onChange={(e) => setBilling(quote, { prorate: e.target.checked })} />Prorate part months</label>
                      {statements.length > 0 && <label title="How the revenue-share slabs apply to the month's combined count">Revenue share <select style={inp} value={s.revenueShareMode} onChange={(e) => setBilling(quote, { revenueShareMode: e.target.value })}><option value="">As agreed</option><option value="graduated">Graduated</option><option value="volume">Whole month</option></select></label>}
                    </div>
                  </div>
                  <div style={{ padding: "8px 12px" }}>
                    {finalInvoices.map((f) => (
                      <div key={f.id} style={{ fontSize: 12.5, color: "#065F46", background: "#ECFDF5", borderRadius: 6, padding: "5px 8px", marginBottom: 6 }}>
                        <Check size={12} style={{ verticalAlign: -2 }} /> {f.invoiceNo}: {inr(f.total)} {f.type === "credit" ? "credit note" : "final"}, {userName(f.finalisedBy)} {f.finalisedAt ? new Date(f.finalisedAt).toLocaleDateString("en-IN") : ""}
                      </div>
                    ))}
                    {statements.map((st) => <StatementView key={st.id} st={st} />)}
                    {previews.length === 0 && finalInvoices.length === 0 && statements.length === 0 && <div style={{ fontSize: 12.5, color: "var(--text3)" }}>Nothing falls due in {periodLabel(period)} (billed in another month of its cycle).</div>}
                    {previews.map((p) => {
                      const problems = finaliseProblems(p, data.invoices);
                      return (
                        <div key={p.id} style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "4px 0" }}>
                            <div style={{ fontSize: 12.5 }}><FileText size={12} style={{ verticalAlign: -2 }} /> <b style={{ fontFamily: "monospace" }}>{p.invoiceNo}</b> <span style={{ color: "var(--text3)" }}>· preview · {p.cycle === "usage" ? "usage" : p.cycle === "subscription" ? "subscription" : "subscription and usage"}</span></div>
                            <button className="btn btn-sm btn-primary" disabled={problems.length > 0 || busy === p.id} title={problems.join(" ")} onClick={() => postInvoice(p)}>{busy === p.id ? "Saving…" : `Finalise and post ${inr(p.total)}`}</button>
                          </div>
                          <Issues issues={p.issues} />
                          <InvoiceView inv={p} />
                        </div>
                      );
                    })}
                    {milestones.length > 0 && (
                      <div style={{ fontSize: 12.5, marginTop: 6 }}>
                        <b>One-time charges by milestone:</b>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                          {milestones.map((m) => m.invoiced
                            ? <span key={m.index} style={{ fontSize: 12, color: "#065F46", background: "#ECFDF5", borderRadius: 14, padding: "3px 10px" }}><Check size={11} style={{ verticalAlign: -2 }} /> {m.pct}% {m.name}: {inr(m.amount)} invoiced</span>
                            : <button key={m.index} type="button" className="btn btn-xs btn-sec" disabled={!!busy} onClick={() => raiseMilestone(quote, m.index)}>Raise {m.pct}% {m.name}: {inr(m.amount)}</button>)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* ── Usage ── */}
          {data.phase === "ready" && tab === "usage" && (
            <div>
              <div style={{ fontSize: 12.5, color: "var(--text3)", marginBottom: 8 }}>
                Actual consumption for <b>{isPeriod(period) ? periodLabel(period) : "—"}</b>. A month's usage is the total of its approved entries. Nothing is deleted: an entry is voided or corrected, and stays on record.
              </div>
              {usageLines.length === 0 && <div style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: "24px 20px", textAlign: "center", color: "var(--text3)", fontSize: 12.5 }}>No usage-billed component is in force this month.</div>}
              {usageLines.map(({ quote, agreement: a, line }) => {
                const recs = data.usage.filter((r) => r.quoteId === quote.id && r.lineCode === line.code && r.period === period);
                const rec = reconcileUsage(recs, [{ quoteId: quote.id, lineCode: line.code, period }]);
                const total = rec.totals[`${quote.id}|${line.code}|${period}`];
                const drafts = recs.filter((r) => r.status === "draft");
                const formId = `${quote.id}-${line.code}`;
                return (
                  <div key={formId} style={{ border: "1px solid var(--border)", borderRadius: 10, marginBottom: 10, padding: "8px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      <div><b>{accName(a.accountId, a.customer)}</b> · {line.name} <span style={{ fontFamily: "monospace", color: "var(--text3)", fontSize: 12 }}>({line.code} · {a.agreementNo})</span></div>
                      <div style={{ fontSize: 12.5 }}>Approved: <b>{total == null ? "none yet" : `${Number(total).toLocaleString("en-IN")} ${line.unit}`}</b> <span style={{ color: "var(--text3)" }}>· expected about {Number(line.qty).toLocaleString("en-IN")}</span></div>
                    </div>
                    <Issues issues={rec.issues} />
                    {recs.length > 0 && (
                      <table style={{ width: "100%", borderCollapse: "collapse", margin: "4px 0" }}>
                        <tbody>
                          {recs.map((r) => (
                            <tr key={r.id} style={{ opacity: r.status === "void" ? 0.5 : 1 }}>
                              <td style={{ ...td, width: 110, textAlign: "right", textDecoration: r.status === "void" ? "line-through" : "none" }}><b>{Number(r.quantity).toLocaleString("en-IN")}</b> {line.unit}</td>
                              <td style={td}>{r.externalRef ? `ref ${r.externalRef}` : <span style={{ color: "var(--text3)" }}>no reference</span>}{r.correctsId ? " · correction" : ""}{r.note ? ` · ${r.note}` : ""}</td>
                              <td style={{ ...td, color: "var(--text3)" }}>{r.source} · {userName(r.enteredBy)}</td>
                              <td style={{ ...td, fontWeight: 700, color: r.status === "approved" ? "#047857" : r.status === "void" ? "#64748B" : "#B45309" }}>{r.status}</td>
                              <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                                {r.status === "draft" && <button className="btn btn-xs btn-primary" disabled={!!busy} onClick={() => approve([r])}>Approve</button>}{" "}
                                {r.status !== "void" && <button className="btn btn-xs btn-sec" disabled={!!busy} onClick={() => correct(r)}>Correct</button>}{" "}
                                {r.status !== "void" && <button className="btn btn-xs btn-sec" disabled={!!busy} onClick={() => voidRec(r)}>Void</button>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <form style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }} onSubmit={async (e) => { e.preventDefault(); const f = e.currentTarget; const q = f.qty.value; if (q === "" || !(Number(q) >= 0)) return; if (await addUsage(quote, line, q, f.ref.value, f.note.value)) f.reset(); }}>
                      <input name="qty" type="number" min={0} step="any" placeholder={`Quantity (${line.unit})`} style={{ ...inp, width: 150 }} />
                      <input name="ref" placeholder="Reference (batch / report no.)" style={{ ...inp, width: 210 }} />
                      <input name="note" placeholder="Note" style={{ ...inp, width: 200 }} />
                      <button className="btn btn-xs btn-sec" type="submit" disabled={!!busy}><Plus size={11} /> Add entry</button>
                      {drafts.length > 1 && <button className="btn btn-xs btn-primary" type="button" disabled={!!busy} onClick={() => approve(drafts)}>Approve all {drafts.length}</button>}
                    </form>
                  </div>
                );
              })}
              <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", marginTop: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}><Upload size={13} style={{ verticalAlign: -2 }} /> Paste usage from a spreadsheet</div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 6 }}>One row per entry: <code>agreement no., component code, month (2026-12), quantity, reference</code>. A reference that is already recorded is rejected as a duplicate.</div>
                <textarea rows={4} value={paste} onChange={(e) => { setPaste(e.target.value); setChecked(null); }} placeholder={"DEL/SQ/0050/2627, AMS02, 2026-12, 300, ICEGATE-DEC\nDEL/SQ/0050/2627, OB11, 2026-12, 4200, OCR-REPORT-12"} style={{ ...inp, width: "100%", fontFamily: "Consolas, monospace", boxSizing: "border-box" }} />
                <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="btn btn-sm btn-sec" disabled={!paste.trim()} onClick={checkPaste}>Check</button>
                  {checked && <button className="btn btn-sm btn-primary" disabled={!checked.records.length || !!busy} onClick={importPaste}>Import {checked.records.length} {checked.records.length === 1 ? "entry" : "entries"}</button>}
                  {checked && <span style={{ fontSize: 12.5 }}>{checked.records.length} ready · {checked.rejects.length + checked.errors.length} rejected</span>}
                </div>
                {checked && [...checked.errors, ...checked.rejects.map((r) => `Line ${r.lineNo ?? "?"}: ${r.reason}`)].map((t, i) => <div key={i} style={{ fontSize: 12, color: "#B91C1C", marginTop: 3 }}>{t}</div>)}
              </div>
            </div>
          )}

          {/* ── Invoices ── */}
          {data.phase === "ready" && tab === "invoices" && (
            data.invoices.length === 0 ? <div style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: "28px 20px", textAlign: "center", color: "var(--text3)", fontSize: 12.5 }}>No invoices yet. Finalise one from the Invoice run.</div> : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Invoice", "Customer", "Month", "Type", "Taxable", "GST", "Total", "Net of credits", "Finalised", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.invoices.map((i) => (
                    <FragmentRow key={i.id} open={openInv === i.id}>
                      <tr style={{ cursor: "pointer" }} onClick={() => setOpenInv(openInv === i.id ? null : i.id)}>
                        <td style={{ ...td, fontFamily: "monospace", fontWeight: 700 }}>{i.invoiceNo}</td>
                        <td style={td}>{accName(i.accountId, i.customer)}</td>
                        <td style={td}>{periodLabel(i.period)}</td>
                        <td style={{ ...td, color: i.type === "credit" ? "#B91C1C" : undefined }}>{i.type === "credit" ? "Credit note" : i.cycle.startsWith("milestone") ? "Milestone" : i.cycle === "usage" ? "Usage" : i.cycle === "subscription" ? "Subscription" : "Period"}</td>
                        <td style={{ ...td, textAlign: "right" }}>{inr(i.taxable)}</td>
                        <td style={{ ...td, textAlign: "right" }}>{inr(i.gst)}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{inr(i.total)}</td>
                        <td style={{ ...td, textAlign: "right" }}>{i.type === "credit" ? "" : inr(netOfCredits(i, data.invoices))}</td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>{userName(i.finalisedBy)} {i.finalisedAt ? new Date(i.finalisedAt).toLocaleDateString("en-IN") : ""}</td>
                        <td style={td}>{i.type !== "credit" && <button className="btn btn-xs btn-sec" disabled={!!busy} onClick={(e) => { e.stopPropagation(); raiseCredit(i); }}><RotateCcw size={11} /> Credit note</button>}</td>
                      </tr>
                      {openInv === i.id && <tr><td colSpan={10} style={{ ...td, background: "var(--s2)" }}>{i.reason ? <div style={{ fontSize: 12.5, marginBottom: 6 }}><b>Reason:</b> {i.reason}</div> : null}<InvoiceView inv={i} /></td></tr>}
                    </FragmentRow>
                  ))}
                </tbody>
              </table>
            )
          )}
          {tab === "invoices" && finals.length > 0 && <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 8 }}>A final invoice is posted to Collections as a proforma. It is never edited: a correction is a credit note with a reason.</div>}
        </div>
      </div>
    </div>
  );
}

// Two table rows under one key.
function FragmentRow({ children }) { return <>{children}</>; }
