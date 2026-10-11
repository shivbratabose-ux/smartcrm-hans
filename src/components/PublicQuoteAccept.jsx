// ─── Public quote accept page ─────────────────────────────────────────
// Rendered ABOVE the login gate for #/quote-accept/<token> when nobody is
// signed in — this is what a CUSTOMER sees from the email link or the QR
// on the printed PDF. It holds no CRM data and no session: everything
// comes from the `quote-accept` edge function, which validates the token
// server-side and returns a sanitised summary. The quotations table
// itself stays closed to anonymous reads.
//
// The in-app QuoteAcceptLanding (rep hands their device to the customer)
// continues to exist separately; this page is the no-login path.
import { useState, useEffect } from "react";
import { Check, MessageCircle, FileText, Clock, AlertTriangle } from "lucide-react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { fmt } from "../utils/helpers";

// Default transport — swappable in tests/harness via the `api` prop.
async function callQuoteAccept(payload) {
  // The configured-check lives HERE, in the default transport — not in the
  // component effect — so an injected api (tests, future transports) is
  // never short-circuited by the environment.
  if (!isSupabaseConfigured) return { error: "This link is not available right now." };
  const { data, error } = await supabase.functions.invoke("quote-accept", { body: payload });
  if (error) {
    // supabase-js buries non-2xx bodies; surface the function's message.
    let detail = null;
    try { detail = await error.context?.json?.(); } catch { /* opaque */ }
    return detail || { error: error.message || "Request failed" };
  }
  return data;
}

const Band = ({ icon, color, bg, title, sub }) => (
  <div style={{display:"flex", gap:12, alignItems:"flex-start", padding:"14px 16px", borderRadius:10, background:bg, color, marginBottom:16}}>
    {icon}
    <div>
      <div style={{fontWeight:700, fontSize:14}}>{title}</div>
      {sub && <div style={{fontSize:12.5, marginTop:2, opacity:0.85}}>{sub}</div>}
    </div>
  </div>
);

export default function PublicQuoteAccept({ token, api = callQuoteAccept }) {
  const [state, setState] = useState({ phase: "loading" }); // loading | ready | missing | error
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [comment, setComment] = useState("");
  const [showChanges, setShowChanges] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // "accepted" | "changes"

  useEffect(() => {
    let alive = true;
    api({ token, action: "view" }).then(res => {
      if (!alive) return;
      if (res?.ok && res.quote) setState({ phase: "ready", quote: res.quote });
      else setState({ phase: "missing" });
    }).catch(() => alive && setState({ phase: "error", message: "Couldn't load the quote. Please check your connection and reload." }));
    return () => { alive = false; };
  }, [token]);

  const act = async (action) => {
    setBusy(true);
    const res = await api({ token, action, name, designation, comment }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setState({ phase: "ready", quote: res.quote });
      setDone(res.accepted || res.alreadyAccepted ? "accepted" : "changes");
    } else {
      setState(s => ({ ...s, quote: res?.quote || s.quote, phase: "ready" }));
      if (res?.error) setDone(null), alert(res.error);
    }
  };

  const shell = (children) => (
    <div style={{minHeight:"100vh", background:"var(--s1, #F4F7FA)", padding:"32px 16px", fontFamily:"'Inter', system-ui, sans-serif"}}>
      <div style={{maxWidth:640, margin:"0 auto"}}>
        <div style={{textAlign:"center", marginBottom:18}}>
          <div style={{fontSize:20, fontWeight:800, color:"#1B6B5A"}}>Hans Infomatic</div>
          <div style={{fontSize:11.5, color:"#8BA3B4"}}>Quotation review</div>
        </div>
        {children}
        <div style={{textAlign:"center", marginTop:18, fontSize:11, color:"#8BA3B4"}}>
          Questions? Reply to the email this link arrived in, or contact your account manager.
        </div>
      </div>
    </div>
  );

  if (state.phase === "loading") {
    return shell(<div style={{textAlign:"center", padding:48, color:"#4A6070", fontSize:14}}>Loading your quote…</div>);
  }
  if (state.phase === "missing" || state.phase === "error") {
    return shell(
      <div style={{background:"#fff", border:"1px solid #E2E9EF", borderRadius:12, padding:32, textAlign:"center"}}>
        <div style={{fontSize:40, marginBottom:8}}>🔎</div>
        <div style={{fontSize:16, fontWeight:700, marginBottom:6}}>Quote not found</div>
        <div style={{fontSize:13, color:"#4A6070"}}>
          {state.message || "This link is invalid or no longer active. Please ask your account manager to resend the quote."}
        </div>
      </div>
    );
  }

  const q = state.quote;
  const money = (v) => v == null ? "—" : `${q.currency === "INR" || !q.currency ? "₹" : q.currency + " "}${Number(v).toLocaleString("en-IN")}`;
  const open = !q.expired && !q.superseded && ["Sent", "Under Review"].includes(q.status) && done !== "accepted";

  return shell(
    <div style={{background:"#fff", border:"1px solid #E2E9EF", borderRadius:12, overflow:"hidden"}}>
      <div style={{background:"#1B6B5A", color:"#fff", padding:"16px 20px"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", flexWrap:"wrap", gap:8}}>
          <div>
            <div style={{fontSize:11, opacity:0.75, letterSpacing:1}}>QUOTATION</div>
            <div style={{fontSize:17, fontWeight:800}}>{q.quoteNo}</div>
          </div>
          <div style={{textAlign:"right", fontSize:12}}>
            {q.sentDate && <div>Sent {fmt.date(q.sentDate)}</div>}
            {q.expiryDate && <div style={{opacity:0.8}}>Valid till {fmt.date(q.expiryDate)}</div>}
          </div>
        </div>
        {(q.title || q.accountName) && (
          <div style={{fontSize:13, marginTop:6, opacity:0.92}}>{q.title}{q.title && q.accountName ? " · " : ""}{q.accountName}</div>
        )}
      </div>

      <div style={{padding:20}}>
        {(done === "accepted" || q.status === "Accepted") && (
          <Band icon={<Check size={20}/>} color="#15803D" bg="#F0FDF4"
            title="Quote accepted — thank you!"
            sub={`${q.acceptedDate ? `Recorded on ${fmt.date(q.acceptedDate)}. ` : ""}Your account manager has been notified and will follow up with the agreement.`}/>
        )}
        {done === "changes" && q.status === "Under Review" && (
          <Band icon={<MessageCircle size={20}/>} color="#B45309" bg="#FFFBEB"
            title="Change request sent"
            sub="Your account manager has been notified and will come back with a revised quote."/>
        )}
        {q.expired && q.status !== "Accepted" && (
          <Band icon={<Clock size={20}/>} color="#B91C1C" bg="#FEF2F2"
            title="This quote has expired"
            sub="Please ask your account manager for a fresh quotation."/>
        )}
        {q.superseded && (
          <Band icon={<AlertTriangle size={20}/>} color="#B45309" bg="#FFFBEB"
            title="A newer version of this quote exists"
            sub="Please use the link to the latest revision."/>
        )}

        {q.items?.length > 0 && (
          <table style={{width:"100%", borderCollapse:"collapse", fontSize:13, marginBottom:14}}>
            <thead>
              <tr style={{borderBottom:"2px solid #E2E9EF", textAlign:"left", fontSize:11, color:"#8BA3B4"}}>
                <th style={{padding:"6px 4px"}}>ITEM</th>
                <th style={{padding:"6px 4px", textAlign:"right"}}>QTY</th>
                <th style={{padding:"6px 4px", textAlign:"right"}}>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {q.items.map((it, i) => (
                <tr key={i} style={{borderBottom:"1px solid #F0F4F8"}}>
                  <td style={{padding:"7px 4px"}}>{it.name}{it.unit ? <span style={{color:"#8BA3B4", fontSize:11}}> · {it.unit}</span> : null}</td>
                  <td style={{padding:"7px 4px", textAlign:"right"}}>{it.qty}</td>
                  <td style={{padding:"7px 4px", textAlign:"right", fontWeight:600}}>{money(it.amount ?? it.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{display:"flex", flexDirection:"column", gap:4, alignItems:"flex-end", fontSize:13, marginBottom:16}}>
          {q.subtotal != null && <div style={{color:"#4A6070"}}>Subtotal&ensp;<b>{money(q.subtotal)}</b></div>}
          {q.discount > 0 && <div style={{color:"#4A6070"}}>Discount&ensp;<b>−{money(q.discount)}</b></div>}
          {q.taxAmount != null && <div style={{color:"#4A6070"}}>{q.taxType || "Tax"}&ensp;<b>{money(q.taxAmount)}</b></div>}
          <div style={{fontSize:17, fontWeight:800, borderTop:"2px solid #E2E9EF", paddingTop:6, marginTop:2}}>
            Total&ensp;{money(q.total)}
          </div>
        </div>

        {q.terms && (
          <details style={{marginBottom:16, fontSize:12, color:"#4A6070"}}>
            <summary style={{cursor:"pointer", fontWeight:600, fontSize:12.5}}><FileText size={12} style={{verticalAlign:-2}}/> Terms &amp; conditions</summary>
            <div style={{whiteSpace:"pre-wrap", marginTop:8, padding:"10px 12px", background:"#F8FAFC", borderRadius:8}}>{q.terms}</div>
          </details>
        )}

        {open && !showChanges && (
          <div style={{borderTop:"1px solid #E2E9EF", paddingTop:16}}>
            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12}}>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
                style={{padding:"9px 12px", border:"1.5px solid #C8D4DF", borderRadius:8, fontSize:13}}/>
              <input value={designation} onChange={e => setDesignation(e.target.value)} placeholder="Designation (optional)"
                style={{padding:"9px 12px", border:"1.5px solid #C8D4DF", borderRadius:8, fontSize:13}}/>
            </div>
            <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
              <button disabled={busy || !name.trim()} onClick={() => act("accept")}
                title={!name.trim() ? "Please enter your name first" : undefined}
                style={{flex:1, minWidth:180, padding:"11px 16px", borderRadius:8, border:"none", cursor: busy || !name.trim() ? "not-allowed" : "pointer",
                  background: busy || !name.trim() ? "#9CC3B8" : "#1B6B5A", color:"#fff", fontWeight:700, fontSize:14}}>
                <Check size={15} style={{verticalAlign:-3, marginRight:6}}/>{busy ? "Recording…" : "Accept quotation"}
              </button>
              <button disabled={busy} onClick={() => setShowChanges(true)}
                style={{padding:"11px 16px", borderRadius:8, border:"1.5px solid #C8D4DF", background:"#fff", color:"#4A6070", fontWeight:600, fontSize:13, cursor:"pointer"}}>
                <MessageCircle size={14} style={{verticalAlign:-2, marginRight:6}}/>Request changes
              </button>
            </div>
          </div>
        )}
        {open && showChanges && (
          <div style={{borderTop:"1px solid #E2E9EF", paddingTop:16}}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
              style={{width:"100%", padding:"9px 12px", border:"1.5px solid #C8D4DF", borderRadius:8, fontSize:13, marginBottom:10}}/>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
              placeholder="What would you like changed? (pricing, scope, terms…)"
              style={{width:"100%", padding:"9px 12px", border:"1.5px solid #C8D4DF", borderRadius:8, fontSize:13, marginBottom:10, resize:"vertical"}}/>
            <div style={{display:"flex", gap:10}}>
              <button disabled={busy || !comment.trim()} onClick={() => act("changes")}
                style={{padding:"10px 16px", borderRadius:8, border:"none", background: busy || !comment.trim() ? "#D8C9A3" : "#B45309", color:"#fff", fontWeight:700, fontSize:13, cursor: busy || !comment.trim() ? "not-allowed" : "pointer"}}>
                {busy ? "Sending…" : "Send request"}
              </button>
              <button disabled={busy} onClick={() => setShowChanges(false)}
                style={{padding:"10px 16px", borderRadius:8, border:"1.5px solid #C8D4DF", background:"#fff", color:"#4A6070", fontSize:13, cursor:"pointer"}}>
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
