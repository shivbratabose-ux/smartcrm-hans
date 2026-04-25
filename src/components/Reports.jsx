import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area, RadarChart,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ComposedChart
} from "recharts";
import {
  PRODUCTS, PROD_MAP, STAGES, STAGE_PROB, STAGE_COL, TEAM, TEAM_MAP,
  PRIORITIES, LEAD_STAGES, CALL_TYPES, OPP_STAGES, OPP_STAGE_MAP,
  COUNTRIES, REGIONS, ACT_TYPES, CUST_TYPES, AGEING_BUCKETS,
  SLA_HOURS, TICKET_TYPES
} from "../data/constants";
import { today, fmt, isOverdue, getScopedUserIds, isGlobalRole } from "../utils/helpers";
import { PageTip } from "./shared";
import {
  TrendingUp, TrendingDown, Target, AlertTriangle, CheckCircle, Clock,
  BarChart3, PieChart as PieIcon, Users, Phone, Shield, Zap, DollarSign,
  Calendar, Activity, ArrowUp, ArrowDown, ArrowRight, Eye, Filter,
  Download, RefreshCw, ChevronDown, ChevronUp, Star, Award, Flame,
  AlertCircle, XCircle, Timer, FileText, MapPin, Building2, Layers,
  Briefcase, PhoneCall, Mail, MessageSquare, Globe
} from "lucide-react";

const CL = ["#1B6B5A","#2563EB","#7C3AED","#D97706","#0D9488","#DC2626","#F97316","#22C55E","#EC4899","#6366F1","#14B8A6","#F43F5E"];
const daysBetween = (a,b) => { if(!a||!b) return 0; return Math.round((new Date(b)-new Date(a))/86400000); };
const pct = (n,d) => d ? Math.round((n/d)*100) : 0;
const crFmt = v => `₹${typeof v==='number' ? v.toFixed(1) : v}L`;

/* ─── Mini KPI Card ─── */
const K = ({label,value,sub,color,icon:Icon,trend,trendVal}) => (
  <div style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1px solid #E2E8F0",position:"relative",overflow:"hidden"}}>
    <div style={{position:"absolute",top:0,left:0,width:4,height:"100%",background:color||"#1B6B5A",borderRadius:"12px 0 0 12px"}}/>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
      <div>
        <div style={{fontSize:11,color:"#64748B",fontWeight:600,textTransform:"uppercase",letterSpacing:.5}}>{label}</div>
        <div style={{fontSize:22,fontWeight:700,color:color||"#0D1F2D",marginTop:2}}>{value}</div>
        {sub && <div style={{fontSize:11,color:"#94A3B8",marginTop:2}}>{sub}</div>}
      </div>
      <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
        {Icon && <Icon size={18} color={color||"#1B6B5A"}/>}
        {trend && <div style={{display:"flex",alignItems:"center",gap:2,fontSize:11,fontWeight:600,color:trend==="up"?"#16A34A":"#DC2626"}}>
          {trend==="up"?<ArrowUp size={12}/>:<ArrowDown size={12}/>}{trendVal}
        </div>}
      </div>
    </div>
  </div>
);

/* ─── Section Card ─── */
const Card = ({title,subtitle,children,action,fullWidth}) => (
  <div style={{background:"#fff",borderRadius:12,padding:"16px 18px",border:"1px solid #E2E8F0",gridColumn:fullWidth?"1/-1":"auto"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <div>
        <div style={{fontSize:14,fontWeight:700,color:"#0D1F2D"}}>{title}</div>
        {subtitle && <div style={{fontSize:11,color:"#94A3B8"}}>{subtitle}</div>}
      </div>
      {action}
    </div>
    {children}
  </div>
);

/* ─── Data Table ─── */
const MiniTable = ({columns,data,maxRows=8}) => (
  <div style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
      <thead><tr>{columns.map((c,i)=><th key={i} style={{textAlign:c.align||"left",padding:"6px 8px",borderBottom:"2px solid #E2E8F0",color:"#64748B",fontWeight:600,fontSize:11,textTransform:"uppercase"}}>{c.label}</th>)}</tr></thead>
      <tbody>{data.slice(0,maxRows).map((row,ri)=><tr key={ri} style={{borderBottom:"1px solid #F1F5F9"}}>
        {columns.map((c,ci)=><td key={ci} style={{padding:"7px 8px",textAlign:c.align||"left",color:c.color?c.color(row):"#334155",fontWeight:c.bold?"600":"400"}}>{c.render?c.render(row):row[c.key]}</td>)}
      </tr>)}</tbody>
    </table>
  </div>
);

/* ─── Status Badge ─── */
const Badge = ({text,color}) => (
  <span style={{padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:600,background:color+"18",color}}>{text}</span>
);

/* ─── Progress Bar ─── */
const Progress = ({value,max,color,height=6}) => (
  <div style={{background:"#F1F5F9",borderRadius:height,height,width:"100%",overflow:"hidden"}}>
    <div style={{width:`${pct(value,max)}%`,height:"100%",background:color||"#1B6B5A",borderRadius:height,transition:"width 0.3s"}}/>
  </div>
);

/* ═══════════════════════════════════════════════════════════════ */
function Reports({accounts,opps,tickets,activities,leads,callReports,collections,targets,contacts,contracts,quotes,currentUser,orgUsers,masters}) {
  // Stage list + color map are now editable in Masters → Pipeline Stages.
  // Fall back to bundled defaults when the masters slot is empty so a fresh
  // install renders sensible charts before anyone customises stages.
  const stageList = (masters?.stages && masters.stages.length)
    ? masters.stages
    : STAGES.map(s => ({ name: s, color: STAGE_COL[s] || "#94A3B8" }));
  const reportStages = stageList.map(s => s.name);
  const reportStageColor = Object.fromEntries(stageList.map(s => [s.name, s.color || "#94A3B8"]));
  const [tab,setTab]=useState("executive");
  const [periodFilter,setPeriodFilter]=useState("all");
  const [ownerFilter,setOwnerFilter]=useState("all");
  const [expandedSection,setExpandedSection]=useState(null);

  // Hierarchy scope: global roles see the whole org; everyone else sees
  // themselves + their downline (solid + dotted line). All TEAM-derived
  // rollups, dropdowns, and KPIs below should respect this.
  const _reportScopedIds = useMemo(() => getScopedUserIds(currentUser, orgUsers), [currentUser, orgUsers]);
  const _reportIsGlobal = useMemo(() => isGlobalRole(currentUser, orgUsers), [currentUser, orgUsers]);
  const _scopedTeamSrc = useMemo(() => {
    const src = orgUsers?.length ? orgUsers.filter(u => u.active !== false) : TEAM;
    return _reportIsGlobal ? src : src.filter(u => _reportScopedIds.has(u.id));
  }, [orgUsers, _reportIsGlobal, _reportScopedIds]);

  // ── Filtered opps based on period ──
  const filteredOpps = useMemo(()=>{
    if(periodFilter==="all") return opps;
    const now = new Date(today);
    const start = new Date(today);
    if(periodFilter==="month") start.setDate(1);
    else if(periodFilter==="quarter") { start.setMonth(Math.floor(start.getMonth()/3)*3); start.setDate(1); }
    else if(periodFilter==="year") { start.setMonth(0); start.setDate(1); }
    return opps.filter(o=>new Date(o.closeDate)>=start && new Date(o.closeDate)<=now);
  },[opps,periodFilter]);

  const ownerOpps = useMemo(()=> ownerFilter==="all" ? filteredOpps : filteredOpps.filter(o=>o.owner===ownerFilter), [filteredOpps,ownerFilter]);

  // ═══════════════════════════════════════════════════════════════
  // COMPUTED METRICS
  // ═══════════════════════════════════════════════════════════════

  const metrics = useMemo(()=>{
    const activeOpps = opps.filter(o=>!["Won","Lost","closed_won","closed_lost"].includes(o.stage));
    const wonOpps = opps.filter(o=>o.stage==="Won"||o.stage==="closed_won");
    const lostOpps = opps.filter(o=>o.stage==="Lost"||o.stage==="closed_lost");
    const totalPipeline = activeOpps.reduce((s,o)=>s+o.value,0);
    const weightedPipeline = activeOpps.reduce((s,o)=>s+(o.value*(o.probability||0)/100),0);
    const wonValue = wonOpps.reduce((s,o)=>s+o.value,0);
    const lostValue = lostOpps.reduce((s,o)=>s+o.value,0);
    const winRate = pct(wonOpps.length, wonOpps.length+lostOpps.length);
    const avgDealSize = activeOpps.length ? (totalPipeline/activeOpps.length) : 0;
    const totalARR = accounts.reduce((s,a)=>s+a.arrRevenue,0);

    // Velocity
    const closedDeals = wonOpps.filter(o=>o.closeDate);
    const avgCycleTime = closedDeals.length ? Math.round(closedDeals.reduce((s,o)=>s+daysBetween(o.createdDate||"2025-12-01",o.closeDate),0)/closedDeals.length) : 0;

    // Activity metrics
    const totalActivities = activities.length;
    const completedActs = activities.filter(a=>a.status==="Completed").length;
    const totalCalls = (callReports||[]).length;

    // Lead metrics
    const totalLeads = (leads||[]).length;
    const convertedLeads = (leads||[]).filter(l=>l.stage==="Converted"||l.stage==="SAL").length;
    const leadConvRate = pct(convertedLeads, totalLeads);

    // Support metrics
    const openTickets = tickets.filter(t=>!["Resolved","Closed"].includes(t.status)).length;
    const criticalTickets = tickets.filter(t=>t.priority==="Critical"&&!["Resolved","Closed"].includes(t.status)).length;
    const avgResTime = (() => {
      const resolved = tickets.filter(t=>t.resolved && t.created);
      return resolved.length ? Math.round(resolved.reduce((s,t)=>s+daysBetween(t.created,t.resolved),0)/resolved.length) : 0;
    })();

    // Collection metrics
    const totalBilled = (collections||[]).reduce((s,c)=>s+c.billedAmount,0);
    const totalCollected = (collections||[]).reduce((s,c)=>s+c.collectedAmount,0);
    const totalPending = (collections||[]).reduce((s,c)=>s+c.pendingAmount,0);
    const collectionRate = pct(totalCollected, totalBilled);

    // Build last-activity map per opp (O(n) instead of O(n²))
    const lastActByOpp = {};
    activities.forEach(a => {
      if (!a.oppId) return;
      if (!lastActByOpp[a.oppId] || (a.date||"") > (lastActByOpp[a.oppId].date||"")) lastActByOpp[a.oppId] = a;
    });

    // Stalled deals (no activity in 14+ days)
    const stalledDeals = activeOpps.filter(o=>{
      const lastAct = lastActByOpp[o.id];
      return !lastAct || daysBetween(lastAct.date, today) > 14;
    });

    // At-risk deals (no activity 7-14 days)
    const atRiskDeals = activeOpps.filter(o=>{
      const lastAct = lastActByOpp[o.id];
      if(!lastAct) return false;
      const days = daysBetween(lastAct.date, today);
      return days >= 7 && days <= 14;
    });

    // Overdue collections
    const overdueCollections = (collections||[]).filter(c=>c.status==="Overdue"||isOverdue(c.dueDate));

    // Contracts expiring soon
    const expiringContracts = (contracts||[]).filter(c=>{
      if(!c.endDate) return false;
      const daysLeft = daysBetween(today, c.endDate);
      return daysLeft >= 0 && daysLeft <= 30;
    });

    return {
      activeOpps,wonOpps,lostOpps,totalPipeline,weightedPipeline,wonValue,lostValue,
      winRate,avgDealSize,totalARR,avgCycleTime,totalActivities,completedActs,totalCalls,
      totalLeads,convertedLeads,leadConvRate,openTickets,criticalTickets,avgResTime,
      totalBilled,totalCollected,totalPending,collectionRate,stalledDeals,atRiskDeals,
      overdueCollections,expiringContracts
    };
  },[opps,activities,leads,tickets,collections,contracts,accounts,callReports]);

  // ── Pipeline by Stage ──
  const stageData = useMemo(()=> reportStages.map(s=>({
    stage:s, count:ownerOpps.filter(o=>o.stage===s).length,
    value:ownerOpps.filter(o=>o.stage===s).reduce((a,o)=>a+o.value,0),
    color:reportStageColor[s] || "#94A3B8"
  })),[ownerOpps,reportStages,reportStageColor]);

  // ── Pipeline by Country ──
  const countryData = useMemo(()=>[...new Set(ownerOpps.map(o=>o.country))].map(c=>({
    country:c, value:ownerOpps.filter(o=>o.country===c&&!["Won","Lost"].includes(o.stage)).reduce((a,o)=>a+o.value,0)
  })).filter(c=>c.value>0).sort((a,b)=>b.value-a.value).slice(0,8),[ownerOpps]);

  // ── Pipeline by Product ──
  const prodPipeline = useMemo(()=>PRODUCTS.map(p=>({
    name:p.name, color:p.color,
    arr:accounts.filter(a=>a.products?.includes(p.id)).reduce((s,a)=>s+a.arrRevenue,0),
    pipeline:ownerOpps.filter(o=>o.products?.includes(p.id)&&!["Won","Lost"].includes(o.stage)).reduce((s,o)=>s+o.value,0),
    won:ownerOpps.filter(o=>o.products?.includes(p.id)&&o.stage==="Won").reduce((s,o)=>s+o.value,0),
    deals:ownerOpps.filter(o=>o.products?.includes(p.id)&&!["Won","Lost"].includes(o.stage)).length,
    accounts:new Set(accounts.filter(a=>a.products?.includes(p.id)).map(a=>a.id)).size
  })).filter(p=>p.arr+p.pipeline+p.won>0),[accounts,ownerOpps]);

  // ── Team Performance ──
  // Use orgUsers (live) instead of the static TEAM constant so dynamically added users appear.
  const _reportTeam = _scopedTeamSrc;
  const teamPerf = useMemo(()=>_reportTeam.map(u=>{
    const userOpps = opps.filter(o=>o.owner===u.id);
    const active = userOpps.filter(o=>!["Won","Lost"].includes(o.stage));
    const won = userOpps.filter(o=>o.stage==="Won");
    const lost = userOpps.filter(o=>o.stage==="Lost");
    const userActs = activities.filter(a=>a.owner===u.id);
    const userCalls = (callReports||[]).filter(r=>r.marketingPerson===u.id);
    // leads use assignedTo, not owner
    const userLeads = (leads||[]).filter(l=>l.assignedTo===u.id);
    const userTargets = (targets||[]).filter(t=>t.userId===u.id&&t.period==="2026-Q1");
    const targetVal = userTargets.reduce((s,t)=>s+t.targetValue,0);
    const achievedVal = userTargets.reduce((s,t)=>s+t.achievedValue,0);
    const pipelineVal = active.reduce((s,o)=>s+o.value,0);
    const wonVal = won.reduce((s,o)=>s+o.value,0);
    const wr = pct(won.length, won.length+lost.length);
    // Activity score (calls+meetings+demos weighted)
    const actScore = userCalls.length*1 + userActs.filter(a=>a.type==="Meeting").length*3 + userActs.filter(a=>a.type==="Demo").length*5;
    return {
      id:u.id, name:u.name, firstName:u.name.split(" ")[0], role:u.role, initials:u.initials,
      activeDeals:active.length, pipelineVal, wonDeals:won.length, wonVal, lostDeals:lost.length,
      winRate:wr, calls:userCalls.length, activities:userActs.length, leads:userLeads.length,
      targetVal, achievedVal, targetPct:pct(achievedVal,targetVal), actScore
    };
  }).filter(u=>u.activeDeals>0||u.wonDeals>0||u.calls>0||u.activities>0),[_reportTeam,opps,activities,callReports,leads,targets]);

  // ── Lead Analytics ──
  const leadData = useMemo(()=>{
    if(!leads?.length) return {stages:[],sources:[],temps:[],funnel:[],aging:[]};
    const stages = LEAD_STAGES.filter(s=>s.id!=="NA").map(s=>({id:s.id,name:s.name.split("–")[0].trim(),count:leads.filter(l=>l.stage===s.id).length,color:s.color}));
    const sources = [...new Set(leads.map(l=>l.source))].map(s=>({source:s,count:leads.filter(l=>l.source===s).length})).sort((a,b)=>b.count-a.count);
    const temps = ["Hot","Warm","Cool","Cold"].map(t=>({temp:t,count:leads.filter(l=>l.temperature===t).length}));
    const aging = [
      {label:"< 7 days",count:leads.filter(l=>daysBetween(l.createdDate,today)<7).length,color:"#22C55E"},
      {label:"7-14 days",count:leads.filter(l=>{const d=daysBetween(l.createdDate,today);return d>=7&&d<14;}).length,color:"#F59E0B"},
      {label:"14-30 days",count:leads.filter(l=>{const d=daysBetween(l.createdDate,today);return d>=14&&d<30;}).length,color:"#F97316"},
      {label:"30+ days",count:leads.filter(l=>daysBetween(l.createdDate,today)>=30).length,color:"#DC2626"},
    ];
    return {stages,sources,temps,aging};
  },[leads]);

  // ── Call Analytics ──
  const callData = useMemo(()=>{
    if(!callReports?.length) return {byType:[],byPerson:[],byOutcome:[],byObjective:[],trend:[]};
    const byType = CALL_TYPES.map(t=>({type:t,count:callReports.filter(r=>r.callType===t).length})).filter(c=>c.count>0);
    const byPerson = _scopedTeamSrc.map(u=>({name:u.name.split(" ")[0],calls:callReports.filter(r=>r.marketingPerson===u.id).length})).filter(c=>c.calls>0).sort((a,b)=>b.calls-a.calls);
    const byOutcome = [...new Set(callReports.map(r=>r.outcome))].map(o=>({outcome:o||"N/A",count:callReports.filter(r=>(r.outcome||"N/A")===o).length})).sort((a,b)=>b.count-a.count);
    const byObjective = [...new Set(callReports.map(r=>r.objective))].filter(Boolean).map(o=>({objective:o.length>20?o.slice(0,20)+"...":o,full:o,count:callReports.filter(r=>r.objective===o).length})).sort((a,b)=>b.count-a.count).slice(0,8);
    return {byType,byPerson,byOutcome,byObjective};
  },[callReports,_scopedTeamSrc]);

  // ── Collection Analytics ──
  const collData = useMemo(()=>{
    if(!collections?.length) return {byAccount:[],aging:[],byStatus:[]};
    const byAccount = {};
    collections.forEach(c=>{
      const name = accounts.find(a=>a.id===c.accountId)?.name||"Unknown";
      if(!byAccount[name]) byAccount[name]={name,billed:0,collected:0,pending:0};
      byAccount[name].billed+=c.billedAmount;
      byAccount[name].collected+=c.collectedAmount;
      byAccount[name].pending+=c.pendingAmount;
    });
    const aging = AGEING_BUCKETS.map(b=>{
      const [min,max] = b.includes("+") ? [parseInt(b),9999] : b.split("-").map(Number);
      const inBucket = collections.filter(c=>{
        const days = daysBetween(c.dueDate, today);
        return days >= min && days < (max||9999);
      });
      return {bucket:b+"d",count:inBucket.length,value:inBucket.reduce((s,c)=>s+c.pendingAmount,0)};
    }).filter(b=>b.count>0);
    const byStatus = [...new Set(collections.map(c=>c.status))].map(s=>({status:s,count:collections.filter(c=>c.status===s).length,value:collections.filter(c=>c.status===s).reduce((sum,c)=>sum+c.pendingAmount,0)}));
    return {byAccount:Object.values(byAccount).sort((a,b)=>b.pending-a.pending).slice(0,10),aging,byStatus};
  },[collections,accounts]);

  // ── Support Analytics ──
  const supportData = useMemo(()=>{
    const byProduct = PRODUCTS.map(p=>({name:p.name,open:tickets.filter(t=>t.product===p.id&&!["Resolved","Closed"].includes(t.status)).length,resolved:tickets.filter(t=>t.product===p.id&&["Resolved","Closed"].includes(t.status)).length})).filter(p=>p.open+p.resolved>0);
    const byPriority = PRIORITIES.map((p,i)=>({name:p,value:tickets.filter(t=>t.priority===p&&!["Resolved","Closed"].includes(t.status)).length,color:["#DC2626","#F97316","#3B82F6","#94A3B8"][i]})).filter(p=>p.value>0);
    const byType = TICKET_TYPES.map(t=>({type:t.length>15?t.slice(0,15)+"...":t,count:tickets.filter(tk=>tk.type===t).length})).filter(t=>t.count>0);
    const slaBreaches = tickets.filter(t=>{
      if(["Resolved","Closed"].includes(t.status)) return false;
      const hrs = daysBetween(t.created, today)*24;
      return hrs > (SLA_HOURS[t.priority]||48);
    });
    const byAssignee = _scopedTeamSrc.map(u=>({name:u.name.split(" ")[0],open:tickets.filter(t=>t.assigned===u.id&&!["Resolved","Closed"].includes(t.status)).length,resolved:tickets.filter(t=>t.assigned===u.id&&["Resolved","Closed"].includes(t.status)).length})).filter(u=>u.open+u.resolved>0);
    return {byProduct,byPriority,byType,slaBreaches,byAssignee};
  },[tickets,_scopedTeamSrc]);

  // ── Forecast Data ──
  const forecastData = useMemo(()=>{
    const active = opps.filter(o=>!["Won","Lost","closed_won","closed_lost"].includes(o.stage));
    const weighted = active.reduce((s,o)=>s+(o.value*(o.probability||0)/100),0);
    const bestCase = active.filter(o=>(o.probability||0)>=40).reduce((s,o)=>s+o.value,0);
    const likelyCase = active.filter(o=>(o.probability||0)>=60).reduce((s,o)=>s+o.value,0);
    const committed = active.filter(o=>(o.probability||0)>=80).reduce((s,o)=>s+o.value,0);

    // Monthly forecast
    const months = [];
    for(let i=0;i<6;i++){
      const d = new Date(today);
      d.setMonth(d.getMonth()+i);
      const m = d.toLocaleDateString("en-IN",{month:"short",year:"2-digit"});
      const mOpps = active.filter(o=>{
        const cd = new Date(o.closeDate);
        return cd.getMonth()===d.getMonth()&&cd.getFullYear()===d.getFullYear();
      });
      months.push({month:m,pipeline:mOpps.reduce((s,o)=>s+o.value,0),weighted:mOpps.reduce((s,o)=>s+(o.value*(o.probability||0)/100),0),deals:mOpps.length});
    }

    // Target vs achievement
    const targetVsAchieved = _scopedTeamSrc.map(u=>{
      const ut = (targets||[]).filter(t=>t.userId===u.id&&t.period==="2026-Q1");
      const target = ut.reduce((s,t)=>s+t.targetValue,0);
      const achieved = ut.reduce((s,t)=>s+t.achievedValue,0);
      return {name:u.name.split(" ")[0],target,achieved,gap:target-achieved};
    }).filter(d=>d.target>0);

    return {weighted,bestCase,likelyCase,committed,months,targetVsAchieved};
  },[opps,targets,_scopedTeamSrc]);

  // ── Activity Analytics ──
  const actData = useMemo(()=>{
    const byType = ACT_TYPES.map(t=>({type:t,count:activities.filter(a=>a.type===t).length})).filter(a=>a.count>0).sort((a,b)=>b.count-a.count);
    const byOwner = _scopedTeamSrc.map(u=>({name:u.name.split(" ")[0],count:activities.filter(a=>a.owner===u.id).length,completed:activities.filter(a=>a.owner===u.id&&a.status==="Completed").length})).filter(u=>u.count>0).sort((a,b)=>b.count-a.count);
    const byStatus = ["Planned","Completed","Cancelled"].map(s=>({status:s,count:activities.filter(a=>a.status===s).length}));
    const completionRate = pct(activities.filter(a=>a.status==="Completed").length, activities.length);
    // Overdue activities
    const overdue = activities.filter(a=>a.status==="Planned"&&a.date<today);
    return {byType,byOwner,byStatus,completionRate,overdue};
  },[activities,_scopedTeamSrc]);

  // ═══════════════════════════════════════════════════════════════
  // ACTIONABLE INSIGHTS ENGINE
  // ═══════════════════════════════════════════════════════════════
  const insights = useMemo(()=>{
    const items = [];
    // Stalled deals
    if(metrics.stalledDeals.length>0) items.push({type:"critical",icon:AlertTriangle,title:`${metrics.stalledDeals.length} Stalled Deals`,desc:`₹${metrics.stalledDeals.reduce((s,o)=>s+o.value,0).toFixed(1)}L pipeline with no activity for 14+ days`,action:"Review and re-engage or close"});
    // At-risk deals
    if(metrics.atRiskDeals.length>0) items.push({type:"warning",icon:AlertCircle,title:`${metrics.atRiskDeals.length} At-Risk Deals`,desc:"No activity for 7-14 days — schedule follow-up",action:"Schedule calls immediately"});
    // Critical tickets
    if(metrics.criticalTickets>0) items.push({type:"critical",icon:XCircle,title:`${metrics.criticalTickets} Critical Tickets Open`,desc:"Immediate attention required for customer satisfaction",action:"Escalate to team leads"});
    // Overdue collections
    if(metrics.overdueCollections.length>0) items.push({type:"warning",icon:DollarSign,title:`${metrics.overdueCollections.length} Overdue Invoices`,desc:`₹${metrics.overdueCollections.reduce((s,c)=>s+c.pendingAmount,0).toFixed(1)}L pending beyond due date`,action:"Send payment reminders"});
    // Expiring contracts
    if(metrics.expiringContracts.length>0) items.push({type:"info",icon:FileText,title:`${metrics.expiringContracts.length} Contracts Expiring Soon`,desc:"Within next 30 days — initiate renewal discussions",action:"Start renewal process"});
    // Low win rate warning
    if(metrics.winRate<30 && metrics.wonOpps.length+metrics.lostOpps.length>3) items.push({type:"warning",icon:TrendingDown,title:`Win Rate: ${metrics.winRate}%`,desc:"Below industry benchmark of 30-40%",action:"Review qualification criteria and sales process"});
    // High conversion leads
    if(metrics.leadConvRate>50) items.push({type:"success",icon:TrendingUp,title:`Lead Conversion: ${metrics.leadConvRate}%`,desc:"Above average — maintain lead quality",action:"Document winning lead sources"});
    // Low activity
    const avgActPerDeal = metrics.activeOpps.length ? Math.round(metrics.totalActivities/metrics.activeOpps.length) : 0;
    if(avgActPerDeal<3) items.push({type:"warning",icon:Activity,title:"Low Activity per Deal",desc:`Average ${avgActPerDeal} activities per active deal — benchmark is 5+`,action:"Increase engagement frequency"});
    // Collection health
    if(metrics.collectionRate<70) items.push({type:"critical",icon:DollarSign,title:`Collection Rate: ${metrics.collectionRate}%`,desc:"Below healthy threshold of 80%",action:"Escalate overdue accounts"});
    // Good performance
    if(metrics.winRate>=40) items.push({type:"success",icon:Award,title:`Strong Win Rate: ${metrics.winRate}%`,desc:"Above industry average — great sales execution",action:"Share best practices with team"});
    return items;
  },[metrics]);

  // ═══════════════════════════════════════════════════════════════
  // TABS CONFIG
  // ═══════════════════════════════════════════════════════════════
  const TABS = [
    {id:"executive",label:"Executive Summary",icon:BarChart3},
    {id:"pipeline",label:"Pipeline",icon:Layers},
    {id:"forecast",label:"Forecast",icon:Target},
    {id:"leads",label:"Leads",icon:Flame},
    {id:"calls",label:"Call Activity",icon:PhoneCall},
    {id:"activity",label:"Activities",icon:Activity},
    {id:"lob",label:"LOB Analysis",icon:Briefcase},
    {id:"team",label:"Team Performance",icon:Users},
    {id:"collection",label:"Collection",icon:DollarSign},
    {id:"support",label:"Support Health",icon:Shield},
    {id:"insights",label:"Action Items",icon:Zap},
  ];

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div>
      <PageTip
        id="reports-tip-v1"
        title="Reports tip:"
        text="All charts and figures are calculated live from your CRM data. Switch tabs to explore Pipeline, Revenue, Activity, Support, Collections, and Stalled Deals reports. Data auto-refreshes on each visit."
      />
      <div className="pg-head">
        <div><div className="pg-title">Reports & Analytics</div><div className="pg-sub">Business intelligence, performance metrics & actionable insights</div></div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <select value={periodFilter} onChange={e=>setPeriodFilter(e.target.value)} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",fontSize:12,background:"#fff"}}>
            <option value="all">All Time</option>
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
          </select>
          <select value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)} style={{padding:"6px 10px",borderRadius:8,border:"1px solid #E2E8F0",fontSize:12,background:"#fff"}}>
            <option value="all">All Owners</option>
            {_scopedTeamSrc.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{display:"flex",gap:4,marginBottom:20,flexWrap:"wrap",borderBottom:"2px solid #E2E8F0",paddingBottom:2}}>
        {TABS.map(t=>{
          const Icon = t.icon;
          return <button key={t.id}
            className={`btn btn-sm ${tab===t.id?"btn-primary":"btn-sec"}`}
            style={{display:"flex",alignItems:"center",gap:4,fontSize:12,borderRadius:"8px 8px 0 0",borderBottom:tab===t.id?"2px solid #1B6B5A":"2px solid transparent"}}
            onClick={()=>setTab(t.id)}>
            <Icon size={13}/>{t.label}
            {t.id==="insights" && insights.filter(i=>i.type==="critical").length>0 &&
              <span style={{background:"#DC2626",color:"#fff",borderRadius:10,padding:"0 5px",fontSize:10,fontWeight:700,marginLeft:2}}>{insights.filter(i=>i.type==="critical").length}</span>}
          </button>;
        })}
      </div>

      {/* ═══ EXECUTIVE SUMMARY ═══ */}
      {tab==="executive"&&(
        <div>
          {/* Top KPIs */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:20}}>
            <K label="Total Pipeline" value={crFmt(metrics.totalPipeline)} sub={`${metrics.activeOpps.length} active deals`} color="#1B6B5A" icon={Layers}/>
            <K label="Weighted Pipeline" value={crFmt(metrics.weightedPipeline)} sub="Probability adjusted" color="#2563EB" icon={Target}/>
            <K label="Won Revenue" value={crFmt(metrics.wonValue)} sub={`${metrics.wonOpps.length} deals closed`} color="#22C55E" icon={CheckCircle}/>
            <K label="Win Rate" value={`${metrics.winRate}%`} sub={`${metrics.wonOpps.length}W / ${metrics.lostOpps.length}L`} color={metrics.winRate>=35?"#22C55E":"#DC2626"} icon={Award}/>
            <K label="Avg Deal Size" value={crFmt(metrics.avgDealSize)} color="#7C3AED" icon={TrendingUp}/>
            <K label="Total ARR" value={crFmt(metrics.totalARR)} sub={`${accounts.length} accounts`} color="#0D9488" icon={Building2}/>
            <K label="Collection Rate" value={`${metrics.collectionRate}%`} sub={`₹${metrics.totalPending.toFixed(1)}L pending`} color={metrics.collectionRate>=80?"#22C55E":"#DC2626"} icon={DollarSign}/>
            <K label="Open Tickets" value={metrics.openTickets} sub={metrics.criticalTickets>0?`${metrics.criticalTickets} critical`:""} color={metrics.criticalTickets>0?"#DC2626":"#F59E0B"} icon={AlertTriangle}/>
          </div>

          {/* Actionable Alerts */}
          {insights.filter(i=>i.type==="critical"||i.type==="warning").length>0 && (
            <div style={{marginBottom:20}}>
              <div style={{fontSize:13,fontWeight:700,color:"#0D1F2D",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                <Zap size={15} color="#D97706"/>Requires Attention
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:10}}>
                {insights.filter(i=>i.type==="critical"||i.type==="warning").slice(0,4).map((ins,i)=>{
                  const Icon = ins.icon;
                  const bg = ins.type==="critical"?"#FEF2F2":"#FFFBEB";
                  const border = ins.type==="critical"?"#FECACA":"#FDE68A";
                  const color = ins.type==="critical"?"#DC2626":"#D97706";
                  return (
                    <div key={i} style={{background:bg,border:`1px solid ${border}`,borderRadius:10,padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                        <Icon size={15} color={color}/>
                        <span style={{fontSize:13,fontWeight:700,color}}>{ins.title}</span>
                      </div>
                      <div style={{fontSize:11,color:"#64748B",marginBottom:6}}>{ins.desc}</div>
                      <div style={{fontSize:11,fontWeight:600,color:"#1B6B5A"}}>→ {ins.action}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Charts Row */}
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16,marginBottom:20}}>
            <Card title="Pipeline by Stage" subtitle="Value distribution across stages">
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={stageData} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                  <XAxis dataKey="stage" tick={{fontSize:11}} tickLine={false}/>
                  <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                  <Tooltip formatter={(v,n)=>[n==="value"?crFmt(v):v,n==="value"?"Value":"Deals"]} contentStyle={{borderRadius:8,fontSize:12}}/>
                  <Bar dataKey="value" name="Value" radius={[4,4,0,0]}>
                    {stageData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                  </Bar>
                  <Line type="monotone" dataKey="count" name="Deals" stroke="#7C3AED" strokeWidth={2} dot={{r:4}}/>
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Deal Health" subtitle="Pipeline quality indicators">
              <div style={{display:"flex",flexDirection:"column",gap:14,marginTop:8}}>
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                    <span style={{color:"#22C55E",fontWeight:600}}>Active</span>
                    <span style={{fontWeight:700}}>{metrics.activeOpps.length - metrics.stalledDeals.length - metrics.atRiskDeals.length}</span>
                  </div>
                  <Progress value={metrics.activeOpps.length - metrics.stalledDeals.length - metrics.atRiskDeals.length} max={metrics.activeOpps.length} color="#22C55E"/>
                </div>
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                    <span style={{color:"#F59E0B",fontWeight:600}}>At Risk (7-14d)</span>
                    <span style={{fontWeight:700}}>{metrics.atRiskDeals.length}</span>
                  </div>
                  <Progress value={metrics.atRiskDeals.length} max={metrics.activeOpps.length} color="#F59E0B"/>
                </div>
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                    <span style={{color:"#DC2626",fontWeight:600}}>Stalled (14d+)</span>
                    <span style={{fontWeight:700}}>{metrics.stalledDeals.length}</span>
                  </div>
                  <Progress value={metrics.stalledDeals.length} max={metrics.activeOpps.length} color="#DC2626"/>
                </div>
                <div style={{borderTop:"1px solid #E2E8F0",paddingTop:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                    <span style={{color:"#64748B",fontWeight:600}}>Win Rate</span>
                    <span style={{fontWeight:700,color:metrics.winRate>=35?"#22C55E":"#DC2626"}}>{metrics.winRate}%</span>
                  </div>
                  <Progress value={metrics.winRate} max={100} color={metrics.winRate>=35?"#22C55E":"#DC2626"}/>
                </div>
              </div>
            </Card>
          </div>

          {/* Bottom Row - Stalled Deals Table + Quick Stats */}
          <div style={{display:"grid",gridTemplateColumns:"1.5fr 1fr",gap:16}}>
            {metrics.stalledDeals.length>0 && (
              <Card title="Stalled Deals — Immediate Action Required" subtitle="No activity for 14+ days">
                <MiniTable columns={[
                  {key:"title",label:"Deal",bold:true},
                  {key:"account",label:"Account"},
                  {key:"value",label:"Value",align:"right",render:r=>crFmt(r.value)},
                  {key:"owner",label:"Owner",render:r=>TEAM_MAP[r.owner]?.name?.split(" ")[0]||"—"},
                  {key:"stage",label:"Stage"},
                  {key:"days",label:"Days Idle",align:"right",color:()=>"#DC2626",bold:true}
                ]} data={metrics.stalledDeals.map(o=>{
                  const lastAct = activities.filter(a=>a.oppId===o.id).sort((a,b)=>b.date?.localeCompare(a.date))[0];
                  return {...o,account:accounts.find(a=>a.id===o.accountId)?.name||"—",days:lastAct?daysBetween(lastAct.date,today):"No activity"};
                }).sort((a,b)=>(typeof b.days==="number"?b.days:999)-(typeof a.days==="number"?a.days:999))}/>
              </Card>
            )}
            <Card title="Performance Snapshot" subtitle="Key ratios & benchmarks">
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[
                  {label:"Avg Cycle Time",value:metrics.avgCycleTime?`${metrics.avgCycleTime} days`:"N/A",bench:"Industry: 45-90 days",ok:metrics.avgCycleTime<=90},
                  {label:"Lead → Opp Conversion",value:`${metrics.leadConvRate}%`,bench:"Benchmark: 15-25%",ok:metrics.leadConvRate>=15},
                  {label:"Activity Completion",value:`${pct(metrics.completedActs,metrics.totalActivities)}%`,bench:"Target: 80%+",ok:pct(metrics.completedActs,metrics.totalActivities)>=80},
                  {label:"Collection Efficiency",value:`${metrics.collectionRate}%`,bench:"Healthy: 80%+",ok:metrics.collectionRate>=80},
                  {label:"Support Resolution",value:metrics.avgResTime?`${metrics.avgResTime} days`:"N/A",bench:"SLA target: varies",ok:metrics.avgResTime<=5},
                  {label:"Pipeline Coverage",value:`${metrics.totalARR>0?((metrics.totalPipeline/metrics.totalARR)*100).toFixed(0):"—"}%`,bench:"Target: 3x ARR",ok:metrics.totalPipeline>=metrics.totalARR*3},
                ].map((r,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i<5?"1px solid #F1F5F9":"none"}}>
                    <div>
                      <div style={{fontSize:12,fontWeight:600,color:"#334155"}}>{r.label}</div>
                      <div style={{fontSize:10,color:"#94A3B8"}}>{r.bench}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:14,fontWeight:700,color:r.ok?"#22C55E":"#DC2626"}}>{r.value}</span>
                      {r.ok ? <CheckCircle size={14} color="#22C55E"/> : <AlertCircle size={14} color="#DC2626"/>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ═══ PIPELINE ═══ */}
      {tab==="pipeline"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:16}}>
            {stageData.filter(s=>s.stage!=="Won"&&s.stage!=="Lost").map(s=>(
              <K key={s.stage} label={s.stage} value={crFmt(s.value)} sub={`${s.count} deals`} color={s.color}/>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <Card title="Pipeline by Stage (₹L)" subtitle="Value & deal count per stage">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={stageData} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                  <XAxis dataKey="stage" tick={{fontSize:11}} tickLine={false}/>
                  <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                  <Tooltip formatter={v=>crFmt(v)} contentStyle={{borderRadius:8,fontSize:12}}/>
                  <Bar dataKey="value" radius={[4,4,0,0]}>
                    {stageData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card title="Pipeline by Country (₹L)" subtitle="Geographic distribution">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={countryData} layout="vertical" barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                  <XAxis type="number" tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                  <YAxis type="category" dataKey="country" tick={{fontSize:11}} tickLine={false} width={80}/>
                  <Tooltip formatter={v=>crFmt(v)} contentStyle={{borderRadius:8,fontSize:12}}/>
                  <Bar dataKey="value" fill="#2563EB" radius={[0,4,4,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
          {/* Stage Conversion Funnel */}
          <Card title="Stage Conversion Rates" subtitle="Drop-off analysis between stages" fullWidth>
            <div style={{display:"flex",gap:0,alignItems:"flex-end",justifyContent:"center",padding:"10px 0"}}>
              {stageData.filter(s=>!["Won","Lost"].includes(s.stage)).map((s,i,arr)=>{
                const prevCount = i>0 ? arr[i-1].count : s.count;
                const convRate = prevCount > 0 ? pct(s.count, prevCount) : 100;
                return (
                  <div key={s.stage} style={{display:"flex",alignItems:"center"}}>
                    <div style={{textAlign:"center"}}>
                      <div style={{background:s.color,color:"#fff",borderRadius:8,padding:"8px 14px",minWidth:70,fontWeight:700,fontSize:16}}>{s.count}</div>
                      <div style={{fontSize:11,color:"#64748B",marginTop:4}}>{s.stage}</div>
                      <div style={{fontSize:10,color:"#94A3B8"}}>{crFmt(s.value)}</div>
                    </div>
                    {i<arr.length-1 && (
                      <div style={{padding:"0 8px",textAlign:"center"}}>
                        <ArrowRight size={16} color="#94A3B8"/>
                        <div style={{fontSize:10,fontWeight:600,color:convRate>=50?"#22C55E":"#DC2626"}}>{convRate}%</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ═══ FORECAST ═══ */}
      {tab==="forecast"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
            <K label="Weighted Pipeline" value={crFmt(forecastData.weighted)} color="#1B6B5A" icon={Target}/>
            <K label="Best Case (≥40%)" value={crFmt(forecastData.bestCase)} color="#2563EB" icon={TrendingUp}/>
            <K label="Likely Case (≥60%)" value={crFmt(forecastData.likelyCase)} color="#22C55E" icon={CheckCircle}/>
            <K label="Committed (≥80%)" value={crFmt(forecastData.committed)} color="#D97706" icon={Star}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <Card title="Monthly Pipeline Forecast" subtitle="Next 6 months outlook">
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={forecastData.months} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                  <XAxis dataKey="month" tick={{fontSize:11}} tickLine={false}/>
                  <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                  <Tooltip formatter={(v,n)=>[crFmt(v),n]} contentStyle={{borderRadius:8,fontSize:12}}/>
                  <Legend wrapperStyle={{fontSize:12}}/>
                  <Bar dataKey="pipeline" name="Pipeline" fill="#94A3B8" radius={[4,4,0,0]}/>
                  <Bar dataKey="weighted" name="Weighted" fill="#1B6B5A" radius={[4,4,0,0]}/>
                  <Line type="monotone" dataKey="deals" name="Deals" stroke="#7C3AED" strokeWidth={2} yAxisId={0}/>
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Target vs Achievement (Q1 2026)" subtitle="Individual quota attainment">
              {forecastData.targetVsAchieved.length>0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={forecastData.targetVsAchieved} barGap={4} barSize={18}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                    <XAxis dataKey="name" tick={{fontSize:11}} tickLine={false}/>
                    <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                    <Tooltip formatter={v=>crFmt(v)} contentStyle={{borderRadius:8,fontSize:12}}/>
                    <Legend wrapperStyle={{fontSize:12}}/>
                    <Bar dataKey="target" name="Target" fill="#94A3B8" radius={[4,4,0,0]}/>
                    <Bar dataKey="achieved" name="Achieved" fill="#1B6B5A" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              ) : <div style={{padding:40,textAlign:"center",color:"#94A3B8",fontSize:13}}>No target data for Q1 2026</div>}
            </Card>
          </div>

          {/* Quota Attainment Table */}
          {forecastData.targetVsAchieved.length>0 && (
            <Card title="Quota Attainment Details" subtitle="Gap analysis by team member">
              <MiniTable columns={[
                {key:"name",label:"Rep",bold:true},
                {key:"target",label:"Target",align:"right",render:r=>crFmt(r.target)},
                {key:"achieved",label:"Achieved",align:"right",render:r=>crFmt(r.achieved)},
                {key:"gap",label:"Gap",align:"right",render:r=><span style={{color:r.gap>0?"#DC2626":"#22C55E",fontWeight:600}}>{r.gap>0?`-${crFmt(r.gap)}`:`+${crFmt(Math.abs(r.gap))}`}</span>},
                {key:"pct",label:"Attain%",align:"right",render:r=>{
                  const p = pct(r.achieved,r.target);
                  return <span style={{fontWeight:700,color:p>=100?"#22C55E":p>=70?"#F59E0B":"#DC2626"}}>{p}%</span>;
                }},
                {key:"progress",label:"Progress",render:r=><div style={{width:100}}><Progress value={r.achieved} max={r.target} color={pct(r.achieved,r.target)>=100?"#22C55E":pct(r.achieved,r.target)>=70?"#F59E0B":"#DC2626"}/></div>}
              ]} data={forecastData.targetVsAchieved}/>
            </Card>
          )}
        </div>
      )}

      {/* ═══ LEADS ═══ */}
      {tab==="leads"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:16}}>
            <K label="Total Leads" value={metrics.totalLeads} color="#2563EB" icon={Users}/>
            <K label="Converted" value={metrics.convertedLeads} sub={`${metrics.leadConvRate}% conversion`} color="#22C55E" icon={CheckCircle}/>
            <K label="Hot Leads" value={(leads||[]).filter(l=>l.temperature==="Hot").length} color="#DC2626" icon={Flame}/>
            <K label="Avg Score" value={(leads||[]).length ? Math.round((leads||[]).reduce((s,l)=>s+(l.score||0),0)/leads.length) : 0} sub="out of 100" color="#7C3AED" icon={Star}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <Card title="Leads by Stage" subtitle="Pipeline funnel view">
              {leadData.stages.length>0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={leadData.stages} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                    <XAxis dataKey="name" tick={{fontSize:11}} tickLine={false}/>
                    <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                    <Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
                    <Bar dataKey="count" radius={[4,4,0,0]}>
                      {leadData.stages.map((d,i)=><Cell key={i} fill={d.color}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <div style={{color:"#94A3B8",fontSize:13,padding:40,textAlign:"center"}}>No lead data</div>}
            </Card>

            <Card title="Lead Source Distribution" subtitle="Where leads come from">
              {leadData.sources.length>0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart><Pie data={leadData.sources} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={75} label={({source,count})=>`${source}: ${count}`}>
                    {leadData.sources.map((_,i)=><Cell key={i} fill={CL[i%CL.length]}/>)}
                  </Pie><Tooltip contentStyle={{borderRadius:8,fontSize:12}}/></PieChart>
                </ResponsiveContainer>
              ) : <div style={{color:"#94A3B8",fontSize:13,padding:40,textAlign:"center"}}>No lead data</div>}
            </Card>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Card title="Lead Temperature" subtitle="Qualification heat map">
              <div style={{display:"flex",gap:12,marginTop:8}}>
                {leadData.temps.map((t,i)=>{
                  const colors = {Hot:"#DC2626",Warm:"#F59E0B",Cool:"#3B82F6",Cold:"#94A3B8"};
                  return (
                    <div key={t.temp} style={{flex:1,textAlign:"center",padding:12,borderRadius:10,background:colors[t.temp]+"15",border:`1px solid ${colors[t.temp]}30`}}>
                      <div style={{fontSize:24,fontWeight:700,color:colors[t.temp]}}>{t.count}</div>
                      <div style={{fontSize:11,color:"#64748B",fontWeight:600}}>{t.temp}</div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card title="Lead Aging" subtitle="Time since creation">
              <div style={{display:"flex",gap:10,marginTop:8}}>
                {leadData.aging.map((a,i)=>(
                  <div key={a.label} style={{flex:1,textAlign:"center",padding:12,borderRadius:10,background:a.color+"12",border:`1px solid ${a.color}25`}}>
                    <div style={{fontSize:22,fontWeight:700,color:a.color}}>{a.count}</div>
                    <div style={{fontSize:10,color:"#64748B",fontWeight:600}}>{a.label}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ═══ CALL ACTIVITY ═══ */}
      {tab==="calls"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:16}}>
            <K label="Total Calls" value={metrics.totalCalls} color="#1B6B5A" icon={Phone}/>
            <K label="Visits" value={(callReports||[]).filter(r=>r.callType==="Visit").length} color="#2563EB" icon={MapPin}/>
            <K label="Web Calls" value={(callReports||[]).filter(r=>r.callType==="Web Call").length} color="#7C3AED" icon={Globe}/>
            <K label="Avg/Person" value={_scopedTeamSrc.length?(metrics.totalCalls/_scopedTeamSrc.filter(u=>(callReports||[]).some(r=>r.marketingPerson===u.id)).length||0).toFixed(1):"0"} color="#D97706" icon={Users}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <Card title="Calls by Type" subtitle="Communication channel mix">
              {callData.byType.length>0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart><Pie data={callData.byType} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80} label={({type,count})=>`${type}: ${count}`}>
                    {callData.byType.map((_,i)=><Cell key={i} fill={CL[i%CL.length]}/>)}
                  </Pie><Tooltip contentStyle={{borderRadius:8,fontSize:12}}/></PieChart>
                </ResponsiveContainer>
              ) : <div style={{padding:40,textAlign:"center",color:"#94A3B8"}}>No call data</div>}
            </Card>

            <Card title="Calls by Salesperson" subtitle="Individual call volume">
              {callData.byPerson.length>0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={callData.byPerson} barSize={24}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                    <XAxis dataKey="name" tick={{fontSize:11}} tickLine={false}/>
                    <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                    <Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
                    <Bar dataKey="calls" fill="#1B6B5A" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              ) : <div style={{padding:40,textAlign:"center",color:"#94A3B8"}}>No call data</div>}
            </Card>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            <Card title="Call Outcomes" subtitle="Result distribution">
              {callData.byOutcome.length>0 ? (
                <MiniTable columns={[
                  {key:"outcome",label:"Outcome",bold:true},
                  {key:"count",label:"Count",align:"right"},
                  {key:"pct",label:"%",align:"right",render:r=>`${pct(r.count,metrics.totalCalls)}%`},
                  {key:"bar",label:"Distribution",render:r=><div style={{width:80}}><Progress value={r.count} max={metrics.totalCalls} color="#1B6B5A"/></div>}
                ]} data={callData.byOutcome}/>
              ) : <div style={{padding:40,textAlign:"center",color:"#94A3B8"}}>No call data</div>}
            </Card>

            <Card title="Call Objectives" subtitle="Purpose breakdown">
              {callData.byObjective.length>0 ? (
                <MiniTable columns={[
                  {key:"objective",label:"Objective",bold:true},
                  {key:"count",label:"Count",align:"right"},
                  {key:"bar",label:"Volume",render:r=><div style={{width:70}}><Progress value={r.count} max={callData.byObjective[0]?.count||1} color="#2563EB"/></div>}
                ]} data={callData.byObjective}/>
              ) : <div style={{padding:40,textAlign:"center",color:"#94A3B8"}}>No call data</div>}
            </Card>
          </div>
        </div>
      )}

      {/* ═══ ACTIVITIES ═══ */}
      {tab==="activity"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:16}}>
            <K label="Total Activities" value={metrics.totalActivities} color="#1B6B5A" icon={Activity}/>
            <K label="Completed" value={metrics.completedActs} sub={`${actData.completionRate}% rate`} color="#22C55E" icon={CheckCircle}/>
            <K label="Overdue" value={actData.overdue.length} color={actData.overdue.length>0?"#DC2626":"#22C55E"} icon={AlertTriangle}/>
            <K label="Planned" value={activities.filter(a=>a.status==="Planned").length} color="#2563EB" icon={Calendar}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <Card title="Activities by Type" subtitle="Engagement channel mix">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart><Pie data={actData.byType} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80} label={({type,count})=>`${type}: ${count}`}>
                  {actData.byType.map((_,i)=><Cell key={i} fill={CL[i%CL.length]}/>)}
                </Pie><Tooltip contentStyle={{borderRadius:8,fontSize:12}}/></PieChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Activities by Owner" subtitle="Individual engagement volume">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={actData.byOwner} barGap={4} barSize={16}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                  <XAxis dataKey="name" tick={{fontSize:11}} tickLine={false}/>
                  <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
                  <Legend wrapperStyle={{fontSize:12}}/>
                  <Bar dataKey="count" name="Total" fill="#94A3B8" radius={[4,4,0,0]}/>
                  <Bar dataKey="completed" name="Completed" fill="#1B6B5A" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Overdue Activities */}
          {actData.overdue.length>0 && (
            <Card title={`Overdue Activities (${actData.overdue.length})`} subtitle="Past planned date — require immediate action">
              <MiniTable columns={[
                {key:"title",label:"Activity",bold:true},
                {key:"type",label:"Type"},
                {key:"date",label:"Date",render:r=>fmt.date(r.date)},
                {key:"owner",label:"Owner",render:r=>TEAM_MAP[r.owner]?.name?.split(" ")[0]||"—"},
                {key:"days",label:"Days Overdue",align:"right",color:()=>"#DC2626",bold:true,render:r=>daysBetween(r.date,today)}
              ]} data={actData.overdue.sort((a,b)=>a.date?.localeCompare(b.date))} maxRows={10}/>
            </Card>
          )}
        </div>
      )}

      {/* ═══ LOB ANALYSIS ═══ */}
      {tab==="lob"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:16}}>
            {prodPipeline.map(p=>(
              <K key={p.name} label={p.name} value={crFmt(p.arr+p.pipeline)} sub={`${p.deals} deals • ${p.accounts} accts`} color={p.color}/>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <Card title="ARR vs Pipeline by Product" subtitle="Revenue base + growth opportunity">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={prodPipeline} barGap={4} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                  <XAxis dataKey="name" tick={{fontSize:11}} tickLine={false}/>
                  <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                  <Tooltip formatter={v=>crFmt(v)} contentStyle={{borderRadius:8,fontSize:12}}/>
                  <Legend wrapperStyle={{fontSize:12}}/>
                  <Bar dataKey="arr" name="ARR" fill="#1B6B5A" radius={[4,4,0,0]}/>
                  <Bar dataKey="pipeline" name="Open Pipeline" fill="#2563EB" radius={[4,4,0,0]}/>
                  <Bar dataKey="won" name="Won" fill="#22C55E" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Product Adoption" subtitle="Accounts per product & penetration">
              <MiniTable columns={[
                {key:"name",label:"Product",bold:true},
                {key:"accounts",label:"Accounts",align:"right"},
                {key:"deals",label:"Open Deals",align:"right"},
                {key:"arr",label:"ARR",align:"right",render:r=>crFmt(r.arr)},
                {key:"pipeline",label:"Pipeline",align:"right",render:r=>crFmt(r.pipeline)},
                {key:"share",label:"Revenue Share",render:r=>{
                  const total = prodPipeline.reduce((s,p)=>s+p.arr,0);
                  return <div style={{width:60}}><Progress value={r.arr} max={total} color={r.color}/></div>;
                }}
              ]} data={prodPipeline}/>
            </Card>
          </div>

          {/* Cross-sell opportunity */}
          <Card title="Cross-Sell Opportunities" subtitle="Accounts with potential for additional products">
            <MiniTable columns={[
              {key:"name",label:"Account",bold:true},
              {key:"current",label:"Current Products",render:r=><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{r.products.map(p=><Badge key={p} text={p} color={PROD_MAP[p]?.color||"#64748B"}/>)}</div>},
              {key:"missing",label:"Opportunities",render:r=><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{r.missing.map(p=><Badge key={p} text={p} color="#94A3B8"/>)}</div>},
              {key:"potential",label:"Potential",align:"right",render:r=>`${r.missing.length} products`}
            ]} data={accounts.filter(a=>a.products?.length>0&&a.products.length<PRODUCTS.length).map(a=>({
              name:a.name,products:a.products,missing:PRODUCTS.map(p=>p.id).filter(pid=>!a.products.includes(pid))
            })).sort((a,b)=>b.missing.length-a.missing.length).slice(0,10)}/>
          </Card>
        </div>
      )}

      {/* ═══ TEAM PERFORMANCE ═══ */}
      {tab==="team"&&(
        <div>
          {/* Scorecards */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12,marginBottom:20}}>
            {teamPerf.slice(0,6).map(u=>(
              <div key={u.id} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1px solid #E2E8F0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:32,height:32,borderRadius:"50%",background:"#1B6B5A",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700}}>{u.initials}</div>
                    <div><div style={{fontSize:13,fontWeight:700}}>{u.name}</div><div style={{fontSize:10,color:"#94A3B8"}}>{u.role}</div></div>
                  </div>
                  <Badge text={`${u.winRate}% WR`} color={u.winRate>=35?"#22C55E":"#DC2626"}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,textAlign:"center"}}>
                  {[
                    {label:"Deals",value:u.activeDeals,color:"#2563EB"},
                    {label:"Pipeline",value:crFmt(u.pipelineVal),color:"#1B6B5A"},
                    {label:"Won",value:crFmt(u.wonVal),color:"#22C55E"},
                    {label:"Calls",value:u.calls,color:"#D97706"},
                  ].map((m,i)=>(
                    <div key={i}>
                      <div style={{fontSize:14,fontWeight:700,color:m.color}}>{m.value}</div>
                      <div style={{fontSize:9,color:"#94A3B8",fontWeight:600}}>{m.label}</div>
                    </div>
                  ))}
                </div>
                {u.targetVal>0 && (
                  <div style={{marginTop:8}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#64748B",marginBottom:3}}>
                      <span>Target: {crFmt(u.targetVal)}</span>
                      <span style={{fontWeight:700,color:u.targetPct>=100?"#22C55E":u.targetPct>=70?"#F59E0B":"#DC2626"}}>{u.targetPct}%</span>
                    </div>
                    <Progress value={u.achievedVal} max={u.targetVal} color={u.targetPct>=100?"#22C55E":u.targetPct>=70?"#F59E0B":"#DC2626"}/>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <Card title="Pipeline & Activity by Owner" subtitle="Engagement vs pipeline value">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={teamPerf} barGap={4} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                  <XAxis dataKey="firstName" tick={{fontSize:11}} tickLine={false}/>
                  <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
                  <Legend wrapperStyle={{fontSize:12}}/>
                  <Bar dataKey="pipelineVal" name="Pipeline (₹L)" fill="#7C3AED" radius={[4,4,0,0]}/>
                  <Bar dataKey="calls" name="Calls" fill="#1B6B5A" radius={[4,4,0,0]}/>
                  <Bar dataKey="activities" name="Activities" fill="#2563EB" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Activity Score Ranking" subtitle="Weighted engagement (Calls×1 + Meetings×3 + Demos×5)">
              <MiniTable columns={[
                {key:"rank",label:"#",render:(_,i)=>i+1},
                {key:"name",label:"Name",bold:true,render:r=><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:22,height:22,borderRadius:"50%",background:"#1B6B5A",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700}}>{r.initials}</div>{r.firstName}</div>},
                {key:"actScore",label:"Score",align:"right",bold:true,color:r=>r.actScore>=20?"#22C55E":"#D97706"},
                {key:"calls",label:"Calls",align:"right"},
                {key:"activities",label:"Activities",align:"right"},
                {key:"wonVal",label:"Won",align:"right",render:r=>crFmt(r.wonVal)}
              ]} data={[...teamPerf].sort((a,b)=>b.actScore-a.actScore)}/>
            </Card>
          </div>

          {/* Leaderboard */}
          <Card title="Performance Leaderboard" subtitle="Comprehensive ranking across all metrics">
            <MiniTable columns={[
              {key:"name",label:"Rep",bold:true},
              {key:"activeDeals",label:"Active",align:"right"},
              {key:"pipelineVal",label:"Pipeline",align:"right",render:r=>crFmt(r.pipelineVal)},
              {key:"wonDeals",label:"Won",align:"right"},
              {key:"wonVal",label:"Won Value",align:"right",render:r=>crFmt(r.wonVal)},
              {key:"winRate",label:"Win%",align:"right",render:r=><span style={{color:r.winRate>=35?"#22C55E":"#DC2626",fontWeight:600}}>{r.winRate}%</span>},
              {key:"calls",label:"Calls",align:"right"},
              {key:"leads",label:"Leads",align:"right"},
              {key:"targetPct",label:"Target%",align:"right",render:r=>r.targetVal>0?<span style={{color:r.targetPct>=100?"#22C55E":r.targetPct>=70?"#F59E0B":"#DC2626",fontWeight:600}}>{r.targetPct}%</span>:"—"}
            ]} data={[...teamPerf].sort((a,b)=>b.wonVal-a.wonVal)} maxRows={10}/>
          </Card>
        </div>
      )}

      {/* ═══ COLLECTION ═══ */}
      {tab==="collection"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:16}}>
            <K label="Total Billed" value={crFmt(metrics.totalBilled)} color="#1B6B5A" icon={FileText}/>
            <K label="Collected" value={crFmt(metrics.totalCollected)} sub={`${metrics.collectionRate}% rate`} color="#22C55E" icon={CheckCircle}/>
            <K label="Pending" value={crFmt(metrics.totalPending)} color="#DC2626" icon={Clock}/>
            <K label="Overdue" value={metrics.overdueCollections.length} sub={`₹${metrics.overdueCollections.reduce((s,c)=>s+c.pendingAmount,0).toFixed(1)}L`} color="#F97316" icon={AlertTriangle}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1.2fr 0.8fr",gap:16,marginBottom:16}}>
            <Card title="Collection by Account" subtitle="Billed vs collected analysis">
              {collData.byAccount.length>0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={collData.byAccount} barGap={4} barSize={14} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                    <XAxis type="number" tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                    <YAxis type="category" dataKey="name" tick={{fontSize:10}} tickLine={false} width={110}/>
                    <Tooltip formatter={v=>crFmt(v)} contentStyle={{borderRadius:8,fontSize:12}}/>
                    <Legend wrapperStyle={{fontSize:12}}/>
                    <Bar dataKey="collected" name="Collected" fill="#22C55E" radius={[0,4,4,0]} stackId="a"/>
                    <Bar dataKey="pending" name="Pending" fill="#DC2626" radius={[0,4,4,0]} stackId="a"/>
                  </BarChart>
                </ResponsiveContainer>
              ) : <div style={{padding:40,textAlign:"center",color:"#94A3B8"}}>No collection data</div>}
            </Card>

            <Card title="Aging Analysis" subtitle="Overdue buckets">
              {collData.aging.length>0 ? (
                <div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={collData.aging} barSize={22}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                      <XAxis dataKey="bucket" tick={{fontSize:10}} tickLine={false}/>
                      <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                      <Tooltip formatter={v=>crFmt(v)} contentStyle={{borderRadius:8,fontSize:12}}/>
                      <Bar dataKey="value" fill="#F97316" radius={[4,4,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{marginTop:8}}>
                    {collData.aging.map((b,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"4px 0",borderBottom:"1px solid #F1F5F9"}}>
                        <span style={{color:"#64748B"}}>{b.bucket}</span>
                        <span style={{fontWeight:600}}>{b.count} invoices • {crFmt(b.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <div style={{padding:40,textAlign:"center",color:"#94A3B8"}}>No aging data</div>}
            </Card>
          </div>

          {/* Top Defaulters */}
          <Card title="Top Pending Accounts" subtitle="Accounts with highest outstanding amounts">
            <MiniTable columns={[
              {key:"name",label:"Account",bold:true},
              {key:"billed",label:"Billed",align:"right",render:r=>crFmt(r.billed)},
              {key:"collected",label:"Collected",align:"right",render:r=>crFmt(r.collected)},
              {key:"pending",label:"Pending",align:"right",render:r=><span style={{color:"#DC2626",fontWeight:700}}>{crFmt(r.pending)}</span>},
              {key:"rate",label:"Coll%",align:"right",render:r=>{const p=pct(r.collected,r.billed);return <span style={{color:p>=80?"#22C55E":"#DC2626",fontWeight:600}}>{p}%</span>;}},
              {key:"progress",label:"Health",render:r=><div style={{width:70}}><Progress value={r.collected} max={r.billed} color={pct(r.collected,r.billed)>=80?"#22C55E":"#DC2626"}/></div>}
            ]} data={collData.byAccount}/>
          </Card>
        </div>
      )}

      {/* ═══ SUPPORT HEALTH ═══ */}
      {tab==="support"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:16}}>
            <K label="Open Tickets" value={metrics.openTickets} color="#F59E0B" icon={AlertTriangle}/>
            <K label="Critical" value={metrics.criticalTickets} color="#DC2626" icon={XCircle}/>
            <K label="SLA Breaches" value={supportData.slaBreaches.length} color={supportData.slaBreaches.length>0?"#DC2626":"#22C55E"} icon={Timer}/>
            <K label="Total Tickets" value={tickets.length} sub={`${pct(tickets.filter(t=>["Resolved","Closed"].includes(t.status)).length,tickets.length)}% resolved`} color="#1B6B5A" icon={Shield}/>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <Card title="Tickets by Product" subtitle="Open vs resolved per product">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={supportData.byProduct} barGap={4} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0"/>
                  <XAxis dataKey="name" tick={{fontSize:11}} tickLine={false}/>
                  <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
                  <Legend wrapperStyle={{fontSize:12}}/>
                  <Bar dataKey="open" name="Open" fill="#F59E0B" radius={[4,4,0,0]}/>
                  <Bar dataKey="resolved" name="Resolved" fill="#22C55E" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Priority Distribution" subtitle="Open tickets by severity">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={supportData.byPriority} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({name,value})=>`${name}: ${value}`}>
                  {supportData.byPriority.map((d,i)=><Cell key={i} fill={d.color}/>)}
                </Pie><Tooltip contentStyle={{borderRadius:8,fontSize:12}}/></PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
            <Card title="Tickets by Type" subtitle="Issue category distribution">
              <MiniTable columns={[
                {key:"type",label:"Type",bold:true},
                {key:"count",label:"Count",align:"right"},
                {key:"bar",label:"Volume",render:r=><div style={{width:80}}><Progress value={r.count} max={supportData.byType[0]?.count||1} color="#F59E0B"/></div>}
              ]} data={supportData.byType}/>
            </Card>

            <Card title="Workload by Assignee" subtitle="Ticket distribution per engineer">
              <MiniTable columns={[
                {key:"name",label:"Assignee",bold:true},
                {key:"open",label:"Open",align:"right",color:r=>r.open>3?"#DC2626":"#334155"},
                {key:"resolved",label:"Resolved",align:"right",color:()=>"#22C55E"},
                {key:"rate",label:"Resolve%",align:"right",render:r=>{const p=pct(r.resolved,r.open+r.resolved);return <span style={{fontWeight:600,color:p>=70?"#22C55E":"#DC2626"}}>{p}%</span>;}},
                {key:"bar",label:"Load",render:r=><div style={{width:60}}><Progress value={r.open} max={Math.max(...supportData.byAssignee.map(a=>a.open))||1} color={r.open>3?"#DC2626":"#F59E0B"}/></div>}
              ]} data={supportData.byAssignee}/>
            </Card>
          </div>

          {/* SLA Breaches */}
          {supportData.slaBreaches.length>0 && (
            <Card title={`SLA Breaches (${supportData.slaBreaches.length})`} subtitle="Tickets exceeding SLA response time">
              <MiniTable columns={[
                {key:"title",label:"Ticket",bold:true},
                {key:"priority",label:"Priority",render:r=><Badge text={r.priority} color={r.priority==="Critical"?"#DC2626":r.priority==="High"?"#F97316":"#3B82F6"}/>},
                {key:"product",label:"Product"},
                {key:"assigned",label:"Assigned",render:r=>TEAM_MAP[r.assigned]?.name?.split(" ")[0]||"—"},
                {key:"created",label:"Created",render:r=>fmt.date(r.created)},
                {key:"breach",label:"Breach (hrs)",align:"right",color:()=>"#DC2626",bold:true,render:r=>{
                  const hrs = daysBetween(r.created,today)*24;
                  const sla = SLA_HOURS[r.priority]||48;
                  return `${hrs-sla}h over`;
                }}
              ]} data={supportData.slaBreaches} maxRows={10}/>
            </Card>
          )}
        </div>
      )}

      {/* ═══ ACTION ITEMS / INSIGHTS ═══ */}
      {tab==="insights"&&(
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"#0D1F2D",marginBottom:12}}>
            Actionable Insights & Recommendations ({insights.length} items)
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:12}}>
            {insights.map((ins,i)=>{
              const Icon = ins.icon;
              const styles = {
                critical:{bg:"#FEF2F2",border:"#FECACA",color:"#DC2626",badge:"Critical"},
                warning:{bg:"#FFFBEB",border:"#FDE68A",color:"#D97706",badge:"Warning"},
                info:{bg:"#EFF6FF",border:"#BFDBFE",color:"#2563EB",badge:"Info"},
                success:{bg:"#F0FDF4",border:"#BBF7D0",color:"#22C55E",badge:"Good"},
              }[ins.type];
              return (
                <div key={i} style={{background:styles.bg,border:`1px solid ${styles.border}`,borderRadius:12,padding:"16px 18px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <Icon size={16} color={styles.color}/>
                      <span style={{fontSize:14,fontWeight:700,color:styles.color}}>{ins.title}</span>
                    </div>
                    <Badge text={styles.badge} color={styles.color}/>
                  </div>
                  <div style={{fontSize:12,color:"#475569",marginBottom:8,lineHeight:1.5}}>{ins.desc}</div>
                  <div style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",background:"#fff",borderRadius:8,border:"1px solid #E2E8F0"}}>
                    <ArrowRight size={12} color="#1B6B5A"/>
                    <span style={{fontSize:12,fontWeight:600,color:"#1B6B5A"}}>{ins.action}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {insights.length===0 && (
            <div style={{textAlign:"center",padding:60,color:"#94A3B8"}}>
              <CheckCircle size={48} color="#22C55E"/>
              <div style={{fontSize:16,fontWeight:700,color:"#22C55E",marginTop:12}}>All Clear!</div>
              <div style={{fontSize:13,marginTop:4}}>No critical action items at this time. Keep up the great work!</div>
            </div>
          )}

          {/* Summary Stats */}
          <div style={{marginTop:24,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
            <div style={{background:"#FEF2F2",borderRadius:10,padding:"14px 16px",textAlign:"center"}}>
              <div style={{fontSize:28,fontWeight:700,color:"#DC2626"}}>{insights.filter(i=>i.type==="critical").length}</div>
              <div style={{fontSize:11,color:"#DC2626",fontWeight:600}}>Critical Issues</div>
            </div>
            <div style={{background:"#FFFBEB",borderRadius:10,padding:"14px 16px",textAlign:"center"}}>
              <div style={{fontSize:28,fontWeight:700,color:"#D97706"}}>{insights.filter(i=>i.type==="warning").length}</div>
              <div style={{fontSize:11,color:"#D97706",fontWeight:600}}>Warnings</div>
            </div>
            <div style={{background:"#EFF6FF",borderRadius:10,padding:"14px 16px",textAlign:"center"}}>
              <div style={{fontSize:28,fontWeight:700,color:"#2563EB"}}>{insights.filter(i=>i.type==="info").length}</div>
              <div style={{fontSize:11,color:"#2563EB",fontWeight:600}}>Info Items</div>
            </div>
            <div style={{background:"#F0FDF4",borderRadius:10,padding:"14px 16px",textAlign:"center"}}>
              <div style={{fontSize:28,fontWeight:700,color:"#22C55E"}}>{insights.filter(i=>i.type==="success").length}</div>
              <div style={{fontSize:11,color:"#22C55E",fontWeight:600}}>Positive</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Reports;
