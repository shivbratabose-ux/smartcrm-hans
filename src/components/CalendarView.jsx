import { useState, useMemo } from "react";
import { Plus, Edit2, Trash2, Check, ChevronLeft, ChevronRight, Calendar, Clock, MapPin, Users, Phone, Video, Zap } from "lucide-react";
import { PRODUCTS, TEAM, TEAM_MAP, EVENT_TYPES, EVENT_STATUSES } from '../data/constants';
import { BLANK_EVENT } from '../data/seed';
import { fmt, uid, today, sanitizeObj, hasErrors, softDeleteById } from '../utils/helpers';
import { UserPill, Modal, Confirm, FormError, Empty } from './shared';

const TYPE_COL={"Call":"var(--brand)","Meeting":"var(--purple)","Demo":"var(--orange)","Follow-up":"var(--blue)","Site Visit":"var(--amber)","Presentation":"var(--teal)","Training":"var(--green)","Review":"#8B5CF6"};
const TYPE_ICON={"Call":<Phone size={12}/>,"Meeting":<Users size={12}/>,"Demo":<Zap size={12}/>,"Follow-up":<Clock size={12}/>,"Site Visit":<MapPin size={12}/>,"Presentation":<Video size={12}/>,"Training":<Calendar size={12}/>,"Review":<Check size={12}/>};

const STATUS_COL={"Scheduled":"#3B82F6","Completed":"#22C55E","Cancelled":"#94A3B8","Rescheduled":"#F59E0B","No Show":"#EF4444","Planned":"#6366F1"};

const SOURCE_COL = { activity: "var(--purple)", call: "var(--brand)", event: undefined };

function CalendarView({events,setEvents,activities=[],setActivities,callReports=[],setCallReports,leads=[],accounts,contacts,opps,currentUser,orgUsers,canDelete}) {
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

  const dateStr=(d)=>d?d.toISOString().slice(0,10):"";

  // Unified list of all calendar items from all three sources
  const allItems = useMemo(() => {
    // Own calendar events
    const evItems = events.map(e => ({ ...e, _source: "event" }));

    // Activities → appear on their date
    const actItems = activities
      .filter(a => a.date)
      .map(a => ({
        id:        a.id,
        _source:   "activity",
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

    // Call Reports → appear on their callDate
    const callItems = callReports
      .filter(c => c.callDate)
      .map(c => ({
        id:        c.id,
        _source:   "call",
        _orig:     c,
        date:      c.callDate,
        time:      "09:00",
        endTime:   "",
        title:     `Call: ${c.leadName || c.company || ""}`,
        type:      "Call",
        status:    c.outcome === "Completed" ? "Completed" : "Scheduled",
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

  const itemsOn=(d)=>allItems.filter(e=>e.date===dateStr(d));

  const nav=(dir)=>{
    const d=new Date(viewDate);
    if(view==="month") d.setMonth(d.getMonth()+dir);
    else d.setDate(d.getDate()+dir*7);
    setViewDate(d);
  };

  const todayStats=useMemo(()=>{
    const t=allItems.filter(e=>e.date===today);
    return {total:t.length,scheduled:t.filter(e=>e.status==="Scheduled").length,completed:t.filter(e=>e.status==="Completed").length};
  },[allItems]);

  const overdue=allItems.filter(e=>e.date<today&&e.status==="Scheduled").length;
  const upcoming=allItems.filter(e=>e.date>=today&&e.status==="Scheduled").length;

  const openAdd=(date)=>{
    setForm({...BLANK_EVENT,id:`ev${uid()}`,date:date||today,owner:currentUser});
    setFormErrors({});setModal({mode:"add"});
  };
  const openEdit=(e)=>{
    if(e._source==="activity"||e._source==="call") return; // non-event items are read-only
    setForm({...e,attendees:[...e.attendees]});setFormErrors({});setModal({mode:"edit"});
  };
  const save=()=>{
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

  const markComplete=(item)=>{
    if(item._source==="activity"&&setActivities){
      setActivities(p=>p.map(a=>a.id===item.id?{...a,status:"Completed"}:a));
    } else if(item._source==="call"&&setCallReports){
      setCallReports(p=>p.map(c=>c.id===item.id?{...c,outcome:"Completed"}:c));
    } else {
      setEvents(p=>p.map(e=>e.id===item.id?{...e,status:"Completed"}:e));
    }
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
          <div style={{display:"flex",gap:4,background:"var(--s2)",border:"1px solid var(--border)",borderRadius:8,padding:3}}>
            <button className={`btn btn-xs ${view==="week"?"btn-primary":"btn-sec"}`} style={{border:"none"}} onClick={()=>setView("week")}>Week</button>
            <button className={`btn btn-xs ${view==="month"?"btn-primary":"btn-sec"}`} style={{border:"none"}} onClick={()=>setView("month")}>Month</button>
            <button className={`btn btn-xs ${view==="list"?"btn-primary":"btn-sec"}`} style={{border:"none"}} onClick={()=>setView("list")}>List</button>
          </div>
          <button className="btn btn-sec" onClick={()=>openScheduleCall()}><Phone size={14}/>Schedule Call</button>
          <button className="btn btn-primary" onClick={()=>openAdd()}><Plus size={14}/>New Event</button>
        </div>
      </div>

      {/* Nav bar */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <button className="icon-btn" onClick={()=>nav(-1)}><ChevronLeft size={18}/></button>
        <div style={{fontSize:16,fontWeight:700,minWidth:220,textAlign:"center"}}>{view==="month"?monthName:weekLabel}</div>
        <button className="icon-btn" onClick={()=>nav(1)}><ChevronRight size={18}/></button>
        <button className="btn btn-sec btn-sm" onClick={()=>setViewDate(new Date(today))}>Today</button>
      </div>

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
                      const col=SOURCE_COL[ev._source]||TYPE_COL[ev.type]||"var(--brand)";
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
                  const col=SOURCE_COL[ev._source]||TYPE_COL[ev.type]||"var(--brand)";
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
            <tbody>{[...allItems].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)).map(ev=>{
              const col=SOURCE_COL[ev._source]||TYPE_COL[ev.type]||"var(--brand)";
              const acc=accounts.find(a=>a.id===ev.accountId);
              const isOverdue=ev.date<today&&ev.status==="Scheduled";
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
                <td><div style={{display:"flex",gap:4}}>
                  {ev.status==="Scheduled"&&<button className="btn btn-green btn-xs" onClick={()=>markComplete(ev)} title="Mark complete"><Check size={12}/></button>}
                  {ev._source==="event"&&<button className="icon-btn" onClick={()=>openEdit(ev)}><Edit2 size={14}/></button>}
                  {canDelete&&<button className="icon-btn" onClick={()=>setConfirm(ev)}><Trash2 size={14}/></button>}
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
            {selectedEvent.status==="Scheduled"&&<button className="btn btn-green btn-sm" onClick={()=>{markComplete(selectedEvent);setSelectedEvent(null);}}>Mark Complete</button>}
            {selectedEvent._source==="event"&&<button className="btn btn-primary btn-sm" onClick={()=>{openEdit(selectedEvent);setSelectedEvent(null);}}><Edit2 size={13}/>Edit</button>}
          </>}>
          <div className="dp-grid">
            {[["Type",selectedEvent.type],["Status",selectedEvent.status],["Date",fmt.date(selectedEvent.date)],["Time",`${selectedEvent.time}${selectedEvent.endTime?" – "+selectedEvent.endTime:""}`],["Location",selectedEvent.location||"—"],["Account",accounts.find(a=>a.id===selectedEvent.accountId)?.name||"—"],["Owner",(teamMap[selectedEvent.owner]||TEAM_MAP[selectedEvent.owner])?.name||selectedEvent.owner||"—"]].map(([k,v])=><div key={k} className="dp-row"><span className="dp-key">{k}</span><span className="dp-val">{v}</span></div>)}
          </div>
          {selectedEvent.notes&&<div style={{marginTop:12,background:"var(--s2)",padding:"10px 12px",borderRadius:8,fontSize:13,color:"var(--text2)"}}>{selectedEvent.notes}</div>}
          {(selectedEvent._source==="activity"||selectedEvent._source==="call")&&(
            <div style={{marginTop:12,padding:"8px 12px",background:"var(--s2)",borderRadius:8,fontSize:12,color:"var(--text3)"}}>
              To edit this item, visit the {selectedEvent._source==="activity"?"Activities":"Call Reports"} page.
            </div>
          )}
        </Modal>
      )}

      {/* Add/Edit Modal */}
      {modal&&(
        <Modal title={modal.mode==="add"?"New Event":"Edit Event"} onClose={()=>{setModal(null);setFormErrors({});setForm(BLANK_EVENT);}} lg footer={<><button className="btn btn-sec" onClick={()=>{setModal(null);setFormErrors({});setForm(BLANK_EVENT);}}>Cancel</button><button className="btn btn-primary" onClick={save}><Check size={14}/>Save</button></>}>
          <div className="form-row full"><div className="form-group"><label>Title *</label><input value={form.title} onChange={e=>{setForm(f=>({...f,title:e.target.value}));setFormErrors(e=>({...e,title:undefined}));}} placeholder="e.g. Colossal Avia – GTM Presentation" style={formErrors.title?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.title}/></div></div>
          <div className="form-row three">
            <div className="form-group"><label>Type</label><select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{EVENT_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
            <div className="form-group"><label>Status</label><select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{EVENT_STATUSES.map(s=><option key={s}>{s}</option>)}</select></div>
            <div className="form-group"><label>Owner</label><select value={form.owner} onChange={e=>setForm(f=>({...f,owner:e.target.value}))}>{team.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          </div>
          <div className="form-row three">
            <div className="form-group"><label>Date *</label><input type="date" value={form.date} onChange={e=>{setForm(f=>({...f,date:e.target.value}));setFormErrors(e=>({...e,date:undefined}));}} style={formErrors.date?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.date}/></div>
            <div className="form-group"><label>Start Time</label><input type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))}/></div>
            <div className="form-group"><label>End Time</label><input type="time" value={form.endTime} onChange={e=>setForm(f=>({...f,endTime:e.target.value}))}/></div>
          </div>
          <div className="form-row"><div className="form-group"><label>Account</label><select value={form.accountId} onChange={e=>setForm(f=>({...f,accountId:e.target.value}))}><option value="">None</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div className="form-group"><label>Contact</label><select value={form.contactId} onChange={e=>setForm(f=>({...f,contactId:e.target.value}))}><option value="">None</option>{contacts.filter(c=>!form.accountId||c.accountId===form.accountId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          </div>
          <div className="form-row"><div className="form-group"><label>Opportunity</label><select value={form.oppId} onChange={e=>setForm(f=>({...f,oppId:e.target.value}))}><option value="">None</option>{opps.filter(o=>!form.accountId||o.accountId===form.accountId).map(o=><option key={o.id} value={o.id}>{o.title}</option>)}</select></div>
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
              <select value={scheduleForm.accountId} onChange={e=>setScheduleForm(f=>({...f,accountId:e.target.value}))}>
                <option value="">Select account...</option>
                {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Contact</label>
              <select value={scheduleForm.contactId} onChange={e=>setScheduleForm(f=>({...f,contactId:e.target.value}))}>
                <option value="">Select contact...</option>
                {contacts.filter(c=>!scheduleForm.accountId||c.accountId===scheduleForm.accountId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Deal / Opportunity</label>
              <select value={scheduleForm.oppId} onChange={e=>setScheduleForm(f=>({...f,oppId:e.target.value}))}>
                <option value="">Select deal...</option>
                {opps.filter(o=>!scheduleForm.accountId||o.accountId===scheduleForm.accountId).map(o=><option key={o.id} value={o.id}>{o.title}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Assigned To</label>
              <select value={scheduleForm.owner} onChange={e=>setScheduleForm(f=>({...f,owner:e.target.value}))}>
                {team.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
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
