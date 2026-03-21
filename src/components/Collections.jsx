import { useState, useMemo } from "react";
import { Plus, Search, Edit2, Trash2, Check, Download, DollarSign, AlertCircle, TrendingUp } from "lucide-react";
import { TEAM, TEAM_MAP, COLLECTION_STATUSES, PAYMENT_MODES, AGEING_BUCKETS } from '../data/constants';
import { BLANK_COLLECTION } from '../data/seed';
import { fmt, uid, today, sanitizeObj, hasErrors } from '../utils/helpers';
import { UserPill, Modal, Confirm, FormError, Empty } from './shared';
import Pagination, { usePagination } from './Pagination';
import { exportCSV } from '../utils/csv';

const validateCollection = (f) => {
  const errs = {};
  if (!f.invoiceNo?.trim()) errs.invoiceNo = "Invoice number is required";
  if (!f.accountId) errs.accountId = "Account is required";
  if (!f.invoiceDate) errs.invoiceDate = "Invoice date is required";
  if (!f.dueDate) errs.dueDate = "Due date is required";
  if (f.billedAmount <= 0) errs.billedAmount = "Billed amount must be greater than 0";
  return errs;
};

const CSV_COLS = [
  { label: "Invoice #", accessor: c => c.invoiceNo },
  { label: "Account", accessor: c => c._accName || "" },
  { label: "Invoice Date", accessor: c => c.invoiceDate },
  { label: "Due Date", accessor: c => c.dueDate },
  { label: "Billed (Cr)", accessor: c => c.billedAmount },
  { label: "Collected (Cr)", accessor: c => c.collectedAmount },
  { label: "Pending (Cr)", accessor: c => c.pendingAmount },
  { label: "Status", accessor: c => c.status },
  { label: "Payment Mode", accessor: c => c.paymentMode },
  { label: "Ageing", accessor: c => c._ageing || "" },
];

const getAgeing = (dueDate) => {
  if (!dueDate) return "—";
  const days = Math.floor((new Date(today) - new Date(dueDate)) / (1000*60*60*24));
  if (days <= 0) return "Current";
  if (days <= 30) return "0-30";
  if (days <= 60) return "30-60";
  if (days <= 90) return "60-90";
  if (days <= 120) return "90-120";
  if (days <= 180) return "120-180";
  return "180+";
};

const ageingColor = (a) => ({
  "Current":"#22C55E","0-30":"#F59E0B","30-60":"#F97316","60-90":"#EF4444","90-120":"#DC2626","120-180":"#991B1B","180+":"#450A0A"
}[a] || "#94A3B8");

function Collections({ collections, setCollections, accounts, contracts, currentUser }) {
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("All");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK_COLLECTION);
  const [confirm, setConfirm] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  const enriched = useMemo(() => collections.map(c => ({
    ...c,
    _accName: accounts.find(a => a.id === c.accountId)?.name || "—",
    _ageing: c.pendingAmount > 0 ? getAgeing(c.dueDate) : "Current"
  })), [collections, accounts]);

  const totalBilled = collections.reduce((s, c) => s + c.billedAmount, 0);
  const totalCollected = collections.reduce((s, c) => s + c.collectedAmount, 0);
  const totalPending = collections.reduce((s, c) => s + c.pendingAmount, 0);
  const overdueCount = enriched.filter(c => c.pendingAmount > 0 && c._ageing !== "Current").length;

  const filtered = useMemo(() => {
    let list = [...enriched];
    if (statusF !== "All") list = list.filter(c => c.status === statusF);
    if (search) list = list.filter(c => (c.invoiceNo + c._accName + c.remarks).toLowerCase().includes(search.toLowerCase()));
    return list.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  }, [enriched, statusF, search]);

  const pg = usePagination(filtered);

  const openAdd = () => {
    setForm({ ...BLANK_COLLECTION, id: `col${uid()}`, invoiceDate: today, owner: currentUser });
    setFormErrors({});
    setModal({ mode: "add" });
  };
  const openEdit = (c) => { setForm({ ...c }); setFormErrors({}); setModal({ mode: "edit" }); };
  const save = () => {
    const errs = validateCollection(form);
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    const clean = sanitizeObj({ ...form, pendingAmount: form.billedAmount - form.collectedAmount });
    if (modal.mode === "add") setCollections(p => [...p, { ...clean }]);
    else setCollections(p => p.map(c => c.id === clean.id ? { ...clean } : c));
    setModal(null); setFormErrors({});
  };
  const del = (id) => { setCollections(p => p.filter(c => c.id !== id)); setConfirm(null); };

  // Ageing summary
  const ageingSummary = useMemo(() => {
    const buckets = {"Current":0,"0-30":0,"30-60":0,"60-90":0,"90-120":0,"120-180":0,"180+":0};
    enriched.forEach(c => { if (c.pendingAmount > 0) buckets[c._ageing] = (buckets[c._ageing] || 0) + c.pendingAmount; });
    return Object.entries(buckets).filter(([,v]) => v > 0);
  }, [enriched]);

  return (
    <div>
      <div className="pg-head">
        <div>
          <div className="pg-title">Collections</div>
          <div className="pg-sub">
            ₹{totalBilled.toFixed(1)}Cr billed · ₹{totalCollected.toFixed(1)}Cr collected · ₹{totalPending.toFixed(1)}Cr pending
            {overdueCount > 0 && <span style={{color:"var(--red)",fontWeight:700}}> · {overdueCount} overdue</span>}
          </div>
        </div>
        <div className="pg-actions">
          <button className="btn btn-sec" onClick={() => exportCSV(filtered, CSV_COLS, "collections")}><Download size={14}/>Export</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={14}/>Add Invoice</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
        <div className="kpi"><div className="kpi-label">Total Billed</div><div className="kpi-val">₹{totalBilled.toFixed(1)}Cr</div></div>
        <div className="kpi"><div className="kpi-label">Collected</div><div className="kpi-val" style={{color:"var(--green)"}}>₹{totalCollected.toFixed(1)}Cr</div><div className="kpi-sub">{totalBilled>0?((totalCollected/totalBilled)*100).toFixed(0):0}% collection rate</div></div>
        <div className="kpi"><div className="kpi-label">Pending</div><div className="kpi-val" style={{color:"var(--amber)"}}>₹{totalPending.toFixed(1)}Cr</div></div>
        <div className="kpi"><div className="kpi-label">Overdue Invoices</div><div className="kpi-val" style={{color:overdueCount>0?"var(--red)":"var(--text2)"}}>{overdueCount}</div></div>
      </div>

      {/* Ageing Summary */}
      {ageingSummary.length > 0 && (
        <div className="card" style={{marginBottom:16,padding:"12px 16px"}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",marginBottom:8}}>AGEING ANALYSIS</div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {ageingSummary.map(([bucket,amount]) => (
              <div key={bucket} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:6,background:ageingColor(bucket)+"12",border:`1px solid ${ageingColor(bucket)}30`}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:ageingColor(bucket)}}/>
                <span style={{fontSize:12,fontWeight:600,color:ageingColor(bucket)}}>{bucket} days</span>
                <span style={{fontSize:12,color:"var(--text2)"}}>₹{amount.toFixed(1)}Cr</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="filter-bar">
        {["All",...COLLECTION_STATUSES].map(s => (
          <button key={s} className={`btn btn-sm ${statusF===s?"btn-primary":"btn-sec"}`} onClick={() => setStatusF(s)}>{s}</button>
        ))}
        <div className="filter-search" style={{maxWidth:220}}>
          <Search size={14} style={{color:"var(--text3)",flexShrink:0}}/>
          <input placeholder="Search invoices..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
      </div>

      <div className="card" style={{padding:0}}>
        {filtered.length === 0 ? (
          <Empty icon={<DollarSign size={22}/>} title="No invoices found" sub="Add an invoice to start tracking collections."/>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Account</th>
                <th>Invoice Date</th>
                <th>Due Date</th>
                <th>Billed</th>
                <th>Collected</th>
                <th>Pending</th>
                <th>Ageing</th>
                <th>Status</th>
                <th>Owner</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pg.paged.map(c => {
                const ac = ageingColor(c._ageing);
                return (
                  <tr key={c.id}>
                    <td style={{fontWeight:600,fontSize:13}}>{c.invoiceNo}</td>
                    <td style={{fontSize:12.5}}>{c._accName}</td>
                    <td style={{fontSize:12,color:"var(--text3)"}}>{fmt.short(c.invoiceDate)}</td>
                    <td style={{fontSize:12,color:c.pendingAmount>0&&c._ageing!=="Current"?"var(--red)":"var(--text3)",fontWeight:c.pendingAmount>0&&c._ageing!=="Current"?700:400}}>{fmt.short(c.dueDate)}</td>
                    <td style={{fontFamily:"'Outfit',sans-serif",fontWeight:700}}>₹{c.billedAmount}Cr</td>
                    <td style={{fontFamily:"'Outfit',sans-serif",color:"var(--green)"}}>₹{c.collectedAmount}Cr</td>
                    <td style={{fontFamily:"'Outfit',sans-serif",color:c.pendingAmount>0?"var(--red)":"var(--text3)"}}>₹{c.pendingAmount}Cr</td>
                    <td>
                      {c.pendingAmount > 0 ? (
                        <span style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:5,background:ac+"18",color:ac}}>
                          {c._ageing} {c._ageing !== "Current" && "days"}
                        </span>
                      ) : <span style={{fontSize:11,color:"var(--green)"}}>Paid</span>}
                    </td>
                    <td><span className={`badge ${c.status==="Current"?"bs-active":c.status==="Overdue"?"bs-lost":"bs-prospect"}`}>{c.status}</span></td>
                    <td><UserPill uid={c.owner}/></td>
                    <td>
                      <div style={{display:"flex",gap:4}}>
                        <button className="icon-btn" onClick={() => openEdit(c)}><Edit2 size={14}/></button>
                        <button className="icon-btn" onClick={() => setConfirm(c.id)}><Trash2 size={14}/></button>
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

      {modal && (
        <Modal title={modal.mode === "add" ? "Add Invoice" : "Edit Invoice"} onClose={() => setModal(null)} lg
          footer={<>
            <button className="btn btn-sec" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={save}><Check size={14}/>Save</button>
          </>}>
          <div className="form-row">
            <div className="form-group"><label>Invoice Number *</label>
              <input value={form.invoiceNo} onChange={e => {setForm(f => ({...f, invoiceNo: e.target.value})); setFormErrors(e => ({...e, invoiceNo: undefined}));}}
                placeholder="INV-2026-XXX" style={formErrors.invoiceNo ? {borderColor:"#DC2626"} : {}}/>
              <FormError error={formErrors.invoiceNo}/>
            </div>
            <div className="form-group"><label>Account *</label>
              <select value={form.accountId} onChange={e => {setForm(f => ({...f, accountId: e.target.value})); setFormErrors(e => ({...e, accountId: undefined}));}}
                style={formErrors.accountId ? {borderColor:"#DC2626"} : {}}>
                <option value="">Select account...</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <FormError error={formErrors.accountId}/>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Linked Contract</label>
              <select value={form.contractId} onChange={e => setForm(f => ({...f, contractId: e.target.value}))}>
                <option value="">None</option>
                {contracts.filter(c => !form.accountId || c.accountId === form.accountId).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Owner</label>
              <select value={form.owner} onChange={e => setForm(f => ({...f, owner: e.target.value}))}>
                {TEAM.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Invoice Date *</label>
              <input type="date" value={form.invoiceDate} onChange={e => {setForm(f => ({...f, invoiceDate: e.target.value})); setFormErrors(e => ({...e, invoiceDate: undefined}));}}
                style={formErrors.invoiceDate ? {borderColor:"#DC2626"} : {}}/>
              <FormError error={formErrors.invoiceDate}/>
            </div>
            <div className="form-group"><label>Due Date *</label>
              <input type="date" value={form.dueDate} onChange={e => {setForm(f => ({...f, dueDate: e.target.value})); setFormErrors(e => ({...e, dueDate: undefined}));}}
                style={formErrors.dueDate ? {borderColor:"#DC2626"} : {}}/>
              <FormError error={formErrors.dueDate}/>
            </div>
          </div>
          <div className="form-row three">
            <div className="form-group"><label>Billed Amount (₹Cr) *</label>
              <input type="number" min={0} step={0.25} value={form.billedAmount}
                onChange={e => setForm(f => ({...f, billedAmount: +e.target.value, pendingAmount: +e.target.value - f.collectedAmount}))}/>
              <FormError error={formErrors.billedAmount}/>
            </div>
            <div className="form-group"><label>Collected (₹Cr)</label>
              <input type="number" min={0} step={0.25} value={form.collectedAmount}
                onChange={e => setForm(f => ({...f, collectedAmount: +e.target.value, pendingAmount: f.billedAmount - +e.target.value}))}/>
            </div>
            <div className="form-group"><label>Pending (₹Cr)</label>
              <input type="number" value={form.billedAmount - form.collectedAmount} disabled style={{background:"var(--s2)"}}/>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Payment Mode</label>
              <select value={form.paymentMode} onChange={e => setForm(f => ({...f, paymentMode: e.target.value}))}>
                <option value="">Select...</option>
                {PAYMENT_MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Payment Date</label>
              <input type="date" value={form.paymentDate} onChange={e => setForm(f => ({...f, paymentDate: e.target.value}))}/>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Status</label>
              <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
                {COLLECTION_STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group"><label>Remarks</label>
            <textarea rows={3} value={form.remarks} onChange={e => setForm(f => ({...f, remarks: e.target.value}))}
              placeholder="Payment notes, dispute details, escalation history..." style={{width:"100%",resize:"vertical"}}/>
          </div>
        </Modal>
      )}

      {confirm && <Confirm title="Delete Invoice" msg="Remove this invoice permanently?" onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)}/>}
    </div>
  );
}

export default Collections;
