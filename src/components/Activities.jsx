import { useState, useMemo } from "react";
import {
  PhoneCall, Mail, CalendarDays, Zap, MessageSquare, Globe,
  MapPin, BookOpen, Users, Search, Activity, CalendarPlus,
  CheckSquare, Clock, Building2, TrendingUp, Paperclip,
  Check, Edit2, Trash2, LayoutGrid, List
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ACT_TYPES, ACT_STATUS, TEAM, TEAM_MAP } from '../data/constants';
import { uid, fmt, today, sanitizeObj, validateActivity, hasErrors, softDeleteById } from '../utils/helpers';
import { StatusBadge, UserPill, Modal, Confirm, Empty, FormError, FilesList, PageTip, TypeaheadSelect } from './shared';
import Pagination, { usePagination } from './Pagination';

const BLANK_ACT={title:"",type:"Call",status:"Planned",date:"",time:"",duration:30,accountId:"",contactId:"",oppId:"",owner:"u1",notes:"",outcome:"",files:[]};
const TYPE_COL={Call:"var(--brand)",Email:"var(--blue)",Meeting:"var(--purple)",Demo:"var(--orange)",WhatsApp:"var(--green)",LinkedIn:"#0077B5","Site Visit":"var(--amber)",Presentation:"var(--teal)",Conference:"var(--red-t)"};
const TYPE_ICON={Call:<PhoneCall size={15}/>,Email:<Mail size={15}/>,Meeting:<CalendarDays size={15}/>,Demo:<Zap size={15}/>,WhatsApp:<MessageSquare size={15}/>,LinkedIn:<Globe size={15}/>,"Site Visit":<MapPin size={15}/>,Presentation:<BookOpen size={15}/>,Conference:<Users size={15}/>};

function Activities({activities,setActivities,accounts,contacts,opps,currentUser,files,onAddFile,orgUsers,canDelete}) {
  const team = orgUsers?.length ? orgUsers.filter(u => u.status !== 'Inactive') : TEAM;
  const teamMap = Object.fromEntries(team.map(u => [u.id, u]));
  const [tabS,setTabS]=useState("All");
  const [typeF,setTypeF]=useState("All");
  const [ownerF,setOwnerF]=useState("All");
  const [search,setSearch]=useState("");
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState(BLANK_ACT);
  const [mTab,setMTab]=useState("details");
  const [confirm,setConfirm]=useState(null);
  const [formErrors,setFormErrors]=useState({});
  const [viewMode,setViewMode]=useState("card");

  const filtered=useMemo(()=>{
    let list=[...activities];
    if(tabS==="Upcoming") list=list.filter(a=>a.status==="Planned"&&(a.date>=today));
    else if(tabS==="Today") list=list.filter(a=>a.date===today);
    else if(tabS==="Overdue") list=list.filter(a=>a.status==="Planned"&&a.date<today);
    else if(tabS==="Completed") list=list.filter(a=>a.status==="Completed");
    if(typeF!=="All") list=list.filter(a=>a.type===typeF);
    if(ownerF!=="All") list=list.filter(a=>a.owner===ownerF);
    if(search) list=list.filter(a=>a.title.toLowerCase().includes(search.toLowerCase()));
    return list.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  },[activities,tabS,typeF,ownerF,search]);

  const planned   = activities.filter(a=>a.status==="Planned"&&a.date>=today).length;
  const overdue   = activities.filter(a=>a.status==="Planned"&&a.date<today).length;
  const todayActs = activities.filter(a=>a.date===today).length;

  const openModal=(preset={})=>{
    setForm({...BLANK_ACT,id:`act${uid()}`,date:preset.date||today,owner:currentUser,...preset});
    setMTab("details"); setFormErrors({}); setModal({mode:"add"});
  };
  const openEdit=a=>{setForm({...a,files:a.files||[]});setMTab("details");setFormErrors({});setModal({mode:"edit"});};

  const save=()=>{
    const errs = validateActivity(form);
    if(hasErrors(errs)){ setFormErrors(errs); return; }
    const clean = sanitizeObj(form);
    if(modal.mode==="add") setActivities(p=>[...p,{...clean}]);
    else setActivities(p=>p.map(a=>a.id===clean.id?{...clean}:a));
    setModal(null);setFormErrors({});
  };
  const del=id=>{setActivities(p=>softDeleteById(p,id,currentUser));setConfirm(null);};
  const markComplete=id=>{
    setActivities(p=>p.map(a=>a.id===id?{...a,status:"Completed",outcome:a.outcome||"Positive"}:a));
  };
  const addFileToActivity=(f)=>{
    setForm(prev=>({...prev,files:[...(prev.files||[]),f]}));
  };

  const pg = usePagination(filtered);

  const TABS=[{id:"All",label:"All",count:activities.length},{id:"Upcoming",label:"Upcoming",count:planned},{id:"Today",label:"Today",count:todayActs},{id:"Overdue",label:"Overdue",count:overdue},{id:"Completed",label:"Completed",count:activities.filter(a=>a.status==="Completed").length}];

  // Activity Distribution chart data (weekly view)
  const distData=useMemo(()=>{
    const days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
    const counts=days.map(()=>0);
    activities.forEach(a=>{
      if(a.date){
        const d=new Date(a.date);
        const day=d.getDay(); // 0=Sun
        const idx=day===0?6:day-1;
        counts[idx]++;
      }
    });
    return days.map((d,i)=>({day:d,count:counts[i]}));
  },[activities]);

  // Performance Focus
  const connectedRate=activities.length>0?Math.round(activities.filter(a=>a.outcome==="Positive").length/activities.length*100):0;

  // Type badge helper
  const typeBadgeLabel=(type)=>{
    const map={"Call":"FOLLOW-UP CALL","Email":"EMAIL OUTREACH","Meeting":"DISCOVERY CALL","Demo":"DEMO SESSION","WhatsApp":"WHATSAPP MSG","LinkedIn":"LINKEDIN REACH","Site Visit":"SITE VISIT","Presentation":"PRESENTATION","Conference":"CONFERENCE"};
    return map[type]||type.toUpperCase();
  };
  const typeBadgeColor=(type)=>{
    const map={"Call":"#2563EB","Email":"#7C3AED","Meeting":"#0D9488","Demo":"#D97706","WhatsApp":"#16A34A","LinkedIn":"#0077B5","Site Visit":"#B45309","Presentation":"#0F766E","Conference":"#DC2626"};
    return map[type]||"#64748B";
  };

  // Outcome display helper
  const outcomeStyle=(outcome)=>{
    if(outcome==="Positive") return {bg:"#DCFCE7",color:"#15803D",label:"Connected"};
    if(outcome==="Negative") return {bg:"#FEE2E2",color:"#B91C1C",label:"No Response"};
    if(outcome==="Neutral") return {bg:"#FEF3C7",color:"#92400E",label:"Busy"};
    return {bg:"#F1F5F9",color:"#64748B",label:outcome||"--"};
  };

  // Format schedule for table
  const fmtSchedule=(date,time)=>{
    if(!date) return "--";
    const d=new Date(date+"T"+(time||"00:00"));
    const opts={month:"short",day:"numeric",year:"numeric"};
    let s=d.toLocaleDateString("en-US",opts);
    if(time) s+=" "+d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true});
    return s;
  };

  // Format duration for table
  const fmtDuration=(mins)=>{
    if(!mins) return "--";
    const m=Math.floor(mins);
    const sec=Math.round((mins-m)*60);
    return sec>0?`${m}m ${sec}s`:`${m}m 0s`;
  };

  return (
    <div>
      <PageTip
        id="activities-tip-v1"
        title="Activities tip:"
        text="Log every call, email, or meeting here or from any account/deal page. Use the green + button (bottom-right) to quick-log from anywhere in the app without leaving your current page."
      />
      <div className="pg-head">
        <div>
          <div className="pg-title">Activities</div>
          <div className="pg-sub">{activities.length} total · {planned} upcoming · {overdue>0?<><span style={{color:"var(--red)",fontWeight:700}}>{overdue} overdue</span></>:""}</div>
        </div>
      </div>

      {/* Activity KPI Cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"16px 20px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",opacity:0.8}}>TOTAL CALLS TODAY</div>
          <div style={{fontSize:28,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>
            {activities.filter(a=>a.date===today).length}
          </div>
          {(() => {
            const yesterday = new Date(new Date(today).getTime()-864e5).toISOString().slice(0,10);
            const yCount = activities.filter(a=>a.date===yesterday).length;
            const tCount = activities.filter(a=>a.date===today).length;
            const diff = tCount - yCount;
            return <div style={{fontSize:11,opacity:0.7}}>{yCount===0 ? "No data yesterday" : diff===0 ? "Same as yesterday" : `${diff>0?"+":""}${diff} vs yesterday`}</div>;
          })()}
        </div>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"16px 20px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",opacity:0.8}}>CONNECTED RATE</div>
          <div style={{fontSize:28,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>
            {activities.length > 0 ? Math.round(activities.filter(a=>a.outcome==="Positive").length/activities.length*100) : 0}%
          </div>
        </div>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"16px 20px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",opacity:0.8}}>AVG. DURATION</div>
          <div style={{fontSize:28,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>
            {activities.filter(a=>a.duration>0).length > 0
              ? `${Math.floor(activities.filter(a=>a.duration>0).reduce((s,a)=>s+a.duration,0)/activities.filter(a=>a.duration>0).length)}m`
              : "0m"}
          </div>
          <div style={{fontSize:11,opacity:0.7}}>Minutes per interaction</div>
        </div>
        <div style={{background:"#1B6B5A",borderRadius:12,padding:"16px 20px",color:"white"}}>
          <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",opacity:0.8}}>PENDING FOLLOW-UPS</div>
          <div style={{fontSize:28,fontWeight:800,fontFamily:"'Outfit',sans-serif",marginTop:4}}>
            {activities.filter(a=>a.status==="Planned").length}
          </div>
          <div style={{fontSize:11,opacity:0.7}}>
            {activities.filter(a=>a.status==="Planned"&&a.date<today).length > 0
              ? <span style={{color:"#FCA5A5"}}>{activities.filter(a=>a.status==="Planned"&&a.date<today).length} Urgent Attention</span>
              : "All on track"}
          </div>
        </div>
      </div>

      <div className="act-quick">
        <button className="btn btn-blue" onClick={()=>openModal({type:"Call",status:"Planned",date:today})}><PhoneCall size={14}/>Schedule Call</button>
        <button className="btn btn-primary" onClick={()=>openModal({type:"Meeting",status:"Planned"})}><CalendarPlus size={14}/>Plan Activity</button>
        <button className="btn btn-green" onClick={()=>openModal({type:"Call",status:"Completed",date:today})}><CheckSquare size={14}/>Log Completed</button>
        <button className="btn btn-sec" onClick={()=>openModal({type:"Email",status:"Completed",date:today})}><Mail size={14}/>Log Email</button>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,flexWrap:"wrap"}}>
        <div className="act-tabs">
          {TABS.map(t=>(
            <div key={t.id} className={`act-tab${tabS===t.id?" active":""}`} onClick={()=>setTabS(t.id)}>
              {t.label}{t.count>0&&<span style={{marginLeft:5,fontSize:10,fontWeight:700,background:tabS===t.id?"var(--brand-bg)":"var(--s3)",color:tabS===t.id?"var(--brand)":"var(--text3)",padding:"1px 5px",borderRadius:3}}>{t.count}</span>}
            </div>
          ))}
        </div>
        <div className="filter-search" style={{maxWidth:220}}><Search size={14} style={{color:"var(--text3)",flexShrink:0}}/><input placeholder="Search activities…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <select className="filter-select" value={typeF} onChange={e=>setTypeF(e.target.value)}><option>All</option>{ACT_TYPES.map(t=><option key={t}>{t}</option>)}</select>
        <TypeaheadSelect
          size="filter" allowAll allLabel="All Owners" placeholder="Search owners…"
          value={ownerF} onChange={setOwnerF}
          options={team.map(u=>({ value:u.id, label:u.name, sub:u.role }))}
        />
        <div style={{display:"flex",marginLeft:"auto",background:"var(--s2)",borderRadius:8,padding:2}}>
          <button onClick={()=>setViewMode("card")} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 12px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:viewMode==="card"?"white":"transparent",color:viewMode==="card"?"var(--brand)":"var(--text3)",boxShadow:viewMode==="card"?"0 1px 3px rgba(0,0,0,0.1)":"none"}}><LayoutGrid size={13}/>Card View</button>
          <button onClick={()=>setViewMode("table")} style={{display:"flex",alignItems:"center",gap:4,padding:"5px 12px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:viewMode==="table"?"white":"transparent",color:viewMode==="table"?"var(--brand)":"var(--text3)",boxShadow:viewMode==="table"?"0 1px 3px rgba(0,0,0,0.1)":"none"}}><List size={13}/>Table View</button>
        </div>
      </div>

      {filtered.length===0?(
        <div className="card"><Empty icon={<Activity size={22}/>} title="No activities found" sub="Schedule a call, plan an activity, or log a completed interaction."/></div>
      ): viewMode==="card" ? (
        pg.paged.map(a=>{
          const acc=accounts.find(x=>x.id===a.accountId);
          const con=contacts.find(x=>x.id===a.contactId);
          const opp=opps.find(x=>x.id===a.oppId);
          const col=TYPE_COL[a.type]||"var(--text3)";
          const ov=a.status==="Planned"&&a.date<today;
          return (
            <div key={a.id} className={`act-card ${a.status==="Planned"&&!ov?"planned":ov?"overdue":a.status==="Completed"?"completed":""}`}>
              <div className="act-card-icon" style={{background:col+"18",color:col}}>{TYPE_ICON[a.type]||<Activity size={15}/>}</div>
              <div className="act-card-main">
                <div className="act-card-title">{a.title}</div>
                <div className="act-card-meta">
                  <span style={{fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:4,background:col+"18",color:col}}>{a.type}</span>
                  <StatusBadge status={a.status}/>
                  {ov&&<span className="act-overdue-badge">OVERDUE</span>}
                  <span style={{fontSize:11,color:"var(--text3)"}}><Clock size={10} style={{marginRight:3,verticalAlign:"middle"}}/>{fmt.date(a.date)}{a.time?" · "+fmt.time(a.time):""}{a.duration?" · "+a.duration+"min":""}</span>
                  {a.outcome&&<span style={{fontSize:11,padding:"1px 6px",borderRadius:4,background:a.outcome==="Positive"?"var(--green-bg)":a.outcome==="Negative"?"var(--red-bg)":"var(--s3)",color:a.outcome==="Positive"?"var(--green-t)":a.outcome==="Negative"?"var(--red-t)":"var(--text3)"}}>{a.outcome}</span>}
                </div>
                <div className="act-card-links">
                  {acc&&<span className="act-card-link"><Building2 size={10}/>{acc.name}</span>}
                  {con&&<span className="act-card-link"><Users size={10}/>{con.name}</span>}
                  {opp&&<span className="act-card-link"><TrendingUp size={10}/>{opp.title.substring(0,40)}{opp.title.length>40?"…":""}</span>}
                  <UserPill uid={a.owner}/>
                  {(a.files||[]).length>0&&<span className="act-card-link"><Paperclip size={10}/>{a.files.length} file{a.files.length>1?"s":""}</span>}
                </div>
                {a.notes&&<div style={{fontSize:12,color:"var(--text2)",marginTop:6,padding:"6px 9px",background:"var(--s2)",borderRadius:6,borderLeft:"2px solid var(--border2)"}}>{a.notes}</div>}
              </div>
              <div className="act-card-actions">
                {a.status==="Planned"&&<button className="btn btn-green btn-xs" onClick={()=>markComplete(a.id)} title="Mark complete"><Check size={12}/></button>}
                <button className="icon-btn" aria-label="Edit" onClick={()=>openEdit(a)}><Edit2 size={14}/></button>
                {canDelete&&<button className="icon-btn" aria-label="Delete" onClick={()=>setConfirm(a.id)}><Trash2 size={14}/></button>}
              </div>
            </div>
          );
        })
      ) : (
        /* Table View */
        <div className="card" style={{padding:0,overflow:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:"var(--s2)",textAlign:"left"}}>
                <th style={{padding:"10px 14px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"var(--text3)",borderBottom:"1px solid var(--border)"}}>Schedule</th>
                <th style={{padding:"10px 14px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"var(--text3)",borderBottom:"1px solid var(--border)"}}>Lead & Customer</th>
                <th style={{padding:"10px 14px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"var(--text3)",borderBottom:"1px solid var(--border)"}}>Type</th>
                <th style={{padding:"10px 14px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"var(--text3)",borderBottom:"1px solid var(--border)"}}>Duration</th>
                <th style={{padding:"10px 14px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"var(--text3)",borderBottom:"1px solid var(--border)"}}>Outcome</th>
                <th style={{padding:"10px 14px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"var(--text3)",borderBottom:"1px solid var(--border)"}}>Assignee</th>
                <th style={{padding:"10px 14px",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:"var(--text3)",borderBottom:"1px solid var(--border)"}}>Action</th>
              </tr>
            </thead>
            <tbody>
              {pg.paged.map(a=>{
                const acc=accounts.find(x=>x.id===a.accountId);
                const con=contacts.find(x=>x.id===a.contactId);
                const owner=teamMap[a.owner];
                const oc=outcomeStyle(a.outcome);
                const tc=typeBadgeColor(a.type);
                return (
                  <tr key={a.id} style={{borderBottom:"1px solid var(--border)"}}>
                    <td style={{padding:"12px 14px",whiteSpace:"nowrap"}}>
                      <div style={{fontWeight:600,fontSize:13}}>{fmtSchedule(a.date,a.time)}</div>
                    </td>
                    <td style={{padding:"12px 14px"}}>
                      <div style={{fontWeight:600,fontSize:12.5}}>#{a.id?.toUpperCase().replace("ACT","LD-")}{acc?` (${acc.name})`:""}</div>
                      {con&&<div style={{fontSize:11.5,color:"var(--text3)",marginTop:2}}>{con.name}</div>}
                    </td>
                    <td style={{padding:"12px 14px"}}>
                      <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:4,background:tc+"18",color:tc,textTransform:"uppercase",letterSpacing:"0.04em",whiteSpace:"nowrap"}}>{typeBadgeLabel(a.type)}</span>
                    </td>
                    <td style={{padding:"12px 14px",fontWeight:600,fontSize:13}}>{fmtDuration(a.duration)}</td>
                    <td style={{padding:"12px 14px"}}>
                      <span style={{fontSize:11,fontWeight:600,padding:"3px 8px",borderRadius:4,background:oc.bg,color:oc.color}}>{oc.label}</span>
                    </td>
                    <td style={{padding:"12px 14px"}}>
                      {owner&&(
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:28,height:28,borderRadius:"50%",background:"var(--brand)",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700}}>{owner.initials}</div>
                          <div>
                            <div style={{fontSize:12,fontWeight:600}}>{owner.name.split(" ")[0]} {owner.name.split(" ").pop()?.charAt(0)}.</div>
                            <div style={{fontSize:10,color:"var(--text3)"}}>{owner.role}</div>
                          </div>
                        </div>
                      )}
                    </td>
                    <td style={{padding:"12px 14px"}}>
                      <button onClick={()=>openEdit(a)} style={{background:"none",border:"none",color:"var(--brand)",fontSize:12,fontWeight:600,cursor:"pointer",textDecoration:"underline"}}>View Details</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination {...pg} />

      {/* Activity Distribution + Performance Focus */}
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16,marginTop:20}}>
        <div className="card" style={{padding:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:"var(--text1)"}}>Activity Distribution</div>
              <div style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text3)",marginTop:2}}>Weekly View</div>
            </div>
          </div>
          <div style={{height:220}}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distData} barSize={36}>
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize:12,fill:"#64748B"}}/>
                <YAxis axisLine={false} tickLine={false} tick={{fontSize:11,fill:"#94A3B8"}} allowDecimals={false}/>
                <Tooltip contentStyle={{borderRadius:8,fontSize:12,border:"1px solid #E2E8F0"}} cursor={{fill:"rgba(0,0,0,0.04)"}}/>
                <Bar dataKey="count" name="Activities" fill="#1B6B5A" radius={[6,6,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card" style={{padding:20,display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <div style={{fontSize:15,fontWeight:700,color:"var(--text1)",marginBottom:8}}>Performance Focus</div>
          <p style={{fontSize:12.5,color:"var(--text2)",lineHeight:1.6,marginBottom:20}}>
            Monthly goal is 85% connection rate for all high-value leads. Keep pushing to improve outreach quality and follow-up timing.
          </p>
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--text3)"}}>Progress</span>
              <span style={{fontSize:13,fontWeight:800,color:"var(--brand)"}}>{connectedRate}%</span>
            </div>
            <div style={{height:10,background:"var(--s3)",borderRadius:6,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${Math.min(connectedRate,100)}%`,background:"linear-gradient(90deg,#1B6B5A,#22C55E)",borderRadius:6,transition:"width 0.5s ease"}}/>
            </div>
            <div style={{fontSize:11,color:"var(--text3)",marginTop:6}}>Target: 85%</div>
          </div>
        </div>
      </div>

      {modal&&(
        <Modal title={modal.mode==="add"?`New Activity`:`Edit Activity`} onClose={()=>{setModal(null);setFormErrors({});setForm(BLANK_ACT);}} lg
          footer={<><button className="btn btn-sec" onClick={()=>{setModal(null);setFormErrors({});setForm(BLANK_ACT);}}>Cancel</button><button className="btn btn-primary" onClick={save}><Check size={14}/>{modal.mode==="add"?"Save Activity":"Update Activity"}</button></>}>
          <div className="modal-tabs">
            {["details","links","files"].map(t=><div key={t} className={`modal-tab${mTab===t?" active":""}`} onClick={()=>setMTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}{t==="files"&&(form.files||[]).length>0?` (${form.files.length})`:""}</div>)}
          </div>

          {mTab==="details"&&(
            <div>
              <div className="form-row full"><div className="form-group"><label>Activity Title *</label><input value={form.title} onChange={e=>{setForm(f=>({...f,title:e.target.value}));setFormErrors(e=>({...e,title:undefined}));}} placeholder="e.g. Colossal – GTM Proposal Walkthrough Call" style={formErrors.title?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.title}/></div></div>
              <div className="form-row three">
                <div className="form-group"><label>Type</label><select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{ACT_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                <div className="form-group"><label>Status</label><select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>{ACT_STATUS.map(s=><option key={s}>{s}</option>)}</select></div>
                <div className="form-group"><label>Owner</label><select value={form.owner} onChange={e=>setForm(f=>({...f,owner:e.target.value}))}>{team.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
              </div>
              <div className="form-row three">
                <div className="form-group"><label>Date *</label><input type="date" value={form.date} onChange={e=>{setForm(f=>({...f,date:e.target.value}));setFormErrors(e=>({...e,date:undefined}));}} style={formErrors.date?{borderColor:"#DC2626"}:{}}/><FormError error={formErrors.date}/></div>
                <div className="form-group"><label>Time</label><input type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))}/></div>
                <div className="form-group"><label>Duration (min)</label><input type="number" value={form.duration} onChange={e=>setForm(f=>({...f,duration:+e.target.value}))} min={0} step={15}/></div>
              </div>
              {form.status==="Completed"&&(
                <div className="form-row"><div className="form-group"><label>Outcome</label><select value={form.outcome} onChange={e=>setForm(f=>({...f,outcome:e.target.value}))}><option value="">Select…</option><option>Positive</option><option>Neutral</option><option>Negative</option></select></div></div>
              )}
              <div className="form-group"><label>Notes / Discussion Points</label><textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Key discussion points, decisions, next actions…" rows={4}/></div>
            </div>
          )}

          {mTab==="links"&&(
            <div>
              <p style={{fontSize:12.5,color:"var(--text3)",marginBottom:16}}>Link this activity to an account, contact, and/or opportunity. All three are optional but help with reporting and context.</p>
              <div className="form-row full"><div className="form-group"><label>Account</label><select value={form.accountId} onChange={e=>setForm(f=>({...f,accountId:e.target.value,contactId:"",oppId:""}))}>
                <option value="">Select account…</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} ({a.country})</option>)}
              </select></div></div>
              <div className="form-row full"><div className="form-group"><label>Contact</label><select value={form.contactId} onChange={e=>setForm(f=>({...f,contactId:e.target.value}))}>
                <option value="">Select contact…</option>
                {contacts.filter(c=>!form.accountId||c.accountId===form.accountId).map(c=><option key={c.id} value={c.id}>{c.name} – {c.role}</option>)}
              </select></div></div>
              <div className="form-row full"><div className="form-group"><label>Opportunity</label><select value={form.oppId} onChange={e=>setForm(f=>({...f,oppId:e.target.value}))}>
                <option value="">Select opportunity…</option>
                {opps.filter(o=>!form.accountId||o.accountId===form.accountId).map(o=><option key={o.id} value={o.id}>{o.title}</option>)}
              </select></div></div>
              {form.accountId&&(
                <div style={{background:"var(--brand-bg)",borderRadius:8,padding:"10px 14px",marginTop:8,fontSize:12.5,color:"var(--brand-d)"}}>
                  <strong>{accounts.find(a=>a.id===form.accountId)?.name}</strong> · {accounts.find(a=>a.id===form.accountId)?.country}
                  {form.contactId&&<><br/><strong>Contact:</strong> {contacts.find(c=>c.id===form.contactId)?.name}</>}
                  {form.oppId&&<><br/><strong>Deal:</strong> {opps.find(o=>o.id===form.oppId)?.title}</>}
                </div>
              )}
            </div>
          )}

          {mTab==="files"&&(
            <div>
              <p style={{fontSize:12.5,color:"var(--text3)",marginBottom:14}}>Attach files to this activity (proposals, meeting notes, screenshots). Files are stored as references.</p>
              <FilesList files={form.files||[]} currentUser={currentUser} onAdd={f=>addFileToActivity(f)}/>
            </div>
          )}
        </Modal>
      )}

      {confirm&&<Confirm title="Delete Activity" msg="Remove this activity permanently?" onConfirm={()=>del(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  );
}

export default Activities;
