import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Gavel, Briefcase, RefreshCw, LifeBuoy, LayoutDashboard } from "lucide-react";
import { fmt, today } from "../utils/helpers";
import { UserPill } from "./shared";

const daysFromToday = (d) => d ? Math.round((new Date(d) - new Date(today)) / 864e5) : null;
const CLOSED = ["Won", "Lost", "closed_won", "closed_lost"];
const isOpen = (o) => !CLOSED.includes(o.stage);

const KPI = ({ label, value, sub, accent }) => (
  <div style={{ background: "#1B6B5A", borderRadius: 10, padding: "13px 16px", color: "white", flex: 1, minWidth: 150 }}>
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.8 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Outfit',sans-serif", marginTop: 2, color: accent || "white" }}>{value}</div>
    {sub && <div style={{ fontSize: 11, opacity: 0.75, marginTop: 1 }}>{sub}</div>}
  </div>
);
const Card = ({ title, children, action }) => (
  <div className="card" style={{ padding: 18 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>{action}
    </div>
    {children}
  </div>
);
const ListRow = ({ left, sub, right, rightColor }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", gap: 10 }}>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{left}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text3)" }}>{sub}</div>}
    </div>
    <div style={{ fontSize: 12, fontWeight: 700, color: rightColor || "var(--text2)", whiteSpace: "nowrap" }}>{right}</div>
  </div>
);
const Empty = ({ msg }) => <div style={{ fontSize: 12, color: "var(--text3)", padding: "10px 0" }}>{msg}</div>;
const PIE = ["#1B6B5A", "#3B82F6", "#F59E0B", "#8B5CF6", "#EF4444", "#0D9488", "#64748B"];

function Dashboards({ accounts = [], opps = [], projects = [], contracts = [], tickets = [], quotes = [], orgUsers = [], currentUser, setPage }) {
  const [tab, setTab] = useState("management");
  const accName = (id) => accounts.find(a => a.id === id)?.name || "—";

  const tenders = useMemo(() => opps.filter(o => !o.isDeleted && o.isTender), [opps]);

  // ── Management ──
  const mgmt = useMemo(() => {
    const open = opps.filter(o => !o.isDeleted && isOpen(o));
    const totalPipe = open.reduce((s, o) => s + (+o.value || 0), 0);
    const weighted = open.reduce((s, o) => s + (+o.value || 0) * (+o.probability || 0) / 100, 0);
    const won = opps.filter(o => !o.isDeleted && (o.stage === "Won" || o.stage === "closed_won"));
    const lost = opps.filter(o => !o.isDeleted && (o.stage === "Lost" || o.stage === "closed_lost"));
    const winRate = won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) : 0;
    const tWon = tenders.filter(o => o.stage === "Won" || o.stage === "closed_won").length;
    const tLost = tenders.filter(o => o.stage === "Lost" || o.stage === "closed_lost").length;
    const bidSuccess = tWon + tLost ? Math.round(tWon / (tWon + tLost) * 100) : 0;
    const tenderValue = tenders.filter(isOpen).reduce((s, o) => s + (+o.value || 0), 0);
    const renewalPipe = open.filter(o => o.upsellFlag || /upsell|renewal/i.test(o.source || "")).reduce((s, o) => s + (+o.value || 0), 0);
    return { totalPipe, weighted, winRate, bidSuccess, tenderValue, renewalPipe, openCount: open.length };
  }, [opps, tenders]);

  // ── Tender ──
  const tenderData = useMemo(() => {
    const openT = tenders.filter(isOpen);
    const upcoming = openT.filter(o => o.submissionDate && daysFromToday(o.submissionDate) >= 0)
      .sort((a, b) => (a.submissionDate || "").localeCompare(b.submissionDate || "")).slice(0, 6);
    const byDecision = {};
    tenders.forEach(o => { const d = o.bidDecision || "Not Decided"; byDecision[d] = (byDecision[d] || 0) + 1; });
    const byStage = {};
    openT.forEach(o => { byStage[o.stage] = (byStage[o.stage] || 0) + 1; });
    return {
      activeCount: openT.length,
      value: openT.reduce((s, o) => s + (+o.value || 0), 0),
      submitted: tenders.filter(o => o.bidApprovalStatus === "Approved").length,
      upcoming,
      decision: Object.entries(byDecision).map(([name, value]) => ({ name, value })),
      stages: Object.entries(byStage).map(([name, value]) => ({ name, value })),
    };
  }, [tenders]);

  // ── Project ──
  const projData = useMemo(() => {
    const live = projects.filter(p => !p.isDeleted);
    const health = (p) => {
      if (p.status === "Closed") return "Completed";
      if (p.status === "On Hold") return "On Hold";
      if (p.goLiveTarget && p.goLiveTarget < today && (+p.progress || 0) < 100) return "Delayed";
      const d = daysFromToday(p.goLiveTarget);
      if (d !== null && d >= 0 && d <= 30 && (+p.progress || 0) < 70) return "At Risk";
      return "On Track";
    };
    const withHealth = live.map(p => ({ ...p, _h: health(p) }));
    const active = withHealth.filter(p => p.status !== "Closed");
    const delayed = withHealth.filter(p => p._h === "Delayed");
    // resource utilization: active projects per member (owner + team)
    const load = {};
    active.forEach(p => {
      const ids = new Set([p.owner, ...(p.team || []).map(t => t.userId)].filter(Boolean));
      ids.forEach(id => { load[id] = (load[id] || 0) + 1; });
    });
    const util = Object.entries(load).map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n).slice(0, 6);
    return {
      active: active.length,
      onTrack: withHealth.filter(p => p._h === "On Track").length,
      atRisk: withHealth.filter(p => p._h === "At Risk").length,
      delayed, util,
      avgProgress: active.length ? Math.round(active.reduce((s, p) => s + (+p.progress || 0), 0) / active.length) : 0,
    };
  }, [projects]);

  // ── Renewal ──
  const renewalData = useMemo(() => {
    const todayMid = new Date(today);
    const cut = new Date(todayMid); cut.setDate(cut.getDate() + 90);
    const due = contracts.filter(c => !c.isDeleted && (c.status === "Active" || c.status === "Live") && c.endDate
      && new Date(c.endDate) >= todayMid && new Date(c.endDate) <= cut)
      .sort((a, b) => (a.endDate || "").localeCompare(b.endDate || ""));
    const expansion = opps.filter(o => !o.isDeleted && isOpen(o) && (o.upsellFlag || /upsell|renewal/i.test(o.source || "")));
    return {
      due, expansion,
      dueValue: due.reduce((s, c) => s + (+c.value || 0), 0),
      autoOn: contracts.filter(c => !c.isDeleted && c.autoRenewal === "Yes").length,
      expansionValue: expansion.reduce((s, o) => s + (+o.value || 0), 0),
    };
  }, [contracts, opps]);

  // ── Support ──
  const supportData = useMemo(() => {
    const live = tickets.filter(t => !t.isDeleted);
    const open = live.filter(t => !["Resolved", "Closed"].includes(t.status));
    const critical = open.filter(t => t.priority === "Critical").length;
    const breached = open.filter(t => t.sla && t.sla < today).length;
    const compliance = open.length ? Math.round((open.length - breached) / open.length * 100) : 100;
    const byStatus = {};
    live.forEach(t => { byStatus[t.status] = (byStatus[t.status] || 0) + 1; });
    return {
      open: open.length, critical, breached, compliance,
      status: Object.entries(byStatus).map(([name, value]) => ({ name, value })),
      breachedList: open.filter(t => t.sla && t.sla < today).slice(0, 6),
    };
  }, [tickets]);

  const TABS = [
    { id: "management", label: "Management", icon: <LayoutDashboard size={14}/> },
    { id: "tender", label: "Tender", icon: <Gavel size={14}/> },
    { id: "project", label: "Project", icon: <Briefcase size={14}/> },
    { id: "renewal", label: "Renewal", icon: <RefreshCw size={14}/> },
    { id: "support", label: "Support", icon: <LifeBuoy size={14}/> },
  ];

  return (
    <div>
      <div className="pg-head"><div><div className="pg-title">Dashboards</div><div className="pg-sub">Management · Tender · Project · Renewal · Support</div></div></div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 16, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 16px", fontSize: 13, fontWeight: 600,
            background: "transparent", border: "none", cursor: "pointer",
            color: tab === t.id ? "var(--brand)" : "var(--text3)",
            borderBottom: tab === t.id ? "2px solid var(--brand)" : "2px solid transparent", marginBottom: -1,
          }}>{t.icon}{t.label}</button>
        ))}
      </div>

      {/* ── Management ── */}
      {tab === "management" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <KPI label="Total Pipeline" value={`₹${mgmt.totalPipe.toFixed(1)}L`} sub={`${mgmt.openCount} open deals`} />
            <KPI label="Revenue Forecast" value={`₹${mgmt.weighted.toFixed(1)}L`} sub="Weighted pipeline" />
            <KPI label="Tender Value" value={`₹${mgmt.tenderValue.toFixed(1)}L`} sub={`${tenders.filter(isOpen).length} active tenders`} />
            <KPI label="Win Rate" value={`${mgmt.winRate}%`} sub="All deals" />
            <KPI label="Bid Success" value={`${mgmt.bidSuccess}%`} sub="Tenders won/decided" />
            <KPI label="Renewal/Expansion" value={`₹${mgmt.renewalPipe.toFixed(1)}L`} sub="In pipeline" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Card title="Active Tenders by Stage">
              {tenderData.stages.length === 0 ? <Empty msg="No active tenders."/> : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={tenderData.stages}><XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}/><YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false}/><Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }}/><Bar dataKey="value" fill="#1B6B5A" radius={[4, 4, 0, 0]}/></BarChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card title="Bid Decisions">
              {tenderData.decision.length === 0 ? <Empty msg="No tenders yet."/> : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart><Pie data={tenderData.decision} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, value }) => `${name}: ${value}`}>{tenderData.decision.map((d, i) => <Cell key={i} fill={PIE[i % PIE.length]}/>)}</Pie><Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }}/></PieChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ── Tender ── */}
      {tab === "tender" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <KPI label="Active Bids" value={tenderData.activeCount} sub="Open tenders" />
            <KPI label="Tender Value" value={`₹${tenderData.value.toFixed(1)}L`} sub="Active bid value" />
            <KPI label="Bid-Approved" value={tenderData.submitted} sub="Cleared bid approval" />
            <KPI label="Upcoming Deadlines" value={tenderData.upcoming.length} sub="Submissions ahead" accent={tenderData.upcoming.length ? "#FDE68A" : "white"} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Card title="Upcoming Bid Deadlines" action={<button className="btn btn-sec btn-xs" onClick={() => setPage("pipeline")}>Pipeline</button>}>
              {tenderData.upcoming.length === 0 ? <Empty msg="No upcoming bid submissions."/> : tenderData.upcoming.map(o => {
                const d = daysFromToday(o.submissionDate);
                return <ListRow key={o.id} left={o.title} sub={`${o.tenderAuthority || accName(o.accountId)} · ${o.tenderNo || ""}`} right={`${d}d`} rightColor={d <= 3 ? "#DC2626" : d <= 7 ? "#B45309" : "var(--text2)"}/>;
              })}
            </Card>
            <Card title="Qualification / Decision">
              {tenderData.decision.length === 0 ? <Empty msg="No tenders."/> : tenderData.decision.map(d => (
                <ListRow key={d.name} left={d.name} right={d.value}/>
              ))}
            </Card>
          </div>
        </div>
      )}

      {/* ── Project ── */}
      {tab === "project" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <KPI label="Active Projects" value={projData.active} sub="In delivery" />
            <KPI label="Avg Progress" value={`${projData.avgProgress}%`} sub="Across active" />
            <KPI label="At Risk" value={projData.atRisk} sub="Tight timeline" accent={projData.atRisk ? "#FDE68A" : "white"} />
            <KPI label="Delayed" value={projData.delayed.length} sub="Past go-live" accent={projData.delayed.length ? "#FCA5A5" : "white"} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Card title="Delayed Projects" action={<button className="btn btn-sec btn-xs" onClick={() => setPage("projects")}>Projects</button>}>
              {projData.delayed.length === 0 ? <Empty msg="No delayed projects 🎉"/> : projData.delayed.slice(0, 6).map(p => (
                <ListRow key={p.id} left={p.name} sub={`${accName(p.accountId)} · ${p.status}`} right={p.goLiveTarget ? fmt.short(p.goLiveTarget) : "—"} rightColor="#DC2626"/>
              ))}
            </Card>
            <Card title="Resource Utilization (active projects)">
              {projData.util.length === 0 ? <Empty msg="No active assignments."/> : projData.util.map(u => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ flex: 1, minWidth: 0 }}><UserPill uid={u.id}/></div>
                  <div style={{ width: 120, height: 8, background: "var(--s3)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, u.n / 5 * 100)}%`, height: "100%", background: u.n >= 4 ? "#EF4444" : u.n >= 3 ? "#F59E0B" : "#1B6B5A" }}/>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, minWidth: 60, textAlign: "right" }}>{u.n} project{u.n > 1 ? "s" : ""}</span>
                </div>
              ))}
            </Card>
          </div>
        </div>
      )}

      {/* ── Renewal ── */}
      {tab === "renewal" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <KPI label="Renewals Due (90d)" value={renewalData.due.length} sub={`₹${renewalData.dueValue.toFixed(1)}L`} accent={renewalData.due.length ? "#FDE68A" : "white"} />
            <KPI label="Auto-Renew On" value={renewalData.autoOn} sub="Contracts" />
            <KPI label="Expansion Opps" value={renewalData.expansion.length} sub={`₹${renewalData.expansionValue.toFixed(1)}L pipeline`} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Card title="Upcoming Renewals (next 90 days)" action={<button className="btn btn-sec btn-xs" onClick={() => setPage("contracts")}>Contracts</button>}>
              {renewalData.due.length === 0 ? <Empty msg="No renewals due in 90 days."/> : renewalData.due.slice(0, 7).map(c => {
                const d = daysFromToday(c.endDate);
                return <ListRow key={c.id} left={c.title || c.contractNo} sub={`${accName(c.accountId)} · ₹${c.value || 0}L`} right={`${d}d`} rightColor={d <= 30 ? "#DC2626" : "var(--text2)"}/>;
              })}
            </Card>
            <Card title="Expansion / Upsell Opportunities" action={<button className="btn btn-sec btn-xs" onClick={() => setPage("pipeline")}>Pipeline</button>}>
              {renewalData.expansion.length === 0 ? <Empty msg="No expansion opportunities yet."/> : renewalData.expansion.slice(0, 7).map(o => (
                <ListRow key={o.id} left={o.title} sub={`${accName(o.accountId)} · ${o.stage}`} right={`₹${o.value || 0}L`} rightColor="var(--brand)"/>
              ))}
            </Card>
          </div>
        </div>
      )}

      {/* ── Support ── */}
      {tab === "support" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <KPI label="Open Tickets" value={supportData.open} sub="Unresolved" />
            <KPI label="Critical" value={supportData.critical} sub="Open critical" accent={supportData.critical ? "#FCA5A5" : "white"} />
            <KPI label="SLA Compliance" value={`${supportData.compliance}%`} sub={`${supportData.breached} breached`} accent={supportData.compliance < 80 ? "#FCA5A5" : "white"} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Card title="Tickets by Status">
              {supportData.status.length === 0 ? <Empty msg="No tickets."/> : (
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart><Pie data={supportData.status} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={78} label={({ name, value }) => `${name}: ${value}`}>{supportData.status.map((d, i) => <Cell key={i} fill={PIE[i % PIE.length]}/>)}</Pie><Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }}/></PieChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card title="SLA-Breached (open)" action={<button className="btn btn-sec btn-xs" onClick={() => setPage("tickets")}>Tickets</button>}>
              {supportData.breachedList.length === 0 ? <Empty msg="No SLA breaches 🎉"/> : supportData.breachedList.map(t => (
                <ListRow key={t.id} left={t.title} sub={`${accName(t.accountId)} · ${t.priority}`} right={t.sla ? fmt.short(t.sla) : "—"} rightColor="#DC2626"/>
              ))}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
export default Dashboards;
