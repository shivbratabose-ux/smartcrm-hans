import { useState, useMemo } from "react";
import { Plus, Edit2, Trash2, Check, ChevronLeft, ChevronRight, Calendar, Clock, MapPin, Users, Phone, Video, Zap, X, CalendarOff } from "lucide-react";
import { PRODUCTS, TEAM, TEAM_MAP, EVENT_TYPES, EVENT_STATUSES, CALL_OUTCOMES } from '../data/constants';
import { BLANK_EVENT } from '../data/seed';
import { fmt, uid, today, toLocalISODate, sanitizeObj, hasErrors, softDeleteById, canEditRecord, hasPendingAccessReq, getScopedUserIds, isGlobalRole } from '../utils/helpers';
import TeamSummary from './TeamSummary';
import { teamColumns, callReportState, LEAVE_TYPES, LEAVE_STATUS, LEAVE_TYPE_LABEL, leaveTitleFor, leaveState, isLeaveType, leaveByUser, leaveDatesToCreate, offDayMap,
  canApproveLeave, initialLeaveStatus, lineManagerOf, groupLeaveRequests, pendingLeaveFor, fmtDays } from '../utils/teamSummary';
import { notify } from '../utils/toast';
import { notifyLeave } from '../utils/leaveNotify';
import { Lock } from 'lucide-react';
import { UserPill, Modal, Confirm, FormError, Empty, TypeaheadSelect } from './shared';

const TYPE_COL={"Call":"var(--brand)","Meeting":"var(--purple)","Demo":"var(--orange)","Follow-up":"var(--blue)","Site Visit":"var(--amber)","Presentation":"var(--teal)","Training":"var(--green)","Review":"#8B5CF6","Leave":"#B45309","Half-day leave":"#D97706","Admin day":"#6D28D9"};
const TYPE_ICON={"Call":<Phone size={12}/>,"Meeting":<Users size={12}/>,"Demo":<Zap size={12}/>,"Follow-up":<Clock size={12}/>,"Site Visit":<MapPin size={12}/>,"Presentation":<Video size={12}/>,"Training":<Calendar size={12}/>,"Review":<Check size={12}/>,"Leave":<CalendarOff size={12}/>,"Half-day leave":<CalendarOff size={12}/>,"Admin day":<CalendarOff size={12}/>};

const STATUS_COL={"Scheduled":"#3B82F6","Completed":"#22C55E","Cancelled":"#94A3B8","Rescheduled":"#F59E0B","No Show":"#EF4444","Planned":"#6366F1"};

const SOURCE_COL = { activity: "var(--purple)", call: "var(--brand)", event: undefined };

// Leave approval state → label + colour (see utils/teamSummary LEAVE_STATUS).
const LEAVE_STATE_UI = {
  pending:  { label: "Pending approval", col: "#D97706", bg: "#FFFBEB" },
  approved: { label: "Approved",         col: "#15803D", bg: "#F0FDF4" },
  rejected: { label: "Rejected",         col: "#B91C1C", bg: "#FEF2F2" },
  cancelled:{ label: "Cancelled",        col: "#64748B", bg: "var(--s2)" },
};

// Scheduled (not-yet-done) CALLS get their own colour so a planned call is
// instantly tellable from a logged one / other activities on the calendar.
const SCHEDULED_CALL_COL = "#DB2777";

const itemCol = (ev) => ev._leave
  ? (ev._leaveState === "approved" ? TYPE_COL[ev.type] : ev._leaveState === "pending" ? "#D97706" : "#94A3B8")
  : ev._scheduledCall ? SCHEDULED_CALL_COL : (SOURCE_COL[ev._source] || TYPE_COL[ev.type] || "var(--brand)");

function CalendarView({events,setEvents,activities=[],setActivities,callReports=[],setCallReports,leads=[],accounts,contacts,opps,currentUser,orgUsers,canDelete,commLogs=[],holidays=[],onRequestEditAccess}) {
  const canEditEvt = (e) => canEditRecord({ownerId:e?.owner,currentUser,orgUsers,recordType:"event",recordId:e?.id,commLogs});
  const requestAccessEvt = (e) => onRequestEditAccess && onRequestEditAccess("event", e.id, e.title||"Event", e.owner);
  const team = orgUsers?.length ? orgUsers.filter(u=>u.status!=='Inactive') : TEAM;
  const teamMap = Object.fromEntries(team.map(u=>[u.id,u]));
  const [viewDate,setViewDate]=useState(new Date(today));
  const [view,setView]=useState("week");
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState(BLANK_EVENT);
  const [confirm,setConfirm]=useState(null);
  const [formErrors,setFormErrors]=useState({});
  const [selectedEvent,setSelectedEvent]=useState(null);
  const [scheduleModal,setScheduleModal]=useState(false);
  const [scheduleForm,setScheduleForm]=useState({});
  // Source filter: show calls, activities, events, or everything together.
  const [sourceFilter,setSourceFilter]=useState("all");
  // ── Team layer (admins + managers) ──
  // Shown to anyone who actually has a team: global roles, or a manager
  // whose scope includes people reporting to them. A rep with no reports
  // never sees the toggle. Rows are the viewer's scope, nothing wider.
  const scopeIds = useMemo(() => getScopedUserIds(currentUser, orgUsers), [currentUser, orgUsers]);
  const canSeeTeam = isGlobalRole(currentUser, orgUsers) || scopeIds.size > 1;
  const [teamMode,setTeamMode]=useState("week");      // "week" | "month" buckets
  const [ownerFilter,setOwnerFilter]=useState("");    // set by clicking a name in Team view

  const year=viewDate.getFullYear(), month=viewDate.getMonth();
  const monthName=viewDate.toLocaleString("default",{month:"long",year:"numeric"});

  // Get week dates
  const getWeekDates=(d)=>{
    const start=new Date(d); start.setDate(start.getDate()-start.getDay()+1);
    return Array.from({length:7},(_,i)=>{const dt=new Date(start);dt.setDate(start.getDate()+i);return dt;});
  };
  const weekDates=useMemo(()=>getWeekDates(viewDate),[viewDate]);
  const weekLabel=`${weekDates[0].getDate()} ${weekDates[0].toLocaleString("default",{month:"short"})} – ${weekDates[6].getDate()} ${weekDates[6].toLocaleString("default",{month:"short",year:"numeric"})}`;

  // Calendar grid for month
  const monthDays=useMemo(()=>{
    const first=new Date(year,month,1);const last=new Date(year,month+1,0);
    const startDay=first.getDay()||7;
    const days=[];
    for(let i=1-startDay+1;i<=last.getDate();i++) days.push(i>0?new Date(year,month,i):null);
    while(days.length%7!==0) days.push(null);
    return days;
  },[year,month]);

  const dateStr=(d)=>d?toLocalISODate(d):"";

  // Unified list of all calendar items from all three sources
  const allItems = useMemo(() => {
    // Own calendar events
    // Leave entries are events too, flagged so they never read as pending
    // work. Cancelled leave is hidden; pending / rejected say so in the title.
    const evItems = events
      .filter(e => !(isLeaveType(e) && leaveState(e) === "cancelled"))
      .map(e => {
        if (!isLeaveType(e)) return { ...e, _source: "event" };
        const st = leaveState(e);
        return { ...e, _source: "event", _leave: true, _leaveState: st,
          title: st === "approved" ? e.title : `${e.title} (${st === "pending" ? "pending approval" : "rejected"})` };
      });

    // Activities → appear on their date. A planned Call activity (what the
    // "Schedule Call" button creates) is tagged as a scheduled call so it
    // renders in its own colour and answers the "Scheduled Calls" filter.
    const actItems = activities
      .filter(a => a.date)
      .map(a => ({
        id:        a.id,
        _source:   "activity",
        _scheduledCall: a.type === "Call" && a.status !== "Completed" && a.status !== "Cancelled",
        _orig:     a,
        date:      a.date,
        time:      a.time || "09:00",
        endTime:   a.endTime || "",
        title:     a.title || `${a.type} – ${accounts.find(ac=>ac.id===a.accountId)?.name||""}`,
        type:      a.type,
        status:    a.status === "Completed" ? "Completed" : a.status === "Cancelled" ? "Cancelled" : "Scheduled",
        accountId: a.accountId,
        contactId: a.contactId,
        oppId:     a.oppId,
        owner:     a.owner,
        notes:     a.notes,
        attendees: [],
        location:  "",
      }));

    // Call Reports → appear on their callDate. A pending (not-completed)
    // report dated today/future is also a scheduled call.
    // Status follows callReportState (utils/teamSummary): a call with any
    // outcome happened, so it's "Completed" — a No Answer is a logged call,
    // not overdue work. Only Rescheduled / future-dated reports stay
    // "Scheduled". Previously every past non-"Completed" outcome counted as
    // overdue, which is what inflated the header to hundreds.
    const callItems = callReports
      .filter(c => c.callDate)
      .map(c => ({
        id:        c.id,
        _source:   "call",
        _scheduledCall: callReportState(c.outcome, c.callDate, today) !== "made",
        _orig:     c,
        date:      c.callDate,
        time:      "09:00",
        endTime:   "",
        title:     `Call: ${c.leadName || c.company || ""}`,
        type:      "Call",
        status:    callReportState(c.outcome, c.callDate, today) === "made" ? "Completed" : "Scheduled",
        outcome:   c.outcome,
        accountId: c.accountId,
        contactId: c.contactId,
        oppId:     c.oppId,
        owner:     c.marketingPerson,
        notes:     c.notes,
        attendees: [],
        location:  "",
      }));

    return [...evItems, ...actItems, ...callItems];
  }, [events, activities, callReports, accounts]);

  // Apply the Calls / Activities / Events source filter. "all" = everything;
  // "scheduledCall" = pending call items only (planned call activities +
  // pending future call reports), regardless of source.
  const visibleItems = useMemo(() => {
    const bySource = sourceFilter === "all" ? allItems
      : sourceFilter === "scheduledCall" ? allItems.filter(e => e._scheduledCall)
      : allItems.filter(e => e._source === sourceFilter);
    return ownerFilter ? bySource.filter(e => e.owner === ownerFilter) : bySource;
  }, [allItems, sourceFilter, ownerFilter]);

  const teamUsers = useMemo(() => (orgUsers || [])
    .filter(u => u.active !== false && u.status !== "Inactive" && u.role !== "viewer" && scopeIds.has(u.id)),
    [orgUsers, scopeIds]);
  const teamCols = useMemo(() => teamColumns(teamMode, toLocalISODate(viewDate)), [teamMode, viewDate]);

  const itemsOn=(d)=>visibleItems.filter(e=>e.date===dateStr(d));

  const nav=(dir)=>{
    const d=new Date(viewDate);
    if(view==="month"||(view==="team"&&teamMode==="month")) d.setMonth(d.getMonth()+dir);
    else d.setDate(d.getDate()+dir*7);
    setViewDate(d);
  };

  const todayStats=useMemo(()=>{
    const t=visibleItems.filter(e=>e.date===today&&!e._leave);
    return {total:t.length,scheduled:t.filter(e=>e.status==="Scheduled").length,completed:t.filter(e=>e.status==="Completed").length};
  },[visibleItems]);

  const overdue=visibleItems.filter(e=>e.date<today&&e.status==="Scheduled"&&!e._leave).length;
  const upcoming=visibleItems.filter(e=>e.date>=today&&e.status==="Scheduled"&&!e._leave).length;

  // ── Individual leave ──
  // One event per working day, owned by the person on leave. Anyone can
  // mark their own; a manager/admin can mark it for people in their scope.
  // Weekends, holidays and days already on leave are skipped.
  const [leaveModal,setLeaveModal]=useState(null);   // {owner,from,to,type,reason}
  const leavePeople = useMemo(() => {
    const me = (orgUsers||[]).find(u=>u.id===currentUser);
    const list = canSeeTeam ? teamUsers : [];
    return me && !list.some(u=>u.id===me.id) ? [me, ...list] : list;
  }, [orgUsers, currentUser, canSeeTeam, teamUsers]);
  const leavePlan = useMemo(() => {
    if (!leaveModal?.from || !leaveModal?.to || leaveModal.to < leaveModal.from) return null;
    const existing = leaveByUser(events, { includePending: true }).get(leaveModal.owner) || new Map();
    return leaveDatesToCreate(leaveModal.from, leaveModal.to, offDayMap(holidays), existing);
  }, [leaveModal, events, holidays]);
  const openLeave=()=>setLeaveModal({owner:currentUser,from:today,to:today,type:"Leave",reason:""});
  const nameOf=(id)=>(orgUsers||[]).find(u=>u.id===id)?.name||teamMap[id]?.name||"—";
  const stamp=(verb,extra)=>`[${verb} by ${nameOf(currentUser)} · ${fmt.short(today)}${extra?` — ${extra}`:""}]`;
  const saveLeave=()=>{
    if(!leavePlan?.length) return;
    const reason=(leaveModal.reason||"").trim();
    const title=leaveTitleFor(leaveModal.type);
    const status=initialLeaveStatus(currentUser, leaveModal.owner, orgUsers||[]);
    const autoApproved=status===LEAVE_STATUS.approved&&leaveModal.owner!==currentUser;
    const rid=uid().replace(/[^A-Za-z0-9]/g,"");
    setEvents(p=>[...p, ...leavePlan.map(date=>({
      ...BLANK_EVENT, id:`lv_${rid}_${date}`, title, type:leaveModal.type, status,
      date, time:"09:00", endTime:leaveModal.type==="Half-day leave"?"13:00":"18:00",
      owner:leaveModal.owner, notes:[reason, autoApproved?stamp("Approved"):""].filter(Boolean).join("\n"),
    }))]);
    if(status===LEAVE_STATUS.pending){
      const mgr=lineManagerOf(leaveModal.owner, orgUsers||[]);
      notify.info(`${LEAVE_TYPE_LABEL[leaveModal.type]} requested — waiting for approval from ${mgr?.name||"an admin"}. It comes off the call target once approved.`);
      emailAbout({kind:"requested", ownerId:leaveModal.owner, type:leaveModal.type, dates:leavePlan, reason}, mgr?.name||"an admin");
    } else notify.success(autoApproved?`Leave recorded and approved for ${nameOf(leaveModal.owner)}.`:"Leave recorded.");
    setLeaveModal(null);
  };

  // ── Leave approvals ──
  // Line manager (or anyone above on the reporting line, or an admin)
  // approves / rejects a whole request. Only approved leave counts.
  const [leaveHub,setLeaveHub]=useState(false);
  const [rejecting,setRejecting]=useState(null);     // {id, reason}
  const leaveRequests = useMemo(()=>groupLeaveRequests(events),[events]);
  const toApprove = useMemo(()=>pendingLeaveFor(currentUser, events, orgUsers||[]),[currentUser, events, orgUsers]);
  const myRequests = useMemo(()=>leaveRequests.filter(r=>r.owner===currentUser&&r.state!=="cancelled").slice(0,12),[leaveRequests, currentUser]);
  const decideLeave=(req, status, note)=>{
    const ids=new Set(req.events.map(e=>e.id));
    const verb=status===LEAVE_STATUS.approved?"Approved":status===LEAVE_STATUS.rejected?"Rejected":"Cancelled";
    setEvents(p=>p.map(e=>ids.has(e.id)?{...e,status,notes:[e.notes,stamp(verb,note)].filter(Boolean).join("\n")}:e));
    setRejecting(null);
    if(status!==LEAVE_STATUS.cancelled){
      notify.success(`${verb} ${fmtDays(req.days)} day${req.days===1?"":"s"} of ${req.type==="Admin day"?"admin days":"leave"} for ${nameOf(req.owner)}.`);
      emailAbout({kind:"decided", ownerId:req.owner, type:req.type, dates:req.dates, decision:verb, note}, nameOf(req.owner));
    }
  };
  // Email the other side (line manager on request, requester on decision).
  // The leave is already saved; email trouble is reported, never blocking.
  // "not_configured" stays quiet — the badge still surfaces requests.
  const emailAbout=(payload, who)=>{
    notifyLeave(payload).then(res=>{
      if(res.ok) notify.info(`Email sent to ${(res.sentTo||[who]).join(", ")}.`);
      else if(res.error) notify.error(`Leave saved, but the email to ${who} failed: ${res.error}`);
    });
  };
  const rangeLabel=(r)=>r.from===r.to?fmt.short(r.from):`${fmt.short(r.from)} – ${fmt.short(r.to)}`;

  const openAdd=(date)=>{
    setForm({...BLANK_EVENT,id:`ev${uid()}`,date:date||today,owner:currentUser});
    setFormErrors({});setModal({mode:"add"});
  };
  const openEdit=(e)=>{
    if(e._source==="activity"||e._source==="call") return; // non-event items are read-only
    if(e._leave) return; // leave changes go through the Leave panel (approval trail)
    if(e&&e.id&&!canEditEvt(e)){requestAccessEvt(e);return;}
    setForm({...e,attendees:[...e.attendees]});setFormErrors({});setModal({mode:"edit"});
  };
  const save=()=>{
    if(modal?.mode==="edit"&&!canEditEvt(form)){setModal(null);setFormErrors({});return;}
    const errs={};
    if(!form.title?.trim()) errs.title="Title is required";
    if(!form.date) errs.date="Date is required";
    if(hasErrors(errs)){setFormErrors(errs);return;}
    const clean=sanitizeObj(form);
    if(modal.mode==="add") setEvents(p=>[...p,{...clean}]);
    else setEvents(p=>p.map(e=>e.id===clean.id?{...clean}:e));
    setModal(null);setFormErrors({});setSelectedEvent(null);
  };

  const del=(item)=>{
    if(item._source==="activity"&&setActivities){
      setActivities(p=>softDeleteById(p,item.id,currentUser));
    } else if(item._source==="call"&&setCallReports){
      setCallReports(p=>softDeleteById(p,item.id,currentUser));
    } else {
      setEvents(p=>softDeleteById(p,item.id,currentUser));
    }
    setConfirm(null);setSelectedEvent(null);
  };

  // ── Complete-with-outcome flow ──
  // Marking a scheduled call/activity complete must capture WHAT HAPPENED:
  // clicking "Mark Complete" opens a small dialog requiring an outcome
  // (call outcomes from masters), optional remarks (appended to the record's
  // notes with a date stamp), and an optional next-call date that schedules
  // the follow-up call in one step.
  const [completeItem,setCompleteItem]=useState(null);
  const [completeForm,setCompleteForm]=useState({outcome:"Completed",notes:"",nextCallDate:""});
  const markComplete=(item)=>{
    setCompleteForm({outcome:"Completed",notes:"",nextCallDate:""});
    setCompleteItem(item);
  };
  const saveComplete=()=>{
    const item=completeItem; if(!item) return;
    const oc=completeForm.outcome||"Completed";
    const note=(completeForm.notes||"").trim();
    const stampNote=(old)=>[old,`[${fmt.short(today)} · outcome: ${oc}${note?` — ${note}`:""}]`].filter(Boolean).join("\n");
    if(item._source==="activity"&&setActivities){
      setActivities(p=>p.map(a=>a.id===item.id?{...a,status:"Completed",outcome:oc,notes:stampNote(a.notes)}:a));
    } else if(item._source==="call"&&setCallReports){
      // Call reports keep their own semantics: a non-"Completed" outcome
      // (No Answer / Voicemail…) logs the attempt but leaves it pending.
      setCallReports(p=>p.map(c=>c.id===item.id?{...c,outcome:oc,notes:stampNote(c.notes),nextCallDate:completeForm.nextCallDate||c.nextCallDate}:c));
    } else {
      setEvents(p=>p.map(e=>e.id===item.id?{...e,status:"Completed",notes:stampNote(e.notes)}:e));
    }
    // Optional: schedule the next call as a fresh Planned activity.
    if(completeForm.nextCallDate&&setActivities){
      setActivities(p=>[...p,{
        id:`act_${uid()}`,type:"Call",status:"Planned",date:completeForm.nextCallDate,time:item.time||"10:00",duration:30,
        accountId:item.accountId||"",contactId:item.contactId||"",oppId:item.oppId||"",owner:item.owner||currentUser,
        title:(item.title||"").startsWith("Call")?item.title:`Call: ${item.title||""}`,
        notes:`Follow-up of ${fmt.short(item.date)} call${note?` — ${note}`:""}`,outcome:"",files:[],createdDate:today,
      }]);
    }
    setCompleteItem(null);
  };

  const openScheduleCall=(date)=>{
    setScheduleForm({
      title:"",
      date:date||today,
      time:"10:00",
      duration:30,
      accountId:"",
      contactId:"",
      oppId:"",
      leadId:"",
      notes:"",
      type:"Call",
      status:"Planned",
      owner:currentUser,
    });
    setScheduleModal(true);
  };

  const saveScheduledCall=()=>{
    if(!scheduleForm.title?.trim()||!scheduleForm.date) return;
    const newActivity={
      id:        `act_${uid()}`,
      title:     scheduleForm.title,
      type:      scheduleForm.type,
      status:    "Planned",
      date:      scheduleForm.date,
      time:      scheduleForm.time||"09:00",
      duration:  30,
      accountId: scheduleForm.accountId||"",
      contactId: scheduleForm.contactId||"",
      oppId:     scheduleForm.oppId||"",
      owner:     scheduleForm.owner||currentUser,
      notes:     scheduleForm.notes||"",
      outcome:   "",
      files:     [],
    };
    if(setActivities) setActivities(p=>[...p,newActivity]);
    setScheduleModal(false);
  };

  const HOURS=Array.from({length:12},(_,i)=>i+8); // 8am-7pm

  return (
    <div>
      <div className="pg-head">
        <div><div className="pg-title">Calendar</div>
          <div className="pg-sub">{todayStats.total} today ({todayStats.scheduled} pending) · {upcoming} upcoming{overdue>0&&<span style={{color:"var(--red)",fontWeight:700}}> · {overdue} overdue</span>}</div>
        </div>
        <div className="pg-actions">
          {/* Source filter — show calls, activities, scheduled events, or all */}
          {view!=="team"&&<select value={sourceFilter} onChange={e=>setSourceFilter(e.target.value)}
            title="Choose which items appear on the calendar"
            style={{fontSize:12,fontWeight:600,padding:"6px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--surface)",color:"var(--text2)",cursor:"pointer"}}>
            <option value="all">Both — Calls + Activities</option>
            <option value="scheduledCall">Scheduled Calls only</option>
            <option value="call">Calls only</option>
            <option value="activity">Activities only</option>
            <option value="event">Events only</option>
          </select>}
          <div style={{display:"flex",gap:4,background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:3}}>
            <button className={`btn btn-xs ${view==="week"?"btn-primary":"btn-sec"}`} style={{border:"none"}} onClick={()=>setView("week")}>Week</button>
            <button className={`btn btn-xs ${view==="month"?"btn-primary":"btn-sec"}`} style={{border:"none"}} onClick={()=>setView("month")}>Month</button>
            <button className={`btn btn-xs ${view==="list"?"btn-primary":"btn-sec"}`} style={{border:"none"}} onClick={()=>setView("list")}>List</button>
            {canSeeTeam&&<button className={`btn btn-xs ${view==="team"?"btn-primary":"btn-sec"}`} style={{border:"none"}} onClick={()=>setView("team")} title="Summary of calls and activities per team member">Team</button>}
          </div>
          <button className="btn btn-sec" onClick={()=>setLeaveHub(true)} title="Request leave, see your requests, approve your team's leave" style={{position:"relative"}}>
            <CalendarOff size={14}/>Leave
            {toApprove.length>0&&<span style={{marginLeft:4,minWidth:18,height:18,padding:"0 5px",borderRadius:9,background:"#D97706",color:"#fff",fontSize:10.5,fontWeight:700,display:"inline-flex",alignItems:"center",justifyContent:"center"}} aria-label={`${toApprove.length} leave requests to approve`}>{toApprove.length}</span>}
          </button>
          <button className="btn btn-sec" onClick={()=>openScheduleCall()}><Phone size={14}/>Schedule Call</button>
          <button className="btn btn-primary" onClick={()=>openAdd()}><Plus size={14}/>New Event</button>
        </div>
      </div>

      {/* Nav bar + colour legend */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <button className="icon-btn" onClick={()=>nav(-1)}><ChevronLeft size={18}/></button>
        <div style={{fontSize:16,fontWeight:700,minWidth:220,textAlign:"center"}}>{view==="month"||(view==="team"&&teamMode==="month")?monthName:weekLabel}</div>
        <button className="icon-btn" onClick={()=>nav(1)}><ChevronRight size={18}/></button>
        <button className="btn btn-sec btn-sm" onClick={()=>setViewDate(new Date(today))}>Today</button>
        {view==="team"&&(
          <div style={{display:"flex",gap:4,background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:3}}>
            <button className={`btn btn-xs ${teamMode==="week"?"btn-primary":"btn-sec"}`} style={{border:"none"}} onClick={()=>setTeamMode("week")}>By day</button>
            <button className={`btn btn-xs ${teamMode==="month"?"btn-primary":"btn-sec"}`} style={{border:"none"}} onClick={()=>setTeamMode("month")}>By week</button>
          </div>
        )}
        {ownerFilter&&view!=="team"&&(
          <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,fontWeight:600,padding:"4px 6px 4px 10px",borderRadius:14,background:"var(--brand-bg)",color:"var(--brand)"}}>
            Showing: {teamMap[ownerFilter]?.name||"member"}
            <button type="button" onClick={()=>setOwnerFilter("")} aria-label="Show everyone" style={{display:"inline-flex",background:"none",border:0,cursor:"pointer",color:"var(--brand)",padding:0}}><X size={13}/></button>
          </span>
        )}
        {view!=="team"&&<div style={{marginLeft:"auto",display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
          {[["Scheduled Call",SCHEDULED_CALL_COL],["Logged Call","var(--brand)"],["Activity","var(--purple)"],["Event","var(--blue)"],["Leave",TYPE_COL.Leave]].map(([label,c])=>(
            <span key={label} style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,color:"var(--text3)",fontWeight:600}}>
              <span style={{width:9,height:9,borderRadius:"50%",background:c,display:"inline-block"}}/>{label}
            </span>
          ))}
        </div>}
      </div>

      {/* TEAM VIEW — manager summary layer */}
      {view==="team"&&canSeeTeam&&(
        <TeamSummary
          activities={activities} callReports={callReports} events={events}
          users={teamUsers} columns={teamCols} today={today} holidays={holidays}
          onPickUser={(id)=>{ setOwnerFilter(id); setView("week"); }}
        />
      )}

      {/* WEEK VIEW */}
      {view==="week"&&(
        <div className="card" style={{padding:0,overflow:"auto"}}>
          <div style={{display:"grid",gridTemplateColumns:"60px repeat(7,1fr)",minWidth:800}}>
            <div style={{borderBottom:"1px solid var(--border)",borderRight:"1px solid var(--border)",padding:8}}/>
            {weekDates.map(d=>{
              const isToday=dateStr(d)===today;
              return <div key={dateStr(d)} style={{borderBottom:"1px solid var(--border)",borderRight:"1px solid var(--border)",padding:"8px 6px",textAlign:"center",background:isToday?"var(--brand-bg)":"transparent"}}>
                <div style={{fontSize:10,color:"var(--text3)",fontWeight:600}}>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][d.getDay()===0?6:d.getDay()-1]}</div>
                <div style={{fontSize:16,fontWeight:isToday?800:500,color:isToday?"var(--brand)":"var(--text1)"}}>{d.getDate()}</div>
              </div>;
            })}
            {HOURS.map(h=>(
              <div key={h} style={{display:"contents"}}>
                <div style={{borderRight:"1px solid var(--border)",borderBottom:"1px solid var(--border)",padding:"4px 6px",fontSize:10,color:"var(--text3)",textAlign:"right"}}>{h}:00</div>
                {weekDates.map(d=>{
                  const dayEvents=itemsOn(d).filter(e=>{const hr=parseInt(e.time?.split(":")[0]||"0");return hr===h;});
                  return <div key={dateStr(d)+h} style={{borderRight:"1px solid var(--border)",borderBottom:"1px solid var(--border)",padding:2,minHeight:40,cursor:"pointer",position:"relative"}} onClick={()=>openAdd(dateStr(d))}>
                    {dayEvents.map(ev=>{
                      const col=itemCol(ev);
                      return <div key={ev.id} onClick={e=>{e.stopPropagation();setSelectedEvent(ev);}} style={{background:col+"18",borderLeft:`3px solid ${col}`,borderRadius:4,padding:"2px 4px",marginBottom:2,cursor:"pointer",fontSize:10}}>
                        <div style={{fontWeight:600,color:col}}>{ev.time} {ev.title.substring(0,20)}</div>
                      </div>;
                    })}
                  </div>;
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MONTH VIEW */}
      {view==="month"&&(
        <div className="card" style={{padding:0}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=><div key={d} style={{padding:"8px 6px",textAlign:"center",fontSize:11,fontWeight:700,color:"var(--text3)",borderBottom:"1px solid var(--border)"}}>{d}</div>)}
            {monthDays.map((d,i)=>{
              const isToday=d&&dateStr(d)===today;
              const dayEvents=d?itemsOn(d):[];
              return <div key={i} style={{borderRight:i%7<6?"1px solid var(--border)":"none",borderBottom:"1px solid var(--border)",padding:4,minHeight:80,background:isToday?"var(--brand-bg)":!d?"var(--s2)":"transparent",cursor:d?"pointer":"default"}} onClick={()=>d&&openAdd(dateStr(d))}>
                {d&&<div style={{fontSize:12,fontWeight:isToday?800:400,color:isToday?"var(--brand)":"var(--text2)",marginBottom:2}}>{d.getDate()}</div>}
                {dayEvents.slice(0,3).map(ev=>{
                  const col=itemCol(ev);
                  return <div key={ev.id} onClick={e=>{e.stopPropagation();setSelectedEvent(ev);}} style={{background:col+"18",borderRadius:3,padding:"1px 4px",marginBottom:1,fontSize:9,fontWeight:600,color:col,cursor:"pointer",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {TYPE_ICON[ev.type]} {ev.time?.slice(0,5)} {ev.title.substring(0,15)}
                  </div>;
                })}
                {dayEvents.length>3&&<div style={{fontSize:9,color:"var(--text3)"}}>+{dayEvents.length-3} more</div>}
              </div>;
            })}
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {view==="list"&&(
        <div className="card" style={{padding:0}}>
          <table className="tbl">
            <thead><tr><th>Date</th><th>Time</th><th>Event</th><th>Type</th><th>Status</th><th>Source</th><th>Account</th><th>Owner</th><th>Location</th><th></th></tr></thead>
            <tbody>{[...visibleItems].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)).map(ev=>{
              const col=itemCol(ev);
              const acc=accounts.find(a=>a.id===ev.accountId);
              const isOverdue=ev.date<today&&ev.status==="Scheduled"&&!ev._leave;
              return <tr key={ev._source+ev.id}>
                <td style={{fontSize:12,color:isOverdue?"var(--red)":"var(--text2)",fontWeight:isOverdue?700:400}}>{fmt.short(ev.date)}</td>
                <td style={{fontSize:12}}>{ev.time}{ev.endTime?`–${ev.endTime}`:""}</td>
                <td><span className="tbl-link" onClick={()=>setSelectedEvent(ev)} style={{fontWeight:600}}>{ev.title}</span></td>
                <td><span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:11,fontWeight:600,padding:"2px 7px",borderRadius:5,background:col+"18",color:col}}>{TYPE_ICON[ev.type]}{ev.type}</span></td>
                <td><span style={{fontSize:11,fontWeight:600,padding:"2px 7px",borderRadius:5,background:(STATUS_COL[ev.status]||"#94A3B8")+"18",color:STATUS_COL[ev.status]||"#94A3B8"}}>{ev.status}</span></td>
                <td><span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:col+"22",color:col,textTransform:"capitalize"}}>{ev._source}</span></td>
                <td style={{fontSize:12}}>{acc?.name||"—"}</td>
                <td><UserPill uid={ev.owner}/></td>
                <td style={{fontSize:11,color:"var(--text3)"}}>{ev.location?.substring(0,25)}</td>
                <td><div style={{display:"flex",gap:4,alignItems:"center"}}>
                  {ev.status==="Scheduled"&&!ev._leave&&<button className="btn btn-green btn-xs" onClick={()=>markComplete(ev)} title="Mark complete"><Check size={12}/></button>}
                  {ev._source==="event" ? (
                    canEditEvt(ev) ? (
                      <>
                        <button className="icon-btn" aria-label="Edit" onClick={()=>openEdit(ev)}><Edit2 size={14}/></button>
                        {canDelete&&<button className="icon-btn" aria-label="Delete" onClick={()=>setConfirm(ev)}><Trash2 size={14}/></button>}
                      </>
                    ) : hasPendingAccessReq(commLogs,"event",ev.id,currentUser) ? (
                      <span style={{fontSize:10.5,fontWeight:600,color:"#B45309",padding:"3px 7px",borderRadius:5,background:"#FFFBEB",border:"1px solid #FDE68A",whiteSpace:"nowrap"}} title="Edit-access request pending with the owner">Requested</span>
                    ) : (
                      <button className="icon-btn" aria-label="Request edit access" title="Read-only — request edit access from the owner" style={{color:"#64748B"}} onClick={()=>requestAccessEvt(ev)}><Lock size={14}/></button>
                    )
                  ) : (
                    canDelete&&<button className="icon-btn" aria-label="Delete" onClick={()=>setConfirm(ev)}><Trash2 size={14}/></button>
                  )}
                </div></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      )}

      {/* Event Detail */}
      {selectedEvent&&(
        <Modal
          title={<span>{selectedEvent.title}{selectedEvent._source==="activity"&&<span style={{fontSize:10,background:"var(--purple)",color:"white",padding:"2px 8px",borderRadius:4,marginLeft:8}}>Activity</span>}{selectedEvent._source==="call"&&<span style={{fontSize:10,background:"var(--brand)",color:"white",padding:"2px 8px",borderRadius:4,marginLeft:8}}>Call Report</span>}</span>}
          onClose={()=>setSelectedEvent(null)}
          footer={<>
            <button className="btn btn-sec btn-sm" onClick={()=>setSelectedEvent(null)}>Close</button>
            {selectedEvent.status==="Scheduled"&&!selectedEvent._leave&&<button className="btn btn-green btn-sm" onClick={()=>{markComplete(selectedEvent);setSelectedEvent(null);}}>Mark Complete</button>}
            {selectedEvent._leave&&<button className="btn btn-sec btn-sm" onClick={()=>{setSelectedEvent(null);setLeaveHub(true);}}>Open leave panel</button>}
            {selectedEvent._leave&&selectedEvent._leaveState!=="rejected"&&(selectedEvent.owner===currentUser||canApproveLeave(currentUser,selectedEvent.owner,orgUsers||[]))&&<button className="btn btn-sec btn-sm" onClick={()=>{setEvents(p=>p.map(e=>e.id===selectedEvent.id?{...e,status:LEAVE_STATUS.cancelled,notes:[e.notes,stamp("Cancelled")].filter(Boolean).join("\n")}:e));setSelectedEvent(null);}} title="Cancel this day's leave — the call target applies again">Cancel this day</button>}
            {selectedEvent._source==="event"&&!selectedEvent._leave&&<button className="btn btn-primary btn-sm" onClick={()=>{openEdit(selectedEvent);setSelectedEvent(null);}}><Edit2 size={13}/>Edit</button>}
          </>}>
          <div className="dp-grid">
            {[["Type",selectedEvent.type],["Status",selectedEvent._leave?LEAVE_STATE_UI[selectedEvent._leaveState]?.label:selectedEvent.status],["Date",fmt.date(selectedEvent.date)],["Time",`${selectedEvent.time}${selectedEvent.endTime?" – "+selectedEvent.endTime:""}`],["Location",selectedEvent.location||"—"],["Account",accounts.find(a=>a.id===selectedEvent.accountId)?.name||"—"],["Owner",(teamMap[selectedEvent.owner]||TEAM_MAP[selectedEvent.owner])?.name||selectedEvent.owner||"—"]].map(([k,v])=><div key={k} className="dp-row"><span className="dp-key">{k}</span><span className="dp-val">{v}</span></div>)}
          </div>
          {selectedEvent.notes&&<div style={{marginTop:12,background:"var(--s2)",padding:"10px 12px",borderRadius:8,fontSize:13,color:"var(--text2)"}}>{selectedEvent.notes}</div>}
          {(selectedEvent._source==="activity"||selectedEvent._source==="call")&&(
            <div style={{marginTop:12,padding:"8px 12px",background:"var(--s2)",borderRadius:8,fontSize:12,color:"var(--text3)"}}>
              To edit this item, visit the {selectedEvent._source==="activity"?"Activities":"Call Reports"} page.
            </div>
          )}
        </Modal>
      )}

      {/* Complete-with-outcome dialog — outcome is required before closing */}
      {completeItem&&(
        <Modal title={`Complete: ${completeItem.title||"item"}`} onClose={()=>setCompleteItem(null)}
          footer={<>
            <button className="btn btn-sec" onClick={()=>setCompleteItem(null)}>Cancel</button>
            <button className="btn btn-green" onClick={saveComplete} disabled={!completeForm.outcome}><Check size={14}/>Save &amp; Complete</button>
          </>}>
          <div style={{fontSize:12,color:"var(--text3)",marginBottom:12}}>
            Record what happened before closing this {(completeItem.type==="Call"||completeItem._source==="call")?"call":"item"}. The outcome and remarks are saved onto the record{completeItem._source==="call"?" — a non-completed outcome (No Answer / Voicemail…) logs the attempt but keeps the call pending":""}.
          </div>
          <div className="form-group"><label>Outcome *</label>
            <select value={completeForm.outcome} onChange={e=>setCompleteForm(f=>({...f,outcome:e.target.value}))}>
              {((completeItem.type==="Call"||completeItem._source==="call")?CALL_OUTCOMES:["Completed","Positive","Neutral","Negative","No Show"]).map(o=><option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Outcome notes / remarks</label>
            <textarea rows={3} value={completeForm.notes} onChange={e=>setCompleteForm(f=>({...f,notes:e.target.value}))} placeholder="What was discussed / agreed / next steps…"/>
          </div>
          <div className="form-group"><label>Schedule next call (optional)</label>
            <input type="date" min={today} value={completeForm.nextCallDate} onChange={e=>setCompleteForm(f=>({...f,nextCallDate:e.target.value}))}/>
            <div style={{fontSize:10.5,color:"var(--text3)",marginTop:4}}>Picks a date → a new scheduled call is created automatically.</div>
          </div>
        </Modal>
      )}

      {/* Leave panel — request, track, approve */}
      {leaveHub&&(
        <Modal title="Leave" lg onClose={()=>{setLeaveHub(false);setRejecting(null);}}
          footer={<>
            <button className="btn btn-sec" onClick={()=>{setLeaveHub(false);setRejecting(null);}}>Close</button>
            <button className="btn btn-primary" onClick={()=>{setLeaveHub(false);openLeave();}}><Plus size={14}/>Mark leave</button>
          </>}>
          {(()=>{
            const Row=({r,actions})=>{
              const ui=LEAVE_STATE_UI[r.state];
              return (
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:"1px solid var(--border)",borderRadius:8,marginBottom:6,flexWrap:"wrap"}}>
                  <div style={{flex:"1 1 220px",minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:13}}>{nameOf(r.owner)} <span style={{fontWeight:500,color:"var(--text3)",fontSize:12}}>· {LEAVE_TYPE_LABEL[r.type]||r.type}</span></div>
                    <div style={{fontSize:12,color:"var(--text2)"}}>{rangeLabel(r)} · {fmtDays(r.days)} day{r.days===1?"":"s"}{r.reason?` · ${r.reason}`:""}</div>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,padding:"3px 8px",borderRadius:6,background:ui.bg,color:ui.col}}>{ui.label}</span>
                  {actions}
                  {rejecting?.id===r.id&&(
                    <div style={{flexBasis:"100%",display:"flex",gap:6,marginTop:6}}>
                      <input autoFocus value={rejecting.reason} onChange={e=>{const v=e.target.value;setRejecting(x=>({...x,reason:v}));}}
                        placeholder="Reason for rejecting (required)" style={{flex:1,padding:"6px 8px",border:"1.5px solid var(--border)",borderRadius:6,fontSize:12.5}}/>
                      <button className="btn btn-sm" style={{background:"#B91C1C",color:"#fff"}} disabled={!rejecting.reason.trim()} onClick={()=>decideLeave(r,LEAVE_STATUS.rejected,rejecting.reason.trim())}>Reject</button>
                      <button className="btn btn-sec btn-sm" onClick={()=>setRejecting(null)}>Back</button>
                    </div>
                  )}
                </div>
              );
            };
            return (<>
              <div style={{fontSize:12,color:"var(--text3)",marginBottom:12}}>
                Leave or an admin day you request waits for your line manager{lineManagerOf(currentUser,orgUsers||[])?` (${lineManagerOf(currentUser,orgUsers||[]).name})`:""} to approve. Only approved leave comes off the 5-calls-a-day target. Leave a manager records for their own team is approved straight away.
              </div>
              {(toApprove.length>0||canSeeTeam)&&(<>
                <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",color:"var(--text3)",margin:"4px 0 8px"}}>Awaiting your approval · {toApprove.length}</div>
                {toApprove.length===0&&<div style={{fontSize:12.5,color:"var(--text3)",padding:"6px 0 14px"}}>Nothing waiting.</div>}
                {toApprove.map(r=>(
                  <Row key={r.owner+r.id} r={r} actions={rejecting?.id===r.id?null:<>
                    <button className="btn btn-green btn-sm" onClick={()=>decideLeave(r,LEAVE_STATUS.approved)}><Check size={13}/>Approve</button>
                    <button className="btn btn-sec btn-sm" onClick={()=>setRejecting({id:r.id,reason:""})}><X size={13}/>Reject</button>
                  </>}/>
                ))}
              </>)}
              <div style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",color:"var(--text3)",margin:"14px 0 8px"}}>My leave requests</div>
              {myRequests.length===0&&<div style={{fontSize:12.5,color:"var(--text3)",padding:"6px 0"}}>You haven't requested any leave.</div>}
              {myRequests.map(r=>{
                const note=r.events[0]?.notes?.split("\n").filter(l=>/^\[(Approved|Rejected)/.test(l)).pop();
                return (
                  <div key={r.owner+r.id}>
                    <Row r={r} actions={(r.state==="pending"||(r.state==="approved"&&r.to>=today))&&
                      <button className="btn btn-sec btn-sm" onClick={()=>decideLeave(r,LEAVE_STATUS.cancelled)} title="Withdraw this request">Cancel</button>}/>
                    {note&&<div style={{fontSize:11,color:"var(--text3)",margin:"-4px 0 8px 12px"}}>{note}</div>}
                  </div>
                );
              })}
            </>);
          })()}
        </Modal>
      )}

      {/* Mark Leave */}
      {leaveModal&&(
        <Modal title="Mark leave" onClose={()=>setLeaveModal(null)}
          footer={<>
            <button className="btn btn-sec" onClick={()=>setLeaveModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveLeave} disabled={!leavePlan?.length}><Check size={14}/>Save leave</button>
          </>}>
          <div className="form-row">
            <div className="form-group"><label>Person</label>
              <select value={leaveModal.owner} onChange={e=>setLeaveModal(m=>({...m,owner:e.target.value}))} disabled={leavePeople.length<=1}>
                {leavePeople.map(u=><option key={u.id} value={u.id}>{u.name}{u.id===currentUser?" (me)":""}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Type</label>
              <select value={leaveModal.type} onChange={e=>setLeaveModal(m=>({...m,type:e.target.value}))}>
                <option value="Leave">Full day</option>
                <option value="Half-day leave">Half day</option>
                <option value="Admin day">Admin day</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>From</label>
              <input type="date" value={leaveModal.from} onChange={e=>{const v=e.target.value;setLeaveModal(m=>({...m,from:v,to:m.to&&m.to>=v?m.to:v}));}}/>
            </div>
            <div className="form-group"><label>To</label>
              <input type="date" value={leaveModal.to} min={leaveModal.from} onChange={e=>{const v=e.target.value;setLeaveModal(m=>({...m,to:v}));}}/>
            </div>
          </div>
          <div className="form-group"><label>Reason (optional)</label>
            <input value={leaveModal.reason} onChange={e=>{const v=e.target.value;setLeaveModal(m=>({...m,reason:v}));}} placeholder="e.g. Sick leave, personal, travel"/>
          </div>
          <div style={{fontSize:12,padding:"8px 12px",borderRadius:8,background:leavePlan?.length?"#FFFBEB":"var(--s2)",color:leavePlan?.length?"#92400E":"var(--text3)"}}>
            {!leavePlan ? "Pick a valid date range."
              : leavePlan.length===0 ? "Nothing to add — those dates are weekends, holidays or already marked as leave."
              : <>{initialLeaveStatus(currentUser, leaveModal.owner, orgUsers||[])===LEAVE_STATUS.pending
                    ? <b>Needs approval from {lineManagerOf(leaveModal.owner, orgUsers||[])?.name||"an admin"}. </b>
                    : leaveModal.owner!==currentUser ? <b>Approved on save (you manage {nameOf(leaveModal.owner)}). </b> : null}Adds {leavePlan.length} {leaveModal.type==="Admin day"?"admin day":leaveModal.type==="Leave"?"day":"half-day"}{leavePlan.length===1?"":"s"}{leaveModal.type==="Admin day"?"":" of leave"} ({leavePlan.map(d=>fmt.short(d)).join(", ")}). Each takes {leaveModal.type==="Half-day leave"?"2.5 calls":"5 calls"} off the call target. Weekends, holidays and days already marked are skipped.</>}
          </div>
        </Modal>
      )}

      {/* Add/Edit Modal */}
      {modal&&(
        <Modal title={modal.mode==="add"?"New Event":"Edit Event"} onClose={()=>{setModal(null);setFormErrors({});setForm(BLANK_EVENT);}} lg footer={<><button className="btn btn-sec" onClick={()=>{setModal(null);setFormErrors({});setForm(BLANK_EVENT);}}>Cancel</button><button className="btn btn-primary" onClick={save}><Check size={14}/>Save</button></>}>
          <div className="form-row full"><div className="form-group"><label>Title *</label><input value={form.title} onChange={e=>{setForm(f=>({...f,title:e.target.value}));setFormErrors(e=>({...e,title:undefined}));}} placeholder="e.g. Colossal Avia – GTM Presentation" style={formErrors.title?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.title}/></div></div>
          <div className="form-row three">
            <div className="form-group"><label>Type</label><select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{[...new Set([...EVENT_TYPES, ...Object.keys(LEAVE_TYPES)])].map(t=><option key={t}>{t}</option>)}</select></div>
            <div className="form-group"><label>Status</label><select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{EVENT_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
            <div className="form-group"><label>Owner</label>
              <TypeaheadSelect
                value={form.owner}
                onChange={(id) => setForm(f => ({...f, owner: id}))}
                options={team.map(u => ({ value: u.id, label: u.name, sub: u.role }))}
                placeholder="Search owners…"
              />
            </div>
          </div>
          <div className="form-row three">
            <div className="form-group"><label>Date *</label><input type="date" value={form.date} onChange={e=>{setForm(f=>({...f,date:e.target.value}));setFormErrors(e=>({...e,date:undefined}));}} style={formErrors.date?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.date}/></div>
            <div className="form-group"><label>Start Time</label><input type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))}/></div>
            <div className="form-group"><label>End Time</label><input type="time" value={form.endTime} onChange={e=>setForm(f=>({...f,endTime:e.target.value}))}/></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Account</label>
              <TypeaheadSelect
                value={form.accountId}
                onChange={(id) => setForm(f => ({...f, accountId: id}))}
                options={accounts.map(a => ({ value: a.id, label: a.name, sub: a.country || a.type || "" }))}
                placeholder="Search accounts…"
              />
            </div>
            <div className="form-group"><label>Contact</label>
              <TypeaheadSelect
                value={form.contactId}
                onChange={(id) => setForm(f => ({...f, contactId: id}))}
                options={(()=>{const effAcc=form.accountId||(opps.find(o=>o.id===form.oppId)?.accountId)||"";return contacts.filter(c=>!effAcc||c.accountId===effAcc);})().map(c=>({ value: c.id, label: c.name, sub: c.designation || c.role || "" }))}
                placeholder="Search contacts…"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Opportunity</label>
              <TypeaheadSelect
                value={form.oppId}
                onChange={(id) => setForm(f => ({...f, oppId: id}))}
                options={opps.filter(o => !form.accountId || o.accountId === form.accountId).map(o => ({ value: o.id, label: o.title }))}
                placeholder="Search opportunities…"
              />
            </div>
            <div className="form-group"><label>Location</label><input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} placeholder="Office / Web Call / Client site"/></div>
          </div>
          <div className="form-group"><label>Notes</label><textarea rows={3} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Agenda, preparation notes..." style={{width:"100%",resize:"vertical"}}/></div>
        </Modal>
      )}

      {/* Schedule Call Modal */}
      {scheduleModal&&(
        <Modal title="Schedule Call" onClose={()=>setScheduleModal(false)} lg
          footer={<>
            <button className="btn btn-sec" onClick={()=>setScheduleModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveScheduledCall}><Check size={14}/>Schedule</button>
          </>}>
          <div className="form-row">
            <div className="form-group">
              <label>Call Title *</label>
              <input value={scheduleForm.title} onChange={e=>setScheduleForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Discovery call with Acme"/>
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={scheduleForm.type} onChange={e=>setScheduleForm(f=>({...f,type:e.target.value}))}>
                {["Call","Meeting","Demo","Follow-up","Site Visit","Presentation"].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Date *</label>
              <input type="date" value={scheduleForm.date} onChange={e=>setScheduleForm(f=>({...f,date:e.target.value}))}/>
            </div>
            <div className="form-group">
              <label>Time</label>
              <input type="time" value={scheduleForm.time} onChange={e=>setScheduleForm(f=>({...f,time:e.target.value}))}/>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Account</label>
              <TypeaheadSelect
                value={scheduleForm.accountId}
                onChange={(id) => setScheduleForm(f => ({...f, accountId: id}))}
                options={accounts.map(a => ({ value: a.id, label: a.name, sub: a.country || a.type || "" }))}
                placeholder="Search accounts…"
              />
            </div>
            <div className="form-group">
              <label>Contact</label>
              <TypeaheadSelect
                value={scheduleForm.contactId}
                onChange={(id) => setScheduleForm(f => ({...f, contactId: id}))}
                options={contacts.filter(c => !scheduleForm.accountId || c.accountId === scheduleForm.accountId).map(c => ({ value: c.id, label: c.name, sub: c.designation || c.role || "" }))}
                placeholder="Search contacts…"
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Deal / Opportunity</label>
              <TypeaheadSelect
                value={scheduleForm.oppId}
                onChange={(id) => setScheduleForm(f => ({...f, oppId: id}))}
                options={opps.filter(o => !scheduleForm.accountId || o.accountId === scheduleForm.accountId).map(o => ({ value: o.id, label: o.title }))}
                placeholder="Search deals…"
              />
            </div>
            <div className="form-group">
              <label>Assigned To</label>
              <TypeaheadSelect
                value={scheduleForm.owner}
                onChange={(id) => setScheduleForm(f => ({...f, owner: id}))}
                options={team.map(u => ({ value: u.id, label: u.name, sub: u.role }))}
                placeholder="Search team…"
              />
            </div>
          </div>
          <div className="form-group">
            <label>Notes / Agenda</label>
            <textarea value={scheduleForm.notes} onChange={e=>setScheduleForm(f=>({...f,notes:e.target.value}))} rows={3} placeholder="Agenda, topics to discuss..."/>
          </div>
        </Modal>
      )}

      {confirm&&<Confirm title="Delete Event" msg="Remove this event?" onConfirm={()=>del(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}
export default CalendarView;
