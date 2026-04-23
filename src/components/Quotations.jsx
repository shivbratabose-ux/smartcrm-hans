import { useState, useMemo, useEffect, useRef } from "react";
import { Plus, Search, Edit2, Trash2, Check, Download, FileText, Copy, Send, Eye, TrendingUp, BarChart3, Activity, GitBranch, X, ShieldCheck, ThumbsUp, ThumbsDown, FileSignature, Mail, Bell, History, Paperclip } from "lucide-react";
import { PRODUCTS, PROD_MAP, TEAM, TEAM_MAP, QUOTE_STATUSES, TAX_TYPES, TAX_RATES, QUOTE_VALIDITY, STANDARD_TERMS } from '../data/constants';
import { BLANK_QUOTE, BLANK_QUOTE_ITEM, BLANK_CONTRACT, QUOTE_APPROVAL_THRESHOLDS, QUOTE_REMINDER_OFFSETS } from '../data/seed';
import { fmt, uid, today, sanitizeObj, hasErrors, softDeleteById, resolveAddress, formatAddress } from '../utils/helpers';
import { ProdTag, UserPill, Modal, Confirm, FormError, Empty } from './shared';
import ProductModulePicker, { ProductSelectionDisplay, productSelectionToString } from './ProductModulePicker';
import Pagination, { usePagination } from './Pagination';
import { useSort, SortHeader } from './Sort';
import { exportCSV } from '../utils/csv';

const SECTORS = ["Manufacturing","Logistics","Technology","Energy","Aviation","Government","Services"];

const SECTOR_MAP_FROM_TYPE = {
  "Airline":"Aviation","Airport":"Aviation","Ground Handler":"Aviation",
  "Freight Forwarder":"Logistics","Customs Broker":"Logistics","Exporter/Importer":"Logistics",
  "Government":"Government"
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
    const bad = f.items.find(it => Number(it.qty) < 0 || Number(it.unitPrice) < 0 || Number(it.discount) < 0);
    if (bad) errs.items = "Line item quantity / price / discount cannot be negative";
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

const genQuoteId = (idx, year) => `#FL-${year}-${String(idx).padStart(3,"0")}`;

const formatINR = (crValue) => {
  const inr = Math.round(crValue * 10000000);
  return inr.toLocaleString('en-IN');
};

const getMonthName = (dateStr) => {
  if (!dateStr) return "—";
  const dt = new Date(dateStr);
  return dt.toLocaleDateString("en-IN",{month:"long"});
};

const CSV_COLS = [
  {label:"Quote #",accessor:q=>q._quoteId||q.id},{label:"Title",accessor:q=>q.title},{label:"Customer",accessor:q=>q._accName||""},
  {label:"Sector",accessor:q=>q._sector||""},
  {label:"Product",accessor:q=>PROD_MAP[q.product]?.name||q.product},
  {label:"Products & Modules",accessor:q=>productSelectionToString(q.productSelection)},
  {label:"Date Sent",accessor:q=>q.sentDate},{label:"Quote Month",accessor:q=>getMonthName(q.sentDate||q.createdDate)},
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

function Quotations({quotes,setQuotes,accounts,contacts,opps,leads=[],contracts=[],setContracts,currentUser,orgUsers,catalog,canDelete,isManager=false}) {
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
  const [formErrors,setFormErrors]=useState({});
  const [formTab,setFormTab]=useState("details");
  const [sourceMode,setSourceMode]=useState("opportunity"); // "opportunity" | "lead" | "account"
  const [sourceLeadId,setSourceLeadId]=useState("");

  /* ── Auto-populate from a selected Opportunity ── */
  const applyOppCascade=(oppId)=>{
    const opp=opps.find(o=>o.id===oppId);
    if(!opp){setForm(f=>({...f,oppId:""}));return;}
    setForm(f=>{
      const acc=accounts.find(a=>a.id===opp.accountId);
      const sel=(Array.isArray(opp.productSelection)&&opp.productSelection.length>0)?opp.productSelection:(opp.products||[]).map(pid=>({productId:pid,moduleIds:[],noAddons:false}));
      // Synthesize line items if none yet & opp has a value
      let items=f.items;
      if((!items||items.length===0)&&opp.value){
        items=[{description:opp.title||"Deal value",qty:1,unitPrice:Number(opp.value)||0,amount:Number(opp.value)||0}];
      }
      const totals=recalc(items,f.taxType,f.discount);
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
      };
    });
  };

  /* ── Auto-populate from a selected Lead ── */
  const applyLeadCascade=(leadId)=>{
    const lead=leads.find(l=>l.id===leadId);
    setSourceLeadId(leadId);
    if(!lead) return;
    setForm(f=>{
      const sel=(Array.isArray(lead.productSelection)&&lead.productSelection.length>0)?lead.productSelection:(lead.product?[{productId:lead.product,moduleIds:[],noAddons:false}]:[]);
      let items=f.items;
      if((!items||items.length===0)&&lead.estimatedValue){
        items=[{description:`${lead.product||"Solution"} – ${lead.company||""}`.trim(),qty:1,unitPrice:Number(lead.estimatedValue)||0,amount:Number(lead.estimatedValue)||0}];
      }
      const totals=recalc(items,f.taxType,f.discount);
      return {
        ...f,
        accountId:lead.accountId||f.accountId,
        contactId:lead.contactIds?.[0]||f.contactId,
        product:sel[0]?.productId||f.product,
        productSelection:sel,
        title:f.title||`Proposal for ${lead.company||lead.contact||""}`.trim(),
        notes:f.notes||`Generated from lead ${lead.leadId||lead.id}. Source: ${lead.source||"—"}.`,
        items,
        ...totals,
      };
    });
  };

  const enriched=useMemo(()=>quotes.map((q,idx)=>{
    const acc=accounts.find(a=>a.id===q.accountId);
    const opp=opps.find(o=>o.id===q.oppId);
    const yr=q.createdDate?new Date(q.createdDate).getFullYear():2024;
    return {
      ...q,
      _accName:acc?.name||"—",
      _sector:SECTOR_MAP_FROM_TYPE[acc?.type]||acc?.type||"Services",
      _quoteId:genQuoteId(idx+1,yr),
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

  const recalc=(items,taxType,discount)=>{
    const subtotal=items.reduce((s,i)=>s+i.amount,0);
    const rate=TAX_RATES[taxType]||0;
    const taxAmount=+((subtotal-discount)*rate/100).toFixed(2);
    const total=+(subtotal-discount+taxAmount).toFixed(2);
    return {subtotal,taxAmount,total};
  };

  const openAdd=()=>{
    const id=`QT-${String(quotes.length+1).padStart(3,"0")}`;
    setForm({...BLANK_QUOTE,id,owner:currentUser,createdDate:today,items:[]});
    setFormErrors({});setFormTab("details");setSourceMode("opportunity");setSourceLeadId("");setModal({mode:"add"});
  };
  const openEdit=(q)=>{
    const seeded=(Array.isArray(q.productSelection)&&q.productSelection.length>0)?q.productSelection:(q.product?[{productId:q.product,moduleIds:[],noAddons:false}]:[]);
    setForm({...q,items:[...q.items.map(i=>({...i}))],productSelection:seeded});
    setFormErrors({});setFormTab("details");setSourceMode(q.oppId?"opportunity":"account");setSourceLeadId("");setModal({mode:"edit",lockedFinal:!!q.isFinal});
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
    const logEntry={id:uid(),sentAt:new Date().toISOString(),sentBy:currentUser,to:con?.email||"",cc:"",subject:`Quote ${q.id} – ${q.title||acc?.name||""}`.trim(),kind:"initial"};
    const ce={id:uid(),at:new Date().toISOString(),by:currentUser,field:"status",from:q.status,to:"Sent",note:"sent to customer"};
    setQuotes(p=>p.map(r=>r.id===q.id?{...r,status:"Sent",sentDate,expiryDate:r.expiryDate||expiryDate,emailLog:[...(r.emailLog||[]),logEntry],changeLog:[...(r.changeLog||[]),ce]}:r));
  };

  /* ── Manual resend / send reminder action ── */
  const logReminder=(q,kind="manual")=>{
    const con=contacts.find(c=>c.id===q.contactId);
    const acc=accounts.find(a=>a.id===q.accountId);
    const logEntry={id:uid(),sentAt:new Date().toISOString(),sentBy:currentUser,to:con?.email||"",cc:"",subject:`Reminder: Quote ${q.id} – ${q.title||acc?.name||""}`.trim(),kind};
    setQuotes(p=>p.map(r=>r.id===q.id?{...r,emailLog:[...(r.emailLog||[]),logEntry],lastReminderAt:logEntry.sentAt}:r));
  };

  /* ── Approval actions (manager only) ── */
  const approveQuote=(q)=>{
    const at=new Date().toISOString();
    const ce={id:uid(),at,by:currentUser,field:"approvalStatus",from:q.approvalStatus||"Pending",to:"Approved",note:""};
    setQuotes(p=>p.map(r=>r.id===q.id?{...r,approvalStatus:"Approved",approvedBy:currentUser,approvedAt:at,rejectedReason:"",changeLog:[...(r.changeLog||[]),ce]}:r));
  };
  const rejectQuote=(q)=>{
    const reason=window.prompt("Reason for rejection (visible to quote owner):","");
    if(reason==null) return;
    const at=new Date().toISOString();
    const ce={id:uid(),at,by:currentUser,field:"approvalStatus",from:q.approvalStatus||"Pending",to:"Rejected",note:reason||"No reason given"};
    setQuotes(p=>p.map(r=>r.id===q.id?{...r,approvalStatus:"Rejected",approvedBy:currentUser,approvedAt:at,rejectedReason:reason||"No reason given",changeLog:[...(r.changeLog||[]),ce]}:r));
  };

  /* ── Customer Accept: Sent/Under Review → Accepted + stamp + auto-create Contract draft ── */
  const acceptQuote=(q)=>{
    const url=window.prompt("Optional: paste signed quote URL (Drive/SharePoint link). Leave blank to skip.","")||"";
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
    if(contractId) alert(`Quote accepted. Contract draft ${contractId} created — open Contracts to finalise terms.`);
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
    const totals=recalc(form.items,form.taxType,form.discount);
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

  /* ── Attachment helpers (manage from detail modal) ── */
  const addAttachment=(quoteId)=>{
    const name=window.prompt("Attachment label (e.g. 'Customer RFP', 'Signed Quote'):","");
    if(!name) return;
    const url=window.prompt("Paste URL (Google Drive / SharePoint / public link):","");
    if(!url) return;
    const entry={id:uid(),name,url,kind:"document",addedBy:currentUser,addedAt:new Date().toISOString()};
    setQuotes(p=>p.map(q=>q.id===quoteId?{...q,attachments:[...(q.attachments||[]),entry],changeLog:[...(q.changeLog||[]),{id:uid(),at:entry.addedAt,by:currentUser,field:"attachments",from:"",to:`+ ${name}`,note:url}]}:q));
    // Refresh detail view if open
    setDetail(d=>d&&d.id===quoteId?{...d,attachments:[...(d.attachments||[]),entry]}:d);
  };
  const removeAttachment=(quoteId,attId)=>{
    setQuotes(p=>p.map(q=>q.id===quoteId?{...q,attachments:(q.attachments||[]).filter(a=>a.id!==attId),changeLog:[...(q.changeLog||[]),{id:uid(),at:new Date().toISOString(),by:currentUser,field:"attachments",from:(q.attachments||[]).find(a=>a.id===attId)?.name||"",to:"removed",note:""}]}:q));
    setDetail(d=>d&&d.id===quoteId?{...d,attachments:(d.attachments||[]).filter(a=>a.id!==attId)}:d);
  };
  const del=(id)=>{setQuotes(p=>softDeleteById(p,id,currentUser));setConfirm(null);setDetail(null);};

  const addItem=()=>{setForm(f=>({...f,items:[...f.items,{...BLANK_QUOTE_ITEM}]}));};
  const updateItem=(idx,field,val)=>{
    setForm(f=>{
      const items=[...f.items];
      items[idx]={...items[idx],[field]:val};
      if(field==="qty"||field==="unitPrice") items[idx].amount=items[idx].qty*items[idx].unitPrice;
      const totals=recalc(items,f.taxType,f.discount);
      return {...f,items,...totals};
    });
  };
  const removeItem=(idx)=>{
    setForm(f=>{
      const items=f.items.filter((_,i)=>i!==idx);
      const totals=recalc(items,f.taxType,f.discount);
      return {...f,items,...totals};
    });
  };

  /* ── Unique managers for filter ── */
  const uniqueManagers=useMemo(()=>{
    const ids=[...new Set(quotes.map(q=>q.owner))];
    return ids.map(id=>({id,name:TEAM_MAP[id]?.name||id}));
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
        {filtered.length===0?<Empty icon={<FileText size={22}/>} title="No quotations" sub="Create your first quote."/>:(
          <table className="tbl">
            <thead><tr>
              <th><SortHeader sort={sort} k="_quoteId">QUOTE ID</SortHeader></th>
              <th><SortHeader sort={sort} k="_accName">CUSTOMER NAME</SortHeader></th>
              <th><SortHeader sort={sort} k="_sector">SECTOR</SortHeader></th>
              <th><SortHeader sort={sort} k="sentDate">DATE SENT</SortHeader></th>
              <th>QUOTE MONTH</th>
              <th style={{textAlign:"right"}}><SortHeader sort={sort} k="total" align="right">ORDER VALUE (INR)</SortHeader></th>
              <th style={{textAlign:"center"}}><SortHeader sort={sort} k="_prob" align="center">PROB (%)</SortHeader></th>
              <th><SortHeader sort={sort} k="status">STATUS</SortHeader></th>
              <th></th>
            </tr></thead>
            <tbody>{pg.paged.map(q=>(
              <tr key={q.id}>
                <td style={{fontWeight:600,fontSize:13,color:"var(--brand)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <span>{q._quoteId}</span>
                    {(q.supersedesQuoteId||quoteChainMap[q.id])&&(
                      <span title={q.supersedesQuoteId?`Revision of ${q.supersedesQuoteId}`:`Superseded by ${quoteChainMap[q.id]}`} style={{display:"inline-flex",alignItems:"center",gap:2,fontSize:10,color:"#8B5CF6",background:"#8B5CF615",padding:"1px 5px",borderRadius:4,fontWeight:600}}>
                        <GitBranch size={10}/>v{q.version||1}
                      </span>
                    )}
                  </div>
                </td>
                <td><span className="tbl-link" onClick={()=>setDetail(q)}>{q._accName}</span></td>
                <td style={{fontSize:12}}><span style={{background:"var(--s2)",padding:"2px 8px",borderRadius:4,fontSize:11,fontWeight:500}}>{q._sector}</span></td>
                <td style={{fontSize:12,color:"var(--text2)"}}>{q.sentDate?fmt.date(q.sentDate):"—"}</td>
                <td style={{fontSize:12,color:"var(--text2)"}}>{getMonthName(q.sentDate||q.createdDate)}</td>
                <td style={{fontFamily:"'Outfit',sans-serif",fontWeight:700,textAlign:"right",fontSize:13}}>{formatINR(q.total)}</td>
                <td style={{textAlign:"center"}}><span style={{fontWeight:600,fontSize:12,color:q._prob>=70?"#22C55E":q._prob>=40?"#F59E0B":"#EF4444"}}>{q._prob}%</span></td>
                <td>
                  <span style={statusBadgeStyle(q.status)}>{statusLabel(q.status)}</span>
                  {q.approvalStatus==="Pending"&&<span title="Awaiting manager approval" style={{marginLeft:4,display:"inline-flex",alignItems:"center",gap:2,fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:"#F59E0B18",color:"#F59E0B",letterSpacing:"0.5px"}}><ShieldCheck size={9}/>APPR PEND</span>}
                  {q.approvalStatus==="Approved"&&<span title="Manager approved" style={{marginLeft:4,display:"inline-flex",alignItems:"center",gap:2,fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:"#22C55E18",color:"#22C55E",letterSpacing:"0.5px"}}><ShieldCheck size={9}/>APPROVED</span>}
                  {q.approvalStatus==="Rejected"&&<span title={q.rejectedReason} style={{marginLeft:4,display:"inline-flex",alignItems:"center",gap:2,fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:"#EF444418",color:"#EF4444",letterSpacing:"0.5px"}}><ShieldCheck size={9}/>APPR REJ</span>}
                </td>
                <td><div style={{display:"flex",gap:4}}>
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
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <Pagination {...pg}/>
      </div>

      {/* Detail Modal */}
      {detail&&(
        <Modal title={`${detail._quoteId} – ${detail.title}`} onClose={()=>setDetail(null)} lg footer={<><button className="btn btn-sec btn-sm" onClick={()=>setDetail(null)}>Close</button><button className="btn btn-primary btn-sm" onClick={()=>{openEdit(detail);setDetail(null);}}><Edit2 size={13}/>Edit</button></>}>
          <div className="dp-grid">
            {[["Quote ID",detail._quoteId],["Account",detail._accName],["Sector",detail._sector],["Status",detail.status],["Probability",`${detail._prob}%`],["Version",`v${detail.version}`],["Created",fmt.date(detail.createdDate)],["Sent",detail.sentDate?fmt.date(detail.sentDate):"—"],["Expiry",detail.expiryDate?fmt.date(detail.expiryDate):"—"],["Validity",detail.validity],["Owner",TEAM_MAP[detail.owner]?.name||"—"]].map(([k,v])=><div key={k} className="dp-row"><span className="dp-key">{k}</span><span className="dp-val">{v}</span></div>)}
          </div>
          <div style={{marginTop:16}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--text3)",marginBottom:8}}>PRODUCTS & MODULES</div>
            <ProductSelectionDisplay value={detail.productSelection} catalog={catalog} fallbackProducts={detail.product?[detail.product]:[]}/>
          </div>
          <div style={{marginTop:16}}><div style={{fontSize:12,fontWeight:700,color:"var(--text3)",marginBottom:8}}>LINE ITEMS</div>
            <table className="tbl"><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
              <tbody>{detail.items.map((item,i)=><tr key={i}><td style={{fontSize:12.5}}>{item.description}</td><td>{item.qty}</td><td>₹{item.unitPrice}L</td><td style={{fontWeight:600}}>₹{item.amount}L</td></tr>)}</tbody>
            </table>
          </div>
          <div style={{marginTop:12,textAlign:"right",fontSize:13}}>
            <div>Subtotal: <strong>₹{detail.subtotal}L</strong></div>
            {detail.discount>0&&<div>Discount: <strong>-₹{detail.discount}L</strong></div>}
            <div>Tax ({detail.taxType}): <strong>₹{detail.taxAmount}L</strong></div>
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
                      <span onClick={()=>c.id!==detail.id&&setDetail({...c,_quoteId:genQuoteId(quotes.findIndex(q=>q.id===c.id)+1,c.createdDate?new Date(c.createdDate).getFullYear():2024),_accName:accounts.find(a=>a.id===c.accountId)?.name||"—",_sector:detail._sector,_prob:detail._prob})} style={{cursor:c.id===detail.id?"default":"pointer",fontWeight:c.id===detail.id?700:500,padding:"2px 8px",borderRadius:4,background:c.id===detail.id?"#8B5CF6":"#fff",color:c.id===detail.id?"#fff":"#6D28D9",border:"1px solid #DDD6FE",fontSize:11}}>
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
        <Modal title={modal.mode==="add"?"New Quotation":(modal.lockedFinal?"View Quotation (Final – Locked)":"Edit Quotation")} onClose={()=>{setModal(null);setFormErrors({});setForm(BLANK_QUOTE);}} lg footer={<><button className="btn btn-sec" onClick={()=>{setModal(null);setFormErrors({});setForm(BLANK_QUOTE);}}>{modal.lockedFinal?"Close":"Cancel"}</button>{!modal.lockedFinal&&<button className="btn btn-primary" onClick={save}><Check size={14}/>Save Quote</button>}{modal.lockedFinal&&<button className="btn btn-sec btn-sm" onClick={()=>{duplicate(form);setModal(null);}}><Copy size={13}/>Duplicate / Revise</button>}</>}>
          {modal.lockedFinal&&(
            <div style={{background:"#FEF3C7",border:"1px solid #FCD34D",padding:"10px 14px",borderRadius:8,marginBottom:14,fontSize:12.5,color:"#92400E"}}>
              <strong>Final quote — locked for contract.</strong> Editing is disabled. Use <em>Duplicate / Revise</em> to create a new version.
            </div>
          )}
          <fieldset disabled={modal.lockedFinal} style={{border:"none",padding:0,margin:0,opacity:modal.lockedFinal?0.85:1}}>
          <div className="modal-tabs">
            {["details","items","terms"].map(t=><div key={t} className={`modal-tab${formTab===t?" active":""}`} onClick={()=>setFormTab(t)}>{t==="details"?"Details":t==="items"?`Items (${form.items.length})`:"Terms"}</div>)}
          </div>

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
                  <select value={sourceLeadId} onChange={e=>applyLeadCascade(e.target.value)}>
                    <option value="">Select lead to auto-fill...</option>
                    {leads.map(l=><option key={l.id} value={l.id}>{l.company||l.contact||l.id} — {l.product||""} ({l.stage||""})</option>)}
                  </select>
                </div>
              )}
              {sourceMode==="account"&&(
                <div style={{fontSize:11.5,color:"var(--text3)"}}>Pick the account below — billing context will appear once selected.</div>
              )}
            </div>

            <div className="form-row full"><div className="form-group"><label>Quote Title *</label><input value={form.title} onChange={e=>{setForm(f=>({...f,title:e.target.value}));setFormErrors(e=>({...e,title:undefined}));}} placeholder="e.g. WiseHandling Deploy – Colossal Avia" style={formErrors.title?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.title}/></div></div>
            <div className="form-row"><div className="form-group"><label>Account *</label><select value={form.accountId} onChange={e=>{setForm(f=>({...f,accountId:e.target.value,contactId:""}));setFormErrors(e=>({...e,accountId:undefined}));}} style={formErrors.accountId?{borderColor:"#DC2626"}:{}}><option value="">Select...</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><FormError error={formErrors.accountId}/></div>
              <div className="form-group"><label>Contact</label><select value={form.contactId} onChange={e=>setForm(f=>({...f,contactId:e.target.value}))}><option value="">Select...</option>{contacts.filter(c=>!form.accountId||c.accountId===form.accountId).map(c=><option key={c.id} value={c.id}>{c.name}{c.designation?` — ${c.designation}`:""}</option>)}</select></div>
            </div>

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
              <div className="form-group"><label>Owner</label><select value={form.owner} onChange={e=>setForm(f=>({...f,owner:e.target.value}))}>{team.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            </div>
            <div className="form-row"><div className="form-group"><label>Sent Date</label><input type="date" value={form.sentDate} onChange={e=>setForm(f=>({...f,sentDate:e.target.value}))}/></div>
              <div className="form-group"><label>Expiry Date</label><input type="date" value={form.expiryDate} onChange={e=>setForm(f=>({...f,expiryDate:e.target.value}))}/></div>
            </div>
            <div className="form-group"><label>Notes</label><textarea rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Internal notes..." style={{width:"100%",resize:"vertical"}}/></div>
          </div>)}

          {formTab==="items"&&(<div>
            <FormError error={formErrors.items}/>
            {form.items.map((item,i)=>(
              <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 60px 80px 80px 30px",gap:8,alignItems:"end",marginBottom:8}}>
                <div className="form-group"><label>{i===0?"Description":""}</label><input value={item.description} onChange={e=>updateItem(i,"description",e.target.value)} placeholder="Line item description"/></div>
                <div className="form-group"><label>{i===0?"Qty":""}</label><input type="number" min={1} value={item.qty} onChange={e=>updateItem(i,"qty",+e.target.value)}/></div>
                <div className="form-group"><label>{i===0?"Price(L)":""}</label><input type="number" min={0} step={0.5} value={item.unitPrice} onChange={e=>updateItem(i,"unitPrice",+e.target.value)}/></div>
                <div className="form-group"><label>{i===0?"Amount":""}</label><input disabled value={`₹${item.amount}`} style={{background:"var(--s2)"}}/></div>
                <button className="icon-btn" style={{marginBottom:4}} onClick={()=>removeItem(i)}><Trash2 size={13}/></button>
              </div>
            ))}
            <button className="btn btn-sec btn-sm" onClick={addItem} style={{marginTop:4}}><Plus size={13}/>Add Line Item</button>
            <div style={{marginTop:16,borderTop:"1px solid var(--border)",paddingTop:12}}>
              <div className="form-row three">
                <div className="form-group"><label>Tax Type</label><select value={form.taxType} onChange={e=>{const t=e.target.value;setForm(f=>{const totals=recalc(f.items,t,f.discount);return{...f,taxType:t,...totals};});}}>{TAX_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                <div className="form-group"><label>Discount (₹L)</label><input type="number" min={0} step={0.5} value={form.discount} onChange={e=>{const d=+e.target.value;setForm(f=>{const totals=recalc(f.items,f.taxType,d);return{...f,discount:d,...totals};});}}/></div>
                <div style={{textAlign:"right",paddingTop:20}}>
                  <div style={{fontSize:12}}>Subtotal: ₹{form.subtotal}L</div>
                  <div style={{fontSize:12}}>Tax: ₹{form.taxAmount}L</div>
                  <div style={{fontSize:16,fontWeight:700,color:"var(--brand)"}}>Total: ₹{form.total}L</div>
                </div>
              </div>
            </div>
          </div>)}

          {formTab==="terms"&&(<div>
            <div className="form-group"><label>Terms & Conditions</label>
              <textarea rows={8} value={form.terms} onChange={e=>setForm(f=>({...f,terms:e.target.value}))} placeholder="Enter terms..." style={{width:"100%",resize:"vertical",fontFamily:"monospace",fontSize:12}}/>
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
        </Modal>
      )}
      {confirm&&<Confirm title="Delete Quote" msg="Remove this quotation permanently?" onConfirm={()=>del(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
export default Quotations;
