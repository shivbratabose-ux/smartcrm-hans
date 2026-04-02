import { useState, useMemo, useEffect, useCallback, useRef } from "react";

// Data & Utils
import { INIT_USERS, PROD_MAP, STAGE_PROB, INIT_USER_PASSWORDS } from "./data/constants";
import {
  INIT_ACCOUNTS, INIT_CONTACTS, INIT_OPPS, INIT_ACTIVITIES,
  INIT_TICKETS, INIT_NOTES, INIT_FILES, INIT_MASTERS,
  INIT_PRODUCT_CATALOG, INIT_ORG, INIT_TEAMS,
  INIT_LEADS, INIT_CALL_REPORTS, INIT_CONTRACTS, INIT_COLLECTIONS, INIT_TARGETS,
  INIT_QUOTES, INIT_COMM_LOGS, INIT_EVENTS
} from "./data/seed";
import { loadState, saveState, ErrorBoundary, today, uid } from "./utils/helpers";
import { CSS } from "./styles";

// Supabase integration
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { loadAllData, subscribeToAll, signOut as supabaseSignOut, seedSupabase, insertRecord, updateRecord, deleteRecord } from "./lib/db";

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

export default function SmartCRM() {
  const saved = useMemo(() => loadState(), []);
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
  const [userPasswords,setUserPasswords] = useState(saved?.userPasswords || INIT_USER_PASSWORDS);
  // New CRM modules
  const [leads,setLeads]             = useState(saved?.leads || INIT_LEADS);
  const [callReports,setCallReports] = useState(saved?.callReports || INIT_CALL_REPORTS);
  const [contracts,setContracts]     = useState(saved?.contracts || INIT_CONTRACTS);
  const [collections,setCollections] = useState(saved?.collections || INIT_COLLECTIONS);
  const [targets,setTargets]         = useState(saved?.targets || INIT_TARGETS);
  const [quotes,setQuotes]           = useState(saved?.quotes || INIT_QUOTES);
  const [commLogs,setCommLogs]       = useState(saved?.commLogs || INIT_COMM_LOGS);
  const [events,setEvents]           = useState(saved?.events || INIT_EVENTS);
  const [customPermissions,setCustomPermissions] = useState(saved?.customPermissions || {});

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
  const prevRef = useRef({});
  const syncModules = useMemo(() => ({
    accounts, contacts, opps, activities, tickets, leads, callReports,
    contracts, collections, targets, quotes, commLogs, events, notes, files,
    users: orgUsers,
  }), [accounts,contacts,opps,activities,tickets,leads,callReports,contracts,collections,targets,quotes,commLogs,events,notes,files,orgUsers]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const prev = prevRef.current;
    for (const [module, next] of Object.entries(syncModules)) {
      const old = prev[module];
      if (!old || old === next || !Array.isArray(next) || !Array.isArray(old)) continue;
      const prevIds = new Set(old.map(r => r.id));
      const nextIds = new Set(next.map(r => r.id));
      // Inserts
      next.forEach(r => { if (r.id && !prevIds.has(r.id)) insertRecord(module === "users" ? "users" : module, r); });
      // Deletes
      old.forEach(r => { if (r.id && !nextIds.has(r.id)) deleteRecord(module === "users" ? "users" : module, r.id); });
      // Updates — only compare records that exist in both
      next.forEach(r => {
        if (r.id && prevIds.has(r.id)) {
          const o = old.find(p => p.id === r.id);
          if (o && JSON.stringify(o) !== JSON.stringify(r)) updateRecord(module === "users" ? "users" : module, r.id, r);
        }
      });
    }
    prevRef.current = { ...syncModules };
  }, [syncModules]);

  // ── Supabase: Load data from cloud on mount ──
  const [dbReady, setDbReady] = useState(!isSupabaseConfigured);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    loadAllData().then(data => {
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
    });
    // Also load users from Supabase to get latest roles/profiles
    supabase.from("users").select("*").then(({data: dbUsers}) => {
      if (dbUsers?.length) {
        const mapped = dbUsers.map(u => ({
          id: u.id, name: u.name, email: u.email, initials: u.initials,
          role: u.role, lob: u.lob, country: u.country, active: u.active,
          branchId: u.branch_id, deptId: u.dept_id, joinDate: u.join_date,
          authUserId: u.auth_user_id,
        }));
        setOrgUsers(mapped);
      }
    });
  }, []);

  // ── Supabase: Realtime subscriptions ──
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const makeHandler = (setter) => ({ type, record, oldRecord }) => {
      if (type === "INSERT") setter(p => [...p, record]);
      else if (type === "UPDATE") setter(p => p.map(r => r.id === record.id ? record : r));
      else if (type === "DELETE") setter(p => p.filter(r => r.id !== oldRecord?.id));
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

  // ── Expose seed function for admin migration ──
  useEffect(() => {
    if (isSupabaseConfigured) {
      window.__seedSupabase = () => seedSupabase({
        accounts: INIT_ACCOUNTS, contacts: INIT_CONTACTS, opps: INIT_OPPS,
        activities: INIT_ACTIVITIES, tickets: INIT_TICKETS, leads: INIT_LEADS,
        callReports: INIT_CALL_REPORTS, contracts: INIT_CONTRACTS,
        collections: INIT_COLLECTIONS, targets: INIT_TARGETS, quotes: INIT_QUOTES,
        commLogs: INIT_COMM_LOGS, events: INIT_EVENTS, notes: INIT_NOTES, files: INIT_FILES,
      });
    }
  }, []);

  // Persist all data to localStorage on every change (works as primary store without Supabase, backup with Supabase)
  useEffect(() => {
    saveState({ accounts, contacts, opps, activities, tickets, notes, files, masters, catalog, org, teams, orgUsers, userPasswords,
      leads, callReports, contracts, collections, targets, quotes, commLogs, events, customPermissions });
  }, [accounts, contacts, opps, activities, tickets, notes, files, masters, catalog, org, teams, orgUsers, userPasswords,
    leads, callReports, contracts, collections, targets, quotes, commLogs, events, customPermissions]);

  const addNote = note => setNotes(p=>[...p,note]);
  const addFile = file => setFiles(p=>[...p,file]);
  const logout  = () => { if(isSupabaseConfigured) supabaseSignOut(); clearSession(); setCurrentUser(null); setPage("dashboard"); };

  // Cascade delete: remove all linked records when an account is deleted
  const cascadeDeleteAccount = useCallback((accId) => {
    setAccounts(p => p.filter(a => a.id !== accId).map(a => a.parentId === accId ? {...a, parentId: ""} : a));
    setContacts(p => p.filter(c => c.accountId !== accId));
    setOpps(p => p.filter(o => o.accountId !== accId));
    setActivities(p => p.filter(a => a.accountId !== accId));
    setTickets(p => p.filter(t => t.accountId !== accId));
    setNotes(p => p.filter(n => !(n.recordType === "account" && n.recordId === accId)));
    setFiles(p => p.map(f => ({...f, linkedTo: f.linkedTo.filter(l => !(l.type === "account" && l.id === accId))})));
    setContracts(p => p.filter(c => c.accountId !== accId));
    setCollections(p => p.filter(c => c.accountId !== accId));
    setCallReports(p => p.filter(r => r.accountId !== accId));
  }, []);

  // Cascade delete: remove linked activities/notes/files when an opportunity is deleted
  const cascadeDeleteOpp = useCallback((oppId) => {
    setOpps(p => p.filter(o => o.id !== oppId));
    setActivities(p => p.map(a => a.oppId === oppId ? {...a, oppId: ""} : a));
    setNotes(p => p.filter(n => !(n.recordType === "opp" && n.recordId === oppId)));
    setFiles(p => p.map(f => ({...f, linkedTo: f.linkedTo.filter(l => !(l.type === "opp" && l.id === oppId))})));
    setContracts(p => p.map(c => c.oppId === oppId ? {...c, oppId: ""} : c));
  }, []);

  // Cascade delete: unlink activities when a contact is deleted
  const cascadeDeleteContact = useCallback((conId) => {
    setContacts(p => p.filter(c => c.id !== conId));
    setActivities(p => p.map(a => a.contactId === conId ? {...a, contactId: ""} : a));
    setCallReports(p => p.map(cr => cr.contactId === conId ? {...cr, contactId: ""} : cr));
    setLeads(p => p.map(l => l.contactIds?.includes(conId) ? {...l, contactIds: l.contactIds.filter(id => id !== conId)} : l));
    setOpps(p => p.map(o => {
      let changed = false, up = {...o};
      if (o.primaryContactId === conId) { up.primaryContactId = ""; changed = true; }
      if (o.secondaryContactIds?.includes(conId)) { up.secondaryContactIds = o.secondaryContactIds.filter(id => id !== conId); changed = true; }
      return changed ? up : o;
    }));
  }, []);

  // Deal Won → Customer: auto-create or update account
  const handleDealWon = useCallback((opp) => {
    if (opp.accountId) {
      // Update existing account: mark Active, add products
      setAccounts(p => p.map(a => a.id === opp.accountId ? {
        ...a,
        status: "Active",
        products: [...new Set([...(a.products || []), ...(opp.products || [])])],
        arrRevenue: (a.arrRevenue || 0) + (opp.value || 0),
      } : a));
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

  // Bulk upload handler — matches leads→accounts, contacts→accounts by name/email
  // Also auto-creates Contact records from lead contact info
  const handleBulkUpload = useCallback((type, records) => {
    switch(type) {
      case "Leads": {
        // First, build new contacts from leads that don't match existing ones
        const newContacts = [];
        const conMaxSeq = contacts.reduce((max, c) => {
          const m = c.contactId?.match(/CON-(\d+)/);
          return m ? Math.max(max, parseInt(m[1])) : max;
        }, 0);
        let conSeq = conMaxSeq;

        const year = new Date().getFullYear();
        const maxSeq = leads.reduce((max, l) => {
          const m = l.leadId?.match(/#FL-\d+-(\d+)/);
          return m ? Math.max(max, parseInt(m[1])) : max;
        }, 0);

        const enriched = records.map((r, i) => {
          const matchedAccount = accounts.find(a => a.name?.toLowerCase().trim() === r.company?.toLowerCase().trim());
          const acctId = r.accountId || matchedAccount?.id || "";
          // Try matching existing contact by email
          let matchedContact = r.email ? contacts.find(c => c.email?.toLowerCase() === r.email?.toLowerCase()) : null;
          // Also check newly created contacts in this batch
          if (!matchedContact && r.email) {
            matchedContact = newContacts.find(c => c.email?.toLowerCase() === r.email?.toLowerCase());
          }
          let contactId = matchedContact?.id || "";
          // Auto-create contact if we have name+email and no match
          if (!contactId && r.contact && r.email) {
            conSeq++;
            const newCon = {
              id: `c_${uid()}`,
              contactId: `CON-${String(conSeq).padStart(3, '0')}`,
              name: r.contact,
              email: r.email,
              phone: r.phone || "",
              designation: r.designation || "",
              department: r.department || "",
              role: "End User",
              accountId: acctId,
              linkedOpps: [],
              products: r.product ? [r.product] : [],
            };
            newContacts.push(newCon);
            contactId = newCon.id;
          }
          return {
            ...r,
            leadId: r.leadId || `#FL-${year}-${String(maxSeq + i + 1).padStart(3, '0')}`,
            score: Math.max(0, Math.min(100, Number(r.score) || 30)),
            createdDate: r.createdDate || today,
            stage: r.stage || "MQL",
            accountId: acctId,
            contactIds: contactId ? [contactId] : [],
            temperature: Number(r.score) >= 70 ? "Hot" : Number(r.score) >= 40 ? "Warm" : "Cool",
          };
        });
        // Add new contacts to contacts state
        if (newContacts.length) setContacts(p => [...p, ...newContacts]);
        setLeads(p => [...p, ...enriched]);
      } break;
      case "Customers": setAccounts(p => {
        const year = new Date().getFullYear();
        const maxSeq = p.reduce((max, a) => {
          const m = a.accountNo?.match(/ACC-\d+-(\d+)/);
          return m ? Math.max(max, parseInt(m[1])) : max;
        }, 0);
        const enriched = records.map((r, i) => ({
          ...r,
          accountNo: r.accountNo || `ACC-${year}-${String(maxSeq + i + 1).padStart(3, '0')}`,
          status: r.status || "Active",
        }));
        return [...p, ...enriched];
      }); break;
      case "Contacts": setContacts(p => {
        const maxSeq = p.reduce((max, c) => {
          const m = c.contactId?.match(/CON-(\d+)/);
          return m ? Math.max(max, parseInt(m[1])) : max;
        }, 0);
        const enriched = records.map((r, i) => {
          const matchedAccount = !r.accountId && r.company ? accounts.find(a => a.name?.toLowerCase().trim() === r.company?.toLowerCase().trim()) : null;
          return {
            ...r,
            contactId: r.contactId || `CON-${String(maxSeq + i + 1).padStart(3, '0')}`,
            accountId: r.accountId || matchedAccount?.id || "",
          };
        });
        return [...p, ...enriched];
      }); break;
      case "Collections": setCollections(p => [...p, ...records]); break;
      case "Support Tickets": setTickets(p => [...p, ...records]); break;
      case "Contracts": setContracts(p => [...p, ...records]); break;
    }
  }, [accounts, contacts, leads]);

  if(!currentUser) return (
    <><style dangerouslySetInnerHTML={{__html:CSS}}/><Login onLogin={login} orgUsers={orgUsers} userPasswords={userPasswords}/></>
  );

  return (
    <ErrorBoundary>
      <style dangerouslySetInnerHTML={{__html:CSS}}/>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="app">
        <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} tickets={tickets} leads={leads} collections={collections} currentUser={currentUser} onLogout={logout} orgUsers={orgUsers} customPermissions={customPermissions}/>
        <div className="main">
          <Header page={page} accounts={accounts} contacts={contacts} opps={opps} tickets={tickets} activities={activities} leads={leads} setPage={setPage} currentUser={currentUser} onLogout={logout} orgUsers={orgUsers}/>
          <div className="content" id="main-content" role="main">
            {page==="dashboard"  && <Dashboard accounts={accounts} contacts={contacts} opps={opps} tickets={tickets} activities={activities} leads={leads} callReports={callReports} collections={collections} targets={targets} setPage={setPage}/>}
            {page==="leads"      && <Leads leads={leads} setLeads={setLeads} accounts={accounts} contacts={contacts} setContacts={setContacts} currentUser={currentUser} onConvertToOpp={convertLeadToOpp} orgUsers={orgUsers} activities={activities} setActivities={setActivities} callReports={callReports} setCallReports={setCallReports} masters={masters}/>}
            {page==="accounts"   && <Accounts accounts={accounts} setAccounts={setAccounts} onDeleteAccount={cascadeDeleteAccount} opps={opps} activities={activities} setActivities={setActivities} notes={notes} files={files} onAddNote={addNote} onAddFile={addFile} currentUser={currentUser} contacts={contacts} setContacts={setContacts} tickets={tickets} contracts={contracts} collections={collections} leads={leads} orgUsers={orgUsers} callReports={callReports} setCallReports={setCallReports} masters={masters}/>}
            {page==="contacts"   && <Contacts contacts={contacts} setContacts={setContacts} onDeleteContact={cascadeDeleteContact} accounts={accounts} opps={opps} activities={activities}/>}
            {page==="pipeline"   && <Pipeline opps={opps} setOpps={setOpps} onDeleteOpp={cascadeDeleteOpp} accounts={accounts} contacts={contacts} setContacts={setContacts} leads={leads} notes={notes} onAddNote={addNote} files={files} onAddFile={addFile} currentUser={currentUser} activities={activities} setActivities={setActivities} callReports={callReports} setCallReports={setCallReports} orgUsers={orgUsers} masters={masters} onDealWon={handleDealWon}/>}
            {page==="activities" && <Activities activities={activities} setActivities={setActivities} accounts={accounts} contacts={contacts} opps={opps} currentUser={currentUser} files={files} onAddFile={addFile} orgUsers={orgUsers}/>}
            {page==="callreports"&& <CallReports callReports={callReports} setCallReports={setCallReports} accounts={accounts} contacts={contacts} opps={opps} currentUser={currentUser} orgUsers={orgUsers}/>}
            {page==="tickets"    && <Tickets tickets={tickets} setTickets={setTickets} accounts={accounts} orgUsers={orgUsers}/>}
            {page==="contracts"  && <Contracts contracts={contracts} setContracts={setContracts} accounts={accounts} opps={opps} currentUser={currentUser} orgUsers={orgUsers}/>}
            {page==="collections"&& <Collections collections={collections} setCollections={setCollections} accounts={accounts} contracts={contracts} currentUser={currentUser} orgUsers={orgUsers}/>}
            {page==="quotations" && <Quotations quotes={quotes} setQuotes={setQuotes} accounts={accounts} contacts={contacts} opps={opps} currentUser={currentUser} orgUsers={orgUsers}/>}
            {page==="calendar"   && <CalendarView events={events} setEvents={setEvents} accounts={accounts} contacts={contacts} opps={opps} currentUser={currentUser} orgUsers={orgUsers}/>}
            {page==="communications"&& <CommLog commLogs={commLogs} setCommLogs={setCommLogs} accounts={accounts} contacts={contacts} opps={opps} currentUser={currentUser}/>}
            {page==="targets"    && <Targets targets={targets} setTargets={setTargets} currentUser={currentUser}/>}
            {page==="reports"    && <Reports accounts={accounts} opps={opps} tickets={tickets} activities={activities} leads={leads} callReports={callReports} collections={collections} targets={targets} contacts={contacts} contracts={contracts} quotes={quotes} currentUser={currentUser}/>}
            {page==="bulkupload" && <BulkUpload onUpload={handleBulkUpload}/>}
            {page==="masters"    && <Masters masters={masters} setMasters={setMasters} catalog={catalog} setCatalog={setCatalog}/>}
            {page==="org"        && <OrgHierarchy org={org} setOrg={setOrg} users={orgUsers} orgUsers={orgUsers}/>}
            {page==="team"       && <TeamUsers teams={teams} setTeams={setTeams} orgUsers={orgUsers} setOrgUsers={setOrgUsers} org={org} currentUser={currentUser} userPasswords={userPasswords} setUserPasswords={setUserPasswords} customPermissions={customPermissions} setCustomPermissions={setCustomPermissions}/>}
            {page==="profile"    && <Profile currentUser={currentUser} orgUsers={orgUsers} setOrgUsers={setOrgUsers} userPasswords={userPasswords} setUserPasswords={setUserPasswords}/>}
          </div>
        </div>
        <QuickLogFAB accounts={accounts} contacts={contacts} opps={opps} leads={leads} orgUsers={orgUsers} currentUser={currentUser} callReports={callReports} setCallReports={setCallReports} activities={activities} setActivities={setActivities} masters={masters}/>
      </div>
    </ErrorBoundary>
  );
}
