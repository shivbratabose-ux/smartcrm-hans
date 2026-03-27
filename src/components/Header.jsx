import { useState, useCallback, useRef, useEffect } from "react";
import { Search, Bell, BarChart3, User, Settings, LogOut, Key, ChevronDown } from "lucide-react";
import { TEAM_MAP, ROLE_MAP, INIT_USERS } from '../data/constants';

export const PAGE_LABELS={
  dashboard:"Dashboard",leads:"Leads",accounts:"Accounts",contacts:"Contacts",
  pipeline:"Pipeline",activities:"Activities",callreports:"Call Reports",
  tickets:"Support Tickets",contracts:"Contracts",collections:"Collections",
  targets:"Target vs Achievement",reports:"Reports",masters:"Masters",
  org:"Organisation",team:"Team & Users",profile:"My Profile",
  quotations:"Quotations",calendar:"Calendar",communications:"Communications",
  bulkupload:"Bulk Upload"
};

function Header({page,accounts,contacts,opps,tickets,activities,leads,setPage,currentUser,onLogout,orgUsers}) {
  const [searchQ,setSearchQ]=useState("");
  const [results,setResults]=useState([]);
  const [showMenu,setShowMenu]=useState(false);
  const menuRef=useRef(null);
  const openTix=tickets.filter(t=>!["Resolved","Closed"].includes(t.status)).length;
  const dbUser=(orgUsers||[]).find(u=>u.id===currentUser);
  const user=dbUser||TEAM_MAP[currentUser];
  const roleInfo=ROLE_MAP[dbUser?.role||INIT_USERS.find(u=>u.id===currentUser)?.role];

  // Close menu on outside click
  useEffect(()=>{
    if(!showMenu) return;
    const close=e=>{if(menuRef.current&&!menuRef.current.contains(e.target)) setShowMenu(false);};
    document.addEventListener("mousedown",close);
    return ()=>document.removeEventListener("mousedown",close);
  },[showMenu]);

  const computeResults = useCallback((q) => {
    if(!q.trim()){setResults([]);return;}
    const ql=q.toLowerCase();
    const r=[
      ...accounts.filter(a=>a.name.toLowerCase().includes(ql)).slice(0,3).map(a=>({type:"Account",label:a.name,sub:`${a.type} · ${a.country}`,go:"accounts"})),
      ...contacts.filter(c=>c.name.toLowerCase().includes(ql)).slice(0,3).map(c=>({type:"Contact",label:c.name,sub:c.role,go:"contacts"})),
      ...opps.filter(o=>o.title.toLowerCase().includes(ql)).slice(0,3).map(o=>({type:"Deal",label:o.title,sub:`₹${o.value}Cr · ${o.stage}`,go:"pipeline"})),
      ...tickets.filter(t=>t.title.toLowerCase().includes(ql)).slice(0,2).map(t=>({type:"Ticket",label:t.id,sub:t.title.substring(0,40),go:"tickets"})),
      ...(leads||[]).filter(l=>(l.company+l.contact+(l.leadId||"")).toLowerCase().includes(ql)).slice(0,3).map(l=>({type:"Lead",label:l.leadId||l.company,sub:`${l.company} · ${l.contact}`,go:"leads"})),
    ];
    setResults(r);
  }, [accounts,contacts,opps,tickets,leads]);

  const debounceRef = useState({timer:null})[0];
  const doSearch = q => {
    setSearchQ(q);
    clearTimeout(debounceRef.timer);
    if(!q.trim()){ setResults([]); return; }
    debounceRef.timer = setTimeout(() => computeResults(q), 250);
  };

  return (
    <div className="header">
      <div className="hdr-bread">
        <div className="hdr-page">{PAGE_LABELS[page]||page}</div>
      </div>
      <div className="hdr-search">
        <Search size={14} style={{color:"var(--text3)",flexShrink:0}}/>
        <input placeholder="Search accounts, contacts, deals…" value={searchQ} onChange={e=>doSearch(e.target.value)}/>
        {results.length>0&&(
          <div className="search-dropdown">
            {results.map((r,i)=>(
              <div key={i} className="search-item" onClick={()=>{setPage(r.go);setSearchQ("");setResults([]);}}>
                <span style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:4,background:"var(--brand-bg)",color:"var(--brand)"}}>{r.type}</span>
                <div><div style={{fontSize:13,fontWeight:500}}>{r.label}</div><div style={{fontSize:11,color:"var(--text3)"}}>{r.sub}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="hdr-actions">
        <button className="icon-btn" onClick={()=>setPage("tickets")} title="Open tickets">
          <Bell size={18}/>{openTix>0&&<span className="notif-dot"/>}
        </button>
        <button className="icon-btn" onClick={()=>setPage("reports")} title="Reports"><BarChart3 size={18}/></button>
        <div ref={menuRef} style={{position:"relative"}}>
          <div className="avatar-menu-trigger" onClick={()=>setShowMenu(p=>!p)}
            style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"4px 8px",borderRadius:10,background:showMenu?"var(--brand-bg)":"transparent",transition:"background 0.15s"}}>
            <div className="avatar" title={user?.name}>{user?.initials||"?"}</div>
            <ChevronDown size={12} style={{color:"var(--text3)",transform:showMenu?"rotate(180deg)":"none",transition:"transform 0.2s"}}/>
          </div>
          {showMenu&&(
            <div style={{position:"absolute",right:0,top:"calc(100% + 8px)",width:260,background:"white",borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,0.12),0 2px 8px rgba(0,0,0,0.08)",border:"1px solid var(--border)",zIndex:999,overflow:"hidden",animation:"fadeIn 0.15s ease"}}>
              <div style={{padding:"16px 16px 12px",borderBottom:"1px solid var(--border)"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div className="u-av" style={{width:40,height:40,borderRadius:10,fontSize:14,background:"var(--brand)",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{user?.initials||"?"}</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:"var(--text1)"}}>{user?.name||"User"}</div>
                    <div style={{fontSize:11,color:"var(--text3)"}}>{user?.email||""}</div>
                    {roleInfo&&<span style={{display:"inline-block",marginTop:2,fontSize:10,fontWeight:600,padding:"1px 6px",borderRadius:6,background:roleInfo.color+"18",color:roleInfo.color}}>{roleInfo.name}</span>}
                  </div>
                </div>
              </div>
              <div style={{padding:"6px"}}>
                <button onClick={()=>{setPage("profile");setShowMenu(false);}}
                  style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 12px",border:"none",background:"transparent",cursor:"pointer",borderRadius:8,fontSize:13,color:"var(--text1)",fontFamily:"inherit",textAlign:"left"}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--brand-bg)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <User size={15} style={{color:"var(--brand)"}}/> My Profile
                </button>
                <button onClick={()=>{setPage("team");setShowMenu(false);}}
                  style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 12px",border:"none",background:"transparent",cursor:"pointer",borderRadius:8,fontSize:13,color:"var(--text1)",fontFamily:"inherit",textAlign:"left"}}
                  onMouseEnter={e=>e.currentTarget.style.background="var(--brand-bg)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <Settings size={15} style={{color:"var(--text3)"}}/> Team & Settings
                </button>
              </div>
              <div style={{padding:"6px",borderTop:"1px solid var(--border)"}}>
                <button onClick={()=>{setShowMenu(false);onLogout();}}
                  style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 12px",border:"none",background:"transparent",cursor:"pointer",borderRadius:8,fontSize:13,color:"#DC2626",fontFamily:"inherit",textAlign:"left"}}
                  onMouseEnter={e=>e.currentTarget.style.background="#FEF2F2"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <LogOut size={15}/> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Header;
