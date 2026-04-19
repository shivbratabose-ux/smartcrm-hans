import { useState, useMemo } from "react";
import { Plus, Search, Edit2, Trash2, Check, Download, FileText, AlertTriangle, Calendar, ShieldCheck, Clock, AlertCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { PRODUCTS, PROD_MAP, TEAM, TEAM_MAP, BILL_TERMS, BILL_TYPES, CONTRACT_STATUSES, CONTRACT_DOC_TYPES } from '../data/constants';
import { BLANK_CONTRACT } from '../data/seed';
import { fmt, uid, today, sanitizeObj, hasErrors, softDeleteById } from '../utils/helpers';
import { ProdTag, UserPill, Modal, Confirm, FormError, Empty, StatusBadge } from './shared';
import Pagination, { usePagination } from './Pagination';
import { useSort, SortHeader } from './Sort';
import { exportCSV } from '../utils/csv';

const validateContract = (f) => {
  const errs = {};
  if (!f.title?.trim()) errs.title = "Contract title is required";
  if (!f.accountId) errs.accountId = "Account is required";
  if (f.status !== "Draft" && !f.startDate) errs.startDate = "Start date is required";
  if (f.value <= 0) errs.value = "Value must be greater than 0";
  if (f.startDate && f.endDate && f.endDate < f.startDate) errs.endDate = "End date must be on or after start date";
  return errs;
};

const CSV_COLS = [
  { label: "contractNo",      accessor: c => c.contractNo || "" },
  { label: "title",           accessor: c => c.title },
  { label: "accountId",       accessor: c => c.accountId || "" },
  { label: "product",         accessor: c => c.product },
  { label: "status",          accessor: c => c.status },
  { label: "value",           accessor: c => c.value },
  { label: "startDate",       accessor: c => c.startDate },
  { label: "endDate",         accessor: c => c.endDate },
  { label: "serviceStartDate",accessor: c => c.serviceStartDate || "" },
  { label: "commercialModel", accessor: c => c.commercialModel || "" },
  { label: "billingFrequency",accessor: c => c.billingFrequency || "" },
  { label: "paymentTerms",    accessor: c => c.paymentTerms || "" },
  { label: "currency",        accessor: c => c.currency || "INR" },
  { label: "noOfUsers",       accessor: c => c.noOfUsers || 0 },
  { label: "noOfBranches",    accessor: c => c.noOfBranches || 0 },
  { label: "renewalType",     accessor: c => c.renewalType || "" },
  { label: "autoRenewal",     accessor: c => c.autoRenewal || "No" },
  { label: "griApplicable",   accessor: c => c.griApplicable || "No" },
  { label: "griPercentage",   accessor: c => c.griPercentage || 0 },
  { label: "goLiveDate",      accessor: c => c.goLiveDate || "" },
  { label: "territory",       accessor: c => c.territory || "" },
  { label: "billTerm",        accessor: c => c.billTerm },
  { label: "billType",        accessor: c => c.billType },
  { label: "poNumber",        accessor: c => c.poNumber },
  { label: "renewalDate",     accessor: c => c.renewalDate },
];

/* Generate a contract ID in #FL-{YEAR}-{XXX} format */
const genContractId = (index) => {
  const yr = new Date(today).getFullYear();
  return `#FL-${yr}-${String(index + 1).padStart(3, '0')}`;
};

/* Timeline chart mock data for Q3/Q4 */
const timelineData = [
  { month: "Jul", contracts: 18 },
  { month: "Aug", contracts: 25 },
  { month: "Sep", contracts: 32 },
  { month: "Oct", contracts: 22 },
  { month: "Nov", contracts: 28 },
  { month: "Dec", contracts: 15 },
];

function Contracts({ contracts, setContracts, accounts, opps, currentUser, orgUsers, canDelete }) {
  const team = orgUsers?.length ? orgUsers.filter(u=>u.status!=='Inactive') : TEAM;
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("All");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK_CONTRACT);
  const [detail, setDetail] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [activeTab, setActiveTab] = useState("all"); // "all" | "drafts"

  const activeCount = contracts.filter(c => c.status === "Active").length;
  const pendingCount = contracts.filter(c => c.status === "Pending Approval").length;
  const draftCount = contracts.filter(c => c.status === "Draft").length;
  const expiringCount = contracts.filter(c => {
    if (!c.endDate || c.status !== "Active") return false;
    const d = new Date(c.endDate); const t = new Date(today);
    return (d - t) / (1000*60*60*24) <= 60;
  }).length;
  const totalValue = contracts.filter(c=>c.status==="Active").reduce((s,c)=>s+c.value,0);

  /* Avg renewal: average days between endDate and renewalDate for active contracts */
  const avgRenewal = useMemo(() => {
    const withRenewal = contracts.filter(c => c.status === "Active" && c.endDate && c.renewalDate);
    if (withRenewal.length === 0) return null;
    const total = withRenewal.reduce((sum, c) => {
      const diff = (new Date(c.renewalDate) - new Date(c.endDate)) / (1000*60*60*24);
      return sum + Math.abs(diff);
    }, 0);
    return Math.round(total / withRenewal.length);
  }, [contracts]);

  const enriched = useMemo(() => contracts.map((c, idx) => ({
    ...c,
    _accName: accounts.find(a => a.id === c.accountId)?.name || "\u2014",
    _contractId: genContractId(idx),
  })), [contracts, accounts]);

  const filtered = useMemo(() => {
    let list = [...enriched];
    // Tab filter
    if (activeTab === "drafts") list = list.filter(c => c.status === "Draft");
    // Status filter
    if (statusF !== "All") list = list.filter(c => c.status === statusF);
    if (search) list = list.filter(c => (c.title + c._accName + c.poNumber + c._contractId).toLowerCase().includes(search.toLowerCase()));
    return list.sort((a, b) => (b.startDate||"").localeCompare(a.startDate||""));
  }, [enriched, statusF, search, activeTab]);

  const sort = useSort();
  const sorted = useMemo(() => sort.key ? sort.apply(filtered) : filtered, [filtered, sort.key, sort.dir]);
  const pg = usePagination(sorted);

  const openAdd = () => {
    setForm({ ...BLANK_CONTRACT, id: `con${uid()}`, owner: currentUser });
    setFormErrors({});
    setModal({ mode: "add" });
  };
  const openEdit = (c) => { setForm({ ...c }); setFormErrors({}); setModal({ mode: "edit" }); };
  const save = () => {
    const errs = validateContract(form);
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    const clean = sanitizeObj(form);
    if (modal.mode === "add") setContracts(p => [...p, { ...clean }]);
    else setContracts(p => p.map(c => c.id === clean.id ? { ...clean } : c));
    setModal(null); setFormErrors({}); setDetail(null);
  };
  const del = (id) => { setContracts(p => softDeleteById(p, id, currentUser)); setConfirm(null); setDetail(null); };

  const statusColor = (s) => ({
    "Draft":"#94A3B8","Pending Approval":"#F59E0B","Active":"#22C55E","Expired":"#EF4444","Terminated":"#DC2626"
  }[s] || "#94A3B8");

  /* Map status to design badge style */
  const statusBadgeStyle = (s) => {
    const map = {
      "Active": { bg: "#DCFCE7", color: "#15803D", dot: "#22C55E" },
      "Expired": { bg: "#FEF2F2", color: "#B91C1C", dot: "#EF4444" },
      "Draft": { bg: "#F1F5F9", color: "#475569", dot: "#94A3B8" },
      "Pending Approval": { bg: "#FEF3C7", color: "#92400E", dot: "#F59E0B" },
      "Terminated": { bg: "#FEF2F2", color: "#991B1B", dot: "#DC2626" },
    };
    return map[s] || map["Draft"];
  };

  /* Format expiry display */
  const fmtExpiry = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  };

  /* Determine billing type label */
  const billTypeLabel = (c) => c.billType || c.billTerm || "\u2014";

  /* Risk alerts count (expired + terminated) */
  const riskAlerts = contracts.filter(c => c.status === "Expired" || c.status === "Terminated").length;

  return (
    <div>
      {/* ──── HEADER WITH KPI CARDS ──── */}
      <div className="pg-head" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div className="pg-title">Contracts</div>
          <div className="pg-sub">
            {activeCount} active (₹{totalValue}L) · {pendingCount} pending
            {expiringCount > 0 && <span style={{color:"var(--amber)",fontWeight:700}}> · {expiringCount} expiring soon</span>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {/* KPI Card: Active Contracts */}
          <div style={{
            background: "#1B6B5A", color: "#fff", borderRadius: 12, padding: "16px 24px",
            minWidth: 160, display: "flex", flexDirection: "column", gap: 4
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", opacity: 0.85 }}>Active Contracts</span>
            <span style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Outfit',sans-serif", lineHeight: 1.1 }}>{activeCount}</span>
          </div>
          {/* KPI Card: Avg Renewal */}
          <div style={{
            background: "#1B6B5A", color: "#fff", borderRadius: 12, padding: "16px 24px",
            minWidth: 160, display: "flex", flexDirection: "column", gap: 4
          }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", opacity: 0.85 }}>Avg. Renewal</span>
            <span style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Outfit',sans-serif", lineHeight: 1.1 }}>{avgRenewal !== null ? <>{avgRenewal} <span style={{ fontSize: 14, fontWeight: 500 }}>Days</span></> : <span style={{fontSize:16,opacity:0.6}}>N/A</span>}</span>
          </div>
          {/* Action buttons */}
          <div className="pg-actions" style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-sec" onClick={() => exportCSV(filtered, CSV_COLS, "contracts")}><Download size={14}/>Export</button>
            <button className="btn btn-primary" onClick={openAdd}><Plus size={14}/>New Contract</button>
          </div>
        </div>
      </div>

      {/* ──── CONTRACT TIMELINE + COMPLIANCE STATUS ──── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, marginBottom: 16 }}>
        {/* Timeline Chart */}
        <div className="card" style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text1)" }}>Contract Timeline</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Q3 2024 / Q4 2024</div>
            </div>
            <Calendar size={16} style={{ color: "var(--text3)" }} />
          </div>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineData} barCategoryGap="20%">
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#94A3B8" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94A3B8" }} width={30} />
                <Tooltip
                  contentStyle={{ background: "#1E293B", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 }}
                  labelStyle={{ color: "#94A3B8" }}
                  cursor={{ fill: "rgba(27,107,90,0.08)" }}
                />
                <Bar dataKey="contracts" fill="#1B6B5A" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Compliance Status Panel */}
        <div className="card" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text1)" }}>Compliance Status</div>

          {/* Regulatory Audit */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={18} style={{ color: "#1B6B5A" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text1)" }}>Regulatory Audit</span>
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
              background: "#DCFCE7", color: "#15803D"
            }}>Passed</span>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", margin: 0 }} />

          {/* Pending Review */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={16} style={{ color: "#F59E0B" }} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--text3)" }}>Pending Review</div>
              </div>
            </div>
            <span style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Outfit',sans-serif", color: "#F59E0B" }}>{pendingCount || 12}</span>
          </div>

          {/* Risk Alerts */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <AlertCircle size={16} style={{ color: "#EF4444" }} />
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--text3)" }}>Risk Alerts</div>
              </div>
            </div>
            <span style={{ fontSize: 24, fontWeight: 800, fontFamily: "'Outfit',sans-serif", color: "#EF4444" }}>{String(riskAlerts).padStart(2, '0')}</span>
          </div>
        </div>
      </div>

      {/* ──── AGREEMENT LEDGER ──── */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text1)", marginBottom: 12 }}>Agreement Ledger</div>
        {/* Tabs: All Contracts / Drafts */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 12, borderBottom: "2px solid var(--border)" }}>
          <button
            onClick={() => setActiveTab("all")}
            style={{
              padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: "none", border: "none",
              color: activeTab === "all" ? "#1B6B5A" : "var(--text3)",
              borderBottom: activeTab === "all" ? "2px solid #1B6B5A" : "2px solid transparent",
              marginBottom: -2
            }}
          >All Contracts</button>
          <button
            onClick={() => setActiveTab("drafts")}
            style={{
              padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: "none", border: "none",
              color: activeTab === "drafts" ? "#1B6B5A" : "var(--text3)",
              borderBottom: activeTab === "drafts" ? "2px solid #1B6B5A" : "2px solid transparent",
              marginBottom: -2
            }}
          >Drafts {draftCount > 0 && <span style={{ fontSize: 11, background: "#F1F5F9", color: "#475569", borderRadius: 10, padding: "1px 7px", marginLeft: 4 }}>{draftCount}</span>}</button>
        </div>
      </div>

      <div className="filter-bar">
        {["All",...CONTRACT_STATUSES].map(s => (
          <button key={s} className={`btn btn-sm ${statusF===s?"btn-primary":"btn-sec"}`} onClick={() => setStatusF(s)}>{s}</button>
        ))}
        <div className="filter-search" style={{maxWidth:220}}>
          <Search size={14} style={{color:"var(--text3)",flexShrink:0}}/>
          <input placeholder="Search contracts..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
      </div>

      <div className="card" style={{padding:0}}>
        {filtered.length === 0 ? (
          <Empty icon={<FileText size={22}/>} title="No contracts found" sub="Create your first contract."/>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th><SortHeader sort={sort} k="_contractId">Contract ID</SortHeader></th>
                <th><SortHeader sort={sort} k="_accName">Account Name</SortHeader></th>
                <th>Vertical Head</th>
                <th><SortHeader sort={sort} k="startDate">Timeline</SortHeader></th>
                <th><SortHeader sort={sort} k="billType">Billing Type</SortHeader></th>
                <th><SortHeader sort={sort} k="status">Status</SortHeader></th>
                <th><SortHeader sort={sort} k="value">Value</SortHeader></th>
                <th><SortHeader sort={sort} k="owner">Owner</SortHeader></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pg.paged.map(c => {
                const expiring = c.endDate && c.status === "Active" && ((new Date(c.endDate) - new Date(today)) / (1000*60*60*24)) <= 60;
                const badge = statusBadgeStyle(c.status);
                return (
                  <tr key={c.id}>
                    <td>
                      <span className="tbl-link" onClick={() => setDetail(c)} style={{ fontWeight: 700, fontSize: 13, fontFamily: "'Outfit',sans-serif" }}>{c._contractId}</span>
                      {c.docType && <div style={{fontSize:11,color:"var(--text3)"}}>{c.docType}</div>}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{c._accName}</span>
                      <div style={{ fontSize: 11, color: "var(--text3)" }}>{c.title}</div>
                    </td>
                    <td><UserPill uid={c.owner}/></td>
                    <td style={{ fontSize: 12, color: "var(--text2)" }}>
                      <div>{c.startDate ? fmt.short(c.startDate) : "\u2014"}</div>
                      {c.endDate && (
                        <div style={{ fontSize: 11, color: expiring ? "#F59E0B" : "var(--text3)" }}>
                          {expiring ? "Exp: " : "Expiry: "}{fmtExpiry(c.endDate)}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--text3)" }}>{billTypeLabel(c)}</td>
                    <td>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
                        background: badge.bg, color: badge.color
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: badge.dot, flexShrink: 0 }} />
                        {c.status === "Pending Approval" ? "Client Review" : c.status === "Draft" ? "Drafting" : c.status}
                        {expiring && <AlertTriangle size={11}/>}
                      </span>
                    </td>
                    <td style={{fontFamily:"'Outfit',sans-serif",fontWeight:700}}>₹{c.value}L</td>
                    <td><UserPill uid={c.owner}/></td>
                    <td>
                      <div style={{display:"flex",gap:4}}>
                        <button className="icon-btn" aria-label="Edit" onClick={() => openEdit(c)}><Edit2 size={14}/></button>
                        {canDelete && <button className="icon-btn" aria-label="Delete" onClick={() => setConfirm(c.id)}><Trash2 size={14}/></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Pagination {...pg}/>
      </div>

      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)} lg
          footer={<>
            <button className="btn btn-sec btn-sm" onClick={() => setDetail(null)}>Close</button>
            <button className="btn btn-primary btn-sm" onClick={() => { openEdit(detail); setDetail(null); }}><Edit2 size={13}/>Edit</button>
          </>}>
          <div className="dp-grid">
            {[
              ["Contract ID", detail._contractId],
              ["Account", detail._accName],
              ["Product", PROD_MAP[detail.product]?.name || detail.product],
              ["Status", detail.status],
              ["Value", `₹${detail.value}L`],
              ["Bill Term", detail.billTerm],
              ["Bill Type", detail.billType],
              ["Start Date", fmt.date(detail.startDate)],
              ["End Date", fmt.date(detail.endDate)],
              ["PO Number", detail.poNumber || "\u2014"],
              ["Doc Type", detail.docType],
              ["Approval Stage", detail.approvalStage || "\u2014"],
              ["Renewal Date", detail.renewalDate ? fmt.date(detail.renewalDate) : "\u2014"],
              ["Owner", TEAM_MAP[detail.owner]?.name || "\u2014"],
            ].map(([k, v]) => (
              <div key={k} className="dp-row"><span className="dp-key">{k}</span><span className="dp-val">{v}</span></div>
            ))}
          </div>
          {detail.terms && (
            <div style={{marginTop:14,background:"var(--s2)",padding:"10px 12px",borderRadius:8,borderLeft:"3px solid var(--brand)",fontSize:13,color:"var(--text2)"}}>
              <strong>Terms:</strong> {detail.terms}
            </div>
          )}
        </Modal>
      )}

      {modal && (
        <Modal title={modal.mode === "add" ? "New Contract" : "Edit Contract"} onClose={() => { setModal(null); setFormErrors({}); setForm(BLANK_CONTRACT); }} lg
          footer={<>
            <button className="btn btn-sec" onClick={() => { setModal(null); setFormErrors({}); setForm(BLANK_CONTRACT); }}>Cancel</button>
            <button className="btn btn-primary" onClick={save}><Check size={14}/>Save</button>
          </>}>
          <div className="form-row full"><div className="form-group"><label>Contract Title *</label>
            <input value={form.title} onChange={e => {setForm(f => ({...f, title: e.target.value})); setFormErrors(e => ({...e, title: undefined}));}}
              placeholder="e.g. WiseDox Phase 2 \u2013 CBIC" style={formErrors.title ? {borderColor:"#DC2626"} : {}}/>
            <FormError error={formErrors.title}/>
          </div></div>
          <div className="form-row">
            <div className="form-group"><label>Account *</label>
              <select value={form.accountId} onChange={e => {setForm(f => ({...f, accountId: e.target.value})); setFormErrors(e => ({...e, accountId: undefined}));}}
                style={formErrors.accountId ? {borderColor:"#DC2626"} : {}}>
                <option value="">Select account...</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <FormError error={formErrors.accountId}/>
            </div>
            <div className="form-group"><label>Linked Opportunity</label>
              <select value={form.oppId} onChange={e => setForm(f => ({...f, oppId: e.target.value}))}>
                <option value="">None</option>
                {opps.filter(o => !form.accountId || o.accountId === form.accountId).map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row three">
            <div className="form-group"><label>Product</label>
              <select value={form.product} onChange={e => setForm(f => ({...f, product: e.target.value}))}>
                {PRODUCTS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Status</label>
              <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
                {CONTRACT_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Doc Type</label>
              <select value={form.docType} onChange={e => setForm(f => ({...f, docType: e.target.value}))}>
                {CONTRACT_DOC_TYPES.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row three">
            <div className="form-group"><label>Value (₹L) *</label>
              <input type="number" min={0} step={0.5} value={form.value} onChange={e => setForm(f => ({...f, value: +e.target.value}))}/>
              <FormError error={formErrors.value}/>
            </div>
            <div className="form-group"><label>Bill Term</label>
              <select value={form.billTerm} onChange={e => setForm(f => ({...f, billTerm: e.target.value}))}>
                {BILL_TERMS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Bill Type</label>
              <select value={form.billType} onChange={e => setForm(f => ({...f, billType: e.target.value}))}>
                {BILL_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row three">
            <div className="form-group"><label>Start Date {form.status !== "Draft" ? "*" : ""}</label>
              <input type="date" value={form.startDate} onChange={e => {setForm(f => ({...f, startDate: e.target.value})); setFormErrors(e => ({...e, startDate: undefined}));}}
                style={formErrors.startDate ? {borderColor:"#DC2626"} : {}}/>
              <FormError error={formErrors.startDate}/>
            </div>
            <div className="form-group"><label>End Date</label>
              <input type="date" value={form.endDate} onChange={e => setForm(f => ({...f, endDate: e.target.value}))}/>
            </div>
            <div className="form-group"><label>Renewal Date</label>
              <input type="date" value={form.renewalDate} onChange={e => setForm(f => ({...f, renewalDate: e.target.value}))}/>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>PO Number</label>
              <input value={form.poNumber} onChange={e => setForm(f => ({...f, poNumber: e.target.value}))} placeholder="PO-XXXX-XXXX"/>
            </div>
            <div className="form-group"><label>Owner</label>
              <select value={form.owner} onChange={e => setForm(f => ({...f, owner: e.target.value}))}>
                {team.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group"><label>Terms & Conditions</label>
            <textarea rows={3} value={form.terms} onChange={e => setForm(f => ({...f, terms: e.target.value}))}
              placeholder="Payment terms, SLA guarantees, penalty clauses..." style={{width:"100%",resize:"vertical"}}/>
          </div>
        </Modal>
      )}

      {confirm && <Confirm title="Delete Contract" msg="Remove this contract permanently?" onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)}/>}
    </div>
  );
}

export default Contracts;
