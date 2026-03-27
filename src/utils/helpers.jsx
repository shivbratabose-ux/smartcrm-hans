import { Component } from "react";
import { INIT_USERS, PERMISSIONS } from "../data/constants.js";

// ═══════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════
export const fmt = {
  date: d => { if(!d) return "—"; const dt = new Date(d); return dt.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}); },
  inr:  n => `₹${n}Cr`,
  pct:  n => `${n}%`,
  short:d => { if(!d) return "—"; const dt = new Date(d); return dt.toLocaleDateString("en-IN",{day:"2-digit",month:"short"}); },
  time: t => { if(!t) return ""; const [h,m]=t.split(":"); const hr=parseInt(h); return `${hr>12?hr-12:hr||12}:${m} ${hr>=12?"PM":"AM"}`; },
};
export const uid  = () => Math.random().toString(36).slice(2,9);
export const cmp  = (a,b,key) => (a[key]||"").toString().localeCompare((b[key]||"").toString());
export const today = "2026-03-20";
export const isOverdue = d => d && d < today;
export const isFuture  = d => d && d > today;
export const isToday   = d => d === today;

// ── localStorage persistence ──
const STORAGE_KEY = "smartcrm_data";
export const loadState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
export const saveState = (data) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
};

// ── Input sanitization ──
export const sanitize = (str) => {
  if (typeof str !== "string") return str;
  return str.replace(/[<>]/g, c => c === "<" ? "&lt;" : "&gt;");
};
export const sanitizeObj = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") out[k] = sanitize(v);
    else if (Array.isArray(v)) out[k] = v.map(x => typeof x === "string" ? sanitize(x) : x);
    else out[k] = v;
  }
  return out;
};

// ── Form validation ──
export const validateAccount = (f) => {
  const errs = {};
  if (!f.name?.trim()) errs.name = "Account name is required";
  if (f.arrRevenue < 0) errs.arrRevenue = "ARR cannot be negative";
  if (f.potential < 0) errs.potential = "Potential cannot be negative";
  return errs;
};
export const validateContact = (f) => {
  const errs = {};
  if (!f.name?.trim()) errs.name = "Contact name is required";
  if (!f.accountId) errs.accountId = "Account is required";
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) errs.email = "Invalid email format";
  return errs;
};
export const validateOpp = (f) => {
  const errs = {};
  if (!f.title?.trim()) errs.title = "Deal title is required";
  if (!f.accountId) errs.accountId = "Account is required";
  if (f.value < 0) errs.value = "Value cannot be negative";
  if (!f.closeDate) errs.closeDate = "Close date is required";
  return errs;
};
export const validateActivity = (f) => {
  const errs = {};
  if (!f.title?.trim()) errs.title = "Activity title is required";
  if (!f.date) errs.date = "Date is required";
  if (!f.accountId) errs.accountId = "Account is required";
  return errs;
};
export const validateTicket = (f) => {
  const errs = {};
  if (!f.title?.trim()) errs.title = "Ticket title is required";
  if (!f.accountId) errs.accountId = "Account is required";
  if (!f.description?.trim()) errs.description = "Description is required";
  return errs;
};
export const hasErrors = (errs) => Object.keys(errs).length > 0;

// ── Error Boundary ──
export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{padding:40,textAlign:"center",fontFamily:"'DM Sans',sans-serif"}}>
          <div style={{fontSize:48,marginBottom:16}}>Something went wrong</div>
          <p style={{color:"#64748B",marginBottom:16}}>{this.state.error?.message || "An unexpected error occurred."}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}
            style={{padding:"10px 24px",background:"#1B6B5A",color:"white",border:"none",borderRadius:8,cursor:"pointer",fontSize:14,fontWeight:600}}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const canAccess = (userId, module, orgUsers) => {
  const u = (orgUsers||[]).find(x=>x.id===userId) || INIT_USERS.find(x=>x.id===userId);
  if(!u) return false;
  const perm = PERMISSIONS[u.role];
  if(!perm) return false;
  return perm[module] && perm[module]!==false;
};
export const canWrite = (userId, module, orgUsers) => {
  const u = (orgUsers||[]).find(x=>x.id===userId) || INIT_USERS.find(x=>x.id===userId);
  if(!u) return false;
  return PERMISSIONS[u.role]?.[module]==="rw";
};
