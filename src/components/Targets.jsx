import { useState, useMemo } from "react";
import { Plus, Edit2, Trash2, Check, Download, Target, TrendingUp, TrendingDown, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { PRODUCTS, PROD_MAP, TEAM, TEAM_MAP } from '../data/constants';
import { BLANK_TARGET } from '../data/seed';
import { uid, sanitizeObj, hasErrors, softDeleteById, getScopedUserIds } from '../utils/helpers';
import { UserPill, Modal, Confirm, FormError, Empty } from './shared';
import Pagination, { usePagination } from './Pagination';
import { exportCSV } from '../utils/csv';

// Column 0 (Salesperson) is supplied by the Export button instead, which
// resolves names from LIVE users — this static TEAM_MAP left every real
// Supabase user blank. Kept as the shared tail via CSV_COLS.slice(1).
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
//
// Reads the calendar fields straight out of a "YYYY-MM-DD" string rather than
// going through `new Date(...)`, which parses a bare date as UTC midnight.
// That matters more here than anywhere else in the app: this function decides
// which fiscal quarter a won deal books to, and west of UTC a deal closing on
// 1 April was pushed back into the PREVIOUS financial year's Q4. Reading the
// string is also exactly right for a DATE column, which stores a calendar day
// and not an instant.
function periodOf(dateStr) {
  if (!dateStr) return "";
  let y, mo;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
  if (m) {
    y = Number(m[1]); mo = Number(m[2]) - 1;
  } else {
    const d = new Date(dateStr);            // full timestamp or other format
    if (isNaN(d)) return "";
    y = d.getFullYear(); mo = d.getMonth();
  }
  if (mo < 0 || mo > 11) return "";
  const fyStart = mo >= 3 ? y : y - 1;
  const q = Math.floor(((mo - 3 + 12) % 12) / 3) + 1;
  return `${fyStart}-Q${q}`;
}

// Stage names meaning "won", whatever Masters currently calls the stage.
// Pipeline stages are editable in Masters → Pipeline Stages, and Pipeline
// resolves the won stage by `kind === "won"` precisely so a rename cannot
// break forecasting. Targets compared against the literal "Won", so renaming
// the stage silently dropped every target on this page to 0% with no error.
//
// The legacy literals stay in the match set because opportunity rows keep
// whatever stage string they were saved with — renaming a stage in Masters
// does not rewrite history, so both the configured name and the old one count.
const LEGACY_WON_STAGES = ["Won", "closed_won"];
const wonStageNames = (masters) => {
  const won = Array.isArray(masters?.stages) ? masters.stages.find(s => s?.kind === "won") : null;
  return new Set([won?.name, ...LEGACY_WON_STAGES].filter(Boolean));
};
// A target's product focus matches an item with a products[] array (opps) or
// a single product + productSelection[] (call reports). "All" matches everything.
const prodMatches = (tProd, arr, single) => {
  if (!tProd || tProd === "All") return true;
  if (Array.isArray(arr) && arr.includes(tProd)) return true;
  return single === tProd;
};

function Targets({ targets, setTargets, opps = [], callReports = [], orgUsers = [], currentUser, canDelete, masters, canWrite = true }) {
  const [periodF, setPeriodF] = useState("All");
  // Product + line-manager filters: lets leadership see "iCAFFE targets for
  // Lalchand's team" rather than one flat list.
  const [productF, setProductF] = useState("All");
  const [teamF, setTeamF] = useState("All");
  // Rollup mode: direct reports only (rows sum to the page total) vs the full
  // branch (everyone beneath a manager at any depth — what a sales head needs,
  // but nested teams are counted in the parent so rows deliberately overlap).
  const [branchMode, setBranchMode] = useState(false);
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
  // Sales-leadership roles only. The rollup is a SALES target view, so it tops
  // out at VP Sales & Marketing — the MD, Finance and Product Head aren't
  // sales line managers and their rows only muddied the picture. Adjust this
  // list if the org adds a sales-leadership role.
  const SALES_LEAD_ROLES = ["vp_sales_mkt", "director", "line_mgr", "country_mgr", "bd_lead"];
  const managers = useMemo(() => {
    const all = userOpts;
    return all.filter(m =>
        SALES_LEAD_ROLES.includes(String(m.role || "").trim().toLowerCase()) &&
        all.some(u => u.id !== m.id && (u.reportsTo === m.id || (Array.isArray(u.dottedTo) && u.dottedTo.includes(m.id)))))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [orgUsers]);
  const teamIds = useMemo(() => teamF === "All" ? null : getScopedUserIds(teamF, orgUsers), [teamF, orgUsers]);
  // Direct manager of a user — shown as a column so every target says which
  // line manager owns it.
  const managerOf = (uid) => {
    const u = (orgUsers || []).find(x => x.id === uid);
    return u?.reportsTo ? userName(u.reportsTo) : "";
  };

  // Won-stage names resolved from Masters, so renaming the stage doesn't
  // silently zero this page. See wonStageNames().
  const wonNames = useMemo(() => wonStageNames(masters), [masters]);
  const isWon = (o) => wonNames.has(o?.stage);

  // Auto-compute achievement for a target from won opps (revenue + deal count)
  // and call reports (calls), matched on owner × fiscal-quarter × product.
  const computeAchievement = (t) => {
    let rev = 0, deals = 0, calls = 0;
    (opps || []).forEach(o => {
      if (o.owner !== t.userId || !isWon(o)) return;
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
  const enriched = useMemo(() => targets.map(t => ({ ...t, ...computeAchievement(t) })), [targets, opps, callReports, wonNames]);

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

  // ── Overlapping commitments ──
  // Nothing stops two targets covering the same salesperson, period and
  // product — the live data already carries a pair like that. Because
  // achievement is computed PER TARGET, both rows claim the same won deals,
  // so the old `sum of every row's achieved` double-counted them. A softer
  // version of the same problem: an "All Products" target and a
  // product-specific one for the same person and period both match that
  // product's deals.
  //
  // Exact duplicates are now blocked on save and flagged below; for anything
  // already in the data, the KPI cards count each won deal ONCE instead of
  // once per matching target.
  const dupKeys = useMemo(() => {
    const seen = {};
    filtered.forEach(t => {
      const k = `${t.userId}|${t.period}|${t.product || "All"}`;
      seen[k] = (seen[k] || 0) + 1;
    });
    return new Set(Object.keys(seen).filter(k => seen[k] > 1));
  }, [filtered]);
  const keyOf = (t) => `${t.userId}|${t.period}|${t.product || "All"}`;

  // People holding both a company-wide and a product-specific target in the
  // same period — legitimate (a split quota), but their achievement overlaps.
  const overlapCount = useMemo(() => {
    const wide = new Set(), narrow = new Set();
    filtered.forEach(t => {
      const k = `${t.userId}|${t.period}`;
      (!t.product || t.product === "All" ? wide : narrow).add(k);
    });
    return [...narrow].filter(k => wide.has(k)).length;
  }, [filtered]);

  // Summary KPIs. Targets sum normally (each is a distinct commitment);
  // achievement is deduplicated by deal so overlapping targets can't inflate
  // it. Number() guards a value arriving as a string from CSV import, and the
  // rounding keeps float noise (17.850000000000001) off the cards.
  const totalTarget = +filtered.reduce((s, t) => s + (Number(t.targetValue) || 0), 0).toFixed(2);
  const totalTargetDeals = filtered.reduce((s, t) => s + (Number(t.targetDeals) || 0), 0);
  const achievedTotals = useMemo(() => {
    const counted = new Set();
    let value = 0, deals = 0;
    (opps || []).forEach(o => {
      if (!o?.id || counted.has(o.id) || !isWon(o)) return;
      const per = periodOf(o.closeDate);
      if (!per) return;
      const matches = filtered.some(t =>
        t.userId === o.owner && t.period === per && prodMatches(t.product, o.products));
      if (!matches) return;
      counted.add(o.id);
      value += Number(o.value) || 0;
      deals += 1;
    });
    return { value: +value.toFixed(2), deals };
  }, [filtered, opps, wonNames]);
  const totalAchieved = achievedTotals.value;
  const totalAchievedDeals = achievedTotals.deals;
  const overallPct = totalTarget > 0 ? ((totalAchieved / totalTarget) * 100).toFixed(0) : 0;

  // Won deals that can't be booked to any quarter because they have no close
  // date. They are silently absent from every attainment figure, so say so.
  const undatedWon = useMemo(
    () => (opps || []).filter(o => isWon(o) && !periodOf(o.closeDate)).length,
    [opps, wonNames]);

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

  // ── Rollup by line manager ──
  // Each target is credited to the OWNER'S line manager (users.reportsTo), so
  // a manager's row is their whole team's commitment vs achievement. Targets
  // whose owner has no manager (top of the org, or reportsTo unset) group
  // under "— No line manager —" so nothing is silently dropped and the rows
  // always add up to the page totals.
  const byManager = useMemo(() => {
    const users = orgUsers || [];
    const sum = (ids) => filtered.reduce((acc, t) => {
      if (!ids.has(t.userId)) return acc;
      acc.target += Number(t.targetValue) || 0;
      acc.achieved += Number(t.achievedValue) || 0;
      acc.deals += Number(t.targetDeals) || 0;
      acc.wonDeals += Number(t.achievedDeals) || 0;
      acc.people.add(t.userId);
      return acc;
    }, { target: 0, achieved: 0, deals: 0, wonDeals: 0, people: new Set() });

    const byId = Object.fromEntries(users.map(u => [u.id, u]));
    const gridIds = new Set(managers.map(m => m.id));
    // Credit a target to the NEAREST sales manager at or above its owner.
    // Walking up matters because the person directly above may be outside the
    // sales grid (e.g. a rep's VP reports to the MD): the target then lands on
    // the highest sales manager instead of falling into "no line manager".
    // A manager with no sales manager above them keeps their own quota.
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
    // Direct mode: each target counted exactly once, so rows reconcile.
    const credited = {};
    filtered.forEach(t => {
      const key = creditOf(t.userId);
      if (!credited[key]) credited[key] = { target: 0, achieved: 0, deals: 0, wonDeals: 0, people: new Set() };
      const c = credited[key];
      c.target += Number(t.targetValue) || 0;
      c.achieved += Number(t.achievedValue) || 0;
      c.deals += Number(t.targetDeals) || 0;
      c.wonDeals += Number(t.achievedDeals) || 0;
      c.people.add(t.userId);
    });
    const blank = { target: 0, achieved: 0, deals: 0, wonDeals: 0, people: new Set() };

    // EVERY sales manager gets a row — including ones with no targets yet, so
    // missing commitments are visible instead of the manager silently absent.
    const rows = managers.map(m => {
      // Full branch = the manager + every direct/indirect report. This is what
      // a sales head needs: a direct-only number would exclude the whole org
      // beneath their line managers.
      const branchIds = getScopedUserIds(m.id, users);
      const b = sum(branchIds);
      const d = credited[m.id] || blank;
      const pick = branchMode ? b : d;
      const headIds = branchMode ? new Set([...branchIds].filter(id => id !== m.id)) : d.people;
      return {
        mgrId: m.id, role: m.role || "",
        headcount: headIds.size,
        target: pick.target, achieved: pick.achieved, deals: pick.deals, wonDeals: pick.wonDeals,
        pct: pick.target > 0 ? Math.round((pick.achieved / pick.target) * 100) : null,
      };
    });

    // Anything that couldn't be credited to a sales manager stays visible.
    const o = credited["__none"];
    if (o && o.target + o.achieved > 0) {
      rows.push({ mgrId: "__none", role: "", headcount: o.people.size, target: o.target, achieved: o.achieved,
        deals: o.deals, wonDeals: o.wonDeals, pct: o.target > 0 ? Math.round((o.achieved / o.target) * 100) : null });
    }
    return rows.sort((a, b) => b.target - a.target || a.headcount - b.headcount);
  }, [filtered, orgUsers, managers, branchMode]);

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
    // One commitment per salesperson × period × product. A second one does not
    // mean "a bigger target" — achievement is computed per target, so the two
    // rows claim the same won deals and every roll-up above counts them twice.
    // Checked against ALL targets, not the filtered view, so a duplicate
    // hidden by the current filters is still caught.
    const dupe = targets.find(t =>
      t.id !== form.id && !t.isDeleted &&
      t.userId === form.userId &&
      t.period === form.period &&
      (t.product || "All") === (form.product || "All"));
    if (dupe) {
      errs.period = `${userName(form.userId)} already has a ${(!form.product || form.product === "All") ? "company-wide" : (PROD_MAP[form.product]?.name || form.product)} target for ${form.period} (₹${dupe.targetValue}L). Edit that one instead — a second target double-counts the same won deals.`;
    }
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
          {canWrite && <button className="btn btn-primary" onClick={openAdd}><Plus size={14}/>Add Target</button>}
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

      {/* ── Rollup by line manager ── team commitment vs achievement ── */}
      {byManager.length > 0 && (
        <div className="card" style={{padding:0, marginBottom:16}}>
          <div style={{padding:"10px 14px", borderBottom:"1px solid var(--border)", fontSize:13, fontWeight:700, color:"var(--text1)", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
            <Users size={15} style={{color:"var(--brand)"}}/> Rollup by line manager
            <span style={{fontSize:11, fontWeight:400, color:"var(--text3)"}}>
              {branchMode ? "full branch — includes every level beneath the manager" : "direct reports only — rows add up to the totals above"} · reflects the filters below
            </span>
            <div style={{marginLeft:"auto", display:"flex", gap:0, border:"1.5px solid var(--border)", borderRadius:6, overflow:"hidden"}}>
              <button onClick={() => setBranchMode(false)} style={{fontSize:11, padding:"4px 10px", fontWeight:600, cursor:"pointer", border:"none", background: branchMode ? "#fff" : "var(--brand)", color: branchMode ? "var(--text2)" : "#fff"}}>Direct</button>
              <button onClick={() => setBranchMode(true)} style={{fontSize:11, padding:"4px 10px", fontWeight:600, cursor:"pointer", border:"none", background: branchMode ? "var(--brand)" : "#fff", color: branchMode ? "#fff" : "var(--text2)"}}>Full branch</button>
            </div>
          </div>
          <div style={{overflowX:"auto"}}>
            <table className="tbl" style={{minWidth:620}}>
              <thead>
                <tr>
                  <th>Line Manager</th>
                  <th>Role</th>
                  <th style={{textAlign:"right"}}>{branchMode ? "Branch" : "Reports"}</th>
                  <th style={{textAlign:"right"}}>Target (₹L)</th>
                  <th style={{textAlign:"right"}}>Achieved (₹L)</th>
                  <th style={{textAlign:"right"}}>Gap (₹L)</th>
                  <th>Attainment</th>
                  <th style={{textAlign:"right"}}>Deals (T/A)</th>
                </tr>
              </thead>
              <tbody>
                {byManager.map(r => {
                  const gap = r.target - r.achieved;
                  return (
                    <tr key={r.mgrId} style={{cursor: r.mgrId !== "__none" ? "pointer" : "default"}}
                      onClick={() => r.mgrId !== "__none" && setTeamF(teamF === r.mgrId ? "All" : r.mgrId)}
                      title={r.mgrId !== "__none" ? "Click to filter the page to this team" : ""}>
                      <td style={{fontWeight:600}}>{r.mgrId === "__none" ? <span style={{color:"var(--text3)"}}>— Outside sales line —</span> : userName(r.mgrId)}</td>
                      <td style={{fontSize:11, color:"var(--text3)"}}>{(r.role || "").replace(/_/g," ") || "—"}</td>
                      <td style={{textAlign:"right"}}>{r.headcount}</td>
                      <td style={{textAlign:"right", fontFamily:"'Outfit',sans-serif", fontWeight:700}}>₹{r.target}L</td>
                      <td style={{textAlign:"right", fontFamily:"'Outfit',sans-serif", color:pctColor(r.pct ?? 0)}}>₹{r.achieved}L</td>
                      <td style={{textAlign:"right", fontFamily:"'Outfit',sans-serif", color: gap > 0 ? "var(--red)" : "var(--green)"}}>₹{gap.toFixed(1)}L</td>
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
                      <td style={{textAlign:"right", fontSize:12, color:"var(--text3)"}}>{r.deals}/{r.wonDeals}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {branchMode && (
            <div style={{padding:"8px 14px", fontSize:11, color:"var(--text3)", borderTop:"1px solid var(--border)"}}>
              Nested teams are counted inside their parent manager, so these rows overlap — don't add them up. Switch to <b>Direct</b> for figures that reconcile with the totals above.
            </div>
          )}
        </div>
      )}

      {/* Data-quality notices — these distort attainment, so say so rather
          than letting the numbers quietly disagree with the pipeline. */}
      {(dupKeys.size > 0 || overlapCount > 0 || undatedWon > 0) && (
        <div style={{marginBottom:12, padding:"10px 14px", borderRadius:8, border:"1px solid #F59E0B55", background:"#FFFBEB", fontSize:12, color:"#92400E", display:"flex", flexDirection:"column", gap:4}}>
          {dupKeys.size > 0 && (
            <div><b>{dupKeys.size} duplicate commitment{dupKeys.size === 1 ? "" : "s"}</b> — the same salesperson, period and product appears on more than one row (marked <b>duplicate</b> below). Each row claims the same won deals, so per-row attainment is inflated. Keep one and delete the rest.</div>
          )}
          {overlapCount > 0 && (
            <div><b>{overlapCount} overlapping commitment{overlapCount === 1 ? "" : "s"}</b> — someone holds a company-wide target and a product target for the same period, so that product's deals count toward both rows.</div>
          )}
          {undatedWon > 0 && (
            <div><b>{undatedWon} won deal{undatedWon === 1 ? "" : "s"} with no close date</b> — they can't be booked to a quarter and are missing from every figure here. Set a close date on the deal to include them.</div>
          )}
          <div style={{color:"#B45309"}}>The cards above already count each won deal once, so they stay correct regardless.</div>
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
                    <td>
                      <UserPill uid={t.userId}/>
                      {dupKeys.has(keyOf(t)) && (
                        <span title="Another target covers the same salesperson, period and product. Both claim the same won deals."
                          style={{marginLeft:6, fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:4, color:"#92400E", background:"#F59E0B22", verticalAlign:"middle"}}>
                          duplicate
                        </span>
                      )}
                    </td>
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
                        {canWrite && <button className="icon-btn" aria-label="Edit" onClick={() => openEdit(t)}><Edit2 size={14}/></button>}
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
