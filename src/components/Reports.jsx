import React, { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { PRODUCTS, STAGES, TEAM, TEAM_MAP, PRIORITIES, LEAD_STAGES, CALL_TYPES } from "../data/constants";
import { today } from "../utils/helpers";

function Reports({accounts,opps,tickets,activities,leads,callReports,collections,targets}) {
  const [tab,setTab]=useState("pipeline");
  const COLORS=["#1B6B5A","#2563EB","#7C3AED","#D97706","#0D9488","#DC2626","#F97316","#22C55E"];

  // Pipeline data
  const pipeData=STAGES.map(s=>({stage:s,count:opps.filter(o=>o.stage===s).length,value:opps.filter(o=>o.stage===s).reduce((a,o)=>a+o.value,0)}));
  const countryData=[...new Set(opps.map(o=>o.country))].map(c=>({country:c,value:opps.filter(o=>o.country===c&&!["Won","Lost"].includes(o.stage)).reduce((a,o)=>a+o.value,0)})).filter(c=>c.value>0).sort((a,b)=>b.value-a.value).slice(0,8);

  // LOB data
  const prodData=PRODUCTS.map(p=>({name:p.name,arr:accounts.filter(a=>a.products.includes(p.id)).reduce((s,a)=>s+a.arrRevenue,0),pipeline:opps.filter(o=>o.products.includes(p.id)&&!["Won","Lost"].includes(o.stage)).reduce((s,o)=>s+o.value,0)})).filter(p=>p.arr+p.pipeline>0);

  // Team data
  const teamData=TEAM.map(u=>({name:u.name.split(" ")[0],deals:opps.filter(o=>o.owner===u.id&&!["Won","Lost"].includes(o.stage)).length,value:opps.filter(o=>o.owner===u.id&&!["Won","Lost"].includes(o.stage)).reduce((s,o)=>s+o.value,0),won:opps.filter(o=>o.owner===u.id&&o.stage==="Won").reduce((s,o)=>s+o.value,0),calls:(callReports||[]).filter(r=>r.marketingPerson===u.id).length,activities:activities.filter(a=>a.owner===u.id).length})).filter(u=>u.deals>0||u.won>0||u.calls>0);

  // Support data
  const tktProdData=PRODUCTS.map(p=>({name:p.name,open:tickets.filter(t=>t.product===p.id&&!["Resolved","Closed"].includes(t.status)).length})).filter(p=>p.open>0);
  const tktPriData=PRIORITIES.map(p=>({name:p,value:tickets.filter(t=>t.priority===p&&!["Resolved","Closed"].includes(t.status)).length})).filter(p=>p.value>0);

  // Lead data
  const leadStageData = (leads||[]).length > 0 ? LEAD_STAGES.filter(s=>s.id!=="NA").map(s=>({stage:s.id,name:s.name.split("–")[0].trim(),count:(leads||[]).filter(l=>l.stage===s.id).length,color:s.color})) : [];
  const leadSourceData = leads?.length > 0 ? [...new Set(leads.map(l=>l.source))].map(s=>({source:s,count:leads.filter(l=>l.source===s).length})).sort((a,b)=>b.count-a.count) : [];

  // Call report data
  const callTypeData = (callReports||[]).length > 0 ? CALL_TYPES.map(t=>({type:t,count:(callReports||[]).filter(r=>r.callType===t).length})).filter(c=>c.count>0) : [];
  const callsByPerson = (callReports||[]).length > 0 ? TEAM.map(u=>({name:u.name.split(" ")[0],calls:(callReports||[]).filter(r=>r.marketingPerson===u.id).length})).filter(c=>c.calls>0).sort((a,b)=>b.calls-a.calls) : [];

  // Collection data
  const collectionSummary = useMemo(() => {
    if (!collections?.length) return [];
    const byAcc = {};
    collections.forEach(c => {
      const name = accounts.find(a=>a.id===c.accountId)?.name || "Unknown";
      if (!byAcc[name]) byAcc[name] = {name,billed:0,collected:0,pending:0};
      byAcc[name].billed += c.billedAmount;
      byAcc[name].collected += c.collectedAmount;
      byAcc[name].pending += c.pendingAmount;
    });
    return Object.values(byAcc).sort((a,b)=>b.pending-a.pending).slice(0,8);
  }, [collections, accounts]);

  // Target data
  const targetData = useMemo(() => {
    if (!targets?.length) return [];
    return TEAM.map(u => {
      const userTargets = (targets||[]).filter(t=>t.userId===u.id && t.period==="2026-Q1");
      const target = userTargets.reduce((s,t)=>s+t.targetValue,0);
      const achieved = userTargets.reduce((s,t)=>s+t.achievedValue,0);
      return { name: u.name.split(" ")[0], target, achieved };
    }).filter(d=>d.target>0);
  }, [targets]);

  // Forecast view
  const weighted = opps.filter(o=>!["Won","Lost"].includes(o.stage)).reduce((s,o)=>s+(o.value*(o.probability/100)),0).toFixed(1);
  const bestCase = opps.filter(o=>!["Won","Lost"].includes(o.stage)&&o.probability>=40).reduce((s,o)=>s+o.value,0);
  const likelyCase = opps.filter(o=>!["Won","Lost"].includes(o.stage)&&o.probability>=60).reduce((s,o)=>s+o.value,0);
  const worstCase = opps.filter(o=>!["Won","Lost"].includes(o.stage)&&o.probability>=80).reduce((s,o)=>s+o.value,0);

  const actStats=[...new Set(activities.map(a=>a.type))].map(t=>({type:t,count:activities.filter(a=>a.type===t).length})).sort((a,b)=>b.count-a.count);

  const TABS=[
    {id:"pipeline",label:"Pipeline"},
    {id:"forecast",label:"Forecast"},
    {id:"leads",label:"Leads"},
    {id:"calls",label:"Call Activity"},
    {id:"lob",label:"LOB Analysis"},
    {id:"team",label:"Team Performance"},
    {id:"collection",label:"Collection"},
    {id:"support",label:"Support Health"},
  ];

  return (
    <div>
      <div className="pg-head"><div><div className="pg-title">Reports</div><div className="pg-sub">Business intelligence and performance metrics</div></div></div>
      <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
        {TABS.map(t=><button key={t.id} className={`btn btn-sm ${tab===t.id?"btn-primary":"btn-sec"}`} onClick={()=>setTab(t.id)}>{t.label}</button>)}
      </div>

      {tab==="pipeline"&&(
        <div className="dash-2col">
          <div className="rpt-card"><div className="rpt-title">Pipeline by Stage (₹Cr)</div><ResponsiveContainer width="100%" height={220}><BarChart data={pipeData} barSize={28}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis dataKey="stage" tick={{fontSize:11}} tickLine={false}/><YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/><Tooltip formatter={v=>`₹${v}Cr`} contentStyle={{borderRadius:8,fontSize:12}}/><Bar dataKey="value" fill="var(--brand)" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>
          <div className="rpt-card"><div className="rpt-title">Pipeline by Country (₹Cr)</div><ResponsiveContainer width="100%" height={220}><BarChart data={countryData} layout="vertical" barSize={16}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis type="number" tick={{fontSize:11}} tickLine={false} axisLine={false}/><YAxis type="category" dataKey="country" tick={{fontSize:11}} tickLine={false} width={80}/><Tooltip formatter={v=>`₹${v}Cr`} contentStyle={{borderRadius:8,fontSize:12}}/><Bar dataKey="value" fill="var(--blue)" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></div>
        </div>
      )}

      {tab==="forecast"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
            <div className="kpi"><div className="kpi-label">Weighted Pipeline</div><div className="kpi-val" style={{color:"var(--brand)"}}>₹{weighted}Cr</div></div>
            <div className="kpi"><div className="kpi-label">Best Case (≥40%)</div><div className="kpi-val" style={{color:"var(--blue)"}}>₹{bestCase}Cr</div></div>
            <div className="kpi"><div className="kpi-label">Likely Case (≥60%)</div><div className="kpi-val" style={{color:"var(--green)"}}>₹{likelyCase}Cr</div></div>
            <div className="kpi"><div className="kpi-label">Worst Case (≥80%)</div><div className="kpi-val" style={{color:"var(--amber)"}}>₹{worstCase}Cr</div></div>
          </div>
          {targetData.length > 0 && (
            <div className="rpt-card"><div className="rpt-title">Target vs Achievement (Q1 2026)</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={targetData} barGap={4} barSize={22}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                  <XAxis dataKey="name" tick={{fontSize:11}} tickLine={false}/>
                  <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                  <Tooltip formatter={v=>`₹${v}Cr`} contentStyle={{borderRadius:8,fontSize:12}}/>
                  <Legend wrapperStyle={{fontSize:12}}/>
                  <Bar dataKey="target" name="Target" fill="#94A3B8" radius={[4,4,0,0]}/>
                  <Bar dataKey="achieved" name="Achieved" fill="var(--brand)" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {tab==="leads"&&(
        <div className="dash-2col">
          {leadStageData.length > 0 ? (
            <div className="rpt-card"><div className="rpt-title">Leads by Stage</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={leadStageData} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                  <XAxis dataKey="name" tick={{fontSize:11}} tickLine={false}/>
                  <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
                  <Bar dataKey="count" fill="var(--blue)" radius={[4,4,0,0]}>
                    {leadStageData.map((d,i)=><Cell key={i} fill={d.color}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="rpt-card"><div className="rpt-title">Leads by Stage</div><p style={{color:"var(--text3)",fontSize:13}}>No lead data available.</p></div>}
          {leadSourceData.length > 0 ? (
            <div className="rpt-card"><div className="rpt-title">Leads by Source</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={leadSourceData} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={80} label={({source,count})=>`${source}: ${count}`}>
                  {leadSourceData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                </Pie><Tooltip contentStyle={{borderRadius:8,fontSize:12}}/></PieChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="rpt-card"><div className="rpt-title">Leads by Source</div><p style={{color:"var(--text3)",fontSize:13}}>No lead data available.</p></div>}
        </div>
      )}

      {tab==="calls"&&(
        <div className="dash-2col">
          {callTypeData.length > 0 ? (
            <div className="rpt-card"><div className="rpt-title">Calls by Type</div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={callTypeData} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80} label={({type,count})=>`${type}: ${count}`}>
                  {callTypeData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                </Pie><Tooltip contentStyle={{borderRadius:8,fontSize:12}}/></PieChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="rpt-card"><div className="rpt-title">Calls by Type</div><p style={{color:"var(--text3)",fontSize:13}}>No call report data.</p></div>}
          {callsByPerson.length > 0 ? (
            <div className="rpt-card"><div className="rpt-title">Calls by Salesperson</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={callsByPerson} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                  <XAxis dataKey="name" tick={{fontSize:11}} tickLine={false}/>
                  <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                  <Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
                  <Bar dataKey="calls" fill="var(--brand)" radius={[4,4,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="rpt-card"><div className="rpt-title">Calls by Salesperson</div><p style={{color:"var(--text3)",fontSize:13}}>No call data.</p></div>}
        </div>
      )}

      {tab==="lob"&&(
        <div className="rpt-card"><div className="rpt-title">ARR vs Pipeline by Product (₹Cr)</div><ResponsiveContainer width="100%" height={280}><BarChart data={prodData} barGap={4} barSize={22}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis dataKey="name" tick={{fontSize:11}} tickLine={false}/><YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/><Tooltip formatter={v=>`₹${v}Cr`} contentStyle={{borderRadius:8,fontSize:12}}/><Legend wrapperStyle={{fontSize:12}}/><Bar dataKey="arr" name="ARR" fill="var(--brand)" radius={[4,4,0,0]}/><Bar dataKey="pipeline" name="Pipeline" fill="var(--blue)" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>
      )}

      {tab==="team"&&(
        <div className="dash-2col">
          <div className="rpt-card"><div className="rpt-title">Pipeline & Calls by Owner</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={teamData} barGap={4} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="name" tick={{fontSize:11}} tickLine={false}/>
                <YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                <Tooltip contentStyle={{borderRadius:8,fontSize:12}}/>
                <Legend wrapperStyle={{fontSize:12}}/>
                <Bar dataKey="value" name="Pipeline (₹Cr)" fill="var(--purple)" radius={[4,4,0,0]}/>
                <Bar dataKey="calls" name="Call Reports" fill="var(--brand)" radius={[4,4,0,0]}/>
                <Bar dataKey="activities" name="Activities" fill="var(--blue)" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="rpt-card"><div className="rpt-title">Activity Volume by Type</div><ResponsiveContainer width="100%" height={240}><PieChart><Pie data={actStats} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80} label={({name,count})=>`${name}: ${count}`}>{actStats.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip contentStyle={{borderRadius:8,fontSize:12}}/></PieChart></ResponsiveContainer></div>
        </div>
      )}

      {tab==="collection"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
            <div className="kpi"><div className="kpi-label">Total Billed</div><div className="kpi-val">₹{(collections||[]).reduce((s,c)=>s+c.billedAmount,0).toFixed(1)}Cr</div></div>
            <div className="kpi"><div className="kpi-label">Collected</div><div className="kpi-val" style={{color:"var(--green)"}}>₹{(collections||[]).reduce((s,c)=>s+c.collectedAmount,0).toFixed(1)}Cr</div></div>
            <div className="kpi"><div className="kpi-label">Pending</div><div className="kpi-val" style={{color:"var(--red)"}}>₹{(collections||[]).reduce((s,c)=>s+c.pendingAmount,0).toFixed(1)}Cr</div></div>
          </div>
          {collectionSummary.length > 0 && (
            <div className="rpt-card"><div className="rpt-title">Collection by Account (₹Cr)</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={collectionSummary} barGap={4} barSize={18} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                  <XAxis type="number" tick={{fontSize:11}} tickLine={false} axisLine={false}/>
                  <YAxis type="category" dataKey="name" tick={{fontSize:11}} tickLine={false} width={120}/>
                  <Tooltip formatter={v=>`₹${v.toFixed(1)}Cr`} contentStyle={{borderRadius:8,fontSize:12}}/>
                  <Legend wrapperStyle={{fontSize:12}}/>
                  <Bar dataKey="collected" name="Collected" fill="var(--green)" radius={[0,4,4,0]} stackId="a"/>
                  <Bar dataKey="pending" name="Pending" fill="var(--red)" radius={[0,4,4,0]} stackId="a"/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {tab==="support"&&(
        <div className="dash-2col">
          <div className="rpt-card"><div className="rpt-title">Open Tickets by Product</div><ResponsiveContainer width="100%" height={200}><BarChart data={tktProdData} barSize={22}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/><XAxis dataKey="name" tick={{fontSize:11}} tickLine={false}/><YAxis tick={{fontSize:11}} tickLine={false} axisLine={false}/><Tooltip contentStyle={{borderRadius:8,fontSize:12}}/><Bar dataKey="open" fill="var(--amber)" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>
          <div className="rpt-card"><div className="rpt-title">Open Tickets by Priority</div><ResponsiveContainer width="100%" height={200}><PieChart><Pie data={tktPriData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({name,value})=>`${name}: ${value}`}>{tktPriData.map((_,i)=><Cell key={i} fill={["var(--red)","var(--orange)","var(--blue)","#94A3B8"][i]||"#94A3B8"}/>)}</Pie><Tooltip contentStyle={{borderRadius:8,fontSize:12}}/></PieChart></ResponsiveContainer></div>
        </div>
      )}
    </div>
  );
}

export default Reports;
