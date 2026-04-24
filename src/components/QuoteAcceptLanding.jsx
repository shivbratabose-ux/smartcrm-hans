import { useState, useMemo } from "react";
import { Check, MessageCircle, FileText, Building2, User, Calendar, Receipt } from "lucide-react";
import { fmt, today, uid, resolveAddress, formatAddress } from "../utils/helpers";
import { TEAM_MAP, PROD_MAP } from "../data/constants";
import { BLANK_CONTRACT } from "../data/seed";

/* ──────────────────────────────────────────────────────────────────
   Customer-facing landing page reached via QR scan from the printed
   quote PDF. Hash route: #/quote-accept/<quoteId>

   Renders a clean read-only summary of the quote and gives the
   customer two actions: Accept (locks quote + creates contract draft)
   or Request Changes (notes feedback, flips quote to Under Review,
   pings the owner via an activity entry).

   Designed to work for an in-person handover (sales rep opens link on
   their device, hands to customer). No auth gate is added — anyone
   with the link + the quote present in localStorage can interact.
   ────────────────────────────────────────────────────────────────── */
export default function QuoteAcceptLanding({ quoteId, quotes, setQuotes, accounts, contacts, contracts=[], setContracts, setActivities, currentUser, onBack }) {
  const quote = useMemo(() => quotes.find(q => q.id === quoteId), [quotes, quoteId]);
  const account = useMemo(() => accounts.find(a => a.id === quote?.accountId), [accounts, quote]);
  const contact = useMemo(() => contacts.find(c => c.id === quote?.contactId), [contacts, quote]);
  const owner = quote ? (TEAM_MAP[quote.owner]?.name || quote.owner) : "—";
  const billingAddr = useMemo(() => {
    const fromContact = resolveAddress(contact, accounts);
    const fromAccount = (account?.addresses || []).find(a => a.isBilling) || (account?.addresses || [])[0];
    return fromContact || fromAccount || null;
  }, [contact, account, accounts]);

  const [done, setDone] = useState(null); // "accepted" | "changes" | null
  const [comment, setComment] = useState("");
  const [showChanges, setShowChanges] = useState(false);

  if (!quote) {
    return (
      <div style={{maxWidth:600, margin:"60px auto", padding:32, background:"#fff", border:"1px solid var(--border)", borderRadius:12, textAlign:"center"}}>
        <div style={{fontSize:48, color:"#94A3B8", marginBottom:12}}>?</div>
        <div style={{fontSize:18, fontWeight:600, marginBottom:6}}>Quote not found</div>
        <div style={{fontSize:13, color:"var(--text2)", marginBottom:20}}>The quote ID <strong>{quoteId}</strong> is no longer available, or the link was scanned on a device that doesn't have access to it.</div>
        {onBack && <button className="btn btn-sec" onClick={onBack}>Back to app</button>}
      </div>
    );
  }

  const isTerminal = ["Accepted","Rejected","Expired","Revised"].includes(quote.status);

  const handleAccept = () => {
    if (!window.confirm(`Confirm acceptance of quote ${quote.id} for ₹${quote.total}L total. This will lock the quote and create a contract draft.`)) return;
    const at = new Date().toISOString();
    let contractId = "";
    if (setContracts && BLANK_CONTRACT) {
      contractId = `CT-${String(contracts.length + 1).padStart(3, "0")}`;
      const newContract = {
        ...BLANK_CONTRACT,
        id: contractId,
        contractNo: contractId,
        title: quote.title,
        accountId: quote.accountId,
        oppId: quote.oppId || "",
        contactId: quote.contactId || "",
        product: quote.product,
        productSelection: quote.productSelection,
        value: quote.total,
        currency: "INR",
        status: "Draft",
        startDate: today,
        owner: quote.owner || currentUser,
        createdDate: today,
        notes: `Auto-created from quote ${quote.id} accepted by customer via QR link${comment ? `. Note: ${comment}` : ""}.`,
      };
      setContracts(p => [...p, newContract]);
    }
    const ce = { id: uid(), at, by: "customer", field: "status", from: quote.status, to: "Accepted", note: `accepted via QR link${comment ? ` — ${comment}` : ""}${contractId ? ` · contract ${contractId} created` : ""}` };
    setQuotes(p => p.map(r => r.id === quote.id ? {
      ...r,
      status: "Accepted",
      acceptedDate: today,
      contractId,
      isFinal: true,
      changeLog: [...(r.changeLog || []), ce],
    } : r));
    // Also notify the owner via an activity entry
    if (setActivities) {
      setActivities(p => [...p, {
        id: uid(),
        type: "Note",
        subject: `Quote ${quote.id} accepted by customer`,
        accountId: quote.accountId,
        contactId: quote.contactId,
        owner: quote.owner,
        status: "Completed",
        date: today,
        notes: `Customer accepted via QR link.${comment ? ` Comment: ${comment}` : ""} Contract ${contractId} drafted.`,
        createdDate: today,
      }]);
    }
    setDone("accepted");
  };

  const handleRequestChanges = () => {
    if (!comment.trim()) {
      alert("Please describe what needs to change so the sales team can address it.");
      return;
    }
    const at = new Date().toISOString();
    const ce = { id: uid(), at, by: "customer", field: "status", from: quote.status, to: "Under Review", note: `customer requested changes: ${comment}` };
    setQuotes(p => p.map(r => r.id === quote.id ? {
      ...r,
      status: "Under Review",
      changeLog: [...(r.changeLog || []), ce],
    } : r));
    if (setActivities) {
      setActivities(p => [...p, {
        id: uid(),
        type: "Follow-up",
        subject: `Quote ${quote.id}: changes requested by customer`,
        accountId: quote.accountId,
        contactId: quote.contactId,
        owner: quote.owner,
        status: "Open",
        priority: "High",
        date: today,
        notes: `Customer reviewed via QR link and requested changes:\n\n${comment}`,
        createdDate: today,
      }]);
    }
    setDone("changes");
  };

  /* ── Confirmation screens ── */
  if (done === "accepted") {
    return (
      <div style={{maxWidth:560, margin:"60px auto", padding:36, background:"#fff", border:"1px solid #A7F3D0", borderRadius:12, textAlign:"center"}}>
        <div style={{width:60,height:60,borderRadius:30,background:"#22C55E",margin:"0 auto 16px",display:"flex",alignItems:"center",justifyContent:"center"}}><Check size={32} color="#fff"/></div>
        <div style={{fontSize:20, fontWeight:700, color:"#047857", marginBottom:8}}>Quote Accepted</div>
        <div style={{fontSize:13, color:"var(--text2)", marginBottom:8}}>Thank you. The sales team has been notified and will be in touch to finalise the contract.</div>
        <div style={{fontSize:12, color:"var(--text3)", marginBottom:20}}>Reference: {quote.id} · {account?.name || ""}</div>
        {onBack && <button className="btn btn-primary" onClick={onBack}>Done</button>}
      </div>
    );
  }
  if (done === "changes") {
    return (
      <div style={{maxWidth:560, margin:"60px auto", padding:36, background:"#fff", border:"1px solid #FDE68A", borderRadius:12, textAlign:"center"}}>
        <div style={{width:60,height:60,borderRadius:30,background:"#F59E0B",margin:"0 auto 16px",display:"flex",alignItems:"center",justifyContent:"center"}}><MessageCircle size={32} color="#fff"/></div>
        <div style={{fontSize:20, fontWeight:700, color:"#92400E", marginBottom:8}}>Feedback Sent</div>
        <div style={{fontSize:13, color:"var(--text2)", marginBottom:8}}>Your comments have been logged. Account manager <strong>{owner}</strong> will follow up shortly.</div>
        <div style={{fontSize:12, color:"var(--text3)", marginBottom:20}}>Reference: {quote.id}</div>
        {onBack && <button className="btn btn-primary" onClick={onBack}>Done</button>}
      </div>
    );
  }

  /* ── Main landing view ── */
  return (
    <div style={{maxWidth:760, margin:"24px auto", padding:"0 16px"}}>
      {/* Header band */}
      <div style={{background:"linear-gradient(135deg,#1B6B5A 0%,#0F766E 100%)", color:"#fff", padding:"20px 28px", borderRadius:"12px 12px 0 0"}}>
        <div style={{fontSize:11, letterSpacing:"2px", opacity:0.85, fontWeight:600}}>QUOTATION FOR YOUR REVIEW</div>
        <div style={{fontSize:22, fontWeight:700, marginTop:6}}>{quote.title}</div>
        <div style={{fontSize:13, marginTop:4, opacity:0.9}}>Quote {quote.id} · v{quote.version || 1} · From <strong>Hans Infomatic</strong></div>
      </div>

      {/* Body */}
      <div style={{background:"#fff", border:"1px solid var(--border)", borderTop:"none", borderRadius:"0 0 12px 12px", padding:"24px 28px"}}>
        {/* Status banner if terminal */}
        {isTerminal && (
          <div style={{padding:"10px 14px", background:"#FEF3C7", border:"1px solid #FDE68A", borderRadius:8, marginBottom:18, fontSize:12.5, color:"#92400E"}}>
            <strong>This quote is no longer open for action</strong> — current status: {quote.status}. {quote.status === "Accepted" ? "It has already been accepted." : quote.status === "Expired" ? "It has expired; please request a fresh quote from your account manager." : quote.status === "Revised" ? "A newer version has been issued; please use that one." : "Please contact your account manager."}
          </div>
        )}

        {/* Customer / dates strip */}
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20, fontSize:12.5, color:"var(--text2)"}}>
          <div>
            <div style={{fontSize:10, letterSpacing:"1px", color:"var(--text3)", fontWeight:700, marginBottom:4}}><Building2 size={11} style={{verticalAlign:-1, marginRight:4}}/>BILL TO</div>
            <div style={{fontSize:14, fontWeight:600, color:"var(--text)"}}>{account?.name || "—"}</div>
            {billingAddr && <div style={{marginTop:2}}>{formatAddress(billingAddr)}</div>}
            {account?.gstin && <div style={{marginTop:2, fontSize:11.5}}>GSTIN: {account.gstin}</div>}
          </div>
          <div>
            <div style={{fontSize:10, letterSpacing:"1px", color:"var(--text3)", fontWeight:700, marginBottom:4}}><User size={11} style={{verticalAlign:-1, marginRight:4}}/>ATTENTION</div>
            <div style={{fontSize:14, fontWeight:600, color:"var(--text)"}}>{contact?.name || "—"}</div>
            {contact?.email && <div style={{marginTop:2, fontSize:11.5}}>{contact.email}</div>}
            {contact?.phone && <div style={{fontSize:11.5}}>{contact.phone}</div>}
          </div>
          <div>
            <div style={{fontSize:10, letterSpacing:"1px", color:"var(--text3)", fontWeight:700, marginBottom:4}}><Calendar size={11} style={{verticalAlign:-1, marginRight:4}}/>DATES</div>
            <div style={{fontSize:12.5}}>Issued: {fmt.date(quote.sentDate || quote.createdDate)}</div>
            {quote.expiryDate && <div style={{fontSize:12.5}}>Valid till: <strong>{fmt.date(quote.expiryDate)}</strong></div>}
          </div>
          <div>
            <div style={{fontSize:10, letterSpacing:"1px", color:"var(--text3)", fontWeight:700, marginBottom:4}}><User size={11} style={{verticalAlign:-1, marginRight:4}}/>YOUR ACCOUNT MANAGER</div>
            <div style={{fontSize:14, fontWeight:600, color:"var(--text)"}}>{owner}</div>
          </div>
        </div>

        {/* Line items */}
        <div style={{marginBottom:18}}>
          <div style={{fontSize:11, letterSpacing:"1px", color:"var(--text3)", fontWeight:700, marginBottom:8}}><Receipt size={11} style={{verticalAlign:-1, marginRight:4}}/>SCOPE & PRICING</div>
          <table style={{width:"100%", fontSize:12.5, borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#F8FAFC", borderBottom:"2px solid var(--border)"}}>
                <th style={{textAlign:"left", padding:"8px 10px", fontWeight:600, color:"var(--text3)"}}>Description</th>
                <th style={{textAlign:"right", padding:"8px 10px", fontWeight:600, color:"var(--text3)"}}>Qty</th>
                <th style={{textAlign:"right", padding:"8px 10px", fontWeight:600, color:"var(--text3)"}}>Rate (₹L)</th>
                <th style={{textAlign:"right", padding:"8px 10px", fontWeight:600, color:"var(--text3)"}}>Amount (₹L)</th>
              </tr>
            </thead>
            <tbody>
              {(quote.items || []).map((it, i) => (
                <tr key={i} style={{borderBottom:"1px solid var(--border)"}}>
                  <td style={{padding:"8px 10px"}}>{it.description}</td>
                  <td style={{padding:"8px 10px", textAlign:"right"}}>{it.qty}</td>
                  <td style={{padding:"8px 10px", textAlign:"right"}}>₹{Number(it.unitPrice||0).toFixed(2)}</td>
                  <td style={{padding:"8px 10px", textAlign:"right", fontWeight:600}}>₹{Number(it.amount||0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div style={{marginLeft:"auto", maxWidth:300, fontSize:13, color:"var(--text2)", marginBottom:20}}>
          <div style={{display:"flex", justifyContent:"space-between", padding:"3px 0"}}><span>Subtotal:</span><strong>₹{quote.subtotal}L</strong></div>
          {quote.discount > 0 && <div style={{display:"flex", justifyContent:"space-between", padding:"3px 0", color:"#F59E0B"}}><span>Discount:</span><strong>-₹{quote.discount}L</strong></div>}
          <div style={{display:"flex", justifyContent:"space-between", padding:"3px 0"}}><span>Tax ({quote.taxType}):</span><strong>₹{quote.taxAmount}L</strong></div>
          <div style={{display:"flex", justifyContent:"space-between", padding:"10px 0 0", borderTop:"2px solid #1B6B5A", marginTop:6, fontSize:16, fontWeight:700, color:"#1B6B5A"}}><span>Grand Total:</span><span>₹{quote.total}L</span></div>
        </div>

        {/* Terms preview */}
        {quote.terms && (
          <details style={{marginBottom:18, background:"#F8FAFC", padding:"10px 14px", borderRadius:8, borderLeft:"3px solid var(--brand)"}}>
            <summary style={{cursor:"pointer", fontSize:12, fontWeight:600, color:"var(--text)"}}><FileText size={12} style={{verticalAlign:-1, marginRight:4}}/>Terms & Conditions</summary>
            <div style={{marginTop:10, fontSize:11.5, color:"var(--text2)", whiteSpace:"pre-line"}}>{quote.terms}</div>
          </details>
        )}

        {/* Action area */}
        {!isTerminal && (
          <>
            {!showChanges ? (
              <div style={{display:"flex", gap:10, marginTop:20, paddingTop:20, borderTop:"1px solid var(--border)"}}>
                <button onClick={handleAccept} style={{flex:1, padding:"12px 20px", background:"#22C55E", color:"#fff", border:"none", borderRadius:8, fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8}}><Check size={16}/>Accept Quote</button>
                <button onClick={()=>setShowChanges(true)} style={{flex:1, padding:"12px 20px", background:"#fff", color:"#92400E", border:"1px solid #FDE68A", borderRadius:8, fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8}}><MessageCircle size={16}/>Request Changes</button>
              </div>
            ) : (
              <div style={{marginTop:20, paddingTop:20, borderTop:"1px solid var(--border)"}}>
                <div style={{fontSize:12.5, fontWeight:600, marginBottom:8}}>What would you like to discuss or change?</div>
                <textarea value={comment} onChange={e=>setComment(e.target.value)} rows={4} placeholder="e.g. Need 60-day payment terms instead of 30. Or, please remove module X from line 2." style={{width:"100%", padding:"10px 12px", borderRadius:8, border:"1px solid var(--border)", fontSize:13, fontFamily:"inherit", resize:"vertical"}}/>
                <div style={{display:"flex", gap:10, marginTop:12}}>
                  <button onClick={handleRequestChanges} style={{flex:1, padding:"10px 20px", background:"#F59E0B", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer"}}>Send to Account Manager</button>
                  <button onClick={()=>{setShowChanges(false); setComment("");}} style={{padding:"10px 20px", background:"#fff", color:"var(--text2)", border:"1px solid var(--border)", borderRadius:8, fontSize:13, cursor:"pointer"}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Optional comment for Accept */}
            {!showChanges && (
              <div style={{marginTop:14}}>
                <input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Optional note to send with acceptance (e.g. PO will follow Monday)" style={{width:"100%", padding:"8px 12px", borderRadius:6, border:"1px solid var(--border)", fontSize:12}}/>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{marginTop:24, paddingTop:14, borderTop:"1px solid var(--border)", fontSize:11, color:"var(--text3)", display:"flex", justifyContent:"space-between"}}>
          <span>Hans Infomatic Pvt. Ltd.</span>
          <span>Quote ID {quote.id} · Generated {fmt.date(today)}</span>
        </div>
      </div>
    </div>
  );
}
