// Quote → Accounts → Implementation, shown inside a quote.
// Hosting + KYC, then the checklist the 14 Nov flow prescribes:
//   customer accepted → FINAL → bill raised → customer confirmed → project.
// All rules live in lib/quotation/handover.js; this file only draws them.
import { useState, useEffect } from "react";
import { Check, Circle, Lock, Receipt, Rocket, ShieldCheck, AlertTriangle, Mail, Link2, FileText } from "lucide-react";
import {
  HOSTING_OPTIONS, HOSTING_LABEL, GST_UNREGISTERED, kycOf, kycProblems, normaliseKyc, finalBlockers, handoverOf, handoverStage, quoteAmounts,
} from "../lib/quotation/handover";
import { fmt } from "../utils/helpers";

const box = { marginTop: 10, background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", fontSize: 12.5 };
const head = { fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", color: "var(--text2)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 };
const inputCss = { width: "100%", padding: "7px 10px", border: "1.5px solid var(--border)", borderRadius: 7, fontSize: 12.5, boxSizing: "border-box" };

function Step({ done, locked, title, sub, children }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)", alignItems: "flex-start", opacity: locked ? 0.55 : 1 }}>
      <div style={{ marginTop: 1, color: done ? "#16A34A" : locked ? "#94A3B8" : "#D97706" }}>
        {done ? <Check size={16} /> : locked ? <Lock size={14} /> : <Circle size={14} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700 }}>{title}</div>
        {sub && <div style={{ color: "var(--text3)", fontSize: 11.5, marginTop: 1 }}>{sub}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>{children}</div>
    </div>
  );
}

export default function QuoteHandoverPanel({
  quote, canEdit, canBill, sendBlocked = "", bill = null, project = null, hasAccount = true, docsReady = false, userName = (id) => id, actions,
}) {
  const stage = handoverStage(quote);
  const h = handoverOf(quote);
  const saved = kycOf(quote);
  const [k, setK] = useState(saved);
  const [hosting, setHosting] = useState(quote.hosting || "");
  const [unreg, setUnreg] = useState(saved.gstin === GST_UNREGISTERED);
  // Re-seed when another quote is opened or the customer's KYC arrives.
  useEffect(() => {
    const s = kycOf(quote);
    setK(s); setHosting(quote.hosting || ""); setUnreg(s.gstin === GST_UNREGISTERED);
  }, [quote.id, quote.legalName, quote.pan, quote.gstin, quote.billingAddressSnapshot, quote.hosting]);

  const draft = { ...k, gstin: unreg ? GST_UNREGISTERED : k.gstin };
  const draftProblems = kycProblems(draft);
  const nd = normaliseKyc(draft);
  const dirty = hosting !== (quote.hosting || "") || ["legalName", "pan", "gstin", "address"].some((f) => nd[f] !== saved[f]);
  const locked = stage.final || !canEdit;
  const blockers = finalBlockers(quote, sendBlocked);
  const amounts = quoteAmounts(quote);
  const when = (iso) => (iso ? fmt.date(String(iso).slice(0, 10)) : "");

  return (
    <div style={box} data-testid="quote-handover">
      <div style={head}><ShieldCheck size={13} />HOSTING &amp; CUSTOMER KYC
        {stage.final && <span style={{ background: "#22C55E", color: "#fff", fontSize: 10, padding: "1px 8px", borderRadius: 4 }}>FINAL · locked</span>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Hosting *</label>
          <select value={hosting} disabled={locked} onChange={(e) => setHosting(e.target.value)} style={inputCss}>
            <option value="">— Select —</option>
            {HOSTING_OPTIONS.map((o) => <option key={o} value={o}>{HOSTING_LABEL[o]}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>Legal name (as on PAN / GST) *</label>
          <input value={k.legalName} disabled={locked} onChange={(e) => setK((x) => ({ ...x, legalName: e.target.value }))} style={inputCss} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>PAN *</label>
          <input value={k.pan} disabled={locked} maxLength={10} placeholder="ABCDE1234F" onChange={(e) => setK((x) => ({ ...x, pan: e.target.value.toUpperCase() }))} style={inputCss} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>GSTIN *</label>
          <input value={unreg ? "" : k.gstin} disabled={locked || unreg} maxLength={15} placeholder={unreg ? "Not registered under GST" : "27ABCDE1234F1Z5"} onChange={(e) => setK((x) => ({ ...x, gstin: e.target.value.toUpperCase() }))} style={inputCss} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, marginTop: 4, textTransform: "none", fontWeight: 500, cursor: locked ? "default" : "pointer" }}>
            <input type="checkbox" checked={unreg} disabled={locked} onChange={(e) => setUnreg(e.target.checked)} /> Customer is not registered under GST
          </label>
        </div>
        <div className="form-group" style={{ margin: 0, gridColumn: "1 / -1" }}>
          <label>Registered / billing address *</label>
          <textarea rows={2} value={k.address} disabled={locked} onChange={(e) => setK((x) => ({ ...x, address: e.target.value }))} style={{ ...inputCss, resize: "vertical" }} />
        </div>
      </div>
      {!locked && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary btn-sm" disabled={!dirty} onClick={() => actions.saveDetails({ hosting, ...draft })}>Save hosting &amp; KYC</button>
          {draftProblems.length === 0 && hosting
            ? <span style={{ color: "#15803D", fontSize: 11.5, fontWeight: 600 }}><Check size={12} style={{ verticalAlign: -2 }} /> Complete</span>
            : <span style={{ color: "#B45309", fontSize: 11.5 }}><AlertTriangle size={12} style={{ verticalAlign: -2 }} /> {[!hosting && "Hosting not set", ...draftProblems].filter(Boolean).join(" · ")}</span>}
        </div>
      )}

      <div style={{ ...head, marginTop: 14 }}><Receipt size={13} />QUOTE → ACCOUNTS → IMPLEMENTATION</div>

      <Step done={stage.accepted} title="1. Customer accepted the quote"
        sub={stage.accepted ? `Accepted ${when(quote.acceptedDate)}` : "Send the quote; the customer accepts from the link or QR and fills the KYC page."} />

      <Step done={stage.final} locked={!stage.accepted} title="2. Marked FINAL by Sales"
        sub={stage.final ? `By ${userName(h.finalBy)} on ${when(h.finalAt)} — Accounts notified${h.accountsMailedAt ? " (in the CRM and by e-mail)" : " in the CRM"}.${docsReady ? "" : " ULA / Agreement templates are not set up yet (Masters → Quotation Pricing → Documents)."}`
          : blockers.length ? `Not yet: ${blockers.join(" · ")}` : "Everything is in place. Marking FINAL locks the quote and tells Accounts."}>
        {stage.final && actions.openPack && (
          <button className="btn btn-sec btn-sm" title="Final quote + ULA + Agreement + KYC page — print or save as PDF" onClick={actions.openPack}><FileText size={13} />Accounts pack</button>
        )}
        {!stage.final && canEdit && (
          <button className="btn btn-primary btn-sm" disabled={blockers.length > 0 || dirty} title={dirty ? "Save hosting & KYC first" : blockers.join("\n")} onClick={actions.markFinal}>Mark as FINAL</button>
        )}
      </Step>

      <Step done={stage.billed} locked={!stage.final} title="3. Bill raised by Accounts"
        sub={stage.billed ? `${bill?.invoiceNo || h.billNo || "Bill"} · by ${userName(h.billBy)} on ${when(h.billAt)}${h.billMailedAt ? ` · sent to ${h.billMailedTo || "the customer"} on ${when(h.billMailedAt)}` : " · not sent to the customer yet"}`
          : !hasAccount ? "Link the customer account to this quote first (Finance creates it)."
          : `From the quote: taxable ₹${amounts.taxable}L + GST ₹${amounts.gst}L = ₹${amounts.total}L. Nothing is retyped.`}>
        {stage.final && !stage.billed && canBill && (
          <button className="btn btn-primary btn-sm" disabled={!hasAccount} onClick={actions.raiseBill}><Receipt size={13} />Raise bill</button>
        )}
        {stage.billed && !stage.confirmed && h.billToken && (canBill || canEdit) && (<>
          <button className={`btn btn-sm ${h.billMailedAt ? "btn-sec" : "btn-primary"}`} onClick={actions.sendBill} title="E-mail the bill, ULA and Agreement with the online confirm link"><Mail size={13} />{h.billMailedAt ? "Send again" : "Send to customer"}</button>
          <button className="btn btn-sec btn-sm" onClick={actions.copyBillLink} title="Copy the customer's confirm link (to share by WhatsApp or your own e-mail)"><Link2 size={13} />Copy link</button>
        </>)}
      </Step>

      <Step done={stage.confirmed} locked={!stage.billed} title="4. Customer confirmed the bill, ULA and agreement"
        sub={stage.confirmed ? (h.confirmedBy === "customer"
              ? `Confirmed online by ${h.confirmedName || "the customer"}${h.confirmedDesignation ? ` (${h.confirmedDesignation})` : ""} on ${when(h.confirmedAt)} — deemed signed`
              : `Recorded by ${userName(h.confirmedBy)} on ${when(h.confirmedAt)} — deemed signed`)
          : "The customer confirms online from the link (that starts implementation). If they confirm by e-mail or on paper instead, record it here."}>
        {stage.billed && !stage.confirmed && (canBill || canEdit) && (
          <button className="btn btn-primary btn-sm" onClick={actions.confirmBill}>Customer confirmed</button>
        )}
      </Step>

      <Step done={stage.project} locked={!stage.confirmed} title="5. Implementation project"
        sub={stage.project ? `${project?.projectNo || h.projectNo || "Project"} · ${project?.status || "created"}${project ? ` · ${project.progress || 0}%` : ""}${h.deliveredAt ? ` — delivery complete (${h.deliveredStatus || "Go-Live"}) on ${when(h.deliveredAt)}` : " — the delivery team has been notified"}`
          : "Created automatically at step 4, with the quote's modules, users and hosting."}>
        {stage.project && <Rocket size={16} color="#16A34A" />}
      </Step>
    </div>
  );
}
