import { Component } from "react";
import { INIT_USERS, PERMISSIONS } from "../data/constants.js";

// ═══════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════
export const fmt = {
  date: d => { if(!d) return "—"; const dt = new Date(d); return dt.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}); },
  inr:  n => `₹${n}L`,
  pct:  n => `${n}%`,
  short:d => { if(!d) return "—"; const dt = new Date(d); return dt.toLocaleDateString("en-IN",{day:"2-digit",month:"short"}); },
  time: t => { if(!t) return ""; const [h,m]=t.split(":"); const hr=parseInt(h); return `${hr>12?hr-12:hr||12}:${m} ${hr>=12?"PM":"AM"}`; },
};
export const uid  = () => Math.random().toString(36).slice(2,9);
export const cmp  = (a,b,key) => (a[key]||"").toString().localeCompare((b[key]||"").toString());
export const today = new Date().toISOString().slice(0,10);
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

// ── Stage Gate Validation ──
export function validateStageGate(lead, targetStage, stageGates) {
  const gate = stageGates[targetStage];
  if (!gate) return { canAdvance: true, passed: [], failed: [] };
  const passed = [];
  const failed = [];
  for (const check of gate.checks) {
    if (check.test(lead)) passed.push(check);
    else failed.push(check);
  }
  return { canAdvance: failed.length === 0, passed, failed, label: gate.label };
}

// ── Hierarchy-based data scoping ──
// Returns the Set of user IDs whose records the given user is allowed to see.
// Rules (in order of precedence):
//   1. Global roles (admin/md/director/bd_lead)         → ALL users
//   2. Anyone with direct/transitive reports via reportsTo
//                                                        → self + all descendants
//   3. line_mgr without explicit reports                 → same department
//   4. country_mgr without explicit reports              → same branch
//   5. Everyone else                                     → only self
//
// Scoping by Product Line (LOB), Branch, Department is layered ON TOP of the
// reporting tree: a manager sees their entire downline regardless of LOB,
// because the org was structured so that LOB-specific teams have their own
// reporting chain (e.g., iCAFFE Sales Exec → iCAFFE Line Manager → Sales VP → Director → Admin).
export const getScopedUserIds = (currentUserId, orgUsers) => {
  const allUsers = orgUsers || [];
  const user = allUsers.find(u => u.id === currentUserId);
  if (!user) return new Set([currentUserId]);

  const { role, deptId, branchId } = user;

  // Rule 1: Global roles see everything
  if (["admin", "md", "director", "bd_lead"].includes(role)) {
    return new Set(allUsers.map(u => u.id));
  }

  // Rule 2: Walk the reporting tree downward — start with self, add all who
  // (directly or transitively) report up to me.
  const scoped = new Set([currentUserId]);
  let frontier = [currentUserId];
  while (frontier.length > 0) {
    const next = [];
    for (const mgrId of frontier) {
      for (const u of allUsers) {
        if (u.active === false) continue;
        if (u.reportsTo === mgrId && !scoped.has(u.id)) {
          scoped.add(u.id);
          next.push(u.id);
        }
      }
    }
    frontier = next;
  }

  // If we found at least one direct/indirect report, that IS the scope.
  if (scoped.size > 1) return scoped;

  // Rule 3 & 4: Fall back to legacy dept/branch scoping for managers
  // who haven't yet had reportsTo assigned.
  if (role === "line_mgr") {
    return new Set(allUsers.filter(u => u.deptId === deptId).map(u => u.id));
  }
  if (role === "country_mgr") {
    return new Set(allUsers.filter(u => u.branchId === branchId).map(u => u.id));
  }

  // Rule 5: Everyone else sees only their own data
  return scoped;
};

// Returns true if the role has unrestricted global data access
export const isGlobalRole = (userId, orgUsers) => {
  const user = (orgUsers || []).find(u => u.id === userId);
  return !user || ["admin", "md", "director", "bd_lead"].includes(user.role);
};

export const canAccess = (userId, module, orgUsers, customPermissions) => {
  const u = (orgUsers||[]).find(x=>x.id===userId) || INIT_USERS.find(x=>x.id===userId);
  if(!u) return false;
  // Check user-level override first
  const userOverride = customPermissions?.__users?.[userId]?.[module];
  if(userOverride!==undefined) return userOverride && userOverride!==false;
  // Then role-level custom override
  const roleOverride = customPermissions?.[u.role]?.[module];
  if(roleOverride!==undefined) return roleOverride && roleOverride!==false;
  // Fall back to default
  const perm = PERMISSIONS[u.role];
  if(!perm) return false;
  return perm[module] && perm[module]!==false;
};
export const canWrite = (userId, module, orgUsers, customPermissions) => {
  const u = (orgUsers||[]).find(x=>x.id===userId) || INIT_USERS.find(x=>x.id===userId);
  if(!u) return false;
  // Check user-level override first
  const userOverride = customPermissions?.__users?.[userId]?.[module];
  if(userOverride!==undefined) return userOverride==="rw";
  // Then role-level custom override
  const roleOverride = customPermissions?.[u.role]?.[module];
  if(roleOverride!==undefined) return roleOverride==="rw";
  return PERMISSIONS[u.role]?.[module]==="rw";
};
