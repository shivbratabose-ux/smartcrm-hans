import { useState, useMemo } from "react";
import { Plus, Edit2, Trash2, Check, Download, Target, TrendingUp, TrendingDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { PRODUCTS, PROD_MAP, TEAM, TEAM_MAP } from '../data/constants';
import { BLANK_TARGET } from '../data/seed';
import { uid, sanitizeObj, hasErrors, softDeleteById } from '../utils/helpers';
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
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK_TARGET);
  const [confirm, setConfirm] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  // Live-user helpers (fall back to the static seed when orgUsers is empty).
  const userOpts = (orgUsers && orgUsers.length ? orgUsers.filter(u => u.active !== false) : TEAM);
  const userName = (id) => (orgUsers || []).find(u => u.id === id)?.name || TEAM_MAP[id]?.name || id || "";

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
    return list;
  }, [enriched, periodF]);

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
          <button className="btn btn-sec" onClick={() => exportCSV(filtered, CSV_COLS, "targets")}><Download size={14}/>Export</button>
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

      <div className="filter-bar">
        <select className="filter-select" value={periodF} onChange={e => setPeriodF(e.target.value)}>
          <option value="All">All Periods</option>
          {periods.map(p => <option key={p}>{p}</option>)}
        </select>
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
                    <td style={{fontSize:12.5,fontWeight:600}}>{t.period}</td>
                    <td style={{fontSize:12}}>{t.product === "All" ? "All Products" : (PROD_MAP[t.product]?.name || t.product)}</td>
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
