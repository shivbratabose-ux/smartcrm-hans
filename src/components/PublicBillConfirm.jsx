// ─── Public bill confirmation page ─────────────────────────────────────
// #/bill-confirm/<token> — what the CUSTOMER sees from the bill e-mail or a
// link Accounts shares. No CRM login: everything comes from the token-checked
// `quote-accept` edge function (actions bill-view / bill-confirm). Confirming
// is "deemed signed" (flow of 14 Nov 2026) and starts implementation.
import { useState, useEffect } from "react";
import { Check, FileText, AlertTriangle } from "lucide-react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { fmt } from "../utils/helpers";

async function callBill(payload) {
  if (!isSupabaseConfigured) return { error: "This link is not available right now." };
  const { data, error } = await supabase.functions.invoke("quote-accept", { body: payload });
  if (error) {
    let detail = null;
    try { detail = await error.context?.json?.(); } catch { /* opaque */ }
    return detail || { error: error.message || "Request failed" };
  }
  return data;
}

const field = { width: "100%", padding: "9px 12px", border: "1.5px solid #C8D4DF", borderRadius: 8, fontSize: 13, boxSizing: "border-box" };

export default function PublicBillConfirm({ token, api: apiProp = callBill }) {
  // Development only: preview the page against sample data (window.__billApiMock).
  const api = (import.meta.env.DEV && typeof window !== "undefined" && window.__billApiMock) || apiProp;
  const [state, setState] = useState({ phase: "loading" });
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    api({ token, action: "bill-view" }).then((res) => {
      if (!alive) return;
      if (res?.ok && res.bill) setState({ phase: "ready", bill: res.bill });
      else setState({ phase: "missing" });
    }).catch(() => alive && setState({ phase: "missing" }));
    return () => { alive = false; };
  }, [token]);

  const confirm = async () => {
    setBusy(true); setErr("");
    const res = await api({ token, action: "bill-confirm", name, designation }).catch(() => null);
    setBusy(false);
    if (res?.ok && res.bill) setState({ phase: "ready", bill: res.bill });
    else setErr(res?.error || "Could not record your confirmation. Please try again.");
  };

  const shell = (children) => (
    <div style={{ minHeight: "100vh", background: "#F4F7FA", padding: "32px 16px", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#1B6B5A" }}>Hans Infomatic</div>
          <div style={{ fontSize: 11.5, color: "#8BA3B4" }}>Bill &amp; agreement confirmation</div>
        </div>
        {children}
        <div style={{ textAlign: "center", marginTop: 18, fontSize: 11, color: "#8BA3B4" }}>Questions? Reply to the e-mail this link came with, or contact your account manager.</div>
      </div>
    </div>
  );

  if (state.phase === "loading") return shell(<div style={{ textAlign: "center", padding: 48, color: "#4A6070" }}>Loading…</div>);
  if (state.phase === "missing") return shell(
    <div style={{ background: "#fff", border: "1px solid #E2E9EF", borderRadius: 12, padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Link not found</div>
      <div style={{ fontSize: 13, color: "#4A6070" }}>This link is invalid or no longer active. Please ask your account manager to send it again.</div>
    </div>);

  const b = state.bill;
  const money = (lakh) => `${b.currency && b.currency !== "INR" ? b.currency + " " : "₹"}${Math.round((Number(lakh) || 0) * 1e5).toLocaleString("en-IN")}`;
  const row = (k, v) => v ? <tr><td style={{ padding: "5px 8px", color: "#8BA3B4", fontSize: 12, whiteSpace: "nowrap", verticalAlign: "top" }}>{k}</td><td style={{ padding: "5px 8px", fontSize: 13 }}>{v}</td></tr> : null;
  const canConfirm = !busy && name.trim() && agree;

  return shell(
    <div style={{ background: "#fff", border: "1px solid #E2E9EF", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ background: "#1B6B5A", color: "#fff", padding: "16px 20px" }}>
        <div style={{ fontSize: 11, opacity: 0.75, letterSpacing: 1 }}>BILL</div>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{b.billNo || "—"}</div>
        <div style={{ fontSize: 13, marginTop: 4, opacity: 0.92 }}>Quotation {b.quoteNo}{b.accountName ? ` · ${b.accountName}` : ""}</div>
      </div>
      <div style={{ padding: 20 }}>
        {b.confirmed && (
          <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 10, background: "#F0FDF4", color: "#15803D", marginBottom: 16 }}>
            <Check size={20} />
            <div><div style={{ fontWeight: 700 }}>Confirmed — thank you!</div>
              <div style={{ fontSize: 12.5 }}>{b.confirmedName ? `By ${b.confirmedName}` : ""}{b.confirmedAt ? ` on ${fmt.date(String(b.confirmedAt).slice(0, 10))}` : ""}. Our implementation team has been notified and will contact you.</div></div>
          </div>
        )}
        <table style={{ borderCollapse: "collapse", marginBottom: 14, width: "100%" }}><tbody>
          {row("Bill to", <b>{b.customer?.legalName}</b>)}
          {row("PAN / GSTIN", `${b.customer?.pan || "—"} · ${b.customer?.gstin || "—"}`)}
          {row("Address", b.customer?.address)}
          {row("Hosting", b.hosting)}
          {row("Amount", <span>Taxable {money(b.taxable)} + GST {money(b.gst)} = <b>{money(b.total)}</b></span>)}
          {row("Due by", b.dueDate ? fmt.date(b.dueDate) : "")}
          {row("Items", b.lines?.length ? <div>{b.lines.map((l, i) => <div key={i}>• {l}</div>)}</div> : "")}
        </tbody></table>

        {(b.documents || []).map((d, i) => (
          <details key={i} open={i === 0 && !b.confirmed} style={{ border: "1px solid #E2E9EF", borderRadius: 8, marginBottom: 10 }}>
            <summary style={{ cursor: "pointer", padding: "10px 12px", fontWeight: 700, fontSize: 13 }}><FileText size={13} style={{ verticalAlign: -2, marginRight: 6 }} />{d.title}</summary>
            <div style={{ padding: "4px 14px 12px", fontSize: 12.5, color: "#334155", maxHeight: 420, overflowY: "auto" }} dangerouslySetInnerHTML={{ __html: d.html }} />
          </details>
        ))}

        {!b.confirmed && (
          <div style={{ borderTop: "1px solid #E2E9EF", paddingTop: 16, marginTop: 6 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name *" style={field} />
              <input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Designation" style={field} />
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#334155", marginBottom: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 2 }} />
              <span>I confirm the bill{(b.documents || []).length ? ` and accept the ${(b.documents || []).map((d) => d.title).join(" and ")}` : ""} on behalf of {b.customer?.legalName || "my company"}. I understand this confirmation is treated as signing.</span>
            </label>
            {err && <div style={{ display: "flex", gap: 6, color: "#B91C1C", fontSize: 12.5, marginBottom: 10 }}><AlertTriangle size={14} />{err}</div>}
            <button disabled={!canConfirm} onClick={confirm}
              style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "none", cursor: canConfirm ? "pointer" : "not-allowed", background: canConfirm ? "#1B6B5A" : "#9CC3B8", color: "#fff", fontWeight: 700, fontSize: 14 }}>
              <Check size={15} style={{ verticalAlign: -3, marginRight: 6 }} />{busy ? "Recording…" : "Confirm"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
