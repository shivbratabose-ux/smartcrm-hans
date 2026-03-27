import { useState, useMemo, useEffect, useCallback } from "react";

// Data & Utils
import { INIT_USERS, PROD_MAP, STAGE_PROB, INIT_USER_PASSWORDS } from "./data/constants";
import {
  INIT_ACCOUNTS, INIT_CONTACTS, INIT_OPPS, INIT_ACTIVITIES,
  INIT_TICKETS, INIT_NOTES, INIT_FILES, INIT_MASTERS,
  INIT_PRODUCT_CATALOG, INIT_ORG, INIT_TEAMS,
  INIT_LEADS, INIT_CALL_REPORTS, INIT_CONTRACTS, INIT_COLLECTIONS, INIT_TARGETS,
  INIT_QUOTES, INIT_COMM_LOGS, INIT_EVENTS
} from "./data/seed";
import { loadState, saveState, ErrorBoundary, today } from "./utils/helpers";
import { CSS } from "./styles";

// Supabase integration
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { loadAllData, subscribeToAll, signOut as supabaseSignOut, seedSupabase } from "./lib/db";

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

export default function SmartCRM() {
  const saved = useMemo(() => loadState(), []);
  const [currentUser,setCurrentUser] = useState(null);
  const [page,setPage]               = useState("dashboard");
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

  // Persist all data to localStorage on change (fallback mode)
  useEffect(() => {
    if (isSupabaseConfigured) return; // skip localStorage when using Supabase
    saveState({ accounts, contacts, opps, activities, tickets, notes, files, masters, catalog, org, teams, orgUsers, userPasswords,
      leads, callReports, contracts, collections, targets, quotes, commLogs, events, customPermissions });
  }, [accounts, contacts, opps, activities, tickets, notes, files, masters, catalog, org, teams, orgUsers, userPasswords,
    leads, callReports, contracts, collections, targets, quotes, commLogs, events, customPermissions]);

  const addNote = note => setNotes(p=>[...p,note]);
  const addFile = file => setFiles(p=>[...p,file]);
  const logout  = () => { if(isSupabaseConfigured) supabaseSignOut(); setCurrentUser(null); setPage("dashboard"); };

  // Cascade delete: remove all linked records when an account is deleted
  const cascadeDeleteAccount = useCallback((accId) => {
    setAccounts(p => p.filter(a => a.id !== accId));
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
  }, []);

  // Convert lead to opportunity — accepts conversion data from modal
  const convertLeadToOpp = useCallback((lead, conversionData) => {
    const data = conversionData || {};
    const newOpp = {
      id: `o_${Date.now()}`,
      title: data.title || `${PROD_MAP[lead.product]?.name || lead.product} – ${lead.company}`,
      accountId: data.accountId || lead.accountId || "",
      products: [lead.product],
      stage: "Qualified",
      value: data.value || 0,
      probability: STAGE_PROB["Qualified"] || 25,
      owner: data.owner || lead.assignedTo,
      closeDate: data.closeDate || "",
      country: data.country || (lead.region === "South Asia" ? "India" : ""),
      notes: `Converted from lead ${lead.leadId}. ${data.notes || lead.notes || ""}`,
      source: lead.accountId ? "Existing Customer – Upsell" : "New Lead",
      primaryContactId: data.primaryContactId || "",
      secondaryContactIds: data.secondaryOwners || [],
      hierarchyLevel: "Parent Company",
      leadId: lead.leadId || "",
      forecastCategory: data.forecastCategory || "Likely-Case",
      dealSize: data.dealSize || "Medium",
    };
    setOpps(p => [...p, newOpp]);
    // Mark lead as Converted (keep for history) instead of deleting
    setLeads(p => p.map(l => l.id === lead.id ? { ...l, stage: "Converted", convertedDate: today, convertedOppId: newOpp.id } : l));
    // Create initial activity for the new opportunity
    const initialAct = {
      id: `act_${Date.now()}`,
      type: "Call",
      status: "Completed",
      date: today,
      time: new Date().toTimeString().slice(0, 5),
      duration: 15,
      accountId: newOpp.accountId,
      contactId: newOpp.primaryContactId,
      oppId: newOpp.id,
      owner: newOpp.owner,
      title: `Lead Conversion – ${lead.company}`,
      notes: `Lead ${lead.leadId} converted to opportunity. Qualification: ${data.notes || lead.notes || "Initial qualification complete."}`,
      outcome: "Positive",
    };
    setActivities(p => [...p, initialAct]);
    setPage("pipeline");
  }, []);

  // Bulk upload handler
  const handleBulkUpload = useCallback((type, records) => {
    switch(type) {
      case "Leads": setLeads(p => [...p, ...records]); break;
      case "Customers": setAccounts(p => [...p, ...records]); break;
      case "Contacts": setContacts(p => [...p, ...records]); break;
      case "Collections": setCollections(p => [...p, ...records]); break;
      case "Support Tickets": setTickets(p => [...p, ...records]); break;
      case "Contracts": setContracts(p => [...p, ...records]); break;
    }
  }, []);

  if(!currentUser) return (
    <><style dangerouslySetInnerHTML={{__html:CSS}}/><Login onLogin={setCurrentUser} orgUsers={orgUsers} userPasswords={userPasswords}/></>
  );

  return (
    <ErrorBoundary>
      <style dangerouslySetInnerHTML={{__html:CSS}}/>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="app">
        <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} tickets={tickets} leads={leads} collections={collections} currentUser={currentUser} onLogout={logout} orgUsers={orgUsers} customPermissions={customPermissions}/>
        <div className="main">
          <Header page={page} accounts={accounts} contacts={contacts} opps={opps} tickets={tickets} activities={activities} leads={leads} setPage={setPage} currentUser={currentUser}/>
          <div className="content" id="main-content" role="main">
            {page==="dashboard"  && <Dashboard accounts={accounts} contacts={contacts} opps={opps} tickets={tickets} activities={activities} leads={leads} callReports={callReports} collections={collections} targets={targets} setPage={setPage}/>}
            {page==="leads"      && <Leads leads={leads} setLeads={setLeads} accounts={accounts} contacts={contacts} currentUser={currentUser} onConvertToOpp={convertLeadToOpp}/>}
            {page==="accounts"   && <Accounts accounts={accounts} setAccounts={setAccounts} onDeleteAccount={cascadeDeleteAccount} opps={opps} activities={activities} notes={notes} files={files} onAddNote={addNote} onAddFile={addFile} currentUser={currentUser} contacts={contacts} tickets={tickets} contracts={contracts} collections={collections} leads={leads}/>}
            {page==="contacts"   && <Contacts contacts={contacts} setContacts={setContacts} onDeleteContact={cascadeDeleteContact} accounts={accounts} opps={opps} activities={activities}/>}
            {page==="pipeline"   && <Pipeline opps={opps} setOpps={setOpps} onDeleteOpp={cascadeDeleteOpp} accounts={accounts} contacts={contacts} leads={leads} notes={notes} onAddNote={addNote} files={files} onAddFile={addFile} currentUser={currentUser} activities={activities} setActivities={setActivities} callReports={callReports}/>}
            {page==="activities" && <Activities activities={activities} setActivities={setActivities} accounts={accounts} contacts={contacts} opps={opps} currentUser={currentUser} files={files} onAddFile={addFile}/>}
            {page==="callreports"&& <CallReports callReports={callReports} setCallReports={setCallReports} accounts={accounts} contacts={contacts} opps={opps} currentUser={currentUser}/>}
            {page==="tickets"    && <Tickets tickets={tickets} setTickets={setTickets} accounts={accounts}/>}
            {page==="contracts"  && <Contracts contracts={contracts} setContracts={setContracts} accounts={accounts} opps={opps} currentUser={currentUser}/>}
            {page==="collections"&& <Collections collections={collections} setCollections={setCollections} accounts={accounts} contracts={contracts} currentUser={currentUser}/>}
            {page==="quotations" && <Quotations quotes={quotes} setQuotes={setQuotes} accounts={accounts} contacts={contacts} opps={opps} currentUser={currentUser}/>}
            {page==="calendar"   && <CalendarView events={events} setEvents={setEvents} accounts={accounts} contacts={contacts} opps={opps} currentUser={currentUser}/>}
            {page==="communications"&& <CommLog commLogs={commLogs} setCommLogs={setCommLogs} accounts={accounts} contacts={contacts} opps={opps} currentUser={currentUser}/>}
            {page==="targets"    && <Targets targets={targets} setTargets={setTargets} currentUser={currentUser}/>}
            {page==="reports"    && <Reports accounts={accounts} opps={opps} tickets={tickets} activities={activities} leads={leads} callReports={callReports} collections={collections} targets={targets} contacts={contacts} contracts={contracts} quotes={quotes} currentUser={currentUser}/>}
            {page==="bulkupload" && <BulkUpload onUpload={handleBulkUpload}/>}
            {page==="masters"    && <Masters masters={masters} setMasters={setMasters} catalog={catalog} setCatalog={setCatalog}/>}
            {page==="org"        && <OrgHierarchy org={org} setOrg={setOrg} users={orgUsers}/>}
            {page==="team"       && <TeamUsers teams={teams} setTeams={setTeams} orgUsers={orgUsers} setOrgUsers={setOrgUsers} org={org} currentUser={currentUser} userPasswords={userPasswords} setUserPasswords={setUserPasswords} customPermissions={customPermissions} setCustomPermissions={setCustomPermissions}/>}
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
