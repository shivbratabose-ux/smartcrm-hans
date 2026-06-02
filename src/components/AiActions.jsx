import { useState } from "react";
import { Sparkles, Loader2, AlertTriangle, Check, Gavel, ClipboardCheck } from "lucide-react";
import { PROD_MAP } from "../data/constants";
import { isAiFeatureOn, aiTenderQualification, aiBidRecommendation, aiCallSummary, aiComplianceMatrix, fileToBase64 } from "../utils/ai";

// ═══════════════════════════════════════════════════════════════════
// AI ACTIONS — reusable, self-contained AI feature widgets
// ═══════════════════════════════════════════════════════════════════
// Human-in-the-loop: every widget produces a SUGGESTION the user reviews.
// "Apply" buttons copy a suggestion into the form; nothing is auto-saved.
// All widgets render nothing unless the relevant feature is enabled in
// AI Settings (off by default).

const wrap = { border: "1px solid #FED7AA", background: "#FFFBEB", borderRadius: 10, padding: 12, marginTop: 8 };
const chip = (bg, fg) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: bg, color: fg });
const muted = { color: "#78716c", fontSize: 12 };

function ErrLine({ msg }) {
  return <div style={{ color: "#c0392b", fontSize: 12, display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}><AlertTriangle size={13} /> {msg}</div>;
}
function Bullets({ title, items, color = "#1a2230" }) {
  if (!items || !items.length) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: ".04em" }}>{title}</div>
      <ul style={{ margin: "2px 0 0", paddingLeft: 16, fontSize: 12.5 }}>
        {items.map((s, i) => <li key={i}>{typeof s === "string" ? s : JSON.stringify(s)}</li>)}
      </ul>
    </div>
  );
}

// Build a compact, model-friendly snapshot of the tender from the opp form.
function tenderPayload(form) {
  const prodNames = (form.products || []).map(p => PROD_MAP?.[p]?.name || p);
  return {
    title: form.title,
    products: prodNames,
    dealValueLakhs: form.value,
    closeDate: form.closeDate,
    tender: {
      tenderNo: form.tenderNo, authority: form.tenderAuthority, department: form.tenderDepartment,
      portal: form.tenderPortal, category: form.tenderCategory, state: form.tenderState,
      preBidDate: form.preBidDate, submissionDate: form.submissionDate,
      techBidDate: form.techBidDate, finBidDate: form.finBidDate,
      emdAmountLakhs: form.emdAmount, emdValidity: form.emdValidity,
      pbgAmountLakhs: form.pbgAmount, pbgValidity: form.pbgValidity,
      eligibility: form.eligibility, oemRequirements: form.oemReqs, mandatoryRequirements: form.mandatoryReqs,
    },
  };
}

function recoChip(reco) {
  const map = {
    "Strong Fit": ["#dcfce7", "#166534"], "Possible Fit": ["#fef9c3", "#854d0e"],
    "Weak Fit": ["#ffedd5", "#9a3412"], "Likely Disqualified": ["#fee2e2", "#991b1b"],
    "Bid": ["#dcfce7", "#166534"], "Conditional Bid": ["#fef9c3", "#854d0e"], "No-Bid": ["#fee2e2", "#991b1b"],
  };
  const [bg, fg] = map[reco] || ["#e5e7eb", "#374151"];
  return chip(bg, fg);
}

// ── Tender AI panel: qualification scoring + bid/no-bid + compliance matrix ──
export function TenderAiPanel({ form, setForm, aiConfig, model }) {
  const qualOn = isAiFeatureOn(aiConfig, "tenderQualification");
  const bidOn = isAiFeatureOn(aiConfig, "bidRecommendation");
  const compOn = isAiFeatureOn(aiConfig, "complianceMatrix");
  if (!qualOn && !bidOn && !compOn) return null;

  const [busy, setBusy] = useState("");        // which action is running
  const [qual, setQual] = useState(null);
  const [bid, setBid] = useState(null);
  const [comp, setComp] = useState(null);
  const [err, setErr] = useState("");
  const inputId = "ai-rfp-input";

  const useModel = model || aiConfig?.model;

  const runQual = async () => {
    setErr(""); setBusy("qual");
    const res = await aiTenderQualification(tenderPayload(form), useModel);
    setBusy("");
    if (!res.ok) { setErr(res.error); return; }
    setQual(res.result);
  };

  const runBid = async () => {
    setErr(""); setBusy("bid");
    const res = await aiBidRecommendation({ tender: tenderPayload(form), qualification: qual || form.bidQualification || null }, useModel);
    setBusy("");
    if (!res.ok) { setErr(res.error); return; }
    setBid(res.result);
  };

  const onPickPdf = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) { setErr("Please select a PDF file."); return; }
    setErr(""); setBusy("comp");
    try {
      const { base64, sizeMB } = await fileToBase64(file);
      if (sizeMB > 25) { setBusy(""); setErr("That PDF is larger than 25 MB — please use a smaller file."); return; }
      const res = await aiComplianceMatrix({ pdfBase64: base64 }, useModel);
      setBusy("");
      if (!res.ok) { setErr(res.error); return; }
      setComp(res.result);
    } catch (ex) {
      setBusy(""); setErr(ex.message || "Could not read the PDF.");
    }
  };

  const applyWinProb = (score) => setForm(f => ({ ...f, bidQualification: { ...(f.bidQualification || {}), winProbability: Math.max(0, Math.min(100, Math.round(score))) } }));
  const applyBidDecision = (b) => setForm(f => ({
    ...f, bidDecision: b.decision,
    bidDecisionNotes: [b.rationale, b.conditions?.length ? "Conditions: " + b.conditions.join("; ") : ""].filter(Boolean).join("\n"),
  }));
  const appendMandatory = (text) => setForm(f => ({ ...f, mandatoryReqs: [f.mandatoryReqs, text].filter(Boolean).join("\n") }));

  return (
    <div style={{ ...wrap }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Sparkles size={15} style={{ color: "#B45309" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "#B45309", textTransform: "uppercase", letterSpacing: ".05em" }}>AI Assist (suggestions — review before using)</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {qualOn && (
          <button type="button" className="btn btn-sm" onClick={runQual} disabled={!!busy}>
            {busy === "qual" ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} Qualification score
          </button>
        )}
        {bidOn && (
          <button type="button" className="btn btn-sm" onClick={runBid} disabled={!!busy}>
            {busy === "bid" ? <Loader2 size={13} className="spin" /> : <Gavel size={13} />} Bid / No-Bid
          </button>
        )}
        {compOn && (
          <>
            <button type="button" className="btn btn-sm" onClick={() => document.getElementById(inputId)?.click()} disabled={!!busy}>
              {busy === "comp" ? <Loader2 size={13} className="spin" /> : <ClipboardCheck size={13} />} Compliance matrix (RFP PDF)
            </button>
            <input id={inputId} type="file" accept="application/pdf,.pdf" style={{ display: "none" }} onChange={onPickPdf} />
          </>
        )}
      </div>

      {err && <ErrLine msg={err} />}

      {/* Qualification result */}
      {qual && (
        <div style={{ marginTop: 10, borderTop: "1px dashed #FED7AA", paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 20 }}>{qual.fitScore}<span style={muted}>/100</span></span>
            <span style={recoChip(qual.recommendation)}>{qual.recommendation}</span>
            <button type="button" className="btn btn-xs btn-sec" onClick={() => applyWinProb(qual.fitScore)} title="Copy into Win Probability">
              <Check size={12} /> Use as win probability
            </button>
          </div>
          {qual.summary && <div style={{ fontSize: 12.5, marginTop: 6 }}>{qual.summary}</div>}
          {Array.isArray(qual.dimensions) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 6, marginTop: 8 }}>
              {qual.dimensions.map((d, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #f0e6d6", borderRadius: 8, padding: "6px 8px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>{d.name}</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{d.score}</div>
                  <div style={{ ...muted, fontSize: 11 }}>{d.rationale}</div>
                </div>
              ))}
            </div>
          )}
          <Bullets title="Strengths" items={qual.strengths} color="#166534" />
          <Bullets title="Risks" items={qual.risks} color="#9a3412" />
          <Bullets title="Verify / missing info" items={qual.missingInfo} color="#854d0e" />
        </div>
      )}

      {/* Bid recommendation result */}
      {bid && (
        <div style={{ marginTop: 10, borderTop: "1px dashed #FED7AA", paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={recoChip(bid.decision)}>{bid.decision}</span>
            <span style={muted}>confidence {bid.confidence}%</span>
            <button type="button" className="btn btn-xs btn-sec" onClick={() => applyBidDecision(bid)} title="Copy into Bid Decision">
              <Check size={12} /> Use this decision
            </button>
          </div>
          {bid.rationale && <div style={{ fontSize: 12.5, marginTop: 6 }}>{bid.rationale}</div>}
          <Bullets title="Key factors" items={bid.keyFactors} />
          <Bullets title="Conditions" items={bid.conditions} color="#854d0e" />
          <Bullets title="Risks" items={bid.risks} color="#9a3412" />
          <Bullets title="Next steps" items={bid.suggestedNextSteps} color="#166534" />
        </div>
      )}

      {/* Compliance matrix result */}
      {comp && (
        <div style={{ marginTop: 10, borderTop: "1px dashed #FED7AA", paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: 12.5 }}>{comp.summary}</span>
          </div>
          {comp.totals && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, fontSize: 11 }}>
              <span style={chip("#e5e7eb", "#374151")}>{comp.totals.total} total</span>
              <span style={chip("#e5e7eb", "#374151")}>{comp.totals.mandatory} mandatory</span>
              <span style={chip("#dcfce7", "#166534")}>{comp.totals.compliant} compliant</span>
              <span style={chip("#fef9c3", "#854d0e")}>{comp.totals.partial} partial</span>
              <span style={chip("#fee2e2", "#991b1b")}>{comp.totals.nonCompliant} non-compliant</span>
              <span style={chip("#e0e7ff", "#3730a3")}>{comp.totals.needsReview} needs review</span>
            </div>
          )}
          {Array.isArray(comp.items) && comp.items.length > 0 && (
            <div style={{ maxHeight: 260, overflow: "auto", marginTop: 8, border: "1px solid #f0e6d6", borderRadius: 8 }}>
              <table style={{ width: "100%", fontSize: 11.5, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#fff7ed", position: "sticky", top: 0 }}>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Ref</th>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Requirement</th>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Cat.</th>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>M?</th>
                    <th style={{ textAlign: "left", padding: "4px 6px" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {comp.items.map((it, i) => (
                    <tr key={i} style={{ borderTop: "1px solid #f3eee4" }}>
                      <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>{it.refClause || "—"}</td>
                      <td style={{ padding: "4px 6px" }}>{it.requirement}{it.gap ? <div style={{ ...muted, fontSize: 11 }}>Gap: {it.gap}</div> : null}</td>
                      <td style={{ padding: "4px 6px" }}>{it.category}</td>
                      <td style={{ padding: "4px 6px" }}>{it.mandatory ? "Yes" : "No"}</td>
                      <td style={{ padding: "4px 6px" }}><span style={recoChip(it.complianceStatus === "Compliant" ? "Strong Fit" : it.complianceStatus === "Non-Compliant" ? "Likely Disqualified" : "Possible Fit")}>{it.complianceStatus}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button type="button" className="btn btn-xs btn-sec" style={{ marginTop: 8 }} onClick={() => appendMandatory(comp.summary)}>
            <Check size={12} /> Add summary to Mandatory Requirements
          </button>
        </div>
      )}
    </div>
  );
}

// ── Call/meeting summary: button + inline result for a note textarea ──
export function CallSummaryButton({ note, meta, aiConfig, model, onApply }) {
  if (!isAiFeatureOn(aiConfig, "callSummary")) return null;
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");

  const run = async () => {
    if (!note || !note.trim()) { setErr("Add some call notes first, then generate a summary."); return; }
    setErr(""); setBusy(true);
    const r = await aiCallSummary(note, meta || {}, model || aiConfig?.model);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setRes(r.result);
  };

  return (
    <div style={{ marginTop: 6 }}>
      <button type="button" className="btn btn-sm" onClick={run} disabled={busy}>
        {busy ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} AI summarise note
      </button>
      {err && <ErrLine msg={err} />}
      {res && (
        <div style={{ ...wrap, marginTop: 8 }}>
          <div style={{ fontSize: 12.5 }}>{res.summary}</div>
          <div style={{ marginTop: 4 }}><span style={recoChip(res.sentiment === "Positive" ? "Strong Fit" : res.sentiment === "Negative" ? "Likely Disqualified" : "Possible Fit")}>{res.sentiment}</span></div>
          <Bullets title="Key points" items={res.keyPoints} />
          <Bullets title="Decisions" items={res.decisions} />
          <Bullets title="Action items" items={(res.actionItems || []).map(a => [a.owner ? a.owner + ": " : "", a.task, a.due ? " (" + a.due + ")" : ""].join(""))} color="#166534" />
          <Bullets title="Next steps" items={res.nextSteps} />
          {onApply && (
            <button type="button" className="btn btn-xs btn-sec" style={{ marginTop: 8 }} onClick={() => onApply(res)}>
              <Check size={12} /> Insert summary into note
            </button>
          )}
        </div>
      )}
    </div>
  );
}
