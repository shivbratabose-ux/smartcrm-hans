import { useCallback } from "react";
import { useNavigate, Routes, Route, Navigate } from "react-router-dom";

// Data & Utils
import { PROD_MAP, STAGE_PROB } from "./data/constants";
import { today, ErrorBoundary } from "./utils/helpers";
import { CSS } from "./styles";

// Stores
import {
  useAuthStore,
  useAccountsStore,
  useContactsStore,
  useOppsStore,
  useActivitiesStore,
  useTicketsStore,
  useNotesStore,
  useFilesStore,
  useMastersStore,
  useOrgStore,
  useLeadsStore,
  useCallReportsStore,
  useContractsStore,
  useCollectionsStore,
  useTargetsStore,
  useQuotesStore,
  useCommLogsStore,
  useEventsStore,
} from "./stores";

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
  const navigate = useNavigate();

  // Auth store
  const { currentUser, collapsed, setCurrentUser, logout: storeLogout, setCollapsed } = useAuthStore();

  // Data stores
  const { accounts, setAccounts } = useAccountsStore();
  const { contacts, setContacts } = useContactsStore();
  const { opps, setOpps } = useOppsStore();
  const { activities, setActivities } = useActivitiesStore();
  const { tickets, setTickets } = useTicketsStore();
  const { notes, setNotes } = useNotesStore();
  const { files, setFiles } = useFilesStore();
  const { masters, setMasters, catalog, setCatalog } = useMastersStore();
  const { org, setOrg, teams, setTeams, orgUsers, setOrgUsers, userPasswords, setUserPasswords } = useOrgStore();
  const { leads, setLeads } = useLeadsStore();
  const { callReports, setCallReports } = useCallReportsStore();
  const { contracts, setContracts } = useContractsStore();
  const { collections, setCollections } = useCollectionsStore();
  const { targets, setTargets } = useTargetsStore();
  const { quotes, setQuotes } = useQuotesStore();
  const { commLogs, setCommLogs } = useCommLogsStore();
  const { events, setEvents } = useEventsStore();

  const addNote = note => setNotes(p => [...p, note]);
  const addFile = file => setFiles(p => [...p, file]);
  const logout = () => { storeLogout(); navigate("/dashboard"); };

  // Cascade delete: remove all linked records when an account is deleted
  const cascadeDeleteAccount = useCallback((accId) => {
    useAccountsStore.getState().setAccounts(p => p.filter(a => a.id !== accId));
    useContactsStore.getState().setContacts(p => p.filter(c => c.accountId !== accId));
    useOppsStore.getState().setOpps(p => p.filter(o => o.accountId !== accId));
    useActivitiesStore.getState().setActivities(p => p.filter(a => a.accountId !== accId));
    useTicketsStore.getState().setTickets(p => p.filter(t => t.accountId !== accId));
    useNotesStore.getState().setNotes(p => p.filter(n => !(n.recordType === "account" && n.recordId === accId)));
    useFilesStore.getState().setFiles(p => p.map(f => ({ ...f, linkedTo: f.linkedTo.filter(l => !(l.type === "account" && l.id === accId)) })));
    useContractsStore.getState().setContracts(p => p.filter(c => c.accountId !== accId));
    useCollectionsStore.getState().setCollections(p => p.filter(c => c.accountId !== accId));
    useCallReportsStore.getState().setCallReports(p => p.filter(r => r.accountId !== accId));
  }, []);

  // Cascade delete: remove linked activities/notes/files when an opportunity is deleted
  const cascadeDeleteOpp = useCallback((oppId) => {
    useOppsStore.getState().setOpps(p => p.filter(o => o.id !== oppId));
    useActivitiesStore.getState().setActivities(p => p.map(a => a.oppId === oppId ? { ...a, oppId: "" } : a));
    useNotesStore.getState().setNotes(p => p.filter(n => !(n.recordType === "opp" && n.recordId === oppId)));
    useFilesStore.getState().setFiles(p => p.map(f => ({ ...f, linkedTo: f.linkedTo.filter(l => !(l.type === "opp" && l.id === oppId)) })));
    useContractsStore.getState().setContracts(p => p.map(c => c.oppId === oppId ? { ...c, oppId: "" } : c));
  }, []);

  // Cascade delete: unlink activities when a contact is deleted
  const cascadeDeleteContact = useCallback((conId) => {
    useContactsStore.getState().setContacts(p => p.filter(c => c.id !== conId));
    useActivitiesStore.getState().setActivities(p => p.map(a => a.contactId === conId ? { ...a, contactId: "" } : a));
  }, []);

  // Convert lead to opportunity
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
    useOppsStore.getState().setOpps(p => [...p, newOpp]);
    useLeadsStore.getState().setLeads(p => p.map(l => l.id === lead.id ? { ...l, stage: "Converted", convertedDate: today, convertedOppId: newOpp.id } : l));
    useActivitiesStore.getState().setActivities(p => [...p, {
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
    }]);
    navigate("/pipeline");
  }, [navigate]);

  // Bulk upload handler
  const handleBulkUpload = useCallback((type, records) => {
    switch (type) {
      case "Leads": useLeadsStore.getState().setLeads(p => [...p, ...records]); break;
      case "Customers": useAccountsStore.getState().setAccounts(p => [...p, ...records]); break;
      case "Contacts": useContactsStore.getState().setContacts(p => [...p, ...records]); break;
      case "Collections": useCollectionsStore.getState().setCollections(p => [...p, ...records]); break;
      case "Support Tickets": useTicketsStore.getState().setTickets(p => [...p, ...records]); break;
      case "Contracts": useContractsStore.getState().setContracts(p => [...p, ...records]); break;
    }
  }, []);

  if (!currentUser) return (
    <Routes>
      <Route path="*" element={
        <><style dangerouslySetInnerHTML={{ __html: CSS }} /><Login onLogin={setCurrentUser} orgUsers={orgUsers} /></>
      } />
    </Routes>
  );

  return (
    <ErrorBoundary>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="app">
        <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} tickets={tickets} leads={leads} collections={collections} currentUser={currentUser} onLogout={logout} />
        <div className="main">
          <Header accounts={accounts} contacts={contacts} opps={opps} tickets={tickets} activities={activities} leads={leads} currentUser={currentUser} />
          <div className="content" id="main-content" role="main">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard accounts={accounts} contacts={contacts} opps={opps} tickets={tickets} activities={activities} leads={leads} callReports={callReports} collections={collections} targets={targets} setPage={p => navigate("/" + p)} />} />
              <Route path="/leads" element={<Leads leads={leads} setLeads={setLeads} accounts={accounts} contacts={contacts} currentUser={currentUser} onConvertToOpp={convertLeadToOpp} />} />
              <Route path="/accounts" element={<Accounts accounts={accounts} setAccounts={setAccounts} onDeleteAccount={cascadeDeleteAccount} opps={opps} activities={activities} notes={notes} files={files} onAddNote={addNote} onAddFile={addFile} currentUser={currentUser} contacts={contacts} tickets={tickets} contracts={contracts} collections={collections} leads={leads} />} />
              <Route path="/contacts" element={<Contacts contacts={contacts} setContacts={setContacts} onDeleteContact={cascadeDeleteContact} accounts={accounts} opps={opps} activities={activities} />} />
              <Route path="/pipeline" element={<Pipeline opps={opps} setOpps={setOpps} onDeleteOpp={cascadeDeleteOpp} accounts={accounts} contacts={contacts} leads={leads} notes={notes} onAddNote={addNote} files={files} onAddFile={addFile} currentUser={currentUser} activities={activities} setActivities={setActivities} callReports={callReports} />} />
              <Route path="/activities" element={<Activities activities={activities} setActivities={setActivities} accounts={accounts} contacts={contacts} opps={opps} currentUser={currentUser} files={files} onAddFile={addFile} />} />
              <Route path="/call-reports" element={<CallReports callReports={callReports} setCallReports={setCallReports} accounts={accounts} contacts={contacts} opps={opps} currentUser={currentUser} />} />
              <Route path="/tickets" element={<Tickets tickets={tickets} setTickets={setTickets} accounts={accounts} />} />
              <Route path="/contracts" element={<Contracts contracts={contracts} setContracts={setContracts} accounts={accounts} opps={opps} currentUser={currentUser} />} />
              <Route path="/collections" element={<Collections collections={collections} setCollections={setCollections} accounts={accounts} contracts={contracts} currentUser={currentUser} />} />
              <Route path="/quotations" element={<Quotations quotes={quotes} setQuotes={setQuotes} accounts={accounts} contacts={contacts} opps={opps} currentUser={currentUser} />} />
              <Route path="/calendar" element={<CalendarView events={events} setEvents={setEvents} accounts={accounts} contacts={contacts} opps={opps} currentUser={currentUser} />} />
              <Route path="/communications" element={<CommLog commLogs={commLogs} setCommLogs={setCommLogs} accounts={accounts} contacts={contacts} opps={opps} currentUser={currentUser} />} />
              <Route path="/targets" element={<Targets targets={targets} setTargets={setTargets} currentUser={currentUser} />} />
              <Route path="/reports" element={<Reports accounts={accounts} opps={opps} tickets={tickets} activities={activities} leads={leads} callReports={callReports} collections={collections} targets={targets} />} />
              <Route path="/bulk-upload" element={<BulkUpload onUpload={handleBulkUpload} />} />
              <Route path="/masters" element={<Masters masters={masters} setMasters={setMasters} catalog={catalog} setCatalog={setCatalog} />} />
              <Route path="/org" element={<OrgHierarchy org={org} setOrg={setOrg} users={orgUsers} />} />
              <Route path="/team" element={<TeamUsers teams={teams} setTeams={setTeams} orgUsers={orgUsers} setOrgUsers={setOrgUsers} org={org} currentUser={currentUser} userPasswords={userPasswords} setUserPasswords={setUserPasswords} />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}
