import { useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Search, Bell, BarChart3 } from "lucide-react";
import { TEAM_MAP } from '../data/constants';

export const PAGE_LABELS={
  dashboard:"Dashboard",leads:"Leads",accounts:"Accounts",contacts:"Contacts",
  pipeline:"Pipeline",activities:"Activities","call-reports":"Call Reports",
  tickets:"Support Tickets",contracts:"Contracts",collections:"Collections",
  targets:"Target vs Achievement",reports:"Reports",masters:"Masters",
  org:"Organisation",team:"Team & Users",
  quotations:"Quotations",calendar:"Calendar",communications:"Communications",
  "bulk-upload":"Bulk Upload"
};

function Header({accounts,contacts,opps,tickets,activities,leads,currentUser}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const currentPage = pathname.replace(/^\//, "") || "dashboard";
  const [searchQ,setSearchQ]=useState("");
  const [results,setResults]=useState([]);
  const openTix=tickets.filter(t=>!["Resolved","Closed"].includes(t.status)).length;
  const user=TEAM_MAP[currentUser];

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

  // Debounced search — waits 250ms after last keystroke
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
        <div className="hdr-page">{PAGE_LABELS[currentPage]||currentPage}</div>
      </div>
      <div className="hdr-search">
        <Search size={14} style={{color:"var(--text3)",flexShrink:0}}/>
        <input placeholder="Search accounts, contacts, deals…" value={searchQ} onChange={e=>doSearch(e.target.value)}/>
        {results.length>0&&(
          <div className="search-dropdown">
            {results.map((r,i)=>(
              <div key={i} className="search-item" onClick={()=>{navigate("/"+r.go);setSearchQ("");setResults([]);}}>
                <span style={{fontSize:10,fontWeight:700,padding:"2px 6px",borderRadius:4,background:"var(--brand-bg)",color:"var(--brand)"}}>{r.type}</span>
                <div><div style={{fontSize:13,fontWeight:500}}>{r.label}</div><div style={{fontSize:11,color:"var(--text3)"}}>{r.sub}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="hdr-actions">
        <button className="icon-btn" onClick={()=>navigate("/tickets")} title="Open tickets">
          <Bell size={18}/>{openTix>0&&<span className="notif-dot"/>}
        </button>
        <button className="icon-btn" onClick={()=>navigate("/reports")} title="Reports"><BarChart3 size={18}/></button>
        <div className="avatar" title={user?.name}>{user?.initials||"?"}</div>
      </div>
    </div>
  );
}

export default Header;
