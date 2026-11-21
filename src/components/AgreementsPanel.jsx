// Customer commercial agreements: the frozen terms of every accepted quote
// (lib/quotation/agreements.js). Opened from Contracts → Agreements.
import { useState, useMemo } from "react";
import { X, FileText } from "lucide-react";
import { listAgreements, fixedMonthly, agreedUnitPrice } from "../lib/quotation/agreements";
import { billingClassLabel } from "../lib/quotation/commercial";
import { slabTable } from "../lib/quotation/slabs";
import { fmt } from "../utils/helpers";
import { PlanSection } from "./PlanBuilder";
import { canSeePlan, openVersion } from "../lib/billing/plans";

const inr = (v) => "₹" + Math.round(Number(v) || 0).toLocaleString("en-IN");
const inr2 = (v) => { const x = Math.round((Number(v) || 0) * 100) / 100; return "₹" + x.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(x) ? 0 : 2, maximumFractionDigits: 2 }); };
const STATUS_COLOR = { Active: ["#047857", "#ECFDF5"], Superseded: ["#92400E", "#FFFBEB"], Ended: ["#475569", "#F1F5F9"], Cancelled: ["#B91C1C", "#FEF2F2"] };
const th = { textAlign: "left", fontSize: 10.5, textTransform: "uppercase", color: "var(--text3)", padding: "7px 10px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td = { padding: "7px 10px", borderBottom: "1px solid var(--border)", fontSize: 12.5, verticalAlign: "top" };

export default function AgreementsPanel({ quotes = [], accounts = [], today = "", onClose, onOpenQuote,
  plans = [], setPlans, bm = null, planCtx = {}, currentUser = "", orgUsers = [], config = {}, billingDesk = false, downline = [], originalQuotes = null }) {
  // Sales see only their own customers' agreements; managers their team's; the billing desk all (decision 20 Nov 2026).
  const all = useMemo(() => listAgreements(quotes, today).filter((x) => billingDesk
    || canSeePlan({ createdBy: x.quote.owner }, { userId: currentUser, quote: x.quote, account: accounts.find((c) => c.id === x.quote.accountId), downline })),
  [quotes, today, accounts, currentUser, billingDesk, downline]);
  const [show, setShow] = useState("Active");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  const accName = (a) => accounts.find((x) => x.id === a.accountId)?.name || a.customer || "—";
  const rows = all.filter((x) => (show === "All" || x.status === show) && (!search.trim() || `${accName(x.agreement)} ${x.agreement.agreementNo}`.toLowerCase().includes(search.trim().toLowerCase())));
  const open = all.find((x) => x.quote.id === openId) || null;
  const chip = (s) => { const [c, bg] = STATUS_COLOR[s] || STATUS_COLOR.Ended; return <span style={{ fontSize: 10.5, fontWeight: 700, color: c, background: bg, padding: "2px 8px", borderRadius: 10 }}>{s}</span>; };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ width: 1080, maxWidth: "97vw", maxHeight: "92vh", overflow: "auto", background: "var(--surface)", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{open ? `Agreement ${open.agreement.agreementNo}` : "Customer agreements"}</div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>{open ? `${accName(open.agreement)} · the terms the customer accepted, frozen` : "The agreed rates of every accepted quotation. Changes to the price list do not alter them."}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {open && <button className="btn btn-sm btn-sec" onClick={() => setOpenId(null)}>← All agreements</button>}
            <button className="icon-btn" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {!open && (
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
              {["Active", "Superseded", "Ended", "All"].map((s) => (
                <button key={s} type="button" className={`btn btn-sm ${show === s ? "btn-primary" : "btn-sec"}`} onClick={() => setShow(s)}>{s} ({s === "All" ? all.length : all.filter((x) => x.status === s).length})</button>
              ))}
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer or agreement no." style={{ marginLeft: "auto", width: 260, padding: "6px 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 12.5 }} />
            </div>
            {rows.length === 0 ? (
              <div style={{ border: "1px dashed var(--border)", borderRadius: 10, padding: "28px 20px", textAlign: "center", color: "var(--text3)", fontSize: 12.5 }}>
                {all.length === 0 ? "No agreements yet. One is created when a customer accepts a quotation made in the pricing builder." : "Nothing matches."}
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Customer", "Agreement", "Status", "From", "To", "Model", "Fixed per month", "Components", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map(({ quote, agreement: a, status }) => (
                    <tr key={quote.id} style={{ cursor: "pointer" }} onClick={() => setOpenId(quote.id)}>
                      <td style={{ ...td, fontWeight: 600 }}>{accName(a)}</td>
                      <td style={{ ...td, fontFamily: "monospace" }}>{a.agreementNo}</td>
                      <td style={td}>{chip(status)}{openVersion(plans, a.agreementNo)?.status === "pending_approval" && <div style={{ fontSize: 10.5, color: "#1D4ED8", fontWeight: 700, marginTop: 2 }}>amendment waiting for approval</div>}</td>
                      <td style={td}>{fmt.date(a.startDate)}</td>
                      <td style={td}>{a.endDate ? fmt.date(a.endDate) : "—"}</td>
                      <td style={td}>{a.commercialModel?.label || "—"}</td>
                      <td style={{ ...td, textAlign: "right" }}>{inr(fixedMonthly(a))}</td>
                      <td style={{ ...td, textAlign: "right" }}>{a.lines.length}</td>
                      <td style={td}><button className="btn btn-xs btn-sec" onClick={(e) => { e.stopPropagation(); setOpenId(quote.id); }}>Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {open && (() => {
          const a = open.agreement;
          return (
            <div style={{ padding: 16 }}>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12.5, marginBottom: 12, alignItems: "center" }}>
                {chip(open.status)}
                <span><b>From</b> {fmt.date(a.startDate)}{a.endDate ? <> <b>to</b> {fmt.date(a.endDate)}</> : null}</span>
                <span><b>Model</b> {a.commercialModel?.label || "—"}</span>
                <span><b>Fixed per month</b> {inr(fixedMonthly(a))}</span>
                {a.billingFrequency && <span><b>Billing</b> {a.billingFrequency}</span>}
                {a.paymentTerms && <span><b>Payment</b> {a.paymentTerms}</span>}
                {a.amends && <span style={{ color: "#92400E" }}>Amends an earlier version of this quotation</span>}
                {onOpenQuote && <button className="btn btn-xs btn-sec" onClick={() => onOpenQuote(open.quote)}><FileText size={11} /> Open the quotation</button>}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["#", "Component", "Billed as", "Unit", "Qty", "List rate", "Discount", "Agreed rate", "Minimum / month", "In force"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {a.lines.map((l, idx) => {
                    const slabs = l.pricing?.rateSource === "Slab" ? slabTable(l.pricing.slabs, l.unit) : null;
                    return (
                      <tr key={`${l.code}-${l.planVersion || 1}-${idx}`}>
                        <td style={td}>{l.lineNo}</td>
                        <td style={td}><b>{l.name}</b><div style={{ fontSize: 11, color: "var(--text3)", fontFamily: "monospace" }}>{l.code}</div></td>
                        <td style={{ ...td, color: l.billingClass === "transaction" ? "#4338CA" : undefined, fontWeight: l.billingClass === "transaction" ? 700 : 400 }}>{billingClassLabel(l.billingClass)}</td>
                        <td style={td}>{l.unit}</td>
                        <td style={{ ...td, textAlign: "right" }}>{l.billingClass === "transaction" ? <span title="Expected volume: internal reference, not a commitment" style={{ color: "var(--text3)" }}>~{l.qty}</span> : l.qty}</td>
                        <td style={{ ...td, textAlign: "right" }}>{slabs ? "slabs" : inr2(l.listRate)}</td>
                        <td style={{ ...td, textAlign: "right" }}>{l.discountPct ? `${+Number(l.discountPct).toFixed(2)}%` : "—"}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>
                          {slabs
                            ? <div style={{ fontWeight: 400, fontSize: 11.5 }}>{slabs.map((s, i) => <div key={i}>{s.label}: <b>{inr2((s.rate || 0) * (1 - (l.discountPct || 0) / 100))}</b></div>)}<div style={{ color: "var(--text3)" }}>{l.pricing.slabMode === "graduated" ? "graduated" : "whole volume"}, per {l.pricing.slabPeriod === "year" ? "year" : "month"}</div></div>
                            : inr2(agreedUnitPrice(l, l.qty))}
                          {Number(l.pricing?.packQty) > 0 && <div style={{ fontWeight: 400, fontSize: 11.5 }}>pack {l.pricing.packQty} for {inr(l.pricing.packPrice)}</div>}
                          {l.escalationPct > 0 && <div style={{ fontWeight: 400, fontSize: 11.5, color: "var(--text3)" }}>+{l.escalationPct}% a year</div>}
                        </td>
                        <td style={{ ...td, textAlign: "right" }}>{Math.max(Number(l.monthlyMinimum) || 0, Number(l.pricing?.packPrice) || 0) ? inr(Math.max(Number(l.monthlyMinimum) || 0, Number(l.pricing?.packPrice) || 0)) : "—"}</td>
                        <td style={{ ...td, whiteSpace: "nowrap" }}>{l.billingClass === "one_time" ? "one time" : <>{fmt.date(l.effectiveFrom)}{l.effectiveTo ? <> – {fmt.date(l.effectiveTo)}</> : null}</>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {a.milestones?.length > 0 && <div style={{ fontSize: 12.5, marginTop: 10 }}><b>One-time payment milestones:</b> {a.milestones.map((m) => `${m.pct}% ${String(m.name || "").replace(/^./, (c) => c.toLowerCase())}`).join("; ")}.</div>}
              {bm && setPlans && open.status === "Active" && (
                <PlanSection quote={(originalQuotes || quotes).find((q) => q.id === open.quote.id) || open.quote} plans={plans} setPlans={setPlans} bm={bm} ctx={planCtx}
                  account={accounts.find((x) => x.id === open.quote.accountId)} currentUser={currentUser} orgUsers={orgUsers} config={config} canSee />
              )}
              <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 10 }}>
                To change these terms, amend the billing plan (a new version with an effective date, approved before it applies), or revise the quotation for the customer to accept.
                Earlier versions stay as history. A new quote for this customer starts from the agreed rates.
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
