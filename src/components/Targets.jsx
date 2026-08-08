import { useState, useMemo } from "react";
import { Plus, Edit2, Trash2, Check, Download, Target, TrendingUp, TrendingDown, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { PRODUCTS, PROD_MAP, TEAM, TEAM_MAP } from '../data/constants';
import { BLANK_TARGET } from '../data/seed';
import { uid, sanitizeObj, hasErrors, softDeleteById, getScopedUserIds } from '../utils/helpers';
import { UserPill, Modal, Confirm, FormError, Empty } from './shared';
import Pagination, { usePagination } from './Pagination';
import { exportCSV } from '../utils/csv';

const CSV_COLS = [
  { label: "Salesperson", accessor: t => TEAM_MAP[t.userId]?.name || "" },
  { label: "Period", accessor: t => t.period },
  { label: "Product", accessor: t => t.product === "All" ? "All Products" : (PROD_MAP[t.product]?.name || t.product) },
  { label: "Target (L)", accessor: t => t.targetValue },
  { label: "Achieved (L)", accessor: t => t.achievedValue },
  { label: "Gap (L)", accessor: t => t.targetValue - t.achievedValue },
  { label: "% Achievement", accessor: t => t.targetValue > 0 ? ((t.achievedValue/t.targetValue)*100).toFixed(0) : 0 },
  { label: "Target Deals", accessor: t => t.targetDeals },
  { label: "Achieved Deals", accessor: t => t.achievedDeals },
  { label: "Target Calls", accessor: t => t.targetCalls },
  { label: "Achieved Calls", accessor: t => t.achievedCalls },
];

// Fiscal-quarter (India FY, Apr–Mar) key for a date → "YYYY-Q#", where YYYY
// is the FY start year and Q1 = Apr–Jun. Matches the app's "2026-Q1" usage.
function periodOf(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  const m = d.getMonth(), y = d.getFullYear();
  const fyStart = m >= 3 ? y : y - 1;
  const q = Math.floor(((m - 3 + 12) % 12) / 3) + 1;
  return `${fyStart}-Q${q}`;
}
const isWonStage = (o) => o.stage === "Won" || o.stage === "closed_won";
// A target's product focus matches an item with a products[] array (opps) or
// a single product + productSelection[] (call reports). "All" matches everything.
const prodMatches = (tProd, arr, single) => {
  if (!tProd || tProd === "All") return true;
  if (Array.isArray(arr) && arr.includes(tProd)) return true;
  return single === tProd;
};

function Targets({ targets, setTargets, opps = [], callReports = [], orgUsers = [], currentUser, canDelete }) {
  const [periodF, setPeriodF] = useState("All");
  // Product + line-manager filters: lets leadership see "iCAFFE targets for
  // Lalchand's team" rather than one flat list.
  const [productF, setProductF] = useState("All");
  const [teamF, setTeamF] = useState("All");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK_TARGET);
  const [confirm, setConfirm] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  // Live-user helpers (fall back to the static seed when orgUsers is empty).
  const userOpts = (orgUsers && orgUsers.length ? orgUsers.filter(u => u.active !== false) : TEAM);
  const userName = (id) => (orgUsers || []).find(u => u.id === id)?.name || TEAM_MAP[id]?.name || id || "";

  // ── Line-manager alignment ──
  // managers = anyone with at least one direct report (solid reportsTo or
  // dotted line). Selecting one scopes the page to that whole branch, so a
  // manager's product targets and their team's roll up together.
  // ── Who owns a slice of the ABP/AOP ──
  // The annual plan is cut across the Line Managers by vertical/product, and
  // whatever stays company-level is owned by the VP Sales & Marketing. So the
  // panel lists every BD / line-management / sales-leadership role up to VP —
  // and does NOT require the person to have direct reports.
  //
  // That last part matters: the previous rule also demanded at least one
  // report, which silently dropped a Line Manager who owns an ABP number but
  // hasn't been assigned a team yet. They own a commitment, so they get a row
  // and it reads "no target" rather than the manager vanishing.
  //
  // Roles above the sales line (MD, Admin) and outside it (Finance, Product
  // Head, Tech Lead, Support, Viewer) stay out — their rows were noise. Add
  // "sales_exec" here if you ever want individual contributors listed too;
  // today their targets roll up into their Line Manager's row instead, and
  // the detail table below already lists them line by line.
  const ABP_OWNER_ROLES = ["vp_sales_mkt", "director", "line_mgr", "country_mgr", "bd_lead"];
  const managers = useMemo(
    () => userOpts
      .filter(m => ABP_OWNER_ROLES.includes(String(m.role || "").trim().toLowerCase()))
      .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [orgUsers]);
  const teamIds = useMemo(() => teamF === "All" ? null : getScopedUserIds(teamF, orgUsers), [teamF, orgUsers]);
  // Direct manager of a user — shown as a column so every target says which
  // line manager owns it.
  const managerOf = (uid) => {
    const u = (orgUsers || []).find(x => x.id === uid);
    return u?.reportsTo ? userName(u.reportsTo) : "";
  };

  // Auto-compute achievement for a target from won opps (revenue + deal count)
  // and call reports (calls), matched on owner × fiscal-quarter × product.
  const computeAchievement = (t) => {
    let rev = 0, deals = 0, calls = 0;
    (opps || []).forEach(o => {
      if (o.owner !== t.userId || !isWonStage(o)) return;
      if (periodOf(o.closeDate) !== t.period) return;
      if (!prodMatches(t.product, o.products)) return;
      rev += Number(o.value) || 0; deals += 1;
    });
    (callReports || []).forEach(r => {
      if (r.marketingPerson !== t.userId) return;
      if (periodOf(r.callDate) !== t.period) return;
      if (!prodMatches(t.product, r.productSelection, r.product)) return;
      calls += 1;
    });
    return { achievedValue: +rev.toFixed(2), achievedDeals: deals, achievedCalls: calls };
  };
  // Targets with achievement overlaid from live CRM data (ignores any stored
  // manual achieved* values so the screen always reflects reality).
  const enriched = useMemo(() => targets.map(t => ({ ...t, ...computeAchievement(t) })), [targets, opps, callReports]);

  const periods = useMemo(() => [...new Set(enriched.map(t => t.period))].sort().reverse(), [enriched]);

  // Selectable periods for the form: current FY ±1, all four quarters, newest first.
  const periodOptions = useMemo(() => {
    const now = new Date();
    const curFy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const opts = [];
    for (let fy = curFy + 1; fy >= curFy - 1; fy--) for (let q = 4; q >= 1; q--) opts.push(`${fy}-Q${q}`);
    return opts;
  }, []);

  const filtered = useMemo(() => {
    let list = [...enriched];
    if (periodF !== "All") list = list.filter(t => t.period === periodF);
    // "__company" = the company-wide targets, which store product "All".
    if (productF === "__company") list = list.filter(t => !t.product || t.product === "All");
    else if (productF !== "All") list = list.filter(t => t.product === productF);
    if (teamIds) list = list.filter(t => teamIds.has(t.userId));
    return list;
  }, [enriched, periodF, productF, teamIds]);

  // Summary KPIs
  const totalTarget = filtered.reduce((s, t) => s + t.targetValue, 0);
  const totalAchieved = filtered.reduce((s, t) => s + t.achievedValue, 0);
  const overallPct = totalTarget > 0 ? ((totalAchieved / totalTarget) * 100).toFixed(0) : 0;
  const totalTargetDeals = filtered.reduce((s, t) => s + t.targetDeals, 0);
  const totalAchievedDeals = filtered.reduce((s, t) => s + t.achievedDeals, 0);

  const pg = usePagination(filtered);

  // Chart data
  const chartData = useMemo(() => {
    const byUser = {};
    filtered.forEach(t => {
      if (!byUser[t.userId]) byUser[t.userId] = { name: (userName(t.userId) || "?").split(" ")[0], target: 0, achieved: 0 };
      byUser[t.userId].target += t.targetValue;
      byUser[t.userId].achieved += t.achievedValue;
    });
    return Object.values(byUser).sort((a, b) => b.target - a.target);
  }, [filtered]);

  // ── ABP / AOP rollup ──
  // The annual plan is distributed across the Line Managers by vertical and
  // product; whatever stays company-level is owned by the VP. Each row
  // therefore answers two different questions, which is why it carries two
  // sets of figures:
  //
  //   ABP (owned)    — the commitment this person is ACCOUNTABLE for, and the
  //                    revenue booked against it from ANY seller. A product's
  //                    number belongs to the manager who owns that product,
  //                    whoever closed the deal.
  //   Team sold      — what this person's own reports actually closed, across
  //                    the WHOLE portfolio, because every team is expected to
  //                    cross-sell outside its primary line.
  //
  // The gap between them is the cross-sell story: positive Δ means this team
  // sold more into other lines than other teams sold into theirs.
  //
  // Neither figure double-counts inside itself — a deal matching several of a
  // person's commitments is counted once. Across rows they deliberately
  // overlap (a cross-sold deal appears in one manager's ABP and another's Team
  // sold), so only the ABP Target column is meant to reconcile with the page
  // totals above.
  const byManager = useMemo(() => {
    const users = orgUsers || [];
    const byId = Object.fromEntries(users.map(u => [u.id, u]));
    const gridIds = new Set(managers.map(m => m.id));

    // True reporting branch: this person plus everyone reporting up to them at
    // any depth, solid or dotted line. Deliberately NOT getScopedUserIds —
    // that is a VISIBILITY scope and short-circuits to the entire org for
    // global roles (admin, md, director, vp_sales_mkt), which would have made
    // the VP's "team sold" the whole company, Finance and Support included.
    const childrenOf = {};
    users.forEach(u => {
      [u.reportsTo, ...(Array.isArray(u.dottedTo) ? u.dottedTo : [])]
        .filter(Boolean)
        .forEach(pid => (childrenOf[pid] || (childrenOf[pid] = [])).push(u.id));
    });
    const branchOf = (rootId) => {
      const out = new Set([rootId]);
      const stack = [rootId];
      while (stack.length) {
        for (const child of childrenOf[stack.pop()] || []) {
          if (!out.has(child)) { out.add(child); stack.push(child); }
        }
      }
      return out;
    };

    // Credit a target to the NEAREST ABP owner at or above its owner. Targets
    // are currently captured against sales executives, so this is what rolls an
    // exec's number up into their Line Manager's commitment. It also means the
    // panel keeps working unchanged if you later enter targets at LM level.
    const creditOf = (uid) => {
      let cur = byId[uid];
      const seen = new Set();
      while (cur && cur.reportsTo && !seen.has(cur.id)) {
        seen.add(cur.id);                       // cycle guard
        if (gridIds.has(cur.reportsTo)) return cur.reportsTo;
        cur = byId[cur.reportsTo];
      }
      return gridIds.has(uid) ? uid : "__none";
    };

    // Every target, grouped under the ABP owner accountable for it.
    const credited = {};
    filtered.forEach(t => {
      const key = creditOf(t.userId);
      const c = credited[key] || (credited[key] = {
        target: 0, deals: 0, people: new Set(), pairs: new Set(), products: new Set(),
      });
      c.target += Number(t.targetValue) || 0;
      c.deals += Number(t.targetDeals) || 0;
      c.people.add(t.userId);
      // The (period, product) commitments this owner is measured against.
      // A blank product means the company-level objective, which matches
      // every product — that is the VP's row.
      c.pairs.add(`${t.period}|${t.product || "All"}`);
      if (t.product && t.product !== "All") c.products.add(t.product);
    });

    // Periods currently in view — used to scope "team sold" for a manager who
    // holds no target yet, so their team's contribution is still visible.
    const visiblePeriods = [...new Set(filtered.map(t => t.period).filter(Boolean))];

    // Won revenue matching a set of "period|product" commitments. `owners`,
    // when given, restricts to deals closed BY those people. Each deal is
    // counted at most once even if several commitments would match it.
    const revenueFor = (pairs, owners) => {
      let value = 0, deals = 0;
      (opps || []).forEach(o => {
        if (!isWonStage(o)) return;
        if (owners && !owners.has(o.owner)) return;
        const per = periodOf(o.closeDate);
        if (!per) return;                       // no close date → no period to book against
        for (const pair of pairs) {
          const sep = pair.indexOf("|");
          if (pair.slice(0, sep) !== per) continue;
          if (!prodMatches(pair.slice(sep + 1), o.products)) continue;
          value += Number(o.value) || 0; deals += 1;
          return;                               // count this deal once
        }
      });
      return { value: +value.toFixed(2), deals };
    };

    const teamPairs = new Set(visiblePeriods.map(p => `${p}|All`));

    // EVERY ABP owner gets a row — including one with no target yet, so a
    // missing commitment is visible instead of the manager silently absent.
    const rows = managers.map(m => {
      const c = credited[m.id];
      const pairs = c ? c.pairs : new Set();
      const abpTarget = c ? c.target : 0;
      // Accountability: the products this person owns, booked from any seller.
      const abp = pairs.size ? revenueFor(pairs, null) : { value: 0, deals: 0 };
      // Contribution: what this person's own reports closed, any product.
      const branchIds = branchOf(m.id);
      const team = revenueFor(teamPairs, branchIds);
      return {
        mgrId: m.id, role: m.role || "",
        products: c ? [...c.products] : [],
        companyWide: [...pairs].some(p => p.endsWith("|All")),
        headcount: Math.max(branchIds.size - 1, 0),   // reports, excluding self
        target: abpTarget,
        achieved: abp.value,
        wonDeals: abp.deals,
        deals: c ? c.deals : 0,
        teamSold: team.value,
        delta: +(team.value - abp.value).toFixed(2),
        pct: abpTarget > 0 ? Math.round((abp.value / abpTarget) * 100) : null,
      };
    });

    // Any target whose owner sits outside the sales roles stays visible, so
    // the ABP Target column can never silently under-sum the page total.
    const o = credited["__none"];
    if (o && o.target > 0) {
      const abp = revenueFor(o.pairs, null);
      rows.push({
        mgrId: "__none", role: "", products: [], companyWide: false,
        headcount: o.people.size, target: o.target, achieved: abp.value,
        wonDeals: abp.deals, deals: o.deals, teamSold: 0, delta: 0,
        pct: o.target > 0 ? Math.round((abp.value / o.target) * 100) : null,
      });
    }
    return rows.sort((a, b) => b.target - a.target || b.teamSold - a.teamSold);
  }, [filtered, orgUsers, managers, opps]);

  const openAdd = () => {
    setForm({ ...BLANK_TARGET, id: `tgt${uid()}`, period: periods[0] || "2026-Q1", userId: currentUser || BLANK_TARGET.userId });
    setFormErrors({});
    setModal({ mode: "add" });
  };
  const openEdit = (t) => { setForm({ ...t }); setFormErrors({}); setModal({ mode: "edit" }); };
  const save = () => {
    const errs = {};
    if (!form.userId) errs.userId = "Salesperson is required";
    if (!form.period?.trim()) errs.period = "Period is required";
    if (form.targetValue <= 0) errs.targetValue = "Target must be > 0";
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    const clean = sanitizeObj(form);
    if (modal.mode === "add") setTargets(p => [...p, { ...clean }]);
    else setTargets(p => p.map(t => t.id === clean.id ? { ...clean } : t));
    setModal(null); setFormErrors({});
  };
  const del = (id) => { setTargets(p => softDeleteById(p, id, currentUser)); setConfirm(null); };

  const pctColor = (pct) => pct >= 100 ? "#22C55E" : pct >= 75 ? "#F59E0B" : pct >= 50 ? "#F97316" : "#EF4444";

  return (
    <div>
      <div className="pg-head">
        <div>
          <div className="pg-title">Target vs Achievement</div>
          <div className="pg-sub">
            ₹{totalTarget}L target · ₹{totalAchieved}L achieved · {overallPct}% overall
          </div>
        </div>
        <div className="pg-actions">
          {/* Export resolves names from LIVE users (CSV_COLS' static TEAM_MAP
              left real Supabase users blank) and includes the line manager. */}
          <button className="btn btn-sec" onClick={() => exportCSV(filtered, [
            { label: "Salesperson", accessor: t => userName(t.userId) },
            { label: "Line Manager", accessor: t => managerOf(t.userId) },
            ...CSV_COLS.slice(1),
          ], "targets")}><Download size={14}/>Export</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={14}/>Add Target</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
        <div className="kpi">
          <div className="kpi-label">Revenue Target</div>
          <div className="kpi-val">₹{totalTarget}L</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Achieved</div>
          <div className="kpi-val" style={{color:pctColor(+overallPct)}}>₹{totalAchieved}L</div>
          <div className="kpi-sub">
            <span style={{color:pctColor(+overallPct),fontWeight:700}}>{overallPct}%</span> of target
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Gap</div>
          <div className="kpi-val" style={{color:totalTarget-totalAchieved > 0 ? "var(--red)" : "var(--green)"}}>
            ₹{(totalTarget - totalAchieved)}L
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Deals</div>
          <div className="kpi-val">{totalAchievedDeals}/{totalTargetDeals}</div>
          <div className="kpi-sub">{totalTargetDeals > 0 ? ((totalAchievedDeals/totalTargetDeals)*100).toFixed(0) : 0}% conversion</div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card" style={{marginBottom:16}}>
          <div className="card-title">Target vs Achievement by Salesperson (₹L)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barGap={4} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
              <XAxis dataKey="name" tick={{fontSize:11}} tickLine={false}/>
              <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
              <Tooltip formatter={v=>`₹${v}L`} contentStyle={{borderRadius:8,fontSize:12}}/>
              <Legend wrapperStyle={{fontSize:12}}/>
              <Bar dataKey="target" name="Target" fill="#94A3B8" radius={[4,4,0,0]}/>
              <Bar dataKey="achieved" name="Achieved" fill="var(--brand)" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── ABP / AOP rollup ── accountability vs contribution ── */}
      {byManager.length > 0 && (
        <div className="card" style={{padding:0, marginBottom:16}}>
          <div style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", fontSize:13, fontWeight:700, color:"var(--text1)", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
            <Users size={15} style={{color:"var(--brand)"}}/> ABP / AOP by owner
            <span style={{fontSize:11, fontWeight:400, color:"var(--text3)"}}>
              ABP = the plan this owner is accountable for, booked from any seller · Team sold = what their own reports closed across the portfolio · reflects the filters below
            </span>
          </div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl" style={{minWidth:900}}>
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Role</th>
                  <th>Vertical / Products</th>
                  <th style={{textAlign:"right"}}>Team</th>
                  <th style={{textAlign:"right"}}>ABP Target (₹L)</th>
                  <th style={{textAlign:"right"}}>ABP Achieved (₹L)</th>
                  <th>Attainment</th>
                  <th style={{textAlign:"right"}}>Team Sold (₹L)</th>
                  <th style={{textAlign:"right"}} title="Team sold minus ABP achieved. Positive = this team sold more into other lines than other teams sold into theirs.">Cross-sell Δ</th>
                  <th style={{textAlign:"right"}}>Deals (T/A)</th>
                </tr>
              </thead>
              <tbody>
                {byManager.map(r => (
                  <tr key={r.mgrId} style={{cursor: r.mgrId !== "__none" ? "pointer" : "default"}}
                    onClick={() => r.mgrId !== "__none" && setTeamF(teamF === r.mgrId ? "All" : r.mgrId)}
                    title={r.mgrId !== "__none" ? "Click to filter the page to this team" : ""}>
                    <td style={{fontWeight:600}}>{r.mgrId === "__none" ? <span style={{color:"var(--text3)"}}>— Outside sales roles —</span> : userName(r.mgrId)}</td>
                    <td style={{fontSize:11, color:"var(--text3)"}}>{(r.role || "").replace(/_/g," ") || "—"}</td>
                    <td style={{fontSize:11}}>
                      {r.products.length === 0 && !r.companyWide && <span style={{color:"var(--text3)"}}>—</span>}
                      {r.companyWide && <span style={{fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, color:"#0F766E", background:"#0D948818", marginRight:4}}>Company-wide</span>}
                      {r.products.map(pid => (
                        <span key={pid} style={{fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, color:"#1E40AF", background:"#1E40AF18", marginRight:4}}>
                          {PROD_MAP[pid]?.name || pid}
                        </span>
                      ))}
                    </td>
                    <td style={{textAlign:"right", fontSize:12, color:"var(--text3)"}}>{r.headcount || "—"}</td>
                    <td style={{textAlign:"right", fontFamily:"'Outfit',sans-serif", fontWeight:700}}>₹{r.target.toFixed(1)}L</td>
                    <td style={{textAlign:"right", fontFamily:"'Outfit',sans-serif", color:pctColor(r.pct ?? 0)}}>₹{r.achieved.toFixed(1)}L</td>
                    <td>
                      {r.pct === null ? <span style={{color:"var(--text3)", fontSize:11}}>no target</span> : (
                        <div style={{display:"flex", alignItems:"center", gap:8}}>
                          <div style={{width:60, height:6, background:"#E2E8F0", borderRadius:3, overflow:"hidden"}}>
                            <div style={{width:`${Math.min(r.pct,100)}%`, height:"100%", background:pctColor(r.pct), borderRadius:3}}/>
                          </div>
                          <span style={{fontSize:12, fontWeight:700, color:pctColor(r.pct)}}>{r.pct}%</span>
                          {r.pct >= 100 ? <TrendingUp size={13} style={{color:"#22C55E"}}/> : <TrendingDown size={13} style={{color:pctColor(r.pct)}}/>}
                        </div>
                      )}
                    </td>
                    <td style={{textAlign:"right", fontFamily:"'Outfit',sans-serif", color:"var(--text2)"}}>{r.headcount ? `₹${r.teamSold.toFixed(1)}L` : <span style={{color:"var(--text3)"}}>—</span>}</td>
                    <td style={{textAlign:"right", fontSize:12, fontWeight:700, color: r.delta > 0 ? "#16A34A" : r.delta < 0 ? "#D97706" : "var(--text3)"}}>
                      {!r.headcount || r.delta === 0 ? "—" : `${r.delta > 0 ? "+" : "−"}₹${Math.abs(r.delta).toFixed(1)}L`}
                    </td>
                    <td style={{textAlign:"right", fontSize:12, color:"var(--text3)"}}>{r.deals}/{r.wonDeals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{padding:"8px 14px", fontSize:11, color:"var(--text3)", borderTop:"1px solid var(--border)"}}>
            <b>ABP Target</b> counts every target once, so it reconciles with the totals above. <b>ABP Achieved</b> books a product's revenue to the owner of that product whoever sold it; <b>Team Sold</b> books it to the seller's team — so those two columns overlap across rows by design and shouldn't be added up.
          </div>
        </div>
      )}

      <div className="filter-bar" style={{flexWrap:"wrap"}}>
        <select className="filter-select" value={periodF} onChange={e => setPeriodF(e.target.value)}>
          <option value="All">All Periods</option>
          {periods.map(p => <option key={p}>{p}</option>)}
        </select>
        {/* Product focus — surfaces the product-specific targets that drive
            per-LOB attainment on Reports → LOB Analysis. */}
        <select className="filter-select" value={productF} onChange={e => setProductF(e.target.value)}
          title="Filter by the target's product focus">
          <option value="All">Any Product Focus</option>
          <option value="__company">— Company-wide (All Products) —</option>
          {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {managers.length > 0 && (
          <select className="filter-select" value={teamF} onChange={e => setTeamF(e.target.value)}
            title="Roll up to one line manager's team (manager + all their reports)">
            <option value="All">All Teams</option>
            {managers.map(m => <option key={m.id} value={m.id}>{m.name}'s team</option>)}
          </select>
        )}
        {(periodF !== "All" || productF !== "All" || teamF !== "All") && (
          <button className="btn btn-sec btn-xs" onClick={() => { setPeriodF("All"); setProductF("All"); setTeamF("All"); }}>Clear</button>
        )}
      </div>

      <div className="card" style={{padding:0}}>
        {filtered.length === 0 ? (
          <Empty icon={<Target size={22}/>} title="No targets set" sub="Define targets for your sales team.">
            <button className="btn btn-primary" style={{marginTop:12}} onClick={openAdd}><Plus size={14}/>Add First Target</button>
          </Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Salesperson</th>
                <th>Line Manager</th>
                <th>Period</th>
                <th>Product</th>
                <th>Target (₹L)</th>
                <th>Achieved (₹L)</th>
                <th>Achievement</th>
                <th>Deals (T/A)</th>
                <th>Calls (T/A)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pg.paged.map(t => {
                const pct = t.targetValue > 0 ? ((t.achievedValue / t.targetValue) * 100).toFixed(0) : 0;
                const dealPct = t.targetDeals > 0 ? ((t.achievedDeals / t.targetDeals) * 100).toFixed(0) : 0;
                return (
                  <tr key={t.id}>
                    <td><UserPill uid={t.userId}/></td>
                    <td style={{fontSize:12,color:"var(--text3)"}}>{managerOf(t.userId) || "—"}</td>
                    <td style={{fontSize:12.5,fontWeight:600}}>{t.period}</td>
                    <td style={{fontSize:12}}>
                      {t.product === "All" || !t.product
                        ? <span style={{color:"var(--text3)"}}>All Products</span>
                        : <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,color:"#1E40AF",background:"#1E40AF18"}}>{PROD_MAP[t.product]?.name || t.product}</span>}
                    </td>
                    <td style={{fontFamily:"'Outfit',sans-serif",fontWeight:700}}>₹{t.targetValue}L</td>
                    <td style={{fontFamily:"'Outfit',sans-serif",color:pctColor(+pct)}}>₹{t.achievedValue}L</td>
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:60,height:6,background:"#E2E8F0",borderRadius:3,overflow:"hidden"}}>
                          <div style={{width:`${Math.min(pct,100)}%`,height:"100%",background:pctColor(+pct),borderRadius:3}}/>
                        </div>
                        <span style={{fontSize:12,fontWeight:700,color:pctColor(+pct)}}>{pct}%</span>
                        {+pct >= 100 ? <TrendingUp size={13} style={{color:"#22C55E"}}/> : <TrendingDown size={13} style={{color:pctColor(+pct)}}/>}
                      </div>
                    </td>
                    <td style={{fontSize:12,color:"var(--text3)"}}>{t.targetDeals}/{t.achievedDeals} <span style={{fontSize:10}}>({dealPct}%)</span></td>
                    <td style={{fontSize:12,color:"var(--text3)"}}>{t.targetCalls}/{t.achievedCalls}</td>
                    <td>
                      <div style={{display:"flex",gap:4}}>
                        <button className="icon-btn" aria-label="Edit" onClick={() => openEdit(t)}><Edit2 size={14}/></button>
                        {canDelete && <button className="icon-btn" aria-label="Delete" onClick={() => setConfirm(t.id)}><Trash2 size={14}/></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {filtered.length > 0 && <Pagination {...pg}/>}
      </div>

      {modal && (
        <Modal title={modal.mode === "add" ? "Add Target" : "Edit Target"} onClose={() => { setModal(null); setFormErrors({}); setForm(BLANK_TARGET); }} lg
          footer={<>
            <button className="btn btn-sec" onClick={() => { setModal(null); setFormErrors({}); setForm(BLANK_TARGET); }}>Cancel</button>
            <button className="btn btn-primary" onClick={save}><Check size={14}/>Save</button>
          </>}>
          <div className="form-row">
            <div className="form-group"><label>Salesperson *</label>
              <select value={form.userId} onChange={e => {setForm(f => ({...f, userId: e.target.value})); setFormErrors(e => ({...e, userId: undefined}));}}>
                {userOpts.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <FormError error={formErrors.userId}/>
            </div>
            <div className="form-group"><label>Period *</label>
              <select value={form.period} onChange={e => {setForm(f => ({...f, period: e.target.value})); setFormErrors(e => ({...e, period: undefined}));}}
                style={formErrors.period ? {borderColor:"#DC2626"} : {}}>
                {[...new Set([form.period, ...periodOptions].filter(Boolean))].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <FormError error={formErrors.period}/>
            </div>
          </div>
          <div className="form-group"><label>Product Focus</label>
            <select value={form.product} onChange={e => setForm(f => ({...f, product: e.target.value}))}>
              <option value="All">All Products</option>
              {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {(() => {
            const a = computeAchievement(form);
            const ro = { padding: "8px 10px", background: "var(--s2)", borderRadius: 6, fontWeight: 700, fontFamily: "'Outfit',sans-serif" };
            const note = { fontSize: 10, color: "var(--text3)", marginTop: 2 };
            return (
              <>
                <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",marginTop:14,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                  REVENUE TARGET <span style={{fontWeight:400,textTransform:"none"}}>· achieved is auto-calculated from won deals & call reports for {form.period || "the period"}</span>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Target Value (₹L) *</label>
                    <input type="number" min={0} step={1} value={form.targetValue} onChange={e => setForm(f => ({...f, targetValue: +e.target.value}))}/>
                    <FormError error={formErrors.targetValue}/>
                  </div>
                  <div className="form-group"><label>Achieved (auto)</label>
                    <div style={ro}>₹{a.achievedValue}L</div>
                    <div style={note}>{a.achievedDeals} won deal{a.achievedDeals===1?"":"s"} in {form.period||"period"}</div>
                  </div>
                </div>
                <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",marginTop:14,marginBottom:8}}>ACTIVITY TARGETS</div>
                <div className="form-row">
                  <div className="form-group"><label>Target Deals</label>
                    <input type="number" min={0} value={form.targetDeals} onChange={e => setForm(f => ({...f, targetDeals: +e.target.value}))}/>
                  </div>
                  <div className="form-group"><label>Achieved Deals (auto)</label>
                    <div style={ro}>{a.achievedDeals}</div>
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Target Calls</label>
                    <input type="number" min={0} value={form.targetCalls} onChange={e => setForm(f => ({...f, targetCalls: +e.target.value}))}/>
                  </div>
                  <div className="form-group"><label>Achieved Calls (auto)</label>
                    <div style={ro}>{a.achievedCalls}</div>
                  </div>
                </div>
              </>
            );
          })()}
        </Modal>
      )}

      {confirm && <Confirm title="Delete Target" msg="Remove this target entry?" onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)}/>}
    </div>
  );
}

export default Targets;
