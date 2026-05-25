import { useState, useMemo, useEffect, useRef } from "react";
import { Plus, Search, Edit2, Trash2, Check, Download, FileText, Copy, Send, Eye, TrendingUp, BarChart3, Activity, GitBranch, X, ShieldCheck, ThumbsUp, ThumbsDown, FileSignature, Mail, Bell, History, Paperclip } from "lucide-react";
import { PRODUCTS, PROD_MAP, TEAM, TEAM_MAP, QUOTE_STATUSES, TAX_TYPES, TAX_RATES, QUOTE_VALIDITY, STANDARD_TERMS, TC_TEMPLATES, PLACES_OF_SUPPLY, SELLER_HOME_STATE, INDIAN_STATES } from '../data/constants';
import { BLANK_QUOTE, BLANK_QUOTE_ITEM, BLANK_CONTRACT, QUOTE_APPROVAL_THRESHOLDS, QUOTE_REMINDER_OFFSETS } from '../data/seed';
import { getQuoteTemplate, STANDARD_TERMS_SECTIONS, STANDARD_PAYMENT_MILESTONES, STANDARD_EXTRA_NOTES } from '../data/quoteTemplates';
import { fmt, uid, today, sanitizeObj, hasErrors, softDeleteById, resolveAddress, formatAddress } from '../utils/helpers';
import { ProdTag, UserPill, Modal, Confirm, FormError, Empty, HelpTooltip, TypeaheadSelect, SendEmailModal } from './shared';
import ProductModulePicker, { ProductSelectionDisplay, productSelectionToString } from './ProductModulePicker';
import Pagination, { usePagination } from './Pagination';
import { useSort, SortHeader } from './Sort';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { exportCSV } from '../utils/csv';
import DataGrid from './DataGrid';

const QuotesSortIcon = ({ col, sortKey, sortDir }) => {
  if (sortKey !== col) return <ChevronsUpDown size={11} style={{opacity:0.4,marginLeft:2}}/>;
  return sortDir === "asc" ? <ChevronUp size={11} style={{marginLeft:2}}/> : <ChevronDown size={11} style={{marginLeft:2}}/>;
};

const SECTORS = ["Manufacturing","Logistics","Technology","Energy","Aviation","Government","Services"];

const SECTOR_MAP_FROM_TYPE = {
  "Airline":"Aviation","Airport":"Aviation","Ground Handler":"Aviation",
  "Freight Forwarder":"Logistics","Customs Broker":"Logistics","Exporter/Importer":"Logistics",
  "Government":"Government"
};

// ── Verify-before-Send checklist ──────────────────────────────────
// Fields that must be populated before a quote can advance off Draft.
// Each entry: [fieldName, labelShownToUser, optional predicate(form)].
// Predicates let us conditionally require fields (e.g. GSTIN only when
// taxTreatment is an Indian one). A missing predicate means "always required".
const VERIFY_REQUIRED = [
  ["legalName",             "Legal / Billing name"],
  ["billingAddressSnapshot","Billing address"],
  ["paymentTerms",          "Payment terms"],
  ["billingContactEmail",   "Billing contact email"],
  ["currency",              "Currency"],
  ["gstin",                 "GSTIN",               f => /india|domestic|sez|export/i.test(f.taxTreatment || "")],
  ["poNumber",              "PO Number",           f => /yes/i.test(f.poMandatory || "")],
  // Place of Supply drives the per-line GST split (CGST+SGST vs IGST). Required
  // for any India-tax treatment so quotes don't ship with the legacy lump-sum
  // fallback when CGST+SGST/IGST is the legally-correct split.
  ["placeOfSupply",         "Place of Supply",     f => /india|domestic|sez/i.test(f.taxTreatment || "")],
];

export const getVerifyStatus = (f) => {
  const missing = [];
  for (const [key, label, when] of VERIFY_REQUIRED) {
    if (when && !when(f)) continue;
    const v = f?.[key];
    if (v === undefined || v === null || String(v).trim() === "") {
      missing.push({ key, label });
    }
  }
  return { complete: missing.length === 0, missing };
};

const validateQuote = (f) => {
  const errs = {};
  if (!f.title?.trim()) errs.title = "Quote title is required";
  if (!f.accountId) errs.accountId = "Account is required";
  if (f.items.length === 0) errs.items = "At least one line item is required";
  // Negative-value guards on totals + per-line numeric fields
  for (const k of ["subtotal","tax","discount","total"]) {
    const v = f?.[k];
    if (v != null && v !== "" && Number(v) < 0) errs[k] = "Cannot be negative";
  }
  if (Array.isArray(f.items)) {
    const bad = f.items.find(it =>
      Number(it.qty) < 0 ||
      Number(it.unitPrice) < 0 ||
      Number(it.mrp) < 0 ||
      Number(it.discountValue) < 0
    );
    if (bad) errs.items = "Line item quantity / price / MRP / discount cannot be negative";
  }
  // Verify-before-Send gate: the customer snapshot must be complete before
  // the quote can advance off Draft. The Verify tab exposes every field;
  // we only block on save, not while the user is still editing Draft.
  if (f.status && f.status !== "Draft") {
    const { complete, missing } = getVerifyStatus(f);
    if (!complete) {
      errs._verify = `Cannot move to ${f.status}: fill Verify tab — ${missing.map(m => m.label).join(", ")}.`;
    }
  }
  return errs;
};

const statusColor = s => ({"Draft":"#94A3B8","Sent":"#3B82F6","Under Review":"#F59E0B","Accepted":"#22C55E","Rejected":"#EF4444","Expired":"#DC2626","Revised":"#8B5CF6"}[s]||"#94A3B8");

const statusLabel = s => ({"Under Review":"NEGOTIATION"}[s]||s.toUpperCase());

const statusBadgeStyle = s => {
  const map = {
    "Accepted":  {background:"#22C55E18",color:"#22C55E"},
    "Under Review":{background:"#F59E0B18",color:"#F59E0B"},
    "Sent":      {background:"#3B82F618",color:"#3B82F6"},
    "Draft":     {background:"#94A3B818",color:"#94A3B8"},
    "Rejected":  {background:"#EF444418",color:"#EF4444"},
    "Expired":   {background:"#DC262618",color:"#DC2626"},
    "Revised":   {background:"#8B5CF618",color:"#8B5CF6"},
  };
  return {fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:5,letterSpacing:"0.5px",textTransform:"uppercase",...(map[s]||{background:"#94A3B818",color:"#94A3B8"})};
};


// Format a value already in INR (not crores) to locale string
const formatINR = (val) => Math.round(Number(val) || 0).toLocaleString('en-IN');

const getMonthName = (dateStr) => {
  if (!dateStr) return "—";
  const dt = new Date(dateStr);
  return dt.toLocaleDateString("en-IN",{month:"long"});
};

// Per-line aggregates pulled out of the JSONB items array so finance can
// reconcile a CSV row against GSTR-1 / GSTR-3B. We sum on the fly rather than
// reading q.igstTotal/q.cgstTotal/q.sgstTotal so legacy quotes (saved before
// the per-line GST split landed) still produce correct numbers.
const sumLines = (q, key) => (Array.isArray(q.items) ? q.items : [])
  .reduce((s, i) => s + (Number(i[key]) || 0), 0);

const CSV_COLS = [
  {label:"Quote #",accessor:q=>q._quoteId||q.id},{label:"Title",accessor:q=>q.title},{label:"Customer",accessor:q=>q._accName||""},
  {label:"Sector",accessor:q=>q._sector||""},
  {label:"Product",accessor:q=>PROD_MAP[q.product]?.name||q.product},
  {label:"Products & Modules",accessor:q=>productSelectionToString(q.productSelection)},
  {label:"Date Sent",accessor:q=>q.sentDate},{label:"Quote Month",accessor:q=>getMonthName(q.sentDate||q.createdDate)},
  // ── Tax / GST split (per-line aggregates, derived) ──
  {label:"Place of Supply",accessor:q=>q.placeOfSupply||""},
  {label:"Tax Mode",accessor:q=>q.taxType||""},
  {label:"Card Rate Total",accessor:q=>(Array.isArray(q.items)?q.items:[]).reduce((s,i)=>s+(Number(i.mrp)||0)*(Number(i.qty)||0),0)},
  {label:"Subtotal (Taxable)",accessor:q=>q.subtotal||0},
  {label:"Discount",accessor:q=>q.discount||0},
  {label:"IGST",accessor:q=>q.igstTotal!=null?q.igstTotal:sumLines(q,"igstAmount")},
  {label:"CGST",accessor:q=>q.cgstTotal!=null?q.cgstTotal:sumLines(q,"cgstAmount")},
  {label:"SGST",accessor:q=>q.sgstTotal!=null?q.sgstTotal:sumLines(q,"sgstAmount")},
  {label:"Tax Total",accessor:q=>q.taxAmount||0},
  {label:"Order Value (INR)",accessor:q=>formatINR(q.total)},{label:"Prob %",accessor:q=>q._prob||0},
  {label:"Status",accessor:q=>q.status},{label:"Version",accessor:q=>`v${q.version}`},
];

/* ── KPI Card ── */
const KpiCard = ({icon,label,value,sub}) => (
  <div style={{background:"#1B6B5A",borderRadius:12,padding:"20px 24px",flex:1,minWidth:200,color:"#fff"}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
      <div style={{background:"rgba(255,255,255,0.15)",borderRadius:8,padding:6,display:"flex",alignItems:"center",justifyContent:"center"}}>{icon}</div>
      <span style={{fontSize:11,fontWeight:700,letterSpacing:"1px",opacity:0.85}}>{label}</span>
    </div>
    <div style={{fontSize:28,fontWeight:800,fontFamily:"'Outfit',sans-serif",lineHeight:1.1}}>{value}</div>
    <div style={{fontSize:12,marginTop:6,opacity:0.75}}>{sub}</div>
  </div>
);

/* ── Approval helpers ── */
const computeDiscountPct = (q) => {
  const sub = Number(q.subtotal)||0;
  const disc = Number(q.discount)||0;
  return sub>0 ? +((disc/sub)*100).toFixed(1) : 0;
};
const needsApproval = (q) => {
  const pct = computeDiscountPct(q);
  return pct > QUOTE_APPROVAL_THRESHOLDS.discountPct || (Number(q.total)||0) > QUOTE_APPROVAL_THRESHOLDS.totalValue;
};
const approvalReason = (q) => {
  const pct = computeDiscountPct(q);
  const reasons = [];
  if (pct > QUOTE_APPROVAL_THRESHOLDS.discountPct) reasons.push(`discount ${pct}% > ${QUOTE_APPROVAL_THRESHOLDS.discountPct}%`);
  if ((Number(q.total)||0) > QUOTE_APPROVAL_THRESHOLDS.totalValue) reasons.push(`total ₹${q.total} > ₹${QUOTE_APPROVAL_THRESHOLDS.totalValue}L`);
  return reasons.join(" + ");
};

// ── Currency-symbol helper (shared by composer / grid / footer) ──
const curSym = (cur) => cur==="INR"?"₹":cur==="USD"?"$":cur==="EUR"?"€":cur==="GBP"?"£":(cur||"INR")+" ";

// ── Account → Place of Supply derivation ──
// Match the account's billing state (case- and whitespace-tolerant) against
// INDIAN_STATES. If billing country is set and not India → "Outside India".
// Returns "" when nothing can be inferred so the rep is forced to pick.
const derivePOSFromAccount = (acc) => {
  if (!acc) return "";
  const country = String(acc.billingCountry || acc.country || "").trim().toLowerCase();
  if (country && country !== "india") return "Outside India";
  // Try the structured billing fields first; fall back to addresses[0].state.
  const rawState = acc.billingState
    || (Array.isArray(acc.addresses) ? (acc.addresses.find(a=>a.isBilling)?.state || acc.addresses[0]?.state) : "")
    || "";
  const norm = String(rawState).trim().toLowerCase();
  if (!norm) return "";
  return INDIAN_STATES.find(s => s.toLowerCase() === norm) || "";
};

// ══════════════════════════════════════════════════════════════════
// ITEMS COMPOSER TAB
// ══════════════════════════════════════════════════════════════════
// Layout faithful to the legacy quotation-entry pattern:
//
//   ┌─ Add from Catalogue picker ──────────────────────────────┐
//   ├─ Compose Line card (all line fields visible side-by-side)
//   │     Row 1: Charge Name | Description
//   │     Row 2: Currency | ExRate | Unit | Qty | MRP | Disc
//   │     Row 3: Price (computed) | Amount | computed GST chips
//   │     [Insert] [Clear Composer]
//   ├─ Lines grid (read-back of inserted lines, click row to edit)
//   └─ Tax summary footer (CardRate · Disc · Taxable · IGST · CGST · SGST · Total)
//
// "editingIdx" tracks which grid row is loaded into the composer:
//   -1 → composing a brand-new line (Insert appends)
//   ≥0 → editing an existing line in place (Insert applies + clears)
function ItemsComposerTab({form,setForm,isManager,catalog,addItemFromCatalog,updateItem,removeItem,recalc,recalcLineWithCtx,formErrors}) {
  const [composer,setComposer]=useState({...BLANK_QUOTE_ITEM});
  const [editingIdx,setEditingIdx]=useState(-1);
  // Recompute composer's derived fields on every keystroke so the
  // computed price / amount / GST chips track typing.
  const ctx={taxType:form.taxType,placeOfSupply:form.placeOfSupply};
  const composerLive=recalcLineWithCtx(composer,ctx);
  const setC=(field,val)=>setComposer(c=>({...c,[field]:val}));
  const sym=curSym(composer.currency);
  const insert=()=>{
    if(!composerLive.description?.trim() && !composerLive.chargeName?.trim()){
      // Block insert if both blank — show inline error instead of native alert
      setFormErrors(e=>({...e,_composer:"Charge Name or Description is required."}));
      return;
    }
    setFormErrors(e=>{const{_composer:_,...rest}=e;return rest;});
    setForm(f=>{
      const items=[...f.items];
      if(editingIdx>=0) items[editingIdx]=composerLive;
      else items.push(composerLive);
      const totals=recalc(items,f.taxType,f.discount,f.placeOfSupply);
      return {...f,...totals};
    });
    setComposer({...BLANK_QUOTE_ITEM});
    setEditingIdx(-1);
  };
  const loadRowToComposer=(item,idx)=>{
    setComposer({...item});
    setEditingIdx(idx);
  };
  const clearComposer=()=>{
    setComposer({...BLANK_QUOTE_ITEM});
    setEditingIdx(-1);
  };

  // ── Footer totals (6-way breakdown) ──
  // We compute from form (post-recalc) so they always reflect what's saved.
  const cardRateTotal=form.items.reduce((s,i)=>s+(Number(i.mrp)||0)*(Number(i.qty)||0),0);
  const discountTotalPerLine=form.items.reduce((s,i)=>{
    const mrp=Number(i.mrp)||0;
    const dv=Number(i.discountValue)||0;
    const dt=i.discountType||"pct";
    const perUnit=mrp>0?(dt==="pct"?(mrp*dv)/100:dv):0;
    return s+perUnit*(Number(i.qty)||0);
  },0);
  const taxableTotal=Number(form.subtotal)||0;
  const igstTotal=form.items.reduce((s,i)=>s+(Number(i.igstAmount)||0),0);
  const cgstTotal=form.items.reduce((s,i)=>s+(Number(i.cgstAmount)||0),0);
  const sgstTotal=form.items.reduce((s,i)=>s+(Number(i.sgstAmount)||0),0);
  const grandTotal=Number(form.total)||0;

  return (
    <div>
      <FormError error={formErrors.items}/>

      {/* ── Add from Catalogue ── */}
      <div style={{background:"#F8FAFC",border:"1px solid var(--border)",borderRadius:8,padding:"10px 12px",marginBottom:12,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:11,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px"}}>ADD FROM CATALOGUE</span>
        <select
          value=""
          onChange={e=>{
            if(!e.target.value) return;
            const [pid,mid]=e.target.value.split("||");
            const prod=(catalog||[]).find(p=>p.id===pid);
            const mod=prod?.modules?.find(m=>m.id===mid);
            if(prod && mod) addItemFromCatalog(prod,mod);
            e.target.value="";
          }}
          style={{flex:1,minWidth:280,fontSize:13,padding:"6px 8px"}}
          title="Drop a fully-priced line straight from the catalogue. MRP is snapshotted onto the line."
        >
          <option value="">— Pick product · module to add directly —</option>
          {(catalog||[]).map(p=>(
            <optgroup key={p.id} label={p.name}>
              {(p.modules||[]).map(m=>{
                const mrp=Number(m.mrp)||0;
                const s=curSym(m.currency||"INR");
                return <option key={m.id} value={`${p.id}||${m.id}`}>
                  {m.type} · {m.name} {mrp>0?`— ${s}${mrp.toLocaleString()} / ${m.unit||"License"}`:"(no MRP)"}
                </option>;
              })}
            </optgroup>
          ))}
        </select>
      </div>

      {/* ── Compose Line card ── */}
      <div style={{background:"#fff",border:`1.5px solid ${editingIdx>=0?"#F59E0B":"var(--border)"}`,borderRadius:10,padding:14,marginBottom:14,boxShadow:editingIdx>=0?"0 0 0 3px #FEF3C7":"none"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:editingIdx>=0?"#92400E":"var(--text3)",letterSpacing:"0.5px"}}>
            {editingIdx>=0?`EDITING LINE #${editingIdx+1}`:"COMPOSE NEW LINE"}
          </div>
          {editingIdx>=0 && <button className="btn btn-sec btn-xs" onClick={clearComposer}>Cancel edit</button>}
        </div>
        {/* Row 1: Charge Name + Description */}
        <div className="form-row">
          <div className="form-group"><label>Charge Name</label><input value={composer.chargeName||""} onChange={e=>setC("chargeName",e.target.value)} placeholder="SKU / short code (e.g. WISE-FREIGHT-OCEAN)"/></div>
          <div className="form-group"><label>Description</label><input value={composer.description||""} onChange={e=>setC("description",e.target.value)} placeholder="Long description shown on PDF"/></div>
        </div>
        {/* Row 2: Currency / ExRate / Unit / Qty / MRP / Discount */}
        <div style={{display:"grid",gridTemplateColumns:"90px 90px 100px 70px 1fr 140px",gap:8,marginBottom:8}}>
          <div className="form-group"><label>Currency</label>
            <select value={composer.currency||"INR"} onChange={e=>setC("currency",e.target.value)}>
              {["INR","USD","EUR","GBP","AED","SGD"].map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group"><label>ExRate</label><input type="number" min={0} step={0.01} value={composer.exRate||1} onChange={e=>setC("exRate",+e.target.value)} title="Line FX → INR (1 if same currency)"/></div>
          <div className="form-group"><label>Unit</label>
            <select value={composer.unit||"License"} onChange={e=>setC("unit",e.target.value)}>
              {["License","User","Site","Setup","Year","Month","Transaction"].map(u=><option key={u}>{u}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Qty</label><input type="number" min={1} value={composer.qty||1} onChange={e=>setC("qty",+e.target.value)}/></div>
          <div className="form-group"><label>MRP / Card Rate ({sym.trim()||sym})</label><input type="number" min={0} step={1} value={composer.mrp||0} onChange={e=>setC("mrp",+e.target.value)} placeholder="0"/></div>
          <div className="form-group"><label>Discount</label>
            <div style={{display:"flex",gap:0}}>
              <input type="number" min={0} step={(composer.discountType||"pct")==="pct"?0.5:1} value={composer.discountValue||0} onChange={e=>setC("discountValue",+e.target.value)} style={{borderTopRightRadius:0,borderBottomRightRadius:0,flex:1,minWidth:0}}/>
              <button type="button" className="btn btn-sec btn-xs" style={{borderTopLeftRadius:0,borderBottomLeftRadius:0,padding:"0 8px",fontSize:11,fontWeight:700,minWidth:34,background:(composer.discountType||"pct")==="pct"?"#EFF6FF":"#FEF3C7",color:(composer.discountType||"pct")==="pct"?"#1D4ED8":"#92400E"}} onClick={()=>setC("discountType",(composer.discountType||"pct")==="pct"?"abs":"pct")}>
                {(composer.discountType||"pct")==="pct"?"%":sym.trim()||sym}
              </button>
            </div>
          </div>
        </div>
        {/* Row 3: Price (override) / Cost (mgr) / Computed Amount + Tax chips + Insert */}
        <div style={{display:"grid",gridTemplateColumns:isManager?"1fr 1fr 1fr 2.6fr 100px":"1fr 1fr 2.6fr 100px",gap:8,alignItems:"end"}}>
          <div className="form-group"><label>Unit Price ({sym.trim()||sym})</label><input type="number" min={0} step={1} value={composerLive.unitPrice||0} onChange={e=>setC("unitPrice",+e.target.value)} style={{background:(Number(composer.mrp)||0)>0&&(Number(composer.discountValue)||0)>0?"#ECFDF5":"#fff",fontWeight:600}} title="Auto = MRP − discount. Edit to override."/></div>
          {isManager && <div className="form-group"><label style={{color:"#92400E"}}>Cost ({sym.trim()||sym})</label><input type="number" min={0} step={1} value={composer.unitCost||0} onChange={e=>setC("unitCost",+e.target.value)} style={{background:"#FFFBEB"}}/></div>}
          <div className="form-group"><label>Amount ({sym.trim()||sym})</label><input disabled value={(composerLive.amount||0).toLocaleString()} style={{background:"var(--s2)",fontWeight:700}}/></div>
          {/* Computed GST chips for this line */}
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",fontSize:11,paddingBottom:6}}>
            {(composerLive.igstRate>0||composerLive.cgstRate>0||composerLive.sgstRate>0)?(
              <>
                {composerLive.igstRate>0 && <span style={{background:"#EDE9FE",color:"#5B21B6",border:"1px solid #DDD6FE",padding:"3px 8px",borderRadius:10,fontWeight:600}}>IGST {composerLive.igstRate}% = {sym}{composerLive.igstAmount.toLocaleString()}</span>}
                {composerLive.cgstRate>0 && <span style={{background:"#DBEAFE",color:"#1E40AF",border:"1px solid #BFDBFE",padding:"3px 8px",borderRadius:10,fontWeight:600}}>CGST {composerLive.cgstRate}% = {sym}{composerLive.cgstAmount.toLocaleString()}</span>}
                {composerLive.sgstRate>0 && <span style={{background:"#D1FAE5",color:"#065F46",border:"1px solid #A7F3D0",padding:"3px 8px",borderRadius:10,fontWeight:600}}>SGST {composerLive.sgstRate}% = {sym}{composerLive.sgstAmount.toLocaleString()}</span>}
                <span style={{fontWeight:700,color:"var(--brand)"}}>Total: {sym}{(composerLive.totalWithTax||0).toLocaleString()}</span>
              </>
            ):(
              <span style={{color:"var(--text3)",fontStyle:"italic"}}>{!form.placeOfSupply?"Set Place of Supply (Details tab) for per-line GST":"Tax mode is No Tax / Custom"}</span>
            )}
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={insert} style={{height:34}}>
            {editingIdx>=0?<><Check size={14}/>Update</>:<><Plus size={14}/>Insert</>}
          </button>
        </div>
        {formErrors._composer&&<div style={{color:"#DC2626",fontSize:12,fontWeight:600,margin:"4px 0 0",display:"flex",alignItems:"center",gap:5}}><span>⚠</span>{formErrors._composer}</div>}

        {/* ── Row 4: Pricing & Billing context (snapshot from Masters) ──
            Auto-populated when the line is added from the catalogue — a quote
            edit can also override per-line. Collapsed by default to keep the
            composer compact; opens automatically if any pricing field is set. */}
        {(() => {
          const hasPricingSnap = composer.licenseType || composer.billingFrequency
            || (Number(composer.setupFee)||0) > 0
            || (composer.griApplicable === "Yes" && (Number(composer.griPercentage)||0) > 0)
            || composer.hsnSac || (Number(composer.defaultTermMonths)||0) > 0
            || (Number(composer.minCommitment)||0) > 0;
          return (
        <details open={hasPricingSnap} style={{marginTop:10,paddingTop:10,borderTop:"1px dashed var(--border)"}}>
          <summary style={{cursor:"pointer",fontSize:11,fontWeight:700,color:"var(--text3)",letterSpacing:"0.4px",marginBottom:8,userSelect:"none"}}>
            PRICING &amp; BILLING (per-line snapshot from module master)
          </summary>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
            <div className="form-group"><label>License Type</label>
              <select value={composer.licenseType||""} onChange={e=>{
                const lt=e.target.value;
                // Mirror the Masters auto-derive: picking SaaS Per-User variants
                // also sets pricingModel + billingFrequency for consistency.
                setComposer(c=>{
                  const next={...c, licenseType:lt};
                  if(lt==="SaaS — Per User / Month")     return {...next, pricingModel:"Per-User", unit:"User", billingFrequency:"Monthly"};
                  if(lt==="SaaS — Per User / Quarterly") return {...next, pricingModel:"Per-User", unit:"User", billingFrequency:"Quarterly"};
                  if(lt==="SaaS — Per User / Yearly")    return {...next, pricingModel:"Per-User", unit:"User", billingFrequency:"Annual"};
                  if(lt==="Perpetual (OTD)")             return {...next, billingFrequency:"One-time"};
                  if(lt==="Perpetual + AMC")             return {...next, billingFrequency:"Annual"};
                  return next;
                });
              }}>
                <option value="">— Not set —</option>
                <option value="SaaS Subscription">SaaS Subscription</option>
                <option value="SaaS — Per User / Month">SaaS — Per User / Month</option>
                <option value="SaaS — Per User / Quarterly">SaaS — Per User / Quarterly</option>
                <option value="SaaS — Per User / Yearly">SaaS — Per User / Yearly</option>
                <option value="Term License">Term License</option>
                <option value="Perpetual (OTD)">Perpetual (OTD)</option>
                <option value="Perpetual + AMC">Perpetual + AMC</option>
              </select>
            </div>
            <div className="form-group"><label>Billing Frequency</label>
              <select value={composer.billingFrequency||""} onChange={e=>setC("billingFrequency",e.target.value)}>
                <option value="">— Not set —</option>
                {["One-time","Monthly","Quarterly","Half-Yearly","Annual","Per-Transaction","Usage-based"].map(b=><option key={b}>{b}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Pricing Model</label>
              <select value={composer.pricingModel||""} onChange={e=>setC("pricingModel",e.target.value)}>
                <option value="">— Not set —</option>
                {["Flat","Per-Unit","Per-User","Per-Transaction","Tiered","Volume","Usage-based"].map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group"><label>HSN/SAC</label>
              <input value={composer.hsnSac||""} onChange={e=>setC("hsnSac",e.target.value)} placeholder="e.g. 998313"/>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:8}}>
            <div className="form-group"><label>Setup Fee ({sym.trim()||sym})</label>
              <input type="number" min={0} step={1} value={composer.setupFee||0} onChange={e=>setC("setupFee",+e.target.value)} placeholder="0"/>
            </div>
            <div className="form-group"><label>Min Commitment / period</label>
              <input type="number" min={0} step={1} value={composer.minCommitment||0} onChange={e=>setC("minCommitment",+e.target.value)} placeholder="0"/>
            </div>
            <div className="form-group"><label>Default Term</label>
              <select value={String(composer.defaultTermMonths||0)} onChange={e=>setC("defaultTermMonths",+e.target.value)}>
                <option value="0">— Not set —</option>
                <option value="12">12 months</option>
                <option value="24">24 months</option>
                <option value="36">36 months</option>
                <option value="60">60 months</option>
              </select>
            </div>
            <div className="form-group"><label>GRI Applicable</label>
              <select value={composer.griApplicable||""} onChange={e=>setC("griApplicable",e.target.value)}>
                <option value="">— Not set —</option>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
            <div className="form-group"><label>GRI %</label>
              <input type="number" min={0} max={100} step={0.5} value={composer.griPercentage||0} onChange={e=>setC("griPercentage",+e.target.value)} disabled={composer.griApplicable!=="Yes"} placeholder="0"/>
            </div>
          </div>
          <div style={{fontSize:11,color:"var(--text3)",marginTop:6,fontStyle:"italic"}}>
            These fields are carried onto the quote line as a snapshot of the module master at quote time, so the proposal PDF and the contract generator have the right billing context even if the catalogue is later edited. Setup Fee is currently informational on the line — quote-level totals don't add it automatically.
          </div>
        </details>
          );
        })()}
      </div>

      {/* ── Lines grid (read-back of inserted lines) ── */}
      {form.items.length===0 ? (
        <div style={{padding:"24px 16px",textAlign:"center",color:"var(--text3)",fontSize:13,background:"var(--s2)",borderRadius:8,marginBottom:14}}>
          No line items yet. Pick from the catalogue above, or compose a line and click <strong>Insert</strong>.
        </div>
      ) : (
        <div style={{border:"1px solid var(--border)",borderRadius:8,overflow:"hidden",marginBottom:14}}>
          <div style={{background:"#1E293B",color:"#E2E8F0",fontSize:11,fontWeight:700,letterSpacing:"0.4px",display:"grid",gridTemplateColumns:isManager?"30px 110px 1.6fr 50px 70px 90px 80px 90px 90px 90px 60px":"30px 110px 1.8fr 50px 80px 100px 90px 90px 90px 60px",padding:"8px 10px",gap:8}}>
            <span>#</span>
            <span>Charge</span>
            <span>Description</span>
            <span style={{textAlign:"right"}}>Qty</span>
            <span style={{textAlign:"right"}}>MRP</span>
            <span style={{textAlign:"right"}}>Discount</span>
            <span style={{textAlign:"right"}}>Price</span>
            {isManager && <span style={{textAlign:"right"}}>Cost</span>}
            <span style={{textAlign:"right"}}>Taxable</span>
            <span style={{textAlign:"right"}}>GST</span>
            <span style={{textAlign:"right"}}>Total</span>
            <span></span>
          </div>
          {form.items.map((item,i)=>{
            const s=curSym(item.currency);
            const dv=Number(item.discountValue)||0;
            const dt=item.discountType||"pct";
            const gst=(Number(item.igstAmount)||0)+(Number(item.cgstAmount)||0)+(Number(item.sgstAmount)||0);
            const isEditing=editingIdx===i;
            return (
              <div key={i}
                onClick={()=>loadRowToComposer(item,i)}
                title="Click to load into composer for editing"
                style={{display:"grid",gridTemplateColumns:isManager?"30px 110px 1.6fr 50px 70px 90px 80px 90px 90px 90px 60px":"30px 110px 1.8fr 50px 80px 100px 90px 90px 90px 60px",padding:"10px",gap:8,fontSize:12.5,borderBottom:"1px solid var(--border)",cursor:"pointer",background:isEditing?"#FFFBEB":(i%2?"#F8FAFC":"#fff"),alignItems:"center"}}>
                <span style={{color:"var(--text3)",fontWeight:600}}>{i+1}</span>
                <span style={{fontFamily:"monospace",fontSize:11,color:"var(--text2)"}}>{item.chargeName||"—"}</span>
                <span style={{minWidth:0,overflow:"hidden"}}>
                  <div style={{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}} title={item.description}>{item.description||<em style={{color:"var(--text3)"}}>(no description)</em>}</div>
                  {/* Per-line pricing-context badges from Masters snapshot — only render
                      what's set, so legacy lines stay visually clean. Click on the row
                      still loads it into the composer for editing (event bubbles up). */}
                  {(item.licenseType || item.billingFrequency || (Number(item.setupFee)||0)>0 || (item.griApplicable==="Yes" && (Number(item.griPercentage)||0)>0) || item.hsnSac) && (
                    <div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:3}}>
                      {item.licenseType && <span title="License Type" style={{fontSize:9.5,fontWeight:600,color:"#3730A3",background:"#EEF2FF",border:"1px solid #C7D2FE",padding:"1px 5px",borderRadius:8,whiteSpace:"nowrap"}}>{item.licenseType}</span>}
                      {item.billingFrequency && <span title="Billing Frequency" style={{fontSize:9.5,fontWeight:600,color:"#1D4ED8",background:"#EFF6FF",border:"1px solid #BFDBFE",padding:"1px 5px",borderRadius:8,whiteSpace:"nowrap"}}>{item.billingFrequency}</span>}
                      {(Number(item.setupFee)||0)>0 && <span title="One-time setup fee" style={{fontSize:9.5,fontWeight:600,color:"#5B21B6",background:"#EDE9FE",border:"1px solid #DDD6FE",padding:"1px 5px",borderRadius:8,whiteSpace:"nowrap"}}>Setup {s}{Number(item.setupFee).toLocaleString()}</span>}
                      {item.griApplicable==="Yes" && Number(item.griPercentage)>0 && <span title="Annual GRI" style={{fontSize:9.5,fontWeight:600,color:"#92400E",background:"#FFFBEB",border:"1px solid #FDE68A",padding:"1px 5px",borderRadius:8,whiteSpace:"nowrap"}}>GRI {item.griPercentage}%</span>}
                      {item.hsnSac && <span title="HSN/SAC" style={{fontSize:9.5,fontWeight:600,color:"#0F766E",background:"#F0FDFA",border:"1px solid #99F6E4",padding:"1px 5px",borderRadius:8,whiteSpace:"nowrap"}}>HSN {item.hsnSac}</span>}
                    </div>
                  )}
                </span>
                <span style={{textAlign:"right"}}>{item.qty}</span>
                <span style={{textAlign:"right"}}>{(Number(item.mrp)||0)>0?`${s}${(Number(item.mrp)||0).toLocaleString()}`:"—"}</span>
                <span style={{textAlign:"right",color:dv>0?"#B91C1C":"var(--text3)"}}>{dv>0?(dt==="pct"?`${dv}%`:`${s}${dv.toLocaleString()}`):"—"}</span>
                <span style={{textAlign:"right",fontWeight:600}}>{s}{(Number(item.unitPrice)||0).toLocaleString()}</span>
                {isManager && <span style={{textAlign:"right",color:"#92400E"}}>{(Number(item.unitCost)||0)>0?`${s}${(Number(item.unitCost)||0).toLocaleString()}`:"—"}</span>}
                <span style={{textAlign:"right",fontWeight:600}}>{s}{(Number(item.amount)||0).toLocaleString()}</span>
                <span style={{textAlign:"right",color:gst>0?"var(--text2)":"var(--text3)"}} title={gst>0?`IGST ${item.igstAmount||0} · CGST ${item.cgstAmount||0} · SGST ${item.sgstAmount||0}`:""}>{gst>0?`${s}${gst.toLocaleString()}`:"—"}</span>
                <span style={{textAlign:"right",fontWeight:700,color:"var(--brand)"}}>{s}{(Number(item.totalWithTax)||Number(item.amount)||0).toLocaleString()}</span>
                <span style={{textAlign:"right"}}>
                  <button type="button" className="icon-btn" onClick={(e)=>{e.stopPropagation();removeItem(i);if(editingIdx===i) clearComposer();}} title="Remove line"><Trash2 size={13}/></button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tax summary footer (6-way breakdown) ── */}
      <div style={{background:"#F8FAFC",border:"1px solid var(--border)",borderRadius:10,padding:"14px 16px"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:12,fontSize:12}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",letterSpacing:"0.4px",marginBottom:3}}>CARD RATE TOTAL</div>
            <div style={{fontWeight:600}}>₹{cardRateTotal.toLocaleString()}</div>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#B91C1C",letterSpacing:"0.4px",marginBottom:3}}>DISCOUNT</div>
            <div style={{fontWeight:600,color:"#B91C1C"}}>− ₹{(discountTotalPerLine + (Number(form.discount)||0)).toLocaleString()}</div>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"var(--text3)",letterSpacing:"0.4px",marginBottom:3}}>TAXABLE</div>
            <div style={{fontWeight:600}}>₹{taxableTotal.toLocaleString()}</div>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#5B21B6",letterSpacing:"0.4px",marginBottom:3}}>IGST</div>
            <div style={{fontWeight:600,color:igstTotal>0?"#5B21B6":"var(--text3)"}}>{igstTotal>0?`₹${igstTotal.toLocaleString()}`:"—"}</div>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#1E40AF",letterSpacing:"0.4px",marginBottom:3}}>CGST</div>
            <div style={{fontWeight:600,color:cgstTotal>0?"#1E40AF":"var(--text3)"}}>{cgstTotal>0?`₹${cgstTotal.toLocaleString()}`:"—"}</div>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:700,color:"#065F46",letterSpacing:"0.4px",marginBottom:3}}>SGST</div>
            <div style={{fontWeight:600,color:sgstTotal>0?"#065F46":"var(--text3)"}}>{sgstTotal>0?`₹${sgstTotal.toLocaleString()}`:"—"}</div>
          </div>
          <div style={{borderLeft:"2px solid var(--brand)",paddingLeft:12}}>
            <div style={{fontSize:10,fontWeight:700,color:"var(--brand)",letterSpacing:"0.4px",marginBottom:3}}>GRAND TOTAL</div>
            <div style={{fontSize:18,fontWeight:800,color:"var(--brand)",lineHeight:1}}>₹{grandTotal.toLocaleString()}</div>
          </div>
        </div>
        {/* Quote-level discount adjuster (kept for backward-compat with old quotes
            that used a single bottom-line discount before per-line was available). */}
        <div style={{marginTop:10,paddingTop:10,borderTop:"1px dashed var(--border)",display:"flex",alignItems:"center",gap:12,fontSize:12}}>
          <span style={{color:"var(--text3)",fontSize:11}}>Quote-level extra discount (optional, applied after per-line):</span>
          <input type="number" min={0} step={0.5} value={form.discount||0} onChange={e=>{const d=+e.target.value;setForm(f=>{const totals=recalc(f.items,f.taxType,d,f.placeOfSupply);return{...f,discount:d,...totals};});}} style={{width:100,padding:"4px 6px"}}/>
          {!form.placeOfSupply && <span style={{color:"#92400E",background:"#FFFBEB",padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:600,border:"1px solid #FCD34D"}}>⚠ Set Place of Supply in Details tab for proper IGST/CGST/SGST split</span>}
          {isManager && (() => {
            const totalCost=form.items.reduce((s,i)=>s+(Number(i.unitCost||0)*Number(i.qty||0)),0);
            if(totalCost===0) return null;
            const margin=taxableTotal-totalCost;
            const marginPct=taxableTotal>0?+((margin/taxableTotal)*100).toFixed(1):0;
            return <span style={{marginLeft:"auto",fontSize:11,color:marginPct<20?"#B91C1C":marginPct<40?"#92400E":"#047857",fontWeight:600}}>Cost: ₹{totalCost.toLocaleString()} · Margin: ₹{margin.toLocaleString()} ({marginPct}%) <span style={{fontWeight:500,opacity:0.7}}>· internal only</span></span>;
          })()}
        </div>
      </div>
    </div>
  );
}

function Quotations({quotes,setQuotes,accounts,contacts,opps,leads=[],contracts=[],setContracts,commLogs,setCommLogs,currentUser,orgUsers,catalog,canDelete,isManager=false}) {
  const team = orgUsers?.length ? orgUsers.filter(u=>u.status!=='Inactive') : TEAM;
  const [search,setSearch]=useState("");
  const [statusF,setStatusF]=useState("All");
  const [managerF,setManagerF]=useState("All");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState(BLANK_QUOTE);
  const [detail,setDetail]=useState(null);
  const [confirm,setConfirm]=useState(null);
  // sendEmailModal: when set, opens SendEmailModal pre-filled with the quote
  // template + the quote's account contact's email + accept link.
  const [sendEmailModal,setSendEmailModal]=useState(null);
  const [formErrors,setFormErrors]=useState({});
  const [formTab,setFormTab]=useState("details");
  const [sourceMode,setSourceMode]=useState("opportunity"); // "opportunity" | "lead" | "account"
  const [sourceLeadId,setSourceLeadId]=useState("");
  // Inline modals replacing window.prompt / window.alert / window.confirm
  const [rejectModal,setRejectModal]=useState(null);   // {quote} — rejection reason input
  const [acceptModal,setAcceptModal]=useState(null);   // {quote} — signed URL + accept
  const [attachModal,setAttachModal]=useState(null);   // {quoteId, name, url} — add attachment
  const [toast,setToast]=useState(null);               // {msg} — transient success notification
  const [termsConfirm,setTermsConfirm]=useState(null); // {template} | "clear"

  /* ── Snapshot an Account's billing/legal context onto the quote ──
     We copy into the form (editable) so a later account edit doesn't
     rewrite historical quote PDFs. Only fill blanks on the form so the
     user's manual edits win. */
  const snapshotAccount=(acc,f)=>{
    if(!acc) return {};
    const billingAddr=acc.billingAddress||[acc.billingAddress,acc.billingCity,acc.billingState,acc.billingPincode,acc.billingCountry].filter(Boolean).join(", ")||acc.address||"";
    return {
      legalName:         f.legalName         || acc.legalName         || acc.name || "",
      billingAddressSnapshot:  f.billingAddressSnapshot  || billingAddr,
      shippingAddressSnapshot: f.shippingAddressSnapshot || billingAddr,
      gstin:             f.gstin             || acc.gstin             || "",
      pan:               f.pan               || acc.pan               || "",
      taxTreatment:      f.taxTreatment      || acc.taxTreatment      || "",
      poMandatory:       f.poMandatory       || acc.poMandatory       || "",
      paymentTerms:      f.paymentTerms      || acc.paymentTerms      || "",
      creditDays:        f.creditDays        || acc.creditDays        || 0,
      currency:          f.currency          || acc.currency          || "INR",
      billingContactName:  f.billingContactName  || acc.billingContactName  || acc.primaryContact || "",
      billingContactEmail: f.billingContactEmail || acc.billingContactEmail || acc.primaryEmail   || "",
      financeContactEmail: f.financeContactEmail || acc.financeContactEmail || "",
      territory:         f.territory         || acc.territory         || "",
      // Derive POS from billingState / billingCountry so the rep doesn't have to
      // hunt for it. Form value wins (manual edits aren't overwritten).
      placeOfSupply:     f.placeOfSupply     || derivePOSFromAccount(acc) || "",
    };
  };

  /* ── Auto-populate from a selected Opportunity ── */
  const applyOppCascade=(oppId)=>{
    const opp=opps.find(o=>o.id===oppId);
    if(!opp){setForm(f=>({...f,oppId:""}));return;}
    setForm(f=>{
      const acc=accounts.find(a=>a.id===opp.accountId);
      const sel=(Array.isArray(opp.productSelection)&&opp.productSelection.length>0)?opp.productSelection:(opp.products||[]).map(pid=>({productId:pid,moduleIds:[],noAddons:false}));
      // Synthesize line items: one per productSelection entry when possible,
      // else a single deal-value lump sum.
      let items=f.items;
      if(!items||items.length===0){
        // Prefer building lines from the catalogue using each picked module's
        // MRP — gives the rep a real starting price to discount against. We
        // only fall back to splitting opp.value when no MRP is available.
        const fromCatalog=[];
        for(const s of sel){
          const prod=(catalog||[]).find(p=>p.id===s.productId);
          if(!prod) continue;
          const modIds=Array.isArray(s.moduleIds)?s.moduleIds:[];
          if(modIds.length===0) continue;
          for(const mid of modIds){
            const mod=(prod.modules||[]).find(m=>m.id===mid);
            if(!mod) continue;
            const mrp=Number(mod.mrp)||0;
            fromCatalog.push({
              ...BLANK_QUOTE_ITEM,
              description: `${prod.name} – ${mod.name}`,
              productId: prod.id, moduleId: mod.id,
              mrp, unit: mod.unit||"License", currency: mod.currency||"INR",
              qty: 1,
              unitPrice: mrp, amount: mrp,
            });
          }
        }
        if(fromCatalog.length>0){
          items=fromCatalog;
        } else if(sel.length>0 && opp.value){
          const per=Number(opp.value)/sel.length;
          items=sel.map(s=>({...BLANK_QUOTE_ITEM,description:`${s.productId}${Array.isArray(s.moduleIds)&&s.moduleIds.length?` (${s.moduleIds.join(", ")})`:""}`,qty:1,unitPrice:+per.toFixed(2),amount:+per.toFixed(2)}));
        } else if(opp.value){
          items=[{...BLANK_QUOTE_ITEM,description:opp.title||"Deal value",qty:1,unitPrice:Number(opp.value)||0,amount:Number(opp.value)||0}];
        }
      }
      const accSnap=snapshotAccount(acc,f);
      // Use the freshly-derived POS so per-line GST is split correctly on the
      // very first cascade — otherwise the rep would have to nudge POS to
      // re-trigger recalc.
      const totals=recalc(items,f.taxType,f.discount,accSnap.placeOfSupply||f.placeOfSupply);
      return {
        ...f,
        oppId:opp.id,
        accountId:opp.accountId||f.accountId,
        contactId:opp.primaryContactId||f.contactId,
        product:sel[0]?.productId||f.product,
        productSelection:sel,
        title:f.title||`${opp.title||"Quote"} – ${acc?.name||""}`.trim(),
        items,
        ...totals,
        // ── Deal context from opportunity ──
        currency:     opp.currency     || accSnap.currency     || f.currency,
        territory:    opp.territory    || accSnap.territory    || f.territory,
        lob:          opp.lob          || f.lob,
        dealSize:     opp.dealSize     || f.dealSize,
        secondaryContactIds: (Array.isArray(opp.secondaryContactIds)&&opp.secondaryContactIds.length)?[...opp.secondaryContactIds]:f.secondaryContactIds,
        // CC contacts = opp's secondary contacts, minus whoever is already primary
        ccContactIds: (Array.isArray(opp.secondaryContactIds)&&opp.secondaryContactIds.length)
          ? opp.secondaryContactIds.filter(id=>id!==(opp.primaryContactId||f.contactId))
          : (f.ccContactIds||[]),
        contactRoles:        (Array.isArray(opp.contactRoles)&&opp.contactRoles.length)?[...opp.contactRoles]:f.contactRoles,
        sourceLeadId: (Array.isArray(opp.sourceLeadIds)&&opp.sourceLeadIds[0])||opp.leadId||f.sourceLeadId,
        expiryDate:   f.expiryDate || opp.decisionDate || opp.closeDate || "",
        notes:        f.notes || [opp.nextStep&&`Next step: ${opp.nextStep}`,opp.competitors&&`Competitors: ${opp.competitors}`].filter(Boolean).join(" · "),
        // ── Billing snapshot from account ──
        ...accSnap,
      };
    });
  };

  /* ── Auto-populate from a selected Lead ── */
  const applyLeadCascade=(leadId)=>{
    const lead=leads.find(l=>l.id===leadId);
    setSourceLeadId(leadId);
    if(!lead) return;
    setForm(f=>{
      const acc=accounts.find(a=>a.id===lead.accountId);
      const sel=(Array.isArray(lead.productSelection)&&lead.productSelection.length>0)?lead.productSelection:(lead.product?[{productId:lead.product,moduleIds:[],noAddons:false}]:[]);
      let items=f.items;
      if((!items||items.length===0)&&lead.estimatedValue){
        items=[{description:`${lead.product||"Solution"} – ${lead.company||""}`.trim(),qty:1,unitPrice:Number(lead.estimatedValue)||0,amount:Number(lead.estimatedValue)||0}];
      }
      const accSnap=snapshotAccount(acc,f);
      // Same as opp cascade: recompute with the freshly-derived POS.
      const totals=recalc(items,f.taxType,f.discount,accSnap.placeOfSupply||f.placeOfSupply);
      const discoveryNotes=[
        lead.painPoints&&(Array.isArray(lead.painPoints)?lead.painPoints.join("; "):lead.painPoints),
        lead.decisionTimeline&&`Decision timeline: ${lead.decisionTimeline}`,
        lead.budgetRange&&`Budget: ${lead.budgetRange}`,
        lead.competitorName&&`Competitor: ${lead.competitorName}`,
      ].filter(Boolean).join(" · ");
      return {
        ...f,
        accountId:lead.accountId||f.accountId,
        contactId:lead.contactIds?.[0]||f.contactId,
        product:sel[0]?.productId||f.product,
        productSelection:sel,
        title:f.title||`Proposal for ${lead.company||lead.contact||""}`.trim(),
        notes:f.notes|| (discoveryNotes?`${discoveryNotes} · `:"")+`Generated from lead ${lead.leadId||lead.id}. Source: ${lead.source||"—"}.`,
        items,
        ...totals,
        expiryDate: f.expiryDate || lead.expectedCloseDate || "",
        sourceLeadId: lead.id,
        territory: lead.region || accSnap.territory || f.territory,
        ...accSnap,
        // Legal name falls back to lead company when no Account linked yet
        legalName: f.legalName || acc?.legalName || acc?.name || lead.company || "",
      };
    });
  };

  /* ── Auto-populate from a selected Account (Direct mode) ── */
  const applyAccountCascade=(accountId)=>{
    const acc=accounts.find(a=>a.id===accountId);
    // Auto-pick the primary contact for this account (primary flag, then first available)
    const accContact=contacts.find(c=>c.accountId===accountId&&c.primary)||contacts.find(c=>c.accountId===accountId);
    setForm(f=>{
      const accSnap=snapshotAccount(acc,f);
      // Recompute totals with the auto-derived POS so any pre-existing line
      // items pick up the correct GST split immediately.
      const pos=accSnap.placeOfSupply||f.placeOfSupply;
      const totals=recalc(f.items,f.taxType,f.discount,pos);
      return {
        ...f,
        accountId: accountId||"",
        // Only auto-fill contact when there is none yet — don't overwrite a manual pick
        contactId: f.contactId || accContact?.id || "",
        ...accSnap,
        ...totals,
        title: f.title || (acc ? `Quote – ${acc.name}` : f.title),
      };
    });
  };

  const enriched=useMemo(()=>quotes.map((q,idx)=>{
    const acc=accounts.find(a=>a.id===q.accountId);
    const opp=opps.find(o=>o.id===q.oppId);
    const yr=q.createdDate?new Date(q.createdDate).getFullYear():2024;
    // Derive a stable human-readable ID from the stored q.id (e.g. "QT-007" → "#FL-2024-007").
    // Falling back to array index only for legacy records that predate the QT- scheme.
    const seqStr=q.id?.match(/QT-(\d+)/)?.[1]||String(idx+1).padStart(3,"0");
    return {
      ...q,
      _accName:acc?.name||"—",
      _sector:SECTOR_MAP_FROM_TYPE[acc?.type]||acc?.type||"Services",
      _quoteId:`#FL-${yr}-${seqStr.padStart(3,"0")}`,
      _prob:opp?.probability||({"Draft":20,"Sent":50,"Under Review":65,"Accepted":100,"Rejected":0,"Expired":0,"Revised":30}[q.status]||0),
      _ownerName:TEAM_MAP[q.owner]?.name||"—",
    };
  }),[quotes,accounts,opps]);

  const filtered=useMemo(()=>{
    let list=[...enriched];
    if(statusF!=="All") list=list.filter(q=>q.status===statusF);
    if(managerF!=="All") list=list.filter(q=>q.owner===managerF);
    if(dateFrom) list=list.filter(q=>(q.sentDate||q.createdDate)>=dateFrom);
    if(dateTo) list=list.filter(q=>(q.sentDate||q.createdDate)<=dateTo);
    if(search) list=list.filter(q=>(q.title+q._accName+q.id+q._quoteId+q._sector).toLowerCase().includes(search.toLowerCase()));
    return list.sort((a,b)=>(b.createdDate||"").localeCompare(a.createdDate||""));
  },[enriched,statusF,managerF,dateFrom,dateTo,search]);

  const sort=useSort();
  const sorted=useMemo(()=>sort.key?sort.apply(filtered):filtered,[filtered,sort.key,sort.dir]);
  const pg=usePagination(sorted);

  /* ── KPI computations ── */
  const nonDraftQuotes=enriched.filter(q=>q.status!=="Draft");
  const totalQuoteValue=nonDraftQuotes.reduce((s,q)=>s+q.total,0);
  const sentAndReviewedCount=enriched.filter(q=>["Sent","Under Review","Accepted","Rejected"].includes(q.status)).length;
  const acceptedCount=enriched.filter(q=>q.status==="Accepted").length;
  const conversionRate=sentAndReviewedCount>0?((acceptedCount/sentAndReviewedCount)*100).toFixed(1):0;
  const activeQuotes=enriched.filter(q=>["Sent","Under Review","Draft"].includes(q.status)).length;
  const negotiationCount=enriched.filter(q=>q.status==="Under Review").length;

  // Keep old values for backward compat
  const totalValue=quotes.filter(q=>["Sent","Under Review"].includes(q.status)).reduce((s,q)=>s+q.total,0);
  const acceptedValue=quotes.filter(q=>q.status==="Accepted").reduce((s,q)=>s+q.total,0);

  // ── Per-line GST split based on Place of Supply ─────────────────
  // Returns the {igst, cgst, sgst} percentages that should apply to each
  // line. Logic:
  //   - taxType "No Tax" / rate 0 → all zero
  //   - placeOfSupply empty  → all zero per-line; total tax falls back to
  //                            quote-level lump-sum (legacy behaviour)
  //   - POS == seller home   → CGST + SGST (split rate in half)
  //   - POS == "Outside India" → all zero (export / zero-rated)
  //   - POS != seller home   → IGST (full rate)
  const lineTaxRates=(taxType,placeOfSupply)=>{
    const rate=TAX_RATES[taxType]||0;
    if(rate===0||!placeOfSupply) return {igst:0,cgst:0,sgst:0};
    if(placeOfSupply==="Outside India") return {igst:0,cgst:0,sgst:0};
    if(placeOfSupply===SELLER_HOME_STATE) return {igst:0,cgst:rate/2,sgst:rate/2};
    return {igst:rate,cgst:0,sgst:0};
  };

  // Single-line recompute: derives unitPrice from MRP+discount, amount from
  // qty, then per-line GST amounts from the quote's POS context.
  const recalcLineWithCtx=(item,quoteCtx)=>{
    const mrp=Number(item.mrp)||0;
    const dv=Number(item.discountValue)||0;
    const dt=item.discountType||"pct";
    let unitPrice=Number(item.unitPrice)||0;
    if(mrp>0){
      const discountAmt=dt==="pct"?(mrp*dv)/100:dv;
      unitPrice=Math.max(0,+(mrp-discountAmt).toFixed(2));
    }
    const qty=Number(item.qty)||0;
    const amount=+(unitPrice*qty).toFixed(2);
    const rates=quoteCtx ? lineTaxRates(quoteCtx.taxType,quoteCtx.placeOfSupply)
                         : {igst:Number(item.igstRate)||0,cgst:Number(item.cgstRate)||0,sgst:Number(item.sgstRate)||0};
    const igstAmount=+(amount*rates.igst/100).toFixed(2);
    const cgstAmount=+(amount*rates.cgst/100).toFixed(2);
    const sgstAmount=+(amount*rates.sgst/100).toFixed(2);
    const totalWithTax=+(amount+igstAmount+cgstAmount+sgstAmount).toFixed(2);
    return {...item,unitPrice,amount,
      igstRate:rates.igst,cgstRate:rates.cgst,sgstRate:rates.sgst,
      igstAmount,cgstAmount,sgstAmount,totalWithTax};
  };

  // Whole-quote recompute. Recomputes every line's tax using the current
  // POS, then aggregates totals. Returns `items` so callers spread it back
  // and per-line tax stays consistent with quote-level POS.
  const recalc=(items,taxType,discount,placeOfSupply)=>{
    const ctx={taxType,placeOfSupply};
    const recomputed=(items||[]).map(it=>recalcLineWithCtx(it,ctx));
    const subtotal=+recomputed.reduce((s,i)=>s+(Number(i.amount)||0),0).toFixed(2);
    const igstTotal=+recomputed.reduce((s,i)=>s+(Number(i.igstAmount)||0),0).toFixed(2);
    const cgstTotal=+recomputed.reduce((s,i)=>s+(Number(i.cgstAmount)||0),0).toFixed(2);
    const sgstTotal=+recomputed.reduce((s,i)=>s+(Number(i.sgstAmount)||0),0).toFixed(2);
    let taxAmount=+(igstTotal+cgstTotal+sgstTotal).toFixed(2);
    // Legacy fallback: when POS is empty (old quotes / not yet set), fall
    // back to the lump-sum tax = (subtotal - discount) * rate so existing
    // quotes don't lose their displayed tax until the rep sets POS.
    if(!placeOfSupply){
      const rate=TAX_RATES[taxType]||0;
      taxAmount=+((subtotal-(+discount||0))*rate/100).toFixed(2);
    }
    const total=+(subtotal-(+discount||0)+taxAmount).toFixed(2);
    return {items:recomputed,subtotal,taxAmount,total,igstTotal,cgstTotal,sgstTotal};
  };

  const openAdd=()=>{
    const id=`QT-${String(quotes.length+1).padStart(3,"0")}`;
    setForm({...BLANK_QUOTE,id,owner:currentUser,createdDate:today,items:[]});
    setFormErrors({});setFormTab("details");setSourceMode("opportunity");setSourceLeadId("");setModal({mode:"add"});
  };
  const openEdit=(q)=>{
    const seeded=(Array.isArray(q.productSelection)&&q.productSelection.length>0)?q.productSelection:(q.product?[{productId:q.product,moduleIds:[],noAddons:false}]:[]);
    // Auto-derive the best contactId if not yet stored on the quote:
    // priority: stored q.contactId → opp.primaryContactId → lead.contactIds[0] → first account contact
    let contactId=q.contactId||"";
    if(!contactId && q.oppId){
      const opp=opps.find(o=>o.id===q.oppId);
      contactId=opp?.primaryContactId||(opp?.secondaryContactIds?.[0])||"";
    }
    if(!contactId && q.accountId){
      const accContact=contacts.find(c=>c.accountId===q.accountId&&c.primary)||contacts.find(c=>c.accountId===q.accountId);
      contactId=accContact?.id||"";
    }
    setForm({...q,items:[...q.items.map(i=>({...i}))],productSelection:seeded,contactId});
    setFormErrors({});setFormTab("details");setSourceMode(q.oppId?"opportunity":q.accountId?"account":"opportunity");setSourceLeadId("");setModal({mode:"edit",lockedFinal:!!q.isFinal});
  };
  const duplicate=(q)=>{
    const id=`QT-${String(quotes.length+1).padStart(3,"0")}`;
    // Create new revision linked to parent + flip parent → Revised (terminal/superseded)
    setQuotes(p=>{
      const next=[...p,{...q,id,status:"Draft",version:(q.version||1)+1,createdDate:today,sentDate:"",expiryDate:"",isFinal:false,supersedesQuoteId:q.id,notes:`Revised from ${q.id}. `+(q.notes||"")}];
      return next.map(r=>r.id===q.id&&!["Accepted","Rejected","Revised"].includes(r.status)?{...r,status:"Revised"}:r);
    });
  };

  /* ── Send action: Draft → Sent + stamp sentDate (gated by approval matrix) ── */
  const sendQuote=(q)=>{
    if(needsApproval(q) && q.approvalStatus!=="Approved"){
      // Request approval instead of sending
      setQuotes(p=>p.map(r=>r.id===q.id?{...r,approvalStatus:"Pending",approvalRequestedAt:new Date().toISOString()}:r));
      alert(`This quote needs manager approval before sending — ${approvalReason(q)}.\nApproval has been requested.`);
      return;
    }
    const sentDate=today;
    const days=parseInt(String(q.validity||"30"),10)||30;
    const exp=new Date(sentDate);exp.setDate(exp.getDate()+days);
    const expiryDate=exp.toISOString().slice(0,10);
    const con=contacts.find(c=>c.id===q.contactId);
    const acc=accounts.find(a=>a.id===q.accountId);
    const ccEmails=(q.ccContactIds||[]).map(id=>contacts.find(c=>c.id===id)?.email).filter(Boolean).join(", ");
    const logEntry={id:uid(),sentAt:new Date().toISOString(),sentBy:currentUser,to:con?.email||"",cc:ccEmails,subject:`Quote ${q.id} – ${q.title||acc?.name||""}`.trim(),kind:"initial"};
    const ce={id:uid(),at:new Date().toISOString(),by:currentUser,field:"status",from:q.status,to:"Sent",note:"sent to customer"};
    setQuotes(p=>p.map(r=>r.id===q.id?{...r,status:"Sent",sentDate,expiryDate:r.expiryDate||expiryDate,emailLog:[...(r.emailLog||[]),logEntry],changeLog:[...(r.changeLog||[]),ce]}:r));
  };

  /* ── Manual resend / send reminder action ── */
  const logReminder=(q,kind="manual")=>{
    const con=contacts.find(c=>c.id===q.contactId);
    const acc=accounts.find(a=>a.id===q.accountId);
    const ccEmails=(q.ccContactIds||[]).map(id=>contacts.find(c=>c.id===id)?.email).filter(Boolean).join(", ");
    const logEntry={id:uid(),sentAt:new Date().toISOString(),sentBy:currentUser,to:con?.email||"",cc:ccEmails,subject:`Reminder: Quote ${q.id} – ${q.title||acc?.name||""}`.trim(),kind};
    setQuotes(p=>p.map(r=>r.id===q.id?{...r,emailLog:[...(r.emailLog||[]),logEntry],lastReminderAt:logEntry.sentAt}:r));
  };

  /* ── Approval actions (manager only) ── */
  const approveQuote=(q)=>{
    const at=new Date().toISOString();
    const ce={id:uid(),at,by:currentUser,field:"approvalStatus",from:q.approvalStatus||"Pending",to:"Approved",note:""};
    setQuotes(p=>p.map(r=>r.id===q.id?{...r,approvalStatus:"Approved",approvedBy:currentUser,approvedAt:at,rejectedReason:"",changeLog:[...(r.changeLog||[]),ce]}:r));
  };
  const rejectQuote=(q)=>setRejectModal({quote:q});
  const _doRejectQuote=(q,reason)=>{
    const at=new Date().toISOString();
    const ce={id:uid(),at,by:currentUser,field:"approvalStatus",from:q.approvalStatus||"Pending",to:"Rejected",note:reason||"No reason given"};
    setQuotes(p=>p.map(r=>r.id===q.id?{...r,approvalStatus:"Rejected",approvedBy:currentUser,approvedAt:at,rejectedReason:reason||"No reason given",changeLog:[...(r.changeLog||[]),ce]}:r));
    setRejectModal(null);
  };

  /* ── Customer Accept: Sent/Under Review → Accepted + stamp + auto-create Contract draft ── */
  const acceptQuote=(q)=>setAcceptModal({quote:q});
  const _doAcceptQuote=(q,url="")=>{
    setAcceptModal(null);
    const acceptedDate=today;
    // Auto-create a Contract draft linking back to this quote
    let contractId="";
    if(setContracts && BLANK_CONTRACT){
      const existing=contracts.length;
      contractId=`CT-${String(existing+1).padStart(3,"0")}`;
      const acc=accounts.find(a=>a.id===q.accountId);
      const newContract={
        ...BLANK_CONTRACT,
        id:contractId,
        contractNo:contractId,
        title:q.title,
        accountId:q.accountId,
        oppId:q.oppId||"",
        contactId:q.contactId||"",
        product:q.product,
        productSelection:q.productSelection,
        value:q.total,
        currency:"INR",
        status:"Draft",
        startDate:acceptedDate,
        owner:q.owner||currentUser,
        createdDate:acceptedDate,
        signedDocUrl:url,
        notes:`Auto-created from accepted quote ${q.id}${acc?` for ${acc.name}`:""}.`,
      };
      setContracts(p=>[...p,newContract]);
    }
    const ce={id:uid(),at:new Date().toISOString(),by:currentUser,field:"status",from:q.status,to:"Accepted",note:contractId?`contract ${contractId} created`:"customer accepted"};
    setQuotes(p=>p.map(r=>r.id===q.id?{...r,status:"Accepted",acceptedDate,signedQuoteUrl:url,contractId,isFinal:true,changeLog:[...(r.changeLog||[]),ce]}:r));
    if(contractId) setToast({msg:`Quote accepted ✓  Contract draft ${contractId} created — open Contracts to finalise terms.`});
  };

  /* ── Reminder cadence: queue follow-up nudges at QUOTE_REMINDER_OFFSETS days after sentDate ── */
  const _reminderRanRef=useRef(false);
  const [pendingReminders,setPendingReminders]=useState([]);
  useEffect(()=>{
    if(_reminderRanRef.current) return;
    const now=new Date(today);
    const due=[];
    quotes.forEach(q=>{
      if(!["Sent","Under Review"].includes(q.status)) return;
      if(!q.sentDate) return;
      const sentMs=new Date(q.sentDate).getTime();
      const ageDays=Math.floor((now-sentMs)/86400000);
      // Find the highest offset whose threshold has been crossed since the last reminder
      const lastMs=q.lastReminderAt?new Date(q.lastReminderAt).getTime():sentMs;
      const lastAgeDays=Math.floor((now-lastMs)/86400000);
      const crossedOffset=QUOTE_REMINDER_OFFSETS.find(d=>ageDays>=d && lastAgeDays>=7);
      if(crossedOffset) due.push({quote:q,ageDays,offset:crossedOffset});
    });
    if(due.length>0) setPendingReminders(due);
    _reminderRanRef.current=true;
  },[quotes]);
  const dispatchReminders=()=>{
    pendingReminders.forEach(({quote})=>logReminder(quote,"reminder"));
    setPendingReminders([]);
  };

  /* ── Auto-expire: flip Sent / Under Review to Expired when expiryDate < today ── */
  const _expireRanRef=useRef(false);
  useEffect(()=>{
    if(_expireRanRef.current) return;
    const now=today;
    const stale=quotes.filter(q=>["Sent","Under Review"].includes(q.status)&&q.expiryDate&&q.expiryDate<now);
    if(stale.length===0){_expireRanRef.current=true;return;}
    const ids=new Set(stale.map(q=>q.id));
    setQuotes(p=>p.map(q=>ids.has(q.id)?{...q,status:"Expired"}:q));
    _expireRanRef.current=true;
  },[quotes,setQuotes]);

  /* ── Build a quick lookup for chain rendering ── */
  const quoteChainMap=useMemo(()=>{
    const m={};
    quotes.forEach(q=>{ if(q.supersedesQuoteId) m[q.supersedesQuoteId]=q.id; });
    return m;
  },[quotes]);
  const buildChain=(q)=>{
    // Walk supersedesQuoteId backwards to root
    const chain=[q];
    const seen=new Set([q.id]);
    let cur=q;
    while(cur?.supersedesQuoteId){
      if(seen.has(cur.supersedesQuoteId)) break;
      const parent=quotes.find(x=>x.id===cur.supersedesQuoteId);
      if(!parent) break;
      seen.add(parent.id);
      chain.unshift(parent);
      cur=parent;
    }
    // Walk forward via quoteChainMap
    cur=q;
    while(quoteChainMap[cur.id]){
      const childId=quoteChainMap[cur.id];
      if(seen.has(childId)) break;
      const child=quotes.find(x=>x.id===childId);
      if(!child) break;
      seen.add(child.id);
      chain.push(child);
      cur=child;
    }
    return chain;
  };

  /* ── Change-log helper: diff watched fields and append entries ── */
  const WATCHED_FIELDS=["title","accountId","contactId","oppId","status","total","discount","taxType","validity","terms","notes","owner"];
  const diffEntries=(prev,next)=>{
    const at=new Date().toISOString();
    const out=[];
    WATCHED_FIELDS.forEach(k=>{
      const a=prev?.[k]??"";
      const b=next?.[k]??"";
      if(String(a)!==String(b)) out.push({id:uid(),at,by:currentUser,field:k,from:String(a),to:String(b),note:""});
    });
    // Detect line-item count changes (cheap signal for "items edited")
    const aLen=Array.isArray(prev?.items)?prev.items.length:0;
    const bLen=Array.isArray(next?.items)?next.items.length:0;
    if(aLen!==bLen) out.push({id:uid(),at,by:currentUser,field:"items",from:`${aLen} line(s)`,to:`${bLen} line(s)`,note:""});
    return out;
  };

  const save=()=>{
    if(modal?.lockedFinal){
      setFormErrors({_lock:"This quote is marked Final and cannot be edited. Duplicate/Revise it instead to create a new version."});
      return;
    }
    const errs=validateQuote(form);
    if(hasErrors(errs)){setFormErrors(errs);return;}
    const totals=recalc(form.items,form.taxType,form.discount,form.placeOfSupply);
    const clean=sanitizeObj({...form,...totals});
    if(modal.mode==="add"){
      const created={...clean,changeLog:[{id:uid(),at:new Date().toISOString(),by:currentUser,field:"",from:"",to:"created",note:""}]};
      setQuotes(p=>[...p,created]);
    } else {
      setQuotes(p=>p.map(q=>{
        if(q.id!==clean.id) return q;
        const entries=diffEntries(q,clean);
        return {...clean,changeLog:[...(q.changeLog||[]),...entries]};
      }));
    }
    setModal(null);setFormErrors({});setDetail(null);
  };

  /* ── Multi-template PDF: professional multi-section quotation document ──
     Matches the iCAFFE_Quotation DOCX format with full sections:
       Header · Addressee · Subject · Opening · Product Overview ·
       Feature Highlights · Pricing · Notes · Implementation ·
       System Requirements · Payment Terms · T&C · Signature · Footer
     template: "customer" | "proforma" | "internal" | "government"    */
  const printQuote=(q,template="customer")=>{
    const acc     = accounts.find(a=>a.id===q.accountId);
    const con     = contacts.find(c=>c.id===q.contactId);
    const isInternal = template==="internal";
    const isProforma = template==="proforma";
    const isGovt     = template==="government";
    const showCost   = isInternal && isManager;

    // ── Product template (marketing content) ──
    const tmpl    = getQuoteTemplate(q.product || (q.productSelection?.[0]?.productId));
    const accent  = isGovt ? "#1a2744" : (tmpl.color || "#1B4F8A");

    // ── Currency symbol ──
    const cur = q.currency || "INR";
    const sym = cur==="INR"?"₹":cur==="USD"?"$":cur==="EUR"?"€":cur==="GBP"?"£":`${cur} `;

    // ── GST split ──
    const igstTotal = q.igstTotal!=null?q.igstTotal:sumLines(q,"igstAmount");
    const cgstTotal = q.cgstTotal!=null?q.cgstTotal:sumLines(q,"cgstAmount");
    const sgstTotal = q.sgstTotal!=null?q.sgstTotal:sumLines(q,"sgstAmount");
    const hasSplit  = igstTotal>0||cgstTotal>0||sgstTotal>0;

    // ── Pricing line columns — show only what's used ──
    const anyMrp      = q.items.some(it=>(Number(it.mrp)||0)>0);
    const anyDiscount = q.items.some(it=>(Number(it.discountValue)||0)>0);
    const anyGst      = q.items.some(it=>(Number(it.igstAmount)||0)+(Number(it.cgstAmount)||0)+(Number(it.sgstAmount)||0)>0);
    const anyCharge   = q.items.some(it=>String(it.chargeName||"").trim()!=="");

    // ── Line item rows ──
    const totalCost=q.items.reduce((s,i)=>s+(Number(i.unitCost||0)*Number(i.qty||0)),0);
    const margin=Number(q.subtotal||0)-totalCost;
    const marginPct=Number(q.subtotal||0)>0?((margin/Number(q.subtotal||0))*100).toFixed(1):0;

    const lineRows = q.items.map((it,idx)=>{
      const lsym = it.currency&&it.currency!=="INR"?`${it.currency} `:"₹";
      const mrp  = Number(it.mrp)||0;
      const dv   = Number(it.discountValue)||0;
      const dt   = it.discountType||"pct";
      const gst  = (Number(it.igstAmount)||0)+(Number(it.cgstAmount)||0)+(Number(it.sgstAmount)||0);
      const discStr = dv>0?(dt==="pct"?`${dv}%`:`${lsym}${dv.toLocaleString()}`):"—";
      return `<tr style="background:${idx%2===0?"#fff":"#F8FAFC"}">
        <td style="text-align:center;color:#94a3b8;font-size:9pt">${idx+1}</td>
        ${anyCharge?`<td style="font-family:monospace;font-size:9pt;color:#475569">${it.chargeName||""}</td>`:""}
        <td>${it.description||""}${it.licenseType?`<br/><span style="font-size:8pt;color:#6D28D9;background:#EEF2FF;padding:1px 5px;border-radius:4px">${it.licenseType}</span>`:""}${it.billingFrequency?`<span style="font-size:8pt;color:#1D4ED8;background:#EFF6FF;padding:1px 5px;border-radius:4px;margin-left:3px">${it.billingFrequency}</span>`:""}</td>
        <td style="text-align:center">${it.unit||""}</td>
        <td style="text-align:right">${it.qty||0}</td>
        ${anyMrp?`<td style="text-align:right;color:#64748b">${mrp>0?`${lsym}${mrp.toLocaleString()}`:"—"}</td>`:""}
        ${anyDiscount?`<td style="text-align:right;color:#DC2626">${discStr}</td>`:""}
        <td style="text-align:right;font-weight:600">${lsym}${(Number(it.unitPrice)||0).toLocaleString()}</td>
        ${showCost?`<td style="text-align:right;background:#FEF3C7;color:#92400E">${lsym}${(Number(it.unitCost)||0).toLocaleString()}</td>`:""}
        <td style="text-align:right;font-weight:600">${lsym}${(Number(it.amount)||0).toLocaleString()}</td>
        ${anyGst?`<td style="text-align:right;font-size:9pt" title="IGST ${it.igstRate||0}% · CGST ${it.cgstRate||0}% · SGST ${it.sgstRate||0}%">${gst>0?`${lsym}${gst.toLocaleString()}`:"—"}</td>`:""}
        <td style="text-align:right;font-weight:700;color:${accent}">${lsym}${(Number(it.totalWithTax)||Number(it.amount)||0).toLocaleString()}</td>
      </tr>`;
    }).join("");

    const headerCells = [
      '<th style="text-align:center;width:28px">#</th>',
      anyCharge && '<th>Charge</th>',
      '<th>Description / Service</th>',
      '<th style="text-align:center">Unit</th>',
      '<th style="text-align:right">Qty</th>',
      anyMrp && '<th style="text-align:right">MRP</th>',
      anyDiscount && '<th style="text-align:right">Discount</th>',
      '<th style="text-align:right">Rate</th>',
      showCost && '<th style="text-align:right;background:#92400e">Cost</th>',
      '<th style="text-align:right">Amount</th>',
      anyGst && '<th style="text-align:right">GST</th>',
      '<th style="text-align:right">Total</th>',
    ].filter(Boolean).join("");

    // ── Pillar HTML (3-column feature boxes) ──
    const pillarsHtml = (tmpl.overview?.pillars||[]).length>0 ? `
      <div style="display:grid;grid-template-columns:repeat(${tmpl.overview.pillars.length},1fr);gap:12px;margin:14px 0">
        ${tmpl.overview.pillars.map(p=>`
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;background:#f8fafc">
          <div style="font-size:18pt;margin-bottom:6px">${p.icon||""}</div>
          <div style="font-weight:700;color:${accent};font-size:10.5pt;margin-bottom:8px;border-bottom:2px solid ${accent};padding-bottom:4px">${p.title}</div>
          <ul style="margin:0;padding-left:16px;font-size:9.5pt;color:#374151;line-height:1.6">
            ${(p.bullets||[]).map(b=>`<li>${b}</li>`).join("")}
          </ul>
        </div>`).join("")}
      </div>` : "";

    // ── Feature sections ──
    const featureHtml = (tmpl.featureSections||[]).map(sec=>`
      <h3 style="color:${accent};font-size:11pt;margin:16px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px">${sec.title}</h3>
      ${(sec.features||[]).map(f=>`
        <div style="margin-bottom:8px">
          <strong style="font-size:10pt;color:#1e293b">${f.title}</strong>
          <span style="color:#64748b;font-size:9.5pt"> — </span>
          <span style="font-size:9.5pt;color:#374151">${f.body}</span>
        </div>`).join("")}`).join("");

    // ── Notes table ──
    const notesRows = STANDARD_EXTRA_NOTES.map(n=>`
      <tr>
        <td style="text-align:center;vertical-align:top;font-weight:700;width:28px;color:${accent}">${n.no}</td>
        <td style="font-size:9.5pt;color:#374151">${n.text}</td>
      </tr>`).join("");

    // ── Implementation rows ──
    const implRows = (tmpl.implementation?.rows||[]).map(r=>`
      <tr>
        <td style="font-weight:600;color:#1e293b;width:28%;vertical-align:top;white-space:nowrap">${r.label}</td>
        <td style="font-size:9.5pt;color:#374151">${r.value}</td>
      </tr>`).join("");

    // ── System requirements ──
    const sysReqs = tmpl.systemReqs || {};
    const serverRows  = (sysReqs.server||[]).map(([l,v])=>`<tr><td style="font-weight:600;white-space:nowrap;color:#1e293b;width:30%">${l}</td><td style="font-size:9.5pt">${v}</td></tr>`).join("");
    const wsRows      = (sysReqs.workstation||[]).map(([l,v])=>`<tr><td style="font-weight:600;white-space:nowrap;color:#1e293b;width:30%">${l}</td><td style="font-size:9.5pt">${v}</td></tr>`).join("");

    // ── Payment milestones ──
    const payRows = STANDARD_PAYMENT_MILESTONES.map(m=>`
      <tr>
        <td style="text-align:center;font-weight:700;color:${accent};width:28px">${m.no}</td>
        <td style="font-size:9.5pt;color:#374151">${m.milestone}</td>
        <td style="font-weight:600;text-align:right;white-space:nowrap">${m.amount}</td>
      </tr>`).join("");

    // ── Terms & Conditions ──
    const termsHtml = STANDARD_TERMS_SECTIONS.map(t=>`
      <div style="margin-bottom:12px">
        <div style="font-weight:700;color:${accent};font-size:10pt;margin-bottom:4px">${t.title}</div>
        <div style="font-size:9.5pt;color:#374151;line-height:1.6">${t.body}</div>
      </div>`).join("");

    // ── Accept QR ──
    const acceptUrl = `${window.location.origin}${window.location.pathname}#/quote-accept/${q.id}`;
    const qrUrl     = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(acceptUrl)}`;
    const logoUrl   = `${window.location.origin}/hans-logo.png`;

    // ── Billing address display ──
    const billAddr  = q.billingAddressSnapshot || (acc?.billingAddress||"") || "";
    const validDate = q.expiryDate || "";
    const quoteDate = q.sentDate || q.createdDate || today;

    // ── GST totals display ──
    const gstDisplay = !isProforma ? (hasSplit
      ? [igstTotal>0?`<div style="display:flex;justify-content:space-between;padding:3px 0"><span>IGST:</span><strong>${sym}${igstTotal.toLocaleString()}</strong></div>`:"",
         cgstTotal>0?`<div style="display:flex;justify-content:space-between;padding:3px 0"><span>CGST:</span><strong>${sym}${cgstTotal.toLocaleString()}</strong></div>`:"",
         sgstTotal>0?`<div style="display:flex;justify-content:space-between;padding:3px 0"><span>SGST:</span><strong>${sym}${sgstTotal.toLocaleString()}</strong></div>`:""].join("")
      : `<div style="display:flex;justify-content:space-between;padding:3px 0"><span>Tax (${q.taxType||""}):</span><strong>${sym}${(q.taxAmount||0).toLocaleString()}</strong></div>`) : "";

    const html = `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="utf-8"/>
  <title>${q.id} – ${q.title}</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:Calibri,Arial,sans-serif;color:#1f2937;font-size:10.5pt;margin:0;padding:0;background:#fff}
    .page{max-width:800px;margin:0 auto;padding:28px 36px}
    /* Page header */
    .doc-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${accent};padding-bottom:10px;margin-bottom:18px}
    .company-name{font-size:16pt;font-weight:700;color:${accent};letter-spacing:-0.5px;margin:0}
    .company-tagline{font-size:9pt;color:#64748b;margin:2px 0 0}
    .quote-ref{text-align:right;font-size:9.5pt}
    .quote-ref .q-label{font-size:8pt;font-weight:700;color:#64748b;letter-spacing:1px;text-transform:uppercase}
    .quote-ref .q-num{font-size:13pt;font-weight:700;color:${accent}}
    /* Addressee strip */
    .addr-strip{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:9.5pt}
    .addr-label{font-size:8pt;font-weight:700;color:#64748b;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:3px}
    .addr-val{font-size:10.5pt;font-weight:600;color:#1e293b}
    /* Subject */
    .subject-line{font-size:11pt;font-weight:700;color:#1e293b;margin:14px 0 6px;padding:8px 12px;background:#EFF6FF;border-left:3px solid ${accent};border-radius:0 4px 4px 0}
    .ref-line{font-size:9pt;color:#64748b;margin-bottom:12px}
    /* Section headings */
    h2{font-size:12pt;font-weight:700;color:${accent};margin:22px 0 10px;padding-bottom:4px;border-bottom:2px solid ${accent}}
    h3{font-size:10.5pt;font-weight:700;color:${accent};margin:14px 0 6px;border-bottom:1px solid #e2e8f0;padding-bottom:3px}
    /* Tables */
    table.std{width:100%;border-collapse:collapse;margin:10px 0;font-size:9.5pt}
    table.std th{background:${accent};color:#fff;padding:7px 8px;font-size:8.5pt;font-weight:600;letter-spacing:0.3px}
    table.std td{border:1px solid #e2e8f0;padding:6px 8px;vertical-align:top}
    table.std tr:hover td{background:#f1f5f9}
    table.notes td{border:1px solid #e2e8f0;padding:7px 9px;font-size:9.5pt;vertical-align:top}
    table.notes{width:100%;border-collapse:collapse;margin:10px 0}
    table.plain{width:100%;border-collapse:collapse;font-size:9.5pt}
    table.plain td{padding:5px 6px;vertical-align:top;border:1px solid #e2e8f0}
    /* Totals box */
    .totals-box{margin:10px 0 10px auto;max-width:320px;border:1.5px solid ${accent};border-radius:6px;overflow:hidden}
    .totals-box-inner{padding:10px 14px;font-size:9.5pt}
    .totals-grand{display:flex;justify-content:space-between;font-size:14pt;font-weight:700;color:${accent};border-top:2px solid ${accent};padding:8px 14px}
    /* Internal banner */
    .internal-banner{background:#FEF3C7;border:1px solid #FCD34D;padding:8px 12px;border-radius:4px;margin:10px 0;font-size:9.5pt;font-weight:600;color:#92400E}
    /* Proforma watermark */
    .watermark{position:fixed;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:80pt;color:rgba(245,158,11,0.10);font-weight:900;pointer-events:none;z-index:0}
    /* Signature block */
    .sig-block{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:flex-end}
    .sig-line{margin-top:40px;border-top:1px solid #94a3b8;padding-top:4px;font-size:9pt;color:#475569;width:220px}
    /* Footer (printed) */
    .doc-footer{margin-top:20px;padding-top:10px;border-top:2px solid ${accent};display:flex;justify-content:space-between;align-items:center;font-size:8.5pt;color:#64748b}
    /* Print button */
    .print-btn{position:fixed;top:12px;right:12px;padding:8px 18px;background:${accent};color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:10pt;font-weight:600;z-index:999;box-shadow:0 2px 8px rgba(0,0,0,0.2)}
    @media print{
      .print-btn{display:none!important}
      .page{padding:14px 20px}
      body{font-size:9.5pt}
    }
    @page{size:A4;margin:15mm 15mm 18mm 15mm}
    .page-break{page-break-after:always;margin:0;height:0}
  </style>
</head>
<body>
  ${isProforma?'<div class="watermark">PROFORMA</div>':""}
  <button class="print-btn" onclick="window.print()">🖨 Print / Save PDF</button>

  <div class="page">

    <!-- ═══ DOCUMENT HEADER ═══ -->
    <div class="doc-header">
      <div style="display:flex;align-items:center;gap:14px">
        <img src="${logoUrl}" height="70" alt="Hans Infomatic" onerror="this.style.display='none'"/>
        <div>
          <div class="company-name">HANS INFOMATIC PVT. LTD.</div>
          <div class="company-tagline">Technology Solutions for India&#x2019;s Logistics &amp; Customs Industry</div>
          <div style="font-size:8.5pt;color:#94a3b8;margin-top:2px">New Delhi · Mumbai · Bangalore · Chennai · Kolkata · www.hansinfomatic.com</div>
        </div>
      </div>
      <div class="quote-ref">
        <div class="q-label">Software Quotation</div>
        <div class="q-num">${q.id}</div>
        ${isInternal?'<div style="background:#DC2626;color:#fff;font-size:8pt;font-weight:700;padding:2px 8px;border-radius:3px;margin-top:4px;letter-spacing:1px">INTERNAL COPY</div>':""}
        ${isProforma?'<div style="background:#F59E0B;color:#fff;font-size:8pt;font-weight:700;padding:2px 8px;border-radius:3px;margin-top:4px;letter-spacing:1px">PROFORMA INVOICE</div>':""}
      </div>
    </div>

    <!-- ═══ ADDRESSEE + QUOTE DETAILS STRIP ═══ -->
    <div class="addr-strip">
      <div>
        <div class="addr-label">To</div>
        <div class="addr-val">M/s ${q.legalName||acc?.name||acc?.legalName||"—"}</div>
        ${billAddr?`<div style="font-size:9pt;color:#475569;margin-top:3px;white-space:pre-line">${billAddr}</div>`:""}
        ${q.gstin?`<div style="font-size:9pt;color:#475569;margin-top:3px">GSTIN: ${q.gstin}</div>`:""}
      </div>
      <div style="text-align:right">
        <div style="margin-bottom:6px">
          <div class="addr-label">Quotation No.</div>
          <div style="font-weight:700;color:${accent};font-size:11pt">${q.id}</div>
        </div>
        <div style="margin-bottom:4px"><div class="addr-label">Date</div><div style="font-size:9.5pt">${quoteDate}</div></div>
        ${validDate?`<div style="margin-bottom:4px"><div class="addr-label">Valid Until</div><div style="font-size:9.5pt;font-weight:600;color:#B91C1C">${validDate}</div></div>`:""}
        <div><div class="addr-label">Product</div><div style="font-size:9.5pt;font-weight:600">${tmpl.productName}</div></div>
      </div>
    </div>

    <!-- ═══ SUBJECT ═══ -->
    <div class="subject-line">
      Subject: ${isProforma?"Proforma Invoice":isGovt?"Quotation (Government Format)":"Software Quotation"} — ${tmpl.productName.replace(/®.*$/,"®")} ${tmpl.subtitle}
    </div>
    ${q.placeOfSupply?`<div class="ref-line">Place of Supply: <strong>${q.placeOfSupply}</strong>${q.placeOfSupply===SELLER_HOME_STATE?" (intra-state · CGST+SGST)":q.placeOfSupply==="Outside India"?" (zero-rated / export)":" (inter-state · IGST)"}</div>`:""}
    ${con?`<div class="ref-line">Attn: <strong>${con.name}</strong>${con.designation?` — ${con.designation}`:""} · ${con.email||""} ${con.phone?`· ${con.phone}`:""}</div>`:""}
    ${(()=>{const ccCons=(q.ccContactIds||[]).map(id=>contacts.find(c=>c.id===id)).filter(Boolean);return ccCons.length>0?`<div class="ref-line" style="color:#475569">CC: ${ccCons.map(c=>`<strong>${c.name}</strong>${c.email?` &lt;${c.email}&gt;`:""}`).join(" · ")}</div>`:"";})()}

    <!-- Opening paragraph -->
    <p style="text-align:justify;font-size:10pt;line-height:1.6;margin:10px 0">
      Dear Sir / Ma&#x2019;am,
    </p>
    <p style="text-align:justify;font-size:10pt;line-height:1.6;margin:0 0 14px">${tmpl.opening}</p>

    ${isInternal?`<div class="internal-banner">⚠ Internal Copy — DO NOT SHARE · Total Cost: ${sym}${totalCost.toLocaleString()} · Margin: ${sym}${margin.toLocaleString()} (${marginPct}%) · Owner: ${TEAM_MAP[q.owner]?.name||q.owner}</div>`:""}

    <!-- ═══ SECTION 1: PRODUCT OVERVIEW ═══ -->
    <h2>1. Product Overview — ${tmpl.productName}</h2>
    <p style="font-size:10pt;line-height:1.6;margin:0 0 10px;color:#374151">${tmpl.overview?.description||""}</p>
    ${pillarsHtml}

    <!-- ═══ SECTION 2: KEY FEATURE HIGHLIGHTS ═══ -->
    ${(tmpl.featureSections||[]).length>0?`<h2>2. Key Feature Highlights</h2>${featureHtml}`:""}

    <!-- ═══ SECTION 3: PROPOSED PRICING ═══ -->
    <h2>3. Proposed Pricing — ${isProforma?"Proforma":isGovt?"Government":"SaaS Subscription Model"}</h2>
    <p style="font-size:9pt;color:#64748b;margin:0 0 8px;font-style:italic">** ${tmpl.pricingNote||"All rates are under a SaaS model. Quarterly billing in advance."} ${q.currency&&q.currency!=="INR"?`All amounts in ${q.currency}.`:""}</p>

    <table class="std" style="font-size:9.5pt">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>
        ${lineRows||`<tr><td colspan="10" style="text-align:center;color:#94a3b8;padding:20px">No line items added to this quote.</td></tr>`}
      </tbody>
    </table>

    <!-- Totals box -->
    <div class="totals-box">
      <div class="totals-box-inner">
        <div style="display:flex;justify-content:space-between;padding:3px 0"><span>Subtotal (Taxable):</span><strong>${sym}${(q.subtotal||0).toLocaleString()}</strong></div>
        ${(q.discount||0)>0?`<div style="display:flex;justify-content:space-between;padding:3px 0;color:#DC2626"><span>Discount:</span><strong>− ${sym}${(q.discount||0).toLocaleString()}</strong></div>`:""}
        ${gstDisplay}
      </div>
      <div class="totals-grand"><span>Grand Total${cur!=="INR"?` (${cur})`:""}:</span><span>${sym}${(q.total||0).toLocaleString()}</span></div>
    </div>

    <!-- ── Notes table ── -->
    <p style="font-size:10pt;font-weight:700;margin:18px 0 6px">NOTES</p>
    <table class="notes">
      <thead><tr style="background:#F8FAFC">
        <th style="text-align:center;width:28px;padding:6px 8px;font-size:8.5pt;color:#64748b;font-weight:700;border:1px solid #e2e8f0">No.</th>
        <th style="padding:6px 8px;font-size:8.5pt;color:#64748b;font-weight:700;border:1px solid #e2e8f0;text-align:left">Particulars</th>
      </tr></thead>
      <tbody>${notesRows}</tbody>
    </table>

    <div class="page-break"></div>

    <!-- ═══ SECTION 4: IMPLEMENTATION ═══ -->
    <div class="doc-header" style="margin-top:20px">
      <div style="display:flex;align-items:center;gap:10px">
        <img src="${logoUrl}" height="50" alt="Hans Infomatic" onerror="this.style.display='none'"/>
        <div>
          <div style="font-size:11pt;font-weight:700;color:${accent}">HANS INFOMATIC PVT. LTD.</div>
          <div style="font-size:8.5pt;color:#94a3b8">Continued — ${q.id}</div>
        </div>
      </div>
      <div class="quote-ref"><div class="q-num" style="font-size:11pt">${q.id}</div></div>
    </div>

    <h2>4. Implementation, Training &amp; Support</h2>
    <table class="plain">
      <tbody>${implRows}</tbody>
    </table>

    <!-- ═══ SECTION 5: SYSTEM REQUIREMENTS ═══ -->
    ${(sysReqs.server||[]).length>0?`
    <h2>5. Minimum System Requirements (Client End — SaaS Mode)</h2>
    <p style="font-size:9.5pt;color:#64748b;margin:0 0 8px">Since the platform is hosted on client servers under the SaaS model, client-side infrastructure requirements are minimal:</p>

    <h3>Client Server</h3>
    <table class="plain"><tbody>${serverRows}</tbody></table>

    <h3>Client Workstation / User Device</h3>
    <table class="plain"><tbody>${wsRows}</tbody></table>`:""}

    <!-- ═══ SECTION 6: PAYMENT TERMS ═══ -->
    <h2>6. Payment Terms</h2>
    <table class="std">
      <thead><tr>
        <th style="width:30px">Milestone</th>
        <th>Description</th>
        <th style="text-align:right">Amount</th>
      </tr></thead>
      <tbody>${payRows}</tbody>
    </table>
    <p style="font-size:9pt;color:#475569;margin:6px 0">All payments by account payee cheque / RTGS / NEFT in favour of <strong>Hans Infomatic Pvt. Ltd.</strong>, payable at New Delhi. TDS deductions permissible as per applicable law; no other deductions allowed. All fees once received are non-refundable.</p>

    <!-- ═══ SECTION 7: TERMS & CONDITIONS ═══ -->
    <h2>7. Terms &amp; Conditions</h2>
    ${termsHtml}

    <!-- ═══ SIGNATURE BLOCK ═══ -->
    <div class="sig-block">
      <div>
        <p style="font-size:10pt;line-height:1.6;margin:0 0 12px">We look forward to a long and mutually beneficial partnership. Please feel free to contact us for any clarifications or a product demonstration at your premises.</p>
        <p style="font-size:10pt;margin:0">Thanking you.</p>
        <p style="font-size:10pt;font-weight:600;margin:8px 0 0">With warm regards,</p>
        <img src="${window.location.origin}/hans-sign.png" height="40" alt="Signature" style="display:block;margin:8px 0" onerror="this.style.display='none'"/>
        <div class="sig-line">Authorised Signatory</div>
        <div style="font-size:10pt;font-weight:700;margin-top:6px">For HANS INFOMATIC PVT. LTD.</div>
        <div style="font-size:9pt;color:#64748b">Freight &amp; Customs Technology Solutions · New Delhi</div>
      </div>
      <div style="text-align:right">
        ${!isInternal?`<div style="text-align:center;display:inline-block">
          <img src="${qrUrl}" width="100" height="100" alt="Scan to Accept" onerror="this.style.display='none'"/>
          <div style="font-size:8pt;color:#64748b;margin-top:4px">Scan to accept this quote digitally</div>
          <div style="font-size:7.5pt;color:#94a3b8;margin-top:2px">${acceptUrl}</div>
        </div>`:""}
      </div>
    </div>

    <!-- ═══ DOCUMENT FOOTER ═══ -->
    <div class="doc-footer">
      <span>Hans Infomatic Pvt. Ltd. · New Delhi · www.hansinfomatic.com</span>
      <span>${q.id} · v${q.version||1} · Generated ${new Date().toLocaleString("en-IN")} · ${template.toUpperCase()}</span>
    </div>

  </div><!-- /page -->
</body></html>`;

    const w = window.open("","_blank");
    if(!w){alert("Popup blocked — please allow popups for this site to print quotes.");return;}
    w.document.write(html);
    w.document.close();
  };

  /* ── Attachment helpers (manage from detail modal) ── */
  const addAttachment=(quoteId)=>setAttachModal({quoteId,name:"",url:""});
  const _doAddAttachment=(quoteId,name,url)=>{
    const entry={id:uid(),name,url,kind:"document",addedBy:currentUser,addedAt:new Date().toISOString()};
    setQuotes(p=>p.map(q=>q.id===quoteId?{...q,attachments:[...(q.attachments||[]),entry],changeLog:[...(q.changeLog||[]),{id:uid(),at:entry.addedAt,by:currentUser,field:"attachments",from:"",to:`+ ${name}`,note:url}]}:q));
    // Refresh detail view if open
    setDetail(d=>d&&d.id===quoteId?{...d,attachments:[...(d.attachments||[]),entry]}:d);
    setAttachModal(null);
  };
  const removeAttachment=(quoteId,attId)=>{
    setQuotes(p=>p.map(q=>q.id===quoteId?{...q,attachments:(q.attachments||[]).filter(a=>a.id!==attId),changeLog:[...(q.changeLog||[]),{id:uid(),at:new Date().toISOString(),by:currentUser,field:"attachments",from:(q.attachments||[]).find(a=>a.id===attId)?.name||"",to:"removed",note:""}]}:q));
    setDetail(d=>d&&d.id===quoteId?{...d,attachments:(d.attachments||[]).filter(a=>a.id!==attId)}:d);
  };
  const del=(id)=>{setQuotes(p=>softDeleteById(p,id,currentUser));setConfirm(null);setDetail(null);};

  // Per-line price math:
  //   unitPrice = mrp - (discountType==="pct" ? mrp*discountValue/100 : discountValue)
  //   amount    = unitPrice * qty
  // unitPrice stays editable (manual override). Whenever mrp/discountType/
  // discountValue change we recompute unitPrice; whenever the rep edits
  // unitPrice directly we leave the discount fields alone (they become stale
  // — that's intentional, an explicit override should win).
  // (recalcLineWithCtx is defined alongside recalc above; this is the
  // single per-line maths used by addItem / updateItem / catalogue picker.)
  const addItem=()=>{setForm(f=>({...f,items:[...f.items,{...BLANK_QUOTE_ITEM}]}));};
  const updateItem=(idx,field,val)=>{
    setForm(f=>{
      const items=[...f.items];
      items[idx]={...items[idx],[field]:val};
      // Recompute the line whenever a pricing input changed. For a direct
      // unitPrice edit we still recompute amount but skip the mrp→price step
      // (already done by setting unitPrice).
      const ctx={taxType:f.taxType,placeOfSupply:f.placeOfSupply};
      if(["mrp","discountType","discountValue","qty"].includes(field)){
        items[idx]=recalcLineWithCtx(items[idx],ctx);
      } else if(field==="unitPrice"){
        // Override path: keep unitPrice as-typed, just recompute amount + tax.
        const qty=Number(items[idx].qty)||0;
        items[idx]={...items[idx],amount:+(Number(items[idx].unitPrice||0)*qty).toFixed(2)};
        items[idx]=recalcLineWithCtx(items[idx],{...ctx,_keepUnit:true}); // ctx ignored when no rate change; safe
      }
      const totals=recalc(items,f.taxType,f.discount,f.placeOfSupply);
      return {...f,...totals};
    });
  };
  // Add a line item from the catalogue: snapshots MRP, unit, currency, AND
  // the pricing-logic master fields (billingFrequency / GRI / setup fee /
  // hsn / etc.) onto the line so a later master-rate or master-policy edit
  // doesn't rewrite this historic quote.
  //
  // Tax math is unchanged — quote-level taxType + Place of Supply still
  // drive the per-line CGST/SGST/IGST split. The mod.gstRate value is
  // snapshot-only today, reserved for a future per-line GST override.
  const addItemFromCatalog=(prod,mod)=>{
    setForm(f=>{
      const ctx={taxType:f.taxType,placeOfSupply:f.placeOfSupply};
      const item=recalcLineWithCtx({
        ...BLANK_QUOTE_ITEM,
        description: `${prod.name} – ${mod.name}`,
        productId: prod.id,
        moduleId: mod.id,
        mrp: Number(mod.mrp)||0,
        unit: mod.unit||"License",
        currency: mod.currency||"INR",
        qty: 1,
        discountType: "pct",
        discountValue: 0,
        // Pricing-logic snapshot from master (all optional — fall through
        // to BLANK_QUOTE_ITEM defaults when the catalog entry is missing
        // a value). licenseType is the commercial framing (SaaS / OTD / etc.)
        // — see Masters BLANK_MOD comment for the full vocabulary.
        licenseType:      mod.licenseType || "",
        billingFrequency: mod.billingFrequency || "",
        pricingModel:     mod.pricingModel || "",
        hsnSac:           mod.hsnSac || "",
        setupFee:         Number(mod.setupFee) || 0,
        griApplicable:    mod.griApplicable || "",
        griPercentage:    Number(mod.griPercentage) || 0,
        defaultTermMonths:Number(mod.defaultTermMonths) || 0,
        minCommitment:    Number(mod.minCommitment) || 0,
      },ctx);
      const items=[...f.items,item];
      const totals=recalc(items,f.taxType,f.discount,f.placeOfSupply);
      return {...f,...totals};
    });
  };
  const removeItem=(idx)=>{
    setForm(f=>{
      const items=f.items.filter((_,i)=>i!==idx);
      const totals=recalc(items,f.taxType,f.discount,f.placeOfSupply);
      return {...f,...totals};
    });
  };

  /* ── Unique managers for filter ── */
  const uniqueManagers=useMemo(()=>{
    const ids=[...new Set(quotes.map(q=>q.owner))];
    return ids.map(id=>({id,name:TEAM_MAP[id]?.name||id}));
  },[quotes]);

  /* ── Conversion analytics (manager-only) ── */
  const [showAnalytics,setShowAnalytics]=useState(false);
  const analytics=useMemo(()=>{
    const sentLike=quotes.filter(q=>["Sent","Under Review","Accepted","Rejected","Expired"].includes(q.status));
    const won=quotes.filter(q=>q.status==="Accepted");
    const lost=quotes.filter(q=>q.status==="Rejected");
    const winRate=sentLike.length>0?+((won.length/sentLike.length)*100).toFixed(1):0;
    const avgDiscountPct=quotes.length>0?+((quotes.reduce((s,q)=>s+computeDiscountPct(q),0)/quotes.length).toFixed(1)):0;
    // Avg time-to-close (sent → accepted/rejected)
    const closed=quotes.filter(q=>q.sentDate && (q.acceptedDate || q.status==="Rejected"));
    const avgDays=closed.length>0?Math.round(closed.reduce((s,q)=>{
      const end=q.acceptedDate||q.approvedAt?.slice(0,10)||today;
      return s+Math.max(0,(new Date(end)-new Date(q.sentDate))/86400000);
    },0)/closed.length):0;
    // By owner
    const byOwner={};
    quotes.forEach(q=>{
      if(!byOwner[q.owner]) byOwner[q.owner]={sent:0,won:0,total:0};
      byOwner[q.owner].total++;
      if(["Sent","Under Review","Accepted","Rejected","Expired"].includes(q.status)) byOwner[q.owner].sent++;
      if(q.status==="Accepted") byOwner[q.owner].won++;
    });
    const ownerRows=Object.entries(byOwner).map(([id,s])=>({id,name:TEAM_MAP[id]?.name||id,...s,winRate:s.sent>0?+((s.won/s.sent)*100).toFixed(1):0})).sort((a,b)=>b.winRate-a.winRate);
    // By product
    const byProduct={};
    quotes.forEach(q=>{
      const p=q.product||"—";
      if(!byProduct[p]) byProduct[p]={sent:0,won:0};
      if(["Sent","Under Review","Accepted","Rejected","Expired"].includes(q.status)) byProduct[p].sent++;
      if(q.status==="Accepted") byProduct[p].won++;
    });
    const productRows=Object.entries(byProduct).map(([p,s])=>({product:p,...s,winRate:s.sent>0?+((s.won/s.sent)*100).toFixed(1):0})).sort((a,b)=>b.winRate-a.winRate);
    return {winRate,won:won.length,lost:lost.length,sentLike:sentLike.length,avgDiscountPct,avgDays,ownerRows,productRows};
  },[quotes]);

  return (
    <div>
      {/* ── KPI Summary Cards ── */}
      <div style={{display:"flex",gap:16,marginBottom:24,flexWrap:"wrap"}}>
        <KpiCard
          icon={<TrendingUp size={18} color="#fff"/>}
          label="TOTAL QUOTE VALUE"
          value={`\u20B9 ${totalQuoteValue.toFixed(1)} L`}
          sub={`+14.2% vs last month`}
        />
        <KpiCard
          icon={<BarChart3 size={18} color="#fff"/>}
          label="AVERAGE CONVERSION RATE"
          value={`${conversionRate}%`}
          sub="Industry leading benchmark"
        />
        <KpiCard
          icon={<Activity size={18} color="#fff"/>}
          label="ACTIVE QUOTES"
          value={String(activeQuotes)}
          sub={`${negotiationCount} awaiting negotiation`}
        />
      </div>

      {/* ── Page Header ── */}
      <div className="pg-head">
        <div>
          <div className="pg-title">Quotations Management</div>
          <div className="pg-sub">Manage and track high-value enterprise proposals across sectors.</div>
        </div>
        <div className="pg-actions">
          <button className="btn btn-sec" onClick={()=>exportCSV(filtered,CSV_COLS,"quotations")}><Download size={14}/>Export</button>
          <button className="btn btn-primary" onClick={openAdd}><Plus size={14}/>New Quote</button>
        </div>
      </div>

      {/* ── Analytics panel (manager-only) ── */}
      {isManager && (
        <div style={{marginBottom:12,background:"#fff",border:"1px solid var(--border)",borderRadius:10,overflow:"hidden"}}>
          <button onClick={()=>setShowAnalytics(s=>!s)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"transparent",border:"none",cursor:"pointer",fontSize:12.5,fontWeight:700,color:"var(--text)",letterSpacing:"0.3px"}}>
            <span style={{display:"flex",alignItems:"center",gap:8}}><BarChart3 size={14}/>QUOTE → WIN ANALYTICS · Win {analytics.winRate}% · Avg discount {analytics.avgDiscountPct}% · Avg close {analytics.avgDays}d</span>
            <span style={{fontSize:11,color:"var(--text3)",fontWeight:500}}>{showAnalytics?"▲ collapse":"▼ expand"}</span>
          </button>
          {showAnalytics && (
            <div style={{padding:"6px 14px 14px",borderTop:"1px solid var(--border)",display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px",marginBottom:6}}>BY OWNER</div>
                <table style={{width:"100%",fontSize:12}}>
                  <thead><tr style={{textAlign:"left",color:"var(--text3)"}}><th style={{padding:"3px 4px"}}>Owner</th><th style={{padding:"3px 4px",textAlign:"right"}}>Sent</th><th style={{padding:"3px 4px",textAlign:"right"}}>Won</th><th style={{padding:"3px 4px",textAlign:"right"}}>Win %</th></tr></thead>
                  <tbody>{analytics.ownerRows.map(r=>(
                    <tr key={r.id}><td style={{padding:"3px 4px"}}>{r.name}</td><td style={{padding:"3px 4px",textAlign:"right"}}>{r.sent}</td><td style={{padding:"3px 4px",textAlign:"right"}}>{r.won}</td><td style={{padding:"3px 4px",textAlign:"right",fontWeight:600,color:r.winRate>=50?"#22C55E":r.winRate>=25?"#F59E0B":"#EF4444"}}>{r.winRate}%</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px",marginBottom:6}}>BY PRODUCT</div>
                <table style={{width:"100%",fontSize:12}}>
                  <thead><tr style={{textAlign:"left",color:"var(--text3)"}}><th style={{padding:"3px 4px"}}>Product</th><th style={{padding:"3px 4px",textAlign:"right"}}>Sent</th><th style={{padding:"3px 4px",textAlign:"right"}}>Won</th><th style={{padding:"3px 4px",textAlign:"right"}}>Win %</th></tr></thead>
                  <tbody>{analytics.productRows.map(r=>(
                    <tr key={r.product}><td style={{padding:"3px 4px"}}>{PROD_MAP[r.product]?.name||r.product}</td><td style={{padding:"3px 4px",textAlign:"right"}}>{r.sent}</td><td style={{padding:"3px 4px",textAlign:"right"}}>{r.won}</td><td style={{padding:"3px 4px",textAlign:"right",fontWeight:600,color:r.winRate>=50?"#22C55E":r.winRate>=25?"#F59E0B":"#EF4444"}}>{r.winRate}%</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Reminder cadence banner ── */}
      {pendingReminders.length>0 && (
        <div style={{marginBottom:12,padding:"10px 14px",background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,fontSize:12.5,color:"#92400E"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Bell size={14}/>
            <span><strong>{pendingReminders.length} quote{pendingReminders.length>1?"s":""}</strong> {pendingReminders.length>1?"need":"needs"} a follow-up nudge — sent {pendingReminders.map(r=>r.ageDays).join(", ")} day(s) ago.</span>
          </div>
          <div style={{display:"flex",gap:6}}>
            <button className="btn btn-sm" style={{background:"#F59E0B",color:"#fff",border:"none"}} onClick={dispatchReminders}>Send all reminders</button>
            <button className="btn btn-sm btn-sec" onClick={()=>setPendingReminders([])}>Dismiss</button>
          </div>
        </div>
      )}

      {/* ── Filters Row ── */}
      <div className="filter-bar" style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          <span style={{fontSize:10,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px"}}>STATUS</span>
          <select value={statusF} onChange={e=>setStatusF(e.target.value)} style={{padding:"6px 10px",borderRadius:6,border:"1px solid var(--border)",fontSize:12,minWidth:140,background:"var(--bg)"}}>
            <option value="All">All Statuses</option>
            {QUOTE_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          <span style={{fontSize:10,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px"}}>ACCOUNT MANAGER</span>
          <select value={managerF} onChange={e=>setManagerF(e.target.value)} style={{padding:"6px 10px",borderRadius:6,border:"1px solid var(--border)",fontSize:12,minWidth:160,background:"var(--bg)"}}>
            <option value="All">All Managers</option>
            {uniqueManagers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          <span style={{fontSize:10,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px"}}>DATE RANGE</span>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{padding:"6px 8px",borderRadius:6,border:"1px solid var(--border)",fontSize:12,background:"var(--bg)"}}/>
            <span style={{fontSize:11,color:"var(--text3)"}}>to</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{padding:"6px 8px",borderRadius:6,border:"1px solid var(--border)",fontSize:12,background:"var(--bg)"}}/>
          </div>
        </div>
        <div style={{marginLeft:"auto"}}>
          <div className="filter-search" style={{maxWidth:220}}><Search size={14} style={{color:"var(--text3)",flexShrink:0}}/><input placeholder="Search quotes..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card" style={{padding:0}}>
        {filtered.length===0?<Empty icon={<FileText size={22}/>} title="No quotations" sub="Create your first quote."/>:(() => {
          const txt = (v) => <span style={{fontSize:12}}>{v || "-"}</span>;
          // Full registry — every BLANK_QUOTE field worth surfacing in a list.
          const COLS = [
            { key: "_quoteId", label: "Quote ID", defaultWidth: 130, render: q => (
              <div style={{display:"flex",alignItems:"center",gap:4,fontWeight:600,fontSize:13,color:"var(--brand)"}}>
                <span>{q._quoteId}</span>
                {(q.supersedesQuoteId||quoteChainMap[q.id])&&(
                  <span title={q.supersedesQuoteId?`Revision of ${q.supersedesQuoteId}`:`Superseded by ${quoteChainMap[q.id]}`} style={{display:"inline-flex",alignItems:"center",gap:2,fontSize:10,color:"#8B5CF6",background:"#8B5CF615",padding:"1px 5px",borderRadius:4,fontWeight:600}}>
                    <GitBranch size={10}/>v{q.version||1}
                  </span>
                )}
              </div>
            )},
            { key: "title", label: "Title", defaultWidth: 240, render: q => txt(q.title) },
            { key: "_accName", label: "Customer Name", defaultWidth: 220, render: q => (
              <span className="tbl-link" onClick={()=>setDetail(q)}>{q._accName}</span>
            )},
            { key: "_sector", label: "Sector", defaultWidth: 130, render: q => (
              <span style={{background:"var(--s2)",padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:500}}>{q._sector || "-"}</span>
            )},
            { key: "product", label: "Product", defaultWidth: 130, render: q => <ProdTag pid={q.product}/> },
            { key: "createdDate", label: "Created", defaultWidth: 110, render: q => (
              <span style={{fontSize:12,color:"var(--text2)"}}>{q.createdDate?fmt.date(q.createdDate):"-"}</span>
            )},
            { key: "sentDate", label: "Date Sent", defaultWidth: 110, render: q => (
              <span style={{fontSize:12,color:"var(--text2)"}}>{q.sentDate?fmt.date(q.sentDate):"-"}</span>
            )},
            { key: "quoteMonth", label: "Quote Month", defaultWidth: 120, sortable: false, render: q => (
              <span style={{fontSize:12,color:"var(--text2)"}}>{getMonthName(q.sentDate||q.createdDate)}</span>
            )},
            { key: "expiryDate", label: "Expiry", defaultWidth: 110, render: q => txt(fmt.date(q.expiryDate)) },
            { key: "validity", label: "Validity", defaultWidth: 110, render: q => txt(q.validity) },
            { key: "acceptedDate", label: "Accepted", defaultWidth: 110, render: q => txt(fmt.date(q.acceptedDate)) },
            { key: "subtotal", label: "Subtotal", defaultWidth: 110, render: q => (
              <span style={{fontFamily:"'Outfit',sans-serif"}}>{`₹${q.subtotal || 0}`}</span>
            )},
            { key: "discount", label: "Discount", defaultWidth: 100, render: q => (
              <span style={{fontFamily:"'Outfit',sans-serif"}}>{q.discount ? `₹${q.discount}` : "-"}</span>
            )},
            { key: "taxAmount", label: "Tax", defaultWidth: 100, render: q => (
              <span style={{fontFamily:"'Outfit',sans-serif"}}>{q.taxAmount ? `₹${q.taxAmount}` : "-"}</span>
            )},
            { key: "taxType", label: "Tax Type", defaultWidth: 110, render: q => txt(q.taxType) },
            { key: "total", label: "Order Value", defaultWidth: 130, render: q => (
              <span style={{fontFamily:"'Outfit',sans-serif",fontWeight:700,fontSize:13}}>{formatINR(q.total)}</span>
            )},
            { key: "_prob", label: "Prob %", defaultWidth: 90, render: q => (
              <span style={{fontWeight:600,fontSize:12,color:q._prob>=70?"#22C55E":q._prob>=40?"#F59E0B":"#EF4444"}}>{q._prob}%</span>
            )},
            { key: "status", label: "Status", defaultWidth: 200, render: q => (
              <>
                <span style={statusBadgeStyle(q.status)}>{statusLabel(q.status)}</span>
                {q.approvalStatus==="Pending"&&<span title="Awaiting manager approval" style={{marginLeft:4,display:"inline-flex",alignItems:"center",gap:2,fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:"#F59E0B18",color:"#F59E0B",letterSpacing:"0.5px"}}><ShieldCheck size={9}/>APPR PEND</span>}
                {q.approvalStatus==="Approved"&&<span title="Manager approved" style={{marginLeft:4,display:"inline-flex",alignItems:"center",gap:2,fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:"#22C55E18",color:"#22C55E",letterSpacing:"0.5px"}}><ShieldCheck size={9}/>APPROVED</span>}
                {q.approvalStatus==="Rejected"&&<span title={q.rejectedReason} style={{marginLeft:4,display:"inline-flex",alignItems:"center",gap:2,fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:"#EF444418",color:"#EF4444",letterSpacing:"0.5px"}}><ShieldCheck size={9}/>APPR REJ</span>}
              </>
            )},
            { key: "approvalStatus", label: "Approval", defaultWidth: 110, render: q => txt(q.approvalStatus) },
            { key: "version", label: "Version", defaultWidth: 80, render: q => txt(q.version ? `v${q.version}` : "") },
            { key: "owner", label: "Owner", defaultWidth: 140, render: q => <UserPill uid={q.owner}/> },
            { key: "lastReminderAt", label: "Last Reminder", defaultWidth: 130, render: q => txt(q.lastReminderAt ? fmt.date(q.lastReminderAt.slice(0,10)) : "") },
            { key: "rejectedReason", label: "Rejected Reason", defaultWidth: 200, render: q => txt(q.rejectedReason) },
            { key: "approvedBy", label: "Approved By", defaultWidth: 140, render: q => txt(q.approvedBy) },
            { key: "notes", label: "Notes", defaultWidth: 240, sortable: false, render: q => (
              <span style={{fontSize:11,color:"var(--text3)"}} title={q.notes || ""}>{(q.notes || "").slice(0, 80) || "-"}</span>
            )},
          ];
          const visibleSet = new Set(["_quoteId","_accName","_sector","sentDate","quoteMonth","total","_prob","status"]);
          const DEFAULT = COLS.map(co => ({ key: co.key, visible: visibleSet.has(co.key), width: co.defaultWidth }));
          return (
            <DataGrid
              module="quotations_list"
              userId={currentUser}
              columns={COLS}
              defaultColumnConfig={DEFAULT}
              rows={pg.paged}
              rowKey={r => r.id}
              sortKey={sort.key} sortDir={sort.dir}
              onSort={sort.toggle}
              SortIcon={QuotesSortIcon}
              rowActions={q => (
                <div style={{display:"flex",gap:4}}>
                  <button className="icon-btn" title="View" onClick={()=>setDetail(q)}><Eye size={14}/></button>
                  <button className="icon-btn" title="Edit" onClick={()=>openEdit(q)}><Edit2 size={14}/></button>
                  {q.status==="Draft"&&<button className="icon-btn" title={needsApproval(q)&&q.approvalStatus!=="Approved"?`Request approval (${approvalReason(q)})`:"Send to customer"} onClick={()=>sendQuote(q)} style={{color:needsApproval(q)&&q.approvalStatus!=="Approved"?"#F59E0B":"#3B82F6"}}><Send size={14}/></button>}
                  {isManager && q.approvalStatus==="Pending" && (<>
                    <button className="icon-btn" title={`Approve (${approvalReason(q)})`} onClick={()=>approveQuote(q)} style={{color:"#22C55E"}}><ThumbsUp size={14}/></button>
                    <button className="icon-btn" title="Reject" onClick={()=>rejectQuote(q)} style={{color:"#EF4444"}}><ThumbsDown size={14}/></button>
                  </>)}
                  {["Sent","Under Review"].includes(q.status)&&<button className="icon-btn" title={`Send reminder${q.lastReminderAt?` (last: ${fmt.date(q.lastReminderAt.slice(0,10))})`:""}`} onClick={()=>logReminder(q,"manual")} style={{color:"#F59E0B"}}><Mail size={14}/></button>}
                  {["Sent","Under Review"].includes(q.status)&&<button className="icon-btn" title="Mark as Accepted by customer" onClick={()=>acceptQuote(q)} style={{color:"#22C55E"}}><FileSignature size={14}/></button>}
                  <button className="icon-btn" title="Duplicate/Revise" onClick={()=>duplicate(q)}><Copy size={14}/></button>
                  {canDelete&&<button className="icon-btn" title="Delete" onClick={()=>setConfirm(q.id)}><Trash2 size={14}/></button>}
                </div>
              )}
            />
          );
        })()}
        <Pagination {...pg}/>
      </div>

      {/* Detail Modal */}
      {detail&&(
        <Modal title={`${detail._quoteId} – ${detail.title}`} onClose={()=>setDetail(null)} lg footer={<>
          <div style={{display:"flex",gap:6,marginRight:"auto"}}>
            <button className="btn btn-sec btn-sm" title="Customer-facing PDF" onClick={()=>printQuote(detail,"customer")}><FileText size={13}/>Customer PDF</button>
            <button className="btn btn-sec btn-sm" title="Proforma invoice (no GST)" onClick={()=>printQuote(detail,"proforma")}>Proforma</button>
            {isManager && <button className="btn btn-sm" style={{background:"#FEF3C7",color:"#92400E",border:"1px solid #FDE68A"}} title="Internal copy with cost & margin" onClick={()=>printQuote(detail,"internal")}>Internal</button>}
            <button className="btn btn-sec btn-sm" title="Government format" onClick={()=>printQuote(detail,"government")}>Govt</button>
          </div>
          <button className="btn btn-sec btn-sm" onClick={()=>setDetail(null)}>Close</button>
          {/* Email Quote — opens SendEmailModal pre-filled with the quote
              template (subject + body interpolated against the quote, account
              and primary contact). The customer-facing accept link is built
              from the same hash route used elsewhere. */}
          <button className="btn btn-blue btn-sm" onClick={()=>{
            const acc = accounts.find(a => a.id === detail.accountId) || {};
            const contact = contacts.find(c => c.id === detail.contactId)
              || contacts.find(c => c.accountId === detail.accountId && c.primary)
              || contacts.find(c => c.accountId === detail.accountId)
              || {};
            const cur = detail.currency || "INR";
            const sym = cur==="INR"?"₹":cur==="USD"?"$":cur==="EUR"?"€":`${cur} `;
            const total = `${sym}${(Number(detail.total)||0).toLocaleString()}`;
            const acceptUrl = `${window.location.origin}${window.location.pathname}#/quote-accept/${detail.id}`;
            // Build CC email list from ccContactIds
            const ccEmails=(detail.ccContactIds||[]).map(id=>contacts.find(c=>c.id===id)?.email).filter(Boolean).join(", ");
            setSendEmailModal({
              templateId: "quote",
              accountId: acc.id || "",
              contactId: contact.id || "",
              toEmail: contact.email || "",
              ccEmail: ccEmails,
              account: acc,
              contact: contact,
              quote: {
                id: detail._quoteId || detail.id,
                title: detail.title,
                total,
                expiryDate: detail.expiryDate || detail.validity || "",
                acceptUrl,
              },
            });
          }}><Mail size={13}/>Email Quote</button>
          <button className="btn btn-primary btn-sm" onClick={()=>{openEdit(detail);setDetail(null);}}><Edit2 size={13}/>Edit</button>
        </>}>
          <div className="dp-grid">
            {[["Quote ID",detail._quoteId],["Account",detail._accName],["Sector",detail._sector],["Status",detail.status],["Probability",`${detail._prob}%`],["Version",`v${detail.version}`],["Created",fmt.date(detail.createdDate)],["Sent",detail.sentDate?fmt.date(detail.sentDate):"—"],["Expiry",detail.expiryDate?fmt.date(detail.expiryDate):"—"],["Validity",detail.validity],["Owner",TEAM_MAP[detail.owner]?.name||"—"]].map(([k,v])=><div key={k} className="dp-row"><span className="dp-key">{k}</span><span className="dp-val">{v}</span></div>)}
          </div>
          <div style={{marginTop:16}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",marginBottom:8}}>PRODUCTS & MODULES</div>
            <ProductSelectionDisplay value={detail.productSelection} catalog={catalog} fallbackProducts={detail.product?[detail.product]:[]}/>
          </div>
          <div style={{marginTop:16}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
              <div style={{fontSize:12,fontWeight:700,color:"var(--text3)"}}>LINE ITEMS</div>
              {detail.placeOfSupply && (
                <div style={{fontSize:11,color:"var(--text3)"}}>
                  Place of Supply: <strong style={{color:"var(--text2)"}}>{detail.placeOfSupply}</strong>
                  {" · "}
                  <span style={{color:detail.placeOfSupply===SELLER_HOME_STATE?"#1E40AF":detail.placeOfSupply==="Outside India"?"#065F46":"#5B21B6"}}>
                    {detail.placeOfSupply===SELLER_HOME_STATE?"intra-state · CGST+SGST":detail.placeOfSupply==="Outside India"?"zero-rated":"inter-state · IGST"}
                  </span>
                </div>
              )}
            </div>
            <table className="tbl">
              <thead><tr>
                <th>Charge</th>
                <th>Description</th>
                <th style={{textAlign:"right"}}>Qty</th>
                <th style={{textAlign:"right"}}>MRP</th>
                <th style={{textAlign:"right"}}>Discount</th>
                <th style={{textAlign:"right"}}>Price</th>
                <th style={{textAlign:"right"}}>Taxable</th>
                <th style={{textAlign:"right"}}>GST</th>
                <th style={{textAlign:"right"}}>Total</th>
              </tr></thead>
              <tbody>{detail.items.map((item,i)=>{
                const s=curSym(item.currency);
                const dv=Number(item.discountValue)||0;
                const dt=item.discountType||"pct";
                const gst=(Number(item.igstAmount)||0)+(Number(item.cgstAmount)||0)+(Number(item.sgstAmount)||0);
                const gstTip=gst>0?`IGST ${item.igstRate||0}% ${s}${(Number(item.igstAmount)||0).toLocaleString()} · CGST ${item.cgstRate||0}% ${s}${(Number(item.cgstAmount)||0).toLocaleString()} · SGST ${item.sgstRate||0}% ${s}${(Number(item.sgstAmount)||0).toLocaleString()}`:"";
                return (
                  <tr key={i}>
                    <td style={{fontFamily:"monospace",fontSize:11,color:"var(--text2)"}}>{item.chargeName||"—"}</td>
                    <td style={{fontSize:12.5}}>
                      <div>{item.description||<em style={{color:"var(--text3)"}}>(no description)</em>}</div>
                      {/* Read-only pricing-context badges so the rendered quote
                          shows the customer the License Type / Frequency / Setup /
                          GRI / HSN context for each line. */}
                      {(item.licenseType || item.billingFrequency || (Number(item.setupFee)||0)>0 || (item.griApplicable==="Yes" && (Number(item.griPercentage)||0)>0) || item.hsnSac) && (
                        <div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:4}}>
                          {item.licenseType && <span style={{fontSize:9.5,fontWeight:600,color:"#3730A3",background:"#EEF2FF",border:"1px solid #C7D2FE",padding:"1px 5px",borderRadius:8,whiteSpace:"nowrap"}}>{item.licenseType}</span>}
                          {item.billingFrequency && <span style={{fontSize:9.5,fontWeight:600,color:"#1D4ED8",background:"#EFF6FF",border:"1px solid #BFDBFE",padding:"1px 5px",borderRadius:8,whiteSpace:"nowrap"}}>{item.billingFrequency}</span>}
                          {(Number(item.setupFee)||0)>0 && <span style={{fontSize:9.5,fontWeight:600,color:"#5B21B6",background:"#EDE9FE",border:"1px solid #DDD6FE",padding:"1px 5px",borderRadius:8,whiteSpace:"nowrap"}}>Setup {s}{Number(item.setupFee).toLocaleString()}</span>}
                          {item.griApplicable==="Yes" && Number(item.griPercentage)>0 && <span style={{fontSize:9.5,fontWeight:600,color:"#92400E",background:"#FFFBEB",border:"1px solid #FDE68A",padding:"1px 5px",borderRadius:8,whiteSpace:"nowrap"}}>GRI {item.griPercentage}%</span>}
                          {item.hsnSac && <span style={{fontSize:9.5,fontWeight:600,color:"#0F766E",background:"#F0FDFA",border:"1px solid #99F6E4",padding:"1px 5px",borderRadius:8,whiteSpace:"nowrap"}}>HSN {item.hsnSac}</span>}
                        </div>
                      )}
                    </td>
                    <td style={{textAlign:"right"}}>{item.qty}</td>
                    <td style={{textAlign:"right"}}>{(Number(item.mrp)||0)>0?`${s}${(Number(item.mrp)||0).toLocaleString()}`:"—"}</td>
                    <td style={{textAlign:"right",color:dv>0?"#B91C1C":"var(--text3)"}}>{dv>0?(dt==="pct"?`${dv}%`:`${s}${dv.toLocaleString()}`):"—"}</td>
                    <td style={{textAlign:"right"}}>{s}{(Number(item.unitPrice)||0).toLocaleString()}</td>
                    <td style={{textAlign:"right",fontWeight:600}}>{s}{(Number(item.amount)||0).toLocaleString()}</td>
                    <td style={{textAlign:"right",color:gst>0?"var(--text2)":"var(--text3)"}} title={gstTip}>{gst>0?`${s}${gst.toLocaleString()}`:"—"}</td>
                    <td style={{textAlign:"right",fontWeight:700,color:"var(--brand)"}}>{s}{(Number(item.totalWithTax)||Number(item.amount)||0).toLocaleString()}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          {/* Footer totals — six-way breakdown when POS is set, lump-sum fallback otherwise. */}
          <div style={{marginTop:12,textAlign:"right",fontSize:13}}>
            <div>Subtotal: <strong>₹{detail.subtotal}L</strong></div>
            {detail.discount>0&&<div>Discount: <strong>-₹{detail.discount}L</strong></div>}
            {(() => {
              const igst=detail.igstTotal!=null?detail.igstTotal:sumLines(detail,"igstAmount");
              const cgst=detail.cgstTotal!=null?detail.cgstTotal:sumLines(detail,"cgstAmount");
              const sgst=detail.sgstTotal!=null?detail.sgstTotal:sumLines(detail,"sgstAmount");
              const splitAvailable=igst>0||cgst>0||sgst>0;
              if(splitAvailable){
                return (<>
                  {igst>0&&<div>IGST: <strong>₹{igst.toLocaleString()}</strong></div>}
                  {cgst>0&&<div>CGST: <strong>₹{cgst.toLocaleString()}</strong></div>}
                  {sgst>0&&<div>SGST: <strong>₹{sgst.toLocaleString()}</strong></div>}
                </>);
              }
              return <div>Tax ({detail.taxType}): <strong>₹{detail.taxAmount}L</strong></div>;
            })()}
            <div style={{fontSize:16,fontWeight:700,color:"var(--brand)",marginTop:4}}>Total: ₹{detail.total}L ({formatINR(detail.total)} INR)</div>
          </div>
          {detail.terms&&<div style={{marginTop:14,background:"var(--s2)",padding:"10px 12px",borderRadius:8,borderLeft:"3px solid var(--brand)",fontSize:12,color:"var(--text2)",whiteSpace:"pre-line"}}><strong>Terms:</strong><br/>{detail.terms}</div>}
          {(() => {
            const chain=buildChain(detail);
            if(chain.length<=1) return null;
            return (
              <div style={{marginTop:10,background:"#F5F3FF",border:"1px solid #DDD6FE",padding:"10px 12px",borderRadius:8,fontSize:12,color:"var(--text2)"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#6D28D9",marginBottom:6,letterSpacing:"0.5px",display:"flex",alignItems:"center",gap:6}}><GitBranch size={12}/>REVISION CHAIN ({chain.length} versions)</div>
                <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:6}}>
                  {chain.map((c,i)=>(
                    <span key={c.id} style={{display:"inline-flex",alignItems:"center",gap:4}}>
                      {i>0&&<span style={{color:"#8B5CF6"}}>→</span>}
                      <span onClick={()=>{if(c.id===detail.id) return; const enrichedC=enriched.find(e=>e.id===c.id)||{...c,_quoteId:c.id,_accName:accounts.find(a=>a.id===c.accountId)?.name||"—",_sector:detail._sector,_prob:detail._prob}; setDetail(enrichedC);}} style={{cursor:c.id===detail.id?"default":"pointer",fontWeight:c.id===detail.id?700:500,padding:"2px 8px",borderRadius:4,background:c.id===detail.id?"#8B5CF6":"#fff",color:c.id===detail.id?"#fff":"#6D28D9",border:"1px solid #DDD6FE",fontSize:11}}>
                        v{c.version||1} · {c.status}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
          {/* Attachments */}
          <div style={{marginTop:10,background:"#FAFAFA",border:"1px solid var(--border)",padding:"10px 12px",borderRadius:8,fontSize:12,color:"var(--text2)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text)",letterSpacing:"0.5px",display:"flex",alignItems:"center",gap:6}}><Paperclip size={12}/>ATTACHMENTS ({(detail.attachments||[]).length})</div>
              <button className="btn btn-sm btn-sec" onClick={()=>addAttachment(detail.id)}><Plus size={12}/>Add</button>
            </div>
            {(detail.attachments||[]).length===0 ? (
              <div style={{fontSize:11.5,color:"var(--text3)",fontStyle:"italic"}}>No files yet — attach customer RFP, signed quote, BOQ, etc.</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {detail.attachments.map(a=>(
                  <div key={a.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px dashed var(--border)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0,flex:1}}>
                      <FileText size={11} style={{color:"var(--text3)",flexShrink:0}}/>
                      <a href={a.url} target="_blank" rel="noreferrer" style={{color:"#1D4ED8",fontSize:11.5,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</a>
                      <span style={{fontSize:10,color:"var(--text3)"}}>· {a.addedAt?fmt.date(a.addedAt.slice(0,10)):"—"} · {TEAM_MAP[a.addedBy]?.name||a.addedBy}</span>
                    </div>
                    <button className="icon-btn" title="Remove" onClick={()=>removeAttachment(detail.id,a.id)}><X size={12}/></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Change log */}
          {Array.isArray(detail.changeLog)&&detail.changeLog.length>0&&(
            <div style={{marginTop:10,background:"#F8FAFC",border:"1px solid var(--border)",padding:"10px 12px",borderRadius:8,fontSize:12,color:"var(--text2)",maxHeight:200,overflowY:"auto"}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text)",letterSpacing:"0.5px",display:"flex",alignItems:"center",gap:6,marginBottom:6}}><History size={12}/>CHANGE LOG ({detail.changeLog.length})</div>
              <table style={{width:"100%",fontSize:11}}>
                <thead><tr style={{textAlign:"left",color:"var(--text3)"}}><th style={{padding:"2px 4px"}}>When</th><th style={{padding:"2px 4px"}}>Who</th><th style={{padding:"2px 4px"}}>Field</th><th style={{padding:"2px 4px"}}>Change</th></tr></thead>
                <tbody>
                  {detail.changeLog.slice().reverse().map(e=>(
                    <tr key={e.id}>
                      <td style={{padding:"2px 4px",whiteSpace:"nowrap"}}>{e.at?fmt.date(e.at.slice(0,10)):"—"}</td>
                      <td style={{padding:"2px 4px"}}>{TEAM_MAP[e.by]?.name||e.by||"—"}</td>
                      <td style={{padding:"2px 4px",fontWeight:600}}>{e.field||"—"}</td>
                      <td style={{padding:"2px 4px"}}>{e.from?<><span style={{color:"#94A3B8",textDecoration:"line-through"}}>{String(e.from).slice(0,40)}</span> → </>:""}<span style={{color:"#0F172A"}}>{String(e.to).slice(0,60)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {Array.isArray(detail.emailLog)&&detail.emailLog.length>0&&(
            <div style={{marginTop:10,background:"#F0F9FF",border:"1px solid #BAE6FD",padding:"10px 12px",borderRadius:8,fontSize:12,color:"var(--text2)"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#0369A1",marginBottom:6,letterSpacing:"0.5px",display:"flex",alignItems:"center",gap:6}}><Mail size={12}/>EMAIL LOG ({detail.emailLog.length})</div>
              <table style={{width:"100%",fontSize:11.5}}>
                <thead><tr style={{textAlign:"left",color:"var(--text3)"}}><th style={{padding:"2px 4px"}}>Sent</th><th style={{padding:"2px 4px"}}>By</th><th style={{padding:"2px 4px"}}>To</th><th style={{padding:"2px 4px"}}>Kind</th></tr></thead>
                <tbody>
                  {detail.emailLog.slice().reverse().map(e=>(
                    <tr key={e.id}>
                      <td style={{padding:"2px 4px"}}>{e.sentAt?fmt.date(e.sentAt.slice(0,10)):"—"}</td>
                      <td style={{padding:"2px 4px"}}>{TEAM_MAP[e.sentBy]?.name||e.sentBy||"—"}</td>
                      <td style={{padding:"2px 4px"}}>{e.to||"—"}</td>
                      <td style={{padding:"2px 4px"}}><span style={{fontSize:10,fontWeight:700,padding:"1px 6px",borderRadius:3,background:e.kind==="initial"?"#3B82F618":e.kind==="reminder"?"#F59E0B18":"#94A3B818",color:e.kind==="initial"?"#3B82F6":e.kind==="reminder"?"#F59E0B":"#64748B"}}>{e.kind.toUpperCase()}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(detail.approvalStatus&&detail.approvalStatus!=="Not Required")&&(
            <div style={{marginTop:10,background:detail.approvalStatus==="Approved"?"#ECFDF5":detail.approvalStatus==="Rejected"?"#FEF2F2":"#FFFBEB",border:`1px solid ${detail.approvalStatus==="Approved"?"#A7F3D0":detail.approvalStatus==="Rejected"?"#FECACA":"#FDE68A"}`,padding:"10px 12px",borderRadius:8,fontSize:12,color:"var(--text2)"}}>
              <div style={{fontSize:11,fontWeight:700,color:detail.approvalStatus==="Approved"?"#047857":detail.approvalStatus==="Rejected"?"#B91C1C":"#92400E",marginBottom:6,letterSpacing:"0.5px",display:"flex",alignItems:"center",gap:6}}><ShieldCheck size={12}/>APPROVAL · {detail.approvalStatus.toUpperCase()}</div>
              <div>Reason needed: <strong>{approvalReason(detail)||"—"}</strong></div>
              {detail.approvalRequestedAt&&<div>Requested: {fmt.date(detail.approvalRequestedAt.slice(0,10))}</div>}
              {detail.approvedAt&&<div>{detail.approvalStatus==="Rejected"?"Rejected":"Approved"} by: {TEAM_MAP[detail.approvedBy]?.name||detail.approvedBy} on {fmt.date(detail.approvedAt.slice(0,10))}</div>}
              {detail.rejectedReason&&<div style={{marginTop:4}}>Reason: <em>{detail.rejectedReason}</em></div>}
            </div>
          )}
          {detail.acceptedDate&&(
            <div style={{marginTop:10,background:"#ECFDF5",border:"1px solid #A7F3D0",padding:"10px 12px",borderRadius:8,fontSize:12,color:"var(--text2)"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#047857",marginBottom:6,letterSpacing:"0.5px",display:"flex",alignItems:"center",gap:6}}><FileSignature size={12}/>CUSTOMER ACCEPTED</div>
              <div>Accepted on: <strong>{fmt.date(detail.acceptedDate)}</strong></div>
              {detail.signedQuoteUrl&&<div>Signed copy: <a href={detail.signedQuoteUrl} target="_blank" rel="noreferrer" style={{color:"#1D4ED8"}}>{detail.signedQuoteUrl}</a></div>}
              {detail.contractId&&<div>Linked contract: <strong>{detail.contractId}</strong> (open Contracts to finalise)</div>}
            </div>
          )}
          {(detail.quoteFileUrl||detail.isFinal||detail.supersedesQuoteId)&&(
            <div style={{marginTop:10,background:"#EFF6FF",border:"1px solid #BFDBFE",padding:"10px 12px",borderRadius:8,fontSize:12,color:"var(--text2)"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#1E40AF",marginBottom:6,letterSpacing:"0.5px"}}>QUOTE DOCUMENT</div>
              {detail.isFinal&&<div style={{marginBottom:4}}><span style={{background:"#22C55E",color:"#fff",fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:4,letterSpacing:"0.5px"}}>FINAL</span></div>}
              {detail.quoteFileUrl&&<div style={{marginBottom:4}}><strong>File:</strong> <a href={detail.quoteFileUrl} target="_blank" rel="noopener noreferrer" style={{color:"var(--brand)"}}>{detail.quoteFileUrl}</a></div>}
              {detail.supersedesQuoteId&&<div style={{marginBottom:4}}><strong>Supersedes:</strong> {detail.supersedesQuoteId}</div>}
              {detail.approvalNotes&&<div><strong>Approval:</strong> {detail.approvalNotes}</div>}
            </div>
          )}
          {detail.notes&&<div style={{marginTop:8,fontSize:12,color:"var(--text3)"}}><strong>Notes:</strong> {detail.notes}</div>}
        </Modal>
      )}

      {/* Add/Edit Modal */}
      {modal&&(
        <Modal title={modal.mode==="add"?"New Quotation":(modal.lockedFinal?"View Quotation (Final – Locked)":"Edit Quotation")} onClose={()=>{setModal(null);setFormErrors({});setForm(BLANK_QUOTE);}} size="xl" draggable resizable footer={
          // ── Action bar (matches legacy Add / Modify / Void / Revise / Clear / Print) ──
          // Dest / Save lives on the right; secondary actions on the left.
          <div style={{display:"flex",alignItems:"center",gap:8,width:"100%"}}>
            {/* Left cluster: secondary actions */}
            {!modal.lockedFinal && (
              <button className="btn btn-sec btn-sm" type="button" title="Reset all fields to blank (does not delete saved quote)" onClick={()=>setTermsConfirm("clearForm")}><X size={13}/>Clear</button>
            )}
            {modal.mode!=="add" && (
              <button className="btn btn-sec btn-sm" type="button" title="Clone as a new draft (next version) — original stays untouched" onClick={()=>{duplicate(form);setModal(null);}}><Copy size={13}/>Revise</button>
            )}
            <button className="btn btn-sec btn-sm" type="button" title="Open print-ready PDF preview in a new window" onClick={()=>printQuote(form,"customer")}><FileText size={13}/>Print</button>
            {/* Right cluster: cancel / save */}
            <div style={{marginLeft:"auto",display:"flex",gap:8}}>
              <button className="btn btn-sec" onClick={()=>{setModal(null);setFormErrors({});setForm(BLANK_QUOTE);}}>{modal.lockedFinal?"Close":"Cancel"}</button>
              {!modal.lockedFinal && <button className="btn btn-primary" onClick={save}><Check size={14}/>Save Quote</button>}
            </div>
          </div>
        }>
          {modal.lockedFinal&&(
            <div style={{background:"#FEF3C7",border:"1px solid #FCD34D",padding:"10px 14px",borderRadius:8,marginBottom:14,fontSize:12.5,color:"#92400E"}}>
              <strong>Final quote — locked for contract.</strong> Editing is disabled. Use <em>Duplicate / Revise</em> to create a new version.
            </div>
          )}
          <fieldset disabled={modal.lockedFinal} style={{border:"none",padding:0,margin:0,opacity:modal.lockedFinal?0.85:1}}>
          {(() => {
            const vs = getVerifyStatus(form);
            return (
              <div className="modal-tabs">
                {["details","verify","items","terms"].map(t=>{
                  const label = t==="details" ? "Details"
                              : t==="verify"  ? `Verify${vs.complete?" ✓":` (${vs.missing.length})`}`
                              : t==="items"   ? `Items (${form.items.length})`
                              : "Terms";
                  const chipStyle = t==="verify" && !vs.complete ? {color:"#B45309"} : (t==="verify" && vs.complete ? {color:"#047857"} : undefined);
                  return <div key={t} className={`modal-tab${formTab===t?" active":""}`} style={chipStyle} onClick={()=>setFormTab(t)}>{label}</div>;
                })}
              </div>
            );
          })()}

          {formTab==="details"&&(<div>
            {/* ── Source Record Picker ── */}
            <div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",padding:"12px 14px",borderRadius:8,marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#15803D",letterSpacing:"0.5px",marginBottom:8}}>QUOTE SOURCE — auto-populates account, contact, products & price</div>
              <div style={{display:"flex",gap:14,marginBottom:10}}>
                {[["opportunity","From Opportunity"],["lead","From Lead"],["account","Direct (Account only)"]].map(([m,label])=>(
                  <label key={m} style={{display:"flex",alignItems:"center",gap:5,fontSize:12,fontWeight:600,cursor:"pointer",color:sourceMode===m?"#15803D":"var(--text2)"}}>
                    <input type="radio" name="srcMode" checked={sourceMode===m} onChange={()=>setSourceMode(m)}/>
                    {label}
                  </label>
                ))}
              </div>
              {sourceMode==="opportunity"&&(
                <div className="form-group" style={{marginBottom:0}}>
                  <label>Opportunity</label>
                  <select value={form.oppId} onChange={e=>applyOppCascade(e.target.value)}>
                    <option value="">Select opportunity to auto-fill...</option>
                    {opps.map(o=>{const a=accounts.find(x=>x.id===o.accountId);return <option key={o.id} value={o.id}>{o.title} {a?`— ${a.name}`:""} ({o.stage})</option>;})}
                  </select>
                </div>
              )}
              {sourceMode==="lead"&&(
                <div className="form-group" style={{marginBottom:0}}>
                  <label>Lead</label>
                  <TypeaheadSelect
                    value={sourceLeadId}
                    onChange={(id) => applyLeadCascade(id)}
                    options={leads.map(l => ({
                      value: l.id,
                      label: `${l.company || l.contact || l.id}${l.product ? ` — ${l.product}` : ""}`,
                      sub: l.stage || "",
                    }))}
                    placeholder="Search leads to auto-fill…"
                  />
                </div>
              )}
              {sourceMode==="account"&&(
                <div style={{fontSize:11.5,color:"var(--text3)"}}>Pick the account below — billing context will appear once selected.</div>
              )}
            </div>

            <div className="form-row full"><div className="form-group"><label>Quote Title *</label><input value={form.title} onChange={e=>{setForm(f=>({...f,title:e.target.value}));setFormErrors(e=>({...e,title:undefined}));}} placeholder="e.g. WiseHandling Deploy – Colossal Avia" style={formErrors.title?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.title}/></div></div>
            <div className="form-row">
              <div className="form-group"><label>Account *</label>
                <TypeaheadSelect
                  value={form.accountId}
                  onChange={(id) => { applyAccountCascade(id); setForm(f => ({...f, contactId:""})); setFormErrors(er => ({...er, accountId:undefined})); }}
                  options={accounts.map(a => ({ value: a.id, label: a.name, sub: a.country || a.type || "" }))}
                  placeholder="Search accounts…"
                  error={!!formErrors.accountId}
                />
                <FormError error={formErrors.accountId}/>
              </div>
              <div className="form-group"><label>Contact</label>
                {/* Build a broadened contact options list:
                    1. All contacts linked to the selected account (primary source)
                    2. Contacts referenced by the linked opp (primary + secondary)
                    3. Contacts referenced by the linked lead
                    4. The currently-set contactId (so existing quotes always show the name)
                    This prevents the field from going blank when a contact is linked via opp
                    but doesn't have the account's accountId on it. */}
                {(()=>{
                  const opp=opps.find(o=>o.id===form.oppId);
                  const lead=leads?.find?.(l=>l.id===sourceLeadId);
                  const relevantIds=new Set([
                    ...(opp?.secondaryContactIds||[]),
                    opp?.primaryContactId,
                    ...(lead?.contactIds||[]),
                    form.contactId,
                  ].filter(Boolean));
                  const contactOpts=contacts
                    .filter(c=>(form.accountId&&c.accountId===form.accountId)||relevantIds.has(c.id))
                    .map(c=>({value:c.id,label:c.name,sub:[c.designation,c.email].filter(Boolean).join(" · ")}));
                  // Sort: account-linked first, then opp/lead contacts, then rest
                  contactOpts.sort((a,b)=>{
                    const aAcc=contacts.find(c=>c.id===a.value)?.accountId===form.accountId;
                    const bAcc=contacts.find(c=>c.id===b.value)?.accountId===form.accountId;
                    return (bAcc?1:0)-(aAcc?1:0)||(a.label).localeCompare(b.label);
                  });
                  return <TypeaheadSelect
                    value={form.contactId}
                    onChange={(id) => setForm(f => ({...f, contactId: id,
                      // Remove from CC if promoted to primary
                      ccContactIds:(f.ccContactIds||[]).filter(c=>c!==id)
                    }))}
                    options={contactOpts}
                    placeholder={form.accountId||form.oppId ? "Search contacts…" : "Pick account/opp first…"}
                  />;
                })()}
              </div>
            </div>

            {/* ── CC Contacts (multiple) ── */}
            {(()=>{
              const opp=opps.find(o=>o.id===form.oppId);
              const ccIds=form.ccContactIds||[];
              // Build options: same broadened list minus the primary contact
              const relevantIds=new Set([
                ...(opp?.secondaryContactIds||[]),
                ...(leads?.find?.(l=>l.id===sourceLeadId)?.contactIds||[]),
                ...ccIds,
              ].filter(Boolean));
              const ccOpts=contacts
                .filter(c=>c.id!==form.contactId&&((form.accountId&&c.accountId===form.accountId)||relevantIds.has(c.id)))
                .map(c=>({value:c.id,label:c.name,sub:[c.designation,c.email].filter(Boolean).join(" · ")}));
              return (
                <div className="form-group" style={{marginBottom:14}}>
                  <label style={{display:"flex",alignItems:"center",gap:6}}>
                    CC Contacts
                    <span style={{fontSize:10,fontWeight:500,color:"var(--text3)",background:"var(--s2)",padding:"1px 6px",borderRadius:4}}>
                      receive email copy · shown on PDF
                    </span>
                  </label>
                  {/* Selected CC badges */}
                  {ccIds.length>0&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:6}}>
                      {ccIds.map(id=>{
                        const c=contacts.find(x=>x.id===id);
                        if(!c) return null;
                        return (
                          <span key={id} style={{display:"inline-flex",alignItems:"center",gap:5,background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:20,padding:"3px 10px",fontSize:12,fontWeight:500,color:"#1E40AF"}}>
                            {c.name}{c.designation?` — ${c.designation}`:""}
                            <button type="button" onClick={()=>setForm(f=>({...f,ccContactIds:(f.ccContactIds||[]).filter(x=>x!==id)}))}
                              style={{background:"none",border:"none",cursor:"pointer",color:"#93C5FD",fontSize:14,lineHeight:1,padding:0,display:"flex",alignItems:"center"}}>×</button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {/* Add CC typeahead */}
                  <TypeaheadSelect
                    value=""
                    onChange={(id)=>{if(id&&!ccIds.includes(id))setForm(f=>({...f,ccContactIds:[...(f.ccContactIds||[]),id]}));}}
                    options={ccOpts.filter(o=>!ccIds.includes(o.value))}
                    placeholder={ccOpts.length>0?"Add CC contact…":"No other contacts available"}
                  />
                </div>
              );
            })()}

            {/* ── Auto-populated context panel ── */}
            {(() => {
              const acc=accounts.find(a=>a.id===form.accountId);
              const con=contacts.find(c=>c.id===form.contactId);
              const opp=opps.find(o=>o.id===form.oppId);
              if(!acc&&!con&&!opp) return null;
              return (
                <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",padding:"10px 14px",borderRadius:8,marginBottom:14,fontSize:12}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#1E40AF",letterSpacing:"0.5px",marginBottom:8}}>AUTO-POPULATED CONTEXT (read-only)</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 16px",color:"var(--text2)"}}>
                    {acc&&<><div><strong>Customer:</strong> {acc.name}</div><div><strong>Type:</strong> {acc.type||"—"}</div></>}
                    {(() => {
                      // Prefer contact's linked office address; fall back to account billing address
                      const contactAddr = resolveAddress(con, accounts);
                      const billingAddr = (acc?.addresses||[]).find(a=>a.isBilling) || (acc?.addresses||[])[0];
                      const useAddr = contactAddr || billingAddr;
                      return useAddr ? (
                        <><div><strong>Office ({useAddr.label}):</strong> {formatAddress(useAddr)}</div><div><strong>Billing:</strong> {billingAddr?formatAddress(billingAddr):formatAddress(useAddr)}</div></>
                      ) : (acc ? (
                        <><div><strong>Billing Address:</strong> {acc.billingAddress||acc.address||"—"}{acc.billingCity?`, ${acc.billingCity}`:""}{acc.billingState?`, ${acc.billingState}`:""}{acc.billingPincode?` — ${acc.billingPincode}`:""}</div><div><strong>Country:</strong> {acc.billingCountry||acc.country||"—"}</div></>
                      ) : null);
                    })()}
                    {acc&&<><div><strong>GSTIN:</strong> {acc.gstin||"—"}</div><div><strong>PAN:</strong> {acc.pan||"—"}</div></>}
                    {acc&&<><div><strong>Payment Terms:</strong> {acc.paymentTerms||"—"} ({acc.creditDays||0}d)</div><div><strong>Currency:</strong> {acc.currency||"INR"}</div></>}
                    {con&&<><div><strong>Contact:</strong> {con.name}{con.designation?` — ${con.designation}`:""}</div><div><strong>Email / Phone:</strong> {con.email||"—"} · {con.phone||"—"}</div></>}
                    {opp&&<><div><strong>Linked Opp:</strong> {opp.title} ({opp.stage})</div><div><strong>Deal Value:</strong> ₹{opp.value}L · {opp.probability}% prob</div></>}
                  </div>
                  {opp&&Array.isArray(opp.products)&&opp.products.length>0&&(
                    <div style={{marginTop:8}}><strong>Opp Products:</strong> {opp.products.map(p=>PROD_MAP[p]?.name||p).join(", ")}</div>
                  )}
                </div>
              );
            })()}
            <div className="form-group" style={{marginBottom:12}}>
              <label>Products & Modules</label>
              <ProductModulePicker
                catalog={catalog || []}
                value={form.productSelection || []}
                onChange={(next) => setForm(f => ({ ...f, productSelection: next, product: next[0]?.productId || f.product }))}
              />
            </div>
            <div className="form-row three"><div className="form-group"><label>Status</label><select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{QUOTE_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
              <div className="form-group"><label>Validity</label><select value={form.validity} onChange={e=>setForm(f=>({...f,validity:e.target.value}))}>{QUOTE_VALIDITY.map(v=><option key={v}>{v}</option>)}</select></div>
              <div className="form-group"><label>Owner</label>
                <TypeaheadSelect
                  value={form.owner}
                  onChange={(id) => setForm(f => ({...f, owner: id}))}
                  options={team.map(u => ({ value: u.id, label: u.name, sub: u.role }))}
                  placeholder="Search owners…"
                />
              </div>
            </div>
            <div className="form-row"><div className="form-group"><label>Sent Date</label><input type="date" value={form.sentDate} onChange={e=>setForm(f=>({...f,sentDate:e.target.value}))}/></div>
              <div className="form-group"><label>Expiry Date</label><input type="date" value={form.expiryDate} onChange={e=>setForm(f=>({...f,expiryDate:e.target.value}))}/></div>
            </div>
            <div className="form-group"><label>Notes</label><textarea rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Internal notes..." style={{width:"100%",resize:"vertical"}}/></div>
          </div>)}

          {formTab==="verify"&&(<div>
            {(() => {
              const vs = getVerifyStatus(form);
              // ─────────────────────────────────────────────────────────
              // ALL_VERIFY — full snapshot checklist, grouped by section.
              // Surfaces both required (true) and optional (false) so the
              // reviewer can scan the whole thing before Send. Click a row
              // to jump-and-flash the corresponding form field below.
              // ─────────────────────────────────────────────────────────
              const ALL_VERIFY = [
                ["LEGAL & BILLING", [
                  ["legalName","Legal Name",true],
                  ["taxTreatment","Tax Treatment",false],
                  ["gstin","GSTIN",/india|domestic|sez|export/i.test(form.taxTreatment||"")],
                  ["pan","PAN",false],
                  ["billingAddressSnapshot","Billing Address",true],
                  ["shippingAddressSnapshot","Shipping / Service Address",false],
                ]],
                ["COMMERCIAL TERMS", [
                  ["currency","Currency",true],
                  ["exchangeRate","FX Rate",false],
                  ["paymentTerms","Payment Terms",true],
                  ["creditDays","Credit Days",false],
                  ["poMandatory","PO Mandatory?",false],
                  ["poNumber","PO Number",/yes/i.test(form.poMandatory||"")],
                  ["placeOfSupply","Place of Supply",/india|domestic|sez/i.test(form.taxTreatment||"")],
                  ["taxType","Tax Mode",false],
                ]],
                ["BILLING CONTACTS", [
                  ["billingContactName","Billing Contact Name",false],
                  ["billingContactEmail","Billing Contact Email",true],
                  ["financeContactEmail","Finance / AP Email",false],
                ]],
                ["DEAL CONTEXT", [
                  ["territory","Territory",false],
                  ["lob","Line of Business",false],
                  ["dealSize","Deal Size",false],
                  ["preparedBy","Prepared By",false],
                  ["salesEngineer","Sales Engineer",false],
                ]],
                ["SALES NARRATIVE", [
                  ["scope","Scope of Work",false],
                  ["assumptions","Assumptions",false],
                  ["exclusions","Exclusions",false],
                  ["deliverables","Deliverables",false],
                  ["coverLetter","Cover Letter",false],
                ]],
              ];
              const isFilled = (key) => {
                const v = form?.[key];
                return !(v === undefined || v === null || String(v).trim() === "");
              };
              // jumpTo: find vf-${key} in this tab, expand its parent
              // <details> if collapsed, scroll into view and flash yellow.
              const jumpTo = (key) => {
                setTimeout(() => {
                  const el = document.getElementById(`vf-${key}`);
                  if (!el) return;
                  const det = el.closest("details");
                  if (det && !det.open) det.open = true;
                  el.scrollIntoView({behavior:"smooth", block:"center"});
                  const orig = el.style.background;
                  el.style.transition = "background 0.6s";
                  el.style.background = "#FEF3C7";
                  setTimeout(() => { el.style.background = orig; }, 1200);
                  if (typeof el.focus === "function") el.focus({preventScroll:true});
                }, 30);
              };
              return (
                <>
                  <div style={{background:vs.complete?"#ECFDF5":"#FFFBEB",border:`1px solid ${vs.complete?"#86EFAC":"#FCD34D"}`,padding:"10px 14px",borderRadius:8,marginBottom:14,fontSize:12.5}}>
                    <div style={{fontWeight:700,color:vs.complete?"#047857":"#92400E",marginBottom:4}}>
                      {vs.complete ? "✓ Verified — ready to send" : `Verification incomplete — ${vs.missing.length} field${vs.missing.length===1?"":"s"} missing`}
                    </div>
                    <div style={{fontSize:11,color:"var(--text3)"}}>
                      {vs.complete
                        ? "Snapshot is historically locked to this quote. Editing the account later won't rewrite these values."
                        : "Click any row below to jump to that field. Required fields must be filled before status can leave Draft."}
                    </div>
                  </div>

                  {/* ── At-a-glance grid of every snapshot field ── */}
                  <div style={{marginBottom:18,border:"1px solid var(--border)",borderRadius:6,overflow:"hidden"}}>
                    <div style={{padding:"8px 12px",background:"var(--s2)",fontSize:11,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px"}}>VERIFY-BEFORE-SEND CHECKLIST</div>
                    {ALL_VERIFY.map(([groupLabel, rows]) => (
                      <div key={groupLabel}>
                        <div style={{padding:"6px 12px",background:"#F8FAFC",fontSize:10.5,fontWeight:700,color:"var(--text3)",letterSpacing:"0.4px",borderTop:"1px solid var(--border)"}}>{groupLabel}</div>
                        {rows.map(([key,label,required],i) => {
                          const filled = isFilled(key);
                          const isMissing = required && !filled;
                          const status = filled ? "✓" : (required ? "✗" : "—");
                          const statusColor = filled ? "#047857" : (required ? "#B91C1C" : "#94A3B8");
                          const v = form?.[key];
                          const display = v === undefined || v === null || String(v).trim() === "" ? "—" : String(v).length > 60 ? String(v).slice(0,60) + "…" : String(v);
                          return (
                            <div key={key} onClick={() => jumpTo(key)} style={{display:"grid",gridTemplateColumns:"24px 1.2fr 2fr",gap:10,alignItems:"center",padding:"7px 12px",borderTop:"1px solid var(--border)",cursor:"pointer",background:isMissing?"#FFFBEB":"transparent",fontSize:12.5}} title="Click to jump to this field">
                              <div style={{color:statusColor,fontWeight:700,textAlign:"center"}}>{status}</div>
                              <div style={{fontWeight:600}}>{label}{required && <span style={{color:"#B91C1C",marginLeft:4}}>*</span>}</div>
                              <div style={{color:filled?"var(--text2)":"var(--text3)",fontStyle:filled?"normal":"italic"}}>{display}</div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            {/* ─────────────────────────────────────────────────────────
                Each Details-tab section is a native <details open> so the
                rep can collapse the noisy ones (e.g. Sales Narrative once
                they've drafted it) and keep their eye on what they're
                editing. The id="vf-X" anchors are targeted by the Verify
                tab's click-to-jump handler — keep them in sync if you
                rename a field. */}
            <details open style={{marginBottom:12,border:"1px solid var(--border)",borderRadius:6}}>
              <summary style={{cursor:"pointer",padding:"8px 12px",background:"var(--s2)",fontSize:11,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px"}}>LEGAL & BILLING SNAPSHOT</summary>
              <div style={{padding:"10px 12px"}}>
                <div className="form-row">
                  <div className="form-group"><label>Legal Name *</label><input id="vf-legalName" value={form.legalName||""} onChange={e=>setForm(f=>({...f,legalName:e.target.value}))} placeholder="Legal entity name as on PO"/></div>
                  <div className="form-group"><label>Tax Treatment</label><select id="vf-taxTreatment" value={form.taxTreatment||""} onChange={e=>setForm(f=>({...f,taxTreatment:e.target.value}))}><option value="">—</option><option>Domestic</option><option>SEZ</option><option>Export</option><option>Overseas</option></select></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>GSTIN{/india|domestic|sez|export/i.test(form.taxTreatment||"")?" *":""}</label><input id="vf-gstin" value={form.gstin||""} onChange={e=>setForm(f=>({...f,gstin:e.target.value.toUpperCase()}))} placeholder="15-char GSTIN"/></div>
                  <div className="form-group"><label>PAN</label><input id="vf-pan" value={form.pan||""} onChange={e=>setForm(f=>({...f,pan:e.target.value.toUpperCase()}))} placeholder="10-char PAN"/></div>
                </div>
                <div className="form-group"><label>Billing Address *</label><textarea id="vf-billingAddressSnapshot" rows={2} value={form.billingAddressSnapshot||""} onChange={e=>setForm(f=>({...f,billingAddressSnapshot:e.target.value}))} placeholder="Full billing address as on invoice" style={{width:"100%",resize:"vertical"}}/></div>
                <div className="form-group"><label>Shipping / Service Address</label><textarea id="vf-shippingAddressSnapshot" rows={2} value={form.shippingAddressSnapshot||""} onChange={e=>setForm(f=>({...f,shippingAddressSnapshot:e.target.value}))} placeholder="Leave blank if same as billing" style={{width:"100%",resize:"vertical"}}/></div>
              </div>
            </details>

            <details open style={{marginBottom:12,border:"1px solid var(--border)",borderRadius:6}}>
              <summary style={{cursor:"pointer",padding:"8px 12px",background:"var(--s2)",fontSize:11,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px"}}>COMMERCIAL TERMS</summary>
              <div style={{padding:"10px 12px"}}>
                <div className="form-row three">
                  <div className="form-group"><label>Currency *</label><select id="vf-currency" value={form.currency||"INR"} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option><option>AED</option><option>SGD</option></select></div>
                  <div className="form-group"><label>Exchange Rate (→ INR)</label><input id="vf-exchangeRate" type="number" min={0} step={0.01} value={form.exchangeRate||1} onChange={e=>setForm(f=>({...f,exchangeRate:+e.target.value}))}/></div>
                  <div className="form-group"><label>Payment Terms *</label><select id="vf-paymentTerms" value={form.paymentTerms||""} onChange={e=>setForm(f=>({...f,paymentTerms:e.target.value}))}><option value="">—</option><option>Advance</option><option>Net 15</option><option>Net 30</option><option>Net 45</option><option>Net 60</option><option>Net 90</option><option>Milestone</option></select></div>
                </div>
                <div className="form-row three">
                  <div className="form-group"><label>Credit Days</label><input id="vf-creditDays" type="number" min={0} value={form.creditDays||0} onChange={e=>setForm(f=>({...f,creditDays:+e.target.value}))}/></div>
                  <div className="form-group"><label>PO Mandatory?</label><select id="vf-poMandatory" value={form.poMandatory||""} onChange={e=>setForm(f=>({...f,poMandatory:e.target.value}))}><option value="">—</option><option>Yes</option><option>No</option></select></div>
                  <div className="form-group"><label>PO Number{/yes/i.test(form.poMandatory||"")?" *":""}</label><input id="vf-poNumber" value={form.poNumber||""} onChange={e=>setForm(f=>({...f,poNumber:e.target.value}))} placeholder="Customer PO #"/></div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Place of Supply{/india|domestic|sez/i.test(form.taxTreatment||"")?" *":""}
                      <HelpTooltip text={`Drives the GST split per line. Same as seller home (${SELLER_HOME_STATE}) → CGST + SGST. Different state → IGST. Outside India → zero-rated. Leave blank to fall back to lump-sum tax (legacy quotes).`}/>
                    </label>
                    <select id="vf-placeOfSupply" value={form.placeOfSupply||""} onChange={e=>{
                      const pos=e.target.value;
                      setForm(f=>{
                        const totals=recalc(f.items,f.taxType,f.discount,pos);
                        return {...f,placeOfSupply:pos,...totals};
                      });
                    }}>
                      <option value="">— Not set (lump-sum tax) —</option>
                      {PLACES_OF_SUPPLY.map(s=><option key={s} value={s}>{s===SELLER_HOME_STATE?`${s} (intra-state · CGST+SGST)`:s==="Outside India"?`${s} (zero-rated)`:`${s} (inter-state · IGST)`}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Tax Mode</label>
                    <select id="vf-taxType" value={form.taxType} onChange={e=>{const t=e.target.value;setForm(f=>{const totals=recalc(f.items,t,f.discount,f.placeOfSupply);return{...f,taxType:t,...totals};});}}>
                      {TAX_TYPES.map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </details>

            <details open style={{marginBottom:12,border:"1px solid var(--border)",borderRadius:6}}>
              <summary style={{cursor:"pointer",padding:"8px 12px",background:"var(--s2)",fontSize:11,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px"}}>BILLING CONTACTS</summary>
              <div style={{padding:"10px 12px"}}>
                <div className="form-row three">
                  <div className="form-group"><label>Billing Contact Name</label><input id="vf-billingContactName" value={form.billingContactName||""} onChange={e=>setForm(f=>({...f,billingContactName:e.target.value}))}/></div>
                  <div className="form-group"><label>Billing Contact Email *</label><input id="vf-billingContactEmail" type="email" value={form.billingContactEmail||""} onChange={e=>setForm(f=>({...f,billingContactEmail:e.target.value}))} placeholder="ap@customer.com"/></div>
                  <div className="form-group"><label>Finance / AP Email</label><input id="vf-financeContactEmail" type="email" value={form.financeContactEmail||""} onChange={e=>setForm(f=>({...f,financeContactEmail:e.target.value}))} placeholder="finance@customer.com"/></div>
                </div>
              </div>
            </details>

            <details open style={{marginBottom:12,border:"1px solid var(--border)",borderRadius:6}}>
              <summary style={{cursor:"pointer",padding:"8px 12px",background:"var(--s2)",fontSize:11,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px"}}>DEAL CONTEXT</summary>
              <div style={{padding:"10px 12px"}}>
                <div className="form-row three">
                  <div className="form-group"><label>Territory</label><input id="vf-territory" value={form.territory||""} onChange={e=>setForm(f=>({...f,territory:e.target.value}))}/></div>
                  <div className="form-group"><label>Line of Business</label><input id="vf-lob" value={form.lob||""} onChange={e=>setForm(f=>({...f,lob:e.target.value}))} placeholder="e.g. SaaS / Implementation"/></div>
                  <div className="form-group"><label>Deal Size</label><select id="vf-dealSize" value={form.dealSize||""} onChange={e=>setForm(f=>({...f,dealSize:e.target.value}))}><option value="">—</option><option>Small</option><option>Medium</option><option>Large</option><option>Strategic</option></select></div>
                </div>
                <div className="form-row">
                  <div className="form-group"><label>Prepared By</label><input id="vf-preparedBy" value={form.preparedBy||""} onChange={e=>setForm(f=>({...f,preparedBy:e.target.value}))} placeholder="Sales owner name"/></div>
                  <div className="form-group"><label>Sales Engineer</label><input id="vf-salesEngineer" value={form.salesEngineer||""} onChange={e=>setForm(f=>({...f,salesEngineer:e.target.value}))} placeholder="SE / solution architect"/></div>
                </div>
              </div>
            </details>

            <details open style={{marginBottom:12,border:"1px solid var(--border)",borderRadius:6}}>
              <summary style={{cursor:"pointer",padding:"8px 12px",background:"var(--s2)",fontSize:11,fontWeight:700,color:"var(--text3)",letterSpacing:"0.5px"}}>SALES NARRATIVE</summary>
              <div style={{padding:"10px 12px"}}>
                <div className="form-group"><label>Scope of Work</label><textarea id="vf-scope" rows={3} value={form.scope||""} onChange={e=>setForm(f=>({...f,scope:e.target.value}))} placeholder="What's included in this quote..." style={{width:"100%",resize:"vertical"}}/></div>
                <div className="form-row">
                  <div className="form-group"><label>Assumptions</label><textarea id="vf-assumptions" rows={3} value={form.assumptions||""} onChange={e=>setForm(f=>({...f,assumptions:e.target.value}))} placeholder="Assumptions the pricing depends on" style={{width:"100%",resize:"vertical"}}/></div>
                  <div className="form-group"><label>Exclusions</label><textarea id="vf-exclusions" rows={3} value={form.exclusions||""} onChange={e=>setForm(f=>({...f,exclusions:e.target.value}))} placeholder="What's NOT included" style={{width:"100%",resize:"vertical"}}/></div>
                </div>
                <div className="form-group"><label>Deliverables</label><textarea id="vf-deliverables" rows={2} value={form.deliverables||""} onChange={e=>setForm(f=>({...f,deliverables:e.target.value}))} placeholder="Concrete deliverables / milestones" style={{width:"100%",resize:"vertical"}}/></div>
                <div className="form-group"><label>Cover Letter</label><textarea id="vf-coverLetter" rows={3} value={form.coverLetter||""} onChange={e=>setForm(f=>({...f,coverLetter:e.target.value}))} placeholder="Cover-letter text to paste at top of the quote PDF" style={{width:"100%",resize:"vertical"}}/></div>
              </div>
            </details>
          </div>)}

          {formTab==="items"&&(<ItemsComposerTab
            form={form} setForm={setForm}
            isManager={isManager}
            catalog={catalog}
            addItemFromCatalog={addItemFromCatalog}
            updateItem={updateItem} removeItem={removeItem}
            recalc={recalc} recalcLineWithCtx={recalcLineWithCtx}
            formErrors={formErrors}
          />)}

          {formTab==="terms"&&(<div>
            <div className="form-group"><label>T&C Template (replaces current text)</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {TC_TEMPLATES.map(t=>(
                  <button key={t.id} className="btn btn-sec btn-xs" style={{fontSize:11}} onClick={()=>{
                    if(form.terms) setTermsConfirm({template:t});
                    else setForm(f=>({...f,terms:t.body}));
                  }}>{t.name}</button>
                ))}
                <button className="btn btn-xs" style={{fontSize:11,background:"#FEF2F2",color:"#B91C1C",border:"1px solid #FECACA"}} onClick={()=>{
                  if(form.terms) setTermsConfirm("clearTerms");
                  else setForm(f=>({...f,terms:""}));
                }}>Clear</button>
              </div>
            </div>
            <div className="form-group"><label>Terms & Conditions</label>
              <textarea rows={10} value={form.terms} onChange={e=>setForm(f=>({...f,terms:e.target.value}))} placeholder="Pick a template above or type your own terms..." style={{width:"100%",resize:"vertical",fontFamily:"monospace",fontSize:12}}/>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Quote Document URL</label><input value={form.quoteFileUrl||""} onChange={e=>setForm(f=>({...f,quoteFileUrl:e.target.value}))} placeholder="https://drive/sharepoint link to the quote PDF"/></div>
              <div className="form-group"><label>Approval Notes</label><input value={form.approvalNotes||""} onChange={e=>setForm(f=>({...f,approvalNotes:e.target.value}))} placeholder="Internal approval notes"/></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
                  <input type="checkbox" checked={!!form.isFinal} onChange={e=>setForm(f=>({...f,isFinal:e.target.checked}))}/>
                  Mark as Final Quote (locked for contract)
                </label>
              </div>
              <div className="form-group"><label>Supersedes Quote ID</label><input value={form.supersedesQuoteId||""} onChange={e=>setForm(f=>({...f,supersedesQuoteId:e.target.value}))} placeholder="e.g. QT-007"/></div>
            </div>
            <div style={{marginTop:8}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text3)",marginBottom:6}}>STANDARD TERMS (click to add)</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {STANDARD_TERMS.map((t,i)=><button key={i} className="btn btn-sec btn-xs" style={{fontSize:10,maxWidth:300,textAlign:"left",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}} onClick={()=>setForm(f=>({...f,terms:f.terms?(f.terms+"\n"+t):t}))}>{t.substring(0,50)}...</button>)}
              </div>
            </div>
          </div>)}
          </fieldset>
          {formErrors._lock&&<div style={{marginTop:10,color:"#92400E",fontSize:12.5,fontWeight:600}}>{formErrors._lock}</div>}
          {formErrors._verify&&<div style={{marginTop:10,background:"#FFFBEB",border:"1px solid #FCD34D",padding:"8px 12px",borderRadius:6,color:"#92400E",fontSize:12.5,fontWeight:600,display:"flex",alignItems:"center",gap:8}}>{formErrors._verify}<button className="btn btn-sec btn-xs" onClick={()=>setFormTab("verify")}>Open Verify</button></div>}
        </Modal>
      )}
      {confirm&&<Confirm title="Delete Quote" msg="Remove this quotation permanently?" onConfirm={()=>del(confirm)} onCancel={()=>setConfirm(null)}/>}

      {/* ── Reject Quote modal ── */}
      {rejectModal&&(()=>{
        let [reason,setReason_]=[rejectModal._reason||"",v=>setRejectModal(m=>({...m,_reason:v}))];
        return <Modal title="Reject Quote — Enter Reason" onClose={()=>setRejectModal(null)}
          footer={<><button className="btn btn-sec btn-sm" onClick={()=>setRejectModal(null)}>Cancel</button>
            <button className="btn btn-danger btn-sm" onClick={()=>_doRejectQuote(rejectModal.quote,rejectModal._reason||"")}>Reject Quote</button></>}>
          <p style={{fontSize:13,color:"var(--text2)",marginBottom:8}}>This reason will be visible to the quote owner in the change log.</p>
          <textarea autoFocus rows={3} placeholder="e.g. Pricing above budget, not in current FY plan…"
            value={rejectModal._reason||""} onChange={e=>setRejectModal(m=>({...m,_reason:e.target.value}))}
            style={{width:"100%",boxSizing:"border-box",padding:"8px 12px",border:"1.5px solid var(--border)",borderRadius:8,fontSize:13,fontFamily:"inherit",resize:"vertical"}}/>
        </Modal>;
      })()}

      {/* ── Accept Quote modal ── */}
      {acceptModal&&<Modal title="Accept Quote" onClose={()=>setAcceptModal(null)}
        footer={<><button className="btn btn-sec btn-sm" onClick={()=>setAcceptModal(null)}>Cancel</button>
          <button className="btn btn-sm" style={{background:"#22C55E",color:"#fff",border:"none"}}
            onClick={()=>_doAcceptQuote(acceptModal.quote,acceptModal._url||"")}>Mark Accepted</button></>}>
        <p style={{fontSize:13,color:"var(--text2)",marginBottom:8}}>
          Optionally paste a link to the signed quote document (Google Drive / SharePoint).
        </p>
        <input autoFocus type="url" placeholder="https://drive.google.com/… (leave blank if not yet signed)"
          value={acceptModal._url||""} onChange={e=>setAcceptModal(m=>({...m,_url:e.target.value}))}
          style={{width:"100%",boxSizing:"border-box",padding:"8px 12px",border:"1.5px solid var(--border)",borderRadius:8,fontSize:13,fontFamily:"inherit"}}/>
      </Modal>}

      {/* ── Add Attachment modal ── */}
      {attachModal&&<Modal title="Add Attachment" onClose={()=>setAttachModal(null)}
        footer={<><button className="btn btn-sec btn-sm" onClick={()=>setAttachModal(null)}>Cancel</button>
          <button className="btn btn-sm" disabled={!attachModal.name?.trim()||!attachModal.url?.trim()}
            onClick={()=>_doAddAttachment(attachModal.quoteId,attachModal.name.trim(),attachModal.url.trim())}>Add</button></>}>
        <div className="form-group" style={{marginBottom:10}}>
          <label style={{fontSize:12,fontWeight:600}}>Label <span style={{color:"#EF4444"}}>*</span></label>
          <input autoFocus placeholder="e.g. Customer RFP, Signed Quote…"
            value={attachModal.name} onChange={e=>setAttachModal(m=>({...m,name:e.target.value}))}
            style={{width:"100%",boxSizing:"border-box",padding:"7px 10px",border:"1.5px solid var(--border)",borderRadius:8,fontSize:13,fontFamily:"inherit"}}/>
        </div>
        <div className="form-group">
          <label style={{fontSize:12,fontWeight:600}}>URL <span style={{color:"#EF4444"}}>*</span></label>
          <input type="url" placeholder="https://drive.google.com/… or SharePoint link"
            value={attachModal.url} onChange={e=>setAttachModal(m=>({...m,url:e.target.value}))}
            style={{width:"100%",boxSizing:"border-box",padding:"7px 10px",border:"1.5px solid var(--border)",borderRadius:8,fontSize:13,fontFamily:"inherit"}}/>
        </div>
      </Modal>}

      {/* ── Terms / Form clear confirms ── */}
      {termsConfirm&&<Confirm
        title={termsConfirm==="clearForm"?"Clear All Form Fields":termsConfirm==="clearTerms"?"Clear Terms & Conditions":`Replace T&C with "${termsConfirm.template?.name}"?`}
        msg={termsConfirm==="clearForm"?"Reset all fields to blank? Saved data is not affected until you click Save.":termsConfirm==="clearTerms"?"This will clear all existing T&C text.":"This will replace your existing T&C text with the selected template."}
        onConfirm={()=>{
          if(termsConfirm==="clearForm"){setForm(f=>({...BLANK_QUOTE,id:f.id,owner:f.owner,createdDate:f.createdDate}));setFormErrors({});}
          else if(termsConfirm==="clearTerms"){setForm(f=>({...f,terms:""}));}
          else{setForm(f=>({...f,terms:termsConfirm.template.body}));}
          setTermsConfirm(null);
        }}
        onCancel={()=>setTermsConfirm(null)}/>}

      {/* ── Toast notification (replaces alert()) ── */}
      {toast&&<div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#1B4F8A",color:"#fff",padding:"12px 22px",borderRadius:10,fontSize:13,fontWeight:600,zIndex:9999,boxShadow:"0 4px 20px rgba(0,0,0,0.25)",display:"flex",alignItems:"center",gap:12}}>
        {toast.msg}
        <button onClick={()=>setToast(null)} style={{background:"none",border:"none",color:"#fff",cursor:"pointer",fontSize:16,lineHeight:1,padding:0,opacity:0.7}}>✕</button>
      </div>}

      {sendEmailModal && (
        <SendEmailModal
          onClose={() => setSendEmailModal(null)}
          onSent={(entry) => {
            // Persist the sent email to the global comm log so it shows up
            // in the Communications tab + the account/contact timelines.
            if (typeof setCommLogs === "function") setCommLogs(p => [...p, entry]);
          }}
          accounts={accounts}
          contacts={contacts}
          currentUser={currentUser}
          orgUsers={orgUsers}
          prefill={sendEmailModal}
        />
      )}
    </div>
  );
}
export default Quotations;
