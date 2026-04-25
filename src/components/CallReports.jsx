import { useState, useMemo } from "react";
import { Plus, Search, Edit2, Trash2, Check, Download, Phone, Mail, Video, MessageSquare, Globe, MapPin, Calendar, Clock, AlertCircle } from "lucide-react";
import { PRODUCTS, PROD_MAP, TEAM, TEAM_MAP, CALL_TYPES, CALL_OBJECTIVES, CALL_OUTCOMES, LEAD_STAGES, LEAD_STAGE_MAP } from '../data/constants';
import { BLANK_CALL_REPORT } from '../data/seed';
import { fmt, uid, today, sanitizeObj, hasErrors, getScopedUserIds, softDeleteById, upper, title } from '../utils/helpers';
import { notify } from '../utils/toast';
import { ProdTag, UserPill, Modal, Confirm, FormError, Empty, TypeaheadSelect } from './shared';
import Pagination, { usePagination } from './Pagination';
import BulkActions, { useBulkSelect } from './BulkActions';
import { exportCSV } from '../utils/csv';
import ProductModulePicker, { ProductSelectionDisplay, productSelectionToString, primaryProductId } from './ProductModulePicker';

const TYPE_ICON = {
  "Telephone Call": <Phone size={14}/>, "Visit": <MapPin size={14}/>, "Web Call": <Video size={14}/>,
  "WhatsApp/Text": <MessageSquare size={14}/>, "Email": <Mail size={14}/>, "LinkedIn": <Globe size={14}/>
};
const TYPE_COL = {
  "Telephone Call":"var(--brand)","Visit":"var(--purple)","Web Call":"var(--blue)",
  "WhatsApp/Text":"var(--green)","Email":"var(--amber)","LinkedIn":"#0077B5"
};

const validateCallReport = (f) => {
  const errs = {};
  if (!f.company?.trim()) errs.company = "Company name is required";
  if (!f.callDate) errs.callDate = "Call date is required";
  if (!f.notes?.trim()) errs.notes = "Notes are mandatory for every call";
  if (!f.nextCallDate && f.outcome !== "Completed") errs.nextCallDate = "Next call date is required";
  return errs;
};

const CSV_COLS = [
  { label: "Lead Name", accessor: r => r.leadName },
  { label: "Company", accessor: r => r.company },
  { label: "Person", accessor: r => TEAM_MAP[r.marketingPerson]?.name || r.marketingPerson },
  { label: "Stage", accessor: r => LEAD_STAGE_MAP[r.leadStage]?.name || r.leadStage },
  { label: "Call Type", accessor: r => r.callType },
  { label: "Product", accessor: r => PROD_MAP[r.product]?.name || r.product },
  { label: "Date", accessor: r => r.callDate },
  { label: "Notes", accessor: r => r.notes },
  { label: "Next Call", accessor: r => r.nextCallDate },
  { label: "Outcome", accessor: r => r.outcome },
  { label: "Objective", accessor: r => r.objective },
  { label: "Duration (min)", accessor: r => r.duration },
];

function CallReports({ callReports, setCallReports, accounts, contacts, opps, currentUser, orgUsers, canDelete, catalog = [] }) {
  const _crScopedIds = useMemo(() => getScopedUserIds(currentUser, orgUsers), [currentUser, orgUsers]);
  const team = useMemo(() => {
    const all = orgUsers?.length ? orgUsers.filter(u => u.status !== 'Inactive') : TEAM;
    return all.filter(u => _crScopedIds.has(u.id));
  }, [orgUsers, _crScopedIds]);
  const [search, setSearch] = useState("");
  const [typeF, setTypeF] = useState("All");
  const [tabS, setTabS] = useState("All");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK_CALL_REPORT);
  const [confirm, setConfirm] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  const CSV_COLS_LIVE = useMemo(() => ([
    ...CSV_COLS,
    { label: "Products & Modules", accessor: r => productSelectionToString(r.productSelection, catalog) },
  ]), [catalog]);

  const todaysCalls = callReports.filter(r => r.nextCallDate === today).length;
  const overdueCalls = callReports.filter(r => r.nextCallDate && r.nextCallDate < today && r.outcome !== "Completed").length;
  const next7 = callReports.filter(r => {
    if (!r.nextCallDate) return false;
    const d = new Date(r.nextCallDate); const t = new Date(today);
    const diff = (d - t) / (1000*60*60*24);
    return diff > 0 && diff <= 7;
  }).length;

  const filtered = useMemo(() => {
    let list = [...callReports];
    if (tabS === "Today") list = list.filter(r => r.callDate === today || r.nextCallDate === today);
    else if (tabS === "Overdue") list = list.filter(r => r.nextCallDate && r.nextCallDate < today);
    else if (tabS === "Upcoming") list = list.filter(r => r.nextCallDate && r.nextCallDate > today);
    if (typeF !== "All") list = list.filter(r => r.callType === typeF);
    if (search) list = list.filter(r => (r.leadName + r.company + r.notes).toLowerCase().includes(search.toLowerCase()));
    return list.sort((a, b) => b.callDate.localeCompare(a.callDate));
  }, [callReports, tabS, typeF, search]);

  const bulk = useBulkSelect(filtered);
  const pg = usePagination(filtered);

  const openAdd = () => {
    setForm({ ...BLANK_CALL_REPORT, id: `cr${uid()}`, callDate: today, marketingPerson: currentUser });
    setFormErrors({});
    setModal({ mode: "add" });
  };
  const openEdit = (r) => {
    const ps = Array.isArray(r.productSelection) && r.productSelection.length > 0
      ? r.productSelection
      : (r.product ? [{ productId: r.product, moduleIds: [], noAddons: true }] : []);
    setForm({ ...r, productSelection: ps });
    setFormErrors({});
    setModal({ mode: "edit" });
  };
  // Keep legacy `product` synced with first picker entry so list filters/CSV stay correct
  const syncLegacy = (f) => {
    const sel = Array.isArray(f.productSelection) ? f.productSelection : [];
    if (sel.length === 0) return f;
    return { ...f, product: primaryProductId(sel) || f.product };
  };
  const save = () => {
    const errs = validateCallReport(form);
    if (hasErrors(errs)) { setFormErrors(errs); return; }
    const clean = sanitizeObj(syncLegacy(form));
    if (modal.mode === "add") setCallReports(p => [...p, { ...clean }]);
    else setCallReports(p => p.map(r => r.id === clean.id ? { ...clean } : r));
    setModal(null); setFormErrors({});
  };
  const del = (id) => { setCallReports(p => softDeleteById(p, id, currentUser)); setConfirm(null); notify.success("Call report moved to Trash. Admins can restore from Trash."); };

  const TABS = [
    { id: "All", label: "All Calls", count: callReports.length },
    { id: "Today", label: "Today", count: todaysCalls },
    { id: "Overdue", label: "Overdue", count: overdueCalls },
    { id: "Upcoming", label: "Next 7 Days", count: next7 },
  ];

  return (
    <div>
      <div className="pg-head">
        <div>
          <div className="pg-title">Call Reports</div>
          <div className="pg-sub">
            {callReports.length} total
            {overdueCalls > 0 && <span style={{color:"var(--red)",fontWeight:700}}> · {overdueCalls} overdue follow-ups</span>}
            {todaysCalls > 0 && <span> · {todaysCalls} today</span>}
          </div>
        </div>
        <div className="pg-actions">
          <button className="btn btn-sec" onClick={() => exportCSV(filtered, CSV_COLS_LIVE, "call_reports")}><Download size={14}/>Export</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={14}/>Log Call</button>
        </div>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,flexWrap:"wrap"}}>
        <div className="act-tabs">
          {TABS.map(t => (
            <div key={t.id} className={`act-tab${tabS===t.id?" active":""}`} onClick={() => setTabS(t.id)}>
              {t.label}
              {t.count > 0 && <span style={{marginLeft:5,fontSize:10,fontWeight:700,background:tabS===t.id?"var(--brand-bg)":"var(--s3)",color:tabS===t.id?"var(--brand)":"var(--text3)",padding:"1px 5px",borderRadius:3}}>{t.count}</span>}
            </div>
          ))}
        </div>
        <div className="filter-search" style={{maxWidth:220}}>
          <Search size={14} style={{color:"var(--text3)",flexShrink:0}}/>
          <input placeholder="Search calls..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <select className="filter-select" value={typeF} onChange={e => setTypeF(e.target.value)}>
          <option value="All">All Types</option>
          {CALL_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      <BulkActions count={bulk.count} onClear={bulk.clear}
        onDelete={() => setConfirm("bulk")}
        onExport={() => exportCSV(callReports.filter(r=>bulk.isSelected(r.id)), CSV_COLS_LIVE, "call_reports")}
      />

      <div className="card" style={{padding:0}}>
        {filtered.length === 0 ? (
          <Empty icon={<Phone size={22}/>} title="No call reports" sub="Log your first call to start tracking interactions."/>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{width:36}}><input type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll}/></th>
                <th>Lead / Company</th>
                <th>Type</th>
                <th>Product</th>
                <th>Salesperson</th>
                <th>Call Date</th>
                <th>Notes</th>
                <th>Next Call</th>
                <th>Outcome</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pg.paged.map(r => {
                const col = TYPE_COL[r.callType] || "var(--text3)";
                const overdue = r.nextCallDate && r.nextCallDate < today;
                return (
                  <tr key={r.id}>
                    <td><input type="checkbox" checked={bulk.isSelected(r.id)} onChange={() => bulk.toggle(r.id)}/></td>
                    <td>
                      <div style={{fontWeight:600,fontSize:13}}>{r.leadName || r.company}</div>
                      {r.company && r.leadName && <div style={{fontSize:11,color:"var(--text3)"}}>{r.company}</div>}
                    </td>
                    <td>
                      <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:5,background:col+"18",color:col}}>
                        {TYPE_ICON[r.callType]}{r.callType}
                      </span>
                    </td>
                    <td><ProdTag pid={r.product}/></td>
                    <td><UserPill uid={r.marketingPerson}/></td>
                    <td style={{fontSize:12,color:"var(--text3)"}}>{fmt.short(r.callDate)}</td>
                    <td style={{fontSize:12,color:"var(--text2)",maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.notes}</td>
                    <td>
                      {r.nextCallDate ? (
                        <span style={{fontSize:12,color:overdue?"var(--red)":"var(--text3)",fontWeight:overdue?700:400}}>
                          {fmt.short(r.nextCallDate)}
                          {overdue && <AlertCircle size={11} style={{marginLeft:3,verticalAlign:"middle"}}/>}
                        </span>
                      ) : <span style={{fontSize:11,color:"var(--text3)"}}>—</span>}
                    </td>
                    <td>
                      <span className={`badge ${r.outcome==="Completed"?"bs-completed":r.outcome==="No Answer"?"bs-cancelled":"bs-planned"}`}>{r.outcome}</span>
                    </td>
                    <td>
                      <div style={{display:"flex",gap:4}}>
                        <button className="icon-btn" aria-label="Edit" onClick={() => openEdit(r)}><Edit2 size={14}/></button>
                        {canDelete && <button className="icon-btn" aria-label="Delete" onClick={() => setConfirm(r.id)}><Trash2 size={14}/></button>}
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
        <Modal title={modal.mode === "add" ? "Log Call Report" : "Edit Call Report"} onClose={() => { setModal(null); setFormErrors({}); setForm(BLANK_CALL_REPORT); }} lg
          footer={<>
            <button className="btn btn-sec" onClick={() => { setModal(null); setFormErrors({}); setForm(BLANK_CALL_REPORT); }}>Cancel</button>
            <button className="btn btn-primary" onClick={save}><Check size={14}/>Save</button>
          </>}>
          <div className="form-row">
            <div className="form-group"><label>Lead Name</label>
              <input value={form.leadName} onChange={e => setForm(f => ({...f, leadName: title(e.target.value)}))} placeholder="Lead / Deal Name" style={{textTransform:"capitalize"}}/>
            </div>
            <div className="form-group"><label>Company * <span style={{fontSize:10.5,color:"var(--text3)",fontWeight:400,letterSpacing:"0.3px",marginLeft:6}}>(ALL CAPS)</span></label>
              <input value={form.company} onChange={e => {setForm(f => ({...f, company: upper(e.target.value)})); setFormErrors(e => ({...e, company: undefined}));}}
                placeholder="COMPANY NAME" style={{textTransform:"uppercase",...(formErrors.company ? {borderColor:"#DC2626"} : {})}}/>
              <FormError error={formErrors.company}/>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Salesperson</label>
              <TypeaheadSelect
                value={form.marketingPerson}
                onChange={(id) => setForm(f => ({...f, marketingPerson: id}))}
                options={team.map(u => ({ value: u.id, label: u.name, sub: u.role }))}
                placeholder="Search salespeople…"
              />
            </div>
            <div className="form-group"><label>Lead Stage</label>
              <select value={form.leadStage} onChange={e => setForm(f => ({...f, leadStage: e.target.value}))}>
                {LEAD_STAGES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Call Type</label>
              <select value={form.callType} onChange={e => setForm(f => ({...f, callType: e.target.value}))}>
                {CALL_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Objective</label>
              <select value={form.objective} onChange={e => setForm(f => ({...f, objective: e.target.value}))}>
                {CALL_OBJECTIVES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row full">
            <div className="form-group"><label>Products & Modules Discussed</label>
              <ProductModulePicker value={form.productSelection || []} onChange={(v) => setForm(f => ({...f, productSelection: v}))} catalog={catalog}/>
              <div style={{fontSize:11,color:"var(--text3)",marginTop:4}}>Pick the product(s) and specific module(s) discussed on this call. Choose "None" if the call was generic.</div>
            </div>
          </div>
          <div className="form-row three">
            <div className="form-group"><label>Call Date *</label>
              <input type="date" value={form.callDate} onChange={e => {setForm(f => ({...f, callDate: e.target.value})); setFormErrors(e => ({...e, callDate: undefined}));}}
                style={formErrors.callDate ? {borderColor:"#DC2626"} : {}}/>
              <FormError error={formErrors.callDate}/>
            </div>
            <div className="form-group"><label>Next Call Date *</label>
              <input type="date" value={form.nextCallDate} onChange={e => {setForm(f => ({...f, nextCallDate: e.target.value})); setFormErrors(e => ({...e, nextCallDate: undefined}));}}
                style={formErrors.nextCallDate ? {borderColor:"#DC2626"} : {}}/>
              <FormError error={formErrors.nextCallDate}/>
            </div>
            <div className="form-group"><label>Duration (min)</label>
              <input type="number" min={0} step={5} value={form.duration} onChange={e => setForm(f => ({...f, duration: +e.target.value}))}/>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Outcome</label>
              <select value={form.outcome} onChange={e => setForm(f => ({...f, outcome: e.target.value}))}>
                {CALL_OUTCOMES.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Linked Account</label>
              <TypeaheadSelect
                value={form.accountId}
                onChange={(id) => setForm(f => ({...f, accountId: id}))}
                options={accounts.map(a => ({ value: a.id, label: a.name, sub: a.country || a.type || "" }))}
                placeholder="Search accounts…"
              />
            </div>
          </div>
          <div className="form-group">
            <label>Notes (Mandatory) *</label>
            <textarea rows={4} value={form.notes}
              onChange={e => {setForm(f => ({...f, notes: e.target.value})); setFormErrors(e => ({...e, notes: undefined}));}}
              placeholder="Discussion summary, objections, decisions, and next steps..."
              style={{...(formErrors.notes ? {borderColor:"#DC2626"} : {}), width:"100%",resize:"vertical"}}/>
            <FormError error={formErrors.notes}/>
          </div>
        </Modal>
      )}

      {confirm === "bulk"
        ? <Confirm title={`Delete ${bulk.count} Call Reports`} msg="Move selected call reports to Trash? Admins can restore them." onConfirm={() => { setCallReports(p => p.map(r => bulk.isSelected(r.id) ? { ...r, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser } : r)); bulk.clear(); setConfirm(null); }} onCancel={() => setConfirm(null)}/>
        : confirm && <Confirm title="Delete Call Report" msg="Move this call report to Trash? Admins can restore it." onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)}/>
      }
    </div>
  );
}

export default CallReports;
