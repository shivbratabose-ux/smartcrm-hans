import { Component } from "react";
import { INIT_USERS, PERMISSIONS } from "../data/constants.js";

// ═══════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════
export const fmt = {
  date: d => { if(!d) return "—"; const dt = new Date(d); return dt.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}); },
  // INR with Indian-style thousands grouping; safe for null/NaN
  inr:  n => `₹${Number(n||0).toLocaleString("en-IN")} L`,
  pct:  n => `${n}%`,
  short:d => { if(!d) return "—"; const dt = new Date(d); return dt.toLocaleDateString("en-IN",{day:"2-digit",month:"short"}); },
  time: t => { if(!t) return ""; const [h,m]=t.split(":"); const hr=parseInt(h); return `${hr>12?hr-12:hr||12}:${m} ${hr>=12?"PM":"AM"}`; },
};
export const uid  = () => Math.random().toString(36).slice(2,9);
export const cmp  = (a,b,key) => (a[key]||"").toString().localeCompare((b[key]||"").toString());

// ─────────────────────────────────────────────────────────────────────────────
// Text-format coercion helpers — applied at every input layer so the value
// stored in state matches what the user sees, and the same logical record
// can never appear in two cases (e.g. "anita sharma" vs "Anita Sharma" vs
// "ANITA SHARMA"). Each helper is null-safe and preserves the empty string
// so React inputs stay editable mid-typing without re-render glitches.
// ─────────────────────────────────────────────────────────────────────────────

// ALL CAPS — Company / Account names (PR #98 policy).
// Applied via onChange in: Accounts form, Leads form, EditableLeadsGrid
// `company` cell, CallReports company input, BulkUpload validateRow().
export const upper = (v) => v == null ? v : String(v).toUpperCase();

// lowercase — emails, websites, LinkedIn URLs. RFC 5321 says the local-part
// of an email is technically case-sensitive, but ~every real-world server
// treats it case-insensitive AND mixed-case dupes wreck dedup. Same logic
// for URLs (case-insensitive at the domain level; path can technically
// be case-sensitive but in practice nobody types paths into CRM forms).
export const lower = (v) => v == null ? v : String(v).toLowerCase();

// Title Case — person names, designations, departments, cities, address
// lines. "anita sharma" → "Anita Sharma". Preserves apostrophes, hyphens,
// and parenthesised qualifiers ("o'brien", "j.r.r. tolkien", "VP (sales)").
//
// We deliberately don't try to be clever about "von", "de la", "Mc",
// abbreviations, or roman numerals — those are content-aware decisions
// the user should make explicitly. Title Case as a default beats lowercase
// or ALL CAPS for displayability and matches CRM industry convention.
//
// Lower-cases the whole string first so existing "JOHN SMITH" gets
// re-cased to "John Smith" on next edit; otherwise we'd preserve the
// shouting.
export const title = (v) => {
  if (v == null) return v;
  const s = String(v);
  return s.toLowerCase().replace(/\b([a-z])([a-z'.-]*)/g, (_m, first, rest) =>
    first.toUpperCase() + rest
  );
};

// Trim leading + trailing whitespace AND collapse internal multi-spaces
// to single spaces. Useful on freeform-prose-adjacent fields where the
// user might paste in text with stray padding (Lead ID, account number,
// phone, etc.) but we don't want to alter the actual content's case.
export const tidy = (v) => v == null ? v : String(v).trim().replace(/\s+/g, " ");

// ─────────────────────────────────────────────────────────────────────────────
// Lead-ID validation
// ─────────────────────────────────────────────────────────────────────────────
// Bug surfaced in production: a CSV upload that had "x" / "xx" / "-" / etc.
// in the Lead ID column saved the literal placeholder as the leadId on
// some rows (the import path checked only `r.leadId || generate(...)`,
// which preserves any truthy string including "x"). Result: rows like
// "Katlin Technologies Private Limited" displayed with "x" instead of an
// FL-2026-NNN id, and the auto-id effect skipped them because "x" is
// truthy.
//
// Centralised here so the BulkUpload validator, the SmartCRM import path,
// and the Leads.jsx auto-heal effect all agree on what "valid" means.

// Placeholder tokens users frequently type when they don't have a real ID.
// Treated as empty so the system regenerates a proper FL-YYYY-NNN id.
export const PLACEHOLDER_IDS = new Set([
  "x", "xx", "xxx",
  "-", "–", "—",
  "n/a", "na", "none", "new", "tbd", "?",
  "null", "undefined",
]);

// Canonical Lead ID: optional leading "#", "FL-" or "LEAD-" prefix,
// 4-digit year, dash, 3+ digit sequence. Anchored with ^/$ so we don't
// accept embedded matches.
const LEAD_ID_PATTERN = /^#?(?:FL|LEAD)-\d{4}-\d{3,}$/i;

/**
 * Returns true if the value is a real, well-formed Lead ID (e.g. "#FL-2026-001").
 * Returns false for: empty, placeholder tokens, and free-text garbage.
 * Used everywhere we decide whether to keep an existing id or generate a new one.
 */
export const isValidLeadId = (v) => {
  if (v == null) return false;
  const s = String(v).trim();
  if (!s) return false;
  if (PLACEHOLDER_IDS.has(s.toLowerCase())) return false;
  return LEAD_ID_PATTERN.test(s);
};
export const today = new Date().toISOString().slice(0,10);
export const isOverdue = d => d && d < today;
export const isFuture  = d => d && d > today;
export const isToday   = d => d === today;

// ── localStorage persistence ──
// Save failures (quota exceeded, private-browsing mode, disk full) used to
// silently swallow the error — users would think their work was saved, then
// lose it on next reload. We now surface a toast on the FIRST failure and
// throttle subsequent ones so we don't spam during a stuck save loop.
import { notify } from "./toast";
const STORAGE_KEY = "smartcrm_data";
let lastStorageErrorAt = 0;
export const loadState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    notify.error(`Couldn't read saved data: ${err?.message || "storage unavailable"}. Some entries may be missing.`);
    return null;
  }
};
export const saveState = (data) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    // Throttle: at most one toast every 30s for storage errors
    const now = Date.now();
    if (now - lastStorageErrorAt > 30000) {
      lastStorageErrorAt = now;
      const isQuota = err?.name === "QuotaExceededError" || /quota/i.test(err?.message || "");
      notify.error(
        isQuota
          ? "Browser storage is full — recent changes may not persist. Clear old records or export data to free space."
          : `Couldn't save changes locally: ${err?.message || "storage unavailable"}.`
      );
    }
  }
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
// Lenient phone matcher: allows +, digits, spaces, dashes, parentheses; 7-20 chars.
// Empty is allowed at this layer — required-ness is enforced per-form.
export const isValidPhone = (s) => !s || /^[+\d\s\-()]{7,20}$/.test(String(s).trim());

export const validateContact = (f, accounts) => {
  const errs = {};
  if (!f.name?.trim()) errs.name = "Contact name is required";
  if (!f.accountId) errs.accountId = "Account is required";
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) errs.email = "Invalid email format";
  if (f.phone && !isValidPhone(f.phone)) errs.phone = "Invalid phone (digits, spaces, +, -, ( ) only)";
  // Address linkage: required if the chosen account has at least one address.
  // If the account has no addresses yet, surface a directional error so the
  // user knows to add an address on the account first.
  if (f.accountId && Array.isArray(accounts)) {
    const acc = accounts.find(a => a.id === f.accountId);
    const addrs = (acc?.addresses || []);
    if (addrs.length === 0) {
      errs.addressId = "This account has no office addresses yet. Open the account and add at least one address before assigning a contact.";
    } else if (!f.addressId) {
      errs.addressId = "Office address is required";
    } else if (!addrs.some(a => a.id === f.addressId)) {
      errs.addressId = "Selected address no longer exists on this account";
    }
  }
  return errs;
};

// ── Address book helpers ──────────────────────────────────────────────
// One-time-on-edit migration: if the account has legacy single-address
// fields (address/city/state/pincode/country) but no entries in addresses[],
// synthesize the first entry so the new UI has something to render.
// Idempotent — safe to call multiple times.
export const migrateAccountAddresses = (acc) => {
  if (!acc) return acc;
  if (Array.isArray(acc.addresses) && acc.addresses.length > 0) return acc;
  const hasLegacy = acc.address || acc.city || acc.state || acc.pincode || acc.country;
  if (!hasLegacy) return acc;
  const primary = {
    id: `addr_${Date.now().toString(36)}_1`,
    label: "Head Office",
    line1: acc.address || "",
    city:  acc.city    || "",
    state: acc.state   || "",
    country: acc.country || "India",
    pincode: acc.pincode || "",
    isPrimary: true,
    isBilling: !(acc.billingAddress || acc.billingCity), // billing address gets its own entry below
  };
  const out = [primary];
  if (acc.billingAddress || acc.billingCity || acc.billingPincode) {
    out.push({
      id: `addr_${Date.now().toString(36)}_2`,
      label: "Billing Office",
      line1: acc.billingAddress || "",
      city:  acc.billingCity    || "",
      state: acc.billingState   || "",
      country: acc.billingCountry || acc.country || "India",
      pincode: acc.billingPincode || "",
      isPrimary: false,
      isBilling: true,
    });
  }
  return { ...acc, addresses: out };
};

// Resolve an address line from a contact (or any record with addressId+accountId)
// — returns { label, line1, city, state, country, pincode } or null.
export const resolveAddress = (record, accounts) => {
  if (!record?.addressId || !record?.accountId) return null;
  const acc = (accounts || []).find(a => a.id === record.accountId);
  return (acc?.addresses || []).find(x => x.id === record.addressId) || null;
};

// Pretty single-line render of an address object.
export const formatAddress = (addr) => {
  if (!addr) return "—";
  return [addr.line1, addr.city, addr.state, addr.pincode, addr.country].filter(Boolean).join(", ");
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
// Negative-number guards for modules that don't have a dedicated validator yet.
// Reuse pattern: validateMoney(f, [["amount","Amount"], ["paid","Paid amount"]]).
export const validateMoney = (f, fields) => {
  const errs = {};
  for (const [key, label] of fields) {
    const v = f?.[key];
    if (v != null && v !== "" && Number(v) < 0) errs[key] = `${label} cannot be negative`;
  }
  return errs;
};

export const hasErrors = (errs) => Object.keys(errs).length > 0;

// ── Soft-delete helper ──
// Mark a record as deleted in place (preserves audit trail + Supabase parity).
// Use as: setX(p => softDeleteById(p, id, currentUser))
export const softDeleteById = (arr, id, currentUser) =>
  (arr || []).map(r => r.id === id
    ? { ...r, isDeleted: true, deletedAt: new Date().toISOString(), deletedBy: currentUser || null }
    : r);

// ── Restore helper ──
// Reverses a soft-delete by clearing the deletion fields. Audit-friendly:
// stamps restoredAt/restoredBy so the action is traceable.
export const restoreById = (arr, id, currentUser) =>
  (arr || []).map(r => r.id === id
    ? { ...r, isDeleted: false, deletedAt: null, deletedBy: null,
        restoredAt: new Date().toISOString(), restoredBy: currentUser || null }
    : r);

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
// Roles with unrestricted (global) data visibility. Single source of truth
// shared by getScopedUserIds + isGlobalRole.
//
// NOTE: bd_lead was previously global but was downgraded — a BD Lead now
// only sees their own assigned records plus anyone reporting (solid or
// dotted) to them. BD Leads with no reports see only themselves.
// vp_sales_mkt is global by design — the VP Sales & Marketing role exists
// specifically so one person can oversee + act across every sales, support,
// and marketing team org-wide (leads, deals, calls, tickets, invoices,
// quotes, comms, events). Keeping them out of GLOBAL_ROLES would defeat
// the entire purpose of the role.
export const GLOBAL_ROLES = ["admin", "md", "director", "vp_sales_mkt"];

// Normalize a role value before any comparison. Live data has been observed
// with mixed casing / whitespace ("Admin", " director"), which silently
// dropped managers into self-only scope. Lowercase + trim guards every check.
export const normalizeRole = (r) => String(r ?? "").trim().toLowerCase();

export const getScopedUserIds = (currentUserId, orgUsers) => {
  const allUsers = orgUsers || [];
  const user = allUsers.find(u => u.id === currentUserId);
  if (!user) return new Set([currentUserId]);

  const { deptId, branchId } = user;
  const role = normalizeRole(user.role);

  // Rule 1: Global roles see everything
  if (GLOBAL_ROLES.includes(role)) {
    return new Set(allUsers.map(u => u.id));
  }

  // Rule 2: Walk the reporting tree downward — start with self, add all who
  // (directly or transitively) report up to me. Follows BOTH the solid line
  // (reportsTo, single parent) AND every dotted line (dottedTo[], 0..N extra
  // parents). This is what lets a PM whose primary line is Product Dev but
  // who's dotted into Sales & Marketing show up in BOTH managers' scopes.
  const reportsToMe = (u, mgrId) => {
    if (u.reportsTo === mgrId) return true;
    const dotted = Array.isArray(u.dottedTo) ? u.dottedTo : [];
    return dotted.includes(mgrId);
  };
  const scoped = new Set([currentUserId]);
  let frontier = [currentUserId];
  while (frontier.length > 0) {
    const next = [];
    for (const mgrId of frontier) {
      for (const u of allUsers) {
        if (u.active === false) continue;
        if (reportsToMe(u, mgrId) && !scoped.has(u.id)) {
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
  return !user || GLOBAL_ROLES.includes(normalizeRole(user.role));
};

export const canAccess = (userId, module, orgUsers, customPermissions) => {
  const u = (orgUsers||[]).find(x=>x.id===userId) || INIT_USERS.find(x=>x.id===userId);
  if(!u) return false;
  const role = normalizeRole(u.role);
  // Check user-level override first
  const userOverride = customPermissions?.__users?.[userId]?.[module];
  if(userOverride!==undefined) return userOverride && userOverride!==false;
  // Then role-level custom override
  const roleOverride = customPermissions?.[role]?.[module];
  if(roleOverride!==undefined) return roleOverride && roleOverride!==false;
  // Fall back to default
  const perm = PERMISSIONS[role];
  if(!perm) return false;
  return perm[module] && perm[module]!==false;
};
export const canWrite = (userId, module, orgUsers, customPermissions) => {
  const u = (orgUsers||[]).find(x=>x.id===userId) || INIT_USERS.find(x=>x.id===userId);
  if(!u) return false;
  const role = normalizeRole(u.role);
  // Check user-level override first
  const userOverride = customPermissions?.__users?.[userId]?.[module];
  if(userOverride!==undefined) return userOverride==="rw";
  // Then role-level custom override
  const roleOverride = customPermissions?.[role]?.[module];
  if(roleOverride!==undefined) return roleOverride==="rw";
  return PERMISSIONS[role]?.[module]==="rw";
};
