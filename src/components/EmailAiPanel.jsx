// ═══════════════════════════════════════════════════════════════════
// EmailAiPanel — Phase 1 of the Outlook + AI email workflow.
// Paste an email (or thread), link it to an Account / Opportunity /
// Contact, and let the AI extract summary, intent, action items,
// commitments, shipment references, priority & sentiment. Save it to the
// Communications timeline (and optionally spin off a follow-up task).
// No Outlook/Graph dependency — that's Phase 2 (live ingestion). This
// same extraction + storage shape is what the listener will feed later.
// ═══════════════════════════════════════════════════════════════════
import { useState } from "react";
import { Sparkles, X, Check, AlertTriangle, Flag, Package, Calendar, Users, ListChecks, Handshake, ArrowRight } from "lucide-react";
import { Modal } from "./shared";
import { aiEmailAnalysis, isAiFeatureOn } from "../utils/ai";
import { uid, today } from "../utils/helpers";
import { notify } from "../utils/toast";

const INTENT_COLOR = {
  RFQ: "#1E40AF", Complaint: "#B91C1C", "Shipment Update": "#0D9488", Documentation: "#7C3AED",
  Payment: "#B45309", Meeting: "#2563EB", Support: "#DB2777", Introduction: "#0891B2",
  Negotiation: "#CA8A04", General: "#64748B", Other: "#64748B",
};
const PRIORITY_COLOR = { High: "#DC2626", Medium: "#F59E0B", Low: "#22C55E" };
const SENTIMENT_COLOR = { Positive: "#16A34A", Neutral: "#64748B", Negative: "#DC2626", Mixed: "#B45309" };

const Badge = ({ text, color }) => (
  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, color, background: (color || "#64748B") + "18", whiteSpace: "nowrap" }}>{text}</span>
);
const Section = ({ icon, title, children }) => (
  <div style={{ marginTop: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text3)", marginBottom: 5 }}>{icon}{title}</div>
    {children}
  </div>
);

export default function EmailAiPanel({ onClose, onSaveComm, onCreateActivity, accounts = [], contacts = [], opps = [], currentUser, aiConfig, model }) {
  const [text, setText] = useState("");
  const [subject, setSubject] = useState("");
  const [from, setFrom] = useState("");
  const [accountId, setAccountId] = useState("");
  const [oppId, setOppId] = useState("");
  const [contactId, setContactId] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [makeTask, setMakeTask] = useState(true);

  const aiOn = isAiFeatureOn(aiConfig, "emailAnalysis");

  const analyze = async () => {
    if (!text.trim()) { setErr("Paste the email text first."); return; }
    setBusy(true); setErr(""); setRes(null);
    const ctx = {
      account: accounts.find(a => a.id === accountId)?.name,
      opportunity: opps.find(o => o.id === oppId)?.title,
    };
    const out = await aiEmailAnalysis({ text: text.trim(), subject: subject.trim(), from: from.trim(), context: ctx }, model);
    setBusy(false);
    if (!out.ok) { setErr(out.error || "AI analysis failed."); return; }
    setRes(out.result);
  };

  const save = () => {
    if (!res) return;
    const stamp = today + " " + new Date().toTimeString().slice(0, 5);
    onSaveComm && onSaveComm({
      id: `cm${uid()}`, type: "Email Sent", subject: subject || (res.summary || "").slice(0, 60),
      body: text, from, to: "", accountId, contactId, oppId,
      date: stamp, status: "Logged", owner: currentUser,
      ai: res, aiSummary: res.summary, aiIntent: res.intent, aiPriority: res.priority,
      aiSentiment: res.sentiment, followUpRequired: !!res.followUpRequired, aiProcessedAt: new Date().toISOString(),
    });
    // Optional follow-up activity from the AI's action items / next step.
    if (makeTask && res.followUpRequired && onCreateActivity) {
      const first = (res.actionItems || [])[0];
      onCreateActivity({
        id: `act_${uid()}`, type: "Follow-up", status: "Planned",
        title: first?.task || res.suggestedNextAction || `Follow up: ${subject || "email"}`,
        date: first?.due || (res.importantDates || [])[0]?.date || today,
        accountId, contactId, oppId, owner: currentUser,
        notes: `From email AI. ${res.suggestedNextAction || ""}`.trim(), createdDate: today,
      });
    }
    notify.success("Saved to Communications timeline" + (makeTask && res.followUpRequired ? " + follow-up task created" : "") + ".");
    onClose && onClose();
  };

  return (
    <Modal title={<span style={{ display: "flex", alignItems: "center", gap: 8 }}><Sparkles size={16} /> Analyze Email with AI</span>}
      onClose={onClose} lg
      footer={<>
        <button className="btn btn-sec" onClick={onClose}>Cancel</button>
        {!res
          ? <button className="btn btn-primary" onClick={analyze} disabled={busy || !aiOn}><Sparkles size={14} />{busy ? "Analyzing…" : "Analyze"}</button>
          : <button className="btn btn-primary" onClick={save}><Check size={14} /> Save to Timeline</button>}
      </>}>
      {!aiOn && (
        <div style={{ fontSize: 12, color: "#B45309", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
          AI is turned off. An admin can enable it (and the Email Analysis feature) in <b>AI Settings</b>.
        </div>
      )}
      <div className="form-row">
        <div className="form-group" style={{ flex: 2 }}><label>Subject</label>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject (optional)" />
        </div>
        <div className="form-group"><label>From</label>
          <input value={from} onChange={e => setFrom(e.target.value)} placeholder="sender@customer.com" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>Link to Account</label>
          <select value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">— None —</option>
            {accounts.filter(a => !a.isDeleted).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Link to Opportunity</label>
          <select value={oppId} onChange={e => setOppId(e.target.value)}>
            <option value="">— None —</option>
            {opps.filter(o => !o.isDeleted).map(o => <option key={o.id} value={o.id}>{o.oppId || o.title}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Contact</label>
          <select value={contactId} onChange={e => setContactId(e.target.value)}>
            <option value="">— None —</option>
            {contacts.filter(c => !c.isDeleted).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="form-group"><label>Email / thread text *</label>
        <textarea rows={7} value={text} onChange={e => setText(e.target.value)} placeholder="Paste the email body or the full thread here…" />
      </div>
      {err && <div style={{ fontSize: 12, color: "#DC2626", background: "#FEF2F2", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>{err}</div>}

      {res && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", background: "var(--s2)", marginTop: 8 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <Badge text={res.intent} color={INTENT_COLOR[res.intent]} />
            <Badge text={`Priority: ${res.priority}`} color={PRIORITY_COLOR[res.priority]} />
            <Badge text={res.sentiment} color={SENTIMENT_COLOR[res.sentiment]} />
            {res.followUpRequired && <Badge text="Follow-up required" color="#DC2626" />}
          </div>
          <div style={{ fontSize: 13, color: "var(--text1)", lineHeight: 1.5 }}>{res.summary}</div>

          {res.suggestedNextAction && (
            <Section icon={<ArrowRight size={13} />} title="Suggested next action">
              <div style={{ fontSize: 12.5, color: "var(--text1)", fontWeight: 600 }}>{res.suggestedNextAction}</div>
            </Section>
          )}
          {(res.actionItems || []).length > 0 && (
            <Section icon={<ListChecks size={13} />} title="Action items">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
                {res.actionItems.map((a, i) => <li key={i}>{a.task}{a.owner ? ` — ${a.owner}` : ""}{a.due ? ` (due ${a.due})` : ""}</li>)}
              </ul>
            </Section>
          )}
          {(res.commitments || []).length > 0 && (
            <Section icon={<Handshake size={13} />} title="Commitments">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>{res.commitments.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </Section>
          )}
          {(res.shipmentRefs || []).length > 0 && (
            <Section icon={<Package size={13} />} title="Shipment references">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {res.shipmentRefs.map((r, i) => <Badge key={i} text={`${r.type}: ${r.value}`} color="#0D9488" />)}
              </div>
            </Section>
          )}
          {(res.importantDates || []).length > 0 && (
            <Section icon={<Calendar size={13} />} title="Important dates">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>{res.importantDates.map((d, i) => <li key={i}>{d.label}: <b>{d.date}</b></li>)}</ul>
            </Section>
          )}
          {(res.people || []).length > 0 && (
            <Section icon={<Users size={13} />} title="People">
              <div style={{ fontSize: 12.5 }}>{res.people.join(" · ")}</div>
            </Section>
          )}

          {res.followUpRequired && onCreateActivity && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 12.5, cursor: "pointer" }}>
              <input type="checkbox" checked={makeTask} onChange={e => setMakeTask(e.target.checked)} />
              Also create a follow-up task from this email
            </label>
          )}
        </div>
      )}
    </Modal>
  );
}
