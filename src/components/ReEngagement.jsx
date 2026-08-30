// ═══════════════════════════════════════════════════════════════════
// Re-engagement — Module A approval queue (R1)
// ═══════════════════════════════════════════════════════════════════
// The daily agent run (re-agent-run) selects unattended accounts and
// drafts follow-ups; THIS page is where a human reviews, edits, and
// sends. Nothing sends without the button below being clicked by the
// signed-in user — the email goes out via sendEmail() under their own
// JWT, so send-email attributes and Reply-To's them, and the draft +
// candidate rows record who approved.
import { useState, useEffect, useMemo, useCallback } from "react";
import { HeartHandshake, RefreshCw, Send, SkipForward, Ban, ChevronDown, ShieldAlert, Clock } from "lucide-react";
import { loadReQueue, markReSent, skipReCandidate, loadAgentConfig, isSupabaseConfigured } from "../lib/db";
import { sendEmail } from "../utils/email";
import { fmt } from "../utils/helpers";
import { bodyToHtml } from "../../supabase/functions/re-agent-run/logic.mjs";
import { Modal, Empty, UserPill, PageTip } from "./shared";
import { notify } from "../utils/toast";
import DataGrid from "./DataGrid";

function SortIcon({ col, sortKey, sortDir }) {
  if (col !== sortKey) return <ChevronDown size={12} style={{ opacity: 0.3 }} />;
  return <ChevronDown size={12} style={{ transform: sortDir === "asc" ? "rotate(180deg)" : "none", opacity: 0.8 }} />;
}

const CLASS_META = {
  ready:            { label: "Ready",            color: "#15803D", bg: "#DCFCE7" },
  internal_pending: { label: "Internal pending", color: "#B45309", bg: "#FEF3C7" },
  complaint:        { label: "Complaint open",   color: "#B91C1C", bg: "#FEE2E2" },
};
const STATUS_META = {
  new:     { label: "Selected", color: "#1D4ED8", bg: "#DBEAFE" },
  drafted: { label: "Draft ready", color: "#15803D", bg: "#DCFCE7" },
  sent:    { label: "Sent", color: "#64748B", bg: "#F1F5F9" },
  skipped: { label: "Skipped", color: "#64748B", bg: "#F1F5F9" },
};

function ReEngagement({ accounts = [], contacts = [], orgUsers = [], currentUser }) {
  const [rows, setRows] = useState([]);
  const [loadErr, setLoadErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusF, setStatusF] = useState("drafted");
  const [review, setReview] = useState(null);   // candidate row under review
  const [subject, setSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [sending, setSending] = useState(false);
  const [config, setConfig] = useState(null);
  const [sortKey, setSortKey] = useState("daysInactive");
  const [sortDir, setSortDir] = useState("desc");
  const toggleSort = (k) => { if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } };

  const refresh = useCallback(async () => {
    setLoading(true);
    const { rows: r, error } = await loadReQueue();
    setRows(r); setLoadErr(error); setLoading(false);
    const { config: c } = await loadAgentConfig();
    setConfig(c);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const accName = (id) => accounts.find(a => a.id === id)?.name || id || "";
  const contactOf = (id) => contacts.find(c => c.id === id) || null;

  const filtered = useMemo(() =>
    statusF === "All" ? rows : rows.filter(r => r.status === statusF), [rows, statusF]);
  const counts = useMemo(() => {
    const c = {}; rows.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; }); return c;
  }, [rows]);

  const sorted = useMemo(() => {
    const f = sortDir === "asc" ? 1 : -1;
    const val = (r, k) => k === "account" ? accName(r.accountId)
      : k === "owner" ? (orgUsers.find(u => u.id === r.ownerId)?.name || "")
      : typeof r[k] === "number" ? r[k] : (r[k] ?? "");
    return [...filtered].sort((a, b) => {
      const va = val(a, sortKey), vb = val(b, sortKey);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * f;
      return String(va).localeCompare(String(vb)) * f;
    });
  }, [filtered, sortKey, sortDir, accounts, orgUsers]);

  const openReview = (r) => {
    setReview(r);
    setSubject(r.draft?.recommendedSubject || r.draft?.subjectOptions?.[0] || "");
    setDraftBody(r.draft?.body || "");
  };

  const approveAndSend = async () => {
    if (!review) return;
    const contact = contactOf(review.contactId);
    if (!contact?.email) { notify.error("This candidate has no contact email — skip it or fix the contact."); return; }
    if (!subject.trim() || !draftBody.trim()) { notify.error("Subject and body are required."); return; }
    setSending(true);
    const res = await sendEmail({ to: contact.email, subject: subject.trim(), html: bodyToHtml(draftBody) });
    if (!res?.ok) { setSending(false); notify.error(`Send failed: ${res?.error || "unknown error"}`); return; }
    const { error } = await markReSent(review.id, review.accountId,
      { subject: subject.trim(), body: draftBody, messageId: res.messageId || "" }, currentUser);
    setSending(false);
    if (error) { notify.error(`Sent, but recording failed: ${error}`); return; }
    notify.success(`Sent to ${contact.email}. Replies land in your inbox.`);
    setReview(null); refresh();
  };

  const skip = async (r, dnc = false) => {
    const reason = dnc ? "do not contact" : (window.prompt("Skip reason (optional):") || "");
    if (dnc && !window.confirm(`Mark ${accName(r.accountId)} as Do Not Contact for all automated follow-ups?`)) return;
    const { error } = await skipReCandidate(r.id, reason, currentUser, dnc, r.accountId);
    if (error) { notify.error(`Couldn't save: ${error}`); return; }
    if (review?.id === r.id) setReview(null);
    refresh();
  };

  if (!isSupabaseConfigured) {
    return (
      <div>
        <div className="pg-head"><div><div className="pg-title">Re-engagement</div></div></div>
        <div className="card"><Empty icon={<HeartHandshake size={22} />} title="Cloud connection required"
          sub="The re-engagement queue lives in Supabase. Configure VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to use this page." /></div>
      </div>
    );
  }

  const summary = review?.draft?.crmSummary || {};

  return (
    <div>
      <PageTip id="reengage-tip" title="How this works"
        text="Every morning the agent finds accounts with no meaningful contact for the configured period, checks the exclusion rules (complaints, opt-outs, cooldowns), and drafts a follow-up for the ones that qualify. Nothing is ever sent automatically — you review, edit, and send from here, and the email goes out under your own name." />
      <div className="pg-head">
        <div>
          <div className="pg-title">Re-engagement</div>
          <div className="pg-sub">
            {counts.drafted || 0} draft{(counts.drafted || 0) === 1 ? "" : "s"} awaiting review · {counts.sent || 0} sent
            {config && !config.re_enabled && <span style={{ color: "var(--red)", fontWeight: 700 }}> · agent disabled</span>}
            {config?.re_paused && <span style={{ color: "var(--red)", fontWeight: 700 }}> · PAUSED</span>}
          </div>
        </div>
        <div className="pg-actions"><button className="btn btn-sec" onClick={refresh}><RefreshCw size={14} />Refresh</button></div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {["drafted", "new", "sent", "skipped", "All"].map(q => (
          <button key={q} className={`btn btn-sm ${statusF === q ? "btn-primary" : "btn-sec"}`}
            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6 }} onClick={() => setStatusF(q)}>
            {q === "All" ? `All (${rows.length})` : `${STATUS_META[q]?.label || q} (${counts[q] || 0})`}
          </button>
        ))}
      </div>

      {loadErr && loadErr !== "not-configured" && (
        <div className="card" style={{ padding: 14, marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <ShieldAlert size={16} style={{ color: "var(--red)" }} />
          <span style={{ fontSize: 12.5 }}>Couldn't load the queue: {loadErr}. Has add_re_agent_v1.sql been run?</span>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <DataGrid
          dense
          module="re_engagement_queue"
          userId={currentUser}
          columns={[
            { key: "account", label: "Account", defaultWidth: 230,
              render: r => <span className="tbl-link" onClick={() => r.draft ? openReview(r) : null}
                style={{ fontWeight: 600 }}>{accName(r.accountId)}</span> },
            { key: "status", label: "Status", defaultWidth: 110,
              render: r => { const m = STATUS_META[r.status] || {}; return <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, color: m.color, background: m.bg }}>{m.label || r.status}</span>; } },
            { key: "classification", label: "Class", defaultWidth: 130,
              render: r => { const m = CLASS_META[r.classification] || { label: r.classification, color: "#64748B", bg: "#F1F5F9" };
                return <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, color: m.color, background: m.bg }}>{m.label}</span>; } },
            { key: "daysInactive", label: "Quiet", defaultWidth: 80,
              render: r => <span style={{ fontWeight: 700, color: r.daysInactive >= 90 ? "var(--red)" : r.daysInactive >= 60 ? "#B45309" : "inherit" }}>{r.daysInactive >= 9999 ? "ever" : `${r.daysInactive}d`}</span> },
            { key: "lastContactAt", label: "Last contact", defaultWidth: 120,
              render: r => r.lastContactAt ? fmt.date(r.lastContactAt) : <span style={{ color: "var(--text3)" }}>never</span> },
            { key: "owner", label: "Owner", defaultWidth: 140, render: r => <UserPill uid={r.ownerId} /> },
            { key: "risk", label: "Flags", defaultWidth: 160, sortable: false,
              render: r => (r.draft?.riskFlags || []).length
                ? <span style={{ fontSize: 10.5, color: "#B45309", fontWeight: 600 }}>{r.draft.riskFlags.slice(0, 2).join(" · ")}</span>
                : null },
            { key: "reasons", label: "Why selected", defaultWidth: 260, wrap: true, sortable: false,
              render: r => <span style={{ fontSize: 11.5, color: "var(--text3)" }}>{(r.selectionReasons || []).join("; ")}</span> },
          ]}
          defaultColumnConfig={[
            { key: "account", visible: true, width: 230 }, { key: "status", visible: true, width: 110 },
            { key: "classification", visible: true, width: 130 }, { key: "daysInactive", visible: true, width: 80 },
            { key: "lastContactAt", visible: true, width: 120 }, { key: "owner", visible: true, width: 140 },
            { key: "risk", visible: true, width: 160 }, { key: "reasons", visible: false, width: 260 },
          ]}
          rows={sorted}
          rowKey={r => r.id}
          sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} SortIcon={SortIcon}
          emptyState={<Empty icon={<HeartHandshake size={22} />}
            title={loading ? "Loading…" : "Queue is clear"}
            sub={loading ? "" : "The agent's next daily run will surface any accounts going quiet."} />}
          rowActions={r => (
            <div style={{ display: "flex", gap: 6 }}>
              {r.status === "drafted" && r.draft && (
                <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }} onClick={() => openReview(r)}>
                  <Send size={12} />Review
                </button>
              )}
              {["new", "drafted"].includes(r.status) && (<>
                <button className="btn btn-sm btn-sec" style={{ fontSize: 11 }} title="Skip this candidate" onClick={() => skip(r)}><SkipForward size={12} /></button>
                <button className="btn btn-sm btn-sec" style={{ fontSize: 11, color: "var(--red)" }} title="Mark account Do Not Contact" onClick={() => skip(r, true)}><Ban size={12} /></button>
              </>)}
            </div>
          )}
        />
      </div>

      {review && review.draft && (
        <Modal title={`Follow-up · ${accName(review.accountId)}`} onClose={() => setReview(null)} lg
          footer={<>
            <button className="btn btn-sec" onClick={() => setReview(null)}>Cancel</button>
            <button className="btn btn-sec" onClick={() => skip(review)}><SkipForward size={14} />Skip</button>
            <button className="btn btn-primary" onClick={approveAndSend} disabled={sending}>
              <Send size={14} />{sending ? "Sending…" : `Approve & send to ${contactOf(review.contactId)?.email || "?"}`}
            </button>
          </>}>
          {/* CRM summary — the agent's §2 working notes, never sent */}
          <div style={{ background: "var(--s2)", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12.5 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: "var(--text3)", marginBottom: 6 }}>
              Agent's context (internal — not part of the email)
            </div>
            {summary.lastDiscussed && <div><b>Last discussed:</b> {summary.lastDiscussed}</div>}
            {summary.customerNeeded && <div><b>Customer needed:</b> {summary.customerNeeded}</div>}
            {summary.latestCommitment && <div><b>Latest commitment:</b> {summary.latestCommitment}</div>}
            {(summary.pendingActions || []).length > 0 && <div><b>Pending:</b> {summary.pendingActions.join("; ")}</div>}
            {review.draft.reasoning && <div style={{ marginTop: 4, color: "var(--text3)" }}>{review.draft.reasoning}</div>}
            {(review.draft.riskFlags || []).length > 0 && (
              <div style={{ marginTop: 6, color: "#B45309", fontWeight: 600 }}>
                ⚠ {review.draft.riskFlags.join(" · ")}
              </div>
            )}
          </div>

          <div className="form-row full"><div className="form-group"><label>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} />
            <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(review.draft.subjectOptions || []).map((s, i) => (
                <button key={i} type="button" className="btn btn-sm btn-sec" style={{ fontSize: 11 }} onClick={() => setSubject(s)}>{s}</button>
              ))}
            </div>
          </div></div>
          <div className="form-row full"><div className="form-group"><label>Email body (edit freely — this exact text is sent)</label>
            <textarea rows={10} value={draftBody} onChange={e => setDraftBody(e.target.value)} style={{ fontSize: 13, lineHeight: 1.5 }} />
          </div></div>
          {review.draft.followupDate && (
            <div style={{ fontSize: 11.5, color: "var(--text3)", display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={12} /> Suggested follow-up if no reply: {fmt.date(review.draft.followupDate)}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

export default ReEngagement;
