import React, { useState, useMemo, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from 'recharts';
import { Activity, TrendingUp, TrendingDown, AlertCircle, Plus, Calendar, ChevronDown, Users, Target, Phone, FileText, IndianRupee, Filter } from 'lucide-react';
import { PRODUCTS, PROD_MAP, STAGES, STAGE_PROB, TEAM, TEAM_MAP } from '../data/constants';
import { fmt, isFuture, isOverdue, today } from '../utils/helpers';
import { StatusBadge, ProdTag, PriorityBadge, UserPill } from './shared';

/* ── Date range helpers ── */
const daysBetween = (d1, d2) => Math.round((new Date(d2) - new Date(d1)) / 864e5);

const RANGE_PRESETS = [
  { key: "7d",   label: "Last 7 Days",     days: 7 },
  { key: "10d",  label: "Last 10 Days",    days: 10 },
  { key: "30d",  label: "Last 30 Days",    days: 30 },
  { key: "mtd",  label: "Month to Date",   days: null },
  { key: "qtd",  label: "Quarter to Date", days: null },
  { key: "6m",   label: "Last 6 Months",   days: 180 },
  { key: "1y",   label: "Last Year",       days: 365 },
  { key: "all",  label: "All Time",        days: null },
];

function getDateRange(key) {
  const now = new Date(today);
  const preset = RANGE_PRESETS.find(p => p.key === key);
  if (!preset) return { from: "2000-01-01", to: today };

  if (key === "all") return { from: "2000-01-01", to: today };
  if (key === "mtd") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return { from, to: today };
  }
  if (key === "qtd") {
    const qm = Math.floor(now.getMonth() / 3) * 3;
    const from = new Date(now.getFullYear(), qm, 1).toISOString().slice(0, 10);
    return { from, to: today };
  }
  const from = new Date(now.getTime() - preset.days * 864e5).toISOString().slice(0, 10);
  return { from, to: today };
}

const inRange = (dateStr, range) => {
  if (!dateStr) return false;
  return dateStr >= range.from && dateStr <= range.to;
};

/* ── Funnel stage order ── */
const FUNNEL_STAGES = ["Prospect", "Qualification", "Proposal", "Negotiation", "Won"];
const FUNNEL_COLORS = { Prospect: "#94A3B8", Qualification: "#3B82F6", Proposal: "#F59E0B", Negotiation: "#7C3AED", Won: "#22C55E" };

/* ── Component ── */
function Dashboard({ accounts, contacts, opps, tickets, activities, leads, callReports, collections, targets, setPage }) {
  const [rangeKey, setRangeKey] = useState("30d");
  const [showRangeMenu, setShowRangeMenu] = useState(false);

  const range = useMemo(() => getDateRange(rangeKey), [rangeKey]);
  const rangeLabel = RANGE_PRESETS.find(p => p.key === rangeKey)?.label || "Custom";

  // ─── Filtered data based on date range ───
  const fActivities = useMemo(() => activities.filter(a => inRange(a.date, range)), [activities, range]);
  const fCallReports = useMemo(() => (callReports || []).filter(r => inRange(r.callDate, range)), [callReports, range]);
  const fLeads = useMemo(() => (leads || []).filter(l => inRange(l.createdDate, range)), [leads, range]);

  // Deals that had activity in the period or were created/closed in the period
  const fOpps = useMemo(() => opps.filter(o =>
    inRange(o.closeDate, range) || fActivities.some(a => a.oppId === o.id || a.accountId === o.accountId)
  ), [opps, range, fActivities]);

  // ─── ALWAYS-CUMULATIVE KPIs (not date filtered) ───
  const totalArr = accounts.reduce((s, a) => s + a.arrRevenue, 0);
  const activeAccounts = accounts.filter(a => a.status === "Active").length;
  const totalContacts = contacts.length;
  const openDeals = opps.filter(o => !["Won", "Lost"].includes(o.stage));
  const weighted = openDeals.reduce((s, o) => s + (o.value * (STAGE_PROB[o.stage] || 0) / 100), 0);

  // ─── PERIOD KPIs (date filtered) ───
  const periodActivities = fActivities.length;
  const periodCalls = fActivities.filter(a => a.type === "Call").length;
  const periodMeetings = fActivities.filter(a => a.type === "Meeting").length;
  const periodEmails = fActivities.filter(a => a.type === "Email").length;
  const periodCompleted = fActivities.filter(a => a.status === "Completed").length;
  const completionRate = periodActivities > 0 ? Math.round(periodCompleted / periodActivities * 100) : 0;

  const periodWon = opps.filter(o => o.stage === "Won" && inRange(o.closeDate, range));
  const periodLost = opps.filter(o => o.stage === "Lost" && inRange(o.closeDate, range));
  const periodWonVal = periodWon.reduce((s, o) => s + o.value, 0);
  const periodTotalClosed = periodWon.length + periodLost.length;
  const periodWinRate = periodTotalClosed > 0 ? Math.round(periodWon.length / periodTotalClosed * 100) : 0;

  const newLeadsCount = fLeads.length;
  const periodCallReports = fCallReports.length;

  const overdue = activities.filter(a => a.status === "Planned" && isOverdue(a.date)).length;
  const openTix = tickets.filter(t => !["Resolved", "Closed"].includes(t.status)).length;
  const critTix = tickets.filter(t => t.priority === "Critical" && !["Resolved", "Closed"].includes(t.status)).length;

  // ─── Average deal cycle ───
  const avgDealCycle = useMemo(() => {
    const wonDeals = opps.filter(o => o.stage === "Won");
    const cycles = wonDeals.map(deal => {
      const dealActs = activities.filter(a => a.oppId === deal.id || a.accountId === deal.accountId);
      if (dealActs.length === 0) return null;
      const earliest = dealActs.reduce((min, a) => a.date < min ? a.date : min, dealActs[0].date);
      const diff = daysBetween(earliest, deal.closeDate || today);
      return diff > 0 ? diff : null;
    }).filter(Boolean);
    return cycles.length > 0 ? Math.round(cycles.reduce((s, c) => s + c, 0) / cycles.length) : 45;
  }, [opps, activities]);

  // ─── Pipeline funnel ───
  const funnelData = useMemo(() => {
    return FUNNEL_STAGES.map(stage => ({
      name: stage,
      count: opps.filter(o => o.stage === stage).length,
      value: opps.filter(o => o.stage === stage).reduce((s, o) => s + o.value, 0),
      fill: FUNNEL_COLORS[stage]
    }));
  }, [opps]);

  // ─── Revenue by product ───
  const productRevenue = useMemo(() => {
    const byProd = {};
    accounts.forEach(acc => {
      const share = acc.products.length > 0 ? acc.arrRevenue / acc.products.length : 0;
      acc.products.forEach(pid => {
        if (!byProd[pid]) byProd[pid] = 0;
        byProd[pid] += share;
      });
    });
    return Object.entries(byProd)
      .map(([pid, value]) => ({ name: PROD_MAP[pid]?.name || pid, value: parseFloat(value.toFixed(1)), color: PROD_MAP[pid]?.color || "#94A3B8" }))
      .sort((a, b) => b.value - a.value);
  }, [accounts]);

  // ─── Activity trend (last 7 periods) ───
  const activityTrend = useMemo(() => {
    const days = rangeKey === "7d" ? 7 : rangeKey === "10d" ? 10 : 7;
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(new Date(today).getTime() - i * 864e5);
      const ds = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", { weekday: "short" });
      const count = activities.filter(a => a.date === ds).length;
      data.push({ name: label, count });
    }
    return data;
  }, [activities, rangeKey]);

  // ─── Lead conversion funnel ───
  const leadFunnel = useMemo(() => {
    if (!leads || leads.length === 0) return [];
    const stages = ["New", "MQL", "SQL", "SAL"];
    return stages.map(s => ({
      name: s,
      count: leads.filter(l => l.stage === s || (s === "New" && !["MQL", "SQL", "SAL", "NA"].includes(l.stage))).length
    }));
  }, [leads]);

  // ─── Region performance ───
  const regionData = useMemo(() => {
    const regionMap = (acc) => {
      const country = acc.country || "";
      const city = (acc.city || "").toLowerCase();
      if (country === "India") {
        if (["mumbai", "pune", "ahmedabad", "surat", "goa"].some(c => city.includes(c))) return "West";
        if (["chennai", "bangalore", "bengaluru", "hyderabad", "kochi", "coimbatore"].some(c => city.includes(c))) return "South";
        if (["kolkata", "patna", "bhubaneswar", "guwahati", "ranchi"].some(c => city.includes(c))) return "East";
        return "North";
      }
      if (["South Africa", "Kenya", "Ethiopia", "Nigeria", "Egypt", "Morocco"].includes(country)) return "Africa";
      if (["UAE", "Saudi Arabia"].includes(country)) return "Middle East";
      return country || "Other";
    };
    const rMap = {};
    accounts.forEach(acc => {
      const region = regionMap(acc);
      if (!rMap[region]) rMap[region] = { arr: 0, deals: 0, potential: 0 };
      rMap[region].arr += acc.arrRevenue;
      rMap[region].potential += (acc.potential || 0);
      rMap[region].deals += opps.filter(o => o.accountId === acc.id && !["Won", "Lost"].includes(o.stage)).length;
    });
    return Object.entries(rMap)
      .map(([name, d]) => ({ name, ...d, arr: parseFloat(d.arr.toFixed(1)) }))
      .sort((a, b) => b.arr - a.arr)
      .slice(0, 4);
  }, [accounts, opps]);

  // ─── Sales velocity by vertical ───
  const velocityData = useMemo(() => {
    const byType = {};
    opps.forEach(o => {
      const acc = accounts.find(a => a.id === o.accountId);
      const type = acc?.type || "Other";
      if (!byType[type]) byType[type] = { days: [], count: 0, value: 0 };
      byType[type].count++;
      byType[type].value += o.value;
      const dealActs = activities.filter(a => a.oppId === o.id || a.accountId === o.accountId);
      if (dealActs.length > 0) {
        const earliest = dealActs.reduce((min, a) => a.date < min ? a.date : min, dealActs[0].date);
        const diff = Math.max(1, daysBetween(earliest, o.closeDate || today));
        byType[type].days.push(diff);
      }
    });
    return Object.entries(byType)
      .map(([name, d]) => ({ name, days: d.days.length > 0 ? Math.round(d.days.reduce((s, v) => s + v, 0) / d.days.length) : 30, deals: d.count, value: d.value }))
      .sort((a, b) => b.deals - a.deals)
      .slice(0, 5);
  }, [opps, accounts, activities]);

  // ─── Risk deals ───
  const riskDeal = useMemo(() => {
    const negotiationDeals = opps.filter(o => o.stage === "Negotiation");
    if (negotiationDeals.length === 0) return null;
    let worst = null, worstDays = 0;
    negotiationDeals.forEach(deal => {
      const dealActs = activities.filter(a => a.oppId === deal.id || a.accountId === deal.accountId).sort((a, b) => b.date.localeCompare(a.date));
      const lastActivity = dealActs[0]?.date || deal.closeDate || today;
      const stagnation = daysBetween(lastActivity, today);
      if (stagnation > worstDays) { worstDays = stagnation; worst = deal; }
    });
    if (!worst) return null;
    const acc = accounts.find(a => a.id === worst.accountId);
    return { title: worst.title, value: worst.value, account: acc?.name, days: worstDays };
  }, [opps, accounts, activities]);

  // ─── Target achievement ───
  const currentTargets = (targets || []).filter(t => t.period === "2026-Q1");
  const totalTarget = currentTargets.reduce((s, t) => s + t.targetValue, 0);
  const totalAchieved = currentTargets.reduce((s, t) => s + t.achievedValue, 0);
  const targetPct = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;
  const pipelineSurplus = totalTarget > 0 ? Math.round(((weighted - totalTarget) / totalTarget) * 100) : 0;

  // ─── Top deals ───
  const topDeals = [...opps].filter(o => !["Won", "Lost"].includes(o.stage)).sort((a, b) => b.value - a.value).slice(0, 5);

  // ─── Team performance ───
  const teamPerf = TEAM.filter(t => t.role !== "Tech Lead" && t.role !== "Support Engr").slice(0, 4).map(t => {
    const memberTargets = currentTargets.filter(ct => ct.owner === t.id);
    const achieved = memberTargets.reduce((s, ct) => s + ct.achievedValue, 0);
    const target = memberTargets.reduce((s, ct) => s + ct.targetValue, 0);
    const memberDeals = opps.filter(o => o.owner === t.id && !["Won", "Lost"].includes(o.stage)).length;
    const memberActivities = fActivities.filter(a => a.owner === t.id).length;
    return { id: t.id, name: t.name, role: t.role, initials: t.initials, achieved: parseFloat(achieved.toFixed(1)), target, deals: memberDeals, activities: memberActivities };
  });

  // ─── Pending collections ───
  const pendingCollection = (collections || []).reduce((s, c) => s + c.pendingAmount, 0);
  const overdueCollections = (collections || []).filter(c => c.pendingAmount > 0 && c.status === "Overdue").length;

  const COLORS = ["#1B6B5A", "#2563EB", "#7C3AED", "#D97706", "#0D9488", "#DC2626"];

  const KPI = ({ label, value, unit, sub, subColor, onClick }) => (
    <div style={{ background: "#1B6B5A", borderRadius: 12, padding: "18px 22px", color: "white", cursor: onClick ? "pointer" : "default", transition: "transform 0.15s", minWidth: 0 }} onClick={onClick}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "none"; }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Outfit',sans-serif", marginTop: 4 }}>
        {unit === "₹" && <span style={{ fontSize: 18, fontWeight: 600, opacity: 0.8 }}>₹</span>}{value}{unit === "Cr" && <span style={{ fontSize: 16, opacity: 0.7 }}> Cr</span>}{unit === "%" && <span style={{ fontSize: 18, opacity: 0.7 }}>%</span>}{unit === "d" && <span style={{ fontSize: 16, opacity: 0.7 }}> Days</span>}
      </div>
      {sub && <div style={{ fontSize: 11, marginTop: 4, opacity: 0.75, color: subColor || "inherit" }}>{sub}</div>}
    </div>
  );

  const MiniStat = ({ label, value, icon, color, onClick }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "var(--s1)", borderRadius: 10, cursor: onClick ? "pointer" : "default", border: "1px solid var(--border)", flex: 1 }} onClick={onClick}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: (color || "var(--brand)") + "18", color: color || "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Outfit',sans-serif" }}>{value}</div>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text3)" }}>{label}</div>
      </div>
    </div>
  );

  return (
    <div>
      {/* ──── HEADER + DATE FILTER ──── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="pg-title">Executive Dashboard</div>
          <div className="pg-sub">Strategic overview · {fmt.date(range.from)} – {fmt.date(range.to)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {overdue > 0 && <span style={{ background: "var(--red-bg)", color: "var(--red-t)", fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 6 }}>{overdue} overdue</span>}
          {critTix > 0 && <span style={{ background: "#FEF3C7", color: "#92400E", fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 6 }}>{critTix} critical tickets</span>}
        </div>
      </div>

      {/* ──── DATE RANGE PILLS ──── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        <Calendar size={14} style={{ color: "var(--text3)", marginRight: 2 }} />
        {RANGE_PRESETS.map(p => (
          <button key={p.key}
            className={`btn btn-sm ${rangeKey === p.key ? "btn-primary" : "btn-sec"}`}
            style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6 }}
            onClick={() => setRangeKey(p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ──── PRIMARY KPI ROW ──── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        <KPI label="Total ARR" value={totalArr} unit="Cr" sub={`${activeAccounts} active accounts`} onClick={() => setPage("accounts")} />
        <KPI label="Weighted Pipeline" value={parseFloat(weighted.toFixed(1))} unit="Cr" sub={`${openDeals.length} open deals`} onClick={() => setPage("pipeline")} />
        <KPI label="Avg Deal Cycle" value={avgDealCycle} unit="d" sub={`Target: ${Math.round(avgDealCycle * 0.8)}d`} />
        <KPI label="Win Rate" value={periodTotalClosed > 0 ? periodWinRate : Math.round(opps.filter(o => o.stage === "Won").length / Math.max(1, opps.filter(o => ["Won", "Lost"].includes(o.stage)).length) * 100)} unit="%" sub={periodTotalClosed > 0 ? `${periodWon.length}W / ${periodLost.length}L in period` : "All time"} />
      </div>

      {/* ──── SECONDARY STATS ROW ──── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <MiniStat label="Activities" value={periodActivities} icon={<Activity size={16} />} color="#2563EB" onClick={() => setPage("activities")} />
        <MiniStat label="Deals Won" value={periodWon.length} icon={<TrendingUp size={16} />} color="#22C55E" onClick={() => setPage("pipeline")} />
        <MiniStat label={`Won Value`} value={`₹${periodWonVal}Cr`} icon={<IndianRupee size={16} />} color="#1B6B5A" />
        <MiniStat label="New Leads" value={newLeadsCount || (leads || []).filter(l => l.stage !== "NA").length} icon={<Users size={16} />} color="#7C3AED" onClick={() => setPage("leads")} />
        <MiniStat label="Calls Logged" value={periodCallReports || fActivities.filter(a => a.type === "Call").length} icon={<Phone size={16} />} color="#D97706" onClick={() => setPage("callreports")} />
        <MiniStat label="Open Tickets" value={openTix} icon={<AlertCircle size={16} />} color={critTix > 0 ? "#DC2626" : "#94A3B8"} onClick={() => setPage("tickets")} />
      </div>

      {/* ──── ROW 2: PIPELINE FUNNEL + ACTIVITY TREND ──── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Pipeline Funnel</div>
            <button className="btn btn-sec btn-xs" onClick={() => setPage("pipeline")}>View All</button>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={funnelData} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v, name) => [name === "count" ? `${v} deals` : `₹${v}Cr`, name === "count" ? "Deals" : "Value"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {funnelData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 8 }}>
            {funnelData.map(f => (
              <div key={f.name} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Outfit',sans-serif" }}>₹{f.value}Cr</div>
                <div style={{ fontSize: 10, color: "var(--text3)" }}>{f.name}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="card-title">Activity Trend</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12 }}>
            {periodCompleted}/{periodActivities} completed · {completionRate}% completion rate
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={activityTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => [`${v} activities`]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="count" stroke="#1B6B5A" fill="#1B6B5A" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ──── ROW 3: REVENUE BY PRODUCT + EXECUTIVE INSIGHTS ──── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: 16, marginBottom: 18 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="card-title">Revenue by Product</div>
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie data={productRevenue} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                {productRevenue.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v) => `₹${v}Cr`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 4 }}>
            {productRevenue.map(p => (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                <span style={{ color: "var(--text2)" }}>{p.name}</span>
                <span style={{ fontWeight: 700 }}>₹{p.value}Cr</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 18 }}>✦</span>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Executive Insights</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text3)", letterSpacing: "0.06em" }}>GROWTH FORECAST</div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 4, lineHeight: 1.5 }}>
                Pipeline velocity suggests a <strong style={{ color: pipelineSurplus > 0 ? "var(--green-t)" : "var(--red-t)" }}>{Math.abs(pipelineSurplus)}% {pipelineSurplus > 0 ? "surplus" : "gap"}</strong> in Q4 targets if conversion rate holds.
              </div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text3)", letterSpacing: "0.06em" }}>TARGET ATTAINMENT</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <div style={{ flex: 1, height: 8, background: "var(--s3)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${Math.min(100, targetPct)}%`, height: "100%", background: targetPct >= 80 ? "#22C55E" : targetPct >= 50 ? "#F59E0B" : "#EF4444", borderRadius: 4, transition: "width 0.5s" }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text1)" }}>{targetPct}%</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>₹{totalAchieved.toFixed(1)}Cr / ₹{totalTarget.toFixed(1)}Cr</div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "var(--text3)", letterSpacing: "0.06em" }}>RISK ALERT</div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 4, lineHeight: 1.5 }}>
                {riskDeal
                  ? <><strong>{riskDeal.account}</strong> — "{riskDeal.title}" (₹{riskDeal.value}Cr) stalled for <span style={{ color: "var(--red-t)", fontWeight: 700 }}>{riskDeal.days} days</span> in Negotiation.</>
                  : "No significant stagnation detected in current pipeline."}
              </div>
              {pendingCollection > 0 && (
                <div style={{ marginTop: 12, padding: "10px 12px", background: "#FEF3C7", borderRadius: 8, fontSize: 12 }}>
                  <strong style={{ color: "#92400E" }}>Collections:</strong> <span style={{ color: "#92400E" }}>₹{pendingCollection}Cr pending{overdueCollections > 0 && ` (${overdueCollections} overdue)`}</span>
                </div>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => setPage("reports")} style={{ marginTop: 12 }}>FULL REPORT →</button>
            </div>
          </div>
        </div>
      </div>

      {/* ──── ROW 4: REGIONAL + SALES VELOCITY ──── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="card-title">Regional Performance</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginTop: 12 }}>
            {regionData.map((r, i) => (
              <div key={r.name} style={{ padding: 14, background: i === 0 ? "#1B6B5A" : "var(--s1)", borderRadius: 10, color: i === 0 ? "white" : "var(--text1)" }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", opacity: i === 0 ? 0.8 : 0.6 }}>{r.name}</div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Outfit',sans-serif", marginTop: 4 }}>₹{r.arr}Cr</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{r.deals} deals · ₹{r.potential}Cr potential</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="card-title">Sales Velocity by Vertical</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={velocityData} layout="vertical" barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={110} />
              <Tooltip formatter={(v) => `${v} days avg`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="days" fill="#1B6B5A" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ──── ROW 5: TOP DEALS + TEAM PERFORMANCE ──── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Top Strategic Deals</div>
            <button className="btn btn-sec btn-xs" onClick={() => setPage("pipeline")}>View All</button>
          </div>
          {topDeals.map(o => {
            const acc = accounts.find(a => a.id === o.accountId);
            const prob = STAGE_PROB[o.stage] || 0;
            return (
              <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div className="u-av" style={{ width: 34, height: 34, borderRadius: 8, fontSize: 11 }}>
                  {acc ? acc.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "??"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.title}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>{acc?.name} · {o.stage}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Outfit',sans-serif" }}>₹{o.value}Cr</div>
                  <div style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: prob >= 60 ? "#DCFCE7" : prob >= 30 ? "#FEF9C3" : "#FEE2E2", color: prob >= 60 ? "#166534" : prob >= 30 ? "#854D0E" : "#991B1B", fontWeight: 600 }}>{prob}% prob</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div className="card-title" style={{ marginBottom: 0 }}>Team Performance</div>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", background: "var(--brand-bg)", padding: "3px 8px", borderRadius: 5 }}>{rangeLabel}</span>
              <button className="btn btn-sec btn-xs" onClick={() => setPage("targets")}>Leaderboard</button>
            </div>
          </div>
          {teamPerf.map(t => {
            const pct = t.target > 0 ? Math.round(t.achieved / t.target * 100) : 0;
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                <div className="u-av" style={{ width: 36, height: 36, borderRadius: 8, fontSize: 12 }}>{t.initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</span>
                      <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 6 }}>{t.role}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Outfit',sans-serif", color: "var(--brand)" }}>₹{t.achieved}Cr</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <div style={{ flex: 1, height: 5, background: "var(--s3)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: pct >= 80 ? "#22C55E" : pct >= 50 ? "#F59E0B" : "#EF4444", borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text3)", minWidth: 28 }}>{pct}%</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: "var(--text3)" }}>{t.deals} deals</span>
                    <span style={{ fontSize: 10, color: "var(--text3)" }}>{t.activities} activities</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
