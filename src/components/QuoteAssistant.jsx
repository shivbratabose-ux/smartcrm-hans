// Quote Assistant — build a quote by chatting.
// The rep describes the requirement ("Blueport, 25 users iCAFFE customs +
// OCR, Hans-hosted, 12 months, 5% off"); Claude (ai-claude → quoteAssistant)
// maps it to catalogue codes and an open opportunity and asks for anything
// missing. "Open in pricing builder" hands the draft to HansQuoteBuilder,
// where the pricing engine prices it and the usual approval rules apply.
import { useState, useRef, useEffect, useMemo } from "react";
import { Send, Sparkles, X, FileText, AlertTriangle, RotateCcw } from "lucide-react";
import { aiQuoteAssistant } from "../utils/ai";
import { BILLING_FREQUENCIES, QUOTE_SEGMENTS } from "../data/quotationMasters";
import { EMPTY_DRAFT, CLOSED, cleanDraft } from "../lib/quotation/assistantDraft";
import { HOSTING_LABEL } from "../lib/quotation/handover";

export default function QuoteAssistant({ opps = [], accounts = [], catalogue = [], quoteConfig = {}, onOpenBuilder, onClose }) {
  const [msgs, setMsgs] = useState([{ role: "assistant", text: "Tell me what the customer needs — customer or deal name, products or modules, number of users, hosting (Hans or client), term and any discount. I'll put the quote together and you check the prices in the builder." }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState([]);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  const openOpps = useMemo(() => opps.filter((o) => !o.isDeleted && !CLOSED.test(String(o.stage || ""))), [opps]);
  const currencies = (quoteConfig.currencies || []).map((c) => c.code).filter(Boolean);
  const context = useMemo(() => ({
    catalogue: catalogue.map((p) => ({ code: p.code, name: p.name, module: p.module, unit: p.unit, pricingModel: p.pricingModel, description: p.description })),
    opportunities: openOpps.slice(0, 300).map((o) => ({ id: o.id, title: o.title, account: accounts.find((a) => a.id === o.accountId)?.name || "", stage: o.stage || "" })),
    segments: QUOTE_SEGMENTS, currencies: currencies.length ? currencies : ["INR"], billingFrequencies: BILLING_FREQUENCIES,
    approvalLimitPct: quoteConfig.maxUserDiscountPct ?? null,
  }), [catalogue, openOpps, accounts, quoteConfig]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...msgs, { role: "user", text }];
    setMsgs(next); setInput(""); setBusy(true); setErr("");
    // Development only: window.__quoteAssistantMock lets the screen be tried without the AI service.
    const call = (import.meta.env.DEV && typeof window !== "undefined" && window.__quoteAssistantMock) || aiQuoteAssistant;
    const res = await call({ messages: next.slice(1), context, draft });
    setBusy(false);
    if (!res?.ok) { setErr(res?.error || "The assistant didn't answer. Please try again."); return; }
    const r = res.result || {};
    const c = cleanDraft(r.draft, { catalogue, opps: openOpps, currencies: context.currencies });
    const notes = [
      c.dropped.length ? `(Left out ${c.dropped.join(", ")} — not in the price list.)` : "",
      c.badOpp ? "(That opportunity isn't one you can see — pick it in the builder.)" : "",
    ].filter(Boolean).join(" ");
    setDraft(c.draft);
    setMissing(Array.isArray(r.missing) ? r.missing : []);
    setReady(!!r.ready && !!c.draft.oppId && !!c.draft.hosting && c.draft.lines.length > 0);
    setMsgs((m) => [...m, { role: "assistant", text: `${r.reply || "Updated the draft."}${notes ? `\n\n${notes}` : ""}` }]);
  };

  const reset = () => { setMsgs((m) => m.slice(0, 1)); setDraft(EMPTY_DRAFT); setReady(false); setMissing([]); setErr(""); };
  const opp = openOpps.find((o) => o.id === draft.oppId);
  const nameOf = (code) => catalogue.find((p) => p.code === code)?.name || code;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 10010, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(980px,100%)", height: "100%", background: "#fff", display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", boxShadow: "-8px 0 30px rgba(0,0,0,.15)" }}>
        {/* Chat */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, borderRight: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
            <Sparkles size={16} color="#7C3AED" />
            <div style={{ fontWeight: 800, fontSize: 14 }}>Quote Assistant</div>
            <div style={{ fontSize: 11, color: "var(--text3)" }}>describe the requirement — prices come from the pricing engine</div>
            <button className="icon-btn" title="Start over" onClick={reset} style={{ marginLeft: "auto" }}><RotateCcw size={14} /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10, background: "var(--s1, #F8FAFC)" }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "86%", whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.45,
                background: m.role === "user" ? "#1B6B5A" : "#fff", color: m.role === "user" ? "#fff" : "var(--text)", border: m.role === "user" ? "none" : "1px solid var(--border)", borderRadius: 12, padding: "9px 12px" }}>
                {m.text}
              </div>
            ))}
            {busy && <div style={{ alignSelf: "flex-start", fontSize: 12.5, color: "var(--text3)", padding: "6px 4px" }}>Thinking…</div>}
            {err && <div style={{ display: "flex", gap: 6, color: "#B91C1C", fontSize: 12.5 }}><AlertTriangle size={14} />{err}</div>}
            <div ref={endRef} />
          </div>
          <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--border)" }}>
            <textarea rows={2} value={input} onChange={(e) => setInput(e.target.value)} disabled={busy}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="e.g. Blueport Customs — iCAFFE customs for 25 users + OCR, Hans hosted, 12 months, 5% discount"
              style={{ flex: 1, resize: "none", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 10, fontSize: 13, fontFamily: "inherit" }} />
            <button className="btn btn-primary" disabled={busy || !input.trim()} onClick={send} title="Send (Enter)"><Send size={14} /></button>
          </div>
        </div>

        {/* Draft */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Draft</div>
            <button className="icon-btn" onClick={onClose} style={{ marginLeft: "auto" }} title="Close"><X size={16} /></button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 14, fontSize: 12.5 }}>
            {[
              ["Opportunity", opp ? `${opp.title}${accounts.find((a) => a.id === opp.accountId) ? ` · ${accounts.find((a) => a.id === opp.accountId).name}` : ""}` : "—"],
              ["Hosting", HOSTING_LABEL[draft.hosting] || "—"],
              ["Segment / currency", `${draft.segment} · ${draft.currency}`],
              ["Billing", draft.billingFrequency],
              ["Overall discount", draft.overallDiscountPct ? `${draft.overallDiscountPct}%` : "—"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ width: 120, color: "var(--text3)", flexShrink: 0 }}>{k}</div><div style={{ fontWeight: 600 }}>{v}</div>
              </div>
            ))}
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", margin: "12px 0 6px", letterSpacing: ".4px" }}>LINES</div>
            {draft.lines.length === 0 && <div style={{ color: "var(--text3)" }}>None yet.</div>}
            {draft.lines.map((l, i) => (
              <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "7px 9px", marginBottom: 6 }}>
                <div style={{ fontWeight: 700 }}>{nameOf(l.productCode)} <span style={{ color: "var(--text3)", fontWeight: 400 }}>{l.productCode}</span></div>
                <div style={{ color: "var(--text2)" }}>Qty {l.qty} · {l.months} months{l.discountPct ? ` · ${l.discountPct}% off` : ""}</div>
                {l.why && <div style={{ color: "var(--text3)", fontSize: 11.5, marginTop: 2 }}>{l.why}</div>}
              </div>
            ))}
            {missing.length > 0 && !ready && (
              <div style={{ marginTop: 10, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 10px", color: "#92400E" }}>
                Still needed: {missing.join(" · ")}
              </div>
            )}
          </div>
          <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
            <button className="btn btn-primary" style={{ width: "100%" }} disabled={draft.lines.length === 0} onClick={() => onOpenBuilder(draft)}>
              <FileText size={14} />Open in pricing builder
            </button>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6, textAlign: "center" }}>
              {ready ? "Ready — check the prices in the builder and save." : "You can open it now and finish the rest in the builder."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
