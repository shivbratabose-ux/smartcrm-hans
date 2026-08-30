// ═══════════════════════════════════════════════════════════════════
// Email Agent — review queue for communication@hansinfomatic.com
// ═══════════════════════════════════════════════════════════════════
// Module B (E1) of the CRM AI Agents. Rows come straight from the
// em_processed table (RLS-scoped: reps see their own, global roles see
// all) — deliberately NOT part of the JSONB app state or its
// localStorage mirror. What a row shows is everything the agent kept:
// summary metadata only, never the email (see add_email_agent_v1.sql).
//
// E1 actions: filter by queue, open the linked activity context, re-link
// a mismatched row to the right record, ignore noise. Suggested field
// changes (em_suggested_updates) get their approval UI in E3.
import { useState, useEffect, useMemo, useCallback } from "react";
import { Inbox, RefreshCw, Link2, EyeOff, ShieldAlert, PauseCircle, PlayCircle, ChevronDown } from "lucide-react";
import { loadEmailAgentQueue, reviewEmailActivity, loadAgentConfig, saveAgentConfig, isSupabaseConfigured } from "../lib/db";
import { fmt } from "../utils/helpers";
import { Modal, Empty, UserPill, TypeaheadSelect, PageTip } from "./shared";
import { notify } from "../utils/toast";
import DataGrid from "./DataGrid";

function SortIcon({ col, sortKey, sortDir }) {
  if (col !== sortKey) return <ChevronDown size={12} style={{ opacity: 0.3 }} />;
  return <ChevronDown size={12} style={{ transform: sortDir === "asc" ? "rotate(180deg)" : "none", opacity: 0.8 }} />;
}

const STATUS_META = {
  processed:         { label: "Processed",        color: "#15803D", bg: "#DCFCE7" },
  needs_match:       { label: "Needs match",      color: "#B45309", bg: "#FEF3C7" },
  suggested:         { label: "Suggested changes",color: "#1D4ED8", bg: "#DBEAFE" },
  unmatched:         { label: "Unmatched",        color: "#B91C1C", bg: "#FEE2E2" },
  high_impact:       { label: "Approval needed",  color: "#7C3AED", bg: "#F3E8FF" },
  duplicate:         { label: "Duplicate",        color: "#64748B", bg: "#F1F5F9" },
  unverified_sender: { label: "Unverified sender",color: "#B91C1C", bg: "#FEE2E2" },
  failed:            { label: "Failed",           color: "#B91C1C", bg: "#FEE2E2" },
  ignored:           { label: "Ignored",          color: "#64748B", bg: "#F1F5F9" },
};
const QUEUES = ["All", "processed", "needs_match", "unmatched", "high_impact", "unverified_sender", "failed", "ignored"];

function EmailAgent({ accounts = [], contacts = [], opps = [], leads = [], activities = [], orgUsers = [], currentUser }) {
  const [rows, setRows] = useState([]);
  const [loadErr, setLoadErr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [queueF, setQueueF] = useState("All");
  const [relink, setRelink] = useState(null);       // row being re-linked
  const [relinkTo, setRelinkTo] = useState({ type: "account", id: "" });
  const [config, setConfig] = useState(null);
  const [sortKey, setSortKey] = useState("processedAt");
  const [sortDir, setSortDir] = useState("desc");
  const toggleSort = (k) => { if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortKey(k); setSortDir("asc"); } };

  const isAdmin = useMemo(() => {
    const r = (orgUsers.find(u => u.id === currentUser)?.role || "").toLowerCase();
    return ["admin", "md", "director"].includes(r);
  }, [orgUsers, currentUser]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { rows: r, error } = await loadEmailAgentQueue();
    setRows(r); setLoadErr(error); setLoading(false);
    const { config: c } = await loadAgentConfig();
    setConfig(c);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const entityName = (type, id) => {
    if (!id) return "";
    if (type === "account") return accounts.find(a => a.id === id)?.name || id;
    if (type === "contact") return contacts.find(c => c.id === id)?.name || id;
    if (type === "opp") return opps.find(o => o.id === id)?.title || id;
    if (type === "lead") return leads.find(l => l.id === id)?.company || id;
    return id;
  };
  const activityNotes = (id) => activities.find(a => a.id === id)?.notes || "";

  const filtered = useMemo(() =>
    queueF === "All" ? rows : rows.filter(r => r.status === queueF), [rows, queueF]);

  const sortVal = (r, k) => {
    switch (k) {
      case "entity": return entityName(r.matchedEntityType, r.matchedEntityId);
      case "sender": return orgUsers.find(u => u.id === r.senderUserId)?.name || "";
      case "matchConfidence": case "extractConfidence": return Number(r[k]) || 0;
      default: return r[k] ?? "";
    }
  };
  const sorted = useMemo(() => {
    const f = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = sortVal(a, sortKey), vb = sortVal(b, sortKey);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * f;
      return String(va).localeCompare(String(vb)) * f;
    });
  }, [filtered, sortKey, sortDir, accounts, contacts, opps, leads, orgUsers]);

  const counts = useMemo(() => {
    const c = {};
    rows.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [rows]);

  const doRelink = async () => {
    if (!relink || !relinkTo.id) return;
    const { error } = await reviewEmailActivity(relink.fingerprint,
      { status: "processed", matchedEntityType: relinkTo.type, matchedEntityId: relinkTo.id }, currentUser);
    if (error) { notify.error(`Couldn't save: ${error}`); return; }
    notify.success("Linked. The activity association is recorded.");
    setRelink(null); refresh();
  };
  const doIgnore = async (row) => {
    const { error } = await reviewEmailActivity(row.fingerprint, { status: "ignored" }, currentUser);
    if (error) { notify.error(`Couldn't save: ${error}`); return; }
    refresh();
  };
  const togglePause = async () => {
    if (!config) return;
    const { error } = await saveAgentConfig({ em_paused: !config.em_paused }, currentUser);
    if (error) { notify.error(`Couldn't update: ${error}`); return; }
    notify.success(config.em_paused ? "Email agent resumed." : "Email agent PAUSED — no mail will be processed.");
    refresh();
  };

  const relinkOptions = useMemo(() => {
    if (relinkTo.type === "account") return accounts.filter(a => !a.isDeleted).map(a => ({ value: a.id, label: a.name, sub: a.country || "" }));
    if (relinkTo.type === "contact") return contacts.filter(c => !c.isDeleted).map(c => ({ value: c.id, label: c.name, sub: c.email || "" }));
    if (relinkTo.type === "opp") return opps.filter(o => !o.isDeleted).map(o => ({ value: o.id, label: o.title, sub: o.oppNo || "" }));
    return leads.filter(l => !l.isDeleted).map(l => ({ value: l.id, label: l.company, sub: l.leadId || "" }));
  }, [relinkTo.type, accounts, contacts, opps, leads]);

  if (!isSupabaseConfigured) {
    return (
      <div>
        <div className="pg-head"><div><div className="pg-title">Email Agent</div></div></div>
        <div className="card"><Empty icon={<Inbox size={22} />} title="Cloud connection required"
          sub="The email agent's queue lives in Supabase. Configure VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY to use this page." /></div>
      </div>
    );
  }

  return (
    <div>
      <PageTip id="emailagent-tip" title="How this works"
        text="CC or forward any business email to communication@hansinfomatic.com. The agent verifies you, summarises the email into a CRM activity, and links it to the right record. Only the summary is stored — never the email itself. Rows land here when the agent needs your confirmation." />
      <div className="pg-head">
        <div>
          <div className="pg-title">Email Agent</div>
          <div className="pg-sub">
            {rows.length} email{rows.length === 1 ? "" : "s"} processed · {counts.needs_match || 0} need matching · {counts.unmatched || 0} unmatched
            {config && !config.em_enabled && <span style={{ color: "var(--red)", fontWeight: 700 }}> · agent disabled</span>}
            {config?.em_paused && <span style={{ color: "var(--red)", fontWeight: 700 }}> · PAUSED</span>}
          </div>
        </div>
        <div className="pg-actions" style={{ display: "flex", gap: 8 }}>
          {isAdmin && config?.em_enabled && (
            <button className={`btn ${config?.em_paused ? "btn-green" : "btn-sec"}`} onClick={togglePause}
              title="Emergency pause — the poller checks this before touching any mail">
              {config?.em_paused ? <><PlayCircle size={14} />Resume agent</> : <><PauseCircle size={14} />Pause agent</>}
            </button>
          )}
          <button className="btn btn-sec" onClick={refresh}><RefreshCw size={14} />Refresh</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {QUEUES.map(q => (
          <button key={q} className={`btn btn-sm ${queueF === q ? "btn-primary" : "btn-sec"}`}
            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6 }} onClick={() => setQueueF(q)}>
            {q === "All" ? `All (${rows.length})` : `${STATUS_META[q]?.label || q} (${counts[q] || 0})`}
          </button>
        ))}
      </div>

      {loadErr && loadErr !== "not-configured" && (
        <div className="card" style={{ padding: 14, marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <ShieldAlert size={16} style={{ color: "var(--red)" }} />
          <span style={{ fontSize: 12.5 }}>Couldn't load the queue: {loadErr}. Has add_email_agent_v1.sql been run?</span>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <DataGrid
          dense
          module="email_agent_queue"
          userId={currentUser}
          columns={[
            { key: "processedAt", label: "Processed", defaultWidth: 150,
              render: r => <span style={{ fontSize: 12 }}>{fmt.date(r.processedAt)} {String(r.processedAt || "").slice(11, 16)}</span> },
            { key: "status", label: "Queue", defaultWidth: 130,
              render: r => { const m = STATUS_META[r.status] || { label: r.status, color: "#64748B", bg: "#F1F5F9" };
                return <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, color: m.color, background: m.bg }}>{m.label}</span>; } },
            { key: "sender", label: "Sent by", defaultWidth: 140, render: r => r.senderUserId ? <UserPill uid={r.senderUserId} /> : <span style={{ color: "var(--text3)" }}>—</span> },
            { key: "direction", label: "Dir", defaultWidth: 80, render: r => r.direction || <span style={{ color: "var(--text3)" }}>—</span> },
            { key: "entity", label: "Linked record", defaultWidth: 220,
              render: r => r.matchedEntityId
                ? <span style={{ fontSize: 12, fontWeight: 600 }}>{entityName(r.matchedEntityType, r.matchedEntityId)}<span style={{ fontSize: 10, color: "var(--text3)", marginLeft: 5 }}>{r.matchedEntityType}</span></span>
                : <span style={{ color: "var(--text3)" }}>—</span> },
            { key: "summary", label: "Activity summary", defaultWidth: 320, wrap: true, sortable: false,
              render: r => <span style={{ fontSize: 12, color: "var(--text2)" }}>{r.activityId ? activityNotes(r.activityId) || "(activity created)" : (r.error || "—")}</span> },
            { key: "intent", label: "Intent", defaultWidth: 150, sortable: false,
              render: r => (Array.isArray(r.intent) && r.intent.length) ? <span style={{ fontSize: 11 }}>{r.intent.slice(0, 2).join(", ")}</span> : <span style={{ color: "var(--text3)" }}>—</span> },
            { key: "matchConfidence", label: "Match", defaultWidth: 80,
              render: r => <span style={{ fontWeight: 700, color: (r.matchConfidence || 0) >= 0.9 ? "#15803D" : (r.matchConfidence || 0) >= 0.7 ? "#B45309" : "var(--text3)" }}>{Math.round((r.matchConfidence || 0) * 100)}%</span> },
            { key: "attachmentOmitted", label: "Attach", defaultWidth: 80, sortable: false,
              render: r => r.attachmentOmitted ? <span title="This email contained an attachment that was not captured or analysed" style={{ fontSize: 10.5, color: "var(--text3)" }}>omitted</span> : null },
          ]}
          defaultColumnConfig={[
            { key: "processedAt", visible: true, width: 150 }, { key: "status", visible: true, width: 130 },
            { key: "sender", visible: true, width: 140 }, { key: "direction", visible: false, width: 80 },
            { key: "entity", visible: true, width: 220 }, { key: "summary", visible: true, width: 320 },
            { key: "intent", visible: true, width: 150 }, { key: "matchConfidence", visible: true, width: 80 },
            { key: "attachmentOmitted", visible: false, width: 80 },
          ]}
          rows={sorted}
          rowKey={r => r.fingerprint}
          sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} SortIcon={SortIcon}
          emptyState={<Empty icon={<Inbox size={22} />}
            title={loading ? "Loading…" : "No emails yet"}
            sub={loading ? "" : "CC communication@hansinfomatic.com on any business email and it appears here."} />}
          rowActions={r => (
            <div style={{ display: "flex", gap: 6 }}>
              {["needs_match", "unmatched"].includes(r.status) && (
                <button className="btn btn-sm btn-sec" style={{ fontSize: 11 }} title="Link to the right CRM record"
                  onClick={() => { setRelink(r); setRelinkTo({ type: r.matchCandidates?.[0]?.type || "account", id: "" }); }}>
                  <Link2 size={12} />Link
                </button>
              )}
              {r.status !== "ignored" && r.status !== "processed" && (
                <button className="btn btn-sm btn-sec" style={{ fontSize: 11 }} title="Ignore this email (noise, misdirected)"
                  onClick={() => doIgnore(r)}><EyeOff size={12} /></button>
              )}
            </div>
          )}
        />
      </div>

      {relink && (
        <Modal title="Link email activity to a record" onClose={() => setRelink(null)}
          footer={<><button className="btn btn-sec" onClick={() => setRelink(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={doRelink} disabled={!relinkTo.id}><Link2 size={14} />Link record</button></>}>
          {Array.isArray(relink.matchCandidates) && relink.matchCandidates.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", marginBottom: 6 }}>Agent's candidates</div>
              {relink.matchCandidates.map((c, i) => (
                <button key={i} className="btn btn-sm btn-sec" style={{ marginRight: 6, marginBottom: 6, fontSize: 11.5 }}
                  onClick={() => setRelinkTo({ type: c.type, id: c.id })}>
                  {entityName(c.type, c.id)} <span style={{ color: "var(--text3)" }}>· {c.basis} · {Math.round((c.confidence || 0) * 100)}%</span>
                </button>
              ))}
            </div>
          )}
          <div className="form-row">
            <div className="form-group"><label>Record type</label>
              <select value={relinkTo.type} onChange={e => setRelinkTo({ type: e.target.value, id: "" })}>
                <option value="account">Account</option><option value="contact">Contact</option>
                <option value="opp">Opportunity</option><option value="lead">Lead</option>
              </select>
            </div>
            <div className="form-group"><label>Record</label>
              <TypeaheadSelect value={relinkTo.id} onChange={id => setRelinkTo(t => ({ ...t, id }))}
                options={relinkOptions} placeholder="Search…" />
            </div>
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 8 }}>
            Linking records your choice against this email's metadata. The stored summary doesn't change; the agent learns nothing else about the email — its content was never kept.
          </p>
        </Modal>
      )}
    </div>
  );
}

export default EmailAgent;
