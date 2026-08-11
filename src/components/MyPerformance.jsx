// ═══════════════════════════════════════════════════════════════════
// My Performance — the sales executive / individual contributor
// dashboard ("clean your room"): am I on goal, what's in my pipeline,
// and which deals, follow-ups and accounts need attention TODAY.
//
// Counterpart to the Targets page: Targets answers the VP's and Line
// Managers' governance questions; this answers one seller's. Managers
// get a "Viewing as" picker over their reporting branch; a sales
// executive sees only themselves (their data is already scoped
// upstream, so the picker simply never shows).
//
// Everything computes from the in-memory data the app already syncs —
// no new tables, no fake numbers. Fiscal maths comes from utils/fiscal
// so this page and Targets can never disagree about quarters or what
// "won" means.
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo } from "react";
import { Gauge, TrendingUp, PhoneMissed, Building2, Snowflake, Trophy } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { PROD_MAP } from '../data/constants';
import { fmt, today, isOverdue, getScopedUserIds } from '../utils/helpers';
import { periodOf, fiscalRanges, wonStageNames, lostStageNames } from '../utils/fiscal';
import { UserPill, StatusBadge, Empty, PageTip } from './shared';

// Attention thresholds — days without activity before a deal counts as
// stalled / an account as neglected. Mirrors Pipeline.jsx's health bands.
const STALLED_DAYS = 30;
const NEGLECTED_DAYS = 90;

const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

function MyPerformance({ targets = [], opps = [], activities = [], accounts = [], leads = [], callReports = [], orgUsers = [], currentUser, masters }) {
  // ── Viewing as ──
  // Managers pick anyone in their visibility scope; everyone else is locked
  // to themselves. Uses the scope (not the reporting branch) deliberately:
  // this mirrors what records the viewer can already see elsewhere in the app.
  const [viewAs, setViewAs] = useState(currentUser);
  const scopeIds = useMemo(() => getScopedUserIds(currentUser, orgUsers), [currentUser, orgUsers]);
  const QUOTA_ROLES = new Set(["vp_sales_mkt", "director", "line_mgr", "country_mgr", "bd_lead", "sales_exec"]);
  const viewOptions = useMemo(() =>
    (orgUsers || [])
      .filter(u => u.active !== false && scopeIds.has(u.id) && QUOTA_ROLES.has(String(u.role || "").trim().toLowerCase()))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [orgUsers, scopeIds]);
  const userName = (id) => (orgUsers || []).find(u => u.id === id)?.name || id || "";
  const me = viewAs;

  const wonNames = useMemo(() => wonStageNames(masters), [masters]);
  const lostNames = useMemo(() => lostStageNames(masters), [masters]);
  const isWon = (o) => wonNames.has(o?.stage);
  const isOpen = (o) => !wonNames.has(o?.stage) && !lostNames.has(o?.stage);

  const { monthStart, quarterStart, fyStart, currentPeriod } = fiscalRanges(today);

  // ── My revenue (won deals I own, booked by close date) ──
  const myWon = useMemo(() =>
    (opps || []).filter(o => o.owner === me && isWon(o) && o.closeDate),
    [opps, me, wonNames]);
  const sumVal = (list) => +list.reduce((s, o) => s + (Number(o.value) || 0), 0).toFixed(2);
  const mtdRevenue = sumVal(myWon.filter(o => o.closeDate >= monthStart && o.closeDate <= today));
  const qtdRevenue = sumVal(myWon.filter(o => o.closeDate >= quarterStart && o.closeDate <= today));
  const fytdRevenue = sumVal(myWon.filter(o => o.closeDate >= fyStart && o.closeDate <= today));

  // ── My goal for the current quarter (from Targets) ──
  // Month goal = quarter goal / 3: targets are quarterly, so an even monthly
  // split is the honest default rather than inventing a seasonal curve.
  const myTargets = useMemo(() => (targets || []).filter(t => t.userId === me && !t.isDeleted), [targets, me]);
  const qTargets = myTargets.filter(t => t.period === currentPeriod);
  const quarterGoal = +qTargets.reduce((s, t) => s + (Number(t.targetValue) || 0), 0).toFixed(2);
  const monthGoal = +(quarterGoal / 3).toFixed(2);
  const mtdPct = monthGoal > 0 ? Math.round((mtdRevenue / monthGoal) * 100) : null;
  const qtdPct = quarterGoal > 0 ? Math.round((qtdRevenue / quarterGoal) * 100) : null;
  const fyGoal = +(targets || []).filter(t => t.userId === me && !t.isDeleted && String(t.period || "").startsWith(fyStart.slice(0, 4)))
    .reduce((s, t) => s + (Number(t.targetValue) || 0), 0).toFixed(2);
  const fytdPct = fyGoal > 0 ? Math.round((fytdRevenue / fyGoal) * 100) : null;

  // ── My open pipeline, grouped by stage in Masters order ──
  const myOpen = useMemo(() => (opps || []).filter(o => o.owner === me && isOpen(o)), [opps, me, wonNames, lostNames]);
  const funnel = useMemo(() => {
    const order = Array.isArray(masters?.stages)
      ? masters.stages.filter(st => st?.kind !== "won" && st?.kind !== "lost").map(st => st.name)
      : [];
    const byStage = {};
    myOpen.forEach(o => {
      const st = o.stage || "—";
      const g = byStage[st] || (byStage[st] = { stage: st, count: 0, value: 0 });
      g.count += 1; g.value = +(g.value + (Number(o.value) || 0)).toFixed(2);
    });
    const known = order.filter(st => byStage[st]).map(st => byStage[st]);
    const unknown = Object.values(byStage).filter(g => !order.includes(g.stage));
    return [...known, ...unknown];
  }, [myOpen, masters]);
  const pipelineTotal = sumVal(myOpen);

  // ── Top open opportunities ──
  const topOpen = useMemo(() =>
    [...myOpen].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0)).slice(0, 6),
    [myOpen]);

  // ── Attention lists ("clean your room") ──
  // Last touch per opp / account from activities (any status counts as a
  // touch — a planned meeting is still engagement; overdue ones surface in
  // the past-due list instead).
  const lastTouch = useMemo(() => {
    const m = {};
    (activities || []).forEach(a => {
      if (!a.date) return;
      if (a.oppId) m[`o:${a.oppId}`] = m[`o:${a.oppId}`] > a.date ? m[`o:${a.oppId}`] : a.date;
      if (a.accountId) m[`a:${a.accountId}`] = m[`a:${a.accountId}`] > a.date ? m[`a:${a.accountId}`] : a.date;
    });
    return m;
  }, [activities]);

  const stalled = useMemo(() =>
    myOpen.map(o => {
      const t = lastTouch[`o:${o.id}`] || lastTouch[`a:${o.accountId}`] || o.createdDate || "";
      return { ...o, lastTouch: t, idleDays: t ? daysBetween(t, today) : null };
    })
    .filter(o => o.idleDays === null || o.idleDays >= STALLED_DAYS)
    .sort((a, b) => (b.idleDays ?? 9e9) - (a.idleDays ?? 9e9) || (Number(b.value) || 0) - (Number(a.value) || 0))
    .slice(0, 6),
    [myOpen, lastTouch]);

  // Past-due follow-ups: my planned activities past their date, plus my
  // leads whose next-call date has slipped.
  const pastDue = useMemo(() => {
    const acts = (activities || [])
      .filter(a => a.owner === me && a.status === "Planned" && isOverdue(a.date))
      .map(a => ({ kind: a.type || "Task", title: a.title || "(untitled)", date: a.date, ref: a }));
    const lead = (leads || [])
      .filter(l => l.assignedTo === me && !l.isDeleted && l.stage !== "Converted" && isOverdue(l.nextCall))
      .map(l => ({ kind: "Lead call", title: l.company || l.contact || l.leadId, date: l.nextCall, ref: l }));
    return [...acts, ...lead].sort((a, b) => (a.date || "").localeCompare(b.date || "")).slice(0, 6);
  }, [activities, leads, me]);

  const neglected = useMemo(() =>
    (accounts || [])
      .filter(a => a.owner === me && !a.isDeleted && a.status !== "Inactive")
      .map(a => {
        const t = lastTouch[`a:${a.id}`] || "";
        return { ...a, lastTouch: t, idleDays: t ? daysBetween(t, today) : null };
      })
      .filter(a => a.idleDays === null || a.idleDays >= NEGLECTED_DAYS)
      .sort((a, b) => (Number(b.arrRevenue) || 0) - (Number(a.arrRevenue) || 0))
      .slice(0, 5),
    [accounts, me, lastTouch]);

  // ── Calls QTD vs target ──
  const qtdCalls = useMemo(() =>
    (callReports || []).filter(r => r.marketingPerson === me && r.callDate >= quarterStart && r.callDate <= today).length,
    [callReports, me, quarterStart]);
  const callGoal = qTargets.reduce((s, t) => s + (Number(t.targetCalls) || 0), 0);

  // ── Cross-sell: my won revenue on products outside my own target focus ──
  // Only meaningful once my targets are product-scoped; "—" otherwise.
  const myProducts = useMemo(() => {
    const set = new Set();
    myTargets.forEach(t => { if (t.product && t.product !== "All") set.add(t.product); });
    return set;
  }, [myTargets]);
  const crossSell = myProducts.size === 0 ? null : sumVal(
    myWon.filter(o => o.closeDate >= fyStart &&
      Array.isArray(o.products) && o.products.length && o.products.every(pid => !myProducts.has(pid))));

  // ── Top accounts by all-time won revenue ──
  const topAccounts = useMemo(() => {
    const byAcc = {};
    myWon.forEach(o => {
      if (!o.accountId) return;
      byAcc[o.accountId] = +( (byAcc[o.accountId] || 0) + (Number(o.value) || 0) ).toFixed(2);
    });
    return Object.entries(byAcc)
      .map(([id, v]) => ({ id, name: (accounts || []).find(a => a.id === id)?.name || id, value: v }))
      .sort((a, b) => b.value - a.value).slice(0, 5);
  }, [myWon, accounts]);
  const maxAcc = topAccounts[0]?.value || 1;

  const pctColor = (pct) => pct >= 100 ? "#22C55E" : pct >= 75 ? "#F59E0B" : pct >= 50 ? "#F97316" : "#EF4444";
  const gaugePct = Math.min(mtdPct ?? 0, 100);
  const attention = stalled.length + pastDue.length + neglected.length;

  return (
    <div>
      <div className="pg-head">
        <div>
          <div className="pg-title">My Performance</div>
          <div className="pg-sub">
            {fmt.inr(qtdRevenue)} this quarter{quarterGoal > 0 ? ` of ${fmt.inr(quarterGoal)} goal` : ""} · {fmt.inr(pipelineTotal)} open pipeline · {attention === 0 ? "nothing needs attention" : `${attention} item${attention === 1 ? "" : "s"} need attention`}
          </div>
        </div>
        {viewOptions.length > 1 && (
          <div className="pg-actions">
            <select className="filter-select" value={viewAs} onChange={e => setViewAs(e.target.value)} title="View this dashboard as one of your team">
              {viewOptions.map(u => <option key={u.id} value={u.id}>{u.id === currentUser ? `${u.name} (me)` : u.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ── KPI row: goal attainment across the three fiscal windows ── */}
      <div className="kpi-grid" style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:16}}>
        <div className="kpi" style={{display:"flex",gap:10,alignItems:"center"}}>
          <div style={{width:74,height:44,flexShrink:0}}>
            <ResponsiveContainer width="100%" height={88}>
              <PieChart>
                <Pie data={[{v:gaugePct},{v:100-gaugePct}]} dataKey="v" startAngle={180} endAngle={0}
                  innerRadius={24} outerRadius={36} stroke="none" isAnimationActive={false}>
                  <Cell fill={pctColor(mtdPct ?? 0)}/><Cell fill="#E2E8F0"/>
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div>
            <div className="kpi-label">MTD Revenue</div>
            <div className="kpi-val" style={{fontSize:18}}>{fmt.inr(mtdRevenue)}</div>
            <div className="kpi-sub">{mtdPct === null ? "no goal this quarter" : <span style={{color:pctColor(mtdPct),fontWeight:700}}>{mtdPct}% of {fmt.inr(monthGoal)}</span>}</div>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">QTD Revenue</div>
          <div className="kpi-val" style={{color: qtdPct === null ? "var(--text1)" : pctColor(qtdPct)}}>{fmt.inr(qtdRevenue)}</div>
          <div className="kpi-sub">{qtdPct === null ? currentPeriod : `${qtdPct}% of ${fmt.inr(quarterGoal)} · ${currentPeriod}`}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">FYTD Revenue</div>
          <div className="kpi-val">{fmt.inr(fytdRevenue)}</div>
          <div className="kpi-sub">{fytdPct === null ? `since ${fmt.date(fyStart)}` : `${fytdPct}% of ${fmt.inr(fyGoal)} FY goal`}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Open Pipeline</div>
          <div className="kpi-val" style={{color:"var(--brand)"}}>{fmt.inr(pipelineTotal)}</div>
          <div className="kpi-sub">{myOpen.length} open deal{myOpen.length === 1 ? "" : "s"}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Calls QTD</div>
          <div className="kpi-val">{qtdCalls}{callGoal > 0 ? `/${callGoal}` : ""}</div>
          <div className="kpi-sub">{crossSell === null ? "cross-sell needs product-scoped targets" : `cross-sell ${fmt.inr(crossSell)} FYTD`}</div>
        </div>
      </div>

      {/* ── Row 2: pipeline funnel · top open opps · past-due ── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1.4fr 1fr",gap:12,marginBottom:12}}>
        <div className="card" style={{padding:0}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border)",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
            <Gauge size={15} style={{color:"var(--brand)"}}/> Pipeline by stage
          </div>
          <div style={{padding:"10px 14px"}}>
            {funnel.length === 0 ? <Empty icon={<Gauge size={20}/>} title="No open deals" sub="New opportunities appear here."/> :
              funnel.map(g => (
                <div key={g.stage} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11.5,marginBottom:2}}>
                    <span style={{fontWeight:600}}>{g.stage}</span>
                    <span style={{color:"var(--text3)"}}>{g.count} · <b style={{color:"var(--text1)"}}>{fmt.inr(g.value)}</b></span>
                  </div>
                  <div style={{height:8,background:"#E2E8F0",borderRadius:4,overflow:"hidden"}}>
                    <div style={{width:`${pipelineTotal > 0 ? Math.max(4, Math.round((g.value / pipelineTotal) * 100)) : 0}%`,height:"100%",background:"var(--brand)",borderRadius:4}}/>
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="card" style={{padding:0}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border)",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
            <TrendingUp size={15} style={{color:"var(--brand)"}}/> Top open opportunities
          </div>
          {topOpen.length === 0 ? <Empty icon={<TrendingUp size={20}/>} title="No open deals"/> : (
            <table className="tbl">
              <thead><tr><th>Opportunity</th><th>Stage</th><th style={{textAlign:"right"}}>Value</th><th>Close</th></tr></thead>
              <tbody>
                {topOpen.map(o => (
                  <tr key={o.id}>
                    <td style={{fontSize:12,fontWeight:600}}>{o.title || o.id}<div style={{fontSize:10.5,color:"var(--text3)"}}>{(accounts || []).find(a => a.id === o.accountId)?.name || ""}</div></td>
                    <td><StatusBadge status={o.stage}/></td>
                    <td style={{textAlign:"right",fontFamily:"'Outfit',sans-serif",fontWeight:700}}>{fmt.inr(o.value)}</td>
                    <td style={{fontSize:11.5,color:isOverdue(o.closeDate) ? "var(--red)" : "var(--text3)"}}>{o.closeDate ? fmt.short(o.closeDate) : "—"}{isOverdue(o.closeDate) && " ⚠"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card" style={{padding:0}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border)",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
            <PhoneMissed size={15} style={{color:"var(--red)"}}/> Past-due follow-ups
            {pastDue.length > 0 && <span style={{marginLeft:"auto",fontSize:10,fontWeight:700,padding:"1px 7px",borderRadius:8,color:"#fff",background:"var(--red)"}}>{pastDue.length}</span>}
          </div>
          <div style={{padding: pastDue.length ? 0 : undefined}}>
            {pastDue.length === 0 ? <Empty icon={<PhoneMissed size={20}/>} title="All caught up" sub="No overdue tasks or lead calls."/> : (
              <table className="tbl">
                <tbody>
                  {pastDue.map((it, i) => (
                    <tr key={i}>
                      <td style={{fontSize:11,color:"var(--text3)",whiteSpace:"nowrap"}}>{it.kind}</td>
                      <td style={{fontSize:12,fontWeight:600}}>{it.title}</td>
                      <td style={{fontSize:11.5,color:"var(--red)",whiteSpace:"nowrap"}}>{fmt.short(it.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 3: stalled deals · neglected accounts · top accounts ── */}
      <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr 1fr",gap:12,marginBottom:12}}>
        <div className="card" style={{padding:0}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border)",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
            <Snowflake size={15} style={{color:"#D97706"}}/> Stalled deals
            <span style={{fontSize:11,fontWeight:400,color:"var(--text3)"}}>no activity in {STALLED_DAYS}+ days</span>
          </div>
          {stalled.length === 0 ? <Empty icon={<Snowflake size={20}/>} title="Nothing stalled" sub="Every open deal has recent activity."/> : (
            <table className="tbl">
              <thead><tr><th>Opportunity</th><th>Stage</th><th style={{textAlign:"right"}}>Value</th><th style={{textAlign:"right"}}>Idle</th></tr></thead>
              <tbody>
                {stalled.map(o => (
                  <tr key={o.id}>
                    <td style={{fontSize:12,fontWeight:600}}>{o.title || o.id}</td>
                    <td><StatusBadge status={o.stage}/></td>
                    <td style={{textAlign:"right",fontFamily:"'Outfit',sans-serif"}}>{fmt.inr(o.value)}</td>
                    <td style={{textAlign:"right",fontSize:11.5,color:"#D97706",fontWeight:700}}>{o.idleDays === null ? "never touched" : `${o.idleDays}d`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card" style={{padding:0}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border)",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
            <Building2 size={15} style={{color:"#D97706"}}/> Neglected accounts
            <span style={{fontSize:11,fontWeight:400,color:"var(--text3)"}}>{NEGLECTED_DAYS}+ days quiet</span>
          </div>
          {neglected.length === 0 ? <Empty icon={<Building2 size={20}/>} title="All accounts touched"/> : (
            <table className="tbl">
              <tbody>
                {neglected.map(a => (
                  <tr key={a.id}>
                    <td style={{fontSize:12,fontWeight:600}}>{a.name}</td>
                    <td style={{textAlign:"right",fontSize:11.5,color:"#D97706",fontWeight:700,whiteSpace:"nowrap"}}>{a.idleDays === null ? "no activity ever" : `${a.idleDays}d`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card" style={{padding:0}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--border)",fontSize:13,fontWeight:700,display:"flex",alignItems:"center",gap:8}}>
            <Trophy size={15} style={{color:"var(--brand)"}}/> Top accounts, all time
          </div>
          <div style={{padding:"10px 14px"}}>
            {topAccounts.length === 0 ? <Empty icon={<Trophy size={20}/>} title="No won deals yet"/> :
              topAccounts.map(a => (
                <div key={a.id} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11.5,marginBottom:2}}>
                    <span style={{fontWeight:600}}>{a.name}</span>
                    <b>{fmt.inr(a.value)}</b>
                  </div>
                  <div style={{height:8,background:"#E2E8F0",borderRadius:4,overflow:"hidden"}}>
                    <div style={{width:`${Math.max(4, Math.round((a.value / maxAcc) * 100))}%`,height:"100%",background:"var(--brand)",borderRadius:4}}/>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <PageTip id="myperf-tip" title="How these numbers work"
        text="MTD goal is your quarter target ÷ 3. Stalled and neglected use your last activity of any status — clear them by logging the touch you actually made, or by closing what's dead."/>
    </div>
  );
}

export default MyPerformance;
