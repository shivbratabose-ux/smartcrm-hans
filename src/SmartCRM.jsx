import { useState, useMemo, useEffect, useCallback, useRef } from "react";

// Data & Utils
import { INIT_USERS, PROD_MAP, STAGE_PROB, registerCatalog, registerMasters } from "./data/constants";
import {
  INIT_ACCOUNTS, INIT_CONTACTS, INIT_OPPS, INIT_ACTIVITIES,
  INIT_TICKETS, INIT_NOTES, INIT_FILES, INIT_MASTERS,
  INIT_PRODUCT_CATALOG, INIT_ORG, INIT_TEAMS,
  INIT_LEADS, INIT_CALL_REPORTS, INIT_CONTRACTS, INIT_COLLECTIONS, INIT_TARGETS,
  INIT_QUOTES, INIT_COMM_LOGS, INIT_EVENTS, BLANK_LEAD, BLANK_ACC, BLANK_TKT, BLANK_CONTRACT, INIT_UPDATES,
  BLANK_INVOICE, INIT_INVOICES, BLANK_OPP
} from "./data/seed";
import { loadState, saveState, ErrorBoundary, today, uid, getScopedUserIds, isGlobalRole, normalizeRole } from "./utils/helpers";
import { ToastContainer, notify, reportSyncError } from "./utils/toast";
import { CSS } from "./styles";

// Supabase integration
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { loadAllData, subscribeToAll, signOut as supabaseSignOut, seedSupabase, insertRecord, updateRecord, deleteRecord, restoreRecord, loadDeleted } from "./lib/db";

// Components
import Login from "./components/Login";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./components/Dashboard";
import Accounts from "./components/Accounts";
import Contacts from "./components/Contacts";
import Pipeline from "./components/Pipeline";
import Activities from "./components/Activities";
import Tickets from "./components/Tickets";
import Reports from "./components/Reports";
import Masters from "./components/Masters";
import OrgHierarchy from "./components/OrgHierarchy";
import TeamUsers from "./components/TeamUsers";
import Leads from "./components/Leads";
import CallReports from "./components/CallReports";
import Contracts from "./components/Contracts";
import Collections from "./components/Collections";
import Targets from "./components/Targets";
import Quotations from "./components/Quotations";
import CalendarView from "./components/CalendarView";
import CommLog from "./components/CommLog";
import BulkUpload from "./components/BulkUpload";
import Profile from "./components/Profile";
import QuickLogFAB from "./components/QuickLog";
import Updates from "./components/Updates";
import Help from "./components/Help";
import Trash from "./components/Trash";
import { registerOrgUsers } from "./components/shared";

// ── Session persistence with 30-min idle timeout ──
const SESSION_KEY = "smartcrm_session";
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

const loadSession = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (Date.now() - s.lastActive > IDLE_TIMEOUT) {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s.userId;
  } catch { return null; }
};
const saveSession = (userId) => {
  const data = JSON.stringify({ userId, lastActive: Date.now() });
  sessionStorage.setItem(SESSION_KEY, data);
  localStorage.setItem(SESSION_KEY, data);
};
const clearSession = () => {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
};

// ═══════════════════════════════════════════════════════════════════
// DATA MIGRATION — runs on EVERY load, idempotent, NEVER discards user data.
//
// History note: previously a DATA_VERSION mismatch wiped localStorage and
// reseeded INIT_*. That destroyed user-entered records on every schema bump
// and (because the sync-to-Supabase diff treated the wipe as user deletes)
// cascaded the loss to the cloud. The version field is now metadata only;
// migrateState backfills missing arrays and missing fields in place.
// ═══════════════════════════════════════════════════════════════════
const DATA_VERSION = "v13"; // tracking-only; no longer triggers a reset

function migrateState(raw) {
  if (!raw) return null;
  const s = { ...raw };

  // ── 0. Backfill any missing top-level arrays from INIT seeds ──
  // Adding a new module previously required bumping DATA_VERSION (which
  // wiped everything). Now we just fill in what's missing and leave
  // existing user data alone.
  if (!Array.isArray(s.accounts))    s.accounts    = INIT_ACCOUNTS;
  if (!Array.isArray(s.contacts))    s.contacts    = INIT_CONTACTS;
  if (!Array.isArray(s.opps))        s.opps        = INIT_OPPS;
  if (!Array.isArray(s.activities))  s.activities  = INIT_ACTIVITIES;
  if (!Array.isArray(s.tickets))     s.tickets     = INIT_TICKETS;
  if (!Array.isArray(s.notes))       s.notes       = INIT_NOTES;
  if (!Array.isArray(s.files))       s.files       = INIT_FILES;
  if (!s.masters || typeof s.masters !== "object") s.masters = INIT_MASTERS;
  if (!Array.isArray(s.catalog))     s.catalog     = INIT_PRODUCT_CATALOG;
  if (!s.org || typeof s.org !== "object") s.org   = INIT_ORG;
  if (!Array.isArray(s.teams))       s.teams       = INIT_TEAMS;
  if (!Array.isArray(s.orgUsers))    s.orgUsers    = INIT_USERS;
  if (!Array.isArray(s.leads))       s.leads       = INIT_LEADS;
  if (!Array.isArray(s.callReports)) s.callReports = INIT_CALL_REPORTS;
  if (!Array.isArray(s.contracts))   s.contracts   = INIT_CONTRACTS;
  if (!Array.isArray(s.collections)) s.collections = INIT_COLLECTIONS;
  if (!Array.isArray(s.invoices))    s.invoices    = INIT_INVOICES;
  if (!Array.isArray(s.targets))     s.targets     = INIT_TARGETS;
  if (!Array.isArray(s.quotes))      s.quotes      = INIT_QUOTES;
  if (!Array.isArray(s.commLogs))    s.commLogs    = INIT_COMM_LOGS;
  if (!Array.isArray(s.events))      s.events      = INIT_EVENTS;
  if (!s.customPermissions || typeof s.customPermissions !== "object") s.customPermissions = {};

  // Backfill any missing master sections without overwriting user edits.
  // INIT_MASTERS gains new keys over time (regions, slaHours, etc.); copy
  // only the keys the user hasn't already populated.
  if (s.masters && INIT_MASTERS) {
    for (const [k, v] of Object.entries(INIT_MASTERS)) {
      if (s.masters[k] === undefined) s.masters[k] = v;
    }
  }

  // ── 1. Contacts: build a lookup by email ──
  let allContacts = Array.isArray(s.contacts) ? [...s.contacts] : [];
  const byEmail = {};
  allContacts.forEach(c => { if (c.email) byEmail[c.email.toLowerCase()] = c; });
  let conSeq = allContacts.reduce((max, c) => {
    const m = c.contactId?.match(/CON-(\d+)/);
    return m ? Math.max(max, parseInt(m[1])) : max;
  }, 0);
  const newContacts = [];

  // ── 2. Leads: backfill missing fields & auto-create Contact records ──
  if (Array.isArray(s.leads)) {
    s.leads = s.leads.map(l => {
      // Ensure all new schema fields exist
      const patched = {
        addresses: [],
        salesTeam: [],
        contactRoles: {},
        additionalProducts: [],
        stageHistory: [],
        convertedOppIds: [],
        contactIds: [],
        ...l,
      };

      // If no contactIds yet, try to link or create a Contact record
      if (!patched.contactIds?.length && l.email) {
        const key = l.email.toLowerCase();
        let match = byEmail[key] || newContacts.find(c => c.email?.toLowerCase() === key);
        if (!match && l.contact) {
          // Auto-create a contact record for this lead's person
          conSeq++;
          match = {
            id: `c_mig_${l.id}`,
            contactId: `CON-${String(conSeq).padStart(3, "0")}`,
            name: l.contact,
            email: l.email,
            phone: l.phone || "",
            designation: l.designation || "",
            role: l.designation || "Contact",
            department: "",
            departments: [],
            products: l.product ? [l.product] : [],
            branches: [],
            countries: [],
            linkedOpps: [],
            accountId: l.accountId || "",
          };
          newContacts.push(match);
          byEmail[key] = match;
        }
        if (match) patched.contactIds = [match.id];
      }
      return patched;
    });
  }

  // ── 3. Opportunities: backfill missing fields ──
  if (Array.isArray(s.opps)) {
    s.opps = s.opps.map(o => ({
      sourceLeadIds: [],
      contactRoles: [],
      forecastCategory: "Likely-Case",
      dealSize: "Medium",
      ...o,
      // Ensure products is always an array
      products: Array.isArray(o.products) ? o.products : (o.products ? [o.products] : []),
    }));
  }

  // ── 4. Accounts: ensure products is always an array ──
  if (Array.isArray(s.accounts)) {
    s.accounts = s.accounts.map(a => ({
      ...a,
      products: Array.isArray(a.products) ? a.products : (a.products ? [a.products] : []),
    }));
  }

  // ── 5. Add newly-created contacts ──
  if (newContacts.length) {
    s.contacts = [...allContacts, ...newContacts];
  }

  // ── 6. Updates: seed if missing ──
  if (!Array.isArray(s.updates)) {
    s.updates = INIT_UPDATES;
  }

  return s;
}

export default function SmartCRM() {
  const saved = useMemo(() => {
    const raw = loadState();
    // Always migrate; never discard. migrateState backfills missing arrays
    // and missing fields from INIT seeds without touching existing records.
    // For brand-new browsers (raw === null) it returns null, so we hand it
    // a minimal seed object so first-run gets the demo data.
    const base = raw || {
      accounts: INIT_ACCOUNTS, contacts: INIT_CONTACTS, opps: INIT_OPPS,
      activities: INIT_ACTIVITIES, tickets: INIT_TICKETS, notes: INIT_NOTES,
      files: INIT_FILES, masters: INIT_MASTERS, catalog: INIT_PRODUCT_CATALOG,
      org: INIT_ORG, teams: INIT_TEAMS, orgUsers: INIT_USERS,
      leads: INIT_LEADS, callReports: INIT_CALL_REPORTS, contracts: INIT_CONTRACTS,
      collections: INIT_COLLECTIONS, invoices: INIT_INVOICES, targets: INIT_TARGETS, quotes: INIT_QUOTES,
      commLogs: INIT_COMM_LOGS, events: INIT_EVENTS, updates: INIT_UPDATES, customPermissions: {},
    };
    return migrateState(base);
  }, []);
  const [currentUser,setCurrentUser] = useState(() => loadSession());

  // ── Hash-based routing ──
  const getPageFromHash = () => {
    const hash = window.location.hash.replace(/^#\/?/, "");
    return hash || "dashboard";
  };
  const [page,_setPage] = useState(getPageFromHash);
  const setPage = useCallback((p) => {
    _setPage(p);
    window.location.hash = p === "dashboard" ? "/" : `/${p}`;
  }, []);
  useEffect(() => {
    const onHash = () => _setPage(getPageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const [collapsed,setCollapsed]     = useState(false);
  const [accounts,setAccounts]       = useState(saved?.accounts || INIT_ACCOUNTS);
  const [contacts,setContacts]       = useState(saved?.contacts || INIT_CONTACTS);
  const [opps,setOpps]               = useState(saved?.opps || INIT_OPPS);
  const [activities,setActivities]   = useState(saved?.activities || INIT_ACTIVITIES);
  const [tickets,setTickets]         = useState(saved?.tickets || INIT_TICKETS);
  const [notes,setNotes]             = useState(saved?.notes || INIT_NOTES);
  const [files,setFiles]             = useState(saved?.files || INIT_FILES);
  const [masters,setMasters]         = useState(saved?.masters || INIT_MASTERS);
  const [catalog,setCatalog]         = useState(saved?.catalog || INIT_PRODUCT_CATALOG);
  const [org,setOrg]                 = useState(saved?.org || INIT_ORG);
  const [teams,setTeams]             = useState(saved?.teams || INIT_TEAMS);
  const [orgUsers,setOrgUsers]       = useState(saved?.orgUsers || INIT_USERS);
  // Keep UserPill (shared.jsx) in sync with real Supabase users
  useEffect(() => { registerOrgUsers(orgUsers); }, [orgUsers]);
  // Keep PRODUCTS / PROD_MAP (constants.js) in sync with the live Masters catalog
  // so dropdowns app-wide reflect newly added/edited/deleted Product Lines.
  useEffect(() => { registerCatalog(catalog); }, [catalog]);
  // Keep ALL master-backed constants (CUST_TYPES, COUNTRIES, ACT_TYPES, VERTICALS,
  // LEAD_SOURCES, OPP_STAGES, BILL_TERMS, PAYMENT_MODES, QUOTE_STATUSES, etc.)
  // in sync with the live Masters editor so every dropdown/filter reflects edits.
  useEffect(() => { registerMasters(masters); }, [masters]);
  // New CRM modules
  const [leads,setLeads]             = useState(saved?.leads || INIT_LEADS);
  const [callReports,setCallReports] = useState(saved?.callReports || INIT_CALL_REPORTS);
  const [contracts,setContracts]     = useState(saved?.contracts || INIT_CONTRACTS);
  const [collections,setCollections] = useState(saved?.collections || INIT_COLLECTIONS);
  const [invoices,setInvoices]       = useState(saved?.invoices || INIT_INVOICES);
  const [targets,setTargets]         = useState(saved?.targets || INIT_TARGETS);
  const [quotes,setQuotes]           = useState(saved?.quotes || INIT_QUOTES);
  const [commLogs,setCommLogs]       = useState(saved?.commLogs || INIT_COMM_LOGS);
  const [events,setEvents]           = useState(saved?.events || INIT_EVENTS);
  const [updates,setUpdates]         = useState(saved?.updates || INIT_UPDATES);
  const [customPermissions,setCustomPermissions] = useState(saved?.customPermissions || {});

  // ── Derived: unread update count for current user ──
  const myUnreadCount = useMemo(() => {
    if (!currentUser) return 0;
    const allU = orgUsers || [];
    const dbUser = allU.find(u => u.id === currentUser);
    return (updates || []).filter(u => {
      if (u.archived) return false;
      const isRecipient = (u.recipientUserIds || []).includes(currentUser);
      const isAuthor    = u.createdBy === currentUser;
      if (!isRecipient && !isAuthor) return false;
      return (u.readStatus || {})[currentUser] !== "read";
    }).length;
  }, [updates, currentUser, orgUsers]);

  // ── Role-scoped data visibility ──
  // Computes the set of user IDs whose records the current user may see.
  // High-privilege roles (admin/md/director/bd_lead) receive the full dataset.
  // line_mgr  → department peers; country_mgr → branch peers; others → self only.
  const _scopedIds = useMemo(() => getScopedUserIds(currentUser, orgUsers), [currentUser, orgUsers]);
  const _globalRole = useMemo(() => isGlobalRole(currentUser, orgUsers), [currentUser, orgUsers]);

  // Roles allowed to soft-delete records; all others can only archive (same action, UI label differs)
  const canDelete = useMemo(() => {
    const role = normalizeRole(orgUsers.find(u => u.id === currentUser)?.role);
    return ["admin","md","director","line_mgr"].includes(role);
  }, [currentUser, orgUsers]);

  // Only admins can restore soft-deleted records
  const canRestore = useMemo(() => {
    const role = normalizeRole(orgUsers.find(u => u.id === currentUser)?.role);
    return ["admin","md","director"].includes(role);
  }, [currentUser, orgUsers]);

  // Exclude soft-deleted records from all visible arrays
  const visibleLeads = useMemo(() => {
    const live = leads.filter(l => !l.isDeleted);
    if (_globalRole) return live;
    return live.filter(l => !l.assignedTo || _scopedIds.has(l.assignedTo));
  }, [leads, _scopedIds, _globalRole]);

  const visibleOpps = useMemo(() => {
    const live = opps.filter(o => !o.isDeleted);
    if (_globalRole) return live;
    return live.filter(o => !o.owner || _scopedIds.has(o.owner));
  }, [opps, _scopedIds, _globalRole]);

  const visibleActivities = useMemo(() => {
    const live = activities.filter(a => !a.isDeleted);
    if (_globalRole) return live;
    return live.filter(a => !a.owner || _scopedIds.has(a.owner));
  }, [activities, _scopedIds, _globalRole]);

  const visibleCallReports = useMemo(() => {
    const live = callReports.filter(cr => !cr.isDeleted);
    if (_globalRole) return live;
    return live.filter(cr => !cr.marketingPerson || _scopedIds.has(cr.marketingPerson));
  }, [callReports, _scopedIds, _globalRole]);

  // Generic !isDeleted filters for entities without owner-based scoping. These
  // hide soft-deleted records from every list/dropdown app-wide while keeping
  // the underlying state arrays intact for restore/audit.
  const visibleAccounts    = useMemo(() => accounts.filter(a => !a.isDeleted), [accounts]);
  const visibleContacts    = useMemo(() => contacts.filter(c => !c.isDeleted), [contacts]);
  const visibleTickets     = useMemo(() => tickets.filter(t => !t.isDeleted), [tickets]);
  const visibleContracts   = useMemo(() => contracts.filter(c => !c.isDeleted), [contracts]);
  // Collections respect the same hierarchy walker as leads/opps: global roles
  // see everything; managers see their full downline (solid + dotted line);
  // sales execs see only what they own. Unowned rows stay visible to everyone
  // so finance-uploaded invoices that haven't been routed yet aren't hidden.
  const visibleCollections = useMemo(() => {
    const live = collections.filter(c => !c.isDeleted);
    if (_globalRole) return live;
    return live.filter(c => !c.owner || _scopedIds.has(c.owner));
  }, [collections, _scopedIds, _globalRole]);
  const visibleQuotes      = useMemo(() => quotes.filter(q => !q.isDeleted), [quotes]);
  const visibleCommLogs    = useMemo(() => commLogs.filter(c => !c.isDeleted), [commLogs]);
  const visibleEvents      = useMemo(() => events.filter(e => !e.isDeleted), [events]);
  const visibleTargets     = useMemo(() => targets.filter(t => !t.isDeleted), [targets]);
  const visibleInvoices    = useMemo(() => invoices.filter(i => !i.isDeleted), [invoices]);
  const visibleUpdates     = useMemo(() => updates.filter(u => !u.isDeleted), [updates]);

  // ── Session: persist login & track idle timeout ──
  const login = useCallback((userId) => { setCurrentUser(userId); saveSession(userId); }, []);
  useEffect(() => {
    if (!currentUser) return;
    saveSession(currentUser);
    const touch = () => saveSession(currentUser);
    const events = ["mousedown","keydown","scroll","touchstart"];
    events.forEach(e => window.addEventListener(e, touch, {passive:true}));
    const timer = setInterval(() => {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (raw) {
          const s = JSON.parse(raw);
          if (Date.now() - s.lastActive > IDLE_TIMEOUT) { clearSession(); setCurrentUser(null); }
        }
      } catch {}
    }, 60000);
    return () => { events.forEach(e => window.removeEventListener(e, touch)); clearInterval(timer); };
  }, [currentUser]);

  // ── Supabase sync: detect array changes via useEffect and sync to DB ──
  // SAFETY: this effect must NOT run until the initial cloud load has
  // resolved. Otherwise a local-state initialisation (or a future state
  // replacement) is read as "user deleted everything" and the diff
  // cascades DELETEs to Supabase, wiping the cloud copy too.
  const prevRef = useRef({});
  const syncReady = useRef(false);
  const syncModules = useMemo(() => ({
    accounts, contacts, opps, activities, tickets, leads, callReports,
    contracts, collections, targets, quotes, commLogs, events, notes, files,
    users: orgUsers,
  }), [accounts,contacts,opps,activities,tickets,leads,callReports,contracts,collections,targets,quotes,commLogs,events,notes,files,orgUsers]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // Until the initial cloud load completes (or Supabase is unconfigured),
    // just snapshot state and skip the diff. The first real diff fires only
    // when local state changes AFTER cloud-load has hydrated.
    if (!syncReady.current) {
      prevRef.current = { ...syncModules };
      return;
    }
    const prev = prevRef.current;
    // Wrap sync ops so any rejected promise / Supabase error surfaces as a
    // throttled toast instead of disappearing into the console. Local state
    // is already saved by the time we get here, so a sync failure means
    // "cloud out of sync" — important to show, but only once per burst.
    const track = (op, label) => Promise.resolve(op)
      .then(res => { if (res?.error) reportSyncError(label, res.error); })
      .catch(err => reportSyncError(label, err));
    for (const [module, next] of Object.entries(syncModules)) {
      const old = prev[module];
      if (!old || old === next || !Array.isArray(next) || !Array.isArray(old)) continue;
      const prevIds = new Set(old.map(r => r.id));
      const nextIds = new Set(next.map(r => r.id));
      // Inserts
      next.forEach(r => { if (r.id && !prevIds.has(r.id)) track(insertRecord(module === "users" ? "users" : module, r), `${module} insert`); });
      // Deletes (soft — deleteRecord now issues UPDATE is_deleted=true)
      old.forEach(r => { if (r.id && !nextIds.has(r.id)) track(deleteRecord(module === "users" ? "users" : module, r.id, currentUser), `${module} delete`); });
      // Updates — only compare records that exist in both
      next.forEach(r => {
        if (r.id && prevIds.has(r.id)) {
          const o = old.find(p => p.id === r.id);
          if (o && JSON.stringify(o) !== JSON.stringify(r)) track(updateRecord(module === "users" ? "users" : module, r.id, r), `${module} update`);
        }
      });
    }
    prevRef.current = { ...syncModules };
  }, [syncModules]);

  // ── Supabase: Load data from cloud on mount ──
  const [dbReady, setDbReady] = useState(!isSupabaseConfigured);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    loadAllData().catch(err => {
      notify.error(`Couldn't reach the cloud: ${err?.message || "network error"}. Working in local-only mode — changes won't sync.`);
      return null;
    }).then(data => {
      if (data) {
        if (data.accounts?.length)    setAccounts(data.accounts);
        if (data.contacts?.length)    setContacts(data.contacts);
        if (data.opps?.length)        setOpps(data.opps);
        if (data.activities?.length)  setActivities(data.activities);
        if (data.tickets?.length)     setTickets(data.tickets);
        if (data.leads?.length)       setLeads(data.leads);
        if (data.callReports?.length) setCallReports(data.callReports);
        if (data.contracts?.length)   setContracts(data.contracts);
        if (data.collections?.length) setCollections(data.collections);
        if (data.targets?.length)     setTargets(data.targets);
        if (data.quotes?.length)      setQuotes(data.quotes);
        if (data.commLogs?.length)    setCommLogs(data.commLogs);
        if (data.events?.length)      setEvents(data.events);
        if (data.notes?.length)       setNotes(data.notes);
        if (data.files?.length)       setFiles(data.files);
      }
      setDbReady(true);
      // Cloud is now the source of truth — start propagating local changes.
      // Any state transition that ran before this point (initial mount,
      // migrateState backfill, cloud hydration) is treated as setup, not
      // as user-driven inserts/deletes, so it won't cascade to Supabase.
      syncReady.current = true;
    });
    // Also load users from Supabase to get latest roles/profiles
    supabase.from("users").select("*").then(({data: dbUsers}) => {
      if (dbUsers?.length) {
        const mapped = dbUsers.map(u => ({
          id: u.id, name: u.name, email: u.email, initials: u.initials,
          role: u.role, lob: u.lob, country: u.country, active: u.active,
          branchId: u.branch_id, deptId: u.dept_id, joinDate: u.join_date,
          authUserId: u.auth_user_id, reportsTo: u.reports_to || undefined,
          dottedTo: Array.isArray(u.dotted_to) ? u.dotted_to : [],
        }));
        setOrgUsers(mapped);
      }
    });
  }, []);

  // ── Supabase: Realtime subscriptions ──
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // Defensive realtime handlers:
    // - INSERT: skip if id already exists locally (avoids duplicates from
    //   echo of our own writes during the round-trip).
    // - UPDATE: shallow-merge instead of full replace, so a partial
    //   payload (e.g. RLS-filtered columns) cannot clobber local fields
    //   with undefined.
    // - DELETE: never hard-remove from local state. Our app uses soft
    //   delete (isDeleted=true) exclusively; an out-of-band hard DELETE
    //   from the DB (manual SQL, dashboard, future purge job) should NOT
    //   silently destroy the user's local copy. We flag it as deleted
    //   instead so the record stays available in Trash for recovery.
    const makeHandler = (setter) => ({ type, record, oldRecord }) => {
      if (type === "INSERT") {
        if (!record?.id) return;
        setter(p => p.some(r => r.id === record.id) ? p : [...p, record]);
      } else if (type === "UPDATE") {
        if (!record?.id) return;
        setter(p => p.map(r => r.id === record.id ? { ...r, ...record } : r));
      } else if (type === "DELETE") {
        const id = oldRecord?.id;
        if (!id) return;
        setter(p => p.map(r => r.id === id
          ? { ...r, isDeleted: true, deletedAt: r.deletedAt || new Date().toISOString(), deletedBy: r.deletedBy || "supabase-delete" }
          : r));
      }
    };
    const unsub = subscribeToAll({
      accounts: makeHandler(setAccounts),
      contacts: makeHandler(setContacts),
      opps: makeHandler(setOpps),
      activities: makeHandler(setActivities),
      tickets: makeHandler(setTickets),
      leads: makeHandler(setLeads),
      callReports: makeHandler(setCallReports),
      collections: makeHandler(setCollections),
    });
    return unsub;
  }, []);

  // ── Dev-only debug helpers (stripped from production builds) ──
  useEffect(() => {
    if (import.meta.env.DEV) {
      if (isSupabaseConfigured) {
        window.__seedSupabase = () => seedSupabase({
          accounts: INIT_ACCOUNTS, contacts: INIT_CONTACTS, opps: INIT_OPPS,
          activities: INIT_ACTIVITIES, tickets: INIT_TICKETS, leads: INIT_LEADS,
          callReports: INIT_CALL_REPORTS, contracts: INIT_CONTRACTS,
          collections: INIT_COLLECTIONS, targets: INIT_TARGETS, quotes: INIT_QUOTES,
          commLogs: INIT_COMM_LOGS, events: INIT_EVENTS, notes: INIT_NOTES, files: INIT_FILES,
        });
      }
      window.__resetCRM = () => {
        try { localStorage.removeItem("smartcrm_data"); } catch {}
        window.location.reload();
      };
      window.__crmAudit = () => {
        const raw = localStorage.getItem("smartcrm_data");
        const d = raw ? JSON.parse(raw) : null;
        console.table({
          leads: d?.leads?.length,
          contacts: d?.contacts?.length,
          opps: d?.opps?.length,
          accounts: d?.accounts?.length,
          leadsWithContactIds: d?.leads?.filter(l => l.contactIds?.length).length,
          oppsFromLeads: d?.opps?.filter(o => o.sourceLeadIds?.length).length,
        });
        return d;
      };
    }
  }, []);

  // Persist all data to localStorage on every change (works as primary store without Supabase, backup with Supabase)
  useEffect(() => {
    saveState({ version: DATA_VERSION, accounts, contacts, opps, activities, tickets, notes, files, masters, catalog, org, teams, orgUsers,
      leads, callReports, contracts, collections, invoices, targets, quotes, commLogs, events, updates, customPermissions });
  }, [accounts, contacts, opps, activities, tickets, notes, files, masters, catalog, org, teams, orgUsers,
    leads, callReports, contracts, collections, invoices, targets, quotes, commLogs, events, updates, customPermissions]);

  const addNote = note => setNotes(p=>[...p,note]);
  const addFile = file => setFiles(p=>[...p,file]);
  const logout  = () => { if(isSupabaseConfigured) supabaseSignOut(); clearSession(); setCurrentUser(null); setPage("dashboard"); };

  // Cascade delete: remove all linked records when an account is deleted
  const cascadeDeleteAccount = useCallback((accId) => {
    const now = new Date().toISOString();
    const sd = { isDeleted: true, deletedAt: now, deletedBy: currentUser };
    setAccounts(p => p.map(a => a.id === accId ? {...a, ...sd} : (a.parentId === accId ? {...a, parentId: ""} : a)));
    setContacts(p => p.map(c => c.accountId === accId ? {...c, ...sd} : c));
    setOpps(p => p.map(o => o.accountId === accId ? {...o, ...sd} : o));
    setActivities(p => p.map(a => a.accountId === accId ? {...a, ...sd} : a));
    setTickets(p => p.map(t => t.accountId === accId ? {...t, ...sd} : t));
    setContracts(p => p.map(c => c.accountId === accId ? {...c, ...sd} : c));
    setCollections(p => p.map(c => c.accountId === accId ? {...c, ...sd} : c));
    setCallReports(p => p.map(r => r.accountId === accId ? {...r, ...sd} : r));
    // notes/files: orphan rather than soft-delete (they carry content)
  }, [currentUser]);

  const cascadeDeleteOpp = useCallback((oppId) => {
    const now = new Date().toISOString();
    const sd = { isDeleted: true, deletedAt: now, deletedBy: currentUser };
    setOpps(p => p.map(o => o.id === oppId ? {...o, ...sd} : o));
    // Dependent records: clear the broken FK rather than soft-delete so
    // the user-authored content (activity notes, contract terms, quote
    // line-items, comm bodies) is preserved and can be re-linked later.
    setActivities(p => p.map(a => a.oppId === oppId ? {...a, oppId: ""} : a));
    setContracts(p => p.map(c => c.oppId === oppId ? {...c, oppId: ""} : c));
    setQuotes(p => p.map(q => q.oppId === oppId ? {...q, oppId: ""} : q));
    setCallReports(p => p.map(r => r.oppId === oppId ? {...r, oppId: ""} : r));
    setCommLogs(p => p.map(c => c.oppId === oppId ? {...c, oppId: ""} : c));
  }, [currentUser]);

  const cascadeDeleteContact = useCallback((conId) => {
    const now = new Date().toISOString();
    const sd = { isDeleted: true, deletedAt: now, deletedBy: currentUser };
    setContacts(p => p.map(c => c.id === conId ? {...c, ...sd} : c));
    setActivities(p => p.map(a => a.contactId === conId ? {...a, contactId: ""} : a));
    setCallReports(p => p.map(cr => cr.contactId === conId ? {...cr, contactId: ""} : cr));
    setLeads(p => p.map(l => l.contactIds?.includes(conId) ? {...l, contactIds: l.contactIds.filter(id => id !== conId)} : l));
    setOpps(p => p.map(o => {
      let changed = false, up = {...o};
      if (o.primaryContactId === conId) { up.primaryContactId = ""; changed = true; }
      if (o.secondaryContactIds?.includes(conId)) { up.secondaryContactIds = o.secondaryContactIds.filter(id => id !== conId); changed = true; }
      return changed ? up : o;
    }));
  }, [currentUser]);

  // Deal Won → Customer: auto-create or update account
  const handleDealWon = useCallback((opp) => {
    if (opp.accountId) {
      // Update existing account: mark Active, add products
      setAccounts(p => p.map(a => {
        if (a.id !== opp.accountId) return a;
        // Merge productSelection: union by productId, union moduleIds within
        const existingSel = Array.isArray(a.productSelection) ? a.productSelection : [];
        const incoming = Array.isArray(opp.productSelection) ? opp.productSelection : [];
        const mergedSel = [...existingSel];
        for (const inc of incoming) {
          const idx = mergedSel.findIndex(x => x.productId === inc.productId);
          if (idx === -1) mergedSel.push({ ...inc });
          else mergedSel[idx] = {
            productId: inc.productId,
            moduleIds: [...new Set([...(mergedSel[idx].moduleIds||[]), ...(inc.moduleIds||[])])],
            noAddons: mergedSel[idx].noAddons && inc.noAddons,
          };
        }
        return {
          ...a,
          status: "Active",
          products: [...new Set([...(a.products || []), ...(opp.products || [])])],
          productSelection: mergedSel,
          arrRevenue: (a.arrRevenue || 0) + (opp.value || 0),
        };
      }));
    } else {
      // Auto-create account from deal
      const year = new Date().getFullYear();
      const maxSeq = accounts.reduce((max, a) => {
        const m = a.accountNo?.match(/ACC-\d+-(\d+)/);
        return m ? Math.max(max, parseInt(m[1])) : max;
      }, 0);
      const newAccId = `acc_${uid()}`;
      const newAcc = {
        id: newAccId,
        accountNo: `ACC-${year}-${String(maxSeq + 1).padStart(3, '0')}`,
        name: opp.title?.split(' – ').pop() || opp.title || "New Customer",
        status: "Active",
        owner: opp.owner,
        country: opp.country || "",
        region: "",
        products: opp.products || [],
        productSelection: Array.isArray(opp.productSelection) ? opp.productSelection : [],
        source: "Deal Won",
        arrRevenue: opp.value || 0,
      };
      setAccounts(p => [...p, newAcc]);
      setOpps(p => p.map(o => o.id === opp.id ? {...o, accountId: newAccId} : o));
      // Link contacts to new account
      const cIds = [opp.primaryContactId, ...(opp.secondaryContactIds || [])].filter(Boolean);
      if (cIds.length) setContacts(p => p.map(c => cIds.includes(c.id) && !c.accountId ? {...c, accountId: newAccId} : c));
      // Link activities to new account
      setActivities(p => p.map(a => a.oppId === opp.id && !a.accountId ? {...a, accountId: newAccId} : a));
    }
    // Create "Deal Won" milestone activity
    setActivities(p => [...p, {
      id: `act_${Date.now()}`, type: "Meeting", status: "Completed", date: today,
      time: new Date().toTimeString().slice(0, 5), duration: 0,
      accountId: opp.accountId || "", contactId: opp.primaryContactId || "",
      oppId: opp.id, owner: opp.owner,
      title: `Deal Won – ${opp.title}`,
      notes: `Deal ${opp.oppId || opp.id} marked as Won. Value: ₹${opp.value || 0}L`,
      outcome: "Positive",
    }]);
  }, [accounts]);

  // Convert lead to opportunity — accepts conversion data from modal
  const convertLeadToOpp = useCallback((lead, conversionData) => {
    const data = conversionData || {};
    // Build contact roles array from the contactRoles map
    const contactRoles = data.contactRoles ? Object.entries(data.contactRoles).filter(([,role]) => role).map(([contactId, role], i) => ({ contactId, role, isPrimary: i === 0 })) : [];
    const primaryContact = contactRoles.find(r => r.isPrimary)?.contactId || data.primaryContactId || (lead.contactIds?.[0]) || "";
    // Generate opportunity ID: O# prefix derived from lead ID
    const oppId = lead.leadId
      ? `O${lead.leadId}`  // e.g. #FL-2026-001 -> O#FL-2026-001
      : `OPP-${new Date().getFullYear()}-${String(Date.now()).slice(-3)}`;
    const newOpp = {
      id: uid(),
      oppId,
      title: data.title || `${PROD_MAP[lead.product]?.name || lead.product} – ${lead.company}`,
      accountId: data.accountId || lead.accountId || "",
      products: data.selectedProducts?.length ? data.selectedProducts : [lead.product],
      // Carry the lead's full product+module selection through to the opportunity
      // so downstream conversions (opp → quote/contract) inherit the same picks.
      productSelection: Array.isArray(lead.productSelection) ? lead.productSelection : [],
      stage: "Prospect",
      value: data.value || 0,
      probability: 10,
      owner: data.owner || lead.assignedTo,
      closeDate: data.closeDate || "",
      country: data.country || (lead.region === "South Asia" ? "India" : ""),
      notes: data.notes || lead.notes || "",
      source: "Lead Conversion",
      primaryContactId: primaryContact,
      secondaryContactIds: contactRoles.filter(r => !r.isPrimary).map(r => r.contactId),
      contactRoles,
      leadId: lead.leadId || "",
      sourceLeadIds: [lead.id],
      lob: data.lob || "",
      hierarchyLevel: "Parent Company",
      forecastCategory: data.forecastCategory || "Likely-Case",
      dealSize: data.dealSize || "Medium",
    };
    // If createNewAccount, create the account first
    if (data.createNewAccount && lead.company) {
      const newAccId = `acc_${uid()}`;
      const newAcc = {
        id: newAccId,
        name: lead.company,
        country: newOpp.country,
        region: lead.region || "",
        status: "Active",
        owner: newOpp.owner,
        source: "Lead Conversion",
        products: newOpp.products || [],
        productSelection: newOpp.productSelection || [],
        hierarchyLevel: "Parent Company",
        hierarchyPath: lead.company,
        accountNo: "",
      };
      setAccounts(p => [...p, newAcc]);
      newOpp.accountId = newAccId;
    }
    setOpps(p => [...p, newOpp]);
    // Handle "keep lead open for additional LOBs" vs full conversion
    if (data.keepLeadOpen) {
      setLeads(p => p.map(l => l.id === lead.id ? { ...l, convertedOppIds: [...(l.convertedOppIds||[]), newOpp.id], stageHistory: [...(l.stageHistory||[]), {from:l.stage,to:"Partial Convert",date:today}] } : l));
    } else {
      setLeads(p => p.map(l => l.id === lead.id ? { ...l, stage: "Converted", convertedDate: today, convertedOppId: newOpp.id, convertedOppIds: [...(l.convertedOppIds||[]), newOpp.id], convertedOppRefId: newOpp.oppId, stageHistory: [...(l.stageHistory||[]), {from:l.stage,to:"Converted",date:today}] } : l));
    }
    // Create initial activity for the new opportunity
    const initialAct = {
      id: `act_${Date.now()}`,
      type: "Call",
      status: "Completed",
      date: today,
      time: new Date().toTimeString().slice(0, 5),
      duration: 15,
      accountId: newOpp.accountId,
      contactId: primaryContact,
      oppId: newOpp.id,
      owner: newOpp.owner,
      title: `Lead Conversion – ${lead.company}`,
      notes: `Lead ${lead.leadId} converted to opportunity. Qualification: ${data.notes || lead.notes || "Initial qualification complete."}`,
      outcome: "Positive",
    };
    setActivities(p => [...p, initialAct]);
    // Re-link existing activities from lead to new opportunity
    setActivities(p => p.map(a => {
      if (a.leadId === lead.id && !a.oppId) {
        return { ...a, oppId: newOpp.id, accountId: a.accountId || newOpp.accountId };
      }
      return a;
    }));
    // Re-link existing call reports from lead to new opportunity
    setCallReports(p => p.map(cr => {
      if (cr.leadId === lead.id && !cr.oppId) {
        return { ...cr, oppId: newOpp.id, accountId: cr.accountId || newOpp.accountId };
      }
      return cr;
    }));
    if (!data.keepLeadOpen) setPage("pipeline");
  }, []);

  // Bulk upload handler — supports both INSERT (new records) and UPDATE (existing by ref ID).
  // Each record from BulkUpload carries _bulkMode ("insert"|"update") and _matchedId (for updates).
  const handleBulkUpload = useCallback((type, records) => {
    const inserts = records.filter(r => r._bulkMode === "insert");
    const updates = records.filter(r => r._bulkMode === "update");

    // Helper: apply an array of update records onto existing state array by internal id
    const applyUpdates = (existing, updList, cleanFn = r => r) =>
      existing.map(ex => {
        const upd = updList.find(u => u.id === ex.id);
        return upd ? { ...ex, ...cleanFn(upd) } : ex;
      });

    // Strip BulkUpload-internal meta fields before saving
    const strip = ({ _bulkMode, _matchedId, _rowErrors, _mode, ...rest }) => rest;

    const year = new Date().getFullYear();

    switch(type) {
      case "Leads": {
        // Build new contacts from INSERT leads (same logic as before)
        const newContacts = [];
        const conMaxSeq = contacts.reduce((max, c) => {
          const m = c.contactId?.match(/CON-(\d+)/);
          return m ? Math.max(max, parseInt(m[1])) : max;
        }, 0);
        let conSeq = conMaxSeq;

        const maxSeq = leads.reduce((max, l) => {
          const m = l.leadId?.match(/#FL-\d+-(\d+)/);
          return m ? Math.max(max, parseInt(m[1])) : max;
        }, 0);

        let insertIdx = 0;
        const enrichedInserts = inserts.map(r => {
          const matchedAccount = accounts.find(a => a.name?.toLowerCase().trim() === r.company?.toLowerCase().trim());
          const acctId = r.accountId || matchedAccount?.id || "";
          let matchedContact = r.email ? contacts.find(c => c.email?.toLowerCase() === r.email?.toLowerCase()) : null;
          if (!matchedContact && r.email) matchedContact = newContacts.find(c => c.email?.toLowerCase() === r.email?.toLowerCase());
          let contactId = matchedContact?.id || "";
          if (!contactId && r.contact && r.email) {
            conSeq++;
            const newCon = {
              id: `c_${uid()}`, contactId: `CON-${String(conSeq).padStart(3, '0')}`,
              name: r.contact, email: r.email, phone: r.phone || "",
              designation: r.designation || "", department: r.department || "",
              role: "End User", accountId: acctId, linkedOpps: [],
              products: r.product ? [r.product] : [],
            };
            newContacts.push(newCon);
            contactId = newCon.id;
          }
          insertIdx++;
          return {
            ...BLANK_LEAD, ...strip(r),
            leadId: r.leadId || `#FL-${year}-${String(maxSeq + insertIdx).padStart(3, '0')}`,
            score: Math.max(0, Math.min(100, Number(r.score) || 30)),
            createdDate: r.createdDate || today,
            stage: r.stage || "MQL",
            accountId: acctId,
            contactIds: contactId ? [contactId] : r.contactIds || [],
            temperature: Number(r.score) >= 70 ? "Hot" : Number(r.score) >= 40 ? "Warm" : "Cool",
          };
        });

        if (newContacts.length) setContacts(p => [...p, ...newContacts]);
        setLeads(p => {
          const withUpdates = applyUpdates(p, updates.map(strip));
          return [...withUpdates, ...enrichedInserts];
        });
      } break;

      case "Customers": {
        // Resolve products: "iCAFFE;WiseCargo" → ["iCAFFE","WiseCargo"]
        const resolveProducts = (raw) => {
          if (!raw) return [];
          if (Array.isArray(raw)) return raw;
          return String(raw).split(/[;,]/).map(s => s.trim()).filter(Boolean);
        };
        // Resolve owner: name or email → user ID; falls back to raw value
        const resolveOwner = (raw) => {
          if (!raw?.trim()) return "";
          const match = orgUsers.find(u =>
            u.name?.toLowerCase() === raw.toLowerCase() ||
            u.email?.toLowerCase() === raw.toLowerCase() ||
            u.id === raw
          );
          return match?.id || raw;
        };
        const enrichRow = (r) => ({
          ...strip(r),
          products: resolveProducts(r.products),
          owner:    resolveOwner(r.owner),
          arrRevenue: Number(r.arrRevenue) || 0,
          potential:  Number(r.potential)  || 0,
        });

        const maxSeq = accounts.reduce((max, a) => {
          const m = a.accountNo?.match(/ACC-\d+-(\d+)/);
          return m ? Math.max(max, parseInt(m[1])) : max;
        }, 0);
        let insertIdx = 0;
        const enrichedInserts = inserts.map(r => {
          insertIdx++;
          return {
            ...BLANK_ACC,
            ...enrichRow(r),
            id: r.id || `a_${uid()}`,
            accountNo: r.accountNo || `ACC-${year}-${String(maxSeq + insertIdx).padStart(3, '0')}`,
            status: r.status || "Prospect",
          };
        });
        setAccounts(p => {
          const withUpdates = applyUpdates(p, updates.map(enrichRow));
          return [...withUpdates, ...enrichedInserts];
        });
      } break;

      case "Contacts": {
        const maxSeq = contacts.reduce((max, c) => {
          const m = c.contactId?.match(/CON-(\d+)/);
          return m ? Math.max(max, parseInt(m[1])) : max;
        }, 0);
        let insertIdx = 0;
        const enrichedInserts = inserts.map(r => {
          const matchedAccount = !r.accountId && r.company
            ? accounts.find(a => a.name?.toLowerCase().trim() === r.company?.toLowerCase().trim()) : null;
          insertIdx++;
          return {
            ...strip(r),
            contactId: r.contactId || `CON-${String(maxSeq + insertIdx).padStart(3, '0')}`,
            accountId: r.accountId || matchedAccount?.id || "",
          };
        });
        setContacts(p => {
          const withUpdates = applyUpdates(p, updates.map(strip));
          return [...withUpdates, ...enrichedInserts];
        });
      } break;

      case "Collections": {
        const enrichCollection = r => ({
          ...strip(r),
          billedAmount:    Number(r.billedAmount)    || 0,
          collectedAmount: Number(r.collectedAmount) || 0,
          pendingAmount:   Number(r.pendingAmount)   || 0,
          gstAmount:       Number(r.gstAmount)       || 0,
          tdsAmount:       Number(r.tdsAmount)       || 0,
          netPayable:      Number(r.netPayable)      || 0,
        });
        setCollections(p => {
          const withUpdates = applyUpdates(p, updates.map(enrichCollection));
          return [...withUpdates, ...inserts.map(enrichCollection)];
        });
      } break;

      case "Support Tickets": {
        const maxSeq = tickets.reduce((max, t) => {
          const m = t.ticketNo?.match(/TKT-\d+-(\d+)/);
          return m ? Math.max(max, parseInt(m[1])) : max;
        }, 0);
        let insertIdx = 0;
        const enrichedInserts = inserts.map(r => {
          insertIdx++;
          return {
            ...BLANK_TKT, ...strip(r),
            ticketNo: r.ticketNo || `TKT-${year}-${String(maxSeq + insertIdx).padStart(3, '0')}`,
          };
        });
        setTickets(p => {
          const withUpdates = applyUpdates(p, updates.map(strip));
          return [...withUpdates, ...enrichedInserts];
        });
      } break;

      case "Contracts": {
        const enrichContract = r => ({
          ...strip(r),
          value:          Number(r.value)          || 0,
          griPercentage:  Number(r.griPercentage)  || 0,
          noOfUsers:      Number(r.noOfUsers)      || 0,
          noOfBranches:   Number(r.noOfBranches)   || 0,
          warrantyMonths: Number(r.warrantyMonths) || 0,
        });
        const maxSeq = contracts.reduce((max, c) => {
          const m = c.contractNo?.match(/CTR-\d+-(\d+)/);
          return m ? Math.max(max, parseInt(m[1])) : max;
        }, 0);
        let insertIdx = 0;
        const enrichedInserts = inserts.map(r => {
          insertIdx++;
          return {
            ...BLANK_CONTRACT, ...enrichContract(r),
            id: r.id || `ctr_${uid()}`,
            contractNo: r.contractNo || `CTR-${year}-${String(maxSeq + insertIdx).padStart(3, '0')}`,
          };
        });
        setContracts(p => {
          const withUpdates = applyUpdates(p, updates.map(enrichContract));
          return [...withUpdates, ...enrichedInserts];
        });
      } break;

      case "Invoices": {
        const maxSeq = invoices.reduce((max, inv) => {
          const m = inv.invoiceNo?.match(/INV-\d+-(\d+)/);
          return m ? Math.max(max, parseInt(m[1])) : max;
        }, 0);
        let insertIdx = 0;
        const enrichedInserts = inserts.map(r => {
          insertIdx++;
          const acct = !r.accountId && r.accountNo
            ? accounts.find(a => a.accountNo === r.accountNo || a.id === r.accountNo) : null;
          return {
            ...BLANK_INVOICE, ...strip(r),
            id: r.id || `inv_${uid()}`,
            invoiceNo: r.invoiceNo || `INV-${year}-${String(maxSeq + insertIdx).padStart(3, '0')}`,
            accountId: r.accountId || acct?.id || "",
            billedAmount:    Number(r.billedAmount)    || 0,
            gstAmount:       Number(r.gstAmount)       || 0,
            tdsAmount:       Number(r.tdsAmount)       || 0,
            netPayable:      Number(r.netPayable)      || 0,
            collectedAmount: Number(r.collectedAmount) || 0,
            pendingAmount:   Number(r.pendingAmount)   || 0,
          };
        });
        setInvoices(p => {
          const withUpdates = applyUpdates(p, updates.map(r => ({
            ...strip(r),
            billedAmount:    Number(r.billedAmount)    || 0,
            gstAmount:       Number(r.gstAmount)       || 0,
            tdsAmount:       Number(r.tdsAmount)       || 0,
            netPayable:      Number(r.netPayable)      || 0,
            collectedAmount: Number(r.collectedAmount) || 0,
            pendingAmount:   Number(r.pendingAmount)   || 0,
          })));
          return [...withUpdates, ...enrichedInserts];
        });
      } break;

      case "Pipeline": {
        // Resolve products: "iCAFFE;WiseCargo" → ["iCAFFE","WiseCargo"]
        const resolveProducts = (raw) => {
          if (!raw) return [];
          if (Array.isArray(raw)) return raw;
          return String(raw).split(/[;,]/).map(s => s.trim()).filter(Boolean);
        };
        const resolveOwner = (raw) => {
          if (!raw?.trim()) return "";
          const match = orgUsers.find(u =>
            u.name?.toLowerCase() === raw.toLowerCase() ||
            u.email?.toLowerCase() === raw.toLowerCase() ||
            u.id === raw
          );
          return match?.id || raw;
        };
        const resolveAccount = (row) => {
          if (row.accountId && accounts.find(a => a.id === row.accountId)) return row.accountId;
          // try matching by accountNo
          const acct = row.accountId ? accounts.find(a => a.accountNo === row.accountId) : null;
          return acct?.id || row.accountId || "";
        };
        const enrichOpp = (r) => ({
          ...strip(r),
          products:    resolveProducts(r.products),
          owner:       resolveOwner(r.owner),
          accountId:   resolveAccount(r),
          value:       Number(r.value)       || 0,
          probability: Number(r.probability) || 0,
        });

        const maxSeq = opps.reduce((max, o) => {
          const m = o.oppNo?.match(/OPP-\d+-(\d+)/);
          return m ? Math.max(max, parseInt(m[1])) : max;
        }, 0);
        let insertIdx = 0;
        const enrichedInserts = inserts.map(r => {
          insertIdx++;
          return {
            ...BLANK_OPP,
            ...enrichOpp(r),
            id: r.id || `opp_${uid()}`,
            oppNo: r.oppNo || `OPP-${year}-${String(maxSeq + insertIdx).padStart(3, '0')}`,
            stage: r.stage || "Prospect",
            createdDate: r.createdDate || today,
          };
        });
        setOpps(p => {
          const withUpdates = applyUpdates(p, updates.map(enrichOpp));
          return [...withUpdates, ...enrichedInserts];
        });
      } break;
    }
  }, [accounts, contacts, leads, tickets, contracts, collections, invoices, opps, orgUsers]);

  if(!currentUser) return (
    <><style dangerouslySetInnerHTML={{__html:CSS}}/><ToastContainer /><Login onLogin={login} orgUsers={orgUsers}/></>
  );

  // Show a lightweight loading screen while the initial cloud hydration runs.
  // Without this, the app renders an empty UI for several seconds on slow
  // connections and users see "no data" until loadAllData() resolves.
  if (!dbReady) return (
    <>
      <style dangerouslySetInnerHTML={{__html:CSS}}/>
      <ToastContainer />
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",flexDirection:"column",gap:14,fontFamily:"'DM Sans',sans-serif"}}>
        <div style={{width:36,height:36,border:"3px solid #E2E8F0",borderTopColor:"#1B6B5A",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
        <div style={{color:"#64748B",fontSize:13}}>Loading your data…</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </>
  );

  return (
    <ErrorBoundary>
      <style dangerouslySetInnerHTML={{__html:CSS}}/>
      <ToastContainer />
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="app">
        <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} tickets={visibleTickets} leads={visibleLeads} collections={visibleCollections} currentUser={currentUser} onLogout={logout} orgUsers={orgUsers} customPermissions={customPermissions} myUnreadCount={myUnreadCount} canRestore={canRestore}/>
        <div className="main">
          <Header page={page} accounts={visibleAccounts} contacts={visibleContacts} opps={visibleOpps} tickets={visibleTickets} activities={visibleActivities} leads={visibleLeads} setPage={setPage} currentUser={currentUser} onLogout={logout} orgUsers={orgUsers} updates={visibleUpdates} myUnreadCount={myUnreadCount}/>
          <div className="content" id="main-content" role="main">
            {page==="dashboard"  && <Dashboard accounts={visibleAccounts} contacts={visibleContacts} opps={visibleOpps} tickets={visibleTickets} activities={visibleActivities} leads={visibleLeads} callReports={visibleCallReports} collections={visibleCollections} targets={visibleTargets} setPage={setPage} orgUsers={orgUsers}/>}
            {page==="leads"      && <Leads leads={visibleLeads} setLeads={setLeads} accounts={visibleAccounts} contacts={visibleContacts} setContacts={setContacts} currentUser={currentUser} onConvertToOpp={convertLeadToOpp} orgUsers={orgUsers} activities={visibleActivities} setActivities={setActivities} callReports={visibleCallReports} setCallReports={setCallReports} masters={masters} catalog={catalog} canDelete={canDelete}/>}
            {page==="accounts"   && <Accounts accounts={visibleAccounts} setAccounts={setAccounts} onDeleteAccount={cascadeDeleteAccount} opps={visibleOpps} activities={visibleActivities} setActivities={setActivities} notes={notes} files={files} onAddNote={addNote} onAddFile={addFile} currentUser={currentUser} contacts={visibleContacts} setContacts={setContacts} tickets={visibleTickets} contracts={visibleContracts} collections={visibleCollections} leads={visibleLeads} orgUsers={orgUsers} callReports={visibleCallReports} setCallReports={setCallReports} masters={masters} catalog={catalog} canDelete={canDelete}/>}
            {page==="contacts"   && <Contacts contacts={visibleContacts} setContacts={setContacts} onDeleteContact={cascadeDeleteContact} accounts={visibleAccounts} opps={visibleOpps} activities={visibleActivities} canDelete={canDelete}/>}
            {page==="pipeline"   && <Pipeline opps={visibleOpps} setOpps={setOpps} onDeleteOpp={cascadeDeleteOpp} accounts={visibleAccounts} contacts={visibleContacts} setContacts={setContacts} leads={visibleLeads} notes={notes} onAddNote={addNote} files={files} onAddFile={addFile} currentUser={currentUser} activities={visibleActivities} setActivities={setActivities} callReports={visibleCallReports} setCallReports={setCallReports} orgUsers={orgUsers} masters={masters} catalog={catalog} onDealWon={handleDealWon} canDelete={canDelete}/>}
            {page==="activities" && <Activities activities={visibleActivities} setActivities={setActivities} accounts={visibleAccounts} contacts={visibleContacts} opps={visibleOpps} currentUser={currentUser} files={files} onAddFile={addFile} orgUsers={orgUsers} canDelete={canDelete}/>}
            {page==="callreports"&& <CallReports callReports={visibleCallReports} setCallReports={setCallReports} accounts={visibleAccounts} contacts={visibleContacts} opps={visibleOpps} currentUser={currentUser} orgUsers={orgUsers} canDelete={canDelete} catalog={catalog}/>}
            {page==="tickets"    && <Tickets tickets={visibleTickets} setTickets={setTickets} accounts={visibleAccounts} orgUsers={orgUsers} currentUser={currentUser} canDelete={canDelete} catalog={catalog}/>}
            {page==="contracts"  && <Contracts contracts={visibleContracts} setContracts={setContracts} accounts={visibleAccounts} opps={visibleOpps} currentUser={currentUser} orgUsers={orgUsers} catalog={catalog} canDelete={canDelete}/>}
            {page==="collections"&& <Collections collections={visibleCollections} setCollections={setCollections} accounts={visibleAccounts} contracts={visibleContracts} currentUser={currentUser} orgUsers={orgUsers} canDelete={canDelete}/>}
            {page==="quotations" && <Quotations quotes={visibleQuotes} setQuotes={setQuotes} accounts={visibleAccounts} contacts={visibleContacts} opps={visibleOpps} currentUser={currentUser} orgUsers={orgUsers} catalog={catalog} canDelete={canDelete}/>}
            {page==="calendar"   && <CalendarView events={visibleEvents} setEvents={setEvents} activities={visibleActivities} setActivities={setActivities} callReports={visibleCallReports} setCallReports={setCallReports} leads={visibleLeads} accounts={visibleAccounts} contacts={visibleContacts} opps={visibleOpps} currentUser={currentUser} orgUsers={orgUsers} canDelete={canDelete}/>}
            {page==="communications"&& <CommLog commLogs={visibleCommLogs} setCommLogs={setCommLogs} accounts={visibleAccounts} contacts={visibleContacts} opps={visibleOpps} currentUser={currentUser} canDelete={canDelete}/>}
            {page==="targets"    && <Targets targets={visibleTargets} setTargets={setTargets} currentUser={currentUser} canDelete={canDelete}/>}
            {page==="reports"    && <Reports accounts={visibleAccounts} opps={visibleOpps} tickets={visibleTickets} activities={visibleActivities} leads={visibleLeads} callReports={visibleCallReports} collections={visibleCollections} targets={visibleTargets} contacts={visibleContacts} contracts={visibleContracts} quotes={visibleQuotes} currentUser={currentUser} orgUsers={orgUsers}/>}
            {page==="updates"    && <Updates updates={visibleUpdates} setUpdates={setUpdates} currentUser={currentUser} orgUsers={orgUsers}/>}
            {page==="help"       && <Help currentPage={page}/>}
            {page==="bulkupload" && <BulkUpload onUpload={handleBulkUpload} catalog={catalog} existingData={{ leads: visibleLeads, accounts: visibleAccounts, contacts: visibleContacts, collections: visibleCollections, tickets: visibleTickets, contracts: visibleContracts, invoices: visibleInvoices, opps: visibleOpps }}/>}
            {page==="masters"    && <Masters masters={masters} setMasters={setMasters} catalog={catalog} setCatalog={setCatalog}/>}
            {page==="org"        && <OrgHierarchy org={org} setOrg={setOrg} users={orgUsers} orgUsers={orgUsers}/>}
            {page==="team"       && <TeamUsers teams={teams} setTeams={setTeams} orgUsers={orgUsers} setOrgUsers={setOrgUsers} org={org} currentUser={currentUser} customPermissions={customPermissions} setCustomPermissions={setCustomPermissions}/>}
            {page==="profile"    && <Profile currentUser={currentUser} orgUsers={orgUsers} setOrgUsers={setOrgUsers}/>}
            {page==="trash"      && <Trash canRestore={canRestore} currentUser={currentUser} orgUsers={orgUsers} sources={[
              { key:"leads",       label:"Leads",        items:leads,        setter:setLeads,        getName:r=>r.company||r.contact||r.name, getMeta:r=>[r.contact, r.email].filter(Boolean).join(" · ") },
              { key:"accounts",    label:"Accounts",     items:accounts,     setter:setAccounts,     getName:r=>r.name,                       getMeta:r=>[r.industry, r.country].filter(Boolean).join(" · ") },
              { key:"contacts",    label:"Contacts",     items:contacts,     setter:setContacts,     getName:r=>r.name,                       getMeta:r=>[r.designation, r.email].filter(Boolean).join(" · ") },
              { key:"opps",        label:"Pipeline",     items:opps,         setter:setOpps,         getName:r=>r.name||r.oppNo,              getMeta:r=>[r.stage, r.value!=null?`$${r.value}`:""].filter(Boolean).join(" · ") },
              { key:"activities",  label:"Activities",   items:activities,   setter:setActivities,   getName:r=>r.title||r.subject,           getMeta:r=>[r.type, r.date].filter(Boolean).join(" · ") },
              { key:"callReports", label:"Call Reports", items:callReports,  setter:setCallReports,  getName:r=>r.subject||r.title||r.id,     getMeta:r=>[r.callType, r.date].filter(Boolean).join(" · ") },
              { key:"tickets",     label:"Tickets",      items:tickets,      setter:setTickets,      getName:r=>r.title,                      getMeta:r=>[r.status, r.priority].filter(Boolean).join(" · ") },
              { key:"contracts",   label:"Contracts",    items:contracts,    setter:setContracts,    getName:r=>r.contractNo||r.title||r.id,  getMeta:r=>[r.status, r.value!=null?`$${r.value}`:""].filter(Boolean).join(" · ") },
              { key:"collections", label:"Collections",  items:collections,  setter:setCollections,  getName:r=>r.invoiceNo||r.id,            getMeta:r=>[r.status, r.amount!=null?`$${r.amount}`:""].filter(Boolean).join(" · ") },
              { key:"quotes",      label:"Quotations",   items:quotes,       setter:setQuotes,       getName:r=>r.quoteNo||r.title||r.id,     getMeta:r=>[r.status, r.total!=null?`$${r.total}`:""].filter(Boolean).join(" · ") },
              { key:"events",      label:"Calendar",     items:events,       setter:setEvents,       getName:r=>r.title,                      getMeta:r=>[r.type, r.date].filter(Boolean).join(" · ") },
              { key:"commLogs",    label:"Communications",items:commLogs,    setter:setCommLogs,     getName:r=>r.subject||r.channel||r.id,   getMeta:r=>[r.channel, r.date].filter(Boolean).join(" · ") },
              { key:"targets",     label:"Targets",      items:targets,      setter:setTargets,      getName:r=>r.name||r.period||r.id,       getMeta:r=>[r.period, r.amount!=null?`$${r.amount}`:""].filter(Boolean).join(" · ") },
              { key:"updates",     label:"Updates",      items:updates,      setter:setUpdates,      getName:r=>r.title||r.id,                getMeta:r=>[r.type, r.date].filter(Boolean).join(" · ") },
              { key:"invoices",    label:"Invoices",     items:invoices,     setter:setInvoices,     getName:r=>r.invoiceNo||r.id,            getMeta:r=>[r.status, r.amount!=null?`$${r.amount}`:""].filter(Boolean).join(" · ") },
            ]}/>}
          </div>
        </div>
        <QuickLogFAB accounts={accounts} contacts={contacts} opps={visibleOpps} leads={visibleLeads} orgUsers={orgUsers} currentUser={currentUser} callReports={visibleCallReports} setCallReports={setCallReports} activities={visibleActivities} setActivities={setActivities} masters={masters}/>
        {/* Floating Help Button — always visible, bottom-left */}
        {page !== "help" && (
          <button className="help-fab" onClick={() => setPage("help")} title="Open Help & User Guide">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span className="help-fab-tooltip">Help & Guide</span>
          </button>
        )}
      </div>
    </ErrorBoundary>
  );
}
